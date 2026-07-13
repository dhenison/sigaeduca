/**
 * SIGA EDUCA — Sync Gestão de Lotação ↔ Supabase
 * Espelho local: lotacao_data / professores_cadastro
 * Cloud: lotacao_professores / lotacao_alocacoes / v_lotacao_mapa
 *
 * Fonte de verdade quando autenticado + escola ativa: banco.
 * localStorage permanece cache/offline.
 */
(function (global) {
    'use strict';

    var LOTACAO_DATA_KEY = 'lotacao_data';
    var PROFESSORES_KEY = 'professores_cadastro';
    var ACTIVE_SCHOOL_KEY = 'siga_active_school';
    var CHUNK = 60;
    var DEFAULT_YEAR = 2026;
    var persistTimer = null;
    var persistInFlight = null;

    function getClient() {
        if (!global.SigaSupabase || !global.SigaSupabase.isConfigured || !global.SigaSupabase.isConfigured()) {
            return null;
        }
        return global.SigaSupabase.getClient();
    }

    function getActiveSchoolId() {
        try {
            var fromKey = localStorage.getItem(ACTIVE_SCHOOL_KEY) || '';
            if (fromKey) return fromKey;
            var session = JSON.parse(localStorage.getItem('siga_session') || 'null');
            if (session && session.schoolId) {
                localStorage.setItem(ACTIVE_SCHOOL_KEY, session.schoolId);
                return session.schoolId;
            }
            return '';
        } catch (e) {
            return '';
        }
    }

    function cloudReady() {
        var sb = getClient();
        var schoolId = getActiveSchoolId();
        if (!sb) {
            return { ok: false, reason: 'not_configured', message: 'Supabase não configurado.' };
        }
        if (!schoolId) {
            return {
                ok: false,
                reason: 'no_school',
                message: 'Nenhuma escola ativa. Entre pelo SIGA EDUCA e selecione a escola.'
            };
        }
        return { ok: true, sb: sb, schoolId: schoolId };
    }

    function chunkArray(arr, size) {
        var out = [];
        for (var i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
        return out;
    }

    function toNumber(v) {
        var n = Number(v);
        return Number.isFinite(n) ? n : null;
    }

    function matriculaBase(s) {
        var raw = String(s == null ? '' : s).trim();
        if (!raw || raw === '-' || raw === '—') return '';
        return raw.split('-')[0].replace(/\D/g, '');
    }

    function matriculaDv(s) {
        var raw = String(s == null ? '' : s).trim();
        if (!raw || raw.indexOf('-') < 0) return '';
        return String(raw.split('-')[1] || '').replace(/\D/g, '');
    }

    function isVacantProfessor(name) {
        var p = String(name == null ? '' : name).trim();
        return !p || p === '-' || p === '—';
    }

    function inferYear(rows) {
        if (!rows || !rows.length) return DEFAULT_YEAR;
        var y = toNumber(rows[0].ano || rows[0].year_number);
        return y || DEFAULT_YEAR;
    }

    function readLocalData() {
        try {
            var arr = JSON.parse(localStorage.getItem(LOTACAO_DATA_KEY) || '[]');
            return Array.isArray(arr) ? arr : [];
        } catch (e) {
            return [];
        }
    }

    function readLocalProfessores() {
        try {
            var arr = JSON.parse(localStorage.getItem(PROFESSORES_KEY) || '[]');
            return Array.isArray(arr) ? arr : [];
        } catch (e) {
            return [];
        }
    }

    function writeLocal(data, professores) {
        try {
            if (Array.isArray(data)) {
                localStorage.setItem(LOTACAO_DATA_KEY, JSON.stringify(data));
            }
            if (Array.isArray(professores)) {
                localStorage.setItem(PROFESSORES_KEY, JSON.stringify(professores));
            }
        } catch (e) { /* ignore quota */ }
    }

    function mapCloudRowToLocal(r) {
        var vacant = !r.professor_nome && !r.professor_id;
        return {
            ano: r.year_number || DEFAULT_YEAR,
            oferta: r.oferta == null ? '' : r.oferta,
            modal: r.modalidade || 'REG',
            turno: r.turno || '',
            turma: r.turma_code || '',
            num_alunos: r.num_alunos == null ? null : r.num_alunos,
            disciplina: r.disciplina || '',
            ch_disciplina: r.ch_disciplina == null ? null : Number(r.ch_disciplina),
            professor: vacant ? '-' : String(r.professor_nome || '').trim(),
            matricula: vacant ? '-' : String(r.professor_matricula || '-').trim(),
            ch_professor: r.ch_professor == null ? null : Number(r.ch_professor),
            codigo: r.disciplina_codigo || ''
        };
    }

    function mapCloudProfessorToLocal(p) {
        return {
            nome: p.full_name || '',
            matricula: p.matricula || '',
            dv: p.matricula_dv || '',
            cargo: p.cargo || 'PROFESSOR',
            vinculo: p.vinculo || 'EFETIVO',
            setor: p.setor || ''
        };
    }

    function buildProfessoresFromMapa(localRows, existingProfessores) {
        var byMat = {};
        (existingProfessores || []).forEach(function (p) {
            var m = matriculaBase(p.matricula);
            if (m) byMat[m] = p;
        });
        (localRows || []).forEach(function (item) {
            if (isVacantProfessor(item.professor)) return;
            var m = matriculaBase(item.matricula);
            if (!m) return;
            if (byMat[m]) return;
            byMat[m] = {
                nome: String(item.professor || '').trim(),
                matricula: m,
                dv: matriculaDv(item.matricula),
                cargo: 'PROFESSOR',
                vinculo: 'EFETIVO',
                setor: ''
            };
        });
        return Object.keys(byMat).map(function (k) { return byMat[k]; });
    }

    function fetchCloudMapa(schoolId, year) {
        var ready = cloudReady();
        if (!ready.ok) return Promise.resolve({ ok: false, reason: ready.reason, message: ready.message, rows: [] });
        var sb = ready.sb;
        var sid = schoolId || ready.schoolId;
        var y = year || DEFAULT_YEAR;
        return sb.from('v_lotacao_mapa')
            .select('*')
            .eq('school_id', sid)
            .eq('year_number', y)
            .order('sort_order', { ascending: true })
            .then(function (res) {
                if (res.error) {
                    return { ok: false, reason: 'query_error', message: res.error.message, rows: [] };
                }
                return { ok: true, rows: res.data || [], schoolId: sid, year: y };
            })
            .catch(function (err) {
                return { ok: false, reason: 'network', message: (err && err.message) || 'Falha de rede', rows: [] };
            });
    }

    function fetchCloudProfessores(schoolId) {
        var ready = cloudReady();
        if (!ready.ok) return Promise.resolve([]);
        var sid = schoolId || ready.schoolId;
        return ready.sb.from('lotacao_professores')
            .select('full_name,matricula,matricula_dv,cargo,vinculo,setor,status')
            .eq('school_id', sid)
            .eq('status', 'Ativo')
            .order('full_name', { ascending: true })
            .then(function (res) {
                if (res.error || !res.data) return [];
                return res.data.map(mapCloudProfessorToLocal);
            })
            .catch(function () { return []; });
    }

    /**
     * Prioridade: cloud (se houver linhas) → local.
     * Se cloud vazio e local tem dados → bootstrap (envia local para o banco).
     */
    function hydrate(options) {
        var opts = options || {};
        var year = opts.year || DEFAULT_YEAR;
        var localData = Array.isArray(opts.data) ? opts.data : readLocalData();
        var localProfs = Array.isArray(opts.professores) ? opts.professores : readLocalProfessores();
        var ready = cloudReady();

        if (!ready.ok) {
            return Promise.resolve({
                ok: true,
                source: 'local',
                synced: false,
                reason: ready.reason,
                message: ready.message,
                data: localData,
                professores: localProfs
            });
        }

        return Promise.all([
            fetchCloudMapa(ready.schoolId, year),
            fetchCloudProfessores(ready.schoolId)
        ]).then(function (parts) {
            var mapa = parts[0];
            var cloudProfs = parts[1] || [];

            if (!mapa.ok) {
                return {
                    ok: true,
                    source: 'local',
                    synced: false,
                    reason: mapa.reason,
                    message: mapa.message,
                    data: localData,
                    professores: localProfs
                };
            }

            if (mapa.rows && mapa.rows.length) {
                var data = mapa.rows.map(mapCloudRowToLocal);
                var professores = cloudProfs.length
                    ? cloudProfs
                    : buildProfessoresFromMapa(data, localProfs);
                writeLocal(data, professores);
                return {
                    ok: true,
                    source: 'cloud',
                    synced: true,
                    data: data,
                    professores: professores,
                    schoolId: ready.schoolId,
                    year: year
                };
            }

            // Cloud vazio: sobe o mapa local (bootstrap)
            if (localData.length) {
                return persist(localData, localProfs, { year: year, replace: true }).then(function (pushRes) {
                    return {
                        ok: true,
                        source: 'local_bootstrapped',
                        synced: !!(pushRes && pushRes.ok),
                        message: pushRes && pushRes.message,
                        data: localData,
                        professores: localProfs,
                        schoolId: ready.schoolId,
                        year: year
                    };
                });
            }

            return {
                ok: true,
                source: 'empty',
                synced: true,
                data: [],
                professores: cloudProfs.length ? cloudProfs : localProfs,
                schoolId: ready.schoolId,
                year: year
            };
        });
    }

    function upsertProfessores(sb, schoolId, professores) {
        var rows = (professores || [])
            .map(function (p) {
                var mat = matriculaBase(p.matricula);
                if (!mat) return null;
                var nome = String(p.nome || '').trim();
                if (!nome || nome === '-') return null;
                var cargo = String(p.cargo || 'PROFESSOR').toUpperCase();
                if (cargo.indexOf('PROFESSORA') >= 0) cargo = 'PROFESSORA';
                else cargo = 'PROFESSOR';
                var vinculo = String(p.vinculo || 'EFETIVO').toUpperCase();
                if (vinculo.indexOf('TEMPOR') >= 0) vinculo = 'TEMPORÁRIO';
                else vinculo = 'EFETIVO';
                return {
                    school_id: schoolId,
                    full_name: nome,
                    matricula: mat,
                    matricula_dv: String(p.dv || matriculaDv(p.matricula) || '').trim() || null,
                    cargo: cargo,
                    vinculo: vinculo,
                    setor: String(p.setor || '').trim() || null,
                    status: 'Ativo'
                };
            })
            .filter(Boolean);

        if (!rows.length) {
            return Promise.resolve({ ok: true, byMatricula: {} });
        }

        return sb.from('lotacao_professores')
            .upsert(rows, { onConflict: 'school_id,matricula' })
            .select('id,matricula,full_name')
            .then(function (res) {
                if (res.error) {
                    return { ok: false, message: res.error.message, byMatricula: {} };
                }
                var byMatricula = {};
                (res.data || []).forEach(function (r) {
                    byMatricula[String(r.matricula)] = r.id;
                });
                // Garante mapa completo (upsert pode não retornar todos em alguns casos)
                return sb.from('lotacao_professores')
                    .select('id,matricula')
                    .eq('school_id', schoolId)
                    .then(function (all) {
                        if (!all.error && all.data) {
                            all.data.forEach(function (r) {
                                byMatricula[String(r.matricula)] = r.id;
                            });
                        }
                        return { ok: true, byMatricula: byMatricula };
                    });
            });
    }

    function mapLocalRowToCloud(item, schoolId, year, sortOrder, professorIdByMat) {
        var vacant = isVacantProfessor(item.professor);
        var mat = matriculaBase(item.matricula);
        var professorId = (!vacant && mat && professorIdByMat[mat]) ? professorIdByMat[mat] : null;
        return {
            school_id: schoolId,
            year_number: toNumber(item.ano) || year || DEFAULT_YEAR,
            oferta: toNumber(item.oferta),
            modalidade: String(item.modal || 'REG').trim() || 'REG',
            turno: String(item.turno || '').trim() || 'MANHÃ',
            turma_code: String(item.turma || '').trim().toUpperCase(),
            num_alunos: toNumber(item.num_alunos),
            disciplina: String(item.disciplina || '').trim(),
            disciplina_codigo: String(item.codigo || '').trim() || null,
            ch_disciplina: toNumber(item.ch_disciplina),
            professor_id: professorId,
            professor_nome: vacant ? null : String(item.professor || '').trim(),
            professor_matricula: vacant ? null : String(item.matricula || '').trim(),
            ch_professor: toNumber(item.ch_professor),
            sort_order: sortOrder
        };
    }

    function persist(data, professores, options) {
        var opts = options || {};
        var ready = cloudReady();
        if (!ready.ok) {
            return Promise.resolve({ ok: false, reason: ready.reason, message: ready.message });
        }

        var year = opts.year || inferYear(data);
        var rows = Array.isArray(data) ? data : [];
        var profs = Array.isArray(professores) ? professores : buildProfessoresFromMapa(rows, readLocalProfessores());

        writeLocal(rows, profs);

        var run = upsertProfessores(ready.sb, ready.schoolId, profs).then(function (profRes) {
            if (!profRes.ok) {
                return { ok: false, reason: 'professores', message: profRes.message || 'Falha ao salvar professores.' };
            }

            var del = ready.sb.from('lotacao_alocacoes')
                .delete()
                .eq('school_id', ready.schoolId)
                .eq('year_number', year);

            var payload = rows
                .map(function (item, idx) {
                    return mapLocalRowToCloud(item, ready.schoolId, year, idx, profRes.byMatricula || {});
                })
                .filter(function (r) {
                    return r.turma_code && r.disciplina;
                });

            // Preferência: RPC atômica (19d). Fallback: delete + insert.
            var rpcPayload = payload.map(function (r) {
                return {
                    oferta: r.oferta,
                    modalidade: r.modalidade,
                    turno: r.turno,
                    turma_code: r.turma_code,
                    num_alunos: r.num_alunos,
                    disciplina: r.disciplina,
                    disciplina_codigo: r.disciplina_codigo,
                    ch_disciplina: r.ch_disciplina,
                    professor_nome: r.professor_nome,
                    professor_matricula: r.professor_matricula,
                    ch_professor: r.ch_professor,
                    sort_order: r.sort_order
                };
            });

            return ready.sb.rpc('lotacao_replace_mapa', {
                p_school_id: ready.schoolId,
                p_year: year,
                p_alocacoes: rpcPayload
            }).then(function (rpcRes) {
                if (!rpcRes.error) {
                    return {
                        ok: true,
                        count: typeof rpcRes.data === 'number' ? rpcRes.data : payload.length,
                        year: year,
                        schoolId: ready.schoolId,
                        via: 'rpc'
                    };
                }

                return del.then(function (delRes) {
                    if (delRes.error) {
                        return { ok: false, reason: 'delete', message: delRes.error.message };
                    }
                    if (!payload.length) {
                        return { ok: true, count: 0, year: year, schoolId: ready.schoolId, via: 'direct' };
                    }
                    var chunks = chunkArray(payload, CHUNK);
                    var chain = Promise.resolve({ ok: true });
                    chunks.forEach(function (chunk) {
                        chain = chain.then(function (prev) {
                            if (!prev.ok) return prev;
                            return ready.sb.from('lotacao_alocacoes').insert(chunk).then(function (ins) {
                                if (ins.error) {
                                    return { ok: false, reason: 'insert', message: ins.error.message };
                                }
                                return { ok: true };
                            });
                        });
                    });
                    return chain.then(function (finalRes) {
                        if (!finalRes.ok) return finalRes;
                        return { ok: true, count: payload.length, year: year, schoolId: ready.schoolId, via: 'direct' };
                    });
                });
            });
        }).catch(function (err) {
            return { ok: false, reason: 'network', message: (err && err.message) || 'Falha de rede ao sincronizar lotação.' };
        });

        persistInFlight = run;
        return run.finally(function () {
            if (persistInFlight === run) persistInFlight = null;
        });
    }

    function persistDebounced(data, professores, options) {
        var delay = (options && options.delay) || 900;
        return new Promise(function (resolve) {
            if (persistTimer) clearTimeout(persistTimer);
            persistTimer = setTimeout(function () {
                persist(data, professores, options).then(resolve);
            }, delay);
        });
    }

    /** Linhas no formato do app (turma/disciplina/professor) — prioriza cloud. */
    function ensureRows(options) {
        return hydrate(options || {}).then(function (res) {
            return res.data || [];
        });
    }

    global.SigaLotacaoSync = {
        cloudReady: cloudReady,
        readLocalData: readLocalData,
        readLocalProfessores: readLocalProfessores,
        writeLocal: writeLocal,
        hydrate: hydrate,
        persist: persist,
        persistDebounced: persistDebounced,
        ensureRows: ensureRows,
        fetchCloudMapa: fetchCloudMapa,
        DEFAULT_YEAR: DEFAULT_YEAR
    };
})(typeof window !== 'undefined' ? window : this);
