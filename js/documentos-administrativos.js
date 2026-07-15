/**
 * SIGA EDUCA — Documentos Administrativos (Gestão Escolar)
 * Requerimento Padrão, Ofício e Memorando (editável + impressão) + histórico
 */
(function (global) {
    'use strict';

    var STORAGE_KEY = 'siga_documentos_administrativos';
    var COUNTERS_KEY = 'siga_adm_doc_counters';
    var TIPO_REQ = 'Requerimento Padrão';
    var TIPO_OFICIO = 'Ofício';
    var TIPO_MEMORANDO = 'Memorando';
    var DE_PADRAO = 'Escola Estadual Dr Romildo Veloso e Silva';
    var OFICIO_START = 35;
    var MEMORANDO_START = 47;
    var MESES_PT = [
        'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
        'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'
    ];

    var DOC_TYPES = [
        { id: 'requerimento_padrao', label: TIPO_REQ, icon: 'request_page', ready: true },
        { id: 'oficio', label: TIPO_OFICIO, icon: 'mail', ready: true },
        { id: 'memorando', label: TIPO_MEMORANDO, icon: 'sticky_note_2', ready: true },
        { id: 'ata_conselho', label: 'ATA Conselho', icon: 'groups', ready: false },
        { id: 'ata_administrativa', label: 'ATA Administrativa', icon: 'assignment', ready: false },
        { id: 'ata_conselho_escolar', label: 'ATA de Conselho Escolar', icon: 'diversity_3', ready: false },
        { id: 'paf', label: 'PAF', icon: 'account_balance_wallet', ready: false },
        { id: 'termo_autorizacao', label: 'Termo de Autorização', icon: 'verified_user', ready: false },
        { id: 'freq_guardas', label: 'Frequência Guardas', icon: 'security', ready: false },
        { id: 'freq_semed', label: 'Frequência SEMED', icon: 'domain', ready: false },
        { id: 'freq_professores', label: 'Frequência Professores', icon: 'school', ready: false },
        { id: 'folha_ponto', label: 'Folha de Ponto', icon: 'timer', ready: false }
    ];

    /** Pedidos oficiais — organizados a partir do PDF Requerimento Padrão */
    var PEDIDOS = [
        { id: 'atualizacao_cadastral', label: 'Atualização cadastral', group: 'Cadastro e vínculos' },
        { id: 'averbacao', label: 'Averbação', group: 'Cadastro e vínculos' },
        { id: 'copia_contrato', label: 'Cópia de contrato', group: 'Cadastro e vínculos' },
        { id: 'copia_processo', label: 'Cópia de processo', group: 'Cadastro e vínculos', hasNumero: true },
        { id: 'distrato', label: 'Distrato', group: 'Cadastro e vínculos' },
        { id: 'declaracao_tempo_servico', label: 'Declaração de tempo de serviço', group: 'Cadastro e vínculos' },
        { id: 'gratificacao_titularidade', label: 'Gratificação de titularidade', group: 'Cadastro e vínculos' },
        { id: 'portaria_estagio_probatorio', label: 'Portaria de conclusão de estágio probatório', group: 'Cadastro e vínculos' },
        { id: 'revisao_pagamento', label: 'Revisão de pagamento (contra-cheque)', group: 'Cadastro e vínculos' },
        { id: 'verbas_recisorias', label: 'Verbas rescisórias', group: 'Cadastro e vínculos' },
        { id: 'remocao', label: 'Remoção', group: 'Cadastro e vínculos' },
        { id: 'lotacao', label: 'Lotação', group: 'Cadastro e vínculos' },
        { id: 'auxilio_funeral', label: 'Auxílio funeral', group: 'Cadastro e vínculos' },
        { id: 'ferias', label: 'Férias', group: 'Licenças e afastamentos', hasPeriodo: true },
        { id: 'licenca_especial', label: 'Licença especial', group: 'Licenças e afastamentos', hasPeriodo: true },
        { id: 'licenca_sem_vencimento', label: 'Licença sem vencimento', group: 'Licenças e afastamentos', hasPeriodo: true },
        { id: 'licenca_aprimoramento', label: 'Licença aprimoramento', group: 'Licenças e afastamentos', hasPeriodo: true },
        { id: 'licenca_saude', label: 'Licença saúde', group: 'Licenças e afastamentos' },
        { id: 'pericia_medica', label: 'Perícia médica', group: 'Licenças e afastamentos' },
        { id: 'reducao_jornada', label: 'Redução de jornada (Lei Estadual 9.313/2021)', group: 'Licenças e afastamentos' },
        { id: 'pecunia', label: 'Pecúnia', group: 'Outros pedidos' },
        { id: 'readaptacao', label: 'Readaptação', group: 'Outros pedidos' },
        { id: 'exoneracao', label: 'Exoneração', group: 'Outros pedidos', hasDataUnica: true },
        { id: 'acompanhante_pcd', label: 'Acompanhante para aluno PCD (Lei 13.146/2015)', group: 'Outros pedidos' },
        { id: 'outro', label: 'Outro', group: 'Outros pedidos', hasTexto: true }
    ];

    var editingId = null;
    var editingKind = null; // 'requerimento' | 'oficio' | 'memorando'
    var filterState = { tipo: '', usuario: '', data: '', requerente: '' };
    var HIST_TABS = [
        { value: '', label: 'Todos' },
        { value: TIPO_REQ, label: 'Requerimento' },
        { value: TIPO_OFICIO, label: 'Ofício' },
        { value: TIPO_MEMORANDO, label: 'Memorando' }
    ];

    function toast(msg, type) {
        if (typeof showToast === 'function') showToast(msg, type || 'success');
        else alert(msg);
    }

    function escapeHtml(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function uid() {
        return 'adm-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
    }

    function getSession() {
        try {
            return JSON.parse(localStorage.getItem('siga_session') || 'null') || {};
        } catch (e) {
            return {};
        }
    }

    function sessionRole() {
        var s = getSession();
        if (s.sistemaAdmin || s.tipo === 'sistema') return 'Administrador do Sistema';
        return String(s.role || s.cargo || '');
    }

    function sessionUserName() {
        var s = getSession();
        return String(s.nome || s.name || s.email || 'Usuário').trim() || 'Usuário';
    }

    function isGestorEscolar(role) {
        var r = String(role || '').toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '');
        if (!r) return false;
        if (/administrador/.test(r) && !/vice/.test(r)) return true;
        if (/vice-diretor administrativo/.test(r)) return true;
        if (/vice-diretor pedag/.test(r)) return true;
        if (/diretor/.test(r) && !/vice/.test(r)) return true;
        return false;
    }

    function ensureAccess() {
        if (isGestorEscolar(sessionRole())) return true;
        toast('Acesso restrito a gestores escolares (Diretor e Vice-diretores).', 'error');
        setTimeout(function () { window.location.href = 'painelprincipal.html'; }, 600);
        return false;
    }

    function getActiveSchoolId() {
        try {
            var fromLs = localStorage.getItem('siga_active_school') || '';
            if (fromLs) return fromLs;
            var session = JSON.parse(localStorage.getItem('siga_session') || 'null') || {};
            if (session.schoolId) {
                localStorage.setItem('siga_active_school', session.schoolId);
                return session.schoolId;
            }
        } catch (e) { /* ignore */ }
        return '';
    }

    function resolveSchoolIdAsync() {
        var current = getActiveSchoolId();
        if (current) return Promise.resolve(current);

        var session = null;
        try { session = JSON.parse(localStorage.getItem('siga_session') || 'null'); } catch (e) { session = null; }

        if (!global.SigaSupabase || typeof global.SigaSupabase.getUser !== 'function') {
            return Promise.resolve('');
        }

        return global.SigaSupabase.getUser().then(function (user) {
            if (!user) return '';
            var profile = typeof global.SigaSupabase.getCachedProfile === 'function'
                ? global.SigaSupabase.getCachedProfile()
                : null;
            if (typeof global.SigaSupabase.bindActiveSchoolContext === 'function') {
                return global.SigaSupabase.bindActiveSchoolContext(user, profile, session || {}).then(function (bound) {
                    return (bound && bound.schoolId) || getActiveSchoolId() || '';
                });
            }
            if (typeof global.SigaSupabase.resolveStaffSchoolId === 'function') {
                return global.SigaSupabase.resolveStaffSchoolId(user, profile).then(function (id) {
                    if (id) {
                        try { localStorage.setItem('siga_active_school', id); } catch (e2) { /* ignore */ }
                    }
                    return id || '';
                });
            }
            return '';
        }).catch(function () {
            return getActiveSchoolId() || '';
        });
    }

    function getSupabaseClient() {
        if (global.SigaSupabase && typeof global.SigaSupabase.getClient === 'function') {
            try { return global.SigaSupabase.getClient(); } catch (e) { return null; }
        }
        return null;
    }

    function getDocs() {
        try {
            var list = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
            return Array.isArray(list) ? list : [];
        } catch (e) {
            return [];
        }
    }

    function saveDocs(list) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.isArray(list) ? list : []));
    }

    function getCounters() {
        try {
            var c = JSON.parse(localStorage.getItem(COUNTERS_KEY) || 'null') || {};
            var oficio = parseInt(c.oficio, 10);
            var memorando = parseInt(c.memorando, 10);
            return {
                oficio: isNaN(oficio) || oficio < OFICIO_START ? OFICIO_START : oficio,
                memorando: isNaN(memorando) || memorando < MEMORANDO_START ? MEMORANDO_START : memorando
            };
        } catch (e) {
            return { oficio: OFICIO_START, memorando: MEMORANDO_START };
        }
    }

    function saveCounters(c) {
        localStorage.setItem(COUNTERS_KEY, JSON.stringify({
            oficio: c.oficio,
            memorando: c.memorando
        }));
        syncCountersCloud(c);
    }

    function syncCountersCloud(c) {
        var sb = getSupabaseClient();
        var schoolId = getActiveSchoolId();
        if (!sb || !schoolId || !c) return Promise.resolve({ ok: false });
        var rows = [
            { school_id: schoolId, kind: 'oficio', next_number: c.oficio, updated_at: new Date().toISOString() },
            { school_id: schoolId, kind: 'memorando', next_number: c.memorando, updated_at: new Date().toISOString() }
        ];
        return sb.from('admin_doc_counters')
            .upsert(rows, { onConflict: 'school_id,kind' })
            .then(function (res) {
                if (res.error) {
                    console.warn('[SIGA] sync admin_doc_counters:', res.error.message);
                    return { ok: false };
                }
                return { ok: true };
            })
            .catch(function (err) {
                console.warn('[SIGA] sync admin_doc_counters:', err);
                return { ok: false };
            });
    }

    function syncAdminDocCloud(doc) {
        var sb = getSupabaseClient();
        if (!sb || !doc || !doc.id) {
            return Promise.resolve({ ok: false, reason: 'no_cloud' });
        }
        return resolveSchoolIdAsync().then(function (schoolId) {
            if (!schoolId) return { ok: false, reason: 'no_school' };
            var row = {
                school_id: schoolId,
                local_id: doc.id,
                doc_type: doc.tipo || '',
                destinatario: doc.requerente || null,
                emitido_por: doc.emitidoPor || null,
                numero: doc.dados && doc.dados.numero != null ? doc.dados.numero : null,
                ano: doc.dados && doc.dados.ano ? String(doc.dados.ano) : null,
                dados: doc.dados || {},
                created_at: doc.createdAt || new Date().toISOString(),
                updated_at: doc.updatedAt || new Date().toISOString()
            };
            return sb.from('admin_school_documents')
                .upsert(row, { onConflict: 'school_id,local_id' })
                .then(function (res) {
                    if (res.error) {
                        console.warn('[SIGA] sync admin_school_documents:', res.error.message);
                        return { ok: false, message: res.error.message };
                    }
                    return { ok: true };
                });
        }).catch(function (err) {
            console.warn('[SIGA] sync admin_school_documents:', err);
            return { ok: false, message: (err && err.message) || 'erro' };
        });
    }

    function deleteAdminDocCloud(localId) {
        var sb = getSupabaseClient();
        var schoolId = getActiveSchoolId();
        if (!sb || !schoolId || !localId) return Promise.resolve({ ok: true, reason: 'no_cloud' });
        return sb.from('admin_school_documents')
            .delete()
            .eq('school_id', schoolId)
            .eq('local_id', localId)
            .then(function (res) {
                if (res.error) {
                    console.warn('[SIGA] delete admin_school_documents:', res.error.message);
                    return { ok: false, message: res.error.message };
                }
                return { ok: true };
            })
            .catch(function (err) {
                console.warn('[SIGA] delete admin_school_documents:', err);
                return { ok: false, message: (err && err.message) || 'erro' };
            });
    }

    function mapAdminCloudRow(row) {
        if (!row) return null;
        return {
            id: row.local_id,
            tipo: row.doc_type,
            requerente: row.destinatario || '',
            emitidoPor: row.emitido_por || '',
            createdAt: row.created_at,
            updatedAt: row.updated_at,
            dados: row.dados || {}
        };
    }

    function loadAdminDocsFromCloud() {
        var sb = getSupabaseClient();
        if (!sb) return Promise.resolve({ ok: false, reason: 'no_cloud' });

        return resolveSchoolIdAsync().then(function (schoolId) {
            if (!schoolId) return { ok: false, reason: 'no_school' };

            var localList = getDocs();
            var migrate = (localList || []).map(function (doc) { return syncAdminDocCloud(doc); });

            return Promise.all(migrate).then(function () {
                return Promise.all([
                    sb.from('admin_school_documents')
                        .select('*')
                        .eq('school_id', schoolId)
                        .order('created_at', { ascending: false }),
                    sb.from('admin_doc_counters')
                        .select('*')
                        .eq('school_id', schoolId)
                ]);
            }).then(function (results) {
                var docsRes = results[0];
                var countersRes = results[1];
                if (docsRes.error) {
                    console.warn('[SIGA] load admin_school_documents:', docsRes.error.message);
                    return { ok: false, message: docsRes.error.message };
                }
                var list = (docsRes.data || []).map(mapAdminCloudRow).filter(Boolean);
                saveDocs(list);

                var c = getCounters();
                if (countersRes && !countersRes.error && countersRes.data) {
                    countersRes.data.forEach(function (row) {
                        if (row.kind === 'oficio' && row.next_number >= OFICIO_START) c.oficio = row.next_number;
                        if (row.kind === 'memorando' && row.next_number >= MEMORANDO_START) c.memorando = row.next_number;
                    });
                }
                localStorage.setItem(COUNTERS_KEY, JSON.stringify({ oficio: c.oficio, memorando: c.memorando }));
                syncCountersCloud(c);
                return { ok: true, count: list.length, schoolId: schoolId };
            });
        }).catch(function (err) {
            console.warn('[SIGA] load admin docs:', err);
            return { ok: false, message: (err && err.message) || 'erro' };
        });
    }

    function peekNumero(kind) {
        var c = getCounters();
        return kind === 'oficio' ? c.oficio : c.memorando;
    }

    function yearFromIso(iso) {
        var y = String(iso || '').slice(0, 4);
        if (/^\d{4}$/.test(y)) return y;
        return String(new Date().getFullYear());
    }

    function formatLocalExtenso(iso) {
        var raw = String(iso || '').slice(0, 10);
        var parts = raw.split('-');
        var d, m, y;
        if (parts.length === 3) {
            y = parseInt(parts[0], 10);
            m = parseInt(parts[1], 10);
            d = parseInt(parts[2], 10);
        } else {
            var now = new Date();
            y = now.getFullYear();
            m = now.getMonth() + 1;
            d = now.getDate();
        }
        var mes = MESES_PT[m - 1] || '';
        return 'Ourilândia do Norte, ' + d + ' de ' + mes + ' de ' + y;
    }

    function tituloDocumento(kind, numero, ano) {
        var n = numero != null ? String(numero) : '';
        var a = ano || String(new Date().getFullYear());
        if (kind === 'memorando') return 'MEMORANDO Nº ' + n + '/' + a;
        return 'OFÍCIO Nº ' + n + '/' + a;
    }

    function emptyForm() {
        var pedidos = {};
        PEDIDOS.forEach(function (p) {
            pedidos[p.id] = {
                checked: false,
                numero: '',
                totalDias: '',
                dataInicio: '',
                dataFim: '',
                dataUnica: '',
                texto: ''
            };
        });
        return {
            tipo: TIPO_REQ,
            nomeRequerente: '',
            matricula: '',
            cpf: '',
            dataNascimento: '',
            telefone: '',
            categoria: '',
            cargo: '',
            funcao: '',
            email: '',
            vinculo: '',
            dre: '',
            lotacao: '',
            pedidos: pedidos,
            infoComplementares: '',
            justificativa: '',
            municipioUf: '',
            dataDocumento: new Date().toISOString().slice(0, 10)
        };
    }

    function emptyOmForm(kind) {
        return {
            tipo: kind === 'memorando' ? TIPO_MEMORANDO : TIPO_OFICIO,
            kind: kind === 'memorando' ? 'memorando' : 'oficio',
            numero: null,
            ano: yearFromIso(new Date().toISOString()),
            dataDocumento: new Date().toISOString().slice(0, 10),
            de: DE_PADRAO,
            para: '',
            corpo: ''
        };
    }

    function $(id) {
        return document.getElementById(id);
    }

    function renderTypes() {
        var host = $('adm-doc-types');
        if (!host) return;
        host.innerHTML = DOC_TYPES.map(function (t) {
            var btn = t.ready
                ? '<button type="button" data-open-type="' + escapeHtml(t.id) + '" class="mt-auto w-full py-2.5 rounded-xl bg-primary text-white text-label-md font-semibold hover:bg-primary/90 transition-colors">Preencher / Emitir</button>'
                : '<button type="button" class="mt-auto w-full py-2.5 rounded-xl border border-border-subtle text-label-md font-semibold text-text-secondary cursor-not-allowed opacity-70" disabled>Em configuração</button>';
            return [
                '<article class="bg-white border border-border-subtle rounded-2xl p-5 custom-shadow flex flex-col gap-3 hover:border-primary/40 transition-colors">',
                '<div class="w-11 h-11 rounded-xl bg-primary/10 text-primary flex items-center justify-center">',
                '<span class="material-symbols-outlined text-[24px]">', escapeHtml(t.icon), '</span></div>',
                '<div class="flex-1"><h3 class="font-headline-sm text-on-surface">', escapeHtml(t.label), '</h3>',
                '<p class="text-label-sm text-text-secondary mt-1">',
                t.ready ? 'Modelo editável disponível para preenchimento e impressão.' : 'Documento administrativo — atribuições em breve.',
                '</p></div>', btn, '</article>'
            ].join('');
        }).join('');

        host.querySelectorAll('[data-open-type]').forEach(function (btn) {
            btn.addEventListener('click', function () {
                var type = btn.getAttribute('data-open-type');
                if (type === 'requerimento_padrao') openForm();
                else if (type === 'oficio') openOmForm('oficio');
                else if (type === 'memorando') openOmForm('memorando');
            });
        });
    }

    function buildPedidosHtml(data) {
        var groups = [];
        PEDIDOS.forEach(function (p) {
            if (groups.indexOf(p.group) < 0) groups.push(p.group);
        });
        return groups.map(function (g) {
            var items = PEDIDOS.filter(function (p) { return p.group === g; });
            return [
                '<div class="space-y-3">',
                '<h4 class="text-[11px] font-bold uppercase tracking-widest text-primary">', escapeHtml(g), '</h4>',
                '<div class="grid grid-cols-1 md:grid-cols-2 gap-3">',
                items.map(function (p) {
                    var st = (data.pedidos && data.pedidos[p.id]) || {};
                    var extra = '';
                    if (p.hasNumero) {
                        extra += '<input data-pedido-extra="' + p.id + '" data-field="numero" type="text" placeholder="Nº do processo" class="mt-2 w-full px-3 py-2 border border-border-subtle rounded-lg text-sm" value="' + escapeHtml(st.numero || '') + '"/>';
                    }
                    if (p.hasPeriodo) {
                        extra += '<div class="mt-2 grid grid-cols-3 gap-2">' +
                            '<input data-pedido-extra="' + p.id + '" data-field="totalDias" type="text" placeholder="Total dias" class="px-2 py-2 border border-border-subtle rounded-lg text-sm" value="' + escapeHtml(st.totalDias || '') + '"/>' +
                            '<input data-pedido-extra="' + p.id + '" data-field="dataInicio" type="date" class="px-2 py-2 border border-border-subtle rounded-lg text-sm" value="' + escapeHtml(st.dataInicio || '') + '"/>' +
                            '<input data-pedido-extra="' + p.id + '" data-field="dataFim" type="date" class="px-2 py-2 border border-border-subtle rounded-lg text-sm" value="' + escapeHtml(st.dataFim || '') + '"/>' +
                            '</div>';
                    }
                    if (p.hasDataUnica) {
                        extra += '<input data-pedido-extra="' + p.id + '" data-field="dataUnica" type="date" class="mt-2 w-full px-3 py-2 border border-border-subtle rounded-lg text-sm" value="' + escapeHtml(st.dataUnica || '') + '"/>';
                    }
                    if (p.hasTexto) {
                        extra += '<input data-pedido-extra="' + p.id + '" data-field="texto" type="text" placeholder="Descreva o pedido" class="mt-2 w-full px-3 py-2 border border-border-subtle rounded-lg text-sm" value="' + escapeHtml(st.texto || '') + '"/>';
                    }
                    return [
                        '<label class="block p-3 rounded-xl border border-border-subtle hover:bg-surface-container-low/60 cursor-pointer">',
                        '<div class="flex items-start gap-2">',
                        '<input type="checkbox" data-pedido="', p.id, '" class="mt-1 rounded border-border-subtle text-primary"', st.checked ? ' checked' : '', '/>',
                        '<span class="text-sm text-on-surface">', escapeHtml(p.label), '</span></div>',
                        extra, '</label>'
                    ].join('');
                }).join(''),
                '</div></div>'
            ].join('');
        }).join('');
    }

    function fillForm(data) {
        $('adm-req-nome').value = data.nomeRequerente || '';
        $('adm-req-matricula').value = data.matricula || '';
        $('adm-req-cpf').value = data.cpf || '';
        $('adm-req-nasc').value = data.dataNascimento || '';
        $('adm-req-tel').value = data.telefone || '';
        $('adm-req-cargo').value = data.cargo || '';
        $('adm-req-funcao').value = data.funcao || '';
        $('adm-req-email').value = data.email || '';
        $('adm-req-dre').value = data.dre || '';
        $('adm-req-lotacao').value = data.lotacao || '';
        $('adm-req-info').value = data.infoComplementares || '';
        $('adm-req-just').value = data.justificativa || '';
        $('adm-req-local').value = data.municipioUf || '';
        $('adm-req-data').value = data.dataDocumento || '';

        document.querySelectorAll('input[name="adm-req-categoria"]').forEach(function (el) {
            el.checked = el.value === data.categoria;
        });
        document.querySelectorAll('input[name="adm-req-vinculo"]').forEach(function (el) {
            el.checked = el.value === data.vinculo;
        });

        var host = $('adm-req-pedidos');
        if (host) host.innerHTML = buildPedidosHtml(data);
    }

    function readForm() {
        var base = emptyForm();
        base.nomeRequerente = ($('adm-req-nome').value || '').trim();
        base.matricula = ($('adm-req-matricula').value || '').trim();
        base.cpf = ($('adm-req-cpf').value || '').trim();
        base.dataNascimento = $('adm-req-nasc').value || '';
        base.telefone = ($('adm-req-tel').value || '').trim();
        base.cargo = ($('adm-req-cargo').value || '').trim();
        base.funcao = ($('adm-req-funcao').value || '').trim();
        base.email = ($('adm-req-email').value || '').trim();
        base.dre = ($('adm-req-dre').value || '').trim();
        base.lotacao = ($('adm-req-lotacao').value || '').trim();
        base.infoComplementares = ($('adm-req-info').value || '').trim();
        base.justificativa = ($('adm-req-just').value || '').trim();
        base.municipioUf = ($('adm-req-local').value || '').trim();
        base.dataDocumento = $('adm-req-data').value || '';

        var cat = document.querySelector('input[name="adm-req-categoria"]:checked');
        var vin = document.querySelector('input[name="adm-req-vinculo"]:checked');
        base.categoria = cat ? cat.value : '';
        base.vinculo = vin ? vin.value : '';

        document.querySelectorAll('[data-pedido]').forEach(function (cb) {
            var id = cb.getAttribute('data-pedido');
            base.pedidos[id].checked = !!cb.checked;
        });
        document.querySelectorAll('[data-pedido-extra]').forEach(function (inp) {
            var id = inp.getAttribute('data-pedido-extra');
            var field = inp.getAttribute('data-field');
            if (base.pedidos[id] && field) base.pedidos[id][field] = inp.value || '';
        });
        return base;
    }

    function openForm(doc) {
        editingId = doc && doc.id ? doc.id : null;
        editingKind = 'requerimento';
        var data = doc && doc.dados ? Object.assign(emptyForm(), doc.dados) : emptyForm();
        if (doc && doc.dados && doc.dados.pedidos) {
            data.pedidos = Object.assign(emptyForm().pedidos, doc.dados.pedidos);
        }
        fillForm(data);
        var title = $('adm-req-modal-title');
        if (title) title.textContent = editingId ? 'Editar Requerimento Padrão' : 'Novo Requerimento Padrão';
        var modal = $('adm-req-modal');
        if (modal) modal.classList.remove('hidden');
    }

    function closeForm() {
        editingId = null;
        editingKind = null;
        var modal = $('adm-req-modal');
        if (modal) modal.classList.add('hidden');
    }

    function validateForm(data) {
        if (!data.nomeRequerente) return 'Informe o nome do requerente.';
        var algum = PEDIDOS.some(function (p) { return data.pedidos[p.id] && data.pedidos[p.id].checked; });
        if (!algum) return 'Selecione ao menos um pedido.';
        return '';
    }

    function saveForm(andPrint) {
        var data = readForm();
        var err = validateForm(data);
        if (err) {
            toast(err, 'error');
            return;
        }
        var list = getDocs();
        var now = new Date().toISOString();
        if (editingId) {
            var idx = list.findIndex(function (d) { return d.id === editingId; });
            if (idx >= 0) {
                list[idx].dados = data;
                list[idx].requerente = data.nomeRequerente;
                list[idx].tipo = TIPO_REQ;
                list[idx].updatedAt = now;
            }
        } else {
            list.unshift({
                id: uid(),
                tipo: TIPO_REQ,
                requerente: data.nomeRequerente,
                emitidoPor: sessionUserName(),
                createdAt: now,
                updatedAt: now,
                dados: data
            });
        }
        saveDocs(list);
        var saved = editingId
            ? list.find(function (d) { return d.id === editingId; })
            : list[0];
        if (saved) syncAdminDocCloud(saved);
        toast(editingId ? 'Requerimento atualizado e salvo no banco.' : 'Requerimento emitido e salvo no banco de dados.');
        filterState.tipo = TIPO_REQ;
        renderHistory();
        if (andPrint) {
            printRequerimento(data);
        }
        closeForm();
    }

    function syncOmTituloPreview() {
        var kind = editingKind === 'memorando' ? 'memorando' : 'oficio';
        var numEl = $('adm-om-numero');
        var dataEl = $('adm-om-data');
        var tituloEl = $('adm-om-titulo-preview');
        var num = numEl ? parseInt(numEl.value, 10) : peekNumero(kind);
        if (isNaN(num)) num = peekNumero(kind);
        var ano = yearFromIso(dataEl && dataEl.value);
        if (tituloEl) tituloEl.textContent = tituloDocumento(kind, num, ano);
        var localEl = $('adm-om-local-preview');
        if (localEl) localEl.textContent = formatLocalExtenso(dataEl && dataEl.value);
    }

    function stripHtmlText(html) {
        var div = document.createElement('div');
        div.innerHTML = String(html == null ? '' : html);
        return String(div.textContent || div.innerText || '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
    }

    function sanitizeCorpoHtml(html) {
        var root = document.createElement('div');
        root.innerHTML = String(html == null ? '' : html);
        var allowed = { b: 1, strong: 1, i: 1, em: 1, u: 1, br: 1, div: 1, p: 1 };

        function isBoldSpan(el) {
            if (!el || el.tagName.toLowerCase() !== 'span') return false;
            var fw = String(el.style && el.style.fontWeight || '').toLowerCase();
            return fw === 'bold' || parseInt(fw, 10) >= 600;
        }

        function clean(node) {
            Array.prototype.slice.call(node.childNodes).forEach(function (child) {
                if (child.nodeType === 8) {
                    node.removeChild(child);
                    return;
                }
                if (child.nodeType !== 1) return;
                var tag = child.tagName.toLowerCase();
                if (isBoldSpan(child)) {
                    var strong = document.createElement('strong');
                    while (child.firstChild) strong.appendChild(child.firstChild);
                    node.replaceChild(strong, child);
                    clean(strong);
                    return;
                }
                if (!allowed[tag]) {
                    while (child.firstChild) node.insertBefore(child.firstChild, child);
                    node.removeChild(child);
                    return;
                }
                while (child.attributes && child.attributes.length) {
                    child.removeAttribute(child.attributes[0].name);
                }
                clean(child);
            });
        }

        clean(root);
        return root.innerHTML
            .replace(/^(<br\s*\/?>|\s|&nbsp;)+/i, '')
            .replace(/(<br\s*\/?>|\s|&nbsp;)+$/i, '')
            .trim();
    }

    function corpoToEditorHtml(raw) {
        var s = String(raw == null ? '' : raw);
        if (!s) return '';
        if (/<[a-z][\s\S]*>/i.test(s)) return sanitizeCorpoHtml(s);
        return escapeHtml(s).replace(/\r\n|\r|\n/g, '<br>');
    }

    function getCorpoHtmlForPrint(raw) {
        var s = String(raw == null ? '' : raw);
        if (!s) return '';
        if (/<[a-z][\s\S]*>/i.test(s)) return sanitizeCorpoHtml(s);
        return escapeHtml(s).replace(/\r\n|\r|\n/g, '<br/>');
    }

    /** Quebra o corpo em parágrafos com recuo (TAB) no início para impressão. */
    function formatCorpoParagraphsForPrint(raw) {
        var sanitized = getCorpoHtmlForPrint(raw);
        if (!sanitized) return '';

        var root = document.createElement('div');
        root.innerHTML = sanitized;
        var blocks = [];
        var buf = '';

        function pushBuf() {
            var inner = buf.replace(/^(<br\s*\/?>|\s|&nbsp;)+|(<br\s*\/?>|\s|&nbsp;)+$/gi, '').trim();
            buf = '';
            if (stripHtmlText(inner)) blocks.push('<p>' + inner + '</p>');
        }

        Array.prototype.forEach.call(root.childNodes, function (node) {
            if (node.nodeType === 1) {
                var tag = node.tagName.toLowerCase();
                if (tag === 'br') {
                    pushBuf();
                    return;
                }
                if (tag === 'div' || tag === 'p') {
                    pushBuf();
                    var inner = sanitizeCorpoHtml(node.innerHTML);
                    if (stripHtmlText(inner)) blocks.push('<p>' + inner + '</p>');
                    return;
                }
                buf += node.outerHTML;
                return;
            }
            if (node.nodeType === 3) {
                buf += escapeHtml(node.nodeValue || '');
            }
        });
        pushBuf();
        if (!blocks.length && stripHtmlText(sanitized)) {
            return '<p>' + sanitized + '</p>';
        }
        return blocks.join('');
    }

    function fillOmForm(data) {
        var kind = data.kind === 'memorando' ? 'memorando' : 'oficio';
        if ($('adm-om-numero')) $('adm-om-numero').value = data.numero != null ? String(data.numero) : String(peekNumero(kind));
        if ($('adm-om-data')) $('adm-om-data').value = data.dataDocumento || new Date().toISOString().slice(0, 10);
        if ($('adm-om-de')) $('adm-om-de').value = data.de || DE_PADRAO;
        if ($('adm-om-para')) $('adm-om-para').value = data.para || '';
        var corpoEl = $('adm-om-corpo');
        if (corpoEl) corpoEl.innerHTML = corpoToEditorHtml(data.corpo || '');
        syncOmTituloPreview();
    }

    function readOmForm() {
        var kind = editingKind === 'memorando' ? 'memorando' : 'oficio';
        var data = emptyOmForm(kind);
        data.dataDocumento = ($('adm-om-data') && $('adm-om-data').value) || data.dataDocumento;
        data.ano = yearFromIso(data.dataDocumento);
        data.de = DE_PADRAO;
        data.para = ($('adm-om-para') && $('adm-om-para').value || '').trim();
        data.corpo = sanitizeCorpoHtml($('adm-om-corpo') ? $('adm-om-corpo').innerHTML : '');
        var n = parseInt($('adm-om-numero') && $('adm-om-numero').value, 10);
        data.numero = isNaN(n) ? null : n;
        return data;
    }

    function openOmForm(kind, doc) {
        kind = kind === 'memorando' ? 'memorando' : 'oficio';
        editingId = doc && doc.id ? doc.id : null;
        editingKind = kind;
        var data = doc && doc.dados
            ? Object.assign(emptyOmForm(kind), doc.dados, { kind: kind, tipo: kind === 'memorando' ? TIPO_MEMORANDO : TIPO_OFICIO })
            : emptyOmForm(kind);
        if (!editingId) {
            data.numero = peekNumero(kind);
        }
        fillOmForm(data);
        var label = kind === 'memorando' ? TIPO_MEMORANDO : TIPO_OFICIO;
        var title = $('adm-om-modal-title');
        if (title) title.textContent = editingId ? ('Editar ' + label) : ('Novo ' + label);
        var hint = $('adm-om-hint');
        if (hint) {
            hint.textContent = kind === 'memorando'
                ? 'Modelo no papel timbrado da escola. Numeração inicia em 47 e avança a cada novo memorando.'
                : 'Modelo no papel timbrado da escola. Numeração inicia em 35 e avança a cada novo ofício.';
        }
        var modal = $('adm-om-modal');
        if (modal) modal.classList.remove('hidden');
    }

    function closeOmForm() {
        editingId = null;
        editingKind = null;
        var modal = $('adm-om-modal');
        if (modal) modal.classList.add('hidden');
    }

    function validateOmForm(data) {
        if (!stripHtmlText(data.corpo)) return 'Escreva o corpo do texto.';
        if (data.numero == null || isNaN(data.numero)) return 'Número do documento inválido.';
        return '';
    }

    function saveOmForm(andPrint) {
        var kind = editingKind === 'memorando' ? 'memorando' : 'oficio';
        var data = readOmForm();
        var err = validateOmForm(data);
        if (err) {
            toast(err, 'error');
            return;
        }
        var list = getDocs();
        var now = new Date().toISOString();
        var tipoLabel = kind === 'memorando' ? TIPO_MEMORANDO : TIPO_OFICIO;

        if (editingId) {
            var idx = list.findIndex(function (d) { return d.id === editingId; });
            if (idx >= 0) {
                list[idx].dados = data;
                list[idx].requerente = data.para || tituloDocumento(kind, data.numero, data.ano);
                list[idx].tipo = tipoLabel;
                list[idx].updatedAt = now;
            }
        } else {
            // Confirma e consome o número atual (pode ter sido alterado na tela)
            var counters = getCounters();
            var used = data.numero;
            if (kind === 'oficio') {
                if (used >= counters.oficio) counters.oficio = used + 1;
            } else if (used >= counters.memorando) {
                counters.memorando = used + 1;
            }
            saveCounters(counters);
            list.unshift({
                id: uid(),
                tipo: tipoLabel,
                requerente: data.para || tituloDocumento(kind, data.numero, data.ano),
                emitidoPor: sessionUserName(),
                createdAt: now,
                updatedAt: now,
                dados: data
            });
        }
        saveDocs(list);
        var savedOm = editingId
            ? list.find(function (d) { return d.id === editingId; })
            : list[0];
        if (savedOm) syncAdminDocCloud(savedOm);
        toast(editingId
            ? (tipoLabel + ' atualizado e salvo no banco.')
            : (tipoLabel + ' Nº ' + data.numero + '/' + data.ano + ' emitido e salvo no banco de dados.'));
        filterState.tipo = tipoLabel;
        renderHistory();
        if (andPrint) printOficioMemorando(data);
        closeOmForm();
    }

    function fmtDate(iso) {
        if (!iso) return '—';
        var d = String(iso).slice(0, 10).split('-');
        if (d.length === 3) return d[2] + '/' + d[1] + '/' + d[0];
        try {
            return new Date(iso).toLocaleDateString('pt-BR');
        } catch (e) {
            return String(iso);
        }
    }

    function pedidosMarcados(data) {
        return PEDIDOS.filter(function (p) {
            return data.pedidos && data.pedidos[p.id] && data.pedidos[p.id].checked;
        }).map(function (p) {
            var st = data.pedidos[p.id];
            var extra = [];
            if (st.numero) extra.push('nº ' + st.numero);
            if (st.totalDias) extra.push(st.totalDias + ' dia(s)');
            if (st.dataInicio || st.dataFim) extra.push((fmtDate(st.dataInicio) || '—') + ' a ' + (fmtDate(st.dataFim) || '—'));
            if (st.dataUnica) extra.push('a contar de ' + fmtDate(st.dataUnica));
            if (st.texto) extra.push(st.texto);
            return p.label + (extra.length ? ' (' + extra.join(', ') + ')' : '');
        });
    }

    function getTimbradoUrl() {
        try {
            return new URL('assets/timbrado-a4.jpg', window.location.href).href;
        } catch (e) {
            return 'assets/timbrado-a4.jpg';
        }
    }

    function printViaIframe(html) {
        var iframe = document.getElementById('adm-print-frame');
        if (!iframe) {
            iframe = document.createElement('iframe');
            iframe.id = 'adm-print-frame';
            iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0';
            document.body.appendChild(iframe);
        }
        var doc = iframe.contentDocument || iframe.contentWindow.document;
        doc.open();
        doc.write(html);
        doc.close();
        setTimeout(function () {
            try { iframe.contentWindow.focus(); iframe.contentWindow.print(); } catch (e) { /* ignore */ }
        }, 350);
    }

    function printRequerimento(data) {
        var pedidosHtml = pedidosMarcados(data).map(function (t) {
            return '<li>' + escapeHtml(t) + '</li>';
        }).join('') || '<li>Nenhum pedido marcado</li>';

        var cat = data.categoria === 'adm_geral' ? 'Administração Geral'
            : data.categoria === 'magisterio' ? 'Magistério' : '—';
        var vin = data.vinculo === 'efetivo' ? 'Efetivo'
            : data.vinculo === 'nao_estavel' ? 'Não estável'
            : data.vinculo === 'temporario' ? 'Temporário' : '—';

        var html = [
            '<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"/><title>Requerimento Padrão</title>',
            '<style>',
            '@page{size:A4;margin:14mm}',
            'body{font-family:Arial,Helvetica,sans-serif;color:#111;font-size:11.5px;line-height:1.45;margin:0}',
            '.sheet{max-width:190mm;margin:0 auto}',
            '.head{text-align:center;border-bottom:2px solid #111;padding-bottom:8px;margin-bottom:12px}',
            '.head h1{font-size:13px;margin:0 0 2px;letter-spacing:.04em}',
            '.head h2{font-size:16px;margin:6px 0 2px}',
            '.head p{margin:0;font-size:11px}',
            '.dest{margin:10px 0 14px;font-weight:700;text-transform:uppercase;font-size:11px}',
            '.grid{display:grid;grid-template-columns:1fr 1fr;gap:6px 14px;margin-bottom:12px}',
            '.field{border-bottom:1px solid #ccc;padding:2px 0 4px}',
            '.field b{display:block;font-size:9px;text-transform:uppercase;color:#444;letter-spacing:.03em}',
            '.full{grid-column:1/-1}',
            '.box{border:1px solid #222;border-radius:4px;padding:10px;margin:10px 0}',
            '.box h3{margin:0 0 8px;font-size:12px;text-transform:uppercase}',
            '.box ul{margin:0;padding-left:18px}',
            '.box li{margin:3px 0}',
            '.textblock{min-height:48px;white-space:pre-wrap;border:1px solid #ddd;padding:8px;border-radius:4px}',
            '.signs{display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-top:36px}',
            '.sign{text-align:center;padding-top:28px;border-top:1px solid #111}',
            '.sign small{display:block;margin-top:4px;color:#444}',
            '.meta{margin-top:18px}',
            '@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}',
            '</style></head><body><div class="sheet">',
            '<div class="head">',
            '<h1>GOVERNO DO ESTADO DO PARÁ</h1>',
            '<p>SECRETARIA DE ESTADO DE EDUCAÇÃO</p>',
            '<h2>REQUERIMENTO</h2>',
            '</div>',
            '<p class="dest">Exmo. Sr. Secretário de Estado de Educação</p>',
            '<div class="grid">',
            '<div class="field full"><b>Nome do requerente</b>', escapeHtml(data.nomeRequerente || '—'), '</div>',
            '<div class="field"><b>Matrícula</b>', escapeHtml(data.matricula || '—'), '</div>',
            '<div class="field"><b>CPF</b>', escapeHtml(data.cpf || '—'), '</div>',
            '<div class="field"><b>Data de nascimento</b>', escapeHtml(fmtDate(data.dataNascimento)), '</div>',
            '<div class="field"><b>Telefone</b>', escapeHtml(data.telefone || '—'), '</div>',
            '<div class="field"><b>Categoria</b>', escapeHtml(cat), '</div>',
            '<div class="field"><b>Cargo</b>', escapeHtml(data.cargo || '—'), '</div>',
            '<div class="field"><b>Função</b>', escapeHtml(data.funcao || '—'), '</div>',
            '<div class="field"><b>E-mail</b>', escapeHtml(data.email || '—'), '</div>',
            '<div class="field"><b>Tipo de vínculo</b>', escapeHtml(vin), '</div>',
            '<div class="field"><b>DRE</b>', escapeHtml(data.dre || '—'), '</div>',
            '<div class="field"><b>Lotação</b>', escapeHtml(data.lotacao || '—'), '</div>',
            '</div>',
            '<div class="box"><h3>Venho requerer a concessão de</h3><ul>', pedidosHtml, '</ul></div>',
            '<div class="box"><h3>Informações complementares</h3><div class="textblock">',
            escapeHtml(data.infoComplementares || '—'), '</div></div>',
            '<div class="box"><h3>Justificativa da solicitação</h3><div class="textblock">',
            escapeHtml(data.justificativa || '—'), '</div></div>',
            '<p class="meta"><strong>', escapeHtml(data.municipioUf || 'Município/UF'), '</strong>, em ',
            escapeHtml(fmtDate(data.dataDocumento)), '.</p>',
            '<div class="signs">',
            '<div class="sign">Assinatura do Requerente<small>(conforme identidade)</small></div>',
            '<div class="sign">Assinatura da Chefia Imediata<small>(usar carimbo)</small></div>',
            '</div>',
            '</div></body></html>'
        ].join('');

        printViaIframe(html);
    }

    function printOficioMemorando(data) {
        var kind = data.kind === 'memorando' || data.tipo === TIPO_MEMORANDO ? 'memorando' : 'oficio';
        var ano = data.ano || yearFromIso(data.dataDocumento);
        var titulo = tituloDocumento(kind, data.numero, ano);
        var local = formatLocalExtenso(data.dataDocumento);
        var bg = getTimbradoUrl().replace(/'/g, "\\'");
        var corpo = formatCorpoParagraphsForPrint(data.corpo);
        var para = escapeHtml(data.para || '');
        var de = escapeHtml(data.de || DE_PADRAO);

        var html = [
            '<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"/><title>', escapeHtml(titulo), '</title>',
            '<style>',
            '@page{size:A4;margin:0}',
            'html,body{margin:0;padding:0;background:#fff}',
            'body{font-family:Arial,Helvetica,sans-serif;color:#111;-webkit-print-color-adjust:exact;print-color-adjust:exact}',
            '.page{width:210mm;height:297mm;box-sizing:border-box;position:relative;overflow:hidden;',
            "background-image:url('" + bg + "');",
            'background-repeat:no-repeat;background-position:center top;background-size:210mm 297mm}',
            '.content{box-sizing:border-box;height:100%;padding:48mm 18mm 34mm 18mm;display:flex;flex-direction:column}',
            '.local{text-align:right;font-size:12pt;font-weight:700;margin:0 0 18px}',
            '.titulo{text-align:left;font-size:13pt;font-weight:700;letter-spacing:.03em;margin:0 0 20px;text-transform:uppercase}',
            '.meta{font-size:12pt;line-height:1.55;margin:0 0 16px}',
            '.meta .lbl{font-weight:700}',
            '.corpo{flex:1;border:none;padding:0;font-size:12pt;line-height:1.55;text-align:justify;min-height:90mm;background:transparent}',
            '.corpo p{margin:0 0 0.85em;text-align:justify;text-indent:1.25cm}',
            '.corpo b,.corpo strong{font-weight:700}',
            '.fecho{margin-top:36px;text-align:center}',
            '.fecho .linha{width:58%;margin:0 auto;border-top:1px solid #111;padding-top:8px}',
            '.fecho .cargo{font-size:11pt;margin:0}',
            '@media print{html,body{margin:0!important;padding:0!important}.page{page-break-inside:avoid}}',
            '</style></head><body><div class="page"><div class="content">',
            '<p class="local">', escapeHtml(local), '</p>',
            '<h1 class="titulo">', escapeHtml(titulo), '</h1>',
            '<div class="meta">',
            '<div><span class="lbl">DE:</span> ', de, '</div>',
            '<div><span class="lbl">PARA:</span> ', para || '&nbsp;', '</div>',
            '</div>',
            '<div class="corpo">', corpo || '&nbsp;', '</div>',
            '<div class="fecho">',
            '<div class="linha"><p class="cargo">Gestão Escolar</p></div>',
            '</div>',
            '</div></div></body></html>'
        ].join('');

        printViaIframe(html);
    }

    function printDocumento(doc) {
        if (!doc) return;
        var dados = doc.dados || {};
        if (doc.tipo === TIPO_OFICIO || doc.tipo === TIPO_MEMORANDO || dados.kind === 'oficio' || dados.kind === 'memorando') {
            printOficioMemorando(Object.assign({}, dados, {
                tipo: doc.tipo,
                kind: dados.kind || (doc.tipo === TIPO_MEMORANDO ? 'memorando' : 'oficio')
            }));
            return;
        }
        printRequerimento(Object.assign(emptyForm(), dados));
    }

    function openDocumento(doc) {
        if (!doc) return;
        if (doc.tipo === TIPO_OFICIO || (doc.dados && doc.dados.kind === 'oficio')) {
            openOmForm('oficio', doc);
            return;
        }
        if (doc.tipo === TIPO_MEMORANDO || (doc.dados && doc.dados.kind === 'memorando')) {
            openOmForm('memorando', doc);
            return;
        }
        openForm(doc);
    }

    function countByTipo(tipo) {
        return getDocs().filter(function (d) {
            if (!tipo) return true;
            return String(d.tipo || '') === tipo;
        }).length;
    }

    function docTitle(d) {
        if (!d) return '—';
        if (d.dados && d.dados.numero != null && (d.tipo === TIPO_OFICIO || d.tipo === TIPO_MEMORANDO)) {
            var ano = d.dados.ano || yearFromIso(d.dados.dataDocumento);
            return (d.tipo === TIPO_MEMORANDO ? 'MEMORANDO' : 'OFÍCIO') + ' Nº ' + d.dados.numero + '/' + ano;
        }
        return d.tipo || '—';
    }

    function docResumo(d) {
        if (!d || !d.dados) return '—';
        if (d.tipo === TIPO_OFICIO || d.tipo === TIPO_MEMORANDO) {
            var corpo = stripHtmlText(d.dados.corpo || '');
            if (!corpo) return 'Sem texto';
            return corpo.length > 90 ? corpo.slice(0, 90) + '…' : corpo;
        }
        if (d.tipo === TIPO_REQ) {
            var pedidos = pedidosMarcados(d.dados);
            if (!pedidos.length) return 'Requerimento';
            return pedidos.length === 1 ? pedidos[0] : pedidos[0] + ' (+' + (pedidos.length - 1) + ')';
        }
        return '—';
    }

    function filteredDocs() {
        var list = getDocs();
        var tipo = filterState.tipo || '';
        var usuario = (filterState.usuario || '').toLowerCase();
        var data = filterState.data || '';
        var requerente = (filterState.requerente || '').toLowerCase();
        return list.filter(function (d) {
            if (tipo && String(d.tipo || '') !== tipo) return false;
            if (usuario && String(d.emitidoPor || '').toLowerCase().indexOf(usuario) < 0) return false;
            if (requerente && String(d.requerente || '').toLowerCase().indexOf(requerente) < 0) return false;
            if (data) {
                var day = String(d.createdAt || '').slice(0, 10);
                if (day !== data) return false;
            }
            return true;
        });
    }

    function renderHistTabs() {
        var host = $('adm-hist-tabs');
        if (!host) return;
        host.innerHTML = HIST_TABS.map(function (tab) {
            var active = (filterState.tipo || '') === (tab.value || '');
            var count = countByTipo(tab.value);
            var cls = active
                ? 'bg-primary text-white border-primary'
                : 'bg-white text-on-surface border-border-subtle hover:border-primary/40';
            return [
                '<button type="button" role="tab" data-hist-tipo="', escapeHtml(tab.value), '" aria-selected="', active ? 'true' : 'false', '"',
                ' class="inline-flex items-center gap-2 px-4 py-2.5 mb-[-1px] rounded-t-xl border text-sm font-semibold transition-colors ', cls, '">',
                escapeHtml(tab.label),
                '<span class="inline-flex min-w-[1.5rem] justify-center px-1.5 py-0.5 rounded-full text-[11px] ',
                active ? 'bg-white/20 text-white' : 'bg-surface-container-high text-text-secondary',
                '">', String(count), '</span>',
                '</button>'
            ].join('');
        }).join('');

        host.querySelectorAll('[data-hist-tipo]').forEach(function (btn) {
            btn.addEventListener('click', function () {
                filterState.tipo = btn.getAttribute('data-hist-tipo') || '';
                renderHistory();
            });
        });
    }

    function bindHistoryActions(root) {
        if (!root) return;
        root.querySelectorAll('[data-act]').forEach(function (btn) {
            btn.addEventListener('click', function () {
                var id = btn.getAttribute('data-id');
                var act = btn.getAttribute('data-act');
                var doc = getDocs().find(function (x) { return x.id === id; });
                if (!doc) return;
                if (act === 'print') printDocumento(doc);
                if (act === 'edit') openDocumento(doc);
                if (act === 'delete') {
                    if (!confirm('Excluir este documento do histórico?')) return;
                    deleteAdminDocCloud(id).then(function (res) {
                        if (res && res.ok === false) {
                            toast('Não foi possível excluir no banco. Tente novamente.', 'error');
                            return;
                        }
                        saveDocs(getDocs().filter(function (x) { return x.id !== id; }));
                        toast('Documento excluído do histórico.', 'error');
                        renderHistory();
                    });
                }
            });
        });
    }

    function renderHistory() {
        renderHistTabs();
        var body = $('adm-hist-body');
        var empty = $('adm-hist-empty');
        if (!body) return;
        var list = filteredDocs();
        if (!list.length) {
            body.innerHTML = '';
            if (empty) {
                empty.classList.remove('hidden');
                var tabLabel = (HIST_TABS.find(function (t) { return (t.value || '') === (filterState.tipo || ''); }) || {}).label || 'este tipo';
                empty.textContent = 'Nenhum documento em “' + tabLabel + '” ainda. Emita um documento para iniciar o histórico.';
            }
            return;
        }
        if (empty) empty.classList.add('hidden');
        body.innerHTML = list.map(function (d) {
            return [
                '<tr class="border-b border-border-subtle hover:bg-surface-container-low/40 align-top">',
                '<td class="px-4 py-3 text-sm font-semibold text-on-surface whitespace-nowrap">', escapeHtml(docTitle(d)), '</td>',
                '<td class="px-4 py-3 text-sm">', escapeHtml(d.requerente || '—'), '</td>',
                '<td class="px-4 py-3 text-sm text-text-secondary max-w-[280px]">', escapeHtml(docResumo(d)), '</td>',
                '<td class="px-4 py-3 text-sm">', escapeHtml(d.emitidoPor || '—'), '</td>',
                '<td class="px-4 py-3 text-sm whitespace-nowrap">', escapeHtml(fmtDate(d.createdAt)), '</td>',
                '<td class="px-4 py-3">',
                '<div class="flex flex-wrap items-center gap-2 justify-end">',
                '<button type="button" data-act="print" data-id="', escapeHtml(d.id), '" class="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-primary/30 bg-primary/5 text-primary text-xs font-semibold hover:bg-primary/10" title="Reimprimir">',
                '<span class="material-symbols-outlined text-[16px]">print</span>Reimprimir</button>',
                '<button type="button" data-act="edit" data-id="', escapeHtml(d.id), '" class="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border-subtle text-on-surface text-xs font-semibold hover:bg-surface-container-low" title="Editar texto">',
                '<span class="material-symbols-outlined text-[16px]">edit</span>Editar texto</button>',
                '<button type="button" data-act="delete" data-id="', escapeHtml(d.id), '" class="inline-flex items-center gap-1 px-2.5 py-2 rounded-lg border border-border-subtle text-error text-xs font-semibold hover:bg-error/5" title="Excluir">',
                '<span class="material-symbols-outlined text-[16px]">delete</span></button>',
                '</div></td></tr>'
            ].join('');
        }).join('');
        bindHistoryActions(body);
    }

    function bindFilters() {
        ['adm-filter-usuario', 'adm-filter-data', 'adm-filter-requerente'].forEach(function (id) {
            var el = $(id);
            if (!el) return;
            el.addEventListener('input', function () {
                filterState.usuario = ($('adm-filter-usuario') && $('adm-filter-usuario').value) || '';
                filterState.data = ($('adm-filter-data') && $('adm-filter-data').value) || '';
                filterState.requerente = ($('adm-filter-requerente') && $('adm-filter-requerente').value) || '';
                renderHistory();
            });
        });
        var clear = $('adm-filter-clear');
        if (clear) {
            clear.addEventListener('click', function () {
                filterState.usuario = '';
                filterState.data = '';
                filterState.requerente = '';
                ['adm-filter-usuario', 'adm-filter-data', 'adm-filter-requerente'].forEach(function (id) {
                    if ($(id)) $(id).value = '';
                });
                renderHistory();
            });
        }
    }

    function bindModal() {
        var closeBtn = $('adm-req-close');
        var cancelBtn = $('adm-req-cancel');
        var saveBtn = $('adm-req-save');
        var savePrintBtn = $('adm-req-save-print');
        var backdrop = $('adm-req-modal');
        if (closeBtn) closeBtn.onclick = closeForm;
        if (cancelBtn) cancelBtn.onclick = closeForm;
        if (saveBtn) saveBtn.onclick = function () { saveForm(false); };
        if (savePrintBtn) savePrintBtn.onclick = function () { saveForm(true); };
        if (backdrop) {
            backdrop.addEventListener('click', function (e) {
                if (e.target === backdrop) closeForm();
            });
        }

        var omClose = $('adm-om-close');
        var omCancel = $('adm-om-cancel');
        var omSave = $('adm-om-save');
        var omSavePrint = $('adm-om-save-print');
        var omBackdrop = $('adm-om-modal');
        if (omClose) omClose.onclick = closeOmForm;
        if (omCancel) omCancel.onclick = closeOmForm;
        if (omSave) omSave.onclick = function () { saveOmForm(false); };
        if (omSavePrint) omSavePrint.onclick = function () { saveOmForm(true); };
        if (omBackdrop) {
            omBackdrop.addEventListener('click', function (e) {
                if (e.target === omBackdrop) closeOmForm();
            });
        }
        var omData = $('adm-om-data');
        var omNum = $('adm-om-numero');
        if (omData) omData.addEventListener('change', syncOmTituloPreview);
        if (omData) omData.addEventListener('input', syncOmTituloPreview);
        if (omNum) omNum.addEventListener('input', syncOmTituloPreview);

        var omBold = $('adm-om-bold');
        var omCorpo = $('adm-om-corpo');
        if (omBold && omCorpo) {
            omBold.addEventListener('mousedown', function (e) {
                e.preventDefault();
                omCorpo.focus();
                try { document.execCommand('bold', false, null); } catch (err) { /* ignore */ }
            });
            omCorpo.addEventListener('keydown', function (e) {
                if ((e.ctrlKey || e.metaKey) && String(e.key || '').toLowerCase() === 'b') {
                    e.preventDefault();
                    try { document.execCommand('bold', false, null); } catch (err) { /* ignore */ }
                }
            });
        }
    }

    function init() {
        if (!/documentosadministrativos/i.test(location.pathname + location.href)) return;
        if (!ensureAccess()) return;
        // Contadores locais mínimos; valores do banco prevalecem após loadAdminDocsFromCloud
        var localCounters = getCounters();
        localStorage.setItem(COUNTERS_KEY, JSON.stringify(localCounters));
        renderTypes();
        var countEl = $('adm-doc-types-count');
        if (countEl) countEl.textContent = String(DOC_TYPES.length);
        bindFilters();
        bindModal();
        renderHistory();
        loadAdminDocsFromCloud().then(function (result) {
            if (result && result.ok) {
                console.info('[SIGA] Documentos administrativos carregados do Supabase:', result.count);
            } else if (result && result.reason === 'no_school') {
                toast('Escola não vinculada à sessão. Faça login novamente para carregar os documentos do banco.', 'error');
            }
            renderHistory();
        });
    }

    global.SigaDocumentosAdministrativos = {
        DOC_TYPES: DOC_TYPES,
        isGestorEscolar: isGestorEscolar,
        openForm: openForm,
        openOmForm: openOmForm,
        init: init
    };
    global.abrirRequerimentoPadrao = function () { openForm(); };
    global.abrirOficio = function () { openOmForm('oficio'); };
    global.abrirMemorando = function () { openOmForm('memorando'); };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})(typeof window !== 'undefined' ? window : this);
