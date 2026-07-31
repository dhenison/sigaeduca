/**
 * SIGA Educa — Planejamento Pedagógico
 * Plano de Aula / Planejamento Bimestral → Drive (PLANO DE AULA / PLANEJAMENTO BIMESTRAL)
 */
(function () {
  'use strict';

  var STORAGE_KEY = 'siga_planejamento_docs';
  var DRIVE_TIPO_PLANO = 'PLANO DE AULA';
  var DRIVE_TIPO_BIM = 'PLANEJAMENTO BIMESTRAL';

  var APOIO = {
    coerencia: 'docs/pedagogico-apoio/COERENCIA PEDAGOGICA.pdf',
    curricular: 'docs/pedagogico-apoio/Documento Curricular.pdf',
    template: 'docs/pedagogico-apoio/PLANO DE AULA.docx',
    ementas: {
      'Ciências Humanas': 'docs/pedagogico-apoio/EMENTA HUMANAS.pdf',
      Linguagens: 'docs/pedagogico-apoio/EMENTA LINGUAGEM.pdf',
      Matemática: 'docs/pedagogico-apoio/EMENTA MATEMATICA.pdf',
      'Ciências da Natureza': 'docs/pedagogico-apoio/EMENTA NATUREZA.pdf'
    }
  };

  var AREAS = {
    Linguagens: {
      categoria: 'Linguagens e suas Tecnologias',
      componentes: ['Língua Portuguesa', 'Arte', 'Educação Física', 'Língua Inglesa', 'Língua Espanhola'],
      eixos: ['Leitura', 'Produção de textos', 'Oralidade', 'Análise linguística/semiótica'],
      principios: ['Interculturalidade', 'Protagonismo juvenil', 'Trabalho e projeto de vida', 'Pesquisa']
    },
    Matemática: {
      categoria: 'Matemática e suas Tecnologias',
      componentes: ['Matemática'],
      eixos: ['Números e Álgebra', 'Geometria e Medidas', 'Probabilidade e Estatística'],
      principios: ['Resolução de problemas', 'Investigação', 'Modelagem', 'Protagonismo juvenil']
    },
    'Ciências da Natureza': {
      categoria: 'Ciências da Natureza e suas Tecnologias',
      componentes: ['Biologia', 'Física', 'Química', 'Ciências'],
      eixos: ['Matéria e energia', 'Vida e evolução', 'Terra e Universo'],
      principios: ['Investigação científica', 'Contextualização', 'Sustentabilidade', 'Protagonismo juvenil']
    },
    'Ciências Humanas': {
      categoria: 'Ciências Humanas e Sociais Aplicadas',
      componentes: ['História', 'Geografia', 'Filosofia', 'Sociologia'],
      eixos: ['Tempo e espaço', 'Território e poder', 'Indivíduo, natureza, sociedade, cultura e ética'],
      principios: ['Cidadania', 'Diversidade cultural', 'Ética', 'Protagonismo juvenil']
    }
  };

  var state = {
    view: 'hub',
    tipo: null,
    step: 0,
    form: emptyPlanoForm(),
    bimForm: emptyBimForm(),
    busy: false
  };

  function emptyPlanoForm() {
    return {
      dre: 'DRE — Pará',
      municipio: '',
      escola: '',
      localidade: '',
      professor: '',
      ano: String(new Date().getFullYear()),
      duracao: '2 aulas',
      area: 'Linguagens',
      categoria: '',
      componente: '',
      turma: '',
      dataAula: todayIso(),
      principios: '',
      eixos: '',
      competencias: '',
      habilidades: '',
      objeto: '',
      expectativas: '',
      estrategias: '',
      integracao: '',
      culminancia: '',
      avaliacao: '',
      referencias: ''
    };
  }

  function emptyBimForm() {
    return {
      professor: '',
      escola: '',
      municipio: '',
      ano: String(new Date().getFullYear()),
      bimestre: '1º Bimestre',
      area: 'Linguagens',
      componente: '',
      turma: '',
      cargaHoraria: '',
      justificativa: '',
      objetivos: '',
      competencias: '',
      habilidades: '',
      objetos: '',
      sequencia: '',
      metodologias: '',
      recursos: '',
      avaliacao: '',
      recuperacao: '',
      referencias: '',
      observacoes: ''
    };
  }

  function todayIso() {
    return new Date().toISOString().slice(0, 10);
  }

  function escapeHtml(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function uid() {
    return 'pl_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 9);
  }

  function showToast(message, type) {
    type = type || 'success';
    var el = document.getElementById('pl-toast');
    if (!el) {
      try { console.log('[PL]', message); } catch (e) { /* noop */ }
      return;
    }
    el.textContent = message;
    el.classList.remove('hidden');
    el.setAttribute('data-type', type);
    clearTimeout(el._timer);
    el._timer = setTimeout(function () { el.classList.add('hidden'); }, 3400);
  }

  function getProfessorNome(preferred) {
    var fromPreferred = String(preferred || '').trim();
    if (fromPreferred && !/^usu[aá]rio$/i.test(fromPreferred)) return fromPreferred;
    try {
      var session = JSON.parse(localStorage.getItem('siga_session') || 'null');
      if (session && session.nome && String(session.nome).trim()) {
        return String(session.nome).trim();
      }
    } catch (e) { /* ignore */ }
    var profile = String(localStorage.getItem('siga_profile_name') || '').trim();
    return profile || 'Professor';
  }

  function getEscolaDefaults() {
    var out = { escola: '', municipio: '', localidade: '' };
    try {
      var escola = JSON.parse(localStorage.getItem('siga_escola') || 'null');
      if (escola) {
        out.escola = escola.nome || escola.name || '';
        out.municipio = escola.municipio || escola.cidade || '';
        out.localidade = escola.localidade || escola.bairro || escola.endereco || '';
      }
    } catch (e) { /* ignore */ }
    return out;
  }

  function getList() {
    try {
      var list = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
      return Array.isArray(list) ? list : [];
    } catch (e) {
      return [];
    }
  }

  function saveList(list) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list || []));
  }

  function getDriveApi() {
    return window.SigaGoogleDrive || null;
  }

  function updateDriveHint() {
    var drive = getDriveApi();
    var ready = !!(drive && drive.isConfigured && drive.isConfigured());
    var hint = document.getElementById('pl-drive-hint');
    if (!hint) return;
    if (!ready) {
      hint.textContent = 'Drive institucional: faça login no SIGA. Configure OAuth da conta dona de SIGAEDUCA (secrets no Supabase).';
      return;
    }
    hint.textContent =
      'Drive: SIGAEDUCA → PLANEJAMENTO PEDAGÓGICO → [Seu nome] → PLANO DE AULA ou PLANEJAMENTO BIMESTRAL → arquivo.';
  }

  function requireDrive() {
    var drive = getDriveApi();
    if (!drive || !drive.isConfigured()) {
      return Promise.reject(new Error(
        'Supabase/Drive não configurado. Faça login no SIGA e cadastre os secrets OAuth.'
      ));
    }
    return Promise.resolve(drive);
  }

  function formatDateBr(value) {
    if (!value) return '—';
    if (String(value).includes('/')) return value;
    var parts = String(value).slice(0, 10).split('-');
    if (parts.length === 3) return parts[2] + '/' + parts[1] + '/' + parts[0];
    return value;
  }

  function nlToBr(text) {
    return escapeHtml(text).replace(/\n/g, '<br/>');
  }

  function areaMeta(area) {
    return AREAS[area] || AREAS.Linguagens;
  }

  function ementaHref(area) {
    return APOIO.ementas[area] || APOIO.curricular;
  }

  /* ---------- Views ---------- */

  function setView(view) {
    state.view = view;
    ['pl-view-hub', 'pl-view-wizard', 'pl-view-docs'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.classList.toggle('hidden', id !== 'pl-view-' + view);
    });
    if (view === 'docs') renderDocs();
    if (view === 'hub') renderHubKpis();
  }

  function renderHubKpis() {
    var list = getList();
    var elTotal = document.getElementById('kpi-pl-total');
    var elPlano = document.getElementById('kpi-pl-plano');
    var elBim = document.getElementById('kpi-pl-bim');
    if (elTotal) elTotal.textContent = String(list.length);
    if (elPlano) elPlano.textContent = String(list.filter(function (d) { return d.tipo === DRIVE_TIPO_PLANO; }).length);
    if (elBim) elBim.textContent = String(list.filter(function (d) { return d.tipo === DRIVE_TIPO_BIM; }).length);
  }

  function startWizard(tipo) {
    if (tipo === 'prova') {
      showToast('Prova estará disponível em breve.', 'alerta');
      return;
    }
    state.tipo = tipo;
    state.step = 0;
    var defaults = getEscolaDefaults();
    if (tipo === 'plano') {
      state.form = emptyPlanoForm();
      state.form.professor = getProfessorNome();
      state.form.escola = defaults.escola;
      state.form.municipio = defaults.municipio;
      state.form.localidade = defaults.localidade;
      applyAreaDefaults(state.form.area);
    } else {
      state.bimForm = emptyBimForm();
      state.bimForm.professor = getProfessorNome();
      state.bimForm.escola = defaults.escola;
      state.bimForm.municipio = defaults.municipio;
      applyAreaDefaultsBim(state.bimForm.area);
    }
    setView('wizard');
    renderWizard();
  }

  function applyAreaDefaults(area) {
    var meta = areaMeta(area);
    state.form.area = area;
    state.form.categoria = meta.categoria;
    if (!state.form.componente || meta.componentes.indexOf(state.form.componente) < 0) {
      state.form.componente = meta.componentes[0] || '';
    }
    if (!state.form.principios) state.form.principios = meta.principios.join('; ');
    if (!state.form.eixos) state.form.eixos = meta.eixos.join('; ');
  }

  function applyAreaDefaultsBim(area) {
    var meta = areaMeta(area);
    state.bimForm.area = area;
    if (!state.bimForm.componente || meta.componentes.indexOf(state.bimForm.componente) < 0) {
      state.bimForm.componente = meta.componentes[0] || '';
    }
  }

  function stepsForTipo() {
    if (state.tipo === 'plano') {
      return [
        { id: 'contexto', title: 'Identificação' },
        { id: 'curriculo', title: 'Currículo' },
        { id: 'aprendizagem', title: 'Aprendizagem' },
        { id: 'avaliacao', title: 'Avaliação e referências' },
        { id: 'revisao', title: 'Revisão e Drive' }
      ];
    }
    return [
      { id: 'contexto', title: 'Identificação' },
      { id: 'objetivos', title: 'Objetivos e currículo' },
      { id: 'sequencia', title: 'Sequência e metodologia' },
      { id: 'avaliacao', title: 'Avaliação' },
      { id: 'revisao', title: 'Revisão e Drive' }
    ];
  }

  function renderWizard() {
    var steps = stepsForTipo();
    var title = state.tipo === 'plano' ? 'Plano de Aula' : 'Planejamento Bimestral';
    var titleEl = document.getElementById('pl-wizard-title');
    var subEl = document.getElementById('pl-wizard-sub');
    if (titleEl) titleEl.textContent = title;
    if (subEl) {
      subEl.textContent = 'Passo ' + (state.step + 1) + ' de ' + steps.length + ' — ' + steps[state.step].title;
    }

    var steppers = document.getElementById('pl-stepper');
    if (steppers) {
      steppers.innerHTML = steps.map(function (s, i) {
        var active = i === state.step;
        var done = i < state.step;
        return (
          '<div class="flex items-center gap-2 ' + (i < steps.length - 1 ? 'flex-1' : '') + '">' +
          '<div class="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ' +
          (active ? 'bg-primary text-white' : done ? 'bg-primary/20 text-primary' : 'bg-surface-container text-text-secondary') +
          '">' + (done ? '✓' : (i + 1)) + '</div>' +
          '<span class="hidden md:inline text-label-md ' + (active ? 'text-primary font-semibold' : 'text-text-secondary') + '">' +
          escapeHtml(s.title) + '</span>' +
          (i < steps.length - 1 ? '<div class="hidden sm:block flex-1 h-px bg-border-subtle mx-2"></div>' : '') +
          '</div>'
        );
      }).join('');
    }

    var body = document.getElementById('pl-wizard-body');
    if (!body) return;
    body.innerHTML = state.tipo === 'plano'
      ? renderPlanoStep(steps[state.step].id)
      : renderBimStep(steps[state.step].id);

    bindWizardFields();
    updateWizardNav();
  }

  function apoioPanel(area) {
    return (
      '<div class="rounded-xl border border-primary/20 bg-primary/5 p-4 space-y-2">' +
      '<p class="text-[11px] font-bold uppercase text-primary tracking-wider">Documentos de apoio</p>' +
      '<p class="text-label-md text-text-secondary">Use a ementa da área, a coerência pedagógica e o Documento Curricular (Pará) ao preencher.</p>' +
      '<div class="flex flex-wrap gap-2">' +
      linkBtn('Ementa da área', ementaHref(area), 'menu_book') +
      linkBtn('Coerência Pedagógica', APOIO.coerencia, 'psychology') +
      linkBtn('Documento Curricular', APOIO.curricular, 'library_books') +
      linkBtn('Modelo SEDUC-PA', APOIO.template, 'description') +
      '</div></div>'
    );
  }

  function linkBtn(label, href, icon) {
    return (
      '<a class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-border-subtle text-label-md font-semibold text-on-surface hover:border-primary/40" href="' +
      escapeHtml(href) + '" target="_blank" rel="noopener">' +
      '<span class="material-symbols-outlined text-[16px]">' + icon + '</span>' + escapeHtml(label) + '</a>'
    );
  }

  function field(id, label, type, value, opts) {
    opts = opts || {};
    var common = ' class="w-full px-4 py-2.5 border border-border-subtle rounded-xl text-body-md focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none bg-white" id="' +
      id + '" data-pl-field="' + id + '"';
    var html = '<div' + (opts.full ? ' class="md:col-span-2"' : '') + '>';
    html += '<label class="block text-[11px] font-bold text-text-secondary uppercase mb-1.5" for="' + id + '">' +
      escapeHtml(label) + (opts.required ? ' *' : '') + '</label>';
    if (type === 'textarea') {
      html += '<textarea rows="' + (opts.rows || 3) + '"' + common +
        (opts.required ? ' required' : '') + ' placeholder="' + escapeHtml(opts.placeholder || '') + '">' +
        escapeHtml(value || '') + '</textarea>';
    } else if (type === 'select') {
      html += '<select' + common + (opts.required ? ' required' : '') + '>';
      (opts.options || []).forEach(function (opt) {
        var v = typeof opt === 'string' ? opt : opt.value;
        var t = typeof opt === 'string' ? opt : opt.label;
        html += '<option value="' + escapeHtml(v) + '"' + (v === value ? ' selected' : '') + '>' +
          escapeHtml(t) + '</option>';
      });
      html += '</select>';
    } else {
      html += '<input type="' + (type || 'text') + '"' + common +
        (opts.required ? ' required' : '') +
        ' value="' + escapeHtml(value || '') + '"' +
        (opts.placeholder ? ' placeholder="' + escapeHtml(opts.placeholder) + '"' : '') + '/>';
    }
    if (opts.hint) {
      html += '<p class="text-[11px] text-text-secondary mt-1">' + escapeHtml(opts.hint) + '</p>';
    }
    html += '</div>';
    return html;
  }

  function renderPlanoStep(id) {
    var f = state.form;
    var meta = areaMeta(f.area);
    var areas = Object.keys(AREAS);
    if (id === 'contexto') {
      return (
        apoioPanel(f.area) +
        '<div class="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">' +
        field('dre', 'DRE', 'text', f.dre, { required: true }) +
        field('municipio', 'Município', 'text', f.municipio, { required: true }) +
        field('escola', 'Escola', 'text', f.escola, { required: true }) +
        field('localidade', 'Localidade', 'text', f.localidade) +
        field('professor', 'Professor(a)', 'text', f.professor, { required: true }) +
        field('ano', 'Ano letivo', 'text', f.ano, { required: true }) +
        field('turma', 'Turma / série', 'text', f.turma, { required: true, placeholder: 'Ex.: 1º Ano EM — A' }) +
        field('duracao', 'Duração', 'text', f.duracao, { required: true, placeholder: 'Ex.: 2 aulas / 100 min' }) +
        field('dataAula', 'Data da aula', 'date', f.dataAula) +
        '</div>'
      );
    }
    if (id === 'curriculo') {
      return (
        apoioPanel(f.area) +
        '<div class="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">' +
        field('area', 'Área de conhecimento', 'select', f.area, { required: true, options: areas }) +
        field('categoria', 'Categoria de área', 'text', f.categoria || meta.categoria, { required: true }) +
        field('componente', 'Componente curricular', 'select', f.componente, {
          required: true,
          options: meta.componentes
        }) +
        field('principios', 'Princípios curriculares norteadores', 'textarea', f.principios, {
          full: true,
          required: true,
          hint: 'Alinhados à BNCC e ao Documento Curricular do Pará.'
        }) +
        field('eixos', 'Eixos estruturantes', 'textarea', f.eixos, { full: true, required: true }) +
        field('competencias', 'Competências específicas da área', 'textarea', f.competencias, {
          full: true,
          required: true,
          placeholder: 'Ex.: Competências da área conforme BNCC / ementa'
        }) +
        field('habilidades', 'Habilidades (códigos BNCC / DC-PA)', 'textarea', f.habilidades, {
          full: true,
          required: true,
          placeholder: 'Ex.: EM13LGG101; códigos da ementa da disciplina'
        }) +
        '</div>'
      );
    }
    if (id === 'aprendizagem') {
      return (
        '<div class="grid grid-cols-1 md:grid-cols-2 gap-4">' +
        field('objeto', 'Objeto de conhecimento', 'textarea', f.objeto, { full: true, required: true }) +
        field('expectativas', 'Expectativas de aprendizagem', 'textarea', f.expectativas, {
          full: true,
          required: true,
          rows: 4
        }) +
        field('estrategias', 'Estratégias de aprendizagem', 'textarea', f.estrategias, {
          full: true,
          required: true,
          rows: 4,
          hint: 'Etapas da aula: abertura, desenvolvimento, fechamento.'
        }) +
        field('integracao', 'Integração curricular', 'textarea', f.integracao, {
          full: true,
          placeholder: 'Articulação com outros componentes / projetos'
        }) +
        field('culminancia', 'Culminância', 'textarea', f.culminancia, {
          full: true,
          placeholder: 'Produto, socialização ou síntese da aula'
        }) +
        '</div>'
      );
    }
    if (id === 'avaliacao') {
      return (
        '<div class="grid grid-cols-1 gap-4">' +
        field('avaliacao', 'Avaliação das aprendizagens', 'textarea', f.avaliacao, {
          full: true,
          required: true,
          rows: 4
        }) +
        field('referencias', 'Referências', 'textarea', f.referencias, {
          full: true,
          rows: 3,
          placeholder: 'BNCC, Documento Curricular do Pará, livros didáticos, sites…'
        }) +
        '</div>'
      );
    }
    return renderPlanoPreview();
  }

  function renderBimStep(id) {
    var f = state.bimForm;
    var meta = areaMeta(f.area);
    var areas = Object.keys(AREAS);
    var bimestres = ['1º Bimestre', '2º Bimestre', '3º Bimestre', '4º Bimestre'];
    if (id === 'contexto') {
      return (
        apoioPanel(f.area) +
        '<div class="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">' +
        field('professor', 'Professor(a)', 'text', f.professor, { required: true }) +
        field('escola', 'Escola', 'text', f.escola, { required: true }) +
        field('municipio', 'Município', 'text', f.municipio) +
        field('ano', 'Ano letivo', 'text', f.ano, { required: true }) +
        field('bimestre', 'Bimestre', 'select', f.bimestre, { required: true, options: bimestres }) +
        field('turma', 'Turma / série', 'text', f.turma, { required: true }) +
        field('area', 'Área de conhecimento', 'select', f.area, { required: true, options: areas }) +
        field('componente', 'Componente curricular', 'select', f.componente, {
          required: true,
          options: meta.componentes
        }) +
        field('cargaHoraria', 'Carga horária do bimestre', 'text', f.cargaHoraria, {
          placeholder: 'Ex.: 40 h/a'
        }) +
        '</div>'
      );
    }
    if (id === 'objetivos') {
      return (
        apoioPanel(f.area) +
        '<div class="grid grid-cols-1 gap-4 mt-4">' +
        field('justificativa', 'Justificativa pedagógica', 'textarea', f.justificativa, {
          full: true,
          required: true,
          rows: 3,
          hint: 'Contexto da turma, relevância social e alinhamento ao Documento Curricular do Pará.'
        }) +
        field('objetivos', 'Objetivos de aprendizagem do bimestre', 'textarea', f.objetivos, {
          full: true,
          required: true,
          rows: 4
        }) +
        field('competencias', 'Competências (BNCC / área)', 'textarea', f.competencias, {
          full: true,
          required: true
        }) +
        field('habilidades', 'Habilidades prioritárias', 'textarea', f.habilidades, {
          full: true,
          required: true,
          placeholder: 'Códigos e descrição breve'
        }) +
        field('objetos', 'Objetos de conhecimento / conteúdos', 'textarea', f.objetos, {
          full: true,
          required: true,
          rows: 4
        }) +
        '</div>'
      );
    }
    if (id === 'sequencia') {
      return (
        '<div class="grid grid-cols-1 gap-4">' +
        field('sequencia', 'Sequência didática (semanas / blocos)', 'textarea', f.sequencia, {
          full: true,
          required: true,
          rows: 6,
          placeholder: 'Semana 1: …\nSemana 2: …\nSemana 3: …\nSemana 4: …'
        }) +
        field('metodologias', 'Metodologias e estratégias', 'textarea', f.metodologias, {
          full: true,
          required: true,
          rows: 4
        }) +
        field('recursos', 'Recursos didáticos', 'textarea', f.recursos, {
          full: true,
          placeholder: 'Livro didático, laboratório, Chromebooks, materiais impressos…'
        }) +
        '</div>'
      );
    }
    if (id === 'avaliacao') {
      return (
        '<div class="grid grid-cols-1 gap-4">' +
        field('avaliacao', 'Avaliação (diagnóstica, formativa e somativa)', 'textarea', f.avaliacao, {
          full: true,
          required: true,
          rows: 4
        }) +
        field('recuperacao', 'Recuperação paralela / reforço', 'textarea', f.recuperacao, {
          full: true,
          rows: 3
        }) +
        field('referencias', 'Referências', 'textarea', f.referencias, { full: true, rows: 3 }) +
        field('observacoes', 'Observações / adaptações (inclusão, AEE)', 'textarea', f.observacoes, {
          full: true,
          rows: 3
        }) +
        '</div>'
      );
    }
    return renderBimPreview();
  }

  function renderPlanoPreview() {
    var f = state.form;
    return (
      '<div class="rounded-xl border border-border-subtle bg-white p-5 space-y-3 text-body-md">' +
      '<p class="text-[11px] font-bold uppercase text-text-secondary">Pré-visualização</p>' +
      '<p><strong>Componente:</strong> ' + escapeHtml(f.componente) + ' · <strong>Turma:</strong> ' +
      escapeHtml(f.turma) + ' · <strong>Data:</strong> ' + escapeHtml(formatDateBr(f.dataAula)) + '</p>' +
      '<p><strong>Habilidades:</strong> ' + nlToBr(f.habilidades) + '</p>' +
      '<p><strong>Objeto:</strong> ' + nlToBr(f.objeto) + '</p>' +
      '<p><strong>Estratégias:</strong> ' + nlToBr(f.estrategias) + '</p>' +
      '<p class="text-label-md text-text-secondary">Ao salvar, o documento HTML será gerado e enviado ao Drive na pasta <strong>PLANO DE AULA</strong>.</p>' +
      '</div>'
    );
  }

  function renderBimPreview() {
    var f = state.bimForm;
    return (
      '<div class="rounded-xl border border-border-subtle bg-white p-5 space-y-3 text-body-md">' +
      '<p class="text-[11px] font-bold uppercase text-text-secondary">Pré-visualização</p>' +
      '<p><strong>' + escapeHtml(f.bimestre) + '</strong> — ' + escapeHtml(f.componente) +
      ' · ' + escapeHtml(f.turma) + '</p>' +
      '<p><strong>Objetivos:</strong> ' + nlToBr(f.objetivos) + '</p>' +
      '<p><strong>Sequência:</strong> ' + nlToBr(f.sequencia) + '</p>' +
      '<p class="text-label-md text-text-secondary">Ao salvar, o documento será enviado ao Drive na pasta <strong>PLANEJAMENTO BIMESTRAL</strong>.</p>' +
      '</div>'
    );
  }

  function bindWizardFields() {
    var root = document.getElementById('pl-wizard-body');
    if (!root) return;
    root.querySelectorAll('[data-pl-field]').forEach(function (el) {
      el.addEventListener('change', onFieldChange);
      el.addEventListener('input', onFieldChange);
    });
  }

  function onFieldChange(ev) {
    var el = ev.target;
    var key = el.getAttribute('data-pl-field');
    if (!key) return;
    var target = state.tipo === 'plano' ? state.form : state.bimForm;
    target[key] = el.value;
    if (key === 'area') {
      if (state.tipo === 'plano') {
        applyAreaDefaults(el.value);
        state.form.principios = areaMeta(el.value).principios.join('; ');
        state.form.eixos = areaMeta(el.value).eixos.join('; ');
        state.form.categoria = areaMeta(el.value).categoria;
      } else {
        applyAreaDefaultsBim(el.value);
      }
      renderWizard();
    }
  }

  function updateWizardNav() {
    var steps = stepsForTipo();
    var prev = document.getElementById('pl-btn-prev');
    var next = document.getElementById('pl-btn-next');
    var save = document.getElementById('pl-btn-save');
    if (prev) prev.disabled = state.step === 0 || state.busy;
    if (next) {
      next.classList.toggle('hidden', state.step >= steps.length - 1);
      next.disabled = state.busy;
    }
    if (save) {
      save.classList.toggle('hidden', state.step < steps.length - 1);
      save.disabled = state.busy;
    }
  }

  function validateCurrentStep() {
    var root = document.getElementById('pl-wizard-body');
    if (!root) return true;
    var ok = true;
    root.querySelectorAll('[required]').forEach(function (el) {
      if (!String(el.value || '').trim()) {
        ok = false;
        el.classList.add('ring-2', 'ring-error/40');
      } else {
        el.classList.remove('ring-2', 'ring-error/40');
      }
    });
    if (!ok) showToast('Preencha os campos obrigatórios deste passo.', 'erro');
    return ok;
  }

  function wizardPrev() {
    if (state.step > 0) {
      state.step -= 1;
      renderWizard();
    }
  }

  function wizardNext() {
    if (!validateCurrentStep()) return;
    var steps = stepsForTipo();
    if (state.step < steps.length - 1) {
      state.step += 1;
      renderWizard();
    }
  }

  /* ---------- Document HTML ---------- */

  function buildPlanoHtml(f) {
    var rows = [
      ['DRE', f.dre],
      ['Município', f.municipio],
      ['Escola', f.escola],
      ['Localidade', f.localidade],
      ['Professor(a)', f.professor],
      ['Ano', f.ano],
      ['Turma', f.turma],
      ['Duração', f.duracao],
      ['Data', formatDateBr(f.dataAula)],
      ['Área de conhecimento', f.area],
      ['Categoria de área', f.categoria],
      ['Componente curricular', f.componente],
      ['Princípios curriculares norteadores', f.principios],
      ['Eixos estruturantes', f.eixos],
      ['Competências específicas da área', f.competencias],
      ['Habilidades', f.habilidades],
      ['Objeto de conhecimento', f.objeto],
      ['Expectativas de aprendizagem', f.expectativas],
      ['Estratégias de aprendizagem', f.estrategias],
      ['Integração curricular', f.integracao],
      ['Culminância', f.culminancia],
      ['Avaliação das aprendizagens', f.avaliacao],
      ['Referências', f.referencias]
    ];
    return wrapDocHtml(
      'PLANO DE AULA',
      'Governo do Estado do Pará — SEDUC / Documento alinhado ao modelo curricular',
      f.componente + ' — ' + f.turma,
      rows
    );
  }

  function buildBimHtml(f) {
    var rows = [
      ['Professor(a)', f.professor],
      ['Escola', f.escola],
      ['Município', f.municipio],
      ['Ano letivo', f.ano],
      ['Bimestre', f.bimestre],
      ['Turma', f.turma],
      ['Área', f.area],
      ['Componente', f.componente],
      ['Carga horária', f.cargaHoraria],
      ['Justificativa', f.justificativa],
      ['Objetivos de aprendizagem', f.objetivos],
      ['Competências', f.competencias],
      ['Habilidades', f.habilidades],
      ['Objetos de conhecimento', f.objetos],
      ['Sequência didática', f.sequencia],
      ['Metodologias', f.metodologias],
      ['Recursos', f.recursos],
      ['Avaliação', f.avaliacao],
      ['Recuperação / reforço', f.recuperacao],
      ['Referências', f.referencias],
      ['Observações', f.observacoes]
    ];
    return wrapDocHtml(
      'PLANEJAMENTO BIMESTRAL',
      'Planejamento pedagógico alinhado à BNCC e ao Documento Curricular do Pará',
      f.bimestre + ' — ' + f.componente + ' — ' + f.turma,
      rows
    );
  }

  function wrapDocHtml(title, subtitle, line, rows) {
    var body = rows.map(function (r) {
      return (
        '<tr><th style="width:28%;text-align:left;vertical-align:top;padding:10px;border:1px solid #c5d0c8;background:#eef6f0;font-size:12px;text-transform:uppercase;letter-spacing:.02em;">' +
        escapeHtml(r[0]) +
        '</th><td style="padding:10px;border:1px solid #c5d0c8;font-size:14px;line-height:1.5;">' +
        nlToBr(r[1] || '—') +
        '</td></tr>'
      );
    }).join('');
    return (
      '<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"/>' +
      '<title>' + escapeHtml(title) + '</title>' +
      '<style>body{font-family:Georgia,\'Times New Roman\',serif;color:#121c2a;margin:32px;}' +
      'h1{font-size:22px;margin:0 0 4px;color:#006d37;}h2{font-size:14px;font-weight:normal;color:#556;margin:0 0 16px;}' +
      'p.meta{font-size:14px;margin:0 0 20px;}table{width:100%;border-collapse:collapse;}' +
      '@media print{body{margin:12mm;}}</style></head><body>' +
      '<h1>' + escapeHtml(title) + '</h1>' +
      '<h2>' + escapeHtml(subtitle) + '</h2>' +
      '<p class="meta"><strong>' + escapeHtml(line) + '</strong></p>' +
      '<table>' + body + '</table>' +
      '<p style="margin-top:24px;font-size:11px;color:#667;">Gerado pelo SIGA EDUCA em ' +
      escapeHtml(new Date().toLocaleString('pt-BR')) + '</p>' +
      '</body></html>'
    );
  }

  function safeFileName(parts) {
    return parts
      .map(function (p) { return String(p || '').trim(); })
      .filter(Boolean)
      .join(' - ')
      .replace(/[\\/:*?"<>|]+/g, '-')
      .replace(/\s+/g, ' ')
      .slice(0, 120) + '.html';
  }

  function setBusy(busy) {
    state.busy = !!busy;
    updateWizardNav();
    var bar = document.getElementById('pl-upload-wrap');
    if (bar) bar.classList.toggle('hidden', !busy);
  }

  function setProgress(pct, text) {
    var fill = document.getElementById('pl-upload-bar');
    var label = document.getElementById('pl-upload-text');
    if (fill) fill.style.width = Math.max(0, Math.min(100, pct || 0)) + '%';
    if (label) label.textContent = text || (Math.round(pct || 0) + '%');
  }

  function salvarDocumento() {
    if (!validateCurrentStep()) return;
    var isPlano = state.tipo === 'plano';
    var f = isPlano ? state.form : state.bimForm;
    var html = isPlano ? buildPlanoHtml(f) : buildBimHtml(f);
    var tipoDrive = isPlano ? DRIVE_TIPO_PLANO : DRIVE_TIPO_BIM;
    var fileName = isPlano
      ? safeFileName(['Plano de Aula', f.componente, f.turma, formatDateBr(f.dataAula)])
      : safeFileName(['Planejamento', f.bimestre, f.componente, f.turma, f.ano]);
    var blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    var professor = getProfessorNome(f.professor);

    setBusy(true);
    setProgress(8, 'Gerando documento…');

    requireDrive()
      .then(function (drive) {
        setProgress(15, 'Enviando ao Drive…');
        return drive.uploadPlanejamentoFile(
          tipoDrive,
          blob,
          fileName,
          'text/html',
          function (pct, msg) { setProgress(pct, msg || 'Enviando…'); },
          professor
        );
      })
      .then(function (result) {
        var item = {
          id: uid(),
          tipo: tipoDrive,
          titulo: isPlano
            ? ('Plano de Aula — ' + f.componente + ' — ' + f.turma)
            : ('Planejamento — ' + f.bimestre + ' — ' + f.componente),
          professor: professor,
          componente: f.componente,
          turma: f.turma,
          createdAt: new Date().toISOString(),
          fileName: fileName,
          driveFileId: result && (result.fileId || result.id) || null,
          driveUrl: result && (result.webViewLink || result.url) || null,
          driveFolderUrl: result && (result.folderWebLink || result.folderWebViewLink) || null,
          snapshot: f
        };
        var list = getList();
        list.unshift(item);
        saveList(list);
        setBusy(false);
        showToast('Documento salvo e enviado ao Drive (' + tipoDrive + ').');
        setView('docs');
      })
      .catch(function (err) {
        setBusy(false);
        var msg = (err && err.message) || 'Falha ao enviar ao Drive.';
        showToast(msg, 'erro');
        // Ainda salva localmente para não perder o trabalho
        var item = {
          id: uid(),
          tipo: tipoDrive,
          titulo: isPlano
            ? ('Plano de Aula — ' + f.componente + ' — ' + f.turma)
            : ('Planejamento — ' + f.bimestre + ' — ' + f.componente),
          professor: professor,
          componente: f.componente,
          turma: f.turma,
          createdAt: new Date().toISOString(),
          fileName: fileName,
          driveFileId: null,
          driveUrl: null,
          localOnly: true,
          html: html,
          snapshot: f,
          error: msg
        };
        var list = getList();
        list.unshift(item);
        saveList(list);
        showToast('Documento guardado localmente. Reenvie ao Drive quando estiver disponível.', 'alerta');
        setView('docs');
      });
  }

  function renderDocs() {
    var list = getList();
    var filter = (document.getElementById('pl-filter-tipo') || {}).value || '';
    var filtered = list.filter(function (d) {
      return !filter || d.tipo === filter;
    });
    var box = document.getElementById('pl-docs-list');
    var empty = document.getElementById('pl-docs-empty');
    if (!box) return;
    if (!filtered.length) {
      box.innerHTML = '';
      if (empty) empty.classList.remove('hidden');
      return;
    }
    if (empty) empty.classList.add('hidden');
    box.innerHTML = filtered.map(function (d) {
      var driveOk = !!(d.driveUrl || d.driveFileId);
      return (
        '<article class="bg-white border border-border-subtle rounded-2xl p-5 custom-shadow flex flex-col gap-3">' +
        '<div class="flex items-start justify-between gap-3">' +
        '<div><p class="text-[10px] font-bold uppercase tracking-wider text-primary">' + escapeHtml(d.tipo) + '</p>' +
        '<h3 class="text-headline-sm text-on-surface mt-1">' + escapeHtml(d.titulo) + '</h3>' +
        '<p class="text-label-md text-text-secondary mt-1">' + escapeHtml(d.professor || '') +
        ' · ' + escapeHtml(new Date(d.createdAt).toLocaleString('pt-BR')) + '</p></div>' +
        '<span class="material-symbols-outlined text-primary text-[28px]">' +
        (d.tipo === DRIVE_TIPO_PLANO ? 'edit_note' : 'calendar_month') + '</span></div>' +
        '<div class="flex flex-wrap gap-2 mt-auto">' +
        (driveOk
          ? '<button type="button" class="px-3 py-2 rounded-lg bg-primary text-white text-label-md font-semibold" data-pl-open="' +
            escapeHtml(d.driveUrl || '') + '">Abrir no Drive</button>'
          : '<button type="button" class="px-3 py-2 rounded-lg border border-border-subtle text-label-md font-semibold" data-pl-retry="' +
            escapeHtml(d.id) + '">Reenviar ao Drive</button>') +
        (d.html
          ? '<button type="button" class="px-3 py-2 rounded-lg border border-border-subtle text-label-md font-semibold" data-pl-preview="' +
            escapeHtml(d.id) + '">Visualizar</button>'
          : '') +
        '<button type="button" class="px-3 py-2 rounded-lg text-error text-label-md font-semibold" data-pl-del="' +
        escapeHtml(d.id) + '">Excluir</button>' +
        '</div></article>'
      );
    }).join('');

    box.querySelectorAll('[data-pl-open]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var url = btn.getAttribute('data-pl-open');
        var drive = getDriveApi();
        if (drive && drive.openInDrive && url) drive.openInDrive(url);
        else if (url) window.open(url, '_blank', 'noopener');
      });
    });
    box.querySelectorAll('[data-pl-preview]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id = btn.getAttribute('data-pl-preview');
        var doc = getList().find(function (x) { return x.id === id; });
        if (!doc || !doc.html) return;
        var w = window.open('', '_blank');
        if (w) {
          w.document.write(doc.html);
          w.document.close();
        }
      });
    });
    box.querySelectorAll('[data-pl-del]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id = btn.getAttribute('data-pl-del');
        if (!confirm('Excluir este registro local? (o arquivo no Drive não é apagado)')) return;
        saveList(getList().filter(function (x) { return x.id !== id; }));
        renderDocs();
        renderHubKpis();
      });
    });
    box.querySelectorAll('[data-pl-retry]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        retryUpload(btn.getAttribute('data-pl-retry'));
      });
    });
  }

  function retryUpload(id) {
    var list = getList();
    var doc = list.find(function (x) { return x.id === id; });
    if (!doc) return;
    var html = doc.html;
    if (!html && doc.snapshot) {
      html = doc.tipo === DRIVE_TIPO_PLANO
        ? buildPlanoHtml(doc.snapshot)
        : buildBimHtml(doc.snapshot);
    }
    if (!html) {
      showToast('Não há conteúdo para reenviar.', 'erro');
      return;
    }
    var blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    setBusy(true);
    requireDrive()
      .then(function (drive) {
        return drive.uploadPlanejamentoFile(
          doc.tipo,
          blob,
          doc.fileName || 'planejamento.html',
          'text/html',
          function (pct, msg) { setProgress(pct, msg || 'Enviando…'); },
          doc.professor
        );
      })
      .then(function (result) {
        doc.driveFileId = result && (result.fileId || result.id) || null;
        doc.driveUrl = result && (result.webViewLink || result.url) || null;
        doc.localOnly = false;
        doc.error = null;
        saveList(list);
        setBusy(false);
        showToast('Reenviado ao Drive com sucesso.');
        renderDocs();
      })
      .catch(function (err) {
        setBusy(false);
        showToast((err && err.message) || 'Falha no reenvio.', 'erro');
      });
  }

  /* ---------- Public API ---------- */

  function init() {
    updateDriveHint();
    renderHubKpis();
    setView('hub');

    document.querySelectorAll('[data-pl-card]').forEach(function (card) {
      card.addEventListener('click', function () {
        startWizard(card.getAttribute('data-pl-card'));
      });
    });

    var btnDocs = document.getElementById('pl-btn-meus-docs');
    if (btnDocs) btnDocs.addEventListener('click', function () { setView('docs'); });

    var btnBackHub = document.getElementById('pl-btn-back-hub');
    if (btnBackHub) btnBackHub.addEventListener('click', function () { setView('hub'); });

    var btnBackDocs = document.getElementById('pl-btn-back-from-docs');
    if (btnBackDocs) btnBackDocs.addEventListener('click', function () { setView('hub'); });

    var btnPrev = document.getElementById('pl-btn-prev');
    var btnNext = document.getElementById('pl-btn-next');
    var btnSave = document.getElementById('pl-btn-save');
    if (btnPrev) btnPrev.addEventListener('click', wizardPrev);
    if (btnNext) btnNext.addEventListener('click', wizardNext);
    if (btnSave) btnSave.addEventListener('click', salvarDocumento);

    var filter = document.getElementById('pl-filter-tipo');
    if (filter) filter.addEventListener('change', renderDocs);
  }

  window.SigaPlanejamento = {
    init: init,
    startWizard: startWizard,
    setView: setView
  };

  document.addEventListener('DOMContentLoaded', init);
})();
