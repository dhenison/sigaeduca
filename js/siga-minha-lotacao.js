/**
 * SIGA EDUCA — Minha Lotação (Meu Perfil)
 * Lê alocações de Gestão de Lotação (localStorage lotacao_data / INITIAL_LOTACAO_DATA)
 * e, se disponível, do Supabase (v_lotacao_mapa / lotacao_alocacoes).
 */
(function (global) {
    'use strict';

    var CH_SEMANAL_PARA_MENSAL = 5;
    var LOTACAO_DATA_KEY = 'lotacao_data';
    var DATA_SCRIPT_CANDIDATES = [
        'Gestão de Lotação/data.js',
        encodeURI('Gestão de Lotação/data.js'),
        'Gestao de Lotacao/data.js'
    ];

    function escapeHtml(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function normalizeName(s) {
        return String(s || '')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toUpperCase()
            .replace(/\s+/g, ' ')
            .trim();
    }

    function matriculaBase(s) {
        var raw = String(s || '').trim();
        if (!raw || raw === '-' || raw === '—') return '';
        var left = raw.split('-')[0];
        return left.replace(/\D/g, '');
    }

    function toNumber(v) {
        var n = Number(v);
        return Number.isFinite(n) ? n : 0;
    }

    function formatHours(n) {
        var v = Math.round(toNumber(n) * 100) / 100;
        return String(v).replace('.', ',');
    }

    function getCurrentIdentity() {
        var profile = typeof getProfileData === 'function' ? getProfileData() : null;
        var session = (profile && profile.session) || null;
        var staff = (profile && profile.staff) || null;
        try {
            if (!session) session = JSON.parse(localStorage.getItem('siga_session') || 'null');
        } catch (e) {
            session = null;
        }
        var nome = (profile && profile.name) || (session && session.nome) || '';
        var matricula =
            (staff && (staff.matriculaSemVinculo || staff.matricula || staff.employee_id)) ||
            localStorage.getItem('siga_profile_matricula') ||
            '';
        return {
            nome: nome,
            nomeNorm: normalizeName(nome),
            matricula: matriculaBase(matricula),
            email: (profile && profile.email) || (session && session.email) || ''
        };
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
                s.src = src + (src.indexOf('?') >= 0 ? '&' : '?') + 'v=20260713k';
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

    function fetchCloudLotacaoRows(identity) {
        var cloud = global.SigaSupabase;
        if (!cloud || !cloud.isConfigured || !cloud.isConfigured()) {
            return Promise.resolve([]);
        }
        var sb = cloud.getClient();
        if (!sb) return Promise.resolve([]);

        // Preferência: RPC Minha Lotação (servidor autenticado)
        return sb.rpc('minha_lotacao_rows', { p_year: new Date().getFullYear() })
            .then(function (rpcRes) {
                if (!rpcRes.error && Array.isArray(rpcRes.data) && rpcRes.data.length) {
                    return rpcRes.data.map(function (r) {
                        return {
                            turma: r.turma_code,
                            disciplina: r.disciplina,
                            codigo: r.disciplina_codigo,
                            ch_disciplina: r.ch_semanal,
                            professor: r.professor_nome,
                            matricula: r.professor_matricula,
                            ano: r.year_number,
                            _fromRpc: true
                        };
                    });
                }
                // Fallback: view do mapa filtrada no cliente
                var schoolId = '';
                try { schoolId = localStorage.getItem('siga_active_school') || ''; } catch (e) { /* ignore */ }
                if (!schoolId) return [];
                return sb.from('v_lotacao_mapa')
                    .select('turma_code,disciplina,disciplina_codigo,ch_disciplina,professor_nome,professor_matricula,year_number')
                    .eq('school_id', schoolId)
                    .then(function (res) {
                        if (res.error || !res.data) return [];
                        return (res.data || []).map(function (r) {
                            return {
                                turma: r.turma_code,
                                disciplina: r.disciplina,
                                codigo: r.disciplina_codigo,
                                ch_disciplina: r.ch_disciplina,
                                professor: r.professor_nome,
                                matricula: r.professor_matricula,
                                ano: r.year_number
                            };
                        });
                    });
            })
            .catch(function () { return []; });
    }

    function rowMatchesIdentity(row, identity) {
        if (!row || !identity) return false;
        var matRow = matriculaBase(row.matricula);
        if (identity.matricula && matRow && identity.matricula === matRow) return true;
        var nomeRow = normalizeName(row.professor);
        if (identity.nomeNorm && nomeRow && identity.nomeNorm === nomeRow) return true;
        // Correspondência parcial segura (nome completo contido)
        if (identity.nomeNorm && nomeRow && identity.nomeNorm.length >= 8 &&
            (nomeRow.indexOf(identity.nomeNorm) !== -1 || identity.nomeNorm.indexOf(nomeRow) !== -1)) {
            return true;
        }
        return false;
    }

    function buildRowsForUser(allRows, identity) {
        return (allRows || [])
            .filter(function (r) {
                var prof = String(r.professor || '').trim();
                if (!prof || prof === '-' || prof === '—') return false;
                return rowMatchesIdentity(r, identity);
            })
            .map(function (r) {
                var chSemanal = toNumber(r.ch_disciplina);
                var chMensal = chSemanal * CH_SEMANAL_PARA_MENSAL;
                return {
                    turma: r.turma || '—',
                    disciplina: r.disciplina || '—',
                    codigo: r.codigo || '—',
                    chSemanal: chSemanal,
                    chMensal: chMensal
                };
            })
            .sort(function (a, b) {
                return String(a.turma).localeCompare(String(b.turma), 'pt-BR') ||
                    String(a.disciplina).localeCompare(String(b.disciplina), 'pt-BR');
            });
    }

    function renderTable(rows) {
        var body = document.getElementById('minha-lotacao-tbody');
        var totalEl = document.getElementById('minha-lotacao-total');
        var emptyEl = document.getElementById('minha-lotacao-empty');
        var tableWrap = document.getElementById('minha-lotacao-table-wrap');
        if (!body) return;

        if (!rows.length) {
            body.innerHTML = '';
            if (totalEl) totalEl.textContent = '0';
            if (emptyEl) emptyEl.classList.remove('hidden');
            if (tableWrap) tableWrap.classList.add('hidden');
            return;
        }

        if (emptyEl) emptyEl.classList.add('hidden');
        if (tableWrap) tableWrap.classList.remove('hidden');

        var totalMensal = 0;
        body.innerHTML = rows.map(function (r) {
            totalMensal += r.chMensal;
            return (
                '<tr class="border-b border-border-subtle">' +
                '<td class="px-3 py-2.5 text-sm font-semibold text-on-surface whitespace-nowrap">' + escapeHtml(r.turma) + '</td>' +
                '<td class="px-3 py-2.5 text-sm text-on-surface">' + escapeHtml(r.disciplina) + '</td>' +
                '<td class="px-3 py-2.5 text-sm font-mono text-primary">' + escapeHtml(r.codigo) + '</td>' +
                '<td class="px-3 py-2.5 text-sm text-right tabular-nums">' + escapeHtml(formatHours(r.chSemanal)) + 'h</td>' +
                '<td class="px-3 py-2.5 text-sm text-right tabular-nums font-semibold">' + escapeHtml(formatHours(r.chMensal)) + 'h</td>' +
                '</tr>'
            );
        }).join('');

        if (totalEl) totalEl.textContent = formatHours(totalMensal) + 'h';
    }

    function setLoading(isLoading) {
        var loading = document.getElementById('minha-lotacao-loading');
        if (loading) loading.classList.toggle('hidden', !isLoading);
    }

    function togglePanel(forceOpen) {
        var panel = document.getElementById('minha-lotacao-panel');
        var btn = document.getElementById('minha-lotacao-toggle');
        var icon = document.getElementById('minha-lotacao-chevron');
        if (!panel || !btn) return;
        var open = typeof forceOpen === 'boolean'
            ? forceOpen
            : panel.classList.contains('hidden');
        panel.classList.toggle('hidden', !open);
        btn.setAttribute('aria-expanded', open ? 'true' : 'false');
        if (icon) icon.textContent = open ? 'expand_less' : 'expand_more';
        if (open) refreshMinhaLotacao();
    }

    function refreshMinhaLotacao() {
        var identity = getCurrentIdentity();
        var nameEl = document.getElementById('minha-lotacao-professor');
        if (nameEl) nameEl.textContent = identity.nome || 'Servidor';

        setLoading(true);
        Promise.all([
            ensureLotacaoRows(),
            fetchCloudLotacaoRows(identity)
        ]).then(function (parts) {
            var localRows = parts[0] || [];
            var cloudRows = parts[1] || [];
            if (cloudRows.length && cloudRows[0] && cloudRows[0]._fromRpc) {
                var mineRpc = cloudRows.map(function (r) {
                    var chSemanal = toNumber(r.ch_disciplina);
                    return {
                        turma: r.turma || '—',
                        disciplina: r.disciplina || '—',
                        codigo: r.codigo || '—',
                        chSemanal: chSemanal,
                        chMensal: chSemanal * CH_SEMANAL_PARA_MENSAL
                    };
                });
                if (mineRpc.length) {
                    renderTable(mineRpc);
                    return;
                }
            }
            var all = (cloudRows && cloudRows.length && !(cloudRows[0] && cloudRows[0]._fromRpc))
                ? cloudRows.concat(localRows)
                : localRows;
            var seen = {};
            var deduped = [];
            all.forEach(function (r) {
                var key = [r.turma, r.disciplina, r.codigo, r.matricula].join('|');
                if (seen[key]) return;
                seen[key] = true;
                deduped.push(r);
            });
            var mine = buildRowsForUser(deduped, identity);
            renderTable(mine);
        }).catch(function () {
            renderTable([]);
        }).finally(function () {
            setLoading(false);
        });
    }

    function initMinhaLotacao() {
        var root = document.getElementById('minha-lotacao-root');
        if (!root) return;
        var btn = document.getElementById('minha-lotacao-toggle');
        if (btn) {
            btn.addEventListener('click', function () {
                togglePanel();
            });
        }
        var identity = getCurrentIdentity();
        var nameEl = document.getElementById('minha-lotacao-professor');
        if (nameEl) nameEl.textContent = identity.nome || 'Servidor';

        // Garante cache de Usuários (matrícula) para o cruzamento com a lotação
        var staffApi = global.SigaStaffData;
        if (staffApi && typeof staffApi.hydrateStaff === 'function') {
            staffApi.hydrateStaff().catch(function () { /* ignore */ });
        }
    }

    global.initMinhaLotacao = initMinhaLotacao;
    global.refreshMinhaLotacao = refreshMinhaLotacao;

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initMinhaLotacao);
    } else {
        initMinhaLotacao();
    }
})(typeof window !== 'undefined' ? window : this);
