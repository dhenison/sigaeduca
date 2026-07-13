// SIGA EDUCA — Painel do Administrador do Sistema (escolas + permissões de menu)
(function () {
    'use strict';

    var SCHOOLS_KEY = 'siga_schools';
    var SESSION_KEY = 'siga_session';
    var ACTIVE_SCHOOL_KEY = 'siga_active_school';

    /** Abas do menu de painelprincipal.html — o que cada escola pode acessar */
    var SCHOOL_MENU_MODULES = [
        { group: 'Principal', id: 'painelprincipal', label: 'Minha Escola', href: 'painelprincipal.html', icon: 'dashboard' },
        { group: 'Administrativo', id: 'calendarioletivo', label: 'Calendário Letivo', href: 'calendarioletivo.html', icon: 'calendar_today' },
        { group: 'Administrativo', id: 'turmas', label: 'Turmas', href: 'turmas.html', icon: 'groups' },
        { group: 'Administrativo', id: 'alunos', label: 'Alunos', href: 'alunos.html', icon: 'person' },
        { group: 'Administrativo', id: 'frequencia', label: 'Frequência', href: 'frequencia.html', icon: 'fact_check' },
        { group: 'Administrativo', id: 'horariodeaula', label: 'Horário de Aula', href: 'horariodeaula.html', icon: 'schedule' },
        { group: 'Administrativo', id: 'agenda', label: 'Agenda', href: 'agenda.html', icon: 'event' },
        { group: 'Administrativo', id: 'ocorrencias', label: 'Ocorrências', href: 'ocorrencias.html', icon: 'warning' },
        { group: 'Administrativo', id: 'documentossecretaria', label: 'Documentos Secretaria', href: 'documentossecretaria.html', icon: 'description' },
        { group: 'Administrativo', id: 'usuarios', label: 'Usuários', href: 'usuarios.html', icon: 'manage_accounts' },
        { group: 'Administrativo', id: 'lotacao', label: 'Lotação', href: 'Gestão de Lotação/lotacao.html', icon: 'apartment' },
        { group: 'Pedagógico', id: 'topodosaber', label: 'Projeto Olímpico', href: 'topodosaber.html', icon: 'emoji_events' },
        { group: 'Pedagógico', id: 'boletins', label: 'Boletins', href: 'boletins.html', icon: 'description' },
        { group: 'Pedagógico', id: 'conselho', label: 'Conselho de Classe', href: 'conselho.html', icon: 'diversity_3' },
        { group: 'Pedagógico', id: 'diagnostico', label: 'Diagnóstico de Ocorrências', href: '#', icon: 'analytics' },
        { group: 'Pedagógico', id: 'controlelivros', label: 'Controle de Livros', href: 'controlelivros.html', icon: 'menu_book' },
        { group: 'Pedagógico', id: 'relatorios', label: 'Relatórios', href: 'relatorios.html', icon: 'assessment' },
        { group: 'Sistema', id: 'meuperfil', label: 'Meu Perfil', href: 'meuperfil.html', icon: 'account_circle' },
        { group: 'Sistema', id: 'permissoes', label: 'Permissões', href: 'permissões.html', icon: 'shield_person' }
    ];

    var pendingLogo = '';
    var editingId = null;
    var permSchoolId = null;
    var currentView = 'escolas';
    var booted = false;

    function toast(msg, type) {
        if (typeof showToast === 'function') showToast(msg, type || 'success');
        else alert(msg);
    }

    function escapeHtml(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function uid() {
        return 'esc_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
    }

    function getSession() {
        try { return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null'); }
        catch (e) { return null; }
    }

    function isSystemAdmin() {
        var session = getSession();
        if (session) {
            if (session.sistemaAdmin === true || session.tipo === 'sistema') return true;
            if (/administrador do sistema/i.test(String(session.role || ''))) return true;
            if (String(session.email || '').toLowerCase() === 'sigaeduca@escola.seduc.pa.gov.br') return true;
        }
        try {
            var email = String((session && session.email) || localStorage.getItem('siga_profile_email') || '').toLowerCase();
            if (email === 'sigaeduca@escola.seduc.pa.gov.br') return true;
            var users = JSON.parse(localStorage.getItem('siga_users') || '[]') || [];
            var u = users.find(function (x) {
                return String(x.email || '').toLowerCase() === email || x.id === (session && session.id);
            });
            if (u && (u.sistemaAdmin || /administrador do sistema/i.test(u.cargo || ''))) return true;
        } catch (e) { /* ignore */ }
        var role = String(localStorage.getItem('siga_profile_role') || '');
        return /administrador do sistema/i.test(role);
    }

    function defaultSchoolPermissions() {
        var map = {};
        SCHOOL_MENU_MODULES.forEach(function (m) {
            map[m.id] = true;
        });
        return map;
    }

    function getSchools() {
        try {
            var list = JSON.parse(localStorage.getItem(SCHOOLS_KEY) || '[]');
            return Array.isArray(list) ? list : [];
        } catch (e) {
            return [];
        }
    }

    function saveSchools(list) {
        localStorage.setItem(SCHOOLS_KEY, JSON.stringify(list || []));
    }

    function cloudClient() {
        if (!window.SigaSupabase || !window.SigaSupabase.isConfigured || !window.SigaSupabase.isConfigured()) return null;
        return window.SigaSupabase.getClient();
    }

    function schoolToRow(school) {
        var logo = school.logo || '';
        // Evita gravar data URL gigante no Postgres (Storage virá depois)
        if (logo.indexOf('data:') === 0 && logo.length > 8000) logo = '';
        return {
            nome: school.nome || '',
            inep: String(school.inep || '').replace(/\D/g, ''),
            endereco: school.endereco || null,
            email: school.email || null,
            telefone: school.telefone || null,
            diretor_nome: school.diretorNome || null,
            diretor_contato: school.diretorContato || null,
            diretor_email: school.diretorEmail || null,
            logo_url: logo || null,
            status: school.status || 'Ativa',
            menu_permissions: school.permissoes || defaultSchoolPermissions(),
            cnpj: school.cnpj || null,
            cep: school.cep || null,
            bairro: school.bairro || null,
            municipio: school.municipio || null,
            uf: school.uf || null
        };
    }

    function rowToSchool(row) {
        return {
            id: row.id,
            logo: row.logo_url || '',
            nome: row.nome || '',
            inep: row.inep || '',
            endereco: row.endereco || '',
            email: row.email || '',
            telefone: row.telefone || '',
            diretorNome: row.diretor_nome || '',
            diretorContato: row.diretor_contato || '',
            diretorEmail: row.diretor_email || '',
            status: row.status || 'Ativa',
            cnpj: row.cnpj || '',
            cep: row.cep || '',
            bairro: row.bairro || '',
            municipio: row.municipio || '',
            uf: row.uf || '',
            permissoes: row.menu_permissions && typeof row.menu_permissions === 'object'
                ? row.menu_permissions
                : defaultSchoolPermissions(),
            createdAt: row.created_at,
            updatedAt: row.updated_at
        };
    }

    function isUuid(id) {
        return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(id || ''));
    }

    /** Carrega escolas do Supabase (fonte da verdade) e atualiza cache local */
    function refreshSchoolsFromCloud() {
        var sb = cloudClient();
        if (!sb) return Promise.resolve(getSchools());
        return sb.from('schools').select('*').order('nome', { ascending: true }).then(function (res) {
            if (res.error) {
                console.warn('[SIGA] schools fetch:', res.error.message);
                toast('Não foi possível sincronizar escolas do Supabase. Usando cache local.', 'error');
                return getSchools();
            }
            var list = (res.data || []).map(rowToSchool);
            saveSchools(list);
            return list;
        });
    }

    function requireCloudAuth() {
        var sb = cloudClient();
        if (!sb) {
            return Promise.reject(new Error('Supabase não configurado. Não é possível gravar escolas só no navegador.'));
        }
        return sb.auth.getSession().then(function (res) {
            if (!res.data || !res.data.session) {
                return Promise.reject(new Error('Sessão Supabase expirada. Faça login novamente como administrador.'));
            }
            return sb;
        });
    }

    function upsertSchoolCloud(school) {
        return requireCloudAuth().then(function (sb) {
            var row = schoolToRow(school);
            var q;
            if (school.id && isUuid(school.id)) {
                q = sb.from('schools').update(row).eq('id', school.id).select('*').single();
            } else {
                q = sb.from('schools').insert(row).select('*').single();
            }
            return q.then(function (res) {
                if (res.error) throw res.error;
                return rowToSchool(res.data);
            });
        });
    }

    function deleteSchoolCloud(id) {
        if (!isUuid(id)) return Promise.reject(new Error('ID de escola inválido.'));
        return requireCloudAuth().then(function (sb) {
            return sb.from('schools').delete().eq('id', id).then(function (res) {
                if (res.error) throw res.error;
            });
        });
    }

    function setActiveSchoolContext(school) {
        localStorage.setItem(ACTIVE_SCHOOL_KEY, school.id);
        localStorage.setItem('siga_school_name', school.nome || '');
        localStorage.setItem('siga_school_inep', school.inep || '');
        localStorage.setItem('siga_school_cnpj', school.cnpj || '');
        localStorage.setItem('siga_school_address', school.endereco || '');
        localStorage.setItem('siga_school_cep', school.cep || '');
        localStorage.setItem('siga_school_bairro', school.bairro || '');
        var cityState = (school.municipio && school.uf)
            ? (school.municipio + '/' + school.uf)
            : (school.municipio || school.uf || '');
        localStorage.setItem('siga_school_city_state', cityState);
        localStorage.setItem('siga_school_email', school.email || '');
        localStorage.setItem('siga_school_phone', school.telefone || '');
        var session = getSession() || {};
        session.schoolId = school.id;
        session.schoolName = school.nome || '';
        localStorage.setItem(SESSION_KEY, JSON.stringify(session));

        var sb = cloudClient();
        if (sb && session.id && isUuid(session.id) && isUuid(school.id)) {
            sb.from('profiles').update({ school_id: school.id }).eq('id', session.id).then(function (res) {
                if (res.error) console.warn('[SIGA] profile school_id:', res.error.message);
            });
        }
    }

    function ensureAccess() {
        if (isSystemAdmin()) return true;
        toast('Acesso restrito ao Administrador do Sistema.', 'error');
        setTimeout(function () {
            window.location.href = 'login.html';
        }, 600);
        return false;
    }

    function digits(v) {
        return String(v || '').replace(/\D/g, '');
    }

    function formatPhone(el) {
        var d = digits(el.value).slice(0, 11);
        var out = d;
        if (d.length > 6) out = '(' + d.slice(0, 2) + ') ' + d.slice(2, 7) + '-' + d.slice(7);
        else if (d.length > 2) out = '(' + d.slice(0, 2) + ') ' + d.slice(2);
        else if (d.length) out = '(' + d;
        el.value = out;
    }

    function setView(view) {
        currentView = view === 'permissoes' ? 'permissoes' : 'escolas';
        var vEsc = document.getElementById('admin-view-escolas');
        var vPerm = document.getElementById('admin-view-permissoes');
        if (vEsc) vEsc.classList.toggle('hidden', currentView !== 'escolas');
        if (vPerm) vPerm.classList.toggle('hidden', currentView !== 'permissoes');
        document.querySelectorAll('[data-admin-nav]').forEach(function (a) {
            var on = a.getAttribute('data-admin-nav') === currentView;
            a.classList.toggle('bg-primary-light/20', on);
            a.classList.toggle('text-primary', on);
            a.classList.toggle('border-l-4', on);
            a.classList.toggle('border-primary', on);
            a.classList.toggle('font-semibold', on);
            a.classList.toggle('text-text-secondary', !on);
        });
        var headerTitle = document.getElementById('admin-header-title');
        var headerSub = document.getElementById('admin-header-sub');
        if (headerTitle) headerTitle.textContent = currentView === 'escolas' ? 'Escolas' : 'Permissões das Escolas';
        if (headerSub) {
            headerSub.textContent = currentView === 'escolas'
                ? 'Login → escolha a escola → Acessar Painel (botão verde)'
                : 'Defina quais abas do menu cada escola pode acessar';
        }
        if (currentView === 'permissoes') renderPermissaoView();
        else renderSchools();
    }

    function openModal(school) {
        editingId = school ? school.id : null;
        pendingLogo = school && school.logo ? school.logo : '';
        document.getElementById('school-modal-title').textContent = school ? 'Editar Escola' : 'Nova Escola';
        document.getElementById('school-submit-btn').textContent = school ? 'Salvar Escola' : 'Criar Escola';
        document.getElementById('school-nome').value = school ? (school.nome || '') : '';
        document.getElementById('school-inep').value = school ? (school.inep || '') : '';
        document.getElementById('school-endereco').value = school ? (school.endereco || '') : '';
        document.getElementById('school-email').value = school ? (school.email || '') : '';
        document.getElementById('school-telefone').value = school ? (school.telefone || '') : '';
        document.getElementById('school-diretor-nome').value = school ? (school.diretorNome || '') : '';
        document.getElementById('school-diretor-contato').value = school ? (school.diretorContato || '') : '';
        document.getElementById('school-diretor-email').value = school ? (school.diretorEmail || '') : '';
        updateLogoPreview();
        document.getElementById('school-modal').classList.remove('hidden');
        document.body.style.overflow = 'hidden';
    }

    function closeModal() {
        document.getElementById('school-modal').classList.add('hidden');
        document.body.style.overflow = '';
        editingId = null;
        pendingLogo = '';
        var file = document.getElementById('school-logo-file');
        if (file) file.value = '';
    }

    function updateLogoPreview() {
        var img = document.getElementById('school-logo-preview');
        var ph = document.getElementById('school-logo-placeholder');
        if (pendingLogo) {
            img.src = pendingLogo;
            img.classList.remove('hidden');
            ph.classList.add('hidden');
        } else {
            img.classList.add('hidden');
            img.removeAttribute('src');
            ph.classList.remove('hidden');
        }
    }

    function onLogoPick(e) {
        var file = e.target.files && e.target.files[0];
        if (!file) return;
        if (!/^image\/(jpeg|png|jpg|webp|svg\+xml)$/i.test(file.type)) {
            toast('Use JPG, PNG, WEBP ou SVG.', 'error');
            return;
        }
        if (file.size > 2 * 1024 * 1024) {
            toast('A logo deve ter no máximo 2MB.', 'error');
            return;
        }
        var reader = new FileReader();
        reader.onload = function () {
            pendingLogo = reader.result;
            updateLogoPreview();
        };
        reader.readAsDataURL(file);
    }

    function onSubmitSchool(e) {
        e.preventDefault();
        var nome = document.getElementById('school-nome').value.trim();
        var inep = digits(document.getElementById('school-inep').value);
        var endereco = document.getElementById('school-endereco').value.trim();
        var email = String(document.getElementById('school-email').value || '').trim().toLowerCase();
        var telefone = document.getElementById('school-telefone').value.trim();
        var diretorNome = document.getElementById('school-diretor-nome').value.trim();
        var diretorContato = document.getElementById('school-diretor-contato').value.trim();
        var diretorEmail = String(document.getElementById('school-diretor-email').value || '').trim().toLowerCase();

        if (!nome || !inep || !endereco || !email || !telefone || !diretorNome || !diretorContato || !diretorEmail) {
            toast('Preencha todos os campos obrigatórios.', 'error');
            return;
        }
        if (inep.length < 8) {
            toast('INEP inválido (mínimo 8 dígitos).', 'error');
            return;
        }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(diretorEmail)) {
            toast('Informe e-mails válidos.', 'error');
            return;
        }

        var list = getSchools();
        var dup = list.find(function (s) {
            return String(s.inep) === inep && String(s.id) !== String(editingId || '');
        });
        if (dup) {
            toast('Já existe uma escola com este INEP.', 'error');
            return;
        }

        var prev = editingId ? list.find(function (s) { return String(s.id) === String(editingId); }) : null;
        var payload = {
            id: editingId || undefined,
            logo: pendingLogo || (prev && prev.logo) || '',
            nome: nome,
            inep: inep,
            endereco: endereco,
            email: email,
            telefone: telefone,
            diretorNome: diretorNome,
            diretorContato: diretorContato,
            diretorEmail: diretorEmail,
            status: (prev && prev.status) || 'Ativa',
            permissoes: (prev && prev.permissoes) || defaultSchoolPermissions()
        };

        upsertSchoolCloud(payload).then(function (saved) {
            var next = getSchools().filter(function (s) {
                return String(s.id) !== String(editingId || '') && String(s.id) !== String(saved.id);
            });
            next.push(saved);
            saveSchools(next);
            toast(editingId ? 'Escola atualizada!' : 'Escola criada no Supabase!');
            closeModal();
            renderSchools();
            renderPermSchoolSelect();
        }).catch(function (err) {
            console.warn(err);
            toast('Falha ao salvar no Supabase: ' + ((err && err.message) || 'erro'), 'error');
        });
    }

    function removeSchool(id) {
        if (!confirm('Excluir esta escola?')) return;
        deleteSchoolCloud(id).then(function () {
            saveSchools(getSchools().filter(function (s) { return String(s.id) !== String(id); }));
            if (String(permSchoolId) === String(id)) permSchoolId = null;
            toast('Escola removida.', 'error');
            renderSchools();
            renderPermissaoView();
        }).catch(function (err) {
            toast('Falha ao excluir no Supabase: ' + ((err && err.message) || 'erro'), 'error');
        });
    }

    function accessSchool(id) {
        var school = getSchools().find(function (s) { return String(s.id) === String(id); });
        if (!school) return;
        if (school.status === 'Inativa') {
            toast('Escola inativa.', 'error');
            return;
        }
        setActiveSchoolContext(school);
        toast('Abrindo painel de ' + school.nome + '...');
        setTimeout(function () { window.location.href = 'painelprincipal.html'; }, 400);
    }

    function renderStats() {
        var list = getSchools();
        var ativas = list.filter(function (s) { return (s.status || 'Ativa') === 'Ativa'; }).length;
        var elT = document.getElementById('stat-schools-total');
        var elA = document.getElementById('stat-schools-ativas');
        var elM = document.getElementById('stat-schools-mods');
        if (elT) elT.textContent = String(list.length);
        if (elA) elA.textContent = String(ativas);
        if (elM) elM.textContent = String(SCHOOL_MENU_MODULES.length);
    }

    function renderSchools() {
        renderStats();
        var body = document.getElementById('schools-table-body');
        if (!body) return;
        var list = getSchools();
        var q = String((document.getElementById('schools-search') || {}).value || '').toLowerCase().trim();
        if (q) {
            list = list.filter(function (s) {
                return [s.nome, s.inep, s.endereco, s.diretorNome, s.email].join(' ').toLowerCase().indexOf(q) >= 0;
            });
        }
        if (!list.length) {
            body.innerHTML = '<tr><td colspan="6" class="px-6 py-12 text-center text-text-secondary">Nenhuma escola cadastrada. Clique em <strong>Nova Escola</strong>.</td></tr>';
            return;
        }
        body.innerHTML = list.map(function (s) {
            var logo = s.logo
                ? '<img src="' + s.logo + '" alt="" class="w-full h-full object-cover"/>'
                : '<span class="material-symbols-outlined text-primary">school</span>';
            var status = s.status || 'Ativa';
            var statusCls = status === 'Ativa' ? 'bg-primary-light/20 text-primary' : 'bg-error-container text-on-error-container';
            return [
                '<tr class="hover:bg-surface-container-lowest transition-colors group">',
                '<td class="px-6 py-5"><div class="flex items-center gap-4">',
                '<div class="w-12 h-12 rounded-xl bg-surface-container overflow-hidden flex-shrink-0 flex items-center justify-center">', logo, '</div>',
                '<div><p class="font-headline-sm text-on-surface group-hover:text-primary transition-colors">', escapeHtml(s.nome), '</p>',
                '<p class="text-label-sm text-text-secondary">Diretor(a): ', escapeHtml(s.diretorNome || '—'), '</p></div></div></td>',
                '<td class="px-6 py-5 text-center font-mono text-body-md text-text-secondary">', escapeHtml(s.inep), '</td>',
                '<td class="px-6 py-5 text-body-md text-text-secondary">', escapeHtml(s.endereco || '—'), '</td>',
                '<td class="px-6 py-5 text-body-md text-text-secondary">', escapeHtml(s.email || '—'), '<br/><span class="text-label-sm">', escapeHtml(s.telefone || ''), '</span></td>',
                '<td class="px-6 py-5"><span class="px-3 py-1 ', statusCls, ' text-label-sm font-bold rounded-full">', escapeHtml(status), '</span></td>',
                '<td class="px-6 py-5"><div class="flex justify-end gap-2">',
                '<button type="button" data-access="', escapeHtml(s.id), '" class="w-9 h-9 flex items-center justify-center rounded-lg bg-primary text-white hover:brightness-95" title="Acessar Painel"><span class="material-symbols-outlined text-[20px]">login</span></button>',
                '<button type="button" data-perms="', escapeHtml(s.id), '" class="w-9 h-9 flex items-center justify-center rounded-lg border border-border-subtle text-text-secondary hover:text-primary" title="Permissões"><span class="material-symbols-outlined text-[20px]">shield_person</span></button>',
                '<button type="button" data-edit="', escapeHtml(s.id), '" class="w-9 h-9 flex items-center justify-center rounded-lg border border-border-subtle text-text-secondary hover:text-primary" title="Editar"><span class="material-symbols-outlined text-[20px]">edit</span></button>',
                '<button type="button" data-del="', escapeHtml(s.id), '" class="w-9 h-9 flex items-center justify-center rounded-lg border border-border-subtle text-text-secondary hover:text-error" title="Excluir"><span class="material-symbols-outlined text-[20px]">delete</span></button>',
                '</div></td></tr>'
            ].join('');
        }).join('');

        body.querySelectorAll('[data-access]').forEach(function (btn) {
            btn.addEventListener('click', function () { accessSchool(btn.getAttribute('data-access')); });
        });
        body.querySelectorAll('[data-edit]').forEach(function (btn) {
            btn.addEventListener('click', function () {
                var s = getSchools().find(function (x) { return String(x.id) === String(btn.getAttribute('data-edit')); });
                if (s) openModal(s);
            });
        });
        body.querySelectorAll('[data-del]').forEach(function (btn) {
            btn.addEventListener('click', function () { removeSchool(btn.getAttribute('data-del')); });
        });
        body.querySelectorAll('[data-perms]').forEach(function (btn) {
            btn.addEventListener('click', function () {
                permSchoolId = btn.getAttribute('data-perms');
                setView('permissoes');
            });
        });
    }

    function renderPermSchoolSelect() {
        var sel = document.getElementById('perm-school-select');
        if (!sel) return;
        var list = getSchools();
        sel.innerHTML = '<option value="">Selecione uma escola...</option>' + list.map(function (s) {
            return '<option value="' + escapeHtml(s.id) + '">' + escapeHtml(s.nome) + ' (' + escapeHtml(s.inep) + ')</option>';
        }).join('');
        if (permSchoolId) sel.value = permSchoolId;
    }

    function renderPermissaoView() {
        renderPermSchoolSelect();
        var host = document.getElementById('school-perm-matrix');
        var hint = document.getElementById('school-perm-hint');
        if (!host) return;
        var school = getSchools().find(function (s) { return String(s.id) === String(permSchoolId); });
        if (!school) {
            host.innerHTML = '<p class="text-text-secondary p-6 text-center">Selecione uma escola para configurar o acesso às abas do menu.</p>';
            if (hint) hint.textContent = '';
            return;
        }
        if (!school.permissoes) school.permissoes = defaultSchoolPermissions();
        if (hint) hint.textContent = 'Menu baseado em Minha Escola (painelprincipal) · ' + school.nome;

        var html = '';
        var group = '';
        SCHOOL_MENU_MODULES.forEach(function (m) {
            if (m.group !== group) {
                group = m.group;
                html += '<div class="px-4 py-2 bg-primary/5 text-primary text-xs font-bold uppercase tracking-widest">' + escapeHtml(group) + '</div>';
            }
            var on = school.permissoes[m.id] !== false;
            html += [
                '<label class="flex items-center justify-between gap-4 px-4 py-3 border-b border-border-subtle hover:bg-surface-container-low/50 cursor-pointer">',
                '<span class="flex items-center gap-3"><span class="material-symbols-outlined text-outline">', m.icon, '</span>',
                '<span class="text-body-md font-medium">', escapeHtml(m.label), '</span></span>',
                '<input type="checkbox" data-mod="', m.id, '" class="rounded border-border-subtle text-primary focus:ring-primary h-5 w-5" ', on ? 'checked' : '', '/>',
                '</label>'
            ].join('');
        });
        host.innerHTML = html;
        host.querySelectorAll('input[data-mod]').forEach(function (cb) {
            cb.addEventListener('change', function () {
                var mod = cb.getAttribute('data-mod');
                var list = getSchools();
                list = list.map(function (s) {
                    if (String(s.id) !== String(school.id)) return s;
                    var perms = Object.assign({}, s.permissoes || defaultSchoolPermissions());
                    perms[mod] = cb.checked;
                    return Object.assign({}, s, { permissoes: perms, updatedAt: new Date().toISOString() });
                });
                saveSchools(list);
                var updated = list.find(function (s) { return String(s.id) === String(school.id); });
                if (updated) {
                    upsertSchoolCloud(updated).catch(function (err) {
                        console.warn('[SIGA] sync permissões:', err && err.message);
                    });
                }
                toast(cb.checked ? (mLabel(mod) + ' liberado.') : (mLabel(mod) + ' bloqueado.'), cb.checked ? 'success' : 'error');
            });
        });
    }

    function mLabel(id) {
        var m = SCHOOL_MENU_MODULES.find(function (x) { return x.id === id; });
        return m ? m.label : id;
    }

    function bindUi() {
        document.querySelectorAll('[data-admin-nav]').forEach(function (a) {
            a.addEventListener('click', function (e) {
                e.preventDefault();
                setView(a.getAttribute('data-admin-nav'));
            });
        });
        var btnNew = document.getElementById('btn-nova-escola');
        if (btnNew) btnNew.addEventListener('click', function () { openModal(null); });
        document.querySelectorAll('[data-school-close]').forEach(function (el) {
            el.addEventListener('click', closeModal);
        });
        var form = document.getElementById('school-form');
        if (form) form.addEventListener('submit', onSubmitSchool);
        var logoBtn = document.getElementById('school-logo-btn');
        var logoFile = document.getElementById('school-logo-file');
        if (logoBtn && logoFile) {
            logoBtn.addEventListener('click', function () { logoFile.click(); });
            logoFile.addEventListener('change', onLogoPick);
        }
        ['school-telefone', 'school-diretor-contato'].forEach(function (id) {
            var el = document.getElementById(id);
            if (el) el.addEventListener('input', function () { formatPhone(el); });
        });
        var search = document.getElementById('schools-search');
        if (search) search.addEventListener('input', renderSchools);
        var sel = document.getElementById('perm-school-select');
        if (sel) {
            sel.addEventListener('change', function () {
                permSchoolId = sel.value || null;
                renderPermissaoView();
            });
        }
        var enableAll = document.getElementById('perm-enable-all');
        var disableAll = document.getElementById('perm-disable-all');
        var resetPerm = document.getElementById('perm-reset-default');
        if (enableAll) enableAll.addEventListener('click', function () { setAllPerms(true); });
        if (disableAll) disableAll.addEventListener('click', function () { setAllPerms(false); });
        if (resetPerm) resetPerm.addEventListener('click', function () {
            if (!permSchoolId) return;
            var list = getSchools().map(function (s) {
                if (String(s.id) !== String(permSchoolId)) return s;
                return Object.assign({}, s, { permissoes: defaultSchoolPermissions() });
            });
            saveSchools(list);
            var updated = list.find(function (s) { return String(s.id) === String(permSchoolId); });
            if (updated) upsertSchoolCloud(updated).catch(function () { /* ignore */ });
            toast('Permissões restauradas (todas as abas liberadas).');
            renderPermissaoView();
        });
    }

    function setAllPerms(on) {
        if (!permSchoolId) {
            toast('Selecione uma escola.', 'error');
            return;
        }
        var map = {};
        SCHOOL_MENU_MODULES.forEach(function (m) { map[m.id] = !!on; });
        // Minha Escola e Meu Perfil sempre liberados
        map.painelprincipal = true;
        map.meuperfil = true;
        var list = getSchools().map(function (s) {
            if (String(s.id) !== String(permSchoolId)) return s;
            return Object.assign({}, s, { permissoes: map });
        });
        saveSchools(list);
        var updated = list.find(function (s) { return String(s.id) === String(permSchoolId); });
        if (updated) upsertSchoolCloud(updated).catch(function () { /* ignore */ });
        toast(on ? 'Todas as abas liberadas.' : 'Abas bloqueadas (exceto Minha Escola e Meu Perfil).');
        renderPermissaoView();
    }

    /** Aplica permissões da escola ativa nas páginas do sistema (esconde itens do menu) */
    function applySchoolMenuPermissions() {
        if (isSystemAdmin() && /paineladmin(?:\.html)?/i.test(location.pathname + location.href)) return;

        ensureAdminContextBanner();

        var schoolId = localStorage.getItem(ACTIVE_SCHOOL_KEY);
        if (!schoolId) return;
        var school = getSchools().find(function (s) { return String(s.id) === String(schoolId); });
        if (!school || !school.permissoes) return;

        SCHOOL_MENU_MODULES.forEach(function (m) {
            if (school.permissoes[m.id] !== false) return;
            if (!m.href || m.href === '#') return;
            var file = m.href.split('/').pop();
            document.querySelectorAll('aside#sidebar a[href="' + file + '"], aside#sidebar a[href="' + m.href + '"]').forEach(function (a) {
                a.classList.add('hidden');
                a.setAttribute('aria-hidden', 'true');
            });
        });

        // Se página atual estiver bloqueada, redireciona
        var page = (location.pathname.split('/').pop() || '').toLowerCase();
        var blocked = SCHOOL_MENU_MODULES.find(function (m) {
            return m.href && m.href.toLowerCase() === page && school.permissoes[m.id] === false;
        });
        if (blocked) {
            toast('Esta aba não está liberada para esta escola.', 'error');
            location.href = 'painelprincipal.html';
        }
    }

    /** Banner: admin em contexto de escola — voltar ao seletor */
    function ensureAdminContextBanner() {
        if (!isSystemAdmin()) return;
        if (/paineladmin(?:\.html)?/i.test(location.pathname + location.href)) return;
        var name = localStorage.getItem('siga_school_name') || '';
        if (!localStorage.getItem(ACTIVE_SCHOOL_KEY)) return;
        if (document.getElementById('siga-admin-school-banner')) return;
        var bar = document.createElement('div');
        bar.id = 'siga-admin-school-banner';
        bar.className = 'fixed top-0 inset-x-0 z-[9998] bg-primary text-white px-4 py-2 flex flex-wrap items-center justify-between gap-2 text-sm shadow';
        bar.innerHTML =
            '<span><strong>Admin</strong> · Escola: <strong id="siga-admin-school-banner-name"></strong></span>' +
            '<a href="paineladmin.html" class="underline font-semibold hover:opacity-90">Trocar escola / Painel Admin</a>';
        document.body.appendChild(bar);
        document.body.style.paddingTop = '40px';
        var nameEl = document.getElementById('siga-admin-school-banner-name');
        if (nameEl) nameEl.textContent = name || '—';
    }

    function initPainelAdminPage() {
        if (!/paineladmin(?:\.html)?/i.test(location.pathname + location.href)) {
            applySchoolMenuPermissions();
            return;
        }
        if (!ensureAccess()) return;
        if (booted) {
            refreshSchoolsFromCloud().then(function () { renderSchools(); });
            return;
        }
        booted = true;
        bindUi();
        setView('escolas');
        refreshSchoolsFromCloud().then(function () {
            renderSchools();
            renderPermSchoolSelect();
        });
    }

    window.initPainelAdminPage = initPainelAdminPage;
    window.SIGA_SCHOOL_MENU_MODULES = SCHOOL_MENU_MODULES;
    window.isSigaSystemAdmin = isSystemAdmin;
    window.applySchoolMenuPermissions = applySchoolMenuPermissions;

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initPainelAdminPage);
    } else {
        initPainelAdminPage();
    }
})();
