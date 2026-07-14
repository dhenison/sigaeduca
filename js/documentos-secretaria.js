/**
 * SIGA Educa — Documentos da Secretaria
 * Vanilla JS + localStorage (no backend)
 * Storage key: siga_documentos_secretaria
 */
(function () {
  'use strict';

  // ─── Constants ─────────────────────────────────────────────────────────────
  const DOCUMENTO_SECRETARIA_VALIDADE_DIAS = 30;
  const DOCUMENTO_SECRETARIA_TIPO_VAGA = 'Declaração de Vaga';
  const DOCUMENTO_SECRETARIA_TIPO_ATESTADO = 'Atestado de Conclusão';
  const DOCUMENTO_SECRETARIA_TIPO_REQ_HIST_DIPLOMA = 'Requerimento de Histórico e Diploma';
  const SEC_STORAGE_KEY = 'siga_documentos_secretaria';
  const SEC_ANO_LETIVO = '2026';
  /** Base pública do QR (celular precisa de URL https, não file://) */
  const SEC_PUBLIC_SITE =
    (typeof window !== 'undefined' && window.SIGA_PUBLIC_SITE_URL) ||
    'https://sigaeduca.com';

  let SEC_ACTIVE_TAB = 'historico';
  let SEC_FILTER_CACHE = { search: '', tipo: '' };

  // ─── Storage ───────────────────────────────────────────────────────────────
  function getSecDocumentos() {
    try {
      const raw = localStorage.getItem(SEC_STORAGE_KEY);
      const list = raw ? JSON.parse(raw) : [];
      return Array.isArray(list) ? list : [];
    } catch (e) {
      console.error('[getSecDocumentos]', e);
      return [];
    }
  }

  function saveSecDocumentos(list) {
    localStorage.setItem(SEC_STORAGE_KEY, JSON.stringify(Array.isArray(list) ? list : []));
  }

  // ─── Type helpers ──────────────────────────────────────────────────────────
  function isRequerimento(tipo) {
    return String(tipo || '').startsWith('Requerimento');
  }

  function isAtestadoConclusao(tipo) {
    return tipo === DOCUMENTO_SECRETARIA_TIPO_ATESTADO;
  }

  function isDeclaracao(tipo) {
    return String(tipo || '').startsWith('Declaração') || isAtestadoConclusao(tipo);
  }

  // ─── Protocol generation ───────────────────────────────────────────────────
  function slugSchoolToken(schoolName) {
    const source = String(schoolName || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '')
      .slice(0, 6)
      .toUpperCase();
    return source || '';
  }

  function extractProtocolSeq(protocolo, schoolToken) {
    const partes = String(protocolo || '').split('-');
    const seqRaw = String(partes[partes.length - 1] || '');
    const token = String(schoolToken || '').toUpperCase();
    const seqOnly = token && seqRaw.toUpperCase().startsWith(token)
      ? seqRaw.slice(token.length)
      : seqRaw;
    const seqNum = parseInt(seqOnly, 10);
    return Number.isNaN(seqNum) ? null : seqNum;
  }

  function gerarProtocoloSec(tipoDoc) {
    const prefix = isRequerimento(tipoDoc) ? 'REQ' : 'DEC';
    const ano = String(new Date().getFullYear());
    // Single-school: token vazio → SEC-DEC-2026-0001
    // Multi-escola (futuro): usar slugSchoolToken(getSecSchoolInfo().nome)
    const schoolToken = '';
    const seqPrefix = schoolToken || '';
    const docs = getSecDocumentos();
    const like = `SEC-${prefix}-${ano}-${seqPrefix}`;

    let maxSeq = 0;
    docs.forEach(function (d) {
      if (!d.protocolo || String(d.protocolo).indexOf(like) !== 0) return;
      const seqNum = extractProtocolSeq(d.protocolo, schoolToken);
      if (seqNum && seqNum > maxSeq) maxSeq = seqNum;
    });

    for (let attempt = 0; attempt < 3; attempt++) {
      const nextSeq = maxSeq + 1 + attempt;
      const candidate = `SEC-${prefix}-${ano}-${seqPrefix}${String(nextSeq).padStart(4, '0')}`;
      const collision = docs.some(function (d) { return d.protocolo === candidate; });
      if (!collision) return candidate;
    }

    const rand = Math.floor(1000 + Math.random() * 9000);
    return `SEC-${prefix}-${ano}-${seqPrefix}${rand}`;
  }

  // ─── Obs metadata ──────────────────────────────────────────────────────────
  function extrairMetaDocumentoSecretaria(obs, chave) {
    if (!obs || !chave) return '';
    const regex = new RegExp('\\[' + chave + ':\\s*([^\\]]+)\\]', 'i');
    const match = String(obs).match(regex);
    return match ? match[1].trim() : '';
  }

  function limparMetaDocumentoSecretaria(obs) {
    return String(obs || '')
      .replace(/\[(?:NASC|DT_NASC|VAGA_ETAPA|VAGA_TURNO):[^\]]*\]\s*/gi, '')
      .replace(/\s{2,}/g, ' ')
      .trim();
  }

  // ─── Validity (todos os documentos com QR: 30 dias a partir da emissão) ─────
  function parseDateOnly(value) {
    if (!value) return null;
    if (value instanceof Date) {
      if (Number.isNaN(value.getTime())) return null;
      return new Date(value.getFullYear(), value.getMonth(), value.getDate());
    }
    const raw = String(value).trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(raw)) {
      const d = new Date(raw.slice(0, 10) + 'T00:00:00');
      return Number.isNaN(d.getTime()) ? null : d;
    }
    if (/^\d{2}\/\d{2}\/\d{4}/.test(raw)) {
      const p = raw.split('/');
      const d = new Date(Number(p[2]), Number(p[1]) - 1, Number(p[0]));
      return Number.isNaN(d.getTime()) ? null : d;
    }
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) return null;
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }

  /** YYYY-MM-DD (local) — usado na emissão e no sync com Supabase */
  function isoDateOnly(value) {
    const d = parseDateOnly(value);
    if (!d) return null;
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + day;
  }

  function getDocumentoSecretariaDataValidade(doc) {
    if (!doc || !doc.dataEmissao) return null;
    if (doc.dataValidade) {
      const cached = parseDateOnly(doc.dataValidade);
      if (cached) return cached;
    }
    const emissao = parseDateOnly(doc.dataEmissao);
    if (!emissao) return null;
    const validade = new Date(emissao.getTime());
    validade.setDate(validade.getDate() + DOCUMENTO_SECRETARIA_VALIDADE_DIAS);
    return validade;
  }

  function isDocumentoSecretariaValido(doc) {
    if (!doc) return false;
    const validade = getDocumentoSecretariaDataValidade(doc);
    if (!validade) return false;
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    return hoje.getTime() <= validade.getTime();
  }

  function statusValidadeLabel(doc) {
    return isDocumentoSecretariaValido(doc) ? 'Válido' : 'Fora da Validade';
  }

  function computeDataValidadeIso(dataEmissao) {
    const e = parseDateOnly(dataEmissao || new Date());
    if (!e) return null;
    e.setDate(e.getDate() + DOCUMENTO_SECRETARIA_VALIDADE_DIAS);
    return isoDateOnly(e);
  }

  // ─── School / students / classes ───────────────────────────────────────────
  function getSecSchoolInfo() {
    const nome = localStorage.getItem('siga_school_name')
      || 'Escola Estadual Dr. Romildo Veloso e Silva';
    const localEmissao = localStorage.getItem('siga_school_city_state')
      || 'Ourilândia do Norte - PA';
    return { nome: nome, localEmissao: localEmissao };
  }

  function getSecStudents() {
    try {
      let students = JSON.parse(localStorage.getItem('siga_students'));
      if (!students || !students.length) {
        if (typeof getDefaultStudents === 'function') {
          students = getDefaultStudents();
          localStorage.setItem('siga_students', JSON.stringify(students));
        } else {
          students = [];
        }
      }
      return Array.isArray(students) ? students : [];
    } catch (e) {
      return typeof getDefaultStudents === 'function' ? getDefaultStudents() : [];
    }
  }

  function getSecClasses() {
    if (typeof getClasses === 'function') return getClasses();
    try {
      const classes = JSON.parse(localStorage.getItem('siga_classes'));
      return Array.isArray(classes) ? classes : [];
    } catch (e) {
      return [];
    }
  }

  function findStudentById(id) {
    if (!id) return null;
    return getSecStudents().find(function (s) { return String(s.id) === String(id); }) || null;
  }

  function resolveSerie(student) {
    if (!student) return '';
    if (student.serie) return student.serie;
    const classes = getSecClasses();
    const cls = classes.find(function (c) { return c.code === student.turma; });
    return cls ? (cls.serie || '') : '';
  }

  // ─── Format helpers ────────────────────────────────────────────────────────
  function formatarCPF(value) {
    const digits = String(value || '').replace(/\D/g, '');
    if (digits.length !== 11) return String(value || '').trim() || '—';
    return digits.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4');
  }

  function formatarDataBr(value) {
    if (!value) return '—';
    if (value instanceof Date) {
      return Number.isNaN(value.getTime()) ? '—' : value.toLocaleDateString('pt-BR');
    }
    if (typeof value === 'string' && value.includes('/')) return value;
    const isoBase = typeof value === 'string' && value.length <= 10
      ? value + 'T00:00:00'
      : value;
    const date = new Date(isoBase);
    return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString('pt-BR');
  }

  function formatarDataPorExtenso(dateVal) {
    if (!dateVal) return '';
    const date = new Date(String(dateVal).slice(0, 10) + 'T00:00:00');
    if (Number.isNaN(date.getTime())) return '';
    const meses = [
      'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
      'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'
    ];
    return date.getDate() + ' de ' + meses[date.getMonth()] + ' de ' + date.getFullYear();
  }

  function formatarSerieDocumento(serie) {
    const valor = (serie || '').toString().trim();
    if (!valor) return '—';
    return valor
      .replace(/\s+[—-]\s+(Ensino Médio|Ensino Fundamental)\b/gi, ' do $1')
      .replace(/\s+[—-]\s+/g, ' - ');
  }

  function showSecToast(message, type) {
    type = type || 'success';
    const toastEl = document.getElementById('sec-toast');
    if (toastEl) {
      toastEl.textContent = message;
      toastEl.classList.remove('hidden');
      toastEl.style.display = '';
      toastEl.setAttribute('data-type', type);
      clearTimeout(toastEl._secTimer);
      toastEl._secTimer = setTimeout(function () {
        toastEl.classList.add('hidden');
      }, 3200);
      return;
    }
    if (typeof showToast === 'function') {
      showToast(message, type === 'error' || type === 'erro' ? 'error' : 'success');
      return;
    }
    try { console.log('[SEC]', message); } catch (e) { /* noop */ }
  }

  function uid() {
    return 'sec_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 9);
  }

  function escapeHtml(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function getValidationUrl(protocolo) {
    const protocoloLimpo = String(protocolo || '').trim();
    if (!protocoloLimpo) return '';
    const base = String(SEC_PUBLIC_SITE || 'https://sigaeduca.com').replace(/\/$/, '');
    return base + '/validar-documento.html?protocolo=' + encodeURIComponent(protocoloLimpo);
  }

  function getQrUrl(protocolo, size) {
    size = size || 180;
    const urlValidacao = getValidationUrl(protocolo);
    if (!urlValidacao) return '';
    return 'https://api.qrserver.com/v1/create-qr-code/?size=' + size + 'x' + size +
      '&ecc=M&data=' + encodeURIComponent(urlValidacao);
  }

  function getActiveSchoolId() {
    try {
      return localStorage.getItem('siga_active_school') || '';
    } catch (e) {
      return '';
    }
  }

  function getSupabaseClient() {
    if (window.SigaSupabase && typeof window.SigaSupabase.getClient === 'function') {
      try { return window.SigaSupabase.getClient(); } catch (e) { /* ignore */ }
    }
    return null;
  }

  /** Grava no Supabase para o QR funcionar em qualquer aparelho */
  function syncDocumentoSecretariaCloud(doc) {
    const sb = getSupabaseClient();
    const schoolId = getActiveSchoolId();
    if (!sb || !schoolId || !doc || !doc.protocolo) {
      return Promise.resolve({ ok: false, reason: 'no_cloud' });
    }
    const issuedOn = isoDateOnly(doc.dataEmissao) || new Date().toISOString().slice(0, 10);
    const validUntil = isoDateOnly(getDocumentoSecretariaDataValidade(doc));
    const status = /cancel/.test(String(doc.status || ''))
      ? 'cancelado'
      : (isRequerimento(doc.tipo) && doc.status === 'pendente' ? 'pendente' : 'concluido');

    const row = {
      school_id: schoolId,
      protocolo: doc.protocolo,
      doc_type: doc.tipo,
      status: status,
      student_name: doc.alunoNome || null,
      student_cpf: doc.alunoCpf || null,
      student_class_code: doc.alunoTurma || null,
      student_serie: doc.alunoSerie || null,
      student_turno: doc.alunoTurno || null,
      issued_on: issuedOn,
      valid_until: validUntil,
      validity_days: DOCUMENTO_SECRETARIA_VALIDADE_DIAS,
      requester_name: doc.solicitante || null,
      reason: doc.motivo || null,
      notes: doc.obs || null,
      responsible_name: doc.responsavel || null,
      birth_city: doc.cidadeNascimento || null,
      birth_uf: doc.ufNascimento || null,
      birth_date: isoDateOnly(doc.dataNascimento),
      attendance_pct: doc.frequencia || null,
      vacancy_stage: doc.vagaEtapa || null,
      vacancy_shift: doc.vagaTurno || null,
      year_label: doc.anoLetivo || SEC_ANO_LETIVO,
      mother_name: doc.nomeMae || null,
      father_name: doc.nomePai || null,
      meta: { localId: doc.id || null }
    };

    return sb.from('secretary_documents')
      .upsert(row, { onConflict: 'school_id,protocolo' })
      .then(function (res) {
        if (res.error) {
          console.warn('[SIGA] sync secretary_documents:', res.error.message);
          return { ok: false, message: res.error.message };
        }
        return { ok: true };
      })
      .catch(function (err) {
        console.warn('[SIGA] sync secretary_documents:', err);
        return { ok: false, message: (err && err.message) || 'erro' };
      });
  }

  function statusLabel(status) {
    const map = {
      concluido: 'Concluído',
      pendente: 'Pendente',
      em_processamento: 'Em processamento',
      pronto_para_entrega: 'Pronto para entrega',
      entregue: 'Entregue',
      cancelado: 'Cancelado'
    };
    return map[status] || String(status || '—').replace(/_/g, ' ');
  }

  function statusBadgeClass(status) {
    const map = {
      concluido: 'bg-primary/10 text-primary',
      pendente: 'bg-amber-100 text-amber-700',
      em_processamento: 'bg-blue-100 text-blue-700',
      pronto_para_entrega: 'bg-violet-100 text-violet-700',
      entregue: 'bg-emerald-100 text-emerald-700',
      cancelado: 'bg-red-100 text-red-700'
    };
    return map[status] || 'bg-surface-container text-text-secondary';
  }

  // ─── Dynamic form fields ───────────────────────────────────────────────────
  function mostrarCamposDinamicosSec() {
    const tipo = document.getElementById('sec-doc-tipo')?.value || '';
    const grupoAluno = document.getElementById('sec-grupo-aluno');
    const grupoFreq = document.getElementById('sec-grupo-frequencia');
    const grupoReq = document.getElementById('sec-grupo-requerimento');
    const grupoNasc = document.getElementById('sec-grupo-nascimento');
    const grupoVaga = document.getElementById('sec-grupo-vaga');
    const grupoAtestado = document.getElementById('sec-grupo-atestado');

    function hide(el) { if (el) { el.classList.add('hidden'); el.style.display = 'none'; } }
    function show(el) { if (el) { el.classList.remove('hidden'); el.style.display = ''; } }

    show(grupoAluno);
    hide(grupoFreq);
    hide(grupoReq);
    hide(grupoNasc);
    hide(grupoVaga);
    hide(grupoAtestado);

    if (tipo && isDeclaracao(tipo) && tipo !== DOCUMENTO_SECRETARIA_TIPO_VAGA) {
      show(grupoNasc);
    }

    if (tipo === 'Declaração de Frequência (Bolsa Família)') {
      show(grupoFreq);
    } else if (tipo === DOCUMENTO_SECRETARIA_TIPO_VAGA) {
      hide(grupoAluno);
      show(grupoVaga);
    } else if (isAtestadoConclusao(tipo)) {
      hide(grupoAluno);
      show(grupoAtestado);
      const anoField = document.getElementById('sec-doc-ano-letivo');
      if (anoField && !String(anoField.value || '').trim()) {
        anoField.value = SEC_ANO_LETIVO;
      }
    }

    if (isRequerimento(tipo) || tipo === 'Declaração de Transferência' || isAtestadoConclusao(tipo)) {
      show(grupoReq);
    }
  }

  function atualizarDataNascAoSelecionarAluno() {
    const alunoId = document.getElementById('sec-doc-aluno-id')?.value;
    const dataNascField = document.getElementById('sec-doc-data-nasc');
    if (!dataNascField) return;
    if (!alunoId) {
      dataNascField.value = '';
      return;
    }
    const aluno = findStudentById(alunoId);
    dataNascField.value = (aluno && (aluno.dataNascimento || aluno.nasc)) || '';
  }

  function populateAlunoSelect() {
    const select = document.getElementById('sec-doc-aluno-id');
    if (!select) return;
    const sorted = getSecStudents().slice().sort(function (a, b) {
      return String(a.nome || '').localeCompare(String(b.nome || ''), 'pt-BR');
    });
    select.innerHTML = '<option value="">Selecione um aluno...</option>' +
      sorted.map(function (a) {
        return '<option value="' + escapeHtml(a.id) + '">' +
          escapeHtml(a.nome) + ' (' + escapeHtml(a.turma || 'Sem turma') + ')</option>';
      }).join('');
  }

  // ─── Modal ─────────────────────────────────────────────────────────────────
  function abrirModalNovoDocSecretaria() {
    populateAlunoSelect();

    const tipo = document.getElementById('sec-doc-tipo'); if (tipo) tipo.value = '';
    const freq = document.getElementById('sec-doc-frequencia'); if (freq) freq.value = '';
    const sol = document.getElementById('sec-doc-solicitante'); if (sol) sol.value = '';
    const mot = document.getElementById('sec-doc-motivo'); if (mot) mot.value = '';
    const obs = document.getElementById('sec-doc-obs'); if (obs) obs.value = '';
    const cidade = document.getElementById('sec-doc-cidade-nasc'); if (cidade) cidade.value = '';
    const uf = document.getElementById('sec-doc-uf-nasc'); if (uf) uf.value = '';
    const dtNasc = document.getElementById('sec-doc-data-nasc'); if (dtNasc) dtNasc.value = '';
    const vagaEtapa = document.getElementById('sec-doc-vaga-etapa'); if (vagaEtapa) vagaEtapa.value = '';
    const vagaTurno = document.getElementById('sec-doc-vaga-turno'); if (vagaTurno) vagaTurno.value = '';
    const anoLetivo = document.getElementById('sec-doc-ano-letivo'); if (anoLetivo) anoLetivo.value = SEC_ANO_LETIVO;
    const turmaAtest = document.getElementById('sec-doc-turma-atestado'); if (turmaAtest) turmaAtest.value = '';
    const nomeAluno = document.getElementById('sec-doc-nome-aluno'); if (nomeAluno) nomeAluno.value = '';
    const nomeMae = document.getElementById('sec-doc-nome-mae'); if (nomeMae) nomeMae.value = '';
    const nomePai = document.getElementById('sec-doc-nome-pai'); if (nomePai) nomePai.value = '';
    const alunoSel = document.getElementById('sec-doc-aluno-id'); if (alunoSel) alunoSel.value = '';

    mostrarCamposDinamicosSec();

    const modal = document.getElementById('modal-novo-doc-sec');
    if (modal) {
      modal.classList.remove('hidden');
      modal.style.display = '';
      modal.setAttribute('aria-hidden', 'false');
    }
  }

  function fecharModalNovoDocSecretaria() {
    const modal = document.getElementById('modal-novo-doc-sec');
    if (modal) {
      modal.classList.add('hidden');
      modal.style.display = 'none';
      modal.setAttribute('aria-hidden', 'true');
    }
  }

  // ─── Save ──────────────────────────────────────────────────────────────────
  function salvarDocumentoSecretaria() {
    const alunoId = document.getElementById('sec-doc-aluno-id')?.value || '';
    const tipo = document.getElementById('sec-doc-tipo')?.value || '';
    const frequencia = document.getElementById('sec-doc-frequencia')?.value || '';
    const solicitante = document.getElementById('sec-doc-solicitante')?.value || '';
    const motivo = document.getElementById('sec-doc-motivo')?.value || '';
    const obs = document.getElementById('sec-doc-obs')?.value || '';
    const cidadeNasc = document.getElementById('sec-doc-cidade-nasc')?.value || '';
    const ufNasc = document.getElementById('sec-doc-uf-nasc')?.value || '';
    const dataNascInput = document.getElementById('sec-doc-data-nasc')?.value || '';
    const vagaEtapa = document.getElementById('sec-doc-vaga-etapa')?.value || '';
    const vagaTurno = document.getElementById('sec-doc-vaga-turno')?.value || '';
    const anoLetivoInput = String(document.getElementById('sec-doc-ano-letivo')?.value || '').trim();
    const turmaAtestado = String(document.getElementById('sec-doc-turma-atestado')?.value || '').trim();
    const nomeAlunoLivre = String(document.getElementById('sec-doc-nome-aluno')?.value || '').trim();
    const nomeMae = String(document.getElementById('sec-doc-nome-mae')?.value || '').trim();
    const nomePai = String(document.getElementById('sec-doc-nome-pai')?.value || '').trim();

    if (!tipo) {
      showSecToast('Selecione o tipo de emissão.', 'alerta');
      return;
    }
    if (tipo !== DOCUMENTO_SECRETARIA_TIPO_VAGA && !isAtestadoConclusao(tipo) && !alunoId) {
      showSecToast('Selecione um aluno.', 'alerta');
      return;
    }
    if (tipo === 'Declaração de Frequência (Bolsa Família)' && !frequencia) {
      showSecToast('Informe a frequência do aluno.', 'alerta');
      return;
    }
    if (tipo === DOCUMENTO_SECRETARIA_TIPO_VAGA && !vagaEtapa) {
      showSecToast('Selecione a etapa/modalidade com vaga.', 'alerta');
      return;
    }
    if (tipo === DOCUMENTO_SECRETARIA_TIPO_VAGA && !vagaTurno) {
      showSecToast('Selecione o turno da vaga.', 'alerta');
      return;
    }
    if (isAtestadoConclusao(tipo)) {
      if (!nomeAlunoLivre) {
        showSecToast('Informe o nome do aluno.', 'alerta');
        return;
      }
      if (!anoLetivoInput) {
        showSecToast('Informe o ano letivo.', 'alerta');
        return;
      }
      if (!cidadeNasc || !ufNasc) {
        showSecToast('Informe a cidade e o estado de nascimento.', 'alerta');
        return;
      }
      if (!dataNascInput) {
        showSecToast('Informe a data de nascimento.', 'alerta');
        return;
      }
      if (!nomeMae) {
        showSecToast('Informe o nome da mãe.', 'alerta');
        return;
      }
      if (!nomePai) {
        showSecToast('Informe o nome do pai.', 'alerta');
        return;
      }
      if (!turmaAtestado) {
        showSecToast('Informe a turma.', 'alerta');
        return;
      }
    }

    const aluno = (tipo === DOCUMENTO_SECRETARIA_TIPO_VAGA || isAtestadoConclusao(tipo))
      ? null
      : findStudentById(alunoId);
    if (tipo !== DOCUMENTO_SECRETARIA_TIPO_VAGA && !isAtestadoConclusao(tipo) && !aluno) {
      showSecToast('Aluno não encontrado.', 'error');
      return;
    }

    const responsavel = localStorage.getItem('siga_profile_name') || 'Secretaria';
    let obsCompleta = obs || '';

    if (tipo && isDeclaracao(tipo) && tipo !== DOCUMENTO_SECRETARIA_TIPO_VAGA) {
      if (cidadeNasc) {
        obsCompleta = '[NASC: ' + cidadeNasc + ' - ' + (ufNasc || '') + '] ' + obsCompleta;
        obsCompleta = obsCompleta.trim();
      }
      if (dataNascInput) {
        obsCompleta = '[DT_NASC: ' + dataNascInput + '] ' + obsCompleta;
        obsCompleta = obsCompleta.trim();
      }
    }
    if (isAtestadoConclusao(tipo)) {
      if (anoLetivoInput) {
        obsCompleta = ('[ANO_LETIVO: ' + anoLetivoInput + '] ' + obsCompleta).trim();
      }
      if (nomeMae) {
        obsCompleta = ('[NOME_MAE: ' + nomeMae + '] ' + obsCompleta).trim();
      }
      if (nomePai) {
        obsCompleta = ('[NOME_PAI: ' + nomePai + '] ' + obsCompleta).trim();
      }
    }
    if (tipo === 'Declaração de Frequência (Bolsa Família)') {
      obsCompleta = ('Frequência de ' + frequencia + '%. ' + obsCompleta).trim();
    }
    if (tipo === DOCUMENTO_SECRETARIA_TIPO_VAGA) {
      obsCompleta = ('[VAGA_ETAPA: ' + vagaEtapa + '] [VAGA_TURNO: ' + vagaTurno + '] ' + obsCompleta).trim();
    }

    const serie = resolveSerie(aluno);
    const protocolo = gerarProtocoloSec(tipo);
    const hoje = new Date().toISOString().split('T')[0];
    const turmaDoc = isAtestadoConclusao(tipo)
      ? turmaAtestado
      : (aluno ? (aluno.turma || '') : '');
    const nomeDoc = isAtestadoConclusao(tipo)
      ? nomeAlunoLivre
      : (aluno ? aluno.nome : '');

    const doc = {
      id: uid(),
      protocolo: protocolo,
      alunoId: (tipo === DOCUMENTO_SECRETARIA_TIPO_VAGA || isAtestadoConclusao(tipo)) ? null : alunoId,
      alunoNome: nomeDoc,
      alunoCpf: aluno ? (aluno.cpf || '') : '',
      alunoTurma: turmaDoc,
      alunoSerie: serie || '',
      alunoTurno: aluno ? (aluno.turno || '') : '',
      tipo: tipo,
      dataEmissao: hoje,
      dataValidade: computeDataValidadeIso(hoje),
      status: isRequerimento(tipo) ? 'pendente' : 'concluido',
      solicitante: solicitante || '',
      motivo: motivo || '',
      obs: obsCompleta || '',
      responsavel: responsavel,
      cidadeNascimento: (isRequerimento(tipo) || tipo === DOCUMENTO_SECRETARIA_TIPO_VAGA) ? '' : (cidadeNasc || ''),
      ufNascimento: (isRequerimento(tipo) || tipo === DOCUMENTO_SECRETARIA_TIPO_VAGA) ? '' : (ufNasc || ''),
      dataNascimento: dataNascInput || (aluno && (aluno.dataNascimento || aluno.nasc)) || '',
      frequencia: tipo === 'Declaração de Frequência (Bolsa Família)' ? frequencia : '',
      vagaEtapa: tipo === DOCUMENTO_SECRETARIA_TIPO_VAGA ? vagaEtapa : '',
      vagaTurno: tipo === DOCUMENTO_SECRETARIA_TIPO_VAGA ? vagaTurno : '',
      anoLetivo: isAtestadoConclusao(tipo) ? anoLetivoInput : '',
      nomeMae: isAtestadoConclusao(tipo) ? nomeMae : '',
      nomePai: isAtestadoConclusao(tipo) ? nomePai : ''
    };

    const list = getSecDocumentos();
    list.unshift(doc);
    saveSecDocumentos(list);
    syncDocumentoSecretariaCloud(doc);

    if (tipo === 'Declaração de Transferência') {
      const reqProtocolo = gerarProtocoloSec('Requerimento de Transferência');
      const reqDoc = {
        id: uid(),
        protocolo: reqProtocolo,
        alunoId: alunoId,
        alunoNome: aluno ? aluno.nome : '',
        alunoCpf: aluno ? (aluno.cpf || '') : '',
        alunoTurma: aluno ? (aluno.turma || '') : '',
        alunoSerie: serie || '',
        alunoTurno: aluno ? (aluno.turno || '') : '',
        tipo: 'Requerimento de Transferência',
        dataEmissao: hoje,
        dataValidade: computeDataValidadeIso(hoje),
        status: 'pendente',
        solicitante: solicitante || 'Secretaria (Auto)',
        motivo: motivo || 'Declaração de transferência emitida',
        obs: 'Gerado automaticamente por emissão de declaração.',
        responsavel: responsavel,
        cidadeNascimento: '',
        ufNascimento: '',
        dataNascimento: '',
        frequencia: '',
        vagaEtapa: '',
        vagaTurno: '',
        anoLetivo: '',
        nomeMae: '',
        nomePai: ''
      };
      list.unshift(reqDoc);
      saveSecDocumentos(list);
      syncDocumentoSecretariaCloud(reqDoc);
      showSecToast('Documento registrado com sucesso!', 'success');
      fecharModalNovoDocSecretaria();
      renderSecPage();
      // Imprime Declaração + Comprovante de Requerimento na mesma janela
      imprimirDocumentosSec([doc.id, reqDoc.id]);
      return;
    }

    if (isAtestadoConclusao(tipo)) {
      const reqProtocolo = gerarProtocoloSec(DOCUMENTO_SECRETARIA_TIPO_REQ_HIST_DIPLOMA);
      const reqDoc = {
        id: uid(),
        protocolo: reqProtocolo,
        alunoId: null,
        alunoNome: nomeDoc,
        alunoCpf: '',
        alunoTurma: turmaDoc,
        alunoSerie: '',
        alunoTurno: '',
        tipo: DOCUMENTO_SECRETARIA_TIPO_REQ_HIST_DIPLOMA,
        dataEmissao: hoje,
        dataValidade: computeDataValidadeIso(hoje),
        status: 'pendente',
        solicitante: solicitante || 'Secretaria (Auto)',
        motivo: motivo || 'Atestado de conclusão emitido — Histórico e Diploma',
        obs: 'Gerado automaticamente por emissão de Atestado de Conclusão.',
        responsavel: responsavel,
        cidadeNascimento: '',
        ufNascimento: '',
        dataNascimento: '',
        frequencia: '',
        vagaEtapa: '',
        vagaTurno: '',
        anoLetivo: anoLetivoInput || '',
        nomeMae: '',
        nomePai: ''
      };
      list.unshift(reqDoc);
      saveSecDocumentos(list);
      syncDocumentoSecretariaCloud(reqDoc);
      showSecToast('Atestado e requerimento registrados com sucesso!', 'success');
      fecharModalNovoDocSecretaria();
      renderSecPage();
      imprimirDocumentosSec([doc.id, reqDoc.id]);
      return;
    }

    showSecToast('Documento registrado com sucesso!', 'success');
    fecharModalNovoDocSecretaria();
    renderSecPage();
    imprimirDocumentoSec(doc.id);
  }

  // ─── Print ─────────────────────────────────────────────────────────────────
  function aguardarImagensDocumentoIframe(iframeDoc, timeoutMs) {
    timeoutMs = timeoutMs || 3000;
    const imagens = Array.from(iframeDoc?.images || []);
    if (!imagens.length) return Promise.resolve();
    return Promise.race([
      Promise.all(imagens.map(function (img) {
        if (img.complete) return Promise.resolve();
        return new Promise(function (resolve) {
          img.addEventListener('load', resolve, { once: true });
          img.addEventListener('error', resolve, { once: true });
        });
      })),
      new Promise(function (resolve) { setTimeout(resolve, timeoutMs); })
    ]);
  }

  function getTimbradoBackgroundUrl() {
    try {
      return new URL('assets/timbrado-a4.jpg', window.location.href).href;
    } catch (e) {
      return 'assets/timbrado-a4.jpg';
    }
  }

  function getPrintDocumentStyles() {
    const bg = getTimbradoBackgroundUrl().replace(/'/g, "\\'");
    return (
      '@media print{' +
      'html,body{margin:0!important;padding:0!important;height:auto}' +
      'body{-webkit-print-color-adjust:exact;print-color-adjust:exact}' +
      '@page{size:A4;margin:0}' +
      '.print-page{page-break-after:always;page-break-inside:avoid}' +
      '.print-page:last-child{page-break-after:auto}' +
      '}' +
      'html,body{margin:0;padding:0;background:#fff}' +
      'body{font-family:Arial,Helvetica,sans-serif;color:#111;line-height:1.35}' +
      '.print-page{' +
      'width:210mm;height:297mm;max-height:297mm;box-sizing:border-box;position:relative;overflow:hidden;' +
      "background-image:url('" + bg + "');" +
      'background-repeat:no-repeat;background-position:center top;background-size:210mm 297mm;' +
      '}' +
      '.print-content{box-sizing:border-box;height:100%;padding:52mm 18mm 36mm 18mm;display:flex;flex-direction:column}' +
      '.protocol-tag{font-family:Consolas,monospace;font-size:9pt;color:#333;text-align:right;margin:0 0 10px}' +
      '.doc-title{font-size:14pt;font-weight:700;text-align:center;text-transform:uppercase;margin:4px 0 18px;letter-spacing:.45px}' +
      '.doc-text{text-indent:1.6cm;margin:0 0 14px;font-size:12pt;text-align:justify;line-height:1.45}' +
      '.doc-date{text-align:right;margin:28px 0 22px;font-size:12pt}' +
      '.signature-area{display:flex;justify-content:space-around;margin-top:36px;margin-bottom:14px}' +
      '.signature-box{text-align:center;width:48%}' +
      '.signature-line{border-top:1px solid #000;margin:48px 0 6px}' +
      '.signature-desc{font-size:10pt;color:#222;line-height:1.3}' +
      '.receipt-card{border:1.2px solid #111;padding:12px 14px;margin:12px 0 8px;background:rgba(255,255,255,.78)}' +
      '.receipt-intro{text-align:justify;margin:0 0 12px;font-size:12pt;line-height:1.45}' +
      '.receipt-heading{font-size:11pt;font-weight:700;text-align:center;margin:0 0 10px;border-bottom:1px solid #000;padding-bottom:5px}' +
      '.receipt-row{display:flex;justify-content:space-between;gap:10px;margin:0 0 5px;font-size:11pt;border-bottom:1px dashed #ddd;padding-bottom:4px}' +
      '.receipt-row:last-child{border-bottom:none;padding-bottom:0}' +
      '.receipt-label{font-weight:700;color:#111;flex-shrink:0}' +
      '.receipt-note{margin-top:10px;font-size:9pt;color:#444;text-align:justify;line-height:1.35}' +
      '.verification-strip{margin-top:auto;padding:7px 9px;border:1px dashed #94a3b8;background:rgba(248,250,252,.9);border-radius:6px;color:#334155;display:flex;align-items:flex-start;justify-content:space-between;gap:10px;font-size:7.5pt;line-height:1.3}' +
      '.verification-link{max-width:190px;font-family:Consolas,monospace;font-size:6.5pt;word-break:break-all}' +
      '.meta-footer{margin-top:8px;font-size:7pt;color:#444;border-top:1px solid #bbb;padding-top:5px;line-height:1.25;display:flex;align-items:flex-end;justify-content:space-between;gap:10px}' +
      '.meta-footer-main{flex:1}' +
      '.meta-footer-qr{width:58px;flex-shrink:0;text-align:center}' +
      '.meta-footer-qr img{width:52px;height:52px;display:block;margin:0 auto 2px;border:1px solid #d1d5db;border-radius:4px;padding:2px;background:#fff}' +
      '.meta-footer-qr span{display:block;font-size:5.8pt;line-height:1.15;color:#555}'
    );
  }

  /** Rótulo da coluna Tipo na listagem (apenas UI desta página). */
  function labelTipoListagem(tipo) {
    if (tipo === 'Requerimento de Transferência') return 'Histórico Escolar';
    if (tipo === DOCUMENTO_SECRETARIA_TIPO_REQ_HIST_DIPLOMA) return 'Histórico e Diploma';
    return tipo || '—';
  }

  function buildDocumentoPrintBody(doc) {
    if (!doc) return null;

    const isDeclaracaoVaga = doc.tipo === DOCUMENTO_SECRETARIA_TIPO_VAGA;
    const aluno = doc.alunoId ? findStudentById(doc.alunoId) : null;
    if (!aluno && !isDeclaracaoVaga && !doc.alunoNome) {
      return null;
    }

    const school = getSecSchoolInfo();
    const escolaNomeDocumento = school.nome;
    const localEmissaoDocumento = school.localEmissao;
    const alunoNome = (aluno && aluno.nome) || doc.alunoNome || '—';
    const alunoCpf = (aluno && aluno.cpf) || doc.alunoCpf || '—';
    const turmaTexto = doc.alunoTurma || (aluno && aluno.turma) || '—';
    const turnoTexto = doc.alunoTurno || (aluno && aluno.turno) || '—';
    const serieTexto = formatarSerieDocumento(
      doc.alunoSerie || (aluno && resolveSerie(aluno)) || ''
    );

    const dataPorExtenso = formatarDataPorExtenso(doc.dataEmissao);
    const dataBr = formatarDataBr(doc.dataEmissao);
    const dataValidade = getDocumentoSecretariaDataValidade(doc);
    const dataValidadeBr = dataValidade ? formatarDataBr(dataValidade) : '—';
    const documentoValido = isDocumentoSecretariaValido(doc);
    const urlValidacao = getValidationUrl(doc.protocolo);
    const qrCodeUrl = getQrUrl(doc.protocolo, 120);

    let cidadeNasc = doc.cidadeNascimento || '';
    let ufNasc = doc.ufNascimento || '';
    if (!cidadeNasc && doc.obs && doc.obs.indexOf('[NASC:') !== -1) {
      const match = doc.obs.match(/\[NASC:\s*([^\-\]]+)\s*\-\s*([^\]]+)\]/);
      if (match) {
        cidadeNasc = match[1].trim();
        ufNasc = match[2].trim();
      }
    }

    let dataNasc = extrairMetaDocumentoSecretaria(doc.obs, 'DT_NASC')
      || doc.dataNascimento
      || (aluno && (aluno.dataNascimento || aluno.nasc))
      || '';

    function formatarDataNasc(dt) {
      if (!dt) return '—';
      if (String(dt).includes('/')) return dt;
      const parts = String(dt).split('-');
      if (parts.length === 3) return parts[2] + '/' + parts[1] + '/' + parts[0];
      return formatarDataBr(dt);
    }

    let cidadeNascText = '';
    if (cidadeNasc) {
      cidadeNascText = ', natural de <b>' + escapeHtml(cidadeNasc) + ' - ' +
        escapeHtml(ufNasc || '') + '</b>';
    }

    const vagaEtapaMeta = doc.vagaEtapa || extrairMetaDocumentoSecretaria(doc.obs, 'VAGA_ETAPA');
    const vagaTurnoMeta = doc.vagaTurno || extrairMetaDocumentoSecretaria(doc.obs, 'VAGA_TURNO');
    const vagaEtapaTexto = vagaEtapaMeta ? formatarSerieDocumento(vagaEtapaMeta) : '—';
    const vagaTurnoTexto = vagaTurnoMeta || '—';

    let contentHtml = '';
    let titleHtml = doc.tipo;
    const nomeEsc = escapeHtml(alunoNome);
    const cpfEsc = escapeHtml(formatarCPF(alunoCpf));
    const escolaEsc = escapeHtml(escolaNomeDocumento);
    const turmaEsc = escapeHtml(turmaTexto);
    const serieEsc = escapeHtml(serieTexto);
    const turnoEsc = escapeHtml(turnoTexto);
    const anoLetivoDoc = doc.anoLetivo
      || extrairMetaDocumentoSecretaria(doc.obs, 'ANO_LETIVO')
      || SEC_ANO_LETIVO;
    const anoLetivo = anoLetivoDoc;
    const nomeMaeDoc = doc.nomeMae || extrairMetaDocumentoSecretaria(doc.obs, 'NOME_MAE') || '';
    const nomePaiDoc = doc.nomePai || extrairMetaDocumentoSecretaria(doc.obs, 'NOME_PAI') || '';
    let assinaturaTitulo = 'Assinatura Autorizada';
    let assinaturaSub = escolaEsc + '<br>Secretaria / Direção Escolar';

    if (doc.tipo === 'Declaração de Matrícula') {
      contentHtml =
        '<p class="doc-text">' +
        'Declaramos, para os devidos fins, que o(a) estudante <b>' + nomeEsc + '</b>, ' +
        'inscrito(a) sob o CPF <b>' + cpfEsc + '</b>, nascido(a) em <b>' +
        escapeHtml(formatarDataNasc(dataNasc)) + '</b>' + cidadeNascText + ', ' +
        'está regularmente matriculado(a) e frequentando as aulas na <b>' + escolaEsc +
        '</b> no ano letivo de <b>' + escapeHtml(anoLetivo) + '</b>, ' +
        'cursando a turma <b>' + turmaEsc + '</b>, correspondente ao <b>' + serieEsc +
        '</b>, no turno <b>' + turnoEsc + '</b>.' +
        '</p>' +
        '<p class="doc-text">Referida informação é expressão da verdade.</p>';
    } else if (doc.tipo === 'Declaração de Frequência (Bolsa Família)') {
      let freqValue = doc.frequencia || '100';
      if (doc.obs && doc.obs.indexOf('Frequência de') !== -1) {
        const match = doc.obs.match(/Frequência de (\d+)%/);
        if (match) freqValue = match[1];
      }
      contentHtml =
        '<p class="doc-text">' +
        'Declaramos, para os devidos fins de comprovação de condicionalidade do Programa Bolsa Família, ' +
        'que o(a) estudante <b>' + nomeEsc + '</b>, inscrito(a) sob o CPF <b>' + cpfEsc + '</b>, ' +
        'nascido(a) em <b>' + escapeHtml(formatarDataNasc(dataNasc)) + '</b>' + cidadeNascText +
        ', está regularmente matriculado(a) e frequentando as aulas na <b>' + escolaEsc +
        '</b> no ano letivo de <b>' + escapeHtml(anoLetivo) + '</b>, na turma <b>' + turmaEsc +
        '</b>, correspondente ao <b>' + serieEsc + '</b>, no turno <b>' + turnoEsc + '</b>.' +
        '</p>' +
        '<p class="doc-text">' +
        'Apurou-se, para o período avaliativo correspondente, uma frequência escolar global e relativa de <b>' +
        escapeHtml(String(freqValue)) + '%</b>.' +
        '</p>';
    } else if (doc.tipo === 'Declaração de Escolaridade') {
      contentHtml =
        '<p class="doc-text">' +
        'Declaramos, para os devidos fins de direito, que o(a) estudante <b>' + nomeEsc + '</b>, ' +
        'inscrito(a) sob o CPF <b>' + cpfEsc + '</b>, nascido(a) em <b>' +
        escapeHtml(formatarDataNasc(dataNasc)) + '</b>' + cidadeNascText + ', ' +
        'frequentou regularmente as aulas correspondentes ao Ensino na <b>' + escolaEsc +
        '</b>, na turma <b>' + turmaEsc + '</b>, correspondente ao <b>' + serieEsc +
        '</b>, no turno <b>' + turnoEsc + '</b>, sob regime letivo ordinário.' +
        '</p>' +
        '<p class="doc-text">' +
        'O referido estudante possui histórico de rendimento escolar e frequência arquivados em pasta individual sob responsabilidade da secretaria da <b>' +
        escolaEsc + '</b>.' +
        '</p>';
    } else if (doc.tipo === DOCUMENTO_SECRETARIA_TIPO_VAGA) {
      contentHtml =
        '<p class="doc-text">' +
        'Declaramos, para os devidos fins, que a <b>' + escolaEsc +
        '</b> dispõe de vaga para matrícula na etapa/modalidade <b>' +
        escapeHtml(vagaEtapaTexto) + '</b>, no turno <b>' + escapeHtml(vagaTurnoTexto) +
        '</b>, para o ano letivo de <b>' + escapeHtml(anoLetivo) + '</b>.' +
        '</p>' +
        '<p class="doc-text">' +
        'A presente declaração confirma a disponibilidade de vaga nesta escola na etapa/modalidade e turno acima informados, ' +
        'servindo para instrução de matrícula, transferência ou demais fins legais cabíveis.' +
        '</p>';
    } else if (doc.tipo === 'Declaração de Transferência') {
      contentHtml =
        '<p class="doc-text">' +
        'Declaramos, para os devidos fins, que foi solicitada nesta data a transferência escolar do(a) estudante <b>' +
        nomeEsc + '</b>, inscrito(a) sob o CPF <b>' + cpfEsc + '</b>, nascido(a) em <b>' +
        escapeHtml(formatarDataNasc(dataNasc)) + '</b>' + cidadeNascText +
        ', que se encontrava devidamente matriculado(a) na <b>' + escolaEsc +
        '</b>, na turma <b>' + turmaEsc + '</b>, correspondente ao <b>' + serieEsc +
        '</b>, no turno <b>' + turnoEsc + '</b>.' +
        '</p>' +
        '<p class="doc-text">' +
        'Esta declaração atesta que a vaga de origem está liberada e o processo de transferência ativo. O presente documento ' +
        'tem validade improrrogável de <b>30 (trinta) dias</b> a partir de sua emissão, prazo este necessário para a confecção e ' +
        'entrega do Histórico Escolar definitivo.' +
        '</p>';
    } else if (isAtestadoConclusao(doc.tipo)) {
      const cidadeUf = (cidadeNasc || '—') + ' - ' + (ufNasc || '—');
      contentHtml =
        '<p class="doc-text">' +
        'Atestamos para os devidos fins e efeitos que, <b>' + nomeEsc + '</b>, filho(a) de <b>' +
        escapeHtml(nomeMaeDoc || '—') + '</b> e <b>' + escapeHtml(nomePaiDoc || '—') + '</b>, <b>' +
        escapeHtml(cidadeUf) + '</b>, nascido(a) em <b>' + escapeHtml(formatarDataNasc(dataNasc)) +
        '</b>, concluiu o Ensino Médio neste Estabelecimento de Ensino no ano letivo de <b>' +
        escapeHtml(anoLetivo) + '</b>.' +
        '</p>' +
        '<p class="doc-text"><b>OBS:</b> O CERTIFICADO E HISTÓRICO ENCONTRA-SE EM PERÍODO DE TRAMITAÇÃO E SERÁ EMITIDO NO PRAZO DE 30 DIAS.</p>' +
        '<p class="doc-text">Por ser esta a expressão da verdade, assinamos a presente declaração.</p>';
      assinaturaTitulo = 'Assinatura do Diretor';
      assinaturaSub = escolaEsc + '<br>Direção Escolar';
    } else if (isRequerimento(doc.tipo)) {
      titleHtml = 'Comprovante de Requerimento';
      const servicoSolicitado = doc.tipo === DOCUMENTO_SECRETARIA_TIPO_REQ_HIST_DIPLOMA
        ? 'Histórico e Diploma'
        : doc.tipo;
      contentHtml =
        '<p class="receipt-intro">' +
        'A secretaria escolar da <b>' + escolaEsc +
        '</b> atesta e emite o presente comprovante de solicitação para fins de controle e protocolo do pedido. ' +
        'O documento requerido encontra-se em fase de processamento, devendo ser observados os prazos regimentais desta instituição.' +
        '</p>' +
        '<div class="receipt-card">' +
        '<div class="receipt-heading">DETALHES DO REQUERIMENTO</div>' +
        '<div class="receipt-row"><span class="receipt-label">Protocolo de Abertura:</span>' +
        '<span style="font-family:monospace;font-weight:700;color:#1d4ed8">' +
        escapeHtml(doc.protocolo) + '</span></div>' +
        '<div class="receipt-row"><span class="receipt-label">Unidade Emissora:</span><span>' +
        escolaEsc + '</span></div>' +
        '<div class="receipt-row"><span class="receipt-label">Estudante:</span><span>' +
        nomeEsc + '</span></div>' +
        '<div class="receipt-row"><span class="receipt-label">CPF:</span><span>' +
        cpfEsc + '</span></div>' +
        '<div class="receipt-row"><span class="receipt-label">Turma / Ano / Turno:</span><span>' +
        turmaEsc + ' (' + serieEsc + ' • ' + turnoEsc + ')</span></div>' +
        '<div class="receipt-row"><span class="receipt-label">Serviço/Documento Solicitado:</span>' +
        '<span style="font-weight:700">' + escapeHtml(servicoSolicitado) + '</span></div>' +
        '<div class="receipt-row"><span class="receipt-label">Solicitante:</span><span>' +
        escapeHtml(doc.solicitante || 'O próprio aluno') + '</span></div>' +
        '<div class="receipt-row"><span class="receipt-label">Motivo do Pedido:</span><span>' +
        escapeHtml(doc.motivo || 'Sem justificativa informada') + '</span></div>' +
        '<div class="receipt-row"><span class="receipt-label">Data do Requerimento:</span><span>' +
        escapeHtml(dataBr) + '</span></div>' +
        '<div class="receipt-row">' +
        '<span class="receipt-label">Responsável pelo Cadastro:</span><span>' +
        escapeHtml(doc.responsavel || 'Secretaria') + '</span></div>' +
        '</div>' +
        '<p class="receipt-note">' +
        '* IMPORTANTE: O prazo médio de expedição para 2ª vias de diploma e histórico escolar é de até 15 (quinze) dias úteis. ' +
        'Para emissão do histórico escolar, o prazo é de até 30 (trinta) dias úteis. Guarde este documento comprobatório.' +
        '</p>';
    } else {
      contentHtml = '<p class="doc-text">Documento emitido pela secretaria escolar.</p>';
    }

    const isReq = isRequerimento(doc.tipo);
    const now = new Date();
    const localEmissao = localEmissaoDocumento || 'Ourilândia do Norte - PA';
    return (
      '<div class="print-page">' +
      '<div class="print-content">' +
      '<div class="protocol-tag">Protocolo: <b>' + escapeHtml(doc.protocolo) + '</b></div>' +
      '<div class="doc-title">' + escapeHtml(titleHtml) + '</div>' +
      contentHtml +
      (!isReq
        ? '<div class="doc-date">' + escapeHtml(localEmissao) + ', ' +
          escapeHtml(dataPorExtenso) + '.</div>' +
          '<div class="signature-area"><div class="signature-box" style="width:52%">' +
          '<div class="signature-line"></div>' +
          '<span class="signature-desc"><b>' + assinaturaTitulo + '</b><br>' + assinaturaSub +
          '</span></div></div>'
        : '<div class="signature-area">' +
          '<div class="signature-box"><div class="signature-line"></div>' +
          '<span class="signature-desc"><b>' + escapeHtml(doc.responsavel || 'Secretaria') +
          '</b><br>Responsável pelo Cadastro</span></div>' +
          '<div class="signature-box"><div class="signature-line"></div>' +
          '<span class="signature-desc"><b>' +
          escapeHtml(doc.solicitante || 'Assinatura do Solicitante') +
          '</b><br>Assinatura do Solicitante</span></div></div>') +
      (!isReq
        ? '<div class="verification-strip"><div>' +
          '<strong>Autenticidade digital:</strong> utilize o QR Code ou informe o protocolo <b>' +
          escapeHtml(doc.protocolo) + '</b> no portal de conferência. ' +
          'Validade de <b>' + DOCUMENTO_SECRETARIA_VALIDADE_DIAS +
          ' dias</b>. Situação: <b>' +
          (documentoValido ? 'Válido' : 'Fora da Validade') + '</b>' +
          (dataValidade ? '. Válido até <b>' + escapeHtml(dataValidadeBr) + '</b>' : '') + '.' +
          '</div><div class="verification-link">' + escapeHtml(urlValidacao) + '</div></div>'
        : '') +
      '<div class="meta-footer"><div class="meta-footer-main">' +
      escolaEsc + ' — Responsável: <b>' + escapeHtml(doc.responsavel || 'Secretaria') + '</b><br>' +
      'Emitido em ' + now.toLocaleDateString('pt-BR') + ' às ' +
      now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) +
      ' | Protocolo: ' + escapeHtml(doc.protocolo) +
      (dataValidade
        ? ' | Validade: ' + escapeHtml(dataValidadeBr) + ' (' +
          (documentoValido ? 'Válido' : 'Fora da Validade') + ')'
        : '') +
      '</div>' +
      (!isReq
        ? '<div class="meta-footer-qr"><img src="' + escapeHtml(qrCodeUrl) +
          '" alt="QR Code de validação"><span>Validar</span></div>'
        : '') +
      '</div>' +
      '</div></div>'
    );
  }

  function preloadTimbradoImage() {
    return new Promise(function (resolve) {
      const img = new Image();
      const done = function () { resolve(); };
      img.onload = done;
      img.onerror = done;
      img.src = getTimbradoBackgroundUrl();
      setTimeout(done, 2500);
    });
  }

  function openPrintIframe(htmlPrint) {
    preloadTimbradoImage().then(function () {
      const iframe = document.createElement('iframe');
      iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:none';
      document.body.appendChild(iframe);
      const iframeDoc = iframe.contentWindow.document || iframe.contentDocument;
      iframeDoc.open();
      iframeDoc.write(htmlPrint);
      iframeDoc.close();

      aguardarImagensDocumentoIframe(iframeDoc).then(function () {
        iframe.contentWindow.focus();
        setTimeout(function () {
          iframe.contentWindow.print();
          setTimeout(function () { iframe.remove(); }, 2500);
        }, 250);
      });
    });
  }

  function imprimirDocumentoSec(id) {
    const docs = getSecDocumentos();
    const doc = docs.find(function (d) { return d.id === id; });
    if (!doc) {
      showSecToast('Documento não encontrado.', 'error');
      return;
    }
    const body = buildDocumentoPrintBody(doc);
    if (!body) {
      showSecToast('Dados do aluno não encontrados.', 'error');
      return;
    }
    const htmlPrint =
      '<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8">' +
      '<title>' + escapeHtml(doc.tipo) + ' - ' + escapeHtml(doc.protocolo) + '</title>' +
      '<style>' + getPrintDocumentStyles() + '</style></head><body>' + body + '</body></html>';
    openPrintIframe(htmlPrint);
  }

  /** Imprime vários documentos na mesma janela (quebra de página entre eles). */
  function imprimirDocumentosSec(ids) {
    const docs = getSecDocumentos();
    const bodies = [];
    const titles = [];
    (ids || []).forEach(function (id) {
      const doc = docs.find(function (d) { return d.id === id; });
      if (!doc) return;
      const body = buildDocumentoPrintBody(doc);
      if (!body) return;
      bodies.push(body);
      titles.push(doc.tipo + ' ' + doc.protocolo);
    });
    if (!bodies.length) {
      showSecToast('Nenhum documento disponível para impressão.', 'error');
      return;
    }
    const htmlPrint =
      '<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8">' +
      '<title>' + escapeHtml(titles.join(' + ')) + '</title>' +
      '<style>' + getPrintDocumentStyles() + '</style></head><body>' +
      bodies.join('') +
      '</body></html>';
    openPrintIframe(htmlPrint);
  }

  // ─── Tabs / filter / render ────────────────────────────────────────────────
  function switchSecTab(tab) {
    SEC_ACTIVE_TAB = tab === 'requerimentos' ? 'requerimentos' : 'historico';

    const tabHist = document.getElementById('sec-tab-historico');
    const tabReq = document.getElementById('sec-tab-requerimentos');
    const panelHist = document.getElementById('sec-panel-historico');
    const panelReq = document.getElementById('sec-panel-requerimentos');

    if (tabHist) {
      tabHist.classList.toggle('active', SEC_ACTIVE_TAB === 'historico');
      tabHist.setAttribute('aria-selected', SEC_ACTIVE_TAB === 'historico' ? 'true' : 'false');
    }
    if (tabReq) {
      tabReq.classList.toggle('active', SEC_ACTIVE_TAB === 'requerimentos');
      tabReq.setAttribute('aria-selected', SEC_ACTIVE_TAB === 'requerimentos' ? 'true' : 'false');
    }
    if (panelHist) {
      if (SEC_ACTIVE_TAB === 'historico') {
        panelHist.classList.remove('hidden');
        panelHist.style.display = '';
      } else {
        panelHist.classList.add('hidden');
        panelHist.style.display = 'none';
      }
    }
    if (panelReq) {
      if (SEC_ACTIVE_TAB === 'requerimentos') {
        panelReq.classList.remove('hidden');
        panelReq.style.display = '';
      } else {
        panelReq.classList.add('hidden');
        panelReq.style.display = 'none';
      }
    }

    renderSecPage();
  }

  function matchesFilters(doc) {
    const searchEl = document.getElementById('sec-search');
    const tipoEl = document.getElementById('sec-filter-tipo');
    const search = (searchEl ? searchEl.value : SEC_FILTER_CACHE.search || '').trim().toLowerCase();
    const tipo = tipoEl ? tipoEl.value : (SEC_FILTER_CACHE.tipo || '');

    if (tipo && doc.tipo !== tipo) return false;
    if (search) {
      const hay = [
        doc.protocolo, doc.alunoNome, doc.tipo, doc.solicitante, doc.responsavel, doc.alunoTurma
      ].join(' ').toLowerCase();
      if (hay.indexOf(search) === -1) return false;
    }
    return true;
  }

  function filtrarSecDocumentos() {
    const searchEl = document.getElementById('sec-search');
    const tipoEl = document.getElementById('sec-filter-tipo');
    SEC_FILTER_CACHE.search = searchEl ? searchEl.value : '';
    SEC_FILTER_CACHE.tipo = tipoEl ? tipoEl.value : '';
    renderSecPage();
  }

  function alterarStatusRequerimento(id, status) {
    const list = getSecDocumentos();
    const idx = list.findIndex(function (d) { return d.id === id; });
    if (idx < 0) {
      showSecToast('Requerimento não encontrado.', 'error');
      return;
    }
    list[idx].status = status;
    saveSecDocumentos(list);
    showSecToast('Status do requerimento atualizado!', 'success');
    renderSecPage();
  }

  function updateKpis(allDocs) {
    const declaracoes = allDocs.filter(function (d) { return isDeclaracao(d.tipo); });
    const requerimentos = allDocs.filter(function (d) { return isRequerimento(d.tipo); });
    const concluidos = declaracoes.filter(function (d) { return d.status === 'concluido'; }).length;
    const pendentes = requerimentos.filter(function (d) {
      return d.status === 'pendente' || d.status === 'em_processamento' || d.status === 'pronto_para_entrega';
    }).length;
    const validos = declaracoes.filter(function (d) {
      return d.status === 'concluido' && isDocumentoSecretariaValido(d);
    }).length;

    const elTotal = document.getElementById('kpi-sec-total');
    const elConc = document.getElementById('kpi-sec-concluidos');
    const elPend = document.getElementById('kpi-sec-pendentes');
    const elVal = document.getElementById('kpi-sec-validos');
    if (elTotal) elTotal.textContent = String(allDocs.length);
    if (elConc) elConc.textContent = String(concluidos);
    if (elPend) elPend.textContent = String(pendentes);
    if (elVal) elVal.textContent = String(validos);
  }

  function renderSecPage() {
    const allDocs = getSecDocumentos();
    updateKpis(allDocs);

    const historico = allDocs.filter(function (d) {
      return isDeclaracao(d.tipo) && d.status === 'concluido' && matchesFilters(d);
    });
    const requerimentos = allDocs.filter(function (d) {
      return isRequerimento(d.tipo) && matchesFilters(d);
    });

    const tbodyHist = document.getElementById('sec-tbody-historico');
    if (tbodyHist) {
      if (!historico.length) {
        tbodyHist.innerHTML =
          '<tr><td colspan="7" class="px-4 py-8 text-center text-text-secondary">' +
          'Nenhuma declaração emitida.</td></tr>';
      } else {
        tbodyHist.innerHTML = historico.map(function (doc) {
          const isVaga = doc.tipo === DOCUMENTO_SECRETARIA_TIPO_VAGA;
          const valido = isDocumentoSecretariaValido(doc);
          const validade = getDocumentoSecretariaDataValidade(doc);
          return (
            '<tr class="border-b border-border-subtle hover:bg-surface-container-low/40">' +
            '<td class="px-4 py-3 font-mono text-sm text-primary font-semibold">' +
            escapeHtml(doc.protocolo) + '</td>' +
            '<td class="px-4 py-3">' +
            (isVaga
              ? '<span class="text-text-secondary">Não se aplica</span>'
              : escapeHtml(doc.alunoNome || '—')) +
            '</td>' +
            '<td class="px-4 py-3">' +
            (isVaga ? '—' : escapeHtml(doc.alunoTurma || '—')) + '</td>' +
            '<td class="px-4 py-3"><span class="text-sm font-medium">' +
            escapeHtml(doc.tipo) + '</span></td>' +
            '<td class="px-4 py-3">' + escapeHtml(formatarDataBr(doc.dataEmissao)) + '</td>' +
            '<td class="px-4 py-3"><span class="px-2 py-1 rounded-full text-[10px] font-bold uppercase ' +
            (valido ? 'bg-primary/10 text-primary' : 'bg-error-container/20 text-error') + '">' +
            (valido ? 'Válido' : 'Fora da Validade') +
            (validade ? ' até ' + formatarDataBr(validade) : '') +
            '</span></td>' +
            '<td class="px-4 py-3 text-right whitespace-nowrap">' +
            '<button type="button" class="p-2 text-text-secondary hover:text-primary rounded-lg" ' +
            'onclick="imprimirDocumentoSec(\'' + doc.id + '\')" title="Imprimir">' +
            '<span class="material-symbols-outlined text-xl">print</span></button>' +
            '</td></tr>'
          );
        }).join('');
      }
    }

    const tbodyReq = document.getElementById('sec-tbody-requerimentos');
    if (tbodyReq) {
      if (!requerimentos.length) {
        tbodyReq.innerHTML =
          '<tr><td colspan="8" class="px-4 py-8 text-center text-text-secondary">' +
          'Nenhum requerimento encontrado.</td></tr>';
      } else {
        tbodyReq.innerHTML = requerimentos.map(function (doc) {
          return (
            '<tr class="border-b border-border-subtle hover:bg-surface-container-low/40">' +
            '<td class="px-4 py-3 font-mono text-sm text-primary font-semibold">' +
            escapeHtml(doc.protocolo) + '</td>' +
            '<td class="px-4 py-3">' + escapeHtml(doc.alunoNome || '—') + '</td>' +
            '<td class="px-4 py-3">' + escapeHtml(doc.alunoTurma || '—') + '</td>' +
            '<td class="px-4 py-3"><span class="text-sm font-medium">' +
            escapeHtml(labelTipoListagem(doc.tipo)) + '</span></td>' +
            '<td class="px-4 py-3">' + escapeHtml(doc.solicitante || '—') + '</td>' +
            '<td class="px-4 py-3">' + escapeHtml(formatarDataBr(doc.dataEmissao)) + '</td>' +
            '<td class="px-4 py-3">' +
            '<span class="px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ' +
            statusBadgeClass(doc.status) + '">' + escapeHtml(statusLabel(doc.status)) +
            '</span></td>' +
            '<td class="px-4 py-3 text-right whitespace-nowrap">' +
            '<select class="border border-border-subtle rounded-lg text-xs px-2 py-1 mr-1 max-w-[150px]" ' +
            'onchange="alterarStatusRequerimento(\'' + doc.id + '\', this.value)">' +
            '<option value="pendente"' + (doc.status === 'pendente' ? ' selected' : '') + '>Pendente</option>' +
            '<option value="em_processamento"' + (doc.status === 'em_processamento' ? ' selected' : '') + '>Em Processamento</option>' +
            '<option value="pronto_para_entrega"' + (doc.status === 'pronto_para_entrega' ? ' selected' : '') + '>Pronto para Entrega</option>' +
            '<option value="entregue"' + (doc.status === 'entregue' ? ' selected' : '') + '>Entregue</option>' +
            '<option value="cancelado"' + (doc.status === 'cancelado' ? ' selected' : '') + '>Cancelado</option>' +
            '</select>' +
            '<button type="button" class="p-2 text-text-secondary hover:text-primary rounded-lg" ' +
            'onclick="imprimirDocumentoSec(\'' + doc.id + '\')" title="Imprimir comprovante">' +
            '<span class="material-symbols-outlined text-xl">print</span></button>' +
            '</td></tr>'
          );
        }).join('');
      }
    }
  }

  // ─── Public validation lookup ──────────────────────────────────────────────
  function consultarDocumentoPorProtocolo(protocolo) {
    const proto = String(protocolo || '').trim();
    if (!proto) return null;
    const docs = getSecDocumentos();
    const doc = docs.find(function (d) {
      return String(d.protocolo || '').toUpperCase() === proto.toUpperCase();
    });
    if (!doc) return null;

    const validade = getDocumentoSecretariaDataValidade(doc);
    const valido = isDocumentoSecretariaValido(doc);
    return {
      encontrado: true,
      documento: doc,
      valido: valido,
      statusLabel: valido ? 'Válido' : 'Fora da Validade',
      dataValidade: validade ? isoDateOnly(validade) : null,
      dataValidadeBr: validade ? formatarDataBr(validade) : null,
      escola: getSecSchoolInfo(),
      obsLimpa: limparMetaDocumentoSecretaria(doc.obs)
    };
  }

  /** Consulta pública: Supabase (QR no celular) com fallback local */
  function consultarDocumentoPorProtocoloAsync(protocolo) {
    const proto = String(protocolo || '').trim();
    if (!proto) return Promise.resolve(null);

    const local = consultarDocumentoPorProtocolo(proto);
    const sb = getSupabaseClient();
    if (!sb || typeof sb.rpc !== 'function') {
      return Promise.resolve(local);
    }

    return sb.rpc('validate_secretary_document', { p_protocolo: proto })
      .then(function (res) {
        if (res.error || !res.data) return local;
        const data = res.data;
        if (!data.encontrado) return local || { encontrado: false };
        const dataEmissao = data.dataEmissao;
        const dataValidade = data.dataValidade;
        return {
          encontrado: true,
          valido: !!data.valido,
          statusLabel: data.status_label || (data.valido ? 'Válido' : 'Fora da Validade'),
          dataValidade: dataValidade || null,
          dataValidadeBr: dataValidade ? formatarDataBr(dataValidade) : null,
          escola: { nome: data.escola || '' },
          documento: {
            protocolo: data.protocolo,
            tipo: data.tipo,
            alunoNome: data.alunoNome,
            alunoTurma: data.alunoTurma,
            dataEmissao: dataEmissao,
            dataValidade: dataValidade,
            responsavel: data.responsavel,
            solicitante: data.solicitante,
            motivo: data.motivo,
            status: data.valido ? 'concluido' : 'expirado'
          },
          obsLimpa: ''
        };
      })
      .catch(function () {
        return local;
      });
  }

  // ─── Init ──────────────────────────────────────────────────────────────────
  function initDocumentosSecretariaPage() {
    getSecStudents();
    getSecClasses();
    populateAlunoSelect();

    const tipoSelect = document.getElementById('sec-doc-tipo');
    if (tipoSelect) {
      tipoSelect.addEventListener('change', mostrarCamposDinamicosSec);
    }

    const alunoSelect = document.getElementById('sec-doc-aluno-id');
    if (alunoSelect) {
      alunoSelect.addEventListener('change', atualizarDataNascAoSelecionarAluno);
    }

    const searchEl = document.getElementById('sec-search');
    if (searchEl) {
      searchEl.addEventListener('input', filtrarSecDocumentos);
    }
    const filterTipo = document.getElementById('sec-filter-tipo');
    if (filterTipo) {
      filterTipo.addEventListener('change', filtrarSecDocumentos);
    }

    const tabHist = document.getElementById('sec-tab-historico');
    if (tabHist) {
      tabHist.addEventListener('click', function (e) {
        e.preventDefault();
        switchSecTab('historico');
      });
    }
    const tabReq = document.getElementById('sec-tab-requerimentos');
    if (tabReq) {
      tabReq.addEventListener('click', function (e) {
        e.preventDefault();
        switchSecTab('requerimentos');
      });
    }

    switchSecTab(SEC_ACTIVE_TAB);
    mostrarCamposDinamicosSec();
    renderSecPage();
  }

  // ─── Expose on window ──────────────────────────────────────────────────────
  /**
   * Emite Declaração de Matrícula idêntica à da secretaria e abre a impressão.
   * Usado na Ficha do Aluno.
   */
  function emitirDeclaracaoMatriculaAluno(alunoId) {
    const aluno = findStudentById(alunoId);
    if (!aluno) {
      showSecToast('Aluno não encontrado.', 'error');
      return null;
    }

    const classes = getSecClasses();
    const cls = classes.find(function (c) { return c.code === aluno.turma; }) || null;
    const serie = resolveSerie(aluno);
    const turno = (cls && cls.turno) || aluno.turno || '';
    const responsavel = localStorage.getItem('siga_profile_name') || 'Secretaria';
    const tipo = 'Declaração de Matrícula';
    const protocolo = gerarProtocoloSec(tipo);
    const hoje = new Date().toISOString().split('T')[0];
    const dataNasc = aluno.dataNascimento || aluno.nasc || '';

    const doc = {
      id: uid(),
      protocolo: protocolo,
      alunoId: String(aluno.id),
      alunoNome: aluno.nome || '',
      alunoCpf: aluno.cpf || '',
      alunoTurma: aluno.turma || '',
      alunoSerie: serie || '',
      alunoTurno: turno || '',
      tipo: tipo,
      dataEmissao: hoje,
      dataValidade: computeDataValidadeIso(hoje),
      status: 'concluido',
      solicitante: '',
      motivo: 'Emissão pela Ficha do Aluno',
      obs: '',
      responsavel: responsavel,
      cidadeNascimento: aluno.cidadeNascimento || '',
      ufNascimento: aluno.ufNascimento || '',
      dataNascimento: dataNasc,
      frequencia: '',
      vagaEtapa: '',
      vagaTurno: ''
    };

    const list = getSecDocumentos();
    list.unshift(doc);
    saveSecDocumentos(list);
    syncDocumentoSecretariaCloud(doc);

    showSecToast('Declaração de Matrícula gerada.', 'success');
    imprimirDocumentoSec(doc.id);
    return doc;
  }

  window.DOCUMENTO_SECRETARIA_VALIDADE_DIAS = DOCUMENTO_SECRETARIA_VALIDADE_DIAS;
  window.DOCUMENTO_SECRETARIA_TIPO_VAGA = DOCUMENTO_SECRETARIA_TIPO_VAGA;
  window.SEC_STORAGE_KEY = SEC_STORAGE_KEY;
  window.SEC_ANO_LETIVO = SEC_ANO_LETIVO;

  window.getSecDocumentos = getSecDocumentos;
  window.saveSecDocumentos = saveSecDocumentos;
  window.gerarProtocoloSec = gerarProtocoloSec;
  window.isRequerimento = isRequerimento;
  window.isDeclaracao = isDeclaracao;
  window.extrairMetaDocumentoSecretaria = extrairMetaDocumentoSecretaria;
  window.limparMetaDocumentoSecretaria = limparMetaDocumentoSecretaria;
  window.getDocumentoSecretariaDataValidade = getDocumentoSecretariaDataValidade;
  window.isDocumentoSecretariaValido = isDocumentoSecretariaValido;
  window.getTimbradoBackgroundUrl = getTimbradoBackgroundUrl;
  window.getPrintDocumentStyles = getPrintDocumentStyles;
  window.formatarDataPorExtenso = formatarDataPorExtenso;
  window.formatarDataBr = formatarDataBr;
  window.getSecSchoolInfo = getSecSchoolInfo;
  window.getSecStudents = getSecStudents;
  window.getSecClasses = getSecClasses;
  window.mostrarCamposDinamicosSec = mostrarCamposDinamicosSec;
  window.abrirModalNovoDocSecretaria = abrirModalNovoDocSecretaria;
  window.fecharModalNovoDocSecretaria = fecharModalNovoDocSecretaria;
  window.salvarDocumentoSecretaria = salvarDocumentoSecretaria;
  window.imprimirDocumentoSec = imprimirDocumentoSec;
  window.imprimirDocumentosSec = imprimirDocumentosSec;
  window.labelTipoListagem = labelTipoListagem;
  window.renderSecPage = renderSecPage;
  window.switchSecTab = switchSecTab;
  window.alterarStatusRequerimento = alterarStatusRequerimento;
  window.filtrarSecDocumentos = filtrarSecDocumentos;
  window.initDocumentosSecretariaPage = initDocumentosSecretariaPage;
  window.consultarDocumentoPorProtocolo = consultarDocumentoPorProtocolo;
  window.consultarDocumentoPorProtocoloAsync = consultarDocumentoPorProtocoloAsync;
  window.statusValidadeLabel = statusValidadeLabel;
  window.getValidationUrl = getValidationUrl;
  window.syncDocumentoSecretariaCloud = syncDocumentoSecretariaCloud;
  window.formatarCPF = window.formatarCPF || formatarCPF;
  window.formatarDataBr = formatarDataBr;
  window.formatarDataPorExtenso = formatarDataPorExtenso;
  window.formatarSerieDocumento = formatarSerieDocumento;
  window.showSecToast = showSecToast;
  window.atualizarDataNascAoSelecionarAluno = atualizarDataNascAoSelecionarAluno;
  window.emitirDeclaracaoMatriculaAluno = emitirDeclaracaoMatriculaAluno;

  document.addEventListener('DOMContentLoaded', function () {
    const path = (window.location.pathname || '').toLowerCase();
    if (path.indexOf('documentossecretaria.html') !== -1) {
      initDocumentosSecretariaPage();
    }
  });
})();
