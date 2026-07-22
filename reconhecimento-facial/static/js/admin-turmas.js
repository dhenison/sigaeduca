(() => {
  const cfg = window.TURMAS_CONFIG || {};
  const csrfToken = cfg.csrfToken || "";
  const classesUrl = cfg.classesUrl || "/admin/api/siga/classes";
  const turmaHojeTemplate =
    cfg.turmaHojeUrl || "/admin/api/turmas/__CODE__/hoje";

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

  function turmaHojeUrl(code) {
    return turmaHojeTemplate.replace("__CODE__", encodeURIComponent(code));
  }

  function statusBadge(status) {
    if (status === "saida") {
      return '<span class="text-[10px] font-bold uppercase px-2 py-1 rounded-full bg-secondary/10 text-secondary">Saiu</span>';
    }
    if (status === "entrada") {
      return '<span class="text-[10px] font-bold uppercase px-2 py-1 rounded-full bg-primary/10 text-primary">Na escola</span>';
    }
    return '<span class="text-[10px] font-bold uppercase px-2 py-1 rounded-full bg-slate-100 text-text-secondary">Sem batida</span>';
  }

  function renderClasses(filterText = "") {
    const q = filterText.trim().toLowerCase();
    const filtered = classes.filter((c) => {
      if (!q) return true;
      return (
        (c.code || "").toLowerCase().includes(q) ||
        (c.serie || "").toLowerCase().includes(q) ||
        (c.turno || "").toLowerCase().includes(q)
      );
    });
    if (!filtered.length) {
      listEl.innerHTML =
        '<p class="text-sm text-text-secondary text-center py-8">Nenhuma turma encontrada.</p>';
      return;
    }
    listEl.innerHTML = filtered
      .map((c) => {
        const active =
          c.code === selectedCode
            ? "border-primary bg-primary-light/15"
            : "border-border-subtle hover:border-primary/40";
        return `<button type="button" data-code="${c.code}" class="w-full text-left p-3 rounded-xl border ${active} transition-colors">
          <div class="flex items-center justify-between gap-2">
            <p class="font-bold text-sm">${c.code}</p>
            <span class="text-[10px] text-text-secondary">${c.turno || ""}</span>
          </div>
          <p class="text-xs text-text-secondary mt-0.5 truncate">${c.serie || ""}</p>
          <div class="mt-2 flex flex-wrap gap-2 text-[10px] font-semibold">
            <span class="px-2 py-0.5 rounded bg-surface-container">Faces ${c.faces_local || 0}</span>
            <span class="px-2 py-0.5 rounded bg-primary/10 text-primary">E ${c.entradas_hoje || 0}</span>
            <span class="px-2 py-0.5 rounded bg-secondary/10 text-secondary">S ${c.saidas_hoje || 0}</span>
          </div>
        </button>`;
      })
      .join("");
  }

  async function loadClasses() {
    listEl.innerHTML =
      '<p class="text-sm text-text-secondary text-center py-8">Carregando turmas do SIGA…</p>';
    try {
      const res = await fetch(classesUrl, {
        headers: { "X-CSRFToken": csrfToken, Accept: "application/json" },
        credentials: "same-origin",
      });
      const text = await res.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch (_) {
        warnEl.classList.remove("hidden");
        warnEl.textContent =
          "Sessão expirada ou servidor sem a rota de turmas. Faça login de novo em http://127.0.0.1:5001/admin/login e reinicie o Flask (iniciar.bat).";
        listEl.innerHTML =
          '<p class="text-sm text-error text-center py-8">Não foi possível ler as turmas (resposta inválida).</p>';
        return;
      }
      if (!data.success && !(data.classes && data.classes.length)) {
        warnEl.classList.remove("hidden");
        warnEl.textContent =
          data.message ||
          "Configure SUPABASE_SERVICE_ROLE_KEY no .env para listar as turmas do SIGA.";
        listEl.innerHTML =
          '<p class="text-sm text-text-secondary text-center py-8">Turmas indisponíveis.</p>';
        return;
      }
      if (data.warning) {
        warnEl.classList.remove("hidden");
        warnEl.textContent = data.warning;
      } else {
        warnEl.classList.add("hidden");
      }
      classes = data.classes || [];
      if (dayLabel && data.day) {
        const src = data.source === "cache" ? " · cache SIGA" : " · online";
        dayLabel.textContent = `Dia ${data.day} · entrada/saída facial${src}`;
      }
      renderClasses(searchEl?.value || "");
      if (selectedCode) {
        const still = classes.find((c) => c.code === selectedCode);
        if (still) openTurma(selectedCode);
      }
    } catch (err) {
      warnEl.classList.remove("hidden");
      warnEl.textContent =
        "Erro de comunicação com o Flask. Confirme que o servidor está em http://127.0.0.1:5001";
      listEl.innerHTML = `<p class="text-sm text-error text-center py-8">${
        err && err.message ? err.message : "Falha de rede"
      }</p>`;
    }
  }

  async function openTurma(code) {
    selectedCode = code;
    renderClasses(searchEl?.value || "");
    const cls = classes.find((c) => c.code === code);
    titleEl.textContent = code;
    metaEl.textContent = cls
      ? `${cls.serie || ""} · ${cls.turno || ""} · ${cls.year_label || ""}`
      : "";
    statsEl.innerHTML = cls
      ? `<span class="px-2 py-1 rounded-lg bg-primary/10 text-primary">Entradas ${cls.entradas_hoje || 0}</span>
         <span class="px-2 py-1 rounded-lg bg-secondary/10 text-secondary">Saídas ${cls.saidas_hoje || 0}</span>
         <span class="px-2 py-1 rounded-lg bg-surface-container">Faces ${cls.faces_local || 0}</span>`
      : "";
    studentsEl.innerHTML =
      '<p class="text-sm text-text-secondary text-center py-8">Carregando alunos…</p>';
    try {
      const res = await fetch(turmaHojeUrl(code), {
        headers: { "X-CSRFToken": csrfToken },
      });
      const data = await res.json();
      if (!data.success) {
        studentsEl.innerHTML = `<p class="text-sm text-error text-center py-8">${
          data.message || "Falha ao carregar alunos."
        }</p>`;
        return;
      }
      const students = data.students || [];
      if (!students.length) {
        studentsEl.innerHTML =
          '<p class="text-sm text-text-secondary text-center py-8">Nenhum aluno ativo nesta turma no SIGA.</p>';
        return;
      }
      studentsEl.innerHTML = students
        .map((s) => {
          const face = s.has_local_face
            ? '<span class="text-[10px] font-bold text-primary">Face OK</span>'
            : '<span class="text-[10px] font-bold text-error">Sem face</span>';
          return `<div class="flex items-center justify-between gap-3 p-3 rounded-xl border border-border-subtle">
            <div class="min-w-0">
              <p class="font-semibold text-sm truncate">${s.full_name || "—"}</p>
              <p class="text-[11px] text-text-secondary">INEP ${s.codigo_inep || "—"} · ${face}</p>
              <p class="text-[11px] text-text-secondary mt-1">
                Entrada: ${s.entrada_at || "—"} · Saída: ${s.saida_at || "—"}
              </p>
            </div>
            ${statusBadge(s.status_hoje)}
          </div>`;
        })
        .join("");
    } catch (_) {
      studentsEl.innerHTML =
        '<p class="text-sm text-error text-center py-8">Erro ao carregar alunos.</p>';
    }
  }

  listEl.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-code]");
    if (!btn) return;
    openTurma(btn.getAttribute("data-code"));
  });

  searchEl?.addEventListener("input", (e) => {
    renderClasses(e.target.value);
  });

  document.getElementById("refreshTurmas")?.addEventListener("click", () => {
    loadClasses();
  });

  loadClasses();
  setInterval(loadClasses, 20000);
})();
