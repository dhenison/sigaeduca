/**
 * SIGA EDUCA — sync Turmas/Alunos com Supabase (public.classes / public.students)
 * Mantém espelho em localStorage (siga_classes / siga_students) para a UI atual.
 */
(function (global) {
    'use strict';

    var CLASSES_KEY = 'siga_classes';
    var STUDENTS_KEY = 'siga_students';
    var ACTIVE_SCHOOL_KEY = 'siga_active_school';
    var CHUNK = 80;

    function getClient() {
        if (!global.SigaSupabase || !global.SigaSupabase.isConfigured || !global.SigaSupabase.isConfigured()) {
            return null;
        }
        return global.SigaSupabase.getClient();
    }

    function getActiveSchoolId() {
        try {
            return localStorage.getItem(ACTIVE_SCHOOL_KEY) || '';
        } catch (e) {
            return '';
        }
    }

    function cloudReady() {
        var sb = getClient();
        var schoolId = getActiveSchoolId();
        if (!sb) return { ok: false, reason: 'not_configured', message: 'Supabase não configurado.' };
        if (!schoolId) return { ok: false, reason: 'no_school', message: 'Nenhuma escola ativa. Acesse o Painel Admin e entre na escola.' };
        return { ok: true, sb: sb, schoolId: schoolId };
    }

    function chunkArray(arr, size) {
        var out = [];
        for (var i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
        return out;
    }

    function normalizeTurno(raw) {
        var t = String(raw || '').trim().toLowerCase()
            .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        if (t.startsWith('manh') || t === 'matutino') return 'Manhã';
        if (t.startsWith('tard') || t === 'vespertino') return 'Tarde';
        if (t.startsWith('noit') || t === 'noturno') return 'Noite';
        if (t.startsWith('integ')) return 'Integral';
        var original = String(raw || '').trim();
        if (['Manhã', 'Tarde', 'Noite', 'Integral'].indexOf(original) >= 0) return original;
        return 'Manhã';
    }

    function normalizeStatusClass(raw) {
        var s = String(raw || '').trim();
        if (!s || /ativo|active/i.test(s)) return 'Ativo';
        return 'Inativo';
    }

    function normalizeStatusStudent(raw) {
        var s = String(raw || '').trim();
        if (/transfer/i.test(s)) return 'Transferido';
        if (/inativ/i.test(s)) return 'Inativo';
        return 'Ativo';
    }

    function nullIfEmpty(v) {
        var s = v == null ? '' : String(v).trim();
        return s ? s : null;
    }

    function parseAge(v) {
        if (v == null || v === '') return null;
        var n = parseInt(String(v).replace(/\D/g, ''), 10);
        return Number.isFinite(n) ? n : null;
    }

    function parseAttendance(v) {
        var n = Number(v);
        if (!Number.isFinite(n)) return 100;
        if (n < 0) return 0;
        if (n > 100) return 100;
        return n;
    }

    function classToRow(schoolId, c) {
        return {
            school_id: schoolId,
            code: String(c.code || '').trim(),
            serie: String(c.serie || '').trim() || '1º ano do ensino médio',
            turno: normalizeTurno(c.turno),
            modalidade: nullIfEmpty(c.modalidade),
            status: normalizeStatusClass(c.status),
            year_label: String(c.anoLetivo || c.year_label || '2026').trim() || '2026',
            capacity: Math.min(200, Math.max(1, parseInt(c.capacity, 10) || 35)),
            notes: nullIfEmpty(c.notes)
        };
    }

    function rowToClass(row) {
        return {
            id: row.id,
            code: row.code,
            serie: row.serie,
            turno: row.turno,
            modalidade: row.modalidade || '',
            status: row.status || 'Ativo',
            anoLetivo: row.year_label || '2026',
            capacity: row.capacity || 35
        };
    }

    function studentToRow(schoolId, s) {
        var birth = nullIfEmpty(s.dataNascimento || s.birth_date);
        if (birth && !/^\d{4}-\d{2}-\d{2}$/.test(birth)) birth = null;
        var hash = nullIfEmpty(s.senha || s.password_hash);
        return {
            school_id: schoolId,
            codigo_inep: nullIfEmpty(s.codigoInep),
            full_name: String(s.nome || s.full_name || '').trim(),
            cpf: nullIfEmpty(String(s.cpf || '').replace(/\D/g, '')),
            serie: nullIfEmpty(s.serie),
            class_code: nullIfEmpty(s.turma || s.class_code),
            turno: nullIfEmpty(s.turno) ? normalizeTurno(s.turno) : null,
            birth_date: birth,
            age: parseAge(s.idade != null ? s.idade : s.age),
            email: nullIfEmpty(s.email),
            password_hash: hash,
            needs_password_set: s.precisaDefinirSenha !== false && !hash,
            guardian_name: nullIfEmpty(s.responsavel || s.guardian_name),
            guardian_contact: nullIfEmpty(s.contato || s.guardian_contact),
            school_route: nullIfEmpty(s.rotaEscolar || s.school_route),
            status: normalizeStatusStudent(s.status),
            attendance_pct: parseAttendance(s.frequencia != null ? s.frequencia : s.attendance_pct),
            avatar_url: nullIfEmpty(s.avatar || s.avatar_url),
            class_history: Array.isArray(s.classHistory) ? s.classHistory : (s.class_history || [])
        };
    }

    function rowToStudent(row) {
        return {
            id: row.id,
            codigoInep: row.codigo_inep || '',
            nome: row.full_name || '',
            cpf: row.cpf || '',
            serie: row.serie || '',
            turma: row.class_code || '',
            turno: row.turno || '',
            dataNascimento: row.birth_date || '',
            idade: row.age != null ? String(row.age) : '',
            email: row.email || '',
            senha: row.password_hash || '',
            precisaDefinirSenha: row.needs_password_set !== false,
            responsavel: row.guardian_name || '',
            contato: row.guardian_contact || '',
            rotaEscolar: row.school_route || '',
            status: row.status || 'Ativo',
            frequencia: row.attendance_pct != null ? Number(row.attendance_pct) : 100,
            avatar: row.avatar_url || '',
            classHistory: Array.isArray(row.class_history) ? row.class_history : []
        };
    }

    function saveLocalClasses(list) {
        localStorage.setItem(CLASSES_KEY, JSON.stringify(list || []));
    }

    function saveLocalStudents(list) {
        localStorage.setItem(STUDENTS_KEY, JSON.stringify(list || []));
    }

    function fetchClasses(schoolId) {
        var ready = cloudReady();
        if (!ready.ok) return Promise.resolve({ ok: false, reason: ready.reason, message: ready.message, data: [] });
        var sid = schoolId || ready.schoolId;
        return ready.sb.from('classes')
            .select('*')
            .eq('school_id', sid)
            .order('code', { ascending: true })
            .then(function (res) {
                if (res.error) {
                    return { ok: false, reason: 'query_error', message: res.error.message, data: [] };
                }
                var mapped = (res.data || []).map(rowToClass);
                saveLocalClasses(mapped);
                return { ok: true, data: mapped };
            });
    }

    function fetchStudents(schoolId) {
        var ready = cloudReady();
        if (!ready.ok) return Promise.resolve({ ok: false, reason: ready.reason, message: ready.message, data: [] });
        var sid = schoolId || ready.schoolId;
        return ready.sb.from('students')
            .select('*')
            .eq('school_id', sid)
            .order('full_name', { ascending: true })
            .then(function (res) {
                if (res.error) {
                    return { ok: false, reason: 'query_error', message: res.error.message, data: [] };
                }
                var mapped = (res.data || []).map(rowToStudent);
                saveLocalStudents(mapped);
                return { ok: true, data: mapped };
            });
    }

    function upsertClasses(localClasses) {
        var ready = cloudReady();
        if (!ready.ok) return Promise.resolve({ ok: false, reason: ready.reason, message: ready.message });

        var rows = (localClasses || [])
            .map(function (c) { return classToRow(ready.schoolId, c); })
            .filter(function (r) { return r.code; });

        if (!rows.length) {
            return Promise.resolve({ ok: true, upserted: 0, message: 'Nenhuma turma para sincronizar.' });
        }

        var chunks = chunkArray(rows, CHUNK);
        var chain = Promise.resolve({ upserted: 0 });

        chunks.forEach(function (part) {
            chain = chain.then(function (acc) {
                return ready.sb.from('classes')
                    .upsert(part, { onConflict: 'school_id,code,year_label' })
                    .select('id')
                    .then(function (res) {
                        if (res.error) throw res.error;
                        acc.upserted += (res.data || part).length;
                        return acc;
                    });
            });
        });

        return chain
            .then(function (acc) {
                return fetchClasses(ready.schoolId).then(function (loaded) {
                    return {
                        ok: true,
                        upserted: acc.upserted,
                        data: loaded.data || [],
                        message: 'Turmas sincronizadas no banco (' + acc.upserted + ').'
                    };
                });
            })
            .catch(function (err) {
                return {
                    ok: false,
                    reason: 'upsert_error',
                    message: (err && err.message) || 'Falha ao gravar turmas no Supabase.'
                };
            });
    }

    function matchExistingStudent(existingList, row) {
        var i;
        if (row.cpf) {
            for (i = 0; i < existingList.length; i++) {
                if (String(existingList[i].cpf || '') === row.cpf) return existingList[i];
            }
        }
        if (row.codigo_inep) {
            for (i = 0; i < existingList.length; i++) {
                if (String(existingList[i].codigo_inep || '') === row.codigo_inep) return existingList[i];
            }
        }
        if (row.email) {
            var em = String(row.email).toLowerCase();
            for (i = 0; i < existingList.length; i++) {
                if (String(existingList[i].email || '').toLowerCase() === em) return existingList[i];
            }
        }
        return null;
    }

    function upsertStudents(localStudents, options) {
        options = options || {};
        var replace = !!options.replace;
        var ready = cloudReady();
        if (!ready.ok) return Promise.resolve({ ok: false, reason: ready.reason, message: ready.message });

        var rows = (localStudents || [])
            .map(function (s) { return studentToRow(ready.schoolId, s); })
            .filter(function (r) { return r.full_name; });

        var start = Promise.resolve();
        if (replace) {
            start = ready.sb.from('students').delete().eq('school_id', ready.schoolId).then(function (res) {
                if (res.error) throw res.error;
            });
        }

        return start
            .then(function () {
                if (replace) {
                    if (!rows.length) return { inserted: 0, updated: 0 };
                    var chunks = chunkArray(rows, CHUNK);
                    var inserted = 0;
                    var chain = Promise.resolve();
                    chunks.forEach(function (part) {
                        chain = chain.then(function () {
                            return ready.sb.from('students').insert(part).select('id').then(function (res) {
                                if (res.error) throw res.error;
                                inserted += (res.data || part).length;
                            });
                        });
                    });
                    return chain.then(function () { return { inserted: inserted, updated: 0 }; });
                }

                return ready.sb.from('students').select('*').eq('school_id', ready.schoolId).then(function (res) {
                    if (res.error) throw res.error;
                    var existing = res.data || [];
                    var toInsert = [];
                    var updates = [];

                    rows.forEach(function (row) {
                        var found = matchExistingStudent(existing, row);
                        if (found) {
                            updates.push({ id: found.id, patch: row });
                        } else {
                            toInsert.push(row);
                        }
                    });

                    var chain = Promise.resolve({ inserted: 0, updated: 0 });

                    chunkArray(toInsert, CHUNK).forEach(function (part) {
                        if (!part.length) return;
                        chain = chain.then(function (acc) {
                            return ready.sb.from('students').insert(part).select('id').then(function (ins) {
                                if (ins.error) throw ins.error;
                                acc.inserted += (ins.data || part).length;
                                return acc;
                            });
                        });
                    });

                    updates.forEach(function (u) {
                        chain = chain.then(function (acc) {
                            return ready.sb.from('students').update(u.patch).eq('id', u.id).then(function (up) {
                                if (up.error) throw up.error;
                                acc.updated += 1;
                                return acc;
                            });
                        });
                    });

                    return chain;
                });
            })
            .then(function (stats) {
                return fetchStudents(ready.schoolId).then(function (loaded) {
                    return {
                        ok: true,
                        inserted: stats.inserted || 0,
                        updated: stats.updated || 0,
                        data: loaded.data || [],
                        message: 'Alunos sincronizados no banco (' +
                            ((stats.inserted || 0) + (stats.updated || 0)) + ').'
                    };
                });
            })
            .catch(function (err) {
                return {
                    ok: false,
                    reason: 'upsert_error',
                    message: (err && err.message) || 'Falha ao gravar alunos no Supabase.'
                };
            });
    }

    /** Carrega turmas do banco para o cache local (se possível). */
    function hydrateClasses() {
        return fetchClasses().then(function (res) {
            if (!res.ok && res.reason === 'not_configured') {
                return { ok: true, skipped: true, data: JSON.parse(localStorage.getItem(CLASSES_KEY) || '[]') };
            }
            if (!res.ok && res.reason === 'no_school') {
                return { ok: true, skipped: true, data: JSON.parse(localStorage.getItem(CLASSES_KEY) || '[]'), message: res.message };
            }
            return res;
        });
    }

    function hydrateStudents() {
        return fetchStudents().then(function (res) {
            if (!res.ok && res.reason === 'not_configured') {
                return { ok: true, skipped: true, data: JSON.parse(localStorage.getItem(STUDENTS_KEY) || '[]') };
            }
            if (!res.ok && res.reason === 'no_school') {
                return { ok: true, skipped: true, data: JSON.parse(localStorage.getItem(STUDENTS_KEY) || '[]'), message: res.message };
            }
            return res;
        });
    }

    global.SigaSchoolData = {
        cloudReady: cloudReady,
        getActiveSchoolId: getActiveSchoolId,
        fetchClasses: fetchClasses,
        fetchStudents: fetchStudents,
        upsertClasses: upsertClasses,
        upsertStudents: upsertStudents,
        hydrateClasses: hydrateClasses,
        hydrateStudents: hydrateStudents,
        classToRow: classToRow,
        studentToRow: studentToRow
    };
})(typeof window !== 'undefined' ? window : this);
