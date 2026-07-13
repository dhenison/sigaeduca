/**
 * SIGA EDUCA — Professores da Turma (Detalhe da Turma)
 * Lista lotação por código da turma: Nome do Professor + Disciplina.
 * Sem professor → "SEM LOTAÇÃO".
 */
(function (global) {
    'use strict';

    var LOTACAO_DATA_KEY = 'lotacao_data';
    var DATA_SCRIPT_CANDIDATES = [
        'Gestão de Lotação/data.js',
        encodeURI('Gestão de Lotação/data.js'),
        'Gestao de Lotacao/data.js'
    ];
    var SEM_LOTACAO = 'SEM LOTAÇÃO';

    function escapeHtml(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function normalizeTurma(code) {
        return String(code || '').trim().toUpperCase();
    }

    function isVacantProfessor(name) {
        var p = String(name == null ? '' : name).trim();
        return !p || p === '-' || p === '—' || p.toUpperCase() === 'SEM LOTACAO' || p.toUpperCase() === SEM_LOTACAO;
    }

    function displayProfessorName(name) {
        return isVacantProfessor(name) ? SEM_LOTACAO : String(name).trim();
    }

    function readLocalLotacaoRows() {
        try {
            var raw = localStorage.getItem(LOTACAO_DATA_KEY);
            var arr = raw ? JSON.parse(raw) : [];
            return Array.isArray(arr) ? arr : [];
        } catch (e) {
            return [];
        }
    }

    function loadInitialLotacaoScript() {
        if (global.INITIAL_LOTACAO_DATA && global.INITIAL_LOTACAO_DATA.length) {
            return Promise.resolve(global.INITIAL_LOTACAO_DATA);
        }
        return new Promise(function (resolve) {
            var idx = 0;
            function tryNext() {
                if (idx >= DATA_SCRIPT_CANDIDATES.length) {
                    resolve([]);
                    return;
                }
                var src = DATA_SCRIPT_CANDIDATES[idx++];
                var s = document.createElement('script');
                s.src = src + (src.indexOf('?') >= 0 ? '&' : '?') + 'v=20260713m';
                s.async = true;
                s.onload = function () {
                    if (global.INITIAL_LOTACAO_DATA && global.INITIAL_LOTACAO_DATA.length) {
                        try {
                            localStorage.setItem(LOTACAO_DATA_KEY, JSON.stringify(global.INITIAL_LOTACAO_DATA));
                        } catch (e) { /* ignore */ }
                        resolve(global.INITIAL_LOTACAO_DATA);
                    } else {
                        tryNext();
                    }
                };
                s.onerror = function () { tryNext(); };
                document.head.appendChild(s);
            }
            tryNext();
        });
    }

    function ensureLotacaoRows() {
        var local = readLocalLotacaoRows();
        if (local.length) return Promise.resolve(local);
        return loadInitialLotacaoScript().then(function (rows) {
            return rows && rows.length ? rows : readLocalLotacaoRows();
        });
    }

    function fetchCloudTurmaRows(turmaCode) {
        var cloud = global.SigaSupabase;
        if (!cloud || !cloud.isConfigured || !cloud.isConfigured()) {
            return Promise.resolve([]);
        }
        var sb = cloud.getClient();
        if (!sb) return Promise.resolve([]);

        var year = new Date().getFullYear();
        return sb.rpc('turma_lotacao_rows', {
            p_turma_code: turmaCode,
            p_year: year
        }).then(function (rpcRes) {
            if (!rpcRes.error && Array.isArray(rpcRes.data) && rpcRes.data.length) {
                return rpcRes.data.map(function (r) {
                    return {
                        turma: r.turma_code,
                        disciplina: r.disciplina,
                        codigo: r.disciplina_codigo,
                        professor: r.professor_nome,
                        _fromRpc: true
                    };
                });
            }
            var schoolId = '';
            try { schoolId = localStorage.getItem('siga_active_school') || ''; } catch (e) { /* ignore */ }
            if (!schoolId) return [];
            return sb.from('v_lotacao_mapa')
                .select('turma_code,disciplina,disciplina_codigo,professor_nome,year_number')
                .eq('school_id', schoolId)
                .eq('turma_code', turmaCode)
                .then(function (res) {
                    if (res.error || !res.data) return [];
                    return (res.data || []).map(function (r) {
                        return {
                            turma: r.turma_code,
                            disciplina: r.disciplina,
                            codigo: r.disciplina_codigo,
                            professor: r.professor_nome
                        };
                    });
                });
        }).catch(function () { return []; });
    }

    function rowsForTurma(allRows, turmaCode) {
        var code = normalizeTurma(turmaCode);
        return (allRows || [])
            .filter(function (r) {
                return normalizeTurma(r.turma || r.turma_code) === code;
            })
            .map(function (r) {
                return {
                    professor: displayProfessorName(r.professor || r.professor_nome),
                    disciplina: String(r.disciplina || '—').trim() || '—',
                    codigo: String(r.codigo || r.disciplina_codigo || '—').trim() || '—',
                    vacant: isVacantProfessor(r.professor || r.professor_nome)
                };
            })
            .sort(function (a, b) {
                return String(a.disciplina).localeCompare(String(b.disciplina), 'pt-BR') ||
                    String(a.professor).localeCompare(String(b.professor), 'pt-BR');
            });
    }

    function mergePreferCloud(localRows, cloudRows) {
        if (cloudRows && cloudRows.length) {
            var seen = {};
            var out = [];
            cloudRows.concat(localRows || []).forEach(function (r) {
                var key = [
                    normalizeTurma(r.turma || r.turma_code),
                    String(r.disciplina || '').toUpperCase(),
                    String(r.codigo || r.disciplina_codigo || '').toUpperCase()
                ].join('|');
                if (seen[key]) return;
                seen[key] = true;
                out.push(r);
            });
            return out;
        }
        return localRows || [];
    }

    function renderProfessoresTable(rows) {
        var tbody = document.getElementById('class-professores-tbody');
        var emptyEl = document.getElementById('class-professores-empty');
        var countEl = document.getElementById('detail-profs-count-label');
        if (!tbody) return;

        if (countEl) countEl.textContent = String(rows.length);

        if (!rows.length) {
            tbody.innerHTML = '';
            if (emptyEl) emptyEl.classList.remove('hidden');
            return;
        }
        if (emptyEl) emptyEl.classList.add('hidden');

        tbody.innerHTML = rows.map(function (r) {
            var nameClass = r.vacant
                ? 'font-semibold text-error uppercase tracking-wide'
                : 'font-semibold text-on-surface';
            return (
                '<tr class="hover:bg-surface-container-low/30 transition-colors">' +
                '<td class="px-6 py-4"><span class="' + nameClass + '">' + escapeHtml(r.professor) + '</span></td>' +
                '<td class="px-6 py-4 text-body-md text-on-surface">' + escapeHtml(r.disciplina) + '</td>' +
                '<td class="px-6 py-4 text-body-md font-mono text-primary">' + escapeHtml(r.codigo) + '</td>' +
                '</tr>'
            );
        }).join('');
    }

    function toggleAccordion(panelId, btnId, chevronId, forceOpen) {
        var panel = document.getElementById(panelId);
        var btn = document.getElementById(btnId);
        var chevron = document.getElementById(chevronId);
        if (!panel || !btn) return;
        var open = typeof forceOpen === 'boolean'
            ? forceOpen
            : panel.classList.contains('hidden');
        panel.classList.toggle('hidden', !open);
        btn.setAttribute('aria-expanded', open ? 'true' : 'false');
        if (chevron) chevron.textContent = open ? 'expand_less' : 'expand_more';
    }

    function wireAccordions() {
        var alunosBtn = document.getElementById('turma-acc-alunos-toggle');
        var profsBtn = document.getElementById('turma-acc-profs-toggle');
        if (alunosBtn && !alunosBtn._sigaBound) {
            alunosBtn._sigaBound = true;
            alunosBtn.addEventListener('click', function () {
                toggleAccordion('turma-acc-alunos-panel', 'turma-acc-alunos-toggle', 'turma-acc-alunos-chevron');
            });
        }
        if (profsBtn && !profsBtn._sigaBound) {
            profsBtn._sigaBound = true;
            profsBtn.addEventListener('click', function () {
                toggleAccordion('turma-acc-profs-panel', 'turma-acc-profs-toggle', 'turma-acc-profs-chevron');
            });
        }
    }

    function refreshTurmaProfessores(turmaCode) {
        if (!turmaCode) return Promise.resolve();
        return Promise.all([
            ensureLotacaoRows(),
            fetchCloudTurmaRows(turmaCode)
        ]).then(function (parts) {
            var merged = mergePreferCloud(parts[0] || [], parts[1] || []);
            var rows = rowsForTurma(merged, turmaCode);
            renderProfessoresTable(rows);
        }).catch(function () {
            renderProfessoresTable([]);
        });
    }

    function initTurmaProfessores(turmaCode) {
        wireAccordions();
        return refreshTurmaProfessores(turmaCode);
    }

    global.initTurmaProfessores = initTurmaProfessores;
    global.refreshTurmaProfessores = refreshTurmaProfessores;
    global.toggleTurmaAccordion = toggleAccordion;
})(typeof window !== 'undefined' ? window : this);
