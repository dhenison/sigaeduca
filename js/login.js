// SIGA EDUCA — Autenticação (login + recuperar acesso)
(function () {
    'use strict';

    var DOMAIN_ALUNO = '@aluno.seduc.pa.gov.br';
    var DOMAIN_SERVIDOR = '@escola.seduc.pa.gov.br';
    var USERS_KEY = 'siga_users';
    var SESSION_KEY = 'siga_session';

    var recoverTipo = 'servidor';
    var pendingServidorId = null;
    var pendingAlunoId = null;

    function toast(msg, type) {
        if (typeof showToast === 'function') showToast(msg, type || 'success');
        else alert(msg);
    }

    function digits(v) {
        return String(v || '').replace(/\D/g, '');
    }

    function normEmail(v) {
        return String(v || '').trim().toLowerCase();
    }

    function parseBrDate(v) {
        var s = String(v || '').trim();
        if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
        var m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
        if (m) return m[3] + '-' + m[2] + '-' + m[1];
        return '';
    }

    function formatCpfInput(el) {
        var d = digits(el.value).slice(0, 11);
        var out = d;
        if (d.length > 9) out = d.slice(0, 3) + '.' + d.slice(3, 6) + '.' + d.slice(6, 9) + '-' + d.slice(9);
        else if (d.length > 6) out = d.slice(0, 3) + '.' + d.slice(3, 6) + '.' + d.slice(6);
        else if (d.length > 3) out = d.slice(0, 3) + '.' + d.slice(3);
        el.value = out;
    }

    function formatDateInput(el) {
        var d = digits(el.value).slice(0, 8);
        var out = d;
        if (d.length > 4) out = d.slice(0, 2) + '/' + d.slice(2, 4) + '/' + d.slice(4);
        else if (d.length > 2) out = d.slice(0, 2) + '/' + d.slice(2);
        el.value = out;
    }

    function sameDate(a, b) {
        var x = parseBrDate(a) || String(a || '').slice(0, 10);
        var y = parseBrDate(b) || String(b || '').slice(0, 10);
        return x && y && x === y;
    }

    function getUsers() {
        try {
            var list = JSON.parse(localStorage.getItem(USERS_KEY) || '[]');
            if (!Array.isArray(list)) list = [];
            if (!list.length) {
                list = [{
                    id: 'usr_admin',
                    nome: 'Administrador do Sistema',
                    email: 'admin' + DOMAIN_SERVIDOR,
                    senha: '',
                    cpf: '000.000.000-00',
                    dataNascimento: '1990-01-01',
                    matriculaSemVinculo: '100000',
                    cargo: 'Administrador do Sistema',
                    sistemaAdmin: true,
                    precisaDefinirSenha: true
                }];
                saveUsers(list);
            } else {
                var changed = false;
                list = list.map(function (u) {
                    if (u.id === 'usr_admin' || normEmail(u.email) === 'admin' + DOMAIN_SERVIDOR) {
                        if (u.sistemaAdmin && /administrador do sistema/i.test(u.cargo || '')) return u;
                        changed = true;
                        return Object.assign({}, u, {
                            cargo: 'Administrador do Sistema',
                            sistemaAdmin: true,
                            nome: 'Administrador do Sistema'
                        });
                    }
                    return u;
                });
                if (changed) saveUsers(list);
            }
            return list;
        } catch (e) {
            return [];
        }
    }

    function saveUsers(list) {
        localStorage.setItem(USERS_KEY, JSON.stringify(list || []));
    }

    function getStudents() {
        try { return JSON.parse(localStorage.getItem('siga_students') || '[]') || []; }
        catch (e) { return []; }
    }

    function saveStudents(list) {
        localStorage.setItem('siga_students', JSON.stringify(list || []));
    }

    function ensureAlunoEmail(student) {
        var email = normEmail(student.email);
        if (email.endsWith(DOMAIN_ALUNO)) return email;
        // gera a partir do nome se ainda não for institucional
        var base = (student.nome || 'aluno')
            .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '.')
            .replace(/^\.+|\.+$/g, '')
            .slice(0, 40) || 'aluno';
        return base + DOMAIN_ALUNO;
    }

    function setSession(session) {
        localStorage.setItem(SESSION_KEY, JSON.stringify(session));
        if (session.nome) localStorage.setItem('siga_profile_name', session.nome);
        if (session.role) localStorage.setItem('siga_profile_role', session.role);
        if (session.email) localStorage.setItem('siga_profile_email', session.email);
    }

    function isInstitutionalEmail(email) {
        email = normEmail(email);
        return email.endsWith(DOMAIN_ALUNO) || email.endsWith(DOMAIN_SERVIDOR);
    }

    /** Administrador do Sistema (e-mail global autorizado) */
    var SYSTEM_ADMIN_EMAILS = ['sigaeduca@escola.seduc.pa.gov.br'];

    function isSystemAdminEmail(email) {
        return SYSTEM_ADMIN_EMAILS.indexOf(normEmail(email)) !== -1;
    }

    function isAllowedLoginEmail(email) {
        return isInstitutionalEmail(email) || isSystemAdminEmail(email);
    }

    /** Destino obrigatório após login — admin do sistema SEMPRE paineladmin */
    function redirectAfterLogin(email, session) {
        email = normEmail(email);
        var goAdmin = isSystemAdminEmail(email) ||
            !!(session && (session.sistemaAdmin === true || session.tipo === 'sistema'));
        // Admin precisa escolher escola no Painel Admin — limpa contexto anterior
        if (goAdmin) {
            try {
                localStorage.removeItem('siga_active_school');
                localStorage.removeItem('siga_school_name');
            } catch (e) { /* ignore */ }
        }
        // Caminhos absolutos evitam erro de resolução em /login.html
        var dest = goAdmin ? '/paineladmin.html' : '/painelprincipal.html';
        try {
            sessionStorage.setItem('siga_post_login_dest', dest);
        } catch (e) { /* ignore */ }
        window.location.replace(dest);
    }

    function ensureSystemAdminLocalUser(email) {
        email = normEmail(email);
        if (!isSystemAdminEmail(email)) return;
        var list = getUsers();
        var idx = list.findIndex(function (u) { return normEmail(u.email) === email; });
        var row = {
            id: idx >= 0 ? list[idx].id : 'usr_sistema_admin',
            nome: 'Administrador do Sistema',
            email: email,
            senha: idx >= 0 ? (list[idx].senha || '') : '',
            cargo: 'Administrador do Sistema',
            sistemaAdmin: true,
            precisaDefinirSenha: idx >= 0 ? !!list[idx].precisaDefinirSenha && !list[idx].senha : true
        };
        if (idx >= 0) list[idx] = Object.assign({}, list[idx], row);
        else list.unshift(row);
        // também mantém o seed antigo alinhado
        list = list.map(function (u) {
            if (normEmail(u.email) === email) {
                return Object.assign({}, u, {
                    sistemaAdmin: true,
                    cargo: 'Administrador do Sistema',
                    nome: u.nome || 'Administrador do Sistema'
                });
            }
            return u;
        });
        saveUsers(list);
    }

    function doLogin(email, senha) {
        email = normEmail(email);
        senha = String(senha || '');
        var sec = window.SigaSecurity;

        if (!email || !senha) {
            toast('Informe o e-mail e a senha.', 'error');
            return;
        }
        if (!isAllowedLoginEmail(email)) {
            toast('Use e-mail institucional (@aluno.seduc.pa.gov.br / @escola.seduc.pa.gov.br) ou o e-mail do administrador do sistema.', 'error');
            return;
        }

        function verifyAndMaybeUpgrade(stored, onOk) {
            if (!sec) {
                if (String(stored || '') === senha) onOk(stored);
                else toast('Senha incorreta.', 'error');
                return;
            }
            sec.verifyPassword(senha, stored).then(function (ok) {
                if (!ok) {
                    toast('Senha incorreta.', 'error');
                    return;
                }
                sec.upgradeStoredPassword(senha, stored).then(onOk);
            });
        }

        if (email.endsWith(DOMAIN_ALUNO)) {
            if (window.SigaPortalAluno && typeof window.SigaPortalAluno.purgeDemoStudents === 'function') {
                window.SigaPortalAluno.purgeDemoStudents();
            }

            function isPortalBlockedStudent(aluno) {
                if (!aluno) return false;
                if (typeof window.isStudentTransferred === 'function') {
                    return window.isStudentTransferred(aluno);
                }
                if (String(aluno.status || '') === 'Transferido') return true;
                var turma = String(aluno.turma || '')
                    .normalize('NFD')
                    .replace(/[\u0300-\u036f]/g, '')
                    .toUpperCase()
                    .replace(/[^A-Z0-9]/g, '');
                return turma === 'TRANSFERENCIA';
            }

            function denyTransferredPortal() {
                toast('Acesso ao Portal do Aluno indisponível: aluno transferido.', 'error');
            }

            function finishAlunoLocal(aluno) {
                if (isPortalBlockedStudent(aluno)) {
                    denyTransferredPortal();
                    return;
                }
                verifyAndMaybeUpgrade(aluno.senha, function (hashed) {
                    if (hashed !== aluno.senha) {
                        saveStudents(getStudents().map(function (s) {
                            return String(s.id) === String(aluno.id)
                                ? Object.assign({}, s, { senha: hashed, precisaDefinirSenha: false })
                                : s;
                        }));
                    }
                    var schoolId = aluno.schoolId || aluno.school_id || null;
                    try {
                        var active = localStorage.getItem('siga_active_school');
                        if (!schoolId && active) schoolId = active;
                        if (schoolId) localStorage.setItem('siga_active_school', schoolId);
                    } catch (eSc) { /* ignore */ }
                    setSession({
                        tipo: 'aluno',
                        id: aluno.id,
                        nome: aluno.nome,
                        email: email,
                        role: 'Aluno',
                        schoolId: schoolId || null
                    });
                    try { localStorage.setItem('siga_portal_aluno_id', String(aluno.id)); } catch (eP) { /* ignore */ }
                    toast('Bem-vindo(a), ' + (aluno.nome || 'aluno') + '!');
                    setTimeout(function () {
                        window.location.href = 'portal-aluno.html';
                    }, 400);
                });
            }

            function finishAlunoCloud(payload) {
                if (isPortalBlockedStudent(payload) || String(payload.status || '') === 'Transferido') {
                    denyTransferredPortal();
                    return;
                }
                var local = {
                    id: payload.id,
                    nome: payload.nome || '',
                    // Portal sempre usa @aluno na sessão (mesmo se o cadastro veio com @escola)
                    email: email,
                    turma: payload.turma || '',
                    serie: payload.serie || '',
                    turno: payload.turno || '',
                    avatar: payload.avatar_url || '',
                    codigoInep: payload.codigo_inep || '',
                    cpf: payload.cpf || '',
                    dataNascimento: payload.birth_date || '',
                    contato: payload.guardian_contact || '',
                    responsavel: payload.guardian_name || '',
                    status: payload.status || 'Ativo',
                    schoolId: payload.school_id || null,
                    precisaDefinirSenha: false,
                    senha: '' // hash fica só no cloud após login RPC
                };
                if (window.SigaPortalAluno && typeof window.SigaPortalAluno.upsertLocalStudent === 'function') {
                    window.SigaPortalAluno.upsertLocalStudent(local);
                } else {
                    var list = getStudents();
                    var ix = list.findIndex(function (s) { return String(s.id) === String(local.id); });
                    if (ix >= 0) list[ix] = Object.assign({}, list[ix], local);
                    else list.unshift(local);
                    saveStudents(list);
                }
                if (local.schoolId) {
                    try { localStorage.setItem('siga_active_school', local.schoolId); } catch (e2) { /* ignore */ }
                }
                setSession({
                    tipo: 'aluno',
                    id: local.id,
                    nome: local.nome,
                    email: normEmail(local.email),
                    role: 'Aluno',
                    schoolId: local.schoolId || null,
                    authProvider: 'students'
                });
                try { localStorage.setItem('siga_portal_aluno_id', String(local.id)); } catch (e3) { /* ignore */ }
                toast('Bem-vindo(a), ' + (local.nome || 'aluno') + '!');
                setTimeout(function () {
                    window.location.href = 'portal-aluno.html';
                }, 400);
            }

            function tryCloudLogin() {
                var sb = window.SigaSupabase && typeof window.SigaSupabase.getClient === 'function'
                    ? window.SigaSupabase.getClient()
                    : null;
                if (!sb || !sec || typeof sec.hashPassword !== 'function') {
                    toast('Aluno não encontrado com este e-mail. Confirme o cadastro no SIGA EDUCA ou defina a senha em “Esqueci minha senha”.', 'error');
                    return;
                }
                sec.hashPassword(senha).then(function (hashed) {
                    return sb.rpc('student_login_by_hash', {
                        p_email: email,
                        p_password_hash: hashed
                    });
                }).then(function (res) {
                    if (res.error || !res.data) {
                        toast('Aluno não encontrado ou senha incorreta. Se for o primeiro acesso, use “Esqueci minha senha”.', 'error');
                        return;
                    }
                    finishAlunoCloud(res.data);
                }).catch(function () {
                    toast('Não foi possível autenticar no SIGA EDUCA. Tente novamente.', 'error');
                });
            }

            var students = getStudents().filter(function (s) {
                return s && !s._demo && String(s.id) !== 'aluno_andre_siga_demo';
            });
            var aluno = students.find(function (s) {
                return normEmail(s.email) === email || ensureAlunoEmail(s) === email;
            });
            if (!aluno) {
                tryCloudLogin();
                return;
            }
            if (normEmail(aluno.email) !== email) {
                aluno.email = email;
                saveStudents(getStudents().map(function (s) {
                    return String(s.id) === String(aluno.id) ? Object.assign({}, s, { email: email }) : s;
                }));
            }
            if (!aluno.senha || aluno.precisaDefinirSenha) {
                // Sem senha local — tenta cloud (aluno já definiu no servidor)
                tryCloudLogin();
                return;
            }
            if (!sec) {
                if (String(aluno.senha || '') === senha) finishAlunoLocal(aluno);
                else tryCloudLogin();
                return;
            }
            sec.verifyPassword(senha, aluno.senha).then(function (ok) {
                if (ok) finishAlunoLocal(aluno);
                else tryCloudLogin();
            });
            return;
        }

        // Servidor — tenta Supabase Auth primeiro, depois school_staff (RPC), depois localStorage
        function finishServidorLocal() {
            ensureSystemAdminLocalUser(email);
            var users = getUsers();
            var user = users.find(function (u) { return normEmail(u.email) === email; });
            if (!user) {
                toast('Servidor não encontrado com este e-mail.', 'error');
                return;
            }
            if (isSystemAdminEmail(email)) {
                user.sistemaAdmin = true;
                user.cargo = 'Administrador do Sistema';
            }
            if (user.precisaDefinirSenha || !user.senha) {
                toast('Defina sua senha em “Esqueci minha senha” antes de entrar.', 'error');
                return;
            }
            verifyAndMaybeUpgrade(user.senha, function (hashed) {
                if (hashed !== user.senha) {
                    var list = getUsers();
                    var i = list.findIndex(function (u) { return u.id === user.id; });
                    if (i >= 0) {
                        list[i].senha = hashed;
                        list[i].precisaDefinirSenha = false;
                        list[i].sistemaAdmin = !!user.sistemaAdmin || isSystemAdminEmail(email);
                        list[i].cargo = list[i].sistemaAdmin ? 'Administrador do Sistema' : list[i].cargo;
                        saveUsers(list);
                    }
                }
                var isAdmin = !!user.sistemaAdmin || isSystemAdminEmail(email) || /administrador do sistema/i.test(user.cargo || '');
                var session = {
                    tipo: isAdmin ? 'sistema' : 'servidor',
                    id: user.id,
                    nome: user.nome || (isAdmin ? 'Administrador do Sistema' : 'Servidor'),
                    email: email,
                    role: isAdmin ? 'Administrador do Sistema' : (user.cargo || 'Servidor'),
                    sistemaAdmin: isAdmin,
                    authProvider: 'local'
                };
                setSession(session);
                toast('Bem-vindo(a), ' + (session.nome || 'servidor') + '!');
                redirectAfterLogin(email, session);
            });
        }

        function finishServidorFromStaff(staff) {
            var isAdmin = isSystemAdminEmail(email) || /administrador do sistema/i.test(staff.role || '');
            var session = {
                tipo: isAdmin ? 'sistema' : 'servidor',
                id: staff.id,
                nome: staff.nome || 'Servidor',
                email: email,
                role: isAdmin ? 'Administrador do Sistema' : (staff.role || 'Servidor'),
                sistemaAdmin: isAdmin,
                authProvider: 'school_staff',
                schoolId: staff.school_id || null
            };
            // Cache local para páginas que ainda leem siga_users
            try {
                var list = getUsers();
                var idx = list.findIndex(function (u) { return normEmail(u.email) === email; });
                var cached = {
                    id: staff.id,
                    nome: staff.nome,
                    email: email,
                    cargo: staff.role,
                    funcao: staff.role,
                    matriculaSemVinculo: staff.employee_id || '',
                    avatar: staff.avatar_url || '',
                    status: 'Ativo',
                    precisaDefinirSenha: false,
                    senha: '' // não espelha hash no local após login cloud
                };
                if (idx >= 0) list[idx] = Object.assign({}, list[idx], cached);
                else list.push(cached);
                saveUsers(list);
            } catch (e) { /* ignore */ }

            if (staff.school_id) {
                try { localStorage.setItem('siga_active_school', staff.school_id); } catch (e2) { /* ignore */ }
            }
            setSession(session);
            localStorage.setItem('siga_profile_name', session.nome || '');
            localStorage.setItem('siga_profile_role', session.role || '');
            localStorage.setItem('siga_profile_email', email);
            try { localStorage.removeItem('siga_profile_avatar'); } catch (eAv) { /* ignore */ }
            var avatarVal = staff.avatar_url || staff.avatar || '';
            if (typeof writeStoredProfileAvatar === 'function') {
                writeStoredProfileAvatar(session, avatarVal);
            } else if (avatarVal) {
                try {
                    localStorage.setItem('siga_profile_avatar__email:' + email, avatarVal);
                } catch (eAv2) { /* ignore */ }
            }

            function go() {
                toast('Bem-vindo(a), ' + (session.nome || 'servidor') + '!');
                redirectAfterLogin(email, session);
            }

            var cloudBind = window.SigaSupabase;
            if (!isAdmin && staff.school_id && cloudBind && typeof cloudBind.bindActiveSchoolContext === 'function') {
                cloudBind.bindActiveSchoolContext(
                    { id: staff.user_id || staff.id, email: email },
                    { school_id: staff.school_id, full_name: staff.nome, role: staff.role },
                    session
                ).then(go).catch(go);
                return;
            }
            go();
        }

        function tryLocalLoginFallback(authErrorMessage) {
            // Sem RPC staff_login_by_hash (removido do anon): Auth é a fonte cloud.
            // Mantém só espelho localStorage para ambientes offline / demo.
            if (authErrorMessage) {
                console.info('[SIGA] Auth falhou; tentando usuários locais.', authErrorMessage);
            }
            ensureSystemAdminLocalUser(email);
            var users = getUsers();
            var user = users.find(function (u) { return normEmail(u.email) === email; });
            if (!user) {
                // Evita mensagem enganosa: o usuário existe no banco, mas Auth falhou
                toast(
                    authErrorMessage ||
                    'Não foi possível entrar. Verifique e-mail/senha ou se o acesso Auth está ativo.',
                    'error'
                );
                return;
            }
            finishServidorLocal();
        }

        var cloud = window.SigaSupabase;
        if (cloud && cloud.isConfigured && cloud.isConfigured()) {
            cloud.signIn(email, senha).then(function (result) {
                if (!result || !result.ok) {
                    var msg = (result && result.message) || 'E-mail ou senha incorretos no Authentication.';
                    if (isSystemAdminEmail(email)) {
                        toast(msg + ' Confira o usuário no Supabase Authentication.', 'error');
                    }
                    tryLocalLoginFallback(msg);
                    return;
                }
                var sigaSession = cloud.toSigaSession(result.user, result.profile);
                if (isSystemAdminEmail(email)) {
                    sigaSession.sistemaAdmin = true;
                    sigaSession.tipo = 'sistema';
                    sigaSession.role = 'Administrador do Sistema';
                    sigaSession.nome = sigaSession.nome || 'Administrador do Sistema';
                }
                setSession(sigaSession);
                localStorage.setItem('siga_profile_name', sigaSession.nome || '');
                localStorage.setItem('siga_profile_role', sigaSession.role || '');
                localStorage.setItem('siga_profile_email', sigaSession.email || email);
                try { localStorage.removeItem('siga_profile_avatar'); } catch (eAv3) { /* ignore */ }

                function finishCloudLogin() {
                    // Carrega avatar individual do school_staff (por e-mail)
                    var staffApi = window.SigaStaffData;
                    var loadAvatar = Promise.resolve();
                    if (!sigaSession.sistemaAdmin && staffApi && typeof staffApi.hydrateStaff === 'function') {
                        loadAvatar = staffApi.hydrateStaff().then(function () {
                            try {
                                var users = JSON.parse(localStorage.getItem('siga_users') || '[]') || [];
                                var mine = users.find(function (u) {
                                    return String(u.email || '').toLowerCase() === email;
                                });
                                var av = mine && mine.avatar ? mine.avatar : '';
                                if (typeof writeStoredProfileAvatar === 'function') {
                                    writeStoredProfileAvatar(sigaSession, av);
                                }
                            } catch (eH) { /* ignore */ }
                        }).catch(function () { /* ignore */ });
                    }
                    loadAvatar.then(function () {
                        toast('Bem-vindo(a), ' + (sigaSession.nome || 'servidor') + '!');
                        redirectAfterLogin(email, sigaSession);
                    });
                }

                // Servidor da escola: grava siga_active_school + metadados antes de ir ao painel
                if (!sigaSession.sistemaAdmin && cloud.bindActiveSchoolContext) {
                    cloud.bindActiveSchoolContext(result.user, result.profile, sigaSession)
                        .then(function (bound) {
                            if (bound && bound.schoolId) {
                                sigaSession.schoolId = bound.schoolId;
                                if (bound.schoolName) sigaSession.schoolName = bound.schoolName;
                                setSession(sigaSession);
                            } else {
                                console.warn('[SIGA] Login ok, mas nenhuma escola vinculada ao perfil/membership.');
                            }
                            finishCloudLogin();
                        })
                        .catch(function () {
                            finishCloudLogin();
                        });
                    return;
                }

                finishCloudLogin();
            }).catch(function (err) {
                tryLocalLoginFallback((err && err.message) || 'Falha de rede no Auth');
            });
            return;
        }

        tryLocalLoginFallback();
    }

    function openRecoverModal() {
        var modal = document.getElementById('modal-recuperar');
        if (!modal) return;
        modal.classList.remove('hidden');
        setRecoverTipo('servidor');
        clearRecoverForms();
        showRecoverStep('form');
    }

    function closeRecoverModal() {
        var modal = document.getElementById('modal-recuperar');
        if (modal) modal.classList.add('hidden');
        pendingServidorId = null;
        pendingAlunoId = null;
        clearRecoverForms();
    }

    function clearRecoverForms() {
        ['rec-matricula', 'rec-cpf-serv', 'rec-nasc-serv', 'rec-cpf-aluno', 'rec-nasc-aluno', 'rec-nova-senha', 'rec-confirma-senha']
            .forEach(function (id) {
                var el = document.getElementById(id);
                if (el) el.value = '';
            });
    }

    function setRecoverTipo(tipo) {
        recoverTipo = tipo === 'aluno' ? 'aluno' : 'servidor';
        var btnS = document.getElementById('tab-servidor');
        var btnA = document.getElementById('tab-aluno');
        var formS = document.getElementById('recover-form-servidor');
        var formA = document.getElementById('recover-form-aluno');
        if (btnS && btnA) {
            var on = 'flex-1 py-3 rounded-xl text-sm font-bold border-2 border-primary bg-primary/10 text-primary';
            var off = 'flex-1 py-3 rounded-xl text-sm font-bold border border-border-subtle bg-white text-text-secondary hover:bg-surface-container-low';
            btnS.className = recoverTipo === 'servidor' ? on : off;
            btnA.className = recoverTipo === 'aluno' ? on : off;
        }
        if (formS) formS.classList.toggle('hidden', recoverTipo !== 'servidor');
        if (formA) formA.classList.toggle('hidden', recoverTipo !== 'aluno');
        showRecoverStep('form');
    }

    function showRecoverStep(step) {
        ['recover-step-form', 'recover-step-servidor-senha', 'recover-step-aluno-creds'].forEach(function (id) {
            var el = document.getElementById(id);
            if (el) el.classList.add('hidden');
        });
        var map = {
            form: 'recover-step-form',
            servidorSenha: 'recover-step-servidor-senha',
            alunoCreds: 'recover-step-aluno-creds'
        };
        var target = document.getElementById(map[step] || 'recover-step-form');
        if (target) target.classList.remove('hidden');
    }

    function localizarAcesso() {
        if (recoverTipo === 'servidor') {
            var mat = String((document.getElementById('rec-matricula') || {}).value || '').trim();
            var cpf = digits((document.getElementById('rec-cpf-serv') || {}).value);
            var nasc = (document.getElementById('rec-nasc-serv') || {}).value;
            if (!mat || cpf.length !== 11 || !parseBrDate(nasc)) {
                toast('Informe Matrícula sem Vínculo, CPF e Data de Nascimento.', 'error');
                return;
            }
            var users = getUsers();
            var user = users.find(function (u) {
                return String(u.matriculaSemVinculo || '').trim() === mat &&
                    digits(u.cpf) === cpf &&
                    sameDate(u.dataNascimento, nasc);
            });
            if (!user) {
                toast('Servidor não encontrado. Verifique os dados informados.', 'error');
                return;
            }
            pendingServidorId = user.id;
            pendingAlunoId = null;
            var emailEl = document.getElementById('rec-servidor-email');
            if (emailEl) emailEl.textContent = user.email || ('—' + DOMAIN_SERVIDOR);
            var nomeEl = document.getElementById('rec-servidor-nome');
            if (nomeEl) nomeEl.textContent = user.nome || 'Servidor';
            showRecoverStep('servidorSenha');
            return;
        }

        // Aluno — localiza (local ou SIGA) e pede nova senha
        var cpfA = digits((document.getElementById('rec-cpf-aluno') || {}).value);
        var nascA = (document.getElementById('rec-nasc-aluno') || {}).value;
        var nascIso = parseBrDate(nascA);
        if (cpfA.length !== 11 || !nascIso) {
            toast('Informe CPF e Data de Nascimento.', 'error');
            return;
        }
        var students = getStudents();
        var aluno = students.find(function (s) {
            return digits(s.cpf) === cpfA && sameDate(s.dataNascimento, nascA);
        });

        function openAlunoSenhaStep(found) {
            if (typeof window.isStudentTransferred === 'function' && window.isStudentTransferred(found)) {
                toast('Aluno transferido: acesso ao Portal do Aluno indisponível.', 'error');
                return;
            }
            if (String(found.status || '') === 'Transferido') {
                toast('Aluno transferido: acesso ao Portal do Aluno indisponível.', 'error');
                return;
            }
            var email = ensureAlunoEmail(found);
            pendingAlunoId = found.id;
            pendingServidorId = null;
            var list = getStudents();
            var exists = list.some(function (s) { return String(s.id) === String(found.id); });
            if (!exists) {
                list.unshift(Object.assign({}, found, { email: email }));
            } else {
                list = list.map(function (s) {
                    if (String(s.id) !== String(found.id)) return s;
                    return Object.assign({}, s, { email: email, nome: found.nome || s.nome });
                });
            }
            saveStudents(list);
            var emailAlunoEl = document.getElementById('rec-aluno-email');
            if (emailAlunoEl) emailAlunoEl.textContent = email;
            var nomeAlunoEl = document.getElementById('rec-aluno-nome');
            if (nomeAlunoEl) nomeAlunoEl.textContent = found.nome || 'Aluno';
            var emailServ = document.getElementById('rec-servidor-email');
            if (emailServ) emailServ.textContent = email;
            var nomeServ = document.getElementById('rec-servidor-nome');
            if (nomeServ) nomeServ.textContent = found.nome || 'Aluno';
            showRecoverStep('servidorSenha');
        }

        if (aluno) {
            openAlunoSenhaStep(aluno);
            return;
        }

        var sb = window.SigaSupabase && typeof window.SigaSupabase.getClient === 'function'
            ? window.SigaSupabase.getClient()
            : null;
        if (!sb) {
            toast('Aluno não encontrado. Verifique os dados ou sincronize a escola no SIGA EDUCA.', 'error');
            return;
        }
        sb.rpc('student_lookup_by_identity', {
            p_cpf: cpfA,
            p_birth_date: nascIso
        }).then(function (res) {
            if (res.error || !res.data) {
                toast('Aluno não encontrado no SIGA EDUCA. Verifique CPF e data de nascimento.', 'error');
                return;
            }
            var d = res.data;
            openAlunoSenhaStep({
                id: d.id,
                nome: d.nome || '',
                email: d.email || '',
                turma: d.turma || '',
                avatar: d.avatar_url || '',
                schoolId: d.school_id || null,
                cpf: cpfA,
                dataNascimento: nascIso,
                precisaDefinirSenha: true
            });
        }).catch(function () {
            toast('Falha ao consultar o SIGA EDUCA. Tente novamente.', 'error');
        });
    }

    function salvarSenhaServidor() {
        var nova = String((document.getElementById('rec-nova-senha') || {}).value || '');
        var conf = String((document.getElementById('rec-confirma-senha') || {}).value || '');
        if (nova.length < 6) {
            toast('A senha deve ter pelo menos 6 caracteres.', 'error');
            return;
        }
        if (nova !== conf) {
            toast('As senhas não coincidem.', 'error');
            return;
        }
        var sec = window.SigaSecurity;

        function finish(email) {
            document.getElementById('username').value = email || '';
            document.getElementById('password').value = '';
            closeRecoverModal();
            toast('Senha definida! Entre com o e-mail institucional e a nova senha.');
        }

        if (pendingAlunoId) {
            var students = getStudents();
            var aidx = students.findIndex(function (s) { return String(s.id) === String(pendingAlunoId); });
            if (aidx < 0) {
                toast('Aluno não encontrado.', 'error');
                return;
            }
            var emailA = ensureAlunoEmail(students[aidx]);
            var applyAluno = function (hashed) {
                students[aidx].email = emailA;
                students[aidx].senha = hashed;
                students[aidx].precisaDefinirSenha = false;
                saveStudents(students);
                var sb = window.SigaSupabase && typeof window.SigaSupabase.getClient === 'function'
                    ? window.SigaSupabase.getClient()
                    : null;
                var cpfDigits = digits(students[aidx].cpf);
                var birth = parseBrDate(students[aidx].dataNascimento) || String(students[aidx].dataNascimento || '').slice(0, 10);
                function done() {
                    pendingAlunoId = null;
                    finish(emailA);
                }
                if (sb && cpfDigits.length === 11 && birth) {
                    sb.rpc('student_set_password_by_identity', {
                        p_cpf: cpfDigits,
                        p_birth_date: birth,
                        p_password_hash: hashed
                    }).then(function (res) {
                        if (res.data && res.data.ok && res.data.school_id) {
                            try { localStorage.setItem('siga_active_school', res.data.school_id); } catch (e) { /* ignore */ }
                        }
                        if (res.data && res.data.email) {
                            students[aidx].email = normEmail(res.data.email);
                            saveStudents(students);
                            finish(students[aidx].email);
                            pendingAlunoId = null;
                            return;
                        }
                        done();
                    }).catch(done);
                    return;
                }
                done();
            };
            if (sec) sec.hashPassword(nova).then(applyAluno);
            else applyAluno(nova);
            return;
        }

        if (!pendingServidorId) {
            toast('Sessão de recuperação inválida. Tente novamente.', 'error');
            return;
        }
        var users = getUsers();
        var idx = users.findIndex(function (u) { return u.id === pendingServidorId; });
        if (idx < 0) {
            toast('Servidor não encontrado.', 'error');
            return;
        }
        var applyUser = function (hashed) {
            users[idx].senha = hashed;
            users[idx].precisaDefinirSenha = false;
            saveUsers(users);
            finish(users[idx].email);
        };
        if (sec) sec.hashPassword(nova).then(applyUser);
        else applyUser(nova);
    }

    function usarCredenciaisAluno() {
        var email = (document.getElementById('rec-aluno-email') || {}).textContent || '';
        document.getElementById('username').value = email;
        document.getElementById('password').value = '';
        closeRecoverModal();
        toast('E-mail preenchido. Informe a senha definida na recuperação.');
    }

    function bindUi() {
        var form = document.getElementById('login-form');
        if (form) {
            form.addEventListener('submit', function (e) {
                e.preventDefault();
                doLogin(
                    (document.getElementById('username') || {}).value,
                    (document.getElementById('password') || {}).value
                );
            });
        }

        var forgot = document.getElementById('link-esqueci-senha');
        if (forgot) forgot.addEventListener('click', function (e) {
            e.preventDefault();
            openRecoverModal();
        });

        var closeBtn = document.getElementById('btn-close-recuperar');
        var backdrop = document.getElementById('modal-recuperar-backdrop');
        if (closeBtn) closeBtn.addEventListener('click', closeRecoverModal);
        if (backdrop) backdrop.addEventListener('click', closeRecoverModal);

        var tabS = document.getElementById('tab-servidor');
        var tabA = document.getElementById('tab-aluno');
        if (tabS) tabS.addEventListener('click', function () { setRecoverTipo('servidor'); });
        if (tabA) tabA.addEventListener('click', function () { setRecoverTipo('aluno'); });

        var btnLoc = document.getElementById('btn-localizar-acesso');
        if (btnLoc) btnLoc.addEventListener('click', localizarAcesso);

        var btnSave = document.getElementById('btn-salvar-senha-servidor');
        if (btnSave) btnSave.addEventListener('click', salvarSenhaServidor);

        var btnUse = document.getElementById('btn-usar-creds-aluno');
        if (btnUse) btnUse.addEventListener('click', usarCredenciaisAluno);

        ['rec-cpf-serv', 'rec-cpf-aluno'].forEach(function (id) {
            var el = document.getElementById(id);
            if (el) el.addEventListener('input', function () { formatCpfInput(el); });
        });
        ['rec-nasc-serv', 'rec-nasc-aluno'].forEach(function (id) {
            var el = document.getElementById(id);
            if (el) el.addEventListener('input', function () { formatDateInput(el); });
        });
    }

    window.togglePassword = function () {
        var pwd = document.getElementById('password');
        var icon = document.getElementById('eye-icon');
        if (!pwd || !icon) return;
        if (pwd.type === 'password') {
            pwd.type = 'text';
            icon.textContent = 'visibility_off';
        } else {
            pwd.type = 'password';
            icon.textContent = 'visibility';
        }
    };

    window.getSigaSession = function () {
        try { return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null'); }
        catch (e) { return null; }
    };

    document.addEventListener('DOMContentLoaded', function () {
        getUsers(); // seed se necessário
        try {
            var cleaned = getStudents().filter(function (s) {
                return s && !s._demo && String(s.id) !== 'aluno_andre_siga_demo' &&
                    normEmail(s.email) !== 'andre.siga' + DOMAIN_ALUNO;
            });
            saveStudents(cleaned);
        } catch (ePurge) { /* ignore */ }
        bindUi();
    });
})();
