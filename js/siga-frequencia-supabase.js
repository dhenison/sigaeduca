/**
 * SIGA EDUCA — Frequência no Supabase (attendance_calls / attendance_marks)
 *
 * Alunos já existem em `students`. O reconhecimento facial só grava foto local
 * e, ao bater ponto, sobe Presença (P) aqui. Esta camada faz a tela Frequência
 * ler/gravar as mesmas tabelas (parâmetros do sistema).
 */
(function (global) {
  "use strict";

  var lastCallId = null;
  var lastError = null;
  var cloudEnabled = false;

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

  /**
   * Carrega chamada + marcas do dia.
   * @returns {Promise<{ok:boolean, source:string, call:object|null, record:object, studentMap:object}>}
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
                "id,student_id,phase,status,justification,marked_at"
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
                };

                (students || []).forEach(function (s) {
                  var sid = String(s.id);
                  record.entrada.records[sid] = { status: "P", justification: "" };
                  record.saida.records[sid] = { status: "P", justification: "" };
                });

                marks.forEach(function (m) {
                  var sid = String(m.student_id);
                  var phase = m.phase === "saida" ? "saida" : "entrada";
                  record[phase].records[sid] = {
                    status: m.status || "P",
                    justification: m.justification || "",
                    marked_at: m.marked_at || null,
                    _markId: m.id,
                  };
                });

                cloudEnabled = true;
                setStatusBanner(
                  true,
                  "Frequência no SIGA · batidas faciais aparecem como Presença (P)."
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

  function upsertMarks(record) {
    if (!cloudEnabled || !record || !record._callId || !record._schoolId) {
      return Promise.resolve({ ok: false });
    }
    var sb = getSb();
    if (!sb) return Promise.resolve({ ok: false });

    var rows = [];
    ["entrada", "saida"].forEach(function (phase) {
      var phaseRec = (record[phase] && record[phase].records) || {};
      Object.keys(phaseRec).forEach(function (studentId) {
        var rec = phaseRec[studentId] || {};
        rows.push({
          school_id: record._schoolId,
          call_id: record._callId,
          student_id: studentId,
          phase: phase,
          status: rec.status || "P",
          justification: rec.status === "FJ" ? rec.justification || "" : null,
          marked_at: rec.marked_at || new Date().toISOString(),
        });
      });
    });

    if (!rows.length) return Promise.resolve({ ok: true });

    // Upsert em lotes
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
        return upsertMarks(record);
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

  /**
   * Carrega alunos da turma no Supabase (fonte oficial).
   * Mapeia para o formato da UI: { id, nome, turma, status, frequencia }
   */
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

  global.SigaFrequenciaCloud = {
    isReady: isReady,
    loadDay: loadDay,
    upsertMarks: upsertMarks,
    setConsolidation: setConsolidation,
    loadStudentsForClass: loadStudentsForClass,
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
