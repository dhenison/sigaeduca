/**
 * Portal do Aluno / Pais — Frequência Escolar (3º e 4º bimestres)
 * Entrada/saída via reconhecimento facial consolidado no SIGA EDUCA.
 */
(function (global) {
  "use strict";

  var CIRC = 2 * Math.PI * 80; // r=80 → ~502.65

  function yearNow() {
    return new Date().getFullYear();
  }

  function pad2(n) {
    return String(n).padStart(2, "0");
  }

  function toIsoLocal(d) {
    return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate());
  }

  function parseIso(iso) {
    var p = String(iso || "").split("-");
    if (p.length < 3) return null;
    var d = new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]), 12, 0, 0);
    return isNaN(d.getTime()) ? null : d;
  }

  function formatBrDate(iso) {
    var d = parseIso(iso);
    if (!d) return iso || "—";
    return (
      pad2(d.getDate()) +
      "/" +
      pad2(d.getMonth() + 1) +
      "/" +
      d.getFullYear()
    );
  }

  function formatBrDateTime(isoOrDate) {
    if (!isoOrDate) return "—";
    var d = isoOrDate instanceof Date ? isoOrDate : new Date(isoOrDate);
    if (isNaN(d.getTime())) return "—";
    return (
      pad2(d.getDate()) +
      "/" +
      pad2(d.getMonth() + 1) +
      "/" +
      d.getFullYear() +
      " · " +
      pad2(d.getHours()) +
      ":" +
      pad2(d.getMinutes())
    );
  }

  function weekdayLabel(iso) {
    var d = parseIso(iso);
    if (!d) return "";
    return ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"][d.getDay()] || "";
  }

  function ensureBimestreCalendarSeed(ano) {
    ano = ano || yearNow();
    var days;
    try {
      days = JSON.parse(localStorage.getItem("siga_calendar_days") || "{}") || {};
    } catch (e) {
      days = {};
    }
    var sample = ano + "-08-15";
    if (days[sample] && isLetivoDay(days[sample])) return days;
    var changed = false;
    var start = new Date(ano, 7, 1); // Aug
    var end = new Date(ano, 11, 31); // Dec
    for (var d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      var iso = toIsoLocal(d);
      if (days[iso]) continue;
      var dow = d.getDay();
      if (dow === 0) {
        days[iso] = { type: "domingo", label: "Domingo (Não Letivo)", locked: true };
      } else if (dow === 6) {
        days[iso] = { type: "sabado_nao_letivo", label: "Sábado (Não Letivo)" };
      } else {
        days[iso] = { type: "letivo", label: "Dia Letivo" };
      }
      changed = true;
    }
    if (!days[ano + "-08-01"] || days[ano + "-08-01"].type !== "inicio_3b") {
      days[ano + "-08-01"] = { type: "inicio_3b", label: "Início do 3º Bimestre" };
      changed = true;
    }
    if (!days[ano + "-11-01"] || days[ano + "-11-01"].type !== "inicio_4b") {
      days[ano + "-11-01"] = { type: "inicio_4b", label: "Início do 4º Bimestre" };
      changed = true;
    }
    if (changed) {
      try {
        localStorage.setItem("siga_calendar_days", JSON.stringify(days));
      } catch (e2) { /* ignore */ }
    }
    return days;
  }

  function getCalendarDays() {
    var days = {};
    if (typeof global.getCalendarDays === "function") {
      try {
        days = global.getCalendarDays() || {};
      } catch (e) {
        days = {};
      }
    } else {
      try {
        days = JSON.parse(localStorage.getItem("siga_calendar_days") || "{}") || {};
      } catch (e2) {
        days = {};
      }
    }
    ensureBimestreCalendarSeed(yearNow());
    try {
      return JSON.parse(localStorage.getItem("siga_calendar_days") || "{}") || days;
    } catch (e3) {
      return days;
    }
  }

  function isLetivoDay(info) {
    if (!info || !info.type) return false;
    var t = String(info.type);
    return (
      t === "letivo" ||
      t === "evento" ||
      t === "sabado" ||
      t.indexOf("inicio_") === 0
    );
  }

  function defaultBimestreRanges(ano) {
    return {
      3: { start: ano + "-08-01", end: ano + "-10-31", label: "3º Bimestre" },
      4: { start: ano + "-11-01", end: ano + "-12-31", label: "4º Bimestre" },
    };
  }

  /** Usa marcas inicio_3b / inicio_4b do calendário quando existirem. */
  function resolveBimestreRanges(ano) {
    var days = getCalendarDays();
    var starts = { 3: null, 4: null };
    Object.keys(days || {}).forEach(function (iso) {
      var t = days[iso] && days[iso].type;
      if (t === "inicio_3b") starts[3] = iso;
      if (t === "inicio_4b") starts[4] = iso;
    });
    var fallback = defaultBimestreRanges(ano);
    var endYear = ano + "-12-31";
    var r3start = starts[3] || fallback[3].start;
    var r4start = starts[4] || fallback[4].start;
    var r3end;
    if (starts[4]) {
      var d = parseIso(starts[4]);
      d.setDate(d.getDate() - 1);
      r3end = toIsoLocal(d);
    } else {
      r3end = fallback[3].end;
    }
    return {
      3: { start: r3start, end: r3end, label: "3º Bimestre" },
      4: { start: r4start, end: endYear, label: "4º Bimestre" },
    };
  }

  function inRange(iso, start, end) {
    return iso >= start && iso <= end;
  }

  function listLetivoDays(bimFilter) {
    var ano = yearNow();
    var ranges = resolveBimestreRanges(ano);
    var days = getCalendarDays();
    var out = [];
    var keys = Object.keys(days || {}).sort();
    keys.forEach(function (iso) {
      if (!isLetivoDay(days[iso])) return;
      var b3 = inRange(iso, ranges[3].start, ranges[3].end);
      var b4 = inRange(iso, ranges[4].start, ranges[4].end);
      if (bimFilter === "3" && !b3) return;
      if (bimFilter === "4" && !b4) return;
      if (bimFilter === "ambos" && !b3 && !b4) return;
      out.push({
        iso: iso,
        bimestre: b3 ? 3 : 4,
        label: days[iso].label || "Dia letivo",
      });
    });
    return out;
  }

  function getLocalAttendance(dateIso, classCode) {
    try {
      var raw = localStorage.getItem(
        "siga_attendance_" + dateIso + "_" + classCode
      );
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  function consolidarStatusDia(entStatus, saiStatus) {
    var ent = entStatus || null;
    var sai = saiStatus || null;
    if (!ent && !sai) return null;
    if (ent === "P" && sai === "P") return "P";
    if (ent === "F" && sai === "F") return "F";
    if (ent === "P" && sai === "FJ") return "P";
    if (ent === "FJ" && sai === "FJ") return "FJ";
    if (ent === "FJ" && sai === "P") return "P";
    if (ent === "P" && sai === "F") return "F";
    if (ent === "F" && sai === "P") return "F";
    if (ent === "P" && !sai) return "entrada";
    return "F";
  }

  function markForStudent(phaseRec, student) {
    if (!phaseRec || !student) return null;
    var records = phaseRec.records || {};
    var sid = String(student.id);
    if (records[sid]) return records[sid];
    var byEmail = null;
    Object.keys(records).forEach(function (k) {
      var r = records[k];
      if (r && r.email && String(r.email).toLowerCase() === String(student.email || "").toLowerCase()) {
        byEmail = r;
      }
    });
    return byEmail || null;
  }

  function isConsolidatedMark(mark) {
    if (!mark) return false;
    if (mark.locked) return true;
    if (mark._hasMark && (mark.status === "P" || mark.status === "F" || mark.status === "FJ")) {
      return true;
    }
    return !!(mark.status && mark.marked_at);
  }

  function readDayForStudent(dateIso, student, classCode) {
    var rec = getLocalAttendance(dateIso, classCode);
    var entMark = rec && rec.entrada ? markForStudent(rec.entrada, student) : null;
    var saiMark = rec && rec.saida ? markForStudent(rec.saida, student) : null;
    var entOk = isConsolidatedMark(entMark) && entMark.status === "P";
    var saiOk = isConsolidatedMark(saiMark) && saiMark.status === "P";
    var consolidado =
      entOk && saiOk
        ? consolidarStatusDia(entMark.status, saiMark.status)
        : entOk
          ? "entrada"
          : null;

    return {
      dateIso: dateIso,
      entrada: entOk
        ? {
            at: entMark.marked_at || null,
            status: entMark.status,
            source: entMark.source || "manual",
          }
        : null,
      saida: saiOk
        ? {
            at: saiMark.marked_at || null,
            status: saiMark.status,
            source: saiMark.source || "manual",
          }
        : null,
      consolidado: consolidado,
      callEntradaOk: !!(rec && rec.entrada && rec.entrada.consolidado),
      callSaidaOk: !!(rec && rec.saida && rec.saida.consolidado),
    };
  }

  function loadDayFromSupabase(dateIso, student, classCode) {
    var cloud = global.SigaFrequenciaCloud;
    if (!cloud || typeof cloud.loadDay !== "function") {
      return Promise.resolve(null);
    }
    return cloud
      .loadDay(classCode, dateIso, [student])
      .then(function (res) {
        if (!res || !res.ok || !res.record) return null;
        try {
          localStorage.setItem(
            "siga_attendance_" + dateIso + "_" + classCode,
            JSON.stringify(res.record)
          );
        } catch (e) { /* ignore */ }
        return readDayForStudent(dateIso, student, classCode);
      })
      .catch(function () {
        return null;
      });
  }

  function summarize(letivoDays, student, classCode) {
    var aulas = letivoDays.length;
    var presentes = 0;
    var comEntrada = 0;
    letivoDays.forEach(function (day) {
      var info = readDayForStudent(day.iso, student, classCode);
      if (info.entrada) comEntrada++;
      if (info.consolidado === "P") presentes++;
    });
    var pct = aulas > 0 ? Math.round((presentes / aulas) * 100) : 0;
    return { aulas: aulas, presentes: presentes, comEntrada: comEntrada, pct: pct };
  }

  function setText(id, text) {
    var el = document.getElementById(id);
    if (el) el.textContent = text;
  }

  function setRing(pct) {
    var ring = document.getElementById("freq-ring");
    var pctEl = document.getElementById("freq-pct-geral");
    var p = Math.max(0, Math.min(100, Number(pct) || 0));
    if (pctEl) pctEl.textContent = p + "%";
    if (ring) {
      ring.style.strokeDasharray = String(CIRC);
      ring.style.strokeDashoffset = String(CIRC - (p / 100) * CIRC);
    }
  }

  function statusBadgeHtml(dayInfo) {
    if (dayInfo.consolidado === "P") {
      return '<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[11px] font-semibold">Dia consolidado · Presente</span>';
    }
    if (dayInfo.entrada) {
      return '<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 text-[11px] font-semibold">Entrou na escola</span>';
    }
    return '<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 text-[11px] font-semibold">Sem entrada registrada</span>';
  }

  function renderDayDetail(dayInfo, selectedIso) {
    var host = document.getElementById("freq-dia-detalhe");
    if (!host) return;
    if (!selectedIso) {
      host.innerHTML =
        '<p class="text-sm text-on-surface-variant">Selecione um dia letivo para ver entrada e saída.</p>';
      return;
    }

    var entradaBlock;
    if (dayInfo && dayInfo.entrada) {
      entradaBlock =
        '<div class="rounded-xl border border-emerald-200 bg-emerald-50 p-4">' +
        '<div class="flex items-center gap-2 text-emerald-800 font-semibold">' +
        '<span class="material-symbols-outlined text-[22px]">login</span> Entrada</div>' +
        '<p class="mt-2 text-sm text-emerald-900">O aluno <strong>entrou na escola</strong>.</p>' +
        '<p class="mt-1 text-base font-bold text-on-surface">' +
        formatBrDateTime(dayInfo.entrada.at || selectedIso + "T07:30:00") +
        "</p>" +
        '<p class="text-[11px] text-emerald-700/80 mt-1">Consolidado no SIGA EDUCA' +
        (dayInfo.entrada.source === "facial" ? " · Reconhecimento facial" : "") +
        "</p></div>";
    } else {
      entradaBlock =
        '<div class="rounded-xl border border-slate-200 bg-slate-50 p-4">' +
        '<div class="flex items-center gap-2 text-slate-600 font-semibold">' +
        '<span class="material-symbols-outlined text-[22px]">login</span> Entrada</div>' +
        '<p class="mt-2 text-sm text-on-surface-variant">Ainda não há entrada consolidada neste dia.</p></div>';
    }

    var saidaBlock;
    if (dayInfo && dayInfo.saida) {
      saidaBlock =
        '<div class="rounded-xl border border-sky-200 bg-sky-50 p-4">' +
        '<div class="flex items-center gap-2 text-sky-800 font-semibold">' +
        '<span class="material-symbols-outlined text-[22px]">logout</span> Saída</div>' +
        '<p class="mt-2 text-sm text-sky-900">Saída registrada.</p>' +
        '<p class="mt-1 text-base font-bold text-on-surface">' +
        formatBrDateTime(dayInfo.saida.at || selectedIso + "T12:00:00") +
        "</p>" +
        '<p class="text-[11px] text-sky-700/80 mt-1">Consolidado no SIGA EDUCA' +
        (dayInfo.saida.source === "facial" ? " · Reconhecimento facial" : "") +
        "</p></div>";
    } else if (dayInfo && dayInfo.entrada) {
      saidaBlock =
        '<div class="rounded-xl border border-amber-200 bg-amber-50 p-4">' +
        '<div class="flex items-center gap-2 text-amber-900 font-semibold">' +
        '<span class="material-symbols-outlined text-[22px]">logout</span> Saída</div>' +
        '<p class="mt-2 text-sm text-amber-900">Aguardando saída / consolidação do dia.</p></div>';
    } else {
      saidaBlock =
        '<div class="rounded-xl border border-slate-200 bg-slate-50 p-4">' +
        '<div class="flex items-center gap-2 text-slate-600 font-semibold">' +
        '<span class="material-symbols-outlined text-[22px]">logout</span> Saída</div>' +
        '<p class="mt-2 text-sm text-on-surface-variant">Sem saída registrada.</p></div>';
    }

    var consolBlock = "";
    if (dayInfo && dayInfo.consolidado === "P") {
      consolBlock =
        '<div class="rounded-xl border border-primary/30 bg-primary/10 p-4">' +
        '<div class="flex items-center gap-2 text-primary font-semibold">' +
        '<span class="material-symbols-outlined text-[22px]">verified</span> Frequência consolidada do dia</div>' +
        '<p class="mt-2 text-sm text-on-surface">Entrada e saída confirmadas. Presença do dia: <strong>Presente (P)</strong>.</p></div>';
    } else if (dayInfo && dayInfo.consolidado === "F") {
      consolBlock =
        '<div class="rounded-xl border border-red-200 bg-red-50 p-4">' +
        '<div class="flex items-center gap-2 text-red-800 font-semibold">' +
        '<span class="material-symbols-outlined text-[22px]">cancel</span> Frequência consolidada do dia</div>' +
        '<p class="mt-2 text-sm text-red-900">Dia consolidado como falta.</p></div>';
    }

    host.innerHTML =
      '<p class="text-xs font-bold uppercase tracking-wide text-on-surface-variant mb-2">' +
      weekdayLabel(selectedIso) +
      " · " +
      formatBrDate(selectedIso) +
      "</p>" +
      '<div class="space-y-3">' +
      entradaBlock +
      saidaBlock +
      consolBlock +
      "</div>";
  }

  function fillDateFilter(days, selectedIso) {
    var sel = document.getElementById("freq-filtro-data");
    if (!sel) return selectedIso;
    if (!days.length) {
      sel.innerHTML = '<option value="">Nenhum dia letivo no calendário</option>';
      return "";
    }
    var today = toIsoLocal(new Date());
    var pick = selectedIso;
    if (!pick || !days.some(function (d) { return d.iso === pick; })) {
      var past = days.filter(function (d) { return d.iso <= today; });
      pick = (past.length ? past[past.length - 1] : days[0]).iso;
    }
    sel.innerHTML = days
      .map(function (d) {
        return (
          '<option value="' +
          d.iso +
          '">' +
          weekdayLabel(d.iso) +
          " · " +
          formatBrDate(d.iso) +
          " · " +
          d.bimestre +
          "º bim</option>"
        );
      })
      .join("");
    sel.value = pick;
    return pick;
  }

  function renderRecentList(days, student, classCode, limit) {
    var host = document.getElementById("freq-lista-dias");
    if (!host) return;
    var today = toIsoLocal(new Date());
    var recent = days
      .filter(function (d) { return d.iso <= today; })
      .slice(-Number(limit || 12))
      .reverse();
    if (!recent.length) {
      host.innerHTML =
        '<p class="text-sm text-on-surface-variant px-1">Cadastre os dias letivos do 3º e 4º bimestres no Calendário Letivo do SIGA EDUCA.</p>';
      return;
    }
    host.innerHTML = recent
      .map(function (d) {
        var info = readDayForStudent(d.iso, student, classCode);
        return (
          '<button type="button" data-iso="' +
          d.iso +
          '" class="freq-day-row w-full text-left bg-surface-container-lowest border border-outline-variant rounded-xl p-4 flex items-center justify-between gap-3 shadow-sm active:scale-[0.99] transition">' +
          '<div><p class="font-semibold text-on-surface">' +
          weekdayLabel(d.iso) +
          " · " +
          formatBrDate(d.iso) +
          '</p><p class="text-[11px] text-on-surface-variant mt-0.5">' +
          (info.entrada
            ? "Entrada " + formatBrDateTime(info.entrada.at)
            : "Sem entrada") +
          (info.saida ? " · Saída " + formatBrDateTime(info.saida.at) : "") +
          "</p></div>" +
          statusBadgeHtml(info) +
          "</button>"
        );
      })
      .join("");

    host.querySelectorAll(".freq-day-row").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var iso = btn.getAttribute("data-iso");
        var sel = document.getElementById("freq-filtro-data");
        if (sel) {
          sel.value = iso;
          sel.dispatchEvent(new Event("change"));
        }
        var detalhe = document.getElementById("freq-dia-detalhe");
        if (detalhe) detalhe.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    });
  }

  function paintBimestreTabs(active) {
    document.querySelectorAll("[data-freq-bim]").forEach(function (btn) {
      var on = btn.getAttribute("data-freq-bim") === active;
      btn.className = on
        ? "flex-shrink-0 px-4 py-2 bg-primary text-on-primary rounded-full font-label-md transition-all active:scale-95"
        : "flex-shrink-0 px-4 py-2 bg-surface-container-highest text-on-surface-variant rounded-full font-label-md transition-all hover:bg-surface-variant";
    });
  }

  function bootFrequencia(ctx) {
    ctx = ctx || {};
    var student = ctx.student || {};
    var classCode = String(student.turma || "");
    var state = { bim: "ambos", selectedIso: "" };

    ensureBimestreCalendarSeed(yearNow());

    setText(
      "freq-subtitulo",
      "Acompanhamento do 3º e 4º Bimestres de " + yearNow()
    );
    setText("freq-aluno-nome", student.nome || "Aluno");

    function refresh() {
      var days = listLetivoDays(state.bim);
      var stats = summarize(days, student, classCode);
      setText("freq-aulas-totais", String(stats.aulas));
      setText("freq-presencas", String(stats.presentes));
      setRing(stats.pct);
      state.selectedIso = fillDateFilter(days, state.selectedIso);
      var dayInfo = state.selectedIso
        ? readDayForStudent(state.selectedIso, student, classCode)
        : null;
      renderDayDetail(dayInfo, state.selectedIso);
      renderRecentList(days, student, classCode, 14);

      var emptyCal = document.getElementById("freq-calendario-aviso");
      if (emptyCal) {
        emptyCal.classList.toggle("hidden", days.length > 0);
      }

      // Tenta enriquecer o dia selecionado via Supabase
      if (state.selectedIso && classCode && student.id) {
        loadDayFromSupabase(state.selectedIso, student, classCode).then(function (cloudDay) {
          if (!cloudDay) return;
          renderDayDetail(cloudDay, state.selectedIso);
          var st2 = summarize(listLetivoDays(state.bim), student, classCode);
          setText("freq-presencas", String(st2.presentes));
          setRing(st2.pct);
          renderRecentList(listLetivoDays(state.bim), student, classCode, 14);
        });
      }
    }

    paintBimestreTabs(state.bim);
    document.querySelectorAll("[data-freq-bim]").forEach(function (btn) {
      if (btn._bound) return;
      btn._bound = true;
      btn.addEventListener("click", function () {
        state.bim = btn.getAttribute("data-freq-bim") || "ambos";
        paintBimestreTabs(state.bim);
        state.selectedIso = "";
        refresh();
      });
    });

    var sel = document.getElementById("freq-filtro-data");
    if (sel && !sel._bound) {
      sel._bound = true;
      sel.addEventListener("change", function () {
        state.selectedIso = sel.value || "";
        var dayInfo = state.selectedIso
          ? readDayForStudent(state.selectedIso, student, classCode)
          : null;
        renderDayDetail(dayInfo, state.selectedIso);
        if (state.selectedIso && classCode) {
          loadDayFromSupabase(state.selectedIso, student, classCode).then(function (cloudDay) {
            if (cloudDay) renderDayDetail(cloudDay, state.selectedIso);
          });
        }
      });
    }

    refresh();
  }

  global.SigaPortalFrequencia = {
    boot: bootFrequencia,
    listLetivoDays: listLetivoDays,
  };
})(typeof window !== "undefined" ? window : this);
