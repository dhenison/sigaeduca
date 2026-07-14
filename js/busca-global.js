// SIGA EDUCA — Busca global no header (sempre visível)
(function () {
    'use strict';

    var PAGES = [
        { title: 'Painel Principal', href: 'painelprincipal.html', keywords: 'dashboard escola inicio' },
        { title: 'Alunos', href: 'alunos.html', keywords: 'matricula estudante' },
        { title: 'Turmas', href: 'turmas.html', keywords: 'classe serie turno' },
        { title: 'Frequência', href: 'frequencia.html', keywords: 'chamada presenca falta' },
        { title: 'Calendário Letivo', href: 'calendarioletivo.html', keywords: 'dias letivos feriado' },
        { title: 'Horário de Aula', href: 'horariodeaula.html', keywords: 'grade horario' },
        { title: 'Agenda', href: 'agenda.html', keywords: 'eventos reuniao' },
        { title: 'Ocorrências', href: 'ocorrencias.html', keywords: 'disciplina evasao' },
        { title: 'Documentos Secretaria', href: 'documentossecretaria.html', keywords: 'declaracao protocolo' },
        { title: 'Documentos Administrativos', href: 'documentosadministrativos.html', keywords: 'gestao escolar oficio memorando ata paf ponto' },
        { title: 'Boletins', href: 'boletins.html', keywords: 'notas desempenho' },
        { title: 'Conselho de Classe', href: 'conselho.html', keywords: 'conselho' },
        { title: 'Projeto Olímpico', href: 'topodosaber.html', keywords: 'olimpiada medalha' },
        { title: 'Controle de Livros', href: 'controlelivros.html', keywords: 'biblioteca livro' },
        { title: 'Relatórios', href: 'relatorios.html', keywords: 'exportar pdf excel' },
        { title: 'Escola', href: 'escola.html', keywords: 'dados instituicao' },
        { title: 'Usuários', href: 'usuarios.html', keywords: 'acesso conta' },
        { title: 'Lotação', href: 'Gestão de Lotação/lotacao.html', keywords: 'lotacao professor carga horaria mapa' },
        { title: 'Permissões', href: 'permissões.html', keywords: 'perfil acesso' },
        { title: 'Meu Perfil', href: 'meuperfil.html', keywords: 'conta usuario' },
        { title: 'Documentos', href: 'documentos.html', keywords: 'arquivos' },
        { title: 'Painel Admin', href: 'paineladmin.html', keywords: 'administracao' }
    ];

    var PAGE_LOCAL_INPUTS = [
        'alunos-search',
        'search-classes',
        'livros-search',
        'sec-search',
        'env-search'
    ];

    function esc(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function norm(s) {
        return String(s || '')
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '');
    }

    function findHeaderSearchInputs() {
        var header = document.querySelector('main > header, header');
        if (!header) return [];
        return Array.prototype.slice.call(header.querySelectorAll('input[type="text"], input:not([type])'))
            .filter(function (inp) {
                var ph = (inp.getAttribute('placeholder') || '').toLowerCase();
                return ph.indexOf('buscar') >= 0 || inp.id === 'global-search' || inp.id === 'search-classes';
            });
    }

    function ensureSearchVisible(input) {
        var wrap = input.closest('.relative') || input.parentElement;
        if (!wrap) return wrap;
        wrap.classList.remove('hidden');
        // remove responsive hide utilities
        wrap.className = wrap.className
            .split(/\s+/)
            .filter(function (c) {
                return c && c !== 'hidden' && c !== 'md:block' && c !== 'md:flex' && c !== 'lg:block';
            })
            .join(' ');
        if (wrap.className.indexOf('relative') < 0) wrap.className = ('relative ' + wrap.className).trim();
        return wrap;
    }

    function ensureResultsPanel(wrap) {
        var panel = wrap.querySelector('.siga-global-search-results');
        if (panel) return panel;
        panel = document.createElement('div');
        panel.className = 'siga-global-search-results hidden absolute left-0 right-0 top-[calc(100%+8px)] z-[80] bg-white border border-border-subtle rounded-2xl shadow-xl overflow-hidden max-h-80 overflow-y-auto';
        wrap.appendChild(panel);
        return panel;
    }

    function getStudents() {
        try { return JSON.parse(localStorage.getItem('siga_students') || '[]') || []; }
        catch (e) { return []; }
    }

    function getClasses() {
        try {
            if (typeof window.getClasses === 'function') return window.getClasses() || [];
            return JSON.parse(localStorage.getItem('siga_classes') || '[]') || [];
        } catch (e) { return []; }
    }

    function buildResults(query) {
        var q = norm(query);
        if (!q || q.length < 1) return [];
        var out = [];

        PAGES.forEach(function (p) {
            var hay = norm(p.title + ' ' + p.keywords + ' ' + p.href);
            if (hay.indexOf(q) >= 0) {
                out.push({ type: 'Página', title: p.title, subtitle: p.href, href: p.href, icon: 'web' });
            }
        });

        getClasses().forEach(function (c) {
            var label = (c.code || '') + ' ' + (c.serie || '') + ' ' + (c.turno || '');
            if (norm(label).indexOf(q) >= 0) {
                out.push({
                    type: 'Turma',
                    title: c.code || 'Turma',
                    subtitle: (c.serie || '') + (c.turno ? ' · ' + c.turno : ''),
                    href: 'turmas.html',
                    icon: 'groups'
                });
            }
        });

        getStudents().slice(0, 800).forEach(function (s) {
            var hay = norm((s.nome || '') + ' ' + (s.cpf || '') + ' ' + (s.turma || '') + ' ' + (s.codigoInep || ''));
            if (hay.indexOf(q) >= 0) {
                out.push({
                    type: 'Aluno',
                    title: s.nome || 'Aluno',
                    subtitle: (s.turma || '—') + (s.cpf ? ' · ' + s.cpf : ''),
                    href: 'fichadoaluno.html?id=' + encodeURIComponent(s.id),
                    icon: 'person'
                });
            }
        });

        return out.slice(0, 12);
    }

    function renderResults(panel, items, query) {
        if (!items.length) {
            panel.innerHTML = '<div class="px-4 py-3 text-body-md text-text-secondary">Nenhum resultado para “' + esc(query) + '”</div>';
            panel.classList.remove('hidden');
            return;
        }
        panel.innerHTML = items.map(function (it) {
            return (
                '<a href="' + esc(it.href) + '" class="flex items-center gap-3 px-4 py-2.5 hover:bg-surface-container-low transition-colors border-b border-border-subtle/60 last:border-0">' +
                '<span class="material-symbols-outlined text-primary text-[20px]">' + esc(it.icon) + '</span>' +
                '<span class="min-w-0 flex-1">' +
                '<span class="block text-body-md font-semibold text-on-surface truncate">' + esc(it.title) + '</span>' +
                '<span class="block text-[11px] text-text-secondary truncate">' + esc(it.type) + (it.subtitle ? ' · ' + it.subtitle : '') + '</span>' +
                '</span>' +
                '<span class="material-symbols-outlined text-text-secondary text-[16px]">chevron_right</span>' +
                '</a>'
            );
        }).join('');
        panel.classList.remove('hidden');
    }

    function syncPageLocalFilters(value, sourceInput) {
        PAGE_LOCAL_INPUTS.forEach(function (id) {
            var el = document.getElementById(id);
            if (!el || el === sourceInput) return;
            if (el.value === value) {
                // still notify listeners when needed
            } else {
                el.value = value;
            }
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
        });

        // ocorrências (usa #global-search)
        if (typeof window.renderTable === 'function') {
            try { window.renderTable(); } catch (e) { /* ignore */ }
        }
        if (typeof window.filterClasses === 'function') {
            try { window.filterClasses(); } catch (e) { /* ignore */ }
        }
        if (typeof window.renderAlunos === 'function') {
            try { window.renderAlunos(); } catch (e) { /* ignore */ }
        }
        if (typeof window.renderLivros === 'function') {
            try { window.renderLivros(); } catch (e) { /* ignore */ }
        }
        if (typeof window.renderSecDocs === 'function') {
            try { window.renderSecDocs(); } catch (e) { /* ignore */ }
        }
        if (typeof window.filterCards === 'function') {
            try { window.filterCards(); } catch (e) { /* ignore */ }
        }

        filterVisibleLists(value);
    }

    function filterVisibleLists(query) {
        var q = norm(query);
        var selectors = [
            '#relatorios-grid .report-card',
            '#list-entrada-students > div',
            '#list-saida-students > div',
            '#list-consolidado-students > div',
            '[data-searchable]'
        ];
        selectors.forEach(function (sel) {
            document.querySelectorAll(sel).forEach(function (el) {
                if (!q) {
                    el.classList.remove('hidden');
                    el.style.display = '';
                    return;
                }
                var match = norm(el.textContent).indexOf(q) >= 0;
                if (el.classList.contains('report-card') || el.hasAttribute('data-searchable')) {
                    el.classList.toggle('hidden', !match);
                } else {
                    el.style.display = match ? '' : 'none';
                }
            });
        });
    }

    function bindInput(input) {
        if (input.dataset.sigaBuscaBound === '1') return;
        input.dataset.sigaBuscaBound = '1';

        if (!input.id) input.id = 'global-search';
        input.setAttribute('placeholder', 'Buscar...');
        input.setAttribute('autocomplete', 'off');
        input.classList.add('siga-global-search-input');
        // mantém visível também no mobile
        input.className = input.className
            .replace(/\bw-64\b/g, 'w-40 sm:w-56 md:w-64')
            .replace(/\bhidden\b/g, '');

        var wrap = ensureSearchVisible(input);
        var panel = ensureResultsPanel(wrap);

        var timer = null;
        function run() {
            var value = input.value || '';
            syncPageLocalFilters(value, input);
            if (!value.trim()) {
                panel.classList.add('hidden');
                panel.innerHTML = '';
                return;
            }
            renderResults(panel, buildResults(value), value);
        }

        input.addEventListener('input', function () {
            clearTimeout(timer);
            timer = setTimeout(run, 120);
        });
        input.addEventListener('focus', function () {
            if ((input.value || '').trim()) run();
        });

        document.addEventListener('click', function (e) {
            if (!wrap.contains(e.target)) panel.classList.add('hidden');
        });

        input.addEventListener('keydown', function (e) {
            if (e.key === 'Escape') {
                panel.classList.add('hidden');
                input.blur();
            }
            if (e.key === 'Enter') {
                var first = panel.querySelector('a[href]');
                if (first && !(panel.classList.contains('hidden'))) {
                    e.preventDefault();
                    window.location.href = first.getAttribute('href');
                }
            }
        });
    }

    function injectSearchIfMissing() {
        var header = document.querySelector('main > header, main header, header');
        if (!header) return null;
        if (findHeaderSearchInputs().length) return null;

        var actions = header.querySelector('.flex.items-center.gap-4');
        if (!actions) {
            actions = document.createElement('div');
            actions.className = 'flex items-center gap-4';
            header.appendChild(actions);
        }

        var wrap = document.createElement('div');
        wrap.className = 'relative';
        wrap.innerHTML =
            '<span class="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary pointer-events-none">search</span>' +
            '<input id="global-search" class="pl-10 pr-4 py-2 bg-white border border-border-subtle rounded-full text-body-md w-44 sm:w-64 focus:ring-2 focus:ring-primary-light focus:outline-none transition-all" placeholder="Buscar..." type="text" autocomplete="off"/>';

        var firstBtn = actions.querySelector('button, img, #current-date-display');
        if (firstBtn) actions.insertBefore(wrap, firstBtn);
        else actions.insertBefore(wrap, actions.firstChild);
        return wrap.querySelector('input');
    }

    window.initGlobalHeaderSearch = function () {
        // páginas sem chrome de app
        var path = (window.location.pathname || '').toLowerCase();
        if (path.indexOf('login.html') >= 0 || path.indexOf('validar-documento.html') >= 0) return;

        injectSearchIfMissing();
        var inputs = findHeaderSearchInputs();
        if (!inputs.length) {
            // fallback: qualquer Buscar no topo
            inputs = Array.prototype.slice.call(document.querySelectorAll('input[placeholder*="Buscar"]')).slice(0, 1);
        }
        inputs.forEach(bindInput);
    };
})();
