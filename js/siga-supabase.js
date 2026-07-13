/**
 * SIGA EDUCA — cliente Supabase (Auth + profiles)
 * Usa apenas a anon/publishable key. Nunca service_role.
 */
(function (global) {
    'use strict';

    var client = null;
    var PROFILE_CACHE_KEY = 'siga_supabase_profile';

    function getConfig() {
        return global.SIGA_SUPABASE_CONFIG || null;
    }

    function isConfigured() {
        var c = getConfig();
        return !!(c && c.url && c.anonKey && global.supabase && typeof global.supabase.createClient === 'function');
    }

    function getClient() {
        if (client) return client;
        if (!isConfigured()) return null;
        var c = getConfig();
        client = global.supabase.createClient(c.url, c.anonKey, {
            auth: {
                persistSession: true,
                autoRefreshToken: true,
                detectSessionInUrl: true,
                storage: global.localStorage
            }
        });
        return client;
    }

    function mapAuthError(err) {
        var msg = (err && (err.message || err.error_description || err.msg)) || 'Falha na autenticação.';
        var lower = String(msg).toLowerCase();
        if (lower.indexOf('invalid login') !== -1 || lower.indexOf('invalid credentials') !== -1) {
            return 'E-mail ou senha incorretos (Supabase).';
        }
        if (lower.indexOf('email not confirmed') !== -1) {
            return 'Confirme o e-mail no Supabase antes de entrar.';
        }
        return msg;
    }

    function saveProfileCache(profile) {
        try {
            if (profile) localStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify(profile));
            else localStorage.removeItem(PROFILE_CACHE_KEY);
        } catch (e) { /* ignore */ }
    }

    function getCachedProfile() {
        try {
            return JSON.parse(localStorage.getItem(PROFILE_CACHE_KEY) || 'null');
        } catch (e) {
            return null;
        }
    }

    function fetchProfile(userId) {
        var sb = getClient();
        if (!sb || !userId) return Promise.resolve(null);
        return sb.from('profiles').select('id,email,full_name,role,is_system_admin,school_id').eq('id', userId).maybeSingle()
            .then(function (res) {
                if (res.error) {
                    console.warn('[SIGA] profile fetch:', res.error.message);
                    return null;
                }
                saveProfileCache(res.data || null);
                return res.data || null;
            });
    }

    function signIn(email, password) {
        var sb = getClient();
        if (!sb) {
            return Promise.resolve({ ok: false, reason: 'not_configured', message: 'Supabase não configurado.' });
        }
        return sb.auth.signInWithPassword({ email: email, password: password })
            .then(function (res) {
                if (res.error) {
                    return { ok: false, reason: 'auth_error', message: mapAuthError(res.error), error: res.error };
                }
                var session = res.data && res.data.session;
                var user = res.data && res.data.user;
                if (!session || !user) {
                    return { ok: false, reason: 'no_session', message: 'Sessão Supabase não criada.' };
                }
                return fetchProfile(user.id).then(function (profile) {
                    return {
                        ok: true,
                        session: session,
                        user: user,
                        profile: profile
                    };
                });
            });
    }

    function signOut() {
        var sb = getClient();
        saveProfileCache(null);
        if (!sb) return Promise.resolve();
        return sb.auth.signOut().catch(function () { /* ignore */ });
    }

    function getSession() {
        var sb = getClient();
        if (!sb) return Promise.resolve(null);
        return sb.auth.getSession().then(function (res) {
            return (res.data && res.data.session) || null;
        });
    }

    function getUser() {
        var sb = getClient();
        if (!sb) return Promise.resolve(null);
        return sb.auth.getUser().then(function (res) {
            if (res.error) return null;
            return (res.data && res.data.user) || null;
        });
    }

    /** Sessão local SIGA a partir do usuário/perfil Supabase */
    function toSigaSession(user, profile) {
        var isAdmin = !!(profile && profile.is_system_admin);
        var role = isAdmin
            ? 'Administrador do Sistema'
            : ((profile && profile.role) || 'Servidor');
        return {
            tipo: isAdmin ? 'sistema' : 'servidor',
            id: user.id,
            nome: (profile && profile.full_name) || (user.email || '').split('@')[0],
            email: user.email,
            role: role,
            sistemaAdmin: isAdmin,
            authProvider: 'supabase',
            schoolId: profile && profile.school_id ? profile.school_id : null
        };
    }

    global.SigaSupabase = {
        isConfigured: isConfigured,
        getClient: getClient,
        signIn: signIn,
        signOut: signOut,
        getSession: getSession,
        getUser: getUser,
        fetchProfile: fetchProfile,
        getCachedProfile: getCachedProfile,
        toSigaSession: toSigaSession,
        PROFILE_CACHE_KEY: PROFILE_CACHE_KEY
    };
})(typeof window !== 'undefined' ? window : this);
