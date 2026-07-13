/**
 * SIGA EDUCA — sync Usuários ↔ public.school_staff (+ Auth)
 */
(function (global) {
    'use strict';

    var USERS_KEY = 'siga_users';
    var ACTIVE_SCHOOL_KEY = 'siga_active_school';

    function getClient() {
        if (!global.SigaSupabase || !global.SigaSupabase.isConfigured || !global.SigaSupabase.isConfigured()) {
            return null;
        }
        return global.SigaSupabase.getClient();
    }

    function getConfig() {
        return global.SIGA_SUPABASE_CONFIG || null;
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
        if (!sb) return { ok: false, reason: 'not_configured', message: 'Supabase não configurado.' };
        if (!schoolId) {
            return {
                ok: false,
                reason: 'no_school',
                message: 'Nenhuma escola ativa. Acesse o Painel Admin e entre na escola antes de cadastrar usuários.'
            };
        }
        return { ok: true, sb: sb, schoolId: schoolId };
    }

    function nullIfEmpty(v) {
        var s = v == null ? '' : String(v).trim();
        return s ? s : null;
    }

    function staffToRow(schoolId, u) {
        return {
            school_id: schoolId,
            full_name: String(u.nome || u.full_name || '').trim(),
            email: String(u.email || '').trim().toLowerCase(),
            role: String(u.cargo || u.funcao || u.role || 'servidor').trim(),
            employee_id: String(u.matriculaSemVinculo || u.matricula || u.employee_id || '').trim(),
            subject: nullIfEmpty(u.disciplinaPrincipal || u.subject),
            phone: nullIfEmpty(u.telefone || u.phone),
            social: u.redes || u.social || {},
            lattes_url: nullIfEmpty(u.lattes || u.lattes_url),
            bio: nullIfEmpty(u.bio),
            avatar_url: nullIfEmpty(u.avatar || u.avatar_url),
            status: String(u.status || 'Ativo'),
            password_hash: nullIfEmpty(u.senha || u.password_hash),
            needs_password_set: !(u.senha || u.password_hash) || !!u.precisaDefinirSenha
        };
    }

    function rowToStaff(row) {
        return {
            id: row.id,
            nome: row.full_name || '',
            cargo: row.role || '',
            funcao: row.role || '',
            matriculaSemVinculo: row.employee_id || '',
            email: row.email || '',
            disciplinaPrincipal: row.subject || '',
            telefone: row.phone || '',
            redes: row.social || {},
            lattes: row.lattes_url || '',
            bio: row.bio || '',
            avatar: row.avatar_url || '',
            status: row.status || 'Ativo',
            senha: row.password_hash || '',
            precisaDefinirSenha: row.needs_password_set !== false && !row.password_hash,
            lastAccess: row.last_access_at || '—',
            userId: row.user_id || null,
            schoolId: row.school_id || null,
            cloudSynced: true
        };
    }

    function saveLocalUsers(list) {
        localStorage.setItem(USERS_KEY, JSON.stringify(list || []));
    }

    function fetchStaff(schoolId) {
        var ready = cloudReady();
        if (!ready.ok) {
            return Promise.resolve({
                ok: false,
                reason: ready.reason,
                message: ready.message,
                data: JSON.parse(localStorage.getItem(USERS_KEY) || '[]')
            });
        }
        var sid = schoolId || ready.schoolId;
        return ready.sb.from('school_staff')
            .select('*')
            .eq('school_id', sid)
            .order('full_name', { ascending: true })
            .range(0, 4999)
            .then(function (res) {
                if (res.error) {
                    return { ok: false, reason: 'query_error', message: res.error.message, data: [] };
                }
                var mapped = (res.data || []).map(rowToStaff);
                saveLocalUsers(mapped);
                return { ok: true, data: mapped };
            });
    }

    /** Cria usuário no Auth sem trocar a sessão do admin */
    function createAuthUserEphemeral(email, password, fullName) {
        var cfg = getConfig();
        if (!cfg || !cfg.url || !cfg.anonKey || !global.supabase) {
            return Promise.resolve({ ok: false, reason: 'not_configured', message: 'Supabase não configurado.' });
        }

        var memory = {
            getItem: function () { return null; },
            setItem: function () {},
            removeItem: function () {}
        };

        var temp = global.supabase.createClient(cfg.url, cfg.anonKey, {
            auth: {
                persistSession: false,
                autoRefreshToken: false,
                detectSessionInUrl: false,
                storage: memory
            }
        });

        return temp.auth.signUp({
            email: email,
            password: password,
            options: {
                data: { full_name: fullName || '' },
                emailRedirectTo: undefined
            }
        }).then(function (res) {
            if (res.error) {
                var msg = res.error.message || 'Falha ao criar login Auth.';
                // Usuário já existe — tenta obter via signIn temporário
                if (/already|registered|exists/i.test(msg)) {
                    return temp.auth.signInWithPassword({ email: email, password: password })
                        .then(function (loginRes) {
                            if (loginRes.error) {
                                return {
                                    ok: false,
                                    reason: 'auth_exists',
                                    message: 'E-mail já existe no Auth. Confira a senha ou redefina no Supabase Authentication.',
                                    error: loginRes.error
                                };
                            }
                            var user = loginRes.data && loginRes.data.user;
                            return temp.auth.signOut().catch(function () {}).then(function () {
                                return { ok: true, userId: user && user.id, existed: true };
                            });
                        });
                }
                return { ok: false, reason: 'auth_error', message: msg, error: res.error };
            }
            var user = res.data && res.data.user;
            if (!user || !user.id) {
                return {
                    ok: false,
                    reason: 'no_user',
                    message: 'Auth não retornou o usuário. Verifique se o cadastro por e-mail está habilitado no Supabase.'
                };
            }
            return { ok: true, userId: user.id, existed: false };
        }).catch(function (err) {
            return {
                ok: false,
                reason: 'auth_error',
                message: (err && err.message) || 'Falha ao criar usuário Auth.'
            };
        });
    }

    function linkAuthUser(staffId, authUserId) {
        var ready = cloudReady();
        if (!ready.ok) return Promise.resolve(ready);
        return ready.sb.rpc('link_staff_auth_user', {
            p_staff_id: staffId,
            p_auth_user_id: authUserId
        }).then(function (res) {
            if (res.error) {
                // Fallback manual se RPC ainda não existir
                return ready.sb.from('school_staff')
                    .update({ user_id: authUserId })
                    .eq('id', staffId)
                    .then(function (up) {
                        if (up.error) {
                            return { ok: false, message: up.error.message };
                        }
                        return { ok: true, fallback: true };
                    });
            }
            return { ok: true };
        });
    }

    /**
     * Upsert school_staff + cria Auth (senha em claro) + vincula membership.
     * @param {object} localUser - objeto da UI (nome, email, senha hash, …)
     * @param {object} options - { plainPassword?: string }
     */
    function upsertStaff(localUser, options) {
        options = options || {};
        var ready = cloudReady();
        if (!ready.ok) return Promise.resolve(ready);

        var row = staffToRow(ready.schoolId, localUser);
        if (!row.full_name || !row.email || !row.employee_id) {
            return Promise.resolve({ ok: false, message: 'Dados incompletos para gravar no banco.' });
        }

        var isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(localUser.id || ''));

        var writePromise = ready.sb.from('school_staff')
            .select('id')
            .eq('school_id', ready.schoolId)
            .eq('email', row.email)
            .maybeSingle()
            .then(function (found) {
                if (found.error) throw found.error;
                if (found.data && found.data.id) {
                    return ready.sb.from('school_staff')
                        .update(row)
                        .eq('id', found.data.id)
                        .select('*')
                        .single();
                }
                if (isUuid) {
                    return ready.sb.from('school_staff')
                        .update(row)
                        .eq('id', localUser.id)
                        .select('*')
                        .maybeSingle()
                        .then(function (up) {
                            if (up.data) return up;
                            return ready.sb.from('school_staff').insert(row).select('*').single();
                        });
                }
                return ready.sb.from('school_staff').insert(row).select('*').single();
            });

        return writePromise
            .then(function (res) {
                if (res.error) throw res.error;
                var saved = res.data;
                if (!saved) throw new Error('Banco não retornou o colaborador salvo.');

                var mapped = rowToStaff(saved);
                // Atualiza cache local (substitui id local pelo UUID)
                var list = [];
                try { list = JSON.parse(localStorage.getItem(USERS_KEY) || '[]') || []; } catch (e) { list = []; }
                var replaced = false;
                list = list.map(function (u) {
                    if (String(u.id) === String(localUser.id) || String(u.email || '').toLowerCase() === row.email) {
                        replaced = true;
                        return Object.assign({}, u, mapped, {
                            senha: localUser.senha || mapped.senha,
                            precisaDefinirSenha: false
                        });
                    }
                    return u;
                });
                if (!replaced) list.push(Object.assign({}, localUser, mapped));
                saveLocalUsers(list);

                var authStep = Promise.resolve({ ok: true, skipped: true });
                if (options.plainPassword && options.plainPassword.length >= 6) {
                    authStep = createAuthUserEphemeral(row.email, options.plainPassword, row.full_name)
                        .then(function (authRes) {
                            if (!authRes.ok || !authRes.userId) return authRes;
                            return linkAuthUser(saved.id, authRes.userId).then(function (linkRes) {
                                return {
                                    ok: !!linkRes.ok,
                                    userId: authRes.userId,
                                    auth: authRes,
                                    link: linkRes,
                                    message: linkRes.ok
                                        ? 'Usuário Auth vinculado.'
                                        : ((linkRes && linkRes.message) || 'Staff salvo, mas vínculo Auth falhou.')
                                };
                            });
                        });
                }

                return authStep.then(function (authInfo) {
                    return {
                        ok: true,
                        data: mapped,
                        staffId: saved.id,
                        auth: authInfo,
                        message: authInfo && authInfo.ok === false
                            ? ('Salvo no banco. Login Auth: ' + (authInfo.message || 'pendente'))
                            : 'Usuário salvo no banco de dados.'
                    };
                });
            })
            .catch(function (err) {
                return {
                    ok: false,
                    reason: 'upsert_error',
                    message: (err && err.message) || 'Falha ao gravar usuário no Supabase.'
                };
            });
    }

    function deleteStaff(staffId) {
        var ready = cloudReady();
        if (!ready.ok) return Promise.resolve(ready);
        if (!staffId) return Promise.resolve({ ok: false, message: 'ID inválido.' });
        return ready.sb.from('school_staff').delete().eq('id', staffId).eq('school_id', ready.schoolId)
            .then(function (res) {
                if (res.error) {
                    return { ok: false, message: res.error.message };
                }
                return { ok: true };
            });
    }

    function hydrateStaff() {
        return fetchStaff().then(function (res) {
            if (!res.ok && (res.reason === 'not_configured' || res.reason === 'no_school')) {
                return {
                    ok: true,
                    skipped: true,
                    data: JSON.parse(localStorage.getItem(USERS_KEY) || '[]'),
                    message: res.message
                };
            }
            return res;
        });
    }

    /** Login fallback: valida hash no Postgres */
    function loginByHash(email, passwordHash) {
        var sb = getClient();
        if (!sb) {
            return Promise.resolve({ ok: false, reason: 'not_configured' });
        }
        return sb.rpc('staff_login_by_hash', {
            p_email: String(email || '').trim().toLowerCase(),
            p_password_hash: passwordHash
        }).then(function (res) {
            if (res.error) {
                return { ok: false, reason: 'rpc_error', message: res.error.message };
            }
            if (!res.data) {
                return { ok: false, reason: 'invalid', message: 'Servidor não encontrado ou senha incorreta.' };
            }
            return { ok: true, staff: res.data };
        }).catch(function (err) {
            return { ok: false, reason: 'rpc_error', message: (err && err.message) || 'Falha no login cloud.' };
        });
    }

    global.SigaStaffData = {
        cloudReady: cloudReady,
        getActiveSchoolId: getActiveSchoolId,
        fetchStaff: fetchStaff,
        hydrateStaff: hydrateStaff,
        upsertStaff: upsertStaff,
        deleteStaff: deleteStaff,
        loginByHash: loginByHash,
        createAuthUserEphemeral: createAuthUserEphemeral,
        staffToRow: staffToRow,
        rowToStaff: rowToStaff
    };
})(typeof window !== 'undefined' ? window : this);
