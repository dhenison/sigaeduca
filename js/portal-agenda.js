/**
 * Portal do Aluno — Agenda (leitura de siga_agenda_events).
 */
(function (global) {
  "use strict";

  var STORAGE_KEY = "siga_agenda_events";

  function escapeHtml(str) {
    return String(str == null ? "" : str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function getEvents() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]") || [];
    } catch (e) {
      return [];
    }
  }

  function isGlobalEvent(evt) {
    if (!evt) return false;
    if (evt.scope === "geral") return true;
    if (evt.scope !== "turmas") return true;
    return !evt.turmas || !evt.turmas.length;
  }

  function matchesTurma(evt, turma) {
    if (isGlobalEvent(evt)) return true;
    var selected = String(turma || "").trim();
    if (!selected) return false;
    var turmas = (evt.turmas || []).map(function (t) { return String(t).trim(); });
    return turmas.indexOf(selected) !== -1;
  }

  function formatDateBr(iso) {
    if (!iso) return "";
    var p = String(iso).slice(0, 10).split("-");
    if (p.length !== 3) return iso;
    return p[2] + "/" + p[1] + "/" + p[0];
  }

  function boot(ctx) {
    var student = (ctx && ctx.student) || {};
    var turma = student.turma || "";
    var host = document.getElementById("portal-agenda-lista");
    var empty = document.getElementById("portal-agenda-empty");
    if (!host) return;

    var list = getEvents()
      .filter(function (e) { return matchesTurma(e, turma); })
      .sort(function (a, b) {
        return String(a.date || "").localeCompare(String(b.date || ""));
      });

    if (!list.length) {
      host.innerHTML = "";
      if (empty) empty.classList.remove("hidden");
      return;
    }
    if (empty) empty.classList.add("hidden");
    host.innerHTML = list.map(function (e) {
      var tipo = e.type || e.tipo || "Evento";
      return (
        '<article class="portal-card p-4 space-y-2">' +
        '<div class="flex items-center justify-between gap-2">' +
        '<span class="portal-chip bg-blue-50 text-blue-800">' + escapeHtml(tipo) + "</span>" +
        '<span class="text-xs text-slate-500">' + escapeHtml(formatDateBr(e.date)) + "</span></div>" +
        '<p class="font-bold text-slate-900">' + escapeHtml(e.title || e.description || "Atividade") + "</p>" +
        (e.description && e.title
          ? '<p class="text-sm text-slate-500">' + escapeHtml(e.description) + "</p>"
          : "") +
        "</article>"
      );
    }).join("");
  }

  global.SigaPortalAgenda = { boot: boot };
})(typeof window !== "undefined" ? window : this);
