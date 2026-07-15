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
        toast(editingId ? 'Requerimento atualizado.' : 'Requerimento emitido e salvo no histórico.');
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

    function fillOmForm(data) {
        var kind = data.kind === 'memorando' ? 'memorando' : 'oficio';
        if ($('adm-om-numero')) $('adm-om-numero').value = data.numero != null ? String(data.numero) : String(peekNumero(kind));
        if ($('adm-om-data')) $('adm-om-data').value = data.dataDocumento || new Date().toISOString().slice(0, 10);
        if ($('adm-om-de')) $('adm-om-de').value = data.de || DE_PADRAO;
        if ($('adm-om-para')) $('adm-om-para').value = data.para || '';
        if ($('adm-om-corpo')) $('adm-om-corpo').value = data.corpo || '';
        syncOmTituloPreview();
    }

    function readOmForm() {
        var kind = editingKind === 'memorando' ? 'memorando' : 'oficio';
        var data = emptyOmForm(kind);
        data.dataDocumento = ($('adm-om-data') && $('adm-om-data').value) || data.dataDocumento;
        data.ano = yearFromIso(data.dataDocumento);
        data.de = DE_PADRAO;
        data.para = ($('adm-om-para') && $('adm-om-para').value || '').trim();
        data.corpo = ($('adm-om-corpo') && $('adm-om-corpo').value || '').trim();
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
        if (!data.corpo) return 'Escreva o corpo do texto.';
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
        toast(editingId
            ? (tipoLabel + ' atualizado.')
            : (tipoLabel + ' Nº ' + data.numero + '/' + data.ano + ' emitido e salvo no histórico.'));
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
        var corpo = escapeHtml(data.corpo || '').replace(/\n/g, '<br/>');
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
            '.local{text-align:right;font-size:12pt;margin:0 0 18px}',
            '.titulo{text-align:center;font-size:14pt;font-weight:700;letter-spacing:.04em;margin:0 0 22px;text-transform:uppercase}',
            '.meta{font-size:12pt;line-height:1.55;margin:0 0 16px}',
            '.meta .lbl{font-weight:700}',
            '.corpo{flex:1;border:1px solid #222;border-radius:2px;padding:12px 14px;font-size:12pt;line-height:1.55;text-align:justify;white-space:normal;min-height:90mm;background:rgba(255,255,255,.55)}',
            '.fecho{margin-top:28px;text-align:center}',
            '.fecho .atenciosamente{font-size:12pt;font-weight:700;letter-spacing:.06em;margin:0 0 36px}',
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
            '<p class="atenciosamente">ATENCIOSAMENTE</p>',
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

    function filteredDocs() {
        var list = getDocs();
        var tipo = (filterState.tipo || '').toLowerCase();
        var usuario = (filterState.usuario || '').toLowerCase();
        var data = filterState.data || '';
        var requerente = (filterState.requerente || '').toLowerCase();
        return list.filter(function (d) {
            if (tipo && String(d.tipo || '').toLowerCase().indexOf(tipo) < 0) return false;
            if (usuario && String(d.emitidoPor || '').toLowerCase().indexOf(usuario) < 0) return false;
            if (requerente && String(d.requerente || '').toLowerCase().indexOf(requerente) < 0) return false;
            if (data) {
                var day = String(d.createdAt || '').slice(0, 10);
                if (day !== data) return false;
            }
            return true;
        });
    }

    function renderHistory() {
        var body = $('adm-hist-body');
        var empty = $('adm-hist-empty');
        if (!body) return;
        var list = filteredDocs();
        if (!list.length) {
            body.innerHTML = '';
            if (empty) empty.classList.remove('hidden');
            return;
        }
        if (empty) empty.classList.add('hidden');
        body.innerHTML = list.map(function (d) {
            var labelExtra = '';
            if (d.dados && d.dados.numero != null && (d.tipo === TIPO_OFICIO || d.tipo === TIPO_MEMORANDO)) {
                labelExtra = ' Nº ' + d.dados.numero + '/' + (d.dados.ano || yearFromIso(d.dados.dataDocumento));
            }
            return [
                '<tr class="border-b border-border-subtle hover:bg-surface-container-low/40">',
                '<td class="px-4 py-3 text-sm font-medium">', escapeHtml((d.tipo || '—') + labelExtra), '</td>',
                '<td class="px-4 py-3 text-sm">', escapeHtml(d.emitidoPor || '—'), '</td>',
                '<td class="px-4 py-3 text-sm whitespace-nowrap">', escapeHtml(fmtDate(d.createdAt)), '</td>',
                '<td class="px-4 py-3 text-sm">', escapeHtml(d.requerente || '—'), '</td>',
                '<td class="px-4 py-3">',
                '<div class="flex items-center gap-1 justify-end">',
                '<button type="button" data-act="print" data-id="', escapeHtml(d.id), '" class="w-9 h-9 rounded-lg border border-border-subtle hover:bg-primary/5 text-primary" title="Imprimir"><span class="material-symbols-outlined text-[18px]">print</span></button>',
                '<button type="button" data-act="edit" data-id="', escapeHtml(d.id), '" class="w-9 h-9 rounded-lg border border-border-subtle hover:bg-primary/5 text-on-surface" title="Editar"><span class="material-symbols-outlined text-[18px]">edit</span></button>',
                '<button type="button" data-act="delete" data-id="', escapeHtml(d.id), '" class="w-9 h-9 rounded-lg border border-border-subtle hover:bg-error/5 text-error" title="Excluir"><span class="material-symbols-outlined text-[18px]">delete</span></button>',
                '</div></td></tr>'
            ].join('');
        }).join('');

        body.querySelectorAll('[data-act]').forEach(function (btn) {
            btn.addEventListener('click', function () {
                var id = btn.getAttribute('data-id');
                var act = btn.getAttribute('data-act');
                var doc = getDocs().find(function (x) { return x.id === id; });
                if (!doc) return;
                if (act === 'print') printDocumento(doc);
                if (act === 'edit') openDocumento(doc);
                if (act === 'delete') {
                    if (!confirm('Excluir este documento do histórico?')) return;
                    saveDocs(getDocs().filter(function (x) { return x.id !== id; }));
                    toast('Documento excluído.', 'error');
                    renderHistory();
                }
            });
        });
    }

    function bindFilters() {
        ['adm-filter-tipo', 'adm-filter-usuario', 'adm-filter-data', 'adm-filter-requerente'].forEach(function (id) {
            var el = $(id);
            if (!el) return;
            el.addEventListener('input', function () {
                filterState.tipo = ($('adm-filter-tipo') && $('adm-filter-tipo').value) || '';
                filterState.usuario = ($('adm-filter-usuario') && $('adm-filter-usuario').value) || '';
                filterState.data = ($('adm-filter-data') && $('adm-filter-data').value) || '';
                filterState.requerente = ($('adm-filter-requerente') && $('adm-filter-requerente').value) || '';
                renderHistory();
            });
        });
        var clear = $('adm-filter-clear');
        if (clear) {
            clear.addEventListener('click', function () {
                filterState = { tipo: '', usuario: '', data: '', requerente: '' };
                ['adm-filter-tipo', 'adm-filter-usuario', 'adm-filter-data', 'adm-filter-requerente'].forEach(function (id) {
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
    }

    function init() {
        if (!/documentosadministrativos/i.test(location.pathname + location.href)) return;
        if (!ensureAccess()) return;
        // Garante contadores mínimos na primeira carga
        saveCounters(getCounters());
        renderTypes();
        var countEl = $('adm-doc-types-count');
        if (countEl) countEl.textContent = String(DOC_TYPES.length);
        bindFilters();
        bindModal();
        renderHistory();
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
