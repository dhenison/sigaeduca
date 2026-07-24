(() => {
  const cfg = window.TURMAS_CONFIG || {};
  const csrfToken = cfg.csrfToken || "";
  const classesUrl = cfg.classesUrl || "/admin/api/siga/classes";
  const turmaHojeTemplate = cfg.turmaHojeUrl || "/admin/api/turmas/__CODE__/hoje";
  const releaseTemplate = cfg.releaseUrl || "/admin/api/turmas/__CODE__/liberar-saida";

  let classes = [];
  let selectedCode = "";

  const listEl = document.getElementById("turmasList");
  const studentsEl = document.getElementById("turmaStudents");
  const warnEl = document.getElementById("turmasConfigWarn");
  const dayLabel = document.getElementById("turmasDayLabel");
  const titleEl = document.getElementById("turmaDetailTitle");
  const metaEl = document.getElementById("turmaDetailMeta");
  const statsEl = document.getElementById("turmaDetailStats");
  const searchEl = document.getElementById("turmasSearch");
  const scheduleEl = document.getElementById("turmaSchedule");
  const releaseButton = document.getElementById("releaseClass");
  const releaseModal = document.getElementById("releaseModal");
  const releaseReason = document.getElementById("releaseReason");
  const confirmRelease = document.getElementById("confirmRelease");
  const toastEl = document.getElementById("toast");

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function apiUrl(template, code) {
    return template.replace("__CODE__", encodeURIComponent(code));
  }

  function showToast(message, isError = false) {
    toastEl.textContent = message;
    toastEl.classList.toggle("bg-error", isError);
    toastEl.classList.toggle("bg-on-surface", !isError);
    toastEl.classList.remove("translate-y-20", "opacity-0");
    window.setTimeout(() => toastEl.classList.add("translate-y-20", "opacity-0"), 3500);
  }

  function statusBadge(status) {
    if (status === "saida") return '<span class="text-[10px] font-bold uppercase px-2 py-1 rounded-full bg-secondary/10 text-secondary">Saiu</span>';
    if (status === "entrada") return '<span class="text-[10px] font-bold uppercase px-2 py-1 rounded-full bg-primary/10 text-primary">Na escola</span>';
    return '<span class="text-[10px] font-bold uppercase px-2 py-1 rounded-full bg-slate-100 text-text-secondary">Não entrou</span>';
  }

  function timingBadge(status) {
    const badges = {
      atrasado: '<span class="text-[10px] font-bold text-error">Entrada com atraso</span>',
      no_horario: '<span class="text-[10px] font-bold text-primary">Entrada no horário</span>',
      saida_antecipada: '<span class="text-[10px] font-bold text-amber-700">Saída antecipada</span>',
      saida_regular: '<span class="text-[10px] font-bold text-secondary">Saída regular</span>',
    };
    return badges[status] || "";
  }

  function studentCard(student) {
    const face = student.has_local_face
      ? '<span class="text-[10px] font-bold text-primary">Face OK</span>'
      : '<span class="text-[10px] font-bold text-error">Sem face</span>';
    return `<div class="flex items-center justify-between gap-3 p-3 rounded-xl border border-border-subtle">
      <div class="min-w-0">
        <p class="font-semibold text-sm truncate">${escapeHtml(student.full_name || "—")}</p>
        <p class="text-[11px] text-text-secondary">INEP ${escapeHtml(student.codigo_inep || "—")} · ${face}</p>
        <p class="text-[11px] text-text-secondary mt-1">Entrada: ${escapeHtml(student.entrada_at || "—")} · Saída: ${escapeHtml(student.saida_at || "—")}</p>
        <div class="mt-1">${timingBadge(student.timing_status)}</div>
      </div>
      ${statusBadge(student.status_hoje)}
    </div>`;
  }

  function studentGroup(title, count, colorClass, students, emptyText) {
    return `<section>
      <div class="mb-2 flex items-center justify-between">
        <h4 class="text-xs font-bold uppercase tracking-wide ${colorClass}">${escapeHtml(title)}</h4>
        <span class="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold">${count}</span>
      </div>
      <div class="space-y-2">${students.length ? students.map(studentCard).join("") : `<p class="rounded-xl bg-slate-50 px-4 py-5 text-center text-xs text-text-secondary">${escapeHtml(emptyText)}</p>`}</div>
    </section>`;
  }

  function renderClasses(filterText = "") {
    const q = filterText.trim().toLowerCase();
    const filtered = classes.filter((item) => !q || [item.code, item.serie, item.turno].some((value) => (value || "").toLowerCase().includes(q)));
    if (!filtered.length) {
      listEl.innerHTML = '<p class="text-sm text-text-secondary text-center py-8">Nenhuma turma encontrada.</p>';
      return;
    }
    listEl.innerHTML = filtered.map((item) => {
      const active = item.code === selectedCode ? "border-primary bg-primary-light/15" : "border-border-subtle hover:border-primary/40";
      const schedule = item.schedule
        ? `<span class="px-2 py-0.5 rounded bg-blue-50 text-blue-700">${escapeHtml(item.schedule.entry_time)}–${escapeHtml(item.schedule.exit_time)}</span>`
        : '<span class="px-2 py-0.5 rounded bg-amber-50 text-amber-700">Sem horário</span>';
      return `<button type="button" data-code="${escapeHtml(item.code)}" class="w-full text-left p-3 rounded-xl border ${active} transition-colors">
        <div class="flex items-center justify-between gap-2"><p class="font-bold text-sm">${escapeHtml(item.code)}</p><span class="text-[10px] text-text-secondary">${escapeHtml(item.turno || "")}</span></div>
        <p class="text-xs text-text-secondary mt-0.5 truncate">${escapeHtml(item.serie || "")}</p>
        <div class="mt-2 flex flex-wrap gap-2 text-[10px] font-semibold">
          ${schedule}<span class="px-2 py-0.5 rounded bg-primary/10 text-primary">Entraram ${item.entradas_hoje || 0}</span><span class="px-2 py-0.5 rounded bg-surface-container">Presentes ${item.presentes_agora || 0}</span>
        </div>
      </button>`;
    }).join("");
  }

  async function loadClasses() {
    listEl.innerHTML = '<p class="text-sm text-text-secondary text-center py-8">Carregando turmas do SIGA…</p>';
    try {
      const response = await fetch(classesUrl, { headers: { "X-CSRFToken": csrfToken, Accept: "application/json" }, credentials: "same-origin" });
      const data = await response.json();
      if (!data.success && !(data.classes && data.classes.length)) throw new Error(data.message || "Turmas indisponíveis.");
      warnEl.classList.toggle("hidden", !data.warning);
      warnEl.textContent = data.warning || "";
      classes = data.classes || [];
      if (dayLabel && data.day) dayLabel.textContent = `Dia ${data.day} · entrada/saída facial${data.source === "cache" ? " · cache SIGA" : " · online"}`;
      renderClasses(searchEl?.value || "");
      if (selectedCode && classes.some((item) => item.code === selectedCode)) await openTurma(selectedCode, false);
    } catch (error) {
      warnEl.classList.remove("hidden");
      warnEl.textContent = error.message || "Erro de comunicação com o servidor.";
      listEl.innerHTML = '<p class="text-sm text-error text-center py-8">Não foi possível carregar as turmas.</p>';
    }
  }

  async function openTurma(code, rerenderList = true) {
    selectedCode = code;
    if (rerenderList) renderClasses(searchEl?.value || "");
    const cls = classes.find((item) => item.code === code);
    titleEl.textContent = code;
    metaEl.textContent = cls ? `${cls.serie || ""} · ${cls.turno || ""} · ${cls.year_label || ""}` : "";
    releaseButton.classList.remove("hidden");
    releaseButton.disabled = true;
    studentsEl.innerHTML = '<p class="text-sm text-text-secondary text-center py-8">Carregando alunos…</p>';
    try {
      const response = await fetch(apiUrl(turmaHojeTemplate, code), { headers: { "X-CSRFToken": csrfToken, Accept: "application/json" } });
      const data = await response.json();
      if (!data.success) throw new Error(data.message || "Falha ao carregar alunos.");
      const students = data.students || [];
      const entered = students.filter((item) => item.entrada_at);
      const notEntered = students.filter((item) => !item.entrada_at);
      const summary = data.summary || {};
      statsEl.innerHTML = `<span class="px-2 py-1 rounded-lg bg-primary/10 text-primary">Entraram ${summary.entered || 0}</span><span class="px-2 py-1 rounded-lg bg-slate-100 text-text-secondary">Não entraram ${summary.not_entered || 0}</span><span class="px-2 py-1 rounded-lg bg-amber-50 text-amber-700">Atrasos ${summary.late || 0}</span>`;
      releaseButton.disabled = !(summary.present > 0);
      releaseButton.classList.toggle("opacity-50", releaseButton.disabled);
      releaseButton.title = releaseButton.disabled ? "Não há alunos presentes para liberar" : `Registrar saída para ${summary.present} aluno(s)`;
      if (data.schedule) {
        scheduleEl.classList.remove("hidden");
        const scheduleOrigin = data.schedule.source === "exception"
          ? `horário diferente de ${escapeHtml((data.schedule.day_date || "").split("-").reverse().join("/"))}`
          : `turno geral ${escapeHtml(data.schedule.shift_label || "")}`;
        scheduleEl.innerHTML = `<strong>Horário aplicado (${scheduleOrigin}):</strong> entrada ${escapeHtml(data.schedule.entry_time)} · atraso após ${escapeHtml(data.schedule.late_after)} · saída ${escapeHtml(data.schedule.exit_time)}`;
      } else {
        scheduleEl.classList.remove("hidden");
        scheduleEl.innerHTML = '<strong>Turno sem horário geral configurado.</strong> Acesse a aba Horários para definir entrada, limite de atraso e saída.';
      }
      if (data.release) scheduleEl.innerHTML += ` <span class="ml-2 font-bold text-amber-700">Turma liberada às ${escapeHtml(data.release.released_at)} (${data.release.released_count} saídas).</span>`;
      studentsEl.innerHTML = students.length
        ? studentGroup("Realizaram entrada", entered.length, "text-primary", entered, "Nenhum aluno entrou hoje.") + studentGroup("Ainda não realizaram entrada", notEntered.length, "text-text-secondary", notEntered, "Todos os alunos já realizaram entrada.")
        : '<p class="text-sm text-text-secondary text-center py-8">Nenhum aluno ativo nesta turma no SIGA.</p>';
    } catch (error) {
      studentsEl.innerHTML = `<p class="text-sm text-error text-center py-8">${escapeHtml(error.message || "Erro ao carregar alunos.")}</p>`;
    }
  }

  listEl.addEventListener("click", (event) => {
    const button = event.target.closest("[data-code]");
    if (button) openTurma(button.getAttribute("data-code"));
  });
  searchEl?.addEventListener("input", (event) => renderClasses(event.target.value));
  document.getElementById("refreshTurmas")?.addEventListener("click", loadClasses);
  releaseButton?.addEventListener("click", () => {
    releaseModal.classList.remove("hidden");
    releaseModal.classList.add("flex");
    releaseReason.focus();
  });
  document.getElementById("cancelRelease")?.addEventListener("click", () => {
    releaseModal.classList.add("hidden");
    releaseModal.classList.remove("flex");
  });
  confirmRelease?.addEventListener("click", async () => {
    if (!selectedCode) return;
    confirmRelease.disabled = true;
    confirmRelease.textContent = "Registrando…";
    try {
      const response = await fetch(apiUrl(releaseTemplate, selectedCode), {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json", "X-CSRFToken": csrfToken, Accept: "application/json" },
        body: JSON.stringify({ reason: releaseReason.value.trim() }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.message || "Não foi possível liberar a turma.");
      releaseModal.classList.add("hidden");
      releaseModal.classList.remove("flex");
      showToast(data.message);
      await loadClasses();
    } catch (error) {
      showToast(error.message || "Erro ao liberar a turma.", true);
    } finally {
      confirmRelease.disabled = false;
      confirmRelease.textContent = "Confirmar saída";
    }
  });

  loadClasses();
  window.setInterval(loadClasses, 20000);
})();
