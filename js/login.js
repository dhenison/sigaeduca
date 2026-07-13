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

    function doLogin(email, senha) {
        email = normEmail(email);
        senha = String(senha || '');
        var sec = window.SigaSecurity;

        if (!email || !senha) {
            toast('Informe o e-mail institucional e a senha.', 'error');
            return;
        }
        if (!isInstitutionalEmail(email)) {
            toast('Use somente e-mail institucional (@aluno.seduc.pa.gov.br ou @escola.seduc.pa.gov.br).', 'error');
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
            var students = getStudents();
            var aluno = students.find(function (s) {
                return normEmail(s.email) === email || ensureAlunoEmail(s) === email;
            });
            if (!aluno) {
                toast('Aluno não encontrado com este e-mail.', 'error');
                return;
            }
            if (normEmail(aluno.email) !== email) {
                aluno.email = email;
                saveStudents(students.map(function (s) {
                    return String(s.id) === String(aluno.id) ? Object.assign({}, s, { email: email }) : s;
                }));
            }
            if (!aluno.senha || aluno.precisaDefinirSenha) {
                toast('Defina sua senha em “Esqueci minha senha” antes de entrar.', 'error');
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
                setSession({
                    tipo: 'aluno',
                    id: aluno.id,
                    nome: aluno.nome,
                    email: email,
                    role: 'Aluno'
                });
                toast('Bem-vindo(a), ' + (aluno.nome || 'aluno') + '!');
                setTimeout(function () { window.location.href = 'portal-aluno.html'; }, 400);
            });
            return;
        }

        // Servidor — tenta Supabase Auth primeiro (admin / usuários cloud), depois localStorage
        function finishServidorLocal() {
            var users = getUsers();
            var user = users.find(function (u) { return normEmail(u.email) === email; });
            if (!user) {
                toast('Servidor não encontrado com este e-mail.', 'error');
                return;
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
                        saveUsers(list);
                    }
                }
                setSession({
                    tipo: user.sistemaAdmin ? 'sistema' : 'servidor',
                    id: user.id,
                    nome: user.nome,
                    email: email,
                    role: user.cargo || 'Servidor',
                    sistemaAdmin: !!user.sistemaAdmin || /administrador do sistema/i.test(user.cargo || ''),
                    authProvider: 'local'
                });
                toast('Bem-vindo(a), ' + (user.nome || 'servidor') + '!');
                var dest = (user.sistemaAdmin || /administrador do sistema/i.test(user.cargo || ''))
                    ? 'paineladmin.html'
                    : 'painelprincipal.html';
                setTimeout(function () { window.location.href = dest; }, 400);
            });
        }

        var cloud = window.SigaSupabase;
        if (cloud && cloud.isConfigured && cloud.isConfigured()) {
            cloud.signIn(email, senha).then(function (result) {
                if (!result || !result.ok) {
                    // Credenciais inválidas no cloud → tenta cadastro local
                    finishServidorLocal();
                    return;
                }
                var sigaSession = cloud.toSigaSession(result.user, result.profile);
                setSession(sigaSession);
                if (sigaSession.nome) localStorage.setItem('siga_profile_name', sigaSession.nome);
                if (sigaSession.role) localStorage.setItem('siga_profile_role', sigaSession.role);
                if (sigaSession.email) localStorage.setItem('siga_profile_email', sigaSession.email);
                toast('Bem-vindo(a), ' + (sigaSession.nome || 'servidor') + '!');
                var dest = sigaSession.sistemaAdmin ? 'paineladmin.html' : 'painelprincipal.html';
                if (!result.profile) {
                    console.warn('[SIGA] Login Supabase sem linha em profiles — confira o trigger handle_new_user.');
                }
                setTimeout(function () { window.location.href = dest; }, 400);
            }).catch(function () {
                finishServidorLocal();
            });
            return;
        }

        finishServidorLocal();
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

        // Aluno — localiza e pede nova senha (não exibe senha derivada de CPF)
        var cpfA = digits((document.getElementById('rec-cpf-aluno') || {}).value);
        var nascA = (document.getElementById('rec-nasc-aluno') || {}).value;
        if (cpfA.length !== 11 || !parseBrDate(nascA)) {
            toast('Informe CPF e Data de Nascimento.', 'error');
            return;
        }
        var students = getStudents();
        var aluno = students.find(function (s) {
            return digits(s.cpf) === cpfA && sameDate(s.dataNascimento, nascA);
        });
        if (!aluno) {
            toast('Aluno não encontrado. Verifique os dados informados.', 'error');
            return;
        }
        var email = ensureAlunoEmail(aluno);
        pendingAlunoId = aluno.id;
        pendingServidorId = null;
        students = students.map(function (s) {
            if (String(s.id) !== String(aluno.id)) return s;
            return Object.assign({}, s, { email: email });
        });
        saveStudents(students);

        var emailAlunoEl = document.getElementById('rec-aluno-email');
        if (emailAlunoEl) emailAlunoEl.textContent = email;
        var nomeAlunoEl = document.getElementById('rec-aluno-nome');
        if (nomeAlunoEl) nomeAlunoEl.textContent = aluno.nome || 'Aluno';
        // Reutiliza o passo de definição de senha do servidor
        var emailServ = document.getElementById('rec-servidor-email');
        if (emailServ) emailServ.textContent = email;
        var nomeServ = document.getElementById('rec-servidor-nome');
        if (nomeServ) nomeServ.textContent = aluno.nome || 'Aluno';
        showRecoverStep('servidorSenha');
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
                pendingAlunoId = null;
                finish(emailA);
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
        bindUi();
    });
})();
