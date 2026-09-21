/**
 * Portal do Aluno — Calendário (somente leitura de siga_calendar_days).
 */
(function (global) {
  "use strict";

  var MESES = [
    "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
    "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
  ];
  var DOW = ["D", "S", "T", "Q", "Q", "S", "S"];

  function escapeHtml(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function pad(n) {
    return String(n).padStart(2, "0");
  }

  function toIso(y, m, d) {
    return y + "-" + pad(m + 1) + "-" + pad(d);
  }

  function getCalendarDays() {
    if (typeof global.getCalendarDays === "function") {
      try {
        return global.getCalendarDays() || {};
      } catch (e) { /* fall through */ }
    }
    try {
      return JSON.parse(localStorage.getItem("siga_calendar_days") || "{}") || {};
    } catch (e2) {
      return {};
    }
  }

  function classify(info) {
    if (!info || !info.type) return "vazio";
    var t = String(info.type);
    if (t === "letivo" || t.indexOf("inicio_") === 0) return "letivo";
    if (t === "evento" || t === "sabado") return "evento";
    if (t === "domingo" || t.indexOf("nao_letivo") >= 0 || t.indexOf("feriado") >= 0) return "off";
    return "evento";
  }

  function renderMonth(year, month, selectedIso) {
    var host = document.getElementById("portal-cal-grid");
    var title = document.getElementById("portal-cal-title");
    if (title) title.textContent = MESES[month] + " " + year;
    if (!host) return;

    var days = getCalendarDays();
    var first = new Date(year, month, 1);
    var startDow = first.getDay();
    var lastDate = new Date(year, month + 1, 0).getDate();
    var today = new Date();
    var todayIso = toIso(today.getFullYear(), today.getMonth(), today.getDate());

    var html = DOW.map(function (d) {
      return '<div class="portal-cal-dow">' + d + "</div>";
    }).join("");

    var prevLast = new Date(year, month, 0).getDate();
    var i;
    for (i = 0; i < startDow; i++) {
      var pd = prevLast - startDow + 1 + i;
      html += '<button type="button" class="portal-cal-day is-muted" disabled>' + pd + "</button>";
    }
    for (i = 1; i <= lastDate; i++) {
      var iso = toIso(year, month, i);
      var info = days[iso];
      var kind = classify(info);
      var cls = "portal-cal-day";
      if (kind === "letivo") cls += " is-letivo";
      else if (kind === "evento") cls += " is-evento";
      else if (kind === "off") cls += " is-off";
      if (iso === todayIso) cls += " is-today";
      if (iso === selectedIso) cls += " is-selected";
      html +=
        '<button type="button" class="' +
        cls +
        '" data-iso="' +
        iso +
        '">' +
        i +
        "</button>";
    }
    host.innerHTML = html;
  }

  function showDay(iso) {
    var box = document.getElementById("portal-cal-detalhe");
    if (!box) return;
    if (!iso) {
      box.innerHTML = '<p class="text-sm text-slate-500">Toque um dia para ver o registro do calendário letivo.</p>';
      return;
    }
    var days = getCalendarDays();
    var info = days[iso] || {};
    var label = info.label || (info.type ? String(info.type) : "Sem marcação neste dia.");
    var parts = String(iso).split("-");
    var br = parts.length === 3 ? parts[2] + "/" + parts[1] + "/" + parts[0] : iso;
    box.innerHTML =
      '<p class="text-xs font-bold uppercase tracking-wide text-slate-500">' +
      escapeHtml(br) +
      "</p><p class=\"mt-1 font-semibold text-slate-900\">" +
      escapeHtml(label) +
      "</p>";
  }

  function boot(ctx) {
    var now = new Date();
    var state = { year: now.getFullYear(), month: now.getMonth(), selected: null };
    var nome = document.getElementById("portal-cal-aluno");
    if (nome && ctx && ctx.student) nome.textContent = ctx.student.nome || "";

    function paint() {
      renderMonth(state.year, state.month, state.selected);
      showDay(state.selected);
      var grid = document.getElementById("portal-cal-grid");
      if (grid) {
        grid.querySelectorAll("[data-iso]").forEach(function (btn) {
          btn.addEventListener("click", function () {
            state.selected = btn.getAttribute("data-iso");
            paint();
          });
        });
      }
    }

    var prev = document.getElementById("portal-cal-prev");
    var next = document.getElementById("portal-cal-next");
    if (prev) {
      prev.addEventListener("click", function () {
        state.month -= 1;
        if (state.month < 0) {
          state.month = 11;
          state.year -= 1;
        }
        paint();
      });
    }
    if (next) {
      next.addEventListener("click", function () {
        state.month += 1;
        if (state.month > 11) {
          state.month = 0;
          state.year += 1;
        }
        paint();
      });
    }

    var hydrate =
      global.SigaSchoolData && typeof global.SigaSchoolData.hydrateCalendarDays === "function"
        ? global.SigaSchoolData.hydrateCalendarDays()
        : Promise.resolve({ ok: true, skipped: true });

    return Promise.resolve(hydrate)
      .catch(function () { return { ok: false }; })
      .then(function () {
        paint();
      });
  }

  global.SigaPortalCalendario = { boot: boot };
})(typeof window !== "undefined" ? window : this);
