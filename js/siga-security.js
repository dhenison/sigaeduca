/**
 * SIGA EDUCA — helpers de segurança (cliente local)
 * Nota: hash no browser com salt fixo é mitigação até Auth no Supabase.
 * Não substitui autenticação servidor / RLS.
 */
(function (global) {
    'use strict';

    var SESSION_KEY = 'siga_session';
    var USERS_KEY = 'siga_users';
    var STUDENTS_KEY = 'siga_students';
    var HASH_PREFIX = 'sha256:';
    /** Salt de aplicação local — trocar/rotacionar quando migrar para Supabase Auth */
    var APP_SALT = 'siga-educa-local-v1';

    function escapeHtml(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function getSession() {
        try {
            return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null');
        } catch (e) {
            return null;
        }
    }

    function isSystemAdminSession(session) {
        session = session || getSession();
        if (!session) return false;
        var email = String(session.email || '').toLowerCase();
        if (email === 'sigaeduca@escola.seduc.pa.gov.br') return true;
        if (session.sistemaAdmin === true || session.tipo === 'sistema') return true;
        return /administrador do sistema/i.test(String(session.role || ''));
    }

    function isHashedPassword(stored) {
        return typeof stored === 'string' && stored.indexOf(HASH_PREFIX) === 0;
    }

    function toHex(buffer) {
        return Array.from(new Uint8Array(buffer))
            .map(function (b) { return b.toString(16).padStart(2, '0'); })
            .join('');
    }

    function hashPassword(plain) {
        var text = APP_SALT + '|' + String(plain || '');
        if (!global.crypto || !global.crypto.subtle) {
            return Promise.resolve(HASH_PREFIX + 'fallback_' + String(plain || '').length);
        }
        return global.crypto.subtle
            .digest('SHA-256', new TextEncoder().encode(text))
            .then(function (buf) {
                return HASH_PREFIX + toHex(buf);
            });
    }

    function verifyPassword(plain, stored) {
        stored = String(stored || '');
        if (!stored) return Promise.resolve(false);
        if (!isHashedPassword(stored)) {
            return Promise.resolve(String(plain || '') === stored);
        }
        return hashPassword(plain).then(function (h) {
            return h === stored;
        });
    }

    /** Migra senha em claro para hash após login/alteração bem-sucedidos */
    function upgradeStoredPassword(plain, stored) {
        if (isHashedPassword(stored)) return Promise.resolve(stored);
        return hashPassword(plain);
    }

    function isSystemAdminSession(session) {
        session = session || getSession();
        if (!session) return false;
        if (session.sistemaAdmin === true || session.tipo === 'sistema') return true;
        return /administrador do sistema/i.test(String(session.role || ''));
    }

    function pageName() {
        var path = String(global.location && global.location.pathname || '');
        var parts = path.split('/');
        var name = (parts[parts.length - 1] || '').toLowerCase();
        // Vercel cleanUrls: /login → "login" (sem .html)
        if (name.indexOf('.') === -1 && name) return name + '.html';
        return name;
    }

    function pageBase() {
        return pageName().replace(/\.html$/i, '');
    }

    function isPublicPage() {
        var base = pageBase();
        if (!base) return true;
        return (
            base === 'login' ||
            base === 'validar-documento' ||
            base === 'index'
        );
    }

    /**
     * Proteção de rota no cliente (até haver backend).
     * Páginas públicas: login, validação de documento, portal index.
     */
    function requireAuth(options) {
        options = options || {};
        if (global.__SIGA_STOP_REDIRECTS) return true;
        var path = String((global.location && global.location.pathname) || '').toLowerCase();
        var href = String((global.location && global.location.href) || '').toLowerCase();
        // Já estamos no login — nunca redirecionar de novo (evita loop)
        if (path.indexOf('login') !== -1 || href.indexOf('/login') !== -1) return true;
        if (isPublicPage()) return true;
        var session = getSession();
        if (!session || !session.email) {
            if (!options.silent) {
                global.location.replace('/login.html');
            }
            return false;
        }
        var base = pageBase();
        // Admin do sistema sem escola escolhida → sempre Painel Admin (nunca pular para o principal)
        if (isSystemAdminSession(session) && base !== 'paineladmin') {
            var hasSchool = false;
            try { hasSchool = !!localStorage.getItem('siga_active_school'); } catch (e) { /* ignore */ }
            if (!hasSchool) {
                global.location.replace('/paineladmin.html');
                return false;
            }
        }
        if (base === 'portal-aluno' && session.tipo !== 'aluno') {
            global.location.replace(isSystemAdminSession(session) ? '/paineladmin.html' : '/painelprincipal.html');
            return false;
        }
        // Alunos usam apenas o Portal do Aluno (sem Meu Perfil / foto / segurança de servidor)
        if (session.tipo === 'aluno' && base !== 'portal-aluno') {
            global.location.replace('/portal-aluno.html');
            return false;
        }
        return true;
    }

    function findUserPasswordForSession(session) {
        session = session || getSession();
        if (!session) return '';
        try {
            if (session.tipo === 'aluno') {
                var students = JSON.parse(localStorage.getItem(STUDENTS_KEY) || '[]') || [];
                var st = students.find(function (s) {
                    return String(s.id) === String(session.id) ||
                        String(s.email || '').toLowerCase() === String(session.email || '').toLowerCase();
                });
                return st ? (st.senha || '') : '';
            }
            var users = JSON.parse(localStorage.getItem(USERS_KEY) || '[]') || [];
            var u = users.find(function (x) {
                return String(x.id) === String(session.id) ||
                    String(x.email || '').toLowerCase() === String(session.email || '').toLowerCase();
            });
            return u ? (u.senha || '') : '';
        } catch (e) {
            return '';
        }
    }

    /**
     * Desbloqueio de chamada consolidada: exige sessão + senha do usuário logado.
     * Preferencialmente administrador do sistema ou cargos de gestão.
     */
    function canAttemptUnlock(session) {
        session = session || getSession();
        if (!session || session.tipo === 'aluno') return false;
        if (isSystemAdminSession(session)) return true;
        var role = String(session.role || '');
        return /diretor|vice|coordenador|secretari|administrador/i.test(role);
    }

    function verifyUnlockPassword(plain) {
        var session = getSession();
        if (!canAttemptUnlock(session)) {
            return Promise.resolve({ ok: false, reason: 'forbidden' });
        }
        var stored = findUserPasswordForSession(session);
        if (!stored) {
            return Promise.resolve({ ok: false, reason: 'no_password' });
        }
        return verifyPassword(plain, stored).then(function (ok) {
            return { ok: ok, reason: ok ? 'ok' : 'bad_password' };
        });
    }

    function logout() {
        try {
            localStorage.removeItem(SESSION_KEY);
            localStorage.removeItem('siga_supabase_profile');
        } catch (e) { /* ignore */ }
        var done = function () {
            global.location.replace('/login.html');
        };
        if (global.SigaSupabase && typeof global.SigaSupabase.signOut === 'function') {
            global.SigaSupabase.signOut().then(done).catch(done);
            return;
        }
        done();
    }

    global.sigaLogout = logout;

    global.SigaSecurity = {
        escapeHtml: escapeHtml,
        getSession: getSession,
        hashPassword: hashPassword,
        verifyPassword: verifyPassword,
        upgradeStoredPassword: upgradeStoredPassword,
        isHashedPassword: isHashedPassword,
        isSystemAdminSession: isSystemAdminSession,
        isPublicPage: isPublicPage,
        requireAuth: requireAuth,
        isSystemAdminSession: isSystemAdminSession,
        canAttemptUnlock: canAttemptUnlock,
        verifyUnlockPassword: verifyUnlockPassword,
        logout: logout,
        HASH_PREFIX: HASH_PREFIX
    };

    // Atalhos globais usados pelas páginas
    global.escapeHtml = escapeHtml;
    if (!global.getSigaSession) {
        global.getSigaSession = getSession;
    }
})(typeof window !== 'undefined' ? window : this);
