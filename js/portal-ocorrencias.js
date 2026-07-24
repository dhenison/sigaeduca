/**
 * Portal do Aluno — Ocorrências (espelho de siga_occurrences do SIGA EDUCA)
 */
(function (global) {
  "use strict";

  var OCC_KEY = "siga_occurrences";
  var MESES = ["JAN", "FEV", "MAR", "ABR", "MAI", "JUN", "JUL", "AGO", "SET", "OUT", "NOV", "DEZ"];

  function escapeHtml(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function loadAll() {
    try {
      var raw = JSON.parse(localStorage.getItem(OCC_KEY) || "[]");
      return Array.isArray(raw) ? raw : [];
    } catch (e) {
      return [];
    }
  }

  function normalize(o) {
    return {
      id: o.id || "",
      tipo: o.type || o.tipo || "Ocorrência",
      aluno: o.student || o.aluno || "",
      alunoId: o.alunoId || o.student_id || "",
      turma: o.turma || "",
      data: o.date || o.data || "",
      hora: o.hora || "",
      status: o.status || "Em Análise",
      descricao: o.desc || o.descricao || "",
      usuario: o.prof || o.usuario || "",
      origem: o.origem || "manual",
    };
  }

  function isGrave(tipo) {
    var t = String(tipo || "").toLowerCase();
    return (
      t.indexOf("grave") >= 0 ||
      t.indexOf("indisciplina") >= 0 ||
      t.indexOf("agress") >= 0 ||
      t.indexOf("bullying") >= 0 ||
      t.indexOf("nível 3") >= 0 ||
      t.indexOf("nivel 3") >= 0
    );
  }

  function forStudent(student, session) {
    var sid = student && student.id != null ? String(student.id) : "";
    var nome = String((student && student.nome) || (session && session.nome) || "")
      .trim()
      .toLowerCase();
    return loadAll()
      .map(normalize)
      .filter(function (o) {
        if (sid && String(o.alunoId) === sid) return true;
        if (nome && String(o.aluno || "").trim().toLowerCase() === nome) return true;
        return false;
      })
      .sort(function (a, b) {
        return String(b.data).localeCompare(String(a.data));
      });
  }

  function formatDayParts(iso) {
    var p = String(iso || "").split("-");
    if (p.length < 3) return { mes: "—", dia: "—" };
    var m = Number(p[1]) - 1;
    return { mes: MESES[m] || p[1], dia: String(Number(p[2])) };
  }

  function statusClass(status) {
    var s = String(status || "").toLowerCase();
    if (s.indexOf("resolv") >= 0 || s.indexOf("conclu") >= 0) {
      return "bg-emerald-100 text-emerald-800";
    }
    if (s.indexOf("pend") >= 0 || s.indexOf("análise") >= 0 || s.indexOf("analise") >= 0) {
      return "bg-amber-100 text-amber-900";
    }
    return "bg-slate-100 text-slate-700";
  }

  function render(ctx) {
    ctx = ctx || {};
    var student = ctx.student || {};
    var session = ctx.session || {};
    var list = forStudent(student, session);

    var graves = list.filter(function (o) { return isGrave(o.tipo); }).length;
    var avisos = list.length - graves;
    var conduta = list.length
      ? Math.max(0, Math.min(100, Math.round(100 - (graves * 12 + avisos * 4))))
      : 100;

    var elNome = document.getElementById("occ-aluno-nome");
    if (elNome) elNome.textContent = student.nome || session.nome || "Aluno";

    var avatarImg = document.getElementById("occ-aluno-avatar");
    var avatarFb = document.getElementById("occ-aluno-avatar-fb");
    if (avatarImg && student.avatar) {
      avatarImg.src = student.avatar;
      avatarImg.classList.remove("hidden");
      if (avatarFb) avatarFb.classList.add("hidden");
    } else if (avatarFb) {
      var parts = String(student.nome || "A").trim().split(/\s+/);
      avatarFb.textContent =
        parts.length >= 2
          ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
          : String(parts[0] || "A").slice(0, 2).toUpperCase();
      avatarFb.classList.remove("hidden");
      if (avatarImg) avatarImg.classList.add("hidden");
    }

    setText("occ-kpi-graves", String(graves).padStart(2, "0"));
    setText("occ-kpi-avisos", String(avisos).padStart(2, "0"));
    setText("occ-kpi-conduta", conduta + "%");

    var host = document.getElementById("occ-lista");
    if (!host) return;

    if (!list.length) {
      host.innerHTML =
        '<div class="bg-surface-container-lowest rounded-xl p-6 border border-dashed border-outline-variant text-center">' +
        '<span class="material-symbols-outlined text-primary text-4xl">verified</span>' +
        '<p class="mt-2 font-semibold text-on-surface">Nenhuma ocorrência registrada</p>' +
        '<p class="text-sm text-on-surface-variant mt-1">Os registros feitos no módulo Ocorrências do SIGA EDUCA aparecerão aqui.</p>' +
        "</div>";
      return;
    }

    host.innerHTML = list
      .map(function (o) {
        var parts = formatDayParts(o.data);
        var grave = isGrave(o.tipo);
        var border = grave ? "border-error" : "border-amber-400";
        return (
          '<article class="bg-surface-container-lowest rounded-xl p-4 shadow-sm border-l-4 ' +
          border +
          ' flex gap-4">' +
          '<div class="flex flex-col items-center min-w-[48px]">' +
          '<span class="text-[11px] font-semibold text-on-surface-variant">' +
          escapeHtml(parts.mes) +
          "</span>" +
          '<span class="text-lg font-bold text-on-surface">' +
          escapeHtml(parts.dia) +
          "</span></div>" +
          '<div class="flex-1 min-w-0 space-y-1">' +
          '<div class="flex justify-between items-start gap-2">' +
          '<h4 class="font-semibold text-on-surface">' +
          escapeHtml(o.tipo) +
          "</h4>" +
          '<span class="shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ' +
          statusClass(o.status) +
          '">' +
          escapeHtml(o.status) +
          "</span></div>" +
          '<p class="text-sm text-on-surface-variant leading-snug">' +
          escapeHtml(o.descricao || "Sem descrição.") +
          "</p>" +
          '<div class="flex flex-wrap items-center gap-3 pt-1 text-[11px] text-on-surface-variant">' +
          (o.hora && o.hora !== "—"
            ? '<span class="inline-flex items-center gap-1"><span class="material-symbols-outlined text-[14px]">schedule</span>' +
              escapeHtml(o.hora) +
              "</span>"
            : "") +
          (o.turma
            ? '<span class="inline-flex items-center gap-1"><span class="material-symbols-outlined text-[14px]">school</span>Turma ' +
              escapeHtml(o.turma) +
              "</span>"
            : "") +
          (o.usuario
            ? '<span class="inline-flex items-center gap-1"><span class="material-symbols-outlined text-[14px]">person</span>' +
              escapeHtml(o.usuario) +
              "</span>"
            : "") +
          "</div></div></article>"
        );
      })
      .join("");
  }

  function setText(id, text) {
    var el = document.getElementById(id);
    if (el) el.textContent = text;
  }

  global.SigaPortalOcorrencias = { boot: render, forStudent: forStudent };
})(typeof window !== "undefined" ? window : this);
