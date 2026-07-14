// SIGA EDUCA — Permissões por usuário e módulos do sistema
(function () {
    'use strict';

    var USERS_KEY = 'siga_users';
    var PERMS_KEY = 'siga_user_permissions';
    var META_KEY = 'siga_permissions_meta';

    var MODULES = [
        { group: 'Principal', id: 'painelprincipal', label: 'Minha Escola', icon: 'dashboard' },
        { group: 'Principal', id: 'escola', label: 'Dados da Escola', icon: 'apartment' },
        { group: 'Administrativo', id: 'calendarioletivo', label: 'Calendário Letivo', icon: 'calendar_today' },
        { group: 'Administrativo', id: 'turmas', label: 'Turmas', icon: 'groups' },
        { group: 'Administrativo', id: 'alunos', label: 'Alunos', icon: 'person' },
        { group: 'Administrativo', id: 'fichadoaluno', label: 'Ficha do Aluno', icon: 'badge' },
        { group: 'Administrativo', id: 'frequencia', label: 'Frequência', icon: 'fact_check' },
        { group: 'Administrativo', id: 'horariodeaula', label: 'Horário de Aula', icon: 'schedule' },
        { group: 'Administrativo', id: 'agenda', label: 'Agenda', icon: 'event' },
        { group: 'Administrativo', id: 'ocorrencias', label: 'Ocorrências', icon: 'warning' },
        { group: 'Administrativo', id: 'documentossecretaria', label: 'Documentos Secretaria', icon: 'description' },
        { group: 'Administrativo', id: 'usuarios', label: 'Usuários', icon: 'manage_accounts' },
        { group: 'Administrativo', id: 'lotacao', label: 'Lotação', icon: 'apartment' },
        { group: 'Pedagógico', id: 'topodosaber', label: 'Projeto Olímpico', icon: 'emoji_events' },
        { group: 'Pedagógico', id: 'boletins', label: 'Boletins', icon: 'menu_book' },
        { group: 'Pedagógico', id: 'conselho', label: 'Conselho de Classe', icon: 'diversity_3' },
        { group: 'Pedagógico', id: 'controlelivros', label: 'Controle de Livros', icon: 'auto_stories' },
        { group: 'Pedagógico', id: 'relatorios', label: 'Relatórios', icon: 'assessment' },
        { group: 'Sistema', id: 'meuperfil', label: 'Meu Perfil', icon: 'account_circle' },
        { group: 'Sistema', id: 'permissoes', label: 'Permissões', icon: 'shield_person' },
        { group: 'Sistema', id: 'paineladmin', label: 'Painel Admin', icon: 'admin_panel_settings' }
    ];

    /** menu = aparece no sidebar; ver/criar/editar/excluir = ações na tela */
    var ACTIONS = ['menu', 'ver', 'criar', 'editar', 'excluir'];
    var ACTION_LABELS = {
        menu: 'Menu',
        ver: 'Ver',
        criar: 'Criar',
        editar: 'Editar',
        excluir: 'Excluir'
    };

    var MODULE_HREFS = {
        painelprincipal: ['painelprincipal.html'],
        escola: ['escola.html'],
        calendarioletivo: ['calendarioletivo.html'],
        turmas: ['turmas.html', 'turmadetalhe.html'],
        alunos: ['alunos.html'],
        fichadoaluno: ['fichadoaluno.html'],
        frequencia: ['frequencia.html'],
        horariodeaula: ['horariodeaula.html'],
        agenda: ['agenda.html'],
        ocorrencias: ['ocorrencias.html'],
        documentossecretaria: ['documentossecretaria.html'],
        usuarios: ['usuarios.html'],
        lotacao: ['lotacao.html', 'Gestão de Lotação/lotacao.html'],
        topodosaber: ['topodosaber.html'],
        boletins: ['boletins.html'],
        conselho: ['conselho.html'],
        controlelivros: ['controlelivros.html'],
        relatorios: ['relatorios.html'],
        meuperfil: ['meuperfil.html'],
        permissoes: ['permissões.html', 'permissoes.html'],
        paineladmin: ['paineladmin.html']
    };

    var selectedUserId = null;
    var draft = null;
    var searchQ = '';

    function toast(msg, type) {
        if (typeof showToast === 'function') showToast(msg, type || 'success');
        else alert(msg);
    }

    function getUsers() {
        try {
            var list = JSON.parse(localStorage.getItem(USERS_KEY) || '[]');
            return Array.isArray(list) ? list : [];
        } catch (e) {
            return [];
        }
    }

    function getAllPerms() {
        try {
            var obj = JSON.parse(localStorage.getItem(PERMS_KEY) || '{}');
            return obj && typeof obj === 'object' ? obj : {};
        } catch (e) {
            return {};
        }
    }

    function saveAllPerms(obj) {
        localStorage.setItem(PERMS_KEY, JSON.stringify(obj || {}));
        localStorage.setItem(META_KEY, JSON.stringify({
            updatedAt: new Date().toISOString()
        }));
    }

    function initials(name) {
        var parts = String(name || 'U').trim().split(/\s+/).filter(Boolean);
        if (!parts.length) return 'U';
        if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
        return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }

    function escapeHtml(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function emptyActions(all) {
        var o = {};
        ACTIONS.forEach(function (a) { o[a] = !!all; });
        return o;
    }

    function defaultForRole(role) {
        var r = String(role || '').toLowerCase();
        var map = {};
        MODULES.forEach(function (m) {
            map[m.id] = emptyActions(false);
        });

        function grant(ids, actions) {
            (ids || []).forEach(function (id) {
                map[id] = map[id] || emptyActions(false);
                (actions || ACTIONS).forEach(function (a) { map[id][a] = true; });
                // Quem pode ver o módulo também o vê no menu (salvo desmarque manual depois)
                if (map[id].ver) map[id].menu = true;
            });
        }

        var allIds = MODULES.map(function (m) { return m.id; });
        var readAll = allIds.slice();
        var pedag = ['painelprincipal', 'turmas', 'alunos', 'fichadoaluno', 'frequencia', 'horariodeaula', 'agenda', 'ocorrencias', 'boletins', 'conselho', 'topodosaber', 'controlelivros', 'relatorios', 'meuperfil'];

        if (/administrador|diretor$/.test(r) && !/vice/.test(r)) {
            grant(allIds, ACTIONS);
        } else if (/vice-diretor administrativo/.test(r)) {
            grant(readAll, ['ver']);
            grant(['painelprincipal', 'escola', 'calendarioletivo', 'agenda', 'documentossecretaria', 'usuarios', 'relatorios', 'meuperfil'], ACTIONS);
            grant(['alunos', 'turmas', 'ocorrencias'], ['ver', 'criar', 'editar']);
        } else if (/vice-diretor pedag/.test(r)) {
            grant(readAll, ['ver']);
            grant(pedag, ACTIONS);
            grant(['relatorios', 'meuperfil'], ['ver', 'criar', 'editar']);
        } else if (/coordenador/.test(r)) {
            grant(readAll, ['ver']);
            grant(['painelprincipal', 'turmas', 'alunos', 'fichadoaluno', 'frequencia', 'horariodeaula', 'agenda', 'ocorrencias', 'boletins', 'conselho', 'topodosaber', 'relatorios', 'meuperfil'], ['ver', 'criar', 'editar']);
        } else if (/secretario|secretaria/.test(r)) {
            grant(readAll, ['ver']);
            grant(['painelprincipal', 'alunos', 'fichadoaluno', 'documentossecretaria', 'agenda', 'calendarioletivo', 'escola', 'meuperfil'], ACTIONS);
            grant(['turmas', 'frequencia', 'ocorrencias', 'relatorios'], ['ver', 'criar', 'editar']);
        } else if (/professor/.test(r)) {
            // Sem Documentos Secretaria, Usuários, Lotação, Dados da Escola, Permissões, Admin
            grant(['painelprincipal', 'turmas', 'alunos', 'fichadoaluno', 'frequencia', 'horariodeaula', 'agenda', 'ocorrencias', 'boletins', 'conselho', 'topodosaber', 'controlelivros', 'meuperfil'], ['ver']);
            grant(['frequencia', 'boletins', 'ocorrencias', 'agenda', 'meuperfil'], ['ver', 'criar', 'editar']);
            grant(['controlelivros'], ['ver', 'criar', 'editar']);
        } else {
            grant(['painelprincipal', 'meuperfil'], ['ver', 'editar']);
            grant(readAll, ['ver']);
        }
        return map;
    }

    function normalizePermsMap(raw) {
        var out = {};
        MODULES.forEach(function (m) {
            var p = (raw && raw[m.id]) || {};
            var ver = !!p.ver;
            out[m.id] = {
                menu: typeof p.menu === 'boolean' ? !!p.menu : ver,
                ver: ver,
                criar: !!p.criar,
                editar: !!p.editar,
                excluir: !!p.excluir
            };
        });
        return out;
    }

    function permsForUser(user) {
        if (!user) return {};
        var all = getAllPerms();
        if (all[user.id]) return normalizePermsMap(all[user.id]);
        return normalizePermsMap(defaultForRole(user.cargo || user.funcao || ''));
    }

    function ensureShell() {
        var root = document.getElementById('permissoes-app');
        if (!root) return null;
        return root;
    }

    function filteredUsers() {
        var q = searchQ.toLowerCase().trim();
        return getUsers().filter(function (u) {
            if (!q) return true;
            var blob = [u.nome, u.email, u.cargo, u.funcao, u.matriculaSemVinculo].join(' ').toLowerCase();
            return blob.indexOf(q) >= 0;
        });
    }

    function renderUserList() {
        var host = document.getElementById('perm-user-list');
        if (!host) return;
        var users = filteredUsers();
        if (!users.length) {
            host.innerHTML = '<div class="p-6 text-center text-text-secondary text-body-md">Nenhum usuário cadastrado. <a class="text-primary font-bold underline" href="usuarios.html">Cadastrar usuários</a></div>';
            return;
        }
        if (!selectedUserId || !users.some(function (u) { return String(u.id) === String(selectedUserId); })) {
            selectedUserId = users[0].id;
            draft = permsForUser(users[0]);
        }
        host.innerHTML = users.map(function (u) {
            var active = String(u.id) === String(selectedUserId);
            var role = u.cargo || u.funcao || '—';
            var avatar = u.avatar
                ? '<img src="' + u.avatar + '" alt="" class="w-10 h-10 rounded-lg object-cover"/>'
                : '<div class="w-10 h-10 rounded-lg bg-primary-container text-white font-bold text-xs flex items-center justify-center">' + initials(u.nome) + '</div>';
            return [
                '<button type="button" data-user-id="', escapeHtml(u.id), '" class="w-full text-left p-4 rounded-xl border transition-all shadow-sm ',
                active ? 'border-2 border-primary bg-primary-light/5' : 'border-border-subtle bg-white hover:border-primary-light',
                '">',
                '<div class="flex items-start justify-between gap-2">',
                '<div class="flex items-center gap-3 min-w-0">',
                avatar,
                '<div class="min-w-0">',
                '<p class="font-headline-sm truncate ', active ? 'text-primary' : 'text-on-surface', '">', escapeHtml(u.nome || '—'), '</p>',
                '<p class="font-label-md text-label-md text-text-secondary truncate">', escapeHtml(role), '</p>',
                '<p class="text-[11px] text-text-secondary truncate">', escapeHtml(u.email || ''), '</p>',
                '</div></div>',
                active
                    ? '<span class="material-symbols-outlined text-primary">check_circle</span>'
                    : '<span class="material-symbols-outlined text-outline">chevron_right</span>',
                '</div>',
                '<div class="mt-3 flex flex-wrap gap-2">',
                '<span class="px-2 py-0.5 rounded bg-surface-container-high text-on-surface-variant font-label-md text-[10px]">Mat. ', escapeHtml(u.matriculaSemVinculo || '—'), '</span>',
                getAllPerms()[u.id] && JSON.stringify(normalizePermsMap(getAllPerms()[u.id])) !== JSON.stringify(normalizePermsMap(defaultForRole(role)))
                    ? '<span class="px-2 py-0.5 rounded bg-primary-container/10 text-primary font-label-md text-[10px]">PERSONALIZADO</span>'
                    : '<span class="px-2 py-0.5 rounded bg-surface-container-high text-on-surface-variant font-label-md text-[10px]">PADRÃO DA FUNÇÃO</span>',
                '</div></button>'
            ].join('');
        }).join('');

        host.querySelectorAll('[data-user-id]').forEach(function (btn) {
            btn.addEventListener('click', function () {
                selectUser(btn.getAttribute('data-user-id'));
            });
        });
    }

    function selectUser(id) {
        var user = getUsers().find(function (u) { return String(u.id) === String(id); });
        if (!user) return;
        selectedUserId = user.id;
        draft = permsForUser(user);
        render();
    }

    function renderMatrix() {
        var title = document.getElementById('perm-matrix-title');
        var body = document.getElementById('perm-matrix-body');
        var user = getUsers().find(function (u) { return String(u.id) === String(selectedUserId); });
        if (title) {
            title.innerHTML = user
                ? 'Configurar Permissões: <span class="text-primary">' + escapeHtml(user.nome) + '</span>'
                : 'Configurar Permissões';
        }
        var subtitle = document.getElementById('perm-matrix-subtitle');
        if (subtitle) {
            subtitle.textContent = user
                ? ('Função: ' + (user.cargo || user.funcao || '—') + ' · Menu = aparece na barra lateral.')
                : 'Selecione um usuário à esquerda.';
        }
        if (!body) return;
        if (!user) {
            body.innerHTML = '<tr><td colspan="6" class="px-6 py-10 text-center text-text-secondary">Selecione um usuário para gerenciar permissões.</td></tr>';
            return;
        }
        if (!draft) draft = permsForUser(user);

        var html = '';
        var currentGroup = '';
        var colCount = ACTIONS.length + 1;
        MODULES.forEach(function (m) {
            if (m.group !== currentGroup) {
                currentGroup = m.group;
                html += '<tr class="bg-primary/5"><td class="px-6 py-2 font-bold text-primary text-xs uppercase tracking-widest" colspan="' + colCount + '">Módulo ' + escapeHtml(currentGroup) + '</td></tr>';
            }
            var p = draft[m.id] || emptyActions(false);
            html += [
                '<tr class="perm-matrix-row border-b border-border-subtle">',
                '<td class="px-6 py-4"><div class="flex items-center gap-2">',
                '<span class="material-symbols-outlined text-outline text-lg">', m.icon, '</span>',
                '<span>', escapeHtml(m.label), '</span></div></td>',
                ACTIONS.map(function (a) {
                    var title = a === 'menu'
                        ? ' title="Marcado: aparece no menu lateral. Desmarcado: some do menu."'
                        : '';
                    return '<td class="px-4 py-4 text-center"><input data-mod="' + m.id + '" data-act="' + a + '" type="checkbox" class="rounded border-border-subtle text-primary focus:ring-primary h-5 w-5"' + title + (p[a] ? ' checked' : '') + '/></td>';
                }).join(''),
                '</tr>'
            ].join('');
        });
        body.innerHTML = html;

        // Garante cabeçalho com coluna Menu
        var headRow = document.querySelector('#permissoes-app thead tr, table thead tr');
        if (headRow && headRow.querySelectorAll('th').length < colCount) {
            headRow.innerHTML = [
                '<th class="px-6 py-4 font-semibold w-1/3">Aba / Módulo</th>',
                ACTIONS.map(function (a) {
                    return '<th class="px-4 py-4 font-semibold text-center">' + (ACTION_LABELS[a] || a) + '</th>';
                }).join('')
            ].join('');
        }

        body.querySelectorAll('input[type="checkbox"]').forEach(function (cb) {
            cb.addEventListener('change', function () {
                var mod = cb.getAttribute('data-mod');
                var act = cb.getAttribute('data-act');
                if (!draft[mod]) draft[mod] = emptyActions(false);
                draft[mod][act] = cb.checked;

                if (act === 'menu' && cb.checked) {
                    draft[mod].ver = true;
                    var verCb = body.querySelector('input[data-mod="' + mod + '"][data-act="ver"]');
                    if (verCb) verCb.checked = true;
                }
                if (act !== 'ver' && act !== 'menu' && cb.checked) {
                    draft[mod].ver = true;
                    draft[mod].menu = true;
                    var verCb2 = body.querySelector('input[data-mod="' + mod + '"][data-act="ver"]');
                    var menuCb = body.querySelector('input[data-mod="' + mod + '"][data-act="menu"]');
                    if (verCb2) verCb2.checked = true;
                    if (menuCb) menuCb.checked = true;
                }
                if (act === 'ver' && !cb.checked) {
                    ACTIONS.forEach(function (a) {
                        draft[mod][a] = false;
                        var el = body.querySelector('input[data-mod="' + mod + '"][data-act="' + a + '"]');
                        if (el) el.checked = false;
                    });
                }
            });
        });
    }

    function renderStats() {
        var users = getUsers();
        var perms = getAllPerms();
        var roles = {};
        users.forEach(function (u) {
            var r = u.cargo || u.funcao || 'Outros';
            roles[r] = (roles[r] || 0) + 1;
        });
        var elUsers = document.getElementById('perm-stat-users');
        var elRoles = document.getElementById('perm-stat-roles');
        var elCustom = document.getElementById('perm-stat-custom');
        var elUpdated = document.getElementById('perm-stat-updated');
        var customCount = users.filter(function (u) {
            var saved = perms[u.id];
            if (!saved) return false;
            return JSON.stringify(normalizePermsMap(saved)) !== JSON.stringify(normalizePermsMap(defaultForRole(u.cargo || u.funcao || '')));
        }).length;
        if (elUsers) elUsers.textContent = String(users.length);
        if (elRoles) elRoles.textContent = String(Object.keys(roles).length);
        if (elCustom) elCustom.textContent = String(customCount);
        if (elUpdated) {
            try {
                var meta = JSON.parse(localStorage.getItem(META_KEY) || 'null');
                if (meta && meta.updatedAt) {
                    var d = new Date(meta.updatedAt);
                    elUpdated.textContent = d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
                } else {
                    elUpdated.textContent = '—';
                }
            } catch (e) {
                elUpdated.textContent = '—';
            }
        }
    }

    function saveDraft() {
        var user = getUsers().find(function (u) { return String(u.id) === String(selectedUserId); });
        if (!user || !draft) {
            toast('Selecione um usuário.', 'error');
            return;
        }
        var all = getAllPerms();
        all[user.id] = normalizePermsMap(draft);
        saveAllPerms(all);
        toast('Permissões salvas para ' + user.nome + '!');
        render();
    }

    function discardDraft() {
        var user = getUsers().find(function (u) { return String(u.id) === String(selectedUserId); });
        if (!user) return;
        draft = permsForUser(user);
        toast('Alterações descartadas.', 'error');
        renderMatrix();
    }

    function applyRoleDefault() {
        var user = getUsers().find(function (u) { return String(u.id) === String(selectedUserId); });
        if (!user) return;
        draft = normalizePermsMap(defaultForRole(user.cargo || user.funcao || ''));
        toast('Padrão da função aplicado. Clique em Salvar para gravar.');
        renderMatrix();
    }

    function validateAllUsers() {
        var users = getUsers();
        if (!users.length) {
            toast('Não há usuários cadastrados.', 'error');
            return;
        }
        var all = getAllPerms();
        var added = 0;
        users.forEach(function (u) {
            if (!all[u.id]) {
                all[u.id] = normalizePermsMap(defaultForRole(u.cargo || u.funcao || ''));
                added++;
            } else {
                all[u.id] = normalizePermsMap(all[u.id]);
            }
            // Garante todos os módulos atuais
            MODULES.forEach(function (m) {
                if (!all[u.id][m.id]) all[u.id][m.id] = emptyActions(false);
            });
            all[u.id] = normalizePermsMap(all[u.id]);
        });
        // Remove perms de usuários inexistentes
        Object.keys(all).forEach(function (id) {
            if (!users.some(function (u) { return String(u.id) === String(id); })) delete all[id];
        });
        saveAllPerms(all);
        if (selectedUserId) {
            var user = users.find(function (u) { return String(u.id) === String(selectedUserId); });
            if (user) draft = permsForUser(user);
        }
        toast(added ? ('Validação concluída: ' + added + ' usuário(s) sincronizado(s).') : 'Todos os usuários já possuem permissões. Módulos atualizados.');
        render();
    }

    function render() {
        renderStats();
        renderUserList();
        renderMatrix();
    }

    function bindChrome() {
        var saveBtn = document.getElementById('perm-save-btn');
        var discardBtn = document.getElementById('perm-discard-btn');
        var defaultBtn = document.getElementById('perm-default-btn');
        var validateBtn = document.getElementById('perm-validate-btn');
        var newBtn = document.getElementById('perm-new-btn');
        var search = document.getElementById('perm-user-search');

        if (saveBtn) saveBtn.onclick = saveDraft;
        if (discardBtn) discardBtn.onclick = discardDraft;
        if (defaultBtn) defaultBtn.onclick = applyRoleDefault;
        if (validateBtn) validateBtn.onclick = validateAllUsers;
        if (newBtn) newBtn.onclick = function () { window.location.href = 'usuarios.html'; };
        if (search) {
            search.addEventListener('input', function () {
                searchQ = search.value || '';
                renderUserList();
            });
        }
    }

    var booted = false;
    function initPermissionsPage() {
        if (!/permiss/i.test(window.location.pathname + window.location.href)) return;
        if (!ensureShell()) return;
        if (booted) {
            render();
            return;
        }
        booted = true;
        // Limpa chaves antigas fictícias por índice
        try {
            Object.keys(localStorage).forEach(function (k) {
                if (/^siga_permission_\d+$/.test(k)) localStorage.removeItem(k);
            });
        } catch (e) { /* ignore */ }

        bindChrome();
        var users = getUsers();
        if (users.length) {
            selectedUserId = users[0].id;
            draft = permsForUser(users[0]);
        }
        validateAllUsersQuiet();
        render();
    }

    function validateAllUsersQuiet() {
        var users = getUsers();
        var all = getAllPerms();
        var changed = false;
        users.forEach(function (u) {
            if (!all[u.id]) {
                all[u.id] = normalizePermsMap(defaultForRole(u.cargo || u.funcao || ''));
                changed = true;
            } else {
                var before = JSON.stringify(all[u.id]);
                all[u.id] = normalizePermsMap(all[u.id]);
                if (JSON.stringify(all[u.id]) !== before) changed = true;
            }
            MODULES.forEach(function (m) {
                if (!all[u.id][m.id]) {
                    all[u.id][m.id] = emptyActions(false);
                    changed = true;
                }
            });
            all[u.id] = normalizePermsMap(all[u.id]);
        });
        Object.keys(all).forEach(function (id) {
            if (!users.some(function (u) { return String(u.id) === String(id); })) {
                delete all[id];
                changed = true;
            }
        });
        if (changed) saveAllPerms(all);
    }

    function resolveSessionUser() {
        var session = null;
        try {
            session = JSON.parse(localStorage.getItem('siga_session') || 'null');
        } catch (e) {
            session = null;
        }
        if (!session) return null;
        if (session.sistemaAdmin || session.tipo === 'sistema') {
            return { __admin: true };
        }
        var users = getUsers();
        var byId = users.find(function (u) { return String(u.id) === String(session.id); });
        if (byId) return byId;
        var email = String(session.email || '').toLowerCase();
        if (email) {
            var byEmail = users.find(function (u) {
                return String(u.email || '').toLowerCase() === email;
            });
            if (byEmail) return byEmail;
        }
        return {
            id: session.id,
            email: session.email,
            nome: session.nome,
            cargo: session.role || session.cargo || ''
        };
    }

    function hideNavForHref(href) {
        if (!href || href === '#') return;
        var file = String(href).split('/').pop().split('?')[0];
        var selectors = [
            'aside#sidebar a[href="' + href + '"]',
            'aside#sidebar a[href="' + file + '"]',
            'aside#sidebar a[href$="/' + file + '"]'
        ];
        // Lotação / permissões com encoding
        if (/lotacao/i.test(file)) {
            selectors.push('aside#sidebar a[href*="lotacao"]');
        }
        if (/permiss/i.test(file)) {
            selectors.push('aside#sidebar a[href*="permiss"]');
        }
        document.querySelectorAll(selectors.join(', ')).forEach(function (a) {
            a.classList.add('hidden');
            a.setAttribute('aria-hidden', 'true');
            a.setAttribute('data-siga-menu-hidden', '1');
        });
    }

    function currentPageFile() {
        return (location.pathname.split('/').pop() || '').toLowerCase();
    }

    function moduleIdForPage(page) {
        page = String(page || '').toLowerCase();
        if (!page) return null;
        var found = null;
        Object.keys(MODULE_HREFS).forEach(function (id) {
            (MODULE_HREFS[id] || []).forEach(function (href) {
                var f = String(href).split('/').pop().toLowerCase();
                if (f === page || decodeURIComponent(f) === decodeURIComponent(page)) found = id;
            });
        });
        if (!found && /permiss/i.test(page)) found = 'permissoes';
        if (!found && /lotacao/i.test(page)) found = 'lotacao';
        return found;
    }

    /**
     * Esconde no menu lateral os módulos com MENU desmarcado para o usuário logado.
     * Admin do sistema não é filtrado.
     */
    function applyUserMenuPermissions() {
        try {
            var path = (location.pathname + ' ' + location.href).toLowerCase();
            if (/(?:^|[\/\s])login(?:\.html)?/.test(path) || /portal-aluno/.test(path)) return;
            if (/paineladmin(?:\.html)?/.test(path)) return;

            var user = resolveSessionUser();
            if (!user || user.__admin) return;

            var perms = permsForUser(user);
            MODULES.forEach(function (m) {
                var p = perms[m.id] || emptyActions(false);
                if (p.menu) return;
                (MODULE_HREFS[m.id] || []).forEach(hideNavForHref);
            });

            // Bloqueia abertura direta se não tem VER
            var page = currentPageFile();
            var modId = moduleIdForPage(page);
            if (modId && modId !== 'painelprincipal' && modId !== 'meuperfil') {
                var cur = perms[modId] || emptyActions(false);
                if (!cur.ver) {
                    toast('Você não tem permissão para esta aba.', 'error');
                    location.href = 'painelprincipal.html';
                }
            }
        } catch (e) {
            console.warn('[SIGA] applyUserMenuPermissions:', e);
        }
    }

    window.initPermissionsPage = initPermissionsPage;
    window.SIGA_PERMISSION_MODULES = MODULES;
    window.applyUserMenuPermissions = applyUserMenuPermissions;
    window.SigaUserPermissions = {
        defaultForRole: defaultForRole,
        permsForUser: permsForUser,
        normalizePermsMap: normalizePermsMap,
        applyUserMenuPermissions: applyUserMenuPermissions
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initPermissionsPage);
    } else {
        initPermissionsPage();
    }
})();
