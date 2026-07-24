/**
 * SIGA EDUCA — Frequência no Supabase (attendance_calls / attendance_marks)
 *
 * Reconhecimento facial grava P + locked (consolidação individual).
 * Entrada locked libera Saída daquele aluno; Dia = Entrada + Saída.
 */
(function (global) {
  "use strict";

  var lastCallId = null;
  var lastError = null;
  var cloudEnabled = false;
  var dayChannel = null;
  var dayPollTimer = null;
  var dayRefreshTimer = null;
  var watchedCallId = null;
  var watchedCallback = null;

  function authApi() {
    return global.SigaSupabase || global.SigaAuth || null;
  }

  function getSb() {
    var a = authApi();
    return a && typeof a.getClient === "function" ? a.getClient() : null;
  }

  function isReady() {
    var a = authApi();
    return !!(a && typeof a.isConfigured === "function" && a.isConfigured() && getSb());
  }

  function resolveSchoolId() {
    try {
      var active = localStorage.getItem("siga_active_school");
      if (active) return Promise.resolve(active);
    } catch (e) { /* ignore */ }
    try {
      var session = JSON.parse(localStorage.getItem("siga_session") || "null");
      if (session && session.schoolId) return Promise.resolve(session.schoolId);
    } catch (e2) { /* ignore */ }
    var a = authApi();
    var profile = a && typeof a.getCachedProfile === "function" ? a.getCachedProfile() : null;
    if (profile && profile.school_id) return Promise.resolve(profile.school_id);
    return Promise.resolve(null);
  }

  function setStatusBanner(ok, message) {
    var el = document.getElementById("freq-cloud-status");
    if (!el) return;
    el.classList.remove("hidden");
    if (ok) {
      el.className =
        "mb-4 rounded-xl border border-primary/30 bg-primary/5 px-4 py-3 text-sm text-on-surface";
      el.textContent = message || "Frequência sincronizada com o SIGA (Supabase).";
    } else {
      el.className =
        "mb-4 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900";
      el.textContent =
        message ||
        "Supabase indisponível — usando cache local. Batidas faciais podem não aparecer até reconectar.";
    }
  }

  function emptyMark() {
    return {
      status: "P",
      justification: "",
      locked: false,
      source: "manual",
      marked_at: null,
      _hasMark: false,
    };
  }

  /**
   * Carrega chamada + marcas do dia.
   */
  function loadDay(classCode, dayDate, students) {
    lastError = null;
    lastCallId = null;
    cloudEnabled = false;

    if (!isReady()) {
      setStatusBanner(false, "Login Supabase necessário para ver batidas do reconhecimento facial.");
      return Promise.resolve({
        ok: false,
        source: "local",
        call: null,
        record: null,
        studentMap: {},
      });
    }

    var sb = getSb();
    return resolveSchoolId().then(function (schoolId) {
      if (!schoolId) {
        setStatusBanner(false, "Escola não identificada na sessão. Faça login novamente.");
        return { ok: false, source: "local", call: null, record: null, studentMap: {} };
      }

      return sb
        .from("attendance_calls")
        .select(
          "id,school_id,class_code,day_date,entrada_consolidada,saida_consolidada,entrada_consolidada_at,saida_consolidada_at"
        )
        .eq("school_id", schoolId)
        .eq("class_code", classCode)
        .eq("day_date", dayDate)
        .maybeSingle()
        .then(function (callRes) {
          if (callRes.error) throw callRes.error;
          var call = callRes.data;

          function ensureCall() {
            if (call && call.id) return Promise.resolve(call);
            return sb
              .from("attendance_calls")
              .upsert(
                {
                  school_id: schoolId,
                  class_code: classCode,
                  day_date: dayDate,
                },
                { onConflict: "school_id,class_code,day_date" }
              )
              .select(
                "id,school_id,class_code,day_date,entrada_consolidada,saida_consolidada"
              )
              .maybeSingle()
              .then(function (created) {
                if (created.error) throw created.error;
                call = created.data;
                return call;
              });
          }

          return ensureCall().then(function (ensured) {
            call = ensured;
            if (!call || !call.id) {
              throw new Error("Não foi possível obter a chamada do dia.");
            }
            lastCallId = call.id;
            return sb
              .from("attendance_marks")
              .select(
                "id,student_id,phase,status,justification,marked_at,locked,source"
              )
              .eq("call_id", call.id)
              .then(function (marksRes) {
                if (marksRes.error) throw marksRes.error;
                var marks = marksRes.data || [];
                var record = {
                  entrada: {
                    consolidado: !!call.entrada_consolidada,
                    records: {},
                  },
                  saida: {
                    consolidado: !!call.saida_consolidada,
                    records: {},
                  },
                  _callId: call.id,
                  _schoolId: schoolId,
                  _individualMode: true,
                };

                (students || []).forEach(function (s) {
                  var sid = String(s.id);
                  record.entrada.records[sid] = emptyMark();
                  record.saida.records[sid] = emptyMark();
                });

                marks.forEach(function (m) {
                  var sid = String(m.student_id);
                  var phase = m.phase === "saida" ? "saida" : "entrada";
                  if (!record[phase].records[sid]) {
                    record[phase].records[sid] = emptyMark();
                  }
                  record[phase].records[sid] = {
                    status: m.status || "P",
                    justification: m.justification || "",
                    marked_at: m.marked_at || null,
                    locked: !!m.locked,
                    source: m.source || "manual",
                    _markId: m.id,
                    _hasMark: true,
                  };
                });

                cloudEnabled = true;
                setStatusBanner(
                  true,
                  "Frequência no SIGA · batida facial consolida o aluno individualmente (P fechado)."
                );
                return {
                  ok: true,
                  source: "supabase",
                  call: call,
                  record: record,
                  studentMap: {},
                };
              });
          });
        });
    }).catch(function (err) {
      lastError = err;
      console.warn("[SIGA Frequência]", err);
      setStatusBanner(
        false,
        "Falha ao carregar Frequência no Supabase: " +
          ((err && err.message) || String(err))
      );
      return {
        ok: false,
        source: "local",
        call: null,
        record: null,
        studentMap: {},
      };
    });
  }

  function upsertMarks(record, options) {
    options = options || {};
    if (!cloudEnabled || !record || !record._callId || !record._schoolId) {
      return Promise.resolve({ ok: false });
    }
    var sb = getSb();
    if (!sb) return Promise.resolve({ ok: false });

    var onlyStudent = options.studentId ? String(options.studentId) : null;
    var onlyPhase = options.phase || null;
    var lockOpt = options.lock;

    var rows = [];
    ["entrada", "saida"].forEach(function (phase) {
      if (onlyPhase && onlyPhase !== phase) return;
      var phaseRec = (record[phase] && record[phase].records) || {};
      Object.keys(phaseRec).forEach(function (studentId) {
        if (onlyStudent && onlyStudent !== String(studentId)) return;
        var rec = phaseRec[studentId] || {};
        // Só grava marcas reais (facial ou edição manual explícita)
        if (!rec._hasMark && !options.force && !onlyStudent) return;
        if (onlyStudent) {
          rec._hasMark = true;
          if (lockOpt === false) rec.locked = false;
          else if (lockOpt !== false) rec.locked = true;
          if (!rec.source || rec.source === "manual") {
            rec.source = options.source || "manual";
          }
          phaseRec[studentId] = rec;
        }
        rows.push({
          school_id: record._schoolId,
          call_id: record._callId,
          student_id: studentId,
          phase: phase,
          status: rec.status || "P",
          justification: rec.status === "FJ" ? rec.justification || "" : null,
          marked_at: rec.marked_at || new Date().toISOString(),
          locked: !!rec.locked,
          source: rec.source || "manual",
        });
      });
    });

    if (!rows.length) return Promise.resolve({ ok: true });

    var chunk = 80;
    var chain = Promise.resolve();
    for (var i = 0; i < rows.length; i += chunk) {
      (function (slice) {
        chain = chain.then(function () {
          return sb
            .from("attendance_marks")
            .upsert(slice, { onConflict: "call_id,student_id,phase" })
            .then(function (res) {
              if (res.error) throw res.error;
            });
        });
      })(rows.slice(i, i + chunk));
    }
    return chain
      .then(function () {
        return { ok: true };
      })
      .catch(function (err) {
        lastError = err;
        console.warn("[SIGA Frequência] upsert marks:", err);
        if (typeof showToast === "function") {
          showToast("Erro ao salvar frequência no SIGA: " + (err.message || err));
        }
        return { ok: false, error: err };
      });
  }

  function setConsolidation(record, phase, consolidated) {
    // Mantido por compatibilidade; fluxo facial usa locked por marca.
    if (!cloudEnabled || !record || !record._callId) {
      return Promise.resolve({ ok: false });
    }
    var sb = getSb();
    if (!sb) return Promise.resolve({ ok: false });

    var patch = {};
    if (phase === "entrada") {
      patch.entrada_consolidada = !!consolidated;
      patch.entrada_consolidada_at = consolidated ? new Date().toISOString() : null;
    } else {
      patch.saida_consolidada = !!consolidated;
      patch.saida_consolidada_at = consolidated ? new Date().toISOString() : null;
    }

    return sb
      .from("attendance_calls")
      .update(patch)
      .eq("id", record._callId)
      .then(function (res) {
        if (res.error) throw res.error;
        return upsertMarks(record, { force: true });
      })
      .then(function () {
        return { ok: true };
      })
      .catch(function (err) {
        lastError = err;
        console.warn("[SIGA Frequência] consolidar:", err);
        if (typeof showToast === "function") {
          showToast("Erro ao consolidar no SIGA: " + (err.message || err));
        }
        return { ok: false, error: err };
      });
  }

  function loadStudentsForClass(classCode) {
    if (!isReady() || !classCode) {
      return Promise.resolve([]);
    }
    var sb = getSb();
    return resolveSchoolId().then(function (schoolId) {
      if (!schoolId) return [];
      return sb
        .from("students")
        .select("id,full_name,class_code,codigo_inep,status,attendance_pct")
        .eq("school_id", schoolId)
        .eq("class_code", classCode)
        .order("full_name")
        .then(function (res) {
          if (res.error) throw res.error;
          return (res.data || []).map(function (s) {
            return {
              id: s.id,
              nome: s.full_name || "",
              turma: s.class_code || classCode,
              status: s.status || "Ativo",
              frequencia: s.attendance_pct != null ? Number(s.attendance_pct) : null,
              codigo_inep: s.codigo_inep || "",
              _fromSupabase: true,
            };
          });
        });
    }).catch(function (err) {
      console.warn("[SIGA Frequência] students:", err);
      return [];
    });
  }

  function scheduleWatchedRefresh() {
    if (dayRefreshTimer) global.clearTimeout(dayRefreshTimer);
    dayRefreshTimer = global.setTimeout(function () {
      dayRefreshTimer = null;
      if (typeof watchedCallback === "function") watchedCallback();
    }, 350);
  }

  function stopWatchingDay() {
    if (dayRefreshTimer) global.clearTimeout(dayRefreshTimer);
    if (dayPollTimer) global.clearInterval(dayPollTimer);
    dayRefreshTimer = null;
    dayPollTimer = null;
    watchedCallId = null;
    watchedCallback = null;

    var sb = getSb();
    if (dayChannel) {
      try {
        if (sb && typeof sb.removeChannel === "function") {
          sb.removeChannel(dayChannel);
        } else if (typeof dayChannel.unsubscribe === "function") {
          dayChannel.unsubscribe();
        }
      } catch (e) {
        console.warn("[SIGA Frequência] encerrar atualização automática:", e);
      }
    }
    dayChannel = null;
  }

  /**
   * Mantém a chamada aberta sincronizada com as batidas faciais.
   * Realtime atualiza na hora; a consulta periódica cobre projetos em que a
   * publicação Realtime ainda não esteja habilitada para estas tabelas.
   */
  function watchDay(record, callback) {
    var callId = record && record._callId ? String(record._callId) : "";
    if (!callId || typeof callback !== "function") {
      stopWatchingDay();
      return;
    }

    if (watchedCallId === callId) {
      watchedCallback = callback;
      return;
    }

    stopWatchingDay();
    watchedCallId = callId;
    watchedCallback = callback;

    var sb = getSb();
    if (sb && typeof sb.channel === "function") {
      try {
        dayChannel = sb
          .channel("siga-frequencia-" + callId)
          .on(
            "postgres_changes",
            {
              event: "*",
              schema: "public",
              table: "attendance_marks",
              filter: "call_id=eq." + callId,
            },
            scheduleWatchedRefresh
          )
          .on(
            "postgres_changes",
            {
              event: "UPDATE",
              schema: "public",
              table: "attendance_calls",
              filter: "id=eq." + callId,
            },
            scheduleWatchedRefresh
          )
          .subscribe();
      } catch (err) {
        console.warn("[SIGA Frequência] atualização em tempo real:", err);
        dayChannel = null;
      }
    }

    dayPollTimer = global.setInterval(function () {
      if (!global.document || global.document.visibilityState !== "hidden") {
        scheduleWatchedRefresh();
      }
    }, 15000);
  }

  global.SigaFrequenciaCloud = {
    isReady: isReady,
    loadDay: loadDay,
    upsertMarks: upsertMarks,
    setConsolidation: setConsolidation,
    loadStudentsForClass: loadStudentsForClass,
    watchDay: watchDay,
    stopWatchingDay: stopWatchingDay,
    getLastCallId: function () {
      return lastCallId;
    },
    getLastError: function () {
      return lastError;
    },
    isCloudEnabled: function () {
      return cloudEnabled;
    },
  };
})(window);
