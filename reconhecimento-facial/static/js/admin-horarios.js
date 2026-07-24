(() => {
  const cfg = window.HORARIOS_CONFIG || {};
  const csrfToken = cfg.csrfToken || "";
  const shiftDefaults = {
    manha: { label: "Manhã", icon: "wb_sunny", entry_time: "07:00", late_after: "07:15", exit_time: "12:00" },
    tarde: { label: "Tarde", icon: "light_mode", entry_time: "13:00", late_after: "13:15", exit_time: "18:00" },
    noite: { label: "Noite", icon: "dark_mode", entry_time: "19:00", late_after: "19:15", exit_time: "22:30" },
  };
  let shifts = new Map();
  let exceptions = [];
  let classes = [];

  const shiftContainer = document.getElementById("shiftSchedules");
  const exceptionForm = document.getElementById("exceptionForm");
  const exceptionList = document.getElementById("exceptionList");
  const exceptionClass = document.getElementById("exceptionClass");
  const warning = document.getElementById("scheduleWarning");
  const toast = document.getElementById("scheduleToast");

  const escapeHtml = (value) => String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
  const headers = (json = false) => ({ Accept: "application/json", "X-CSRFToken": csrfToken, ...(json ? { "Content-Type": "application/json" } : {}) });

  function showToast(message, error = false) {
    toast.textContent = message;
    toast.classList.toggle("bg-error", error);
    toast.classList.toggle("bg-on-surface", !error);
    toast.classList.remove("translate-y-20", "opacity-0");
    window.setTimeout(() => toast.classList.add("translate-y-20", "opacity-0"), 3500);
  }

  function normalizeShift(value) {
    const text = String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    if (text.includes("manha") || text.includes("matutin")) return "manha";
    if (text.includes("tarde") || text.includes("vespertin")) return "tarde";
    if (text.includes("noite") || text.includes("noturn")) return "noite";
    return "";
  }

  function renderShifts() {
    shiftContainer.innerHTML = Object.entries(shiftDefaults).map(([code, defaults]) => {
      const saved = shifts.get(code);
      const values = saved && saved.entry_time ? saved : defaults;
      return `<form data-shift-form="${code}" class="rounded-2xl bg-white border ${saved?.entry_time ? "border-primary/40" : "border-border-subtle"} p-5 shadow-sm">
        <div class="flex items-center justify-between gap-3 mb-4"><div class="flex items-center gap-3"><span class="material-symbols-outlined text-primary text-3xl">${defaults.icon}</span><div><h4 class="font-bold text-lg">${defaults.label}</h4><p class="text-[11px] text-text-secondary">Todas as turmas da ${defaults.label.toLowerCase()}</p></div></div><span class="rounded-full px-2 py-1 text-[10px] font-bold ${saved?.entry_time ? "bg-primary/10 text-primary" : "bg-amber-50 text-amber-700"}">${saved?.entry_time ? "Configurado" : "Pendente"}</span></div>
        <div class="grid grid-cols-1 gap-2">
          <label class="flex items-center justify-between gap-3 text-xs font-semibold">Entrada<input name="entry_time" type="time" required value="${escapeHtml(values.entry_time)}" class="w-36 rounded-lg border-border-subtle text-sm"/></label>
          <label class="flex items-center justify-between gap-3 text-xs font-semibold">Limite sem atraso<input name="late_after" type="time" required value="${escapeHtml(values.late_after)}" class="w-36 rounded-lg border-border-subtle text-sm"/></label>
          <label class="flex items-center justify-between gap-3 text-xs font-semibold">Saída<input name="exit_time" type="time" required value="${escapeHtml(values.exit_time)}" class="w-36 rounded-lg border-border-subtle text-sm"/></label>
        </div>
        <button type="submit" class="mt-4 w-full rounded-xl bg-primary py-2.5 text-sm text-white font-bold"><span class="material-symbols-outlined text-base mr-1">save</span>Salvar ${defaults.label}</button>
      </form>`;
    }).join("");
  }

  function renderClasses() {
    const sorted = [...classes].sort((a, b) => String(a.code).localeCompare(String(b.code)));
    exceptionClass.innerHTML = '<option value="">Selecione a turma…</option>' + sorted.map((item) => `<option value="${escapeHtml(item.code)}" data-shift="${escapeHtml(item.shift_code || normalizeShift(item.turno))}">${escapeHtml(item.code)} · ${escapeHtml(item.serie || "")} · ${escapeHtml(item.turno || "")}</option>`).join("");
  }

  function renderExceptions() {
    if (!exceptions.length) {
      exceptionList.innerHTML = '<p class="rounded-xl bg-slate-50 px-4 py-5 text-center text-sm text-text-secondary">Nenhum horário diferente cadastrado. Todas as turmas seguem o turno geral.</p>';
      return;
    }
    exceptionList.innerHTML = exceptions.map((item) => {
      const formattedDate = item.day_date ? item.day_date.split("-").reverse().join("/") : "";
      return `<div class="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border-subtle p-4"><div><p class="font-bold text-sm">${escapeHtml(item.class_code)} <span class="ml-2 text-amber-700">${escapeHtml(formattedDate)}</span></p><p class="text-xs text-text-secondary mt-1">Entrada ${escapeHtml(item.entry_time)} · atraso após ${escapeHtml(item.late_after)} · saída ${escapeHtml(item.exit_time)}</p></div><button type="button" data-delete-exception="${item.id}" class="rounded-lg border border-error/20 px-3 py-2 text-xs font-bold text-error hover:bg-error-container/30"><span class="material-symbols-outlined text-base">delete</span> Remover</button></div>`;
    }).join("");
  }

  async function load() {
    const [scheduleResult, classResult] = await Promise.allSettled([
      fetch(cfg.schedulesUrl, { headers: headers() }).then((response) => response.json()),
      fetch(cfg.classesUrl, { headers: headers() }).then((response) => response.json()),
    ]);
    if (scheduleResult.status === "fulfilled" && scheduleResult.value.success) {
      shifts = new Map((scheduleResult.value.shifts || []).map((item) => [item.shift_code, item]));
      exceptions = scheduleResult.value.exceptions || [];
    } else {
      warning.classList.remove("hidden");
      warning.textContent = "Não foi possível carregar os horários salvos.";
    }
    if (classResult.status === "fulfilled") {
      classes = classResult.value.classes || [];
      if (classResult.value.warning) {
        warning.classList.remove("hidden");
        warning.textContent = classResult.value.warning;
      }
    } else {
      warning.classList.remove("hidden");
      warning.textContent = "Não foi possível carregar as turmas do SIGA.";
    }
    renderShifts();
    renderClasses();
    renderExceptions();
  }

  shiftContainer.addEventListener("submit", async (event) => {
    const form = event.target.closest("[data-shift-form]");
    if (!form) return;
    event.preventDefault();
    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    const data = new FormData(form);
    try {
      const response = await fetch(cfg.shiftSaveUrl, { method: "POST", credentials: "same-origin", headers: headers(true), body: JSON.stringify({ shift_code: form.dataset.shiftForm, entry_time: data.get("entry_time"), late_after: data.get("late_after"), exit_time: data.get("exit_time") }) });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.message || "Não foi possível salvar o turno.");
      shifts.set(result.schedule.shift_code, result.schedule);
      renderShifts();
      showToast(result.message);
    } catch (error) {
      showToast(error.message || "Erro ao salvar o turno.", true);
      button.disabled = false;
    }
  });

  exceptionClass.addEventListener("change", () => {
    const option = exceptionClass.options[exceptionClass.selectedIndex];
    const shift = shifts.get(option?.dataset?.shift || "");
    if (!shift?.entry_time) return;
    document.getElementById("exceptionEntry").value = shift.entry_time;
    document.getElementById("exceptionLate").value = shift.late_after;
    document.getElementById("exceptionExit").value = shift.exit_time;
  });

  exceptionForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = document.getElementById("saveException");
    button.disabled = true;
    try {
      const response = await fetch(cfg.exceptionSaveUrl, { method: "POST", credentials: "same-origin", headers: headers(true), body: JSON.stringify({ class_code: exceptionClass.value, day_date: document.getElementById("exceptionDate").value, entry_time: document.getElementById("exceptionEntry").value, late_after: document.getElementById("exceptionLate").value, exit_time: document.getElementById("exceptionExit").value }) });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.message || "Não foi possível salvar o horário diferente.");
      const index = exceptions.findIndex((item) => item.id === result.schedule.id);
      if (index >= 0) exceptions[index] = result.schedule; else exceptions.unshift(result.schedule);
      renderExceptions();
      showToast(result.message);
    } catch (error) {
      showToast(error.message || "Erro ao salvar o horário diferente.", true);
    } finally { button.disabled = false; }
  });

  exceptionList.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-delete-exception]");
    if (!button || !window.confirm("Remover este horário diferente e voltar a usar o turno geral?")) return;
    button.disabled = true;
    try {
      const url = cfg.exceptionDeleteUrl.replace(/0$/, button.dataset.deleteException);
      const response = await fetch(url, { method: "DELETE", credentials: "same-origin", headers: headers() });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.message || "Não foi possível remover.");
      exceptions = exceptions.filter((item) => String(item.id) !== String(button.dataset.deleteException));
      renderExceptions();
      showToast(result.message);
    } catch (error) {
      showToast(error.message || "Erro ao remover o horário diferente.", true);
      button.disabled = false;
    }
  });

  document.getElementById("exceptionDate").value = new Date().toISOString().slice(0, 10);
  renderShifts();
  load();
})();
