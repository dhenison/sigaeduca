/**
 * SIGA Educa — Solicitações Pedagógicas
 * Metadados em localStorage; anexos em IndexedDB
 */
(function () {
  'use strict';

  var STORAGE_KEY = 'siga_solicitacoes_pedagogicas';
  var DB_NAME = 'siga_solicitacoes_ped_db';
  var STORE = 'anexos';
  var MAX_FILE_BYTES = 20 * 1024 * 1024;

  var TIPOS = [
    'Impressão de Atividade',
    'Impressão de Teste',
    'Agendar Chromebooks',
    'Agendar Auditório'
  ];

  var editingId = null;
  var pendingFile = null;
  var uploadBusy = false;

  function getDriveApi() {
    return window.SigaGoogleDrive || null;
  }

  function updateDriveStatusUi() {
    var drive = getDriveApi();
    var ready = !!(drive && drive.isConfigured && drive.isConfigured());
    var btn = document.getElementById('sp-drive-btn');
    var label = document.getElementById('sp-drive-btn-label');
    var btnMob = document.getElementById('sp-drive-btn-mobile');
    var hint = document.getElementById('sp-drive-hint');
    var icon = btn ? btn.querySelector('.material-symbols-outlined') : null;

    if (btn) btn.classList.add('hidden');
    if (btnMob) btnMob.classList.add('hidden');

    if (!ready) {
      if (hint) {
        hint.textContent = 'Drive institucional: faça login no SIGA. Configure OAuth da conta dona de SIGAEDUCA (secrets no Supabase).';
      }
      return;
    }
    if (label) label.textContent = 'Drive da escola';
    if (icon) icon.textContent = 'cloud_done';
    if (hint) {
      hint.textContent =
        'Drive: SIGAEDUCA → SOLICITAÇÕES PEDAGÓGICAS → [Seu nome] → [Tipo da solicitação] → arquivo. Pastas criadas uma vez e reutilizadas.';
    }
  }

  function conectarGoogleDrive() {
    showToast('O Drive é institucional (pasta da escola). Não é necessário conectar uma conta pessoal.', 'success');
    updateDriveStatusUi();
  }

  function requireDriveConnected() {
    var drive = getDriveApi();
    if (!drive || !drive.isConfigured()) {
      return Promise.reject(new Error(
        'Supabase/Drive não configurado. Faça login no SIGA e cadastre os secrets OAuth (docs/GOOGLE_DRIVE_INSTITUCIONAL.md).'
      ));
    }
    return Promise.resolve(drive);
  }

  function getSolicitanteNome(preferred) {
    var fromPreferred = String(preferred || '').trim();
    if (fromPreferred && !/^usu[aá]rio$/i.test(fromPreferred) && fromPreferred.toLowerCase() !== 'sem nome') {
      return fromPreferred;
    }
    try {
      var session = JSON.parse(localStorage.getItem('siga_session') || 'null');
      if (session && session.nome && String(session.nome).trim()) {
        return String(session.nome).trim();
      }
    } catch (e) { /* ignore */ }
    var profile = String(localStorage.getItem('siga_profile_name') || '').trim();
    if (profile) return profile;
    return 'Usuário';
  }

  function uploadToDriveFromLocal(tipo, arquivoMeta, onProgress, solicitanteNome) {
    if (!arquivoMeta || !arquivoMeta.id) {
      return Promise.reject(new Error('Anexo local não encontrado para enviar ao Drive.'));
    }
    return requireDriveConnected().then(function (drive) {
      return idbGet(arquivoMeta.id).then(function (rec) {
        if (!rec || !rec.blob) {
          throw new Error('Arquivo local indisponível para o Drive.');
        }
        return drive.uploadSolicitacaoFile(
          tipo,
          rec.blob,
          arquivoMeta.name || rec.name || 'arquivo',
          arquivoMeta.mime || rec.mime || 'application/octet-stream',
          onProgress,
          getSolicitanteNome(solicitanteNome)
        );
      });
    });
  }

  function escapeHtml(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function uid() {
    return 'sp_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 9);
  }

  function showToast(message, type) {
    type = type || 'success';
    var el = document.getElementById('sp-toast');
    if (!el) {
      try { console.log('[SP]', message); } catch (e) { /* noop */ }
      return;
    }
    el.textContent = message;
    el.classList.remove('hidden');
    el.setAttribute('data-type', type);
    clearTimeout(el._timer);
    el._timer = setTimeout(function () { el.classList.add('hidden'); }, 3200);
  }

  function formatDateBr(value) {
    if (!value) return '—';
    if (String(value).includes('/')) return value;
    var parts = String(value).slice(0, 10).split('-');
    if (parts.length === 3) return parts[2] + '/' + parts[1] + '/' + parts[0];
    var d = new Date(value);
    return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('pt-BR');
  }

  function todayIso() {
    return new Date().toISOString().slice(0, 10);
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
    localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.isArray(list) ? list : []));
  }

  function getTurmas() {
    try {
      if (typeof getClasses === 'function') return getClasses() || [];
      return JSON.parse(localStorage.getItem('siga_classes') || '[]') || [];
    } catch (e) {
      return [];
    }
  }

  function turmaLabel(t) {
    if (!t) return '';
    var code = t.code || t.codigo || t.id || '';
    var serie = t.serie || '';
    var turno = t.turno || '';
    var parts = [code];
    if (serie) parts.push(serie);
    if (turno) parts.push(turno);
    return parts.filter(Boolean).join(' · ');
  }

  function openDb() {
    return new Promise(function (resolve, reject) {
      var req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = function () {
        var db = req.result;
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE, { keyPath: 'id' });
        }
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
    });
  }

  function idbPut(record) {
    return openDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).put(record);
        tx.oncomplete = function () { resolve(record); };
        tx.onerror = function () { reject(tx.error); };
      });
    });
  }

  function idbGet(id) {
    return openDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(STORE, 'readonly');
        var req = tx.objectStore(STORE).get(id);
        req.onsuccess = function () { resolve(req.result || null); };
        req.onerror = function () { reject(req.error); };
      });
    });
  }

  function idbDelete(id) {
    if (!id) return Promise.resolve();
    return openDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).delete(id);
        tx.oncomplete = function () { resolve(); };
        tx.onerror = function () { reject(tx.error); };
      });
    });
  }

  function setUploadProgress(pct, label) {
    var wrap = document.getElementById('sp-upload-progress');
    var bar = document.getElementById('sp-upload-bar');
    var text = document.getElementById('sp-upload-text');
    if (!wrap || !bar) return;
    wrap.classList.remove('hidden');
    bar.style.width = Math.max(0, Math.min(100, pct)) + '%';
    if (text) text.textContent = label || (Math.round(pct) + '%');
  }

  function hideUploadProgress() {
    var wrap = document.getElementById('sp-upload-progress');
    var bar = document.getElementById('sp-upload-bar');
    if (wrap) wrap.classList.add('hidden');
    if (bar) bar.style.width = '0%';
  }

  function readFileWithProgress(file, onProgress) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onprogress = function (e) {
        if (e.lengthComputable && typeof onProgress === 'function') {
          onProgress((e.loaded / e.total) * 85);
        }
      };
      reader.onload = function () {
        resolve(reader.result);
      };
      reader.onerror = function () {
        reject(reader.error || new Error('Falha ao ler arquivo'));
      };
      reader.readAsArrayBuffer(file);
    });
  }

  function wait(ms) {
    return new Promise(function (resolve) { setTimeout(resolve, ms); });
  }

  function uploadAnexo(file, existingFileId) {
    if (!file) return Promise.resolve(null);
    if (file.size > MAX_FILE_BYTES) {
      return Promise.reject(new Error('Arquivo acima de 20 MB.'));
    }
    setUploadProgress(2, 'Lendo arquivo…');
    return readFileWithProgress(file, function (pct) {
      setUploadProgress(pct, 'Enviando… ' + Math.round(pct) + '%');
    }).then(function (buffer) {
      setUploadProgress(88, 'Gravando anexo…');
      return wait(220).then(function () {
        var id = existingFileId || uid();
        return idbPut({
          id: id,
          name: file.name,
          mime: file.type || 'application/octet-stream',
          size: file.size,
          blob: new Blob([buffer], { type: file.type || 'application/octet-stream' }),
          updatedAt: new Date().toISOString()
        }).then(function () {
          setUploadProgress(100, 'Concluído');
          return wait(280).then(function () {
            return {
              id: id,
              name: file.name,
              mime: file.type || 'application/octet-stream',
              size: file.size
            };
          });
        });
      });
    });
  }

  function iconForTipo(tipo) {
    if (/Chromebook/i.test(tipo)) return 'laptop_chromebook';
    if (/Audit/i.test(tipo)) return 'stadium';
    if (/Teste/i.test(tipo)) return 'quiz';
    return 'print';
  }

  function getSelectedTurmas() {
    return Array.from(document.querySelectorAll('#sp-turma-list input[type="checkbox"]:checked'))
      .map(function (el) { return el.value; })
      .filter(Boolean);
  }

  function setSelectedTurmas(codes) {
    var set = {};
    (codes || []).forEach(function (c) { set[String(c)] = true; });
    document.querySelectorAll('#sp-turma-list input[type="checkbox"]').forEach(function (el) {
      el.checked = !!set[el.value];
    });
    updateTurmasSummary();
  }

  function updateTurmasSummary() {
    var selected = getSelectedTurmas();
    var btn = document.getElementById('sp-turma-summary');
    if (!btn) return;
    if (!selected.length) {
      btn.textContent = 'Selecione uma ou mais turmas';
      return;
    }
    btn.textContent = selected.length === 1
      ? selected[0]
      : selected.length + ' turmas selecionadas';
  }

  function populateTurmaCheckboxes() {
    var host = document.getElementById('sp-turma-list');
    if (!host) return;
    var turmas = getTurmas().slice().sort(function (a, b) {
      return String(a.code || '').localeCompare(String(b.code || ''), 'pt-BR');
    });
    if (!turmas.length) {
      host.innerHTML = '<p class="text-sm text-text-secondary px-2 py-3">Nenhuma turma cadastrada.</p>';
      return;
    }
    host.innerHTML = turmas.map(function (t) {
      var code = String(t.code || t.codigo || t.id || '');
      if (!code) return '';
      return (
        '<label class="flex items-start gap-2 px-2 py-2 rounded-lg hover:bg-surface-container cursor-pointer">' +
        '<input type="checkbox" value="' + escapeHtml(code) + '" class="mt-1 rounded border-border-subtle text-primary focus:ring-primary/30">' +
        '<span class="text-sm text-on-surface leading-snug">' + escapeHtml(turmaLabel(t)) + '</span>' +
        '</label>'
      );
    }).join('');
    host.querySelectorAll('input[type="checkbox"]').forEach(function (el) {
      el.addEventListener('change', updateTurmasSummary);
    });
  }

  function populateTipoSelects() {
    var opts = TIPOS.map(function (t) {
      return '<option value="' + escapeHtml(t) + '">' + escapeHtml(t) + '</option>';
    }).join('');
    var formTipo = document.getElementById('sp-tipo');
    var filterTipo = document.getElementById('sp-filter-tipo');
    if (formTipo) {
      formTipo.innerHTML = '<option value="">Selecione…</option>' + opts;
    }
    if (filterTipo) {
      filterTipo.innerHTML = '<option value="">Todos os tipos</option>' + opts;
    }
  }

  function toggleTurmaDropdown(force) {
    var panel = document.getElementById('sp-turma-panel');
    if (!panel) return;
    var open = typeof force === 'boolean' ? force : panel.classList.contains('hidden');
    panel.classList.toggle('hidden', !open);
  }

  function setPeriodMode(mode) {
    mode = mode === 'semana' ? 'semana' : 'mes';
    var btnMes = document.getElementById('sp-period-mes');
    var btnSem = document.getElementById('sp-period-semana');
    var wrapMes = document.getElementById('sp-filter-mes-wrap');
    var wrapSem = document.getElementById('sp-filter-semana-wrap');
    if (btnMes) {
      btnMes.classList.toggle('bg-primary', mode === 'mes');
      btnMes.classList.toggle('text-white', mode === 'mes');
      btnMes.classList.toggle('text-text-secondary', mode !== 'mes');
    }
    if (btnSem) {
      btnSem.classList.toggle('bg-primary', mode === 'semana');
      btnSem.classList.toggle('text-white', mode === 'semana');
      btnSem.classList.toggle('text-text-secondary', mode !== 'semana');
    }
    if (wrapMes) wrapMes.classList.toggle('hidden', mode !== 'mes');
    if (wrapSem) wrapSem.classList.toggle('hidden', mode !== 'semana');
    renderList();
  }

  function setStatusFilter(status) {
    var btnPend = document.getElementById('sp-filter-pendentes');
    var btnAceitas = document.getElementById('sp-filter-aceitas');
    if (btnPend) {
      btnPend.classList.toggle('bg-primary', status === 'pendente');
      btnPend.classList.toggle('text-white', status === 'pendente');
      btnPend.classList.toggle('text-text-secondary', status !== 'pendente');
      btnPend.setAttribute('data-active', status === 'pendente' ? '1' : '0');
    }
    if (btnAceitas) {
      btnAceitas.classList.toggle('bg-primary', status === 'aceita');
      btnAceitas.classList.toggle('text-white', status === 'aceita');
      btnAceitas.classList.toggle('text-text-secondary', status !== 'aceita');
      btnAceitas.setAttribute('data-active', status === 'aceita' ? '1' : '0');
    }
    renderList();
  }

  function getActiveStatusFilter() {
    var btnAceitas = document.getElementById('sp-filter-aceitas');
    if (btnAceitas && btnAceitas.getAttribute('data-active') === '1') return 'aceita';
    return 'pendente';
  }

  function getActivePeriodMode() {
    var wrapSem = document.getElementById('sp-filter-semana-wrap');
    if (wrapSem && !wrapSem.classList.contains('hidden')) return 'semana';
    return 'mes';
  }

  function isoInWeek(isoDate, weekValue) {
    if (!isoDate || !weekValue) return true;
    // weekValue: YYYY-Www
    var m = String(weekValue).match(/^(\d{4})-W(\d{2})$/i);
    if (!m) return true;
    var year = Number(m[1]);
    var week = Number(m[2]);
    var d = new Date(isoDate + 'T12:00:00');
    if (Number.isNaN(d.getTime())) return false;
    // ISO week number
    var tmp = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    var dayNum = tmp.getUTCDay() || 7;
    tmp.setUTCDate(tmp.getUTCDate() + 4 - dayNum);
    var yearStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1));
    var weekNo = Math.ceil((((tmp - yearStart) / 86400000) + 1) / 7);
    return tmp.getUTCFullYear() === year && weekNo === week;
  }

  function matchesFilters(item) {
    var tipo = (document.getElementById('sp-filter-tipo') || {}).value || '';
    if (tipo && item.tipo !== tipo) return false;

    var status = getActiveStatusFilter();
    if ((item.status || 'pendente') !== status) return false;

    var mode = getActivePeriodMode();
    var refDate = item.dataAplicacao || item.dataSolicitacao || '';
    if (mode === 'mes') {
      var mes = (document.getElementById('sp-filter-mes') || {}).value || '';
      if (mes && String(refDate).slice(0, 7) !== mes) return false;
    } else {
      var semana = (document.getElementById('sp-filter-semana') || {}).value || '';
      if (semana && !isoInWeek(refDate, semana)) return false;
    }
    return true;
  }

  function updateKpis(all) {
    var pend = all.filter(function (i) { return (i.status || 'pendente') === 'pendente'; }).length;
    var aceitas = all.filter(function (i) { return i.status === 'aceita'; }).length;
    var elTotal = document.getElementById('kpi-sp-total');
    var elPend = document.getElementById('kpi-sp-pendentes');
    var elAceitas = document.getElementById('kpi-sp-aceitas');
    if (elTotal) elTotal.textContent = String(all.length);
    if (elPend) elPend.textContent = String(pend);
    if (elAceitas) elAceitas.textContent = String(aceitas);
  }

  function renderList() {
    var host = document.getElementById('sp-list');
    var empty = document.getElementById('sp-empty');
    if (!host) return;
    var all = getList();
    updateKpis(all);
    var filtered = all.filter(matchesFilters);
    if (!filtered.length) {
      host.innerHTML = '';
      if (empty) empty.classList.remove('hidden');
      return;
    }
    if (empty) empty.classList.add('hidden');
    host.innerHTML = filtered.map(function (item) {
      var status = item.status || 'pendente';
      var statusCls = status === 'aceita'
        ? 'bg-emerald-100 text-emerald-700'
        : 'bg-amber-100 text-amber-800';
      var statusLabel = status === 'aceita' ? 'Aceita' : 'Pendente';
      var turmasTxt = (item.turmas || []).join(', ') || '—';
      var obs = String(item.observacoes || '').trim() || 'Sem observações.';
      return (
        '<article class="bg-white rounded-2xl border border-border-subtle custom-shadow overflow-hidden flex flex-col">' +
        '<div class="p-6 flex-1">' +
        '<div class="flex justify-between items-start gap-3 mb-4">' +
        '<div class="flex items-center gap-3 min-w-0">' +
        '<div class="w-12 h-12 bg-primary/10 text-primary rounded-xl flex items-center justify-center flex-shrink-0">' +
        '<span class="material-symbols-outlined">' + iconForTipo(item.tipo) + '</span></div>' +
        '<div class="min-w-0">' +
        '<h3 class="text-headline-sm text-on-surface truncate">' + escapeHtml(item.tipo) + '</h3>' +
        '<p class="text-label-md text-text-secondary">Solicitação: ' + escapeHtml(formatDateBr(item.dataSolicitacao)) +
        (item.solicitante ? (' · ' + escapeHtml(item.solicitante)) : '') +
        '</p>' +
        '</div></div>' +
        '<span class="px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider flex-shrink-0 ' + statusCls + '">' +
        statusLabel + '</span></div>' +
        '<div class="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">' +
        '<div class="bg-surface-container-low rounded-xl p-3">' +
        '<p class="text-[10px] uppercase font-bold text-text-secondary mb-1">Data da aplicação</p>' +
        '<p class="text-body-md font-semibold">' + escapeHtml(formatDateBr(item.dataAplicacao)) + '</p></div>' +
        '<div class="bg-surface-container-low rounded-xl p-3">' +
        '<p class="text-[10px] uppercase font-bold text-text-secondary mb-1">Turmas</p>' +
        '<p class="text-body-md font-semibold break-words">' + escapeHtml(turmasTxt) + '</p></div>' +
        '</div>' +
        '<div class="bg-surface-container-low rounded-xl p-3 mb-2">' +
        '<p class="text-[10px] uppercase font-bold text-text-secondary mb-1">Observações</p>' +
        '<p class="text-body-md text-on-surface whitespace-pre-wrap">' + escapeHtml(obs) + '</p></div>' +
        '</div>' +
        '<div class="px-4 py-3 border-t border-border-subtle bg-surface-container-low/60 flex flex-wrap gap-2">' +
        '<button type="button" class="px-3 py-2 rounded-lg text-sm font-semibold bg-white border border-border-subtle hover:border-primary hover:text-primary transition-colors flex items-center gap-1" onclick="abrirArquivoSolicitacaoPed(\'' + item.id + '\')">' +
        '<span class="material-symbols-outlined text-[18px]">' +
        (item.drive && (item.drive.webViewLink || item.drive.fileId) ? 'cloud_download' : 'attach_file') +
        '</span>' +
        (item.drive && (item.drive.webViewLink || item.drive.fileId) ? 'Abrir no Drive' : 'Abrir Arquivo') +
        '</button>' +
        (item.drive && (item.drive.webViewLink || item.drive.fileId)
          ? '<button type="button" class="px-3 py-2 rounded-lg text-sm font-semibold text-emerald-800 bg-emerald-50 border border-emerald-100 hover:border-emerald-300 transition-colors flex items-center gap-1" onclick="abrirPastaDriveSolicitacaoPed(\'' + item.id + '\')" title="' + escapeHtml((item.drive && item.drive.folderPath) || 'Salvo no Drive da escola') + '">' +
            '<span class="material-symbols-outlined text-[18px]">folder_open</span>Pasta Drive</button>'
          : '<button type="button" class="px-3 py-2 rounded-lg text-sm font-semibold bg-white border border-amber-200 text-amber-800 hover:border-amber-400 transition-colors flex items-center gap-1" onclick="enviarAoDriveSolicitacaoPed(\'' + item.id + '\')">' +
            '<span class="material-symbols-outlined text-[18px]">cloud_upload</span>Enviar ao Drive</button>') +
        (status === 'pendente'
          ? '<button type="button" class="px-3 py-2 rounded-lg text-sm font-semibold bg-primary text-white hover:bg-[#005228] transition-colors flex items-center gap-1" onclick="tratarDemandaSolicitacaoPed(\'' + item.id + '\')">' +
            '<span class="material-symbols-outlined text-[18px]">task_alt</span>Tratar Demanda</button>'
          : '') +
        '<button type="button" class="px-3 py-2 rounded-lg text-sm font-semibold text-text-secondary hover:bg-white transition-colors" onclick="verSolicitacaoPed(\'' + item.id + '\')">Ver</button>' +
        '<button type="button" class="px-3 py-2 rounded-lg text-sm font-semibold text-text-secondary hover:bg-white transition-colors" onclick="editarSolicitacaoPed(\'' + item.id + '\')">Editar</button>' +
        '<button type="button" class="px-3 py-2 rounded-lg text-sm font-semibold text-error hover:bg-error/5 transition-colors" onclick="excluirSolicitacaoPed(\'' + item.id + '\')">Excluir</button>' +
        '</div></article>'
      );
    }).join('');
  }

  function resetForm() {
    editingId = null;
    pendingFile = null;
    uploadBusy = false;
    var form = document.getElementById('sp-form');
    if (form) form.reset();
    setSelectedTurmas([]);
    hideUploadProgress();
    var nameEl = document.getElementById('sp-file-name');
    if (nameEl) nameEl.textContent = 'Nenhum arquivo selecionado';
    var title = document.getElementById('sp-modal-title');
    if (title) title.textContent = 'Nova Solicitação';
    var btn = document.getElementById('sp-btn-enviar');
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<span class="material-symbols-outlined text-[18px]">send</span>Enviar Solicitação';
    }
  }

  function abrirModal(id) {
    populateTurmaCheckboxes();
    resetForm();
    if (id) {
      var item = getList().find(function (x) { return x.id === id; });
      if (!item) {
        showToast('Solicitação não encontrada.', 'error');
        return;
      }
      editingId = id;
      var title = document.getElementById('sp-modal-title');
      if (title) title.textContent = 'Editar Solicitação';
      var tipo = document.getElementById('sp-tipo');
      var data = document.getElementById('sp-data');
      var obs = document.getElementById('sp-obs');
      if (tipo) tipo.value = item.tipo || '';
      if (data) data.value = item.dataAplicacao || '';
      if (obs) obs.value = item.observacoes || '';
      setSelectedTurmas(item.turmas || []);
      var nameEl = document.getElementById('sp-file-name');
      if (nameEl) {
        nameEl.textContent = item.arquivo && item.arquivo.name
          ? item.arquivo.name + ' (anexo atual)'
          : 'Nenhum arquivo selecionado';
      }
    } else {
      var dataNew = document.getElementById('sp-data');
      if (dataNew && !dataNew.value) dataNew.value = todayIso();
    }
    var modal = document.getElementById('sp-modal');
    if (modal) {
      modal.classList.remove('hidden');
      modal.classList.add('flex');
    }
  }

  function fecharModal(force) {
    if (uploadBusy && !force) {
      showToast('Aguarde o envio do arquivo terminar.', 'error');
      return;
    }
    var modal = document.getElementById('sp-modal');
    if (modal) {
      modal.classList.add('hidden');
      modal.classList.remove('flex');
    }
    resetForm();
  }

  function onFilePicked(file) {
    pendingFile = file || null;
    var nameEl = document.getElementById('sp-file-name');
    if (nameEl) {
      nameEl.textContent = pendingFile
        ? pendingFile.name + ' (' + Math.round(pendingFile.size / 1024) + ' KB)'
        : 'Nenhum arquivo selecionado';
    }
  }

  function enviarSolicitacao() {
    if (uploadBusy) return;

    var tipo = ((document.getElementById('sp-tipo') || {}).value || '').trim();
    var dataAplicacao = ((document.getElementById('sp-data') || {}).value || '').trim();
    var observacoes = ((document.getElementById('sp-obs') || {}).value || '').trim();
    var turmas = getSelectedTurmas();

    if (!tipo) {
      showToast('Selecione o tipo de solicitação.', 'error');
      return;
    }
    if (!turmas.length) {
      showToast('Selecione ao menos uma turma.', 'error');
      return;
    }
    if (!dataAplicacao) {
      showToast('Informe a data da aplicação.', 'error');
      return;
    }

    var list = getList();
    var existing = editingId ? list.find(function (x) { return x.id === editingId; }) : null;
    if (editingId && !existing) {
      showToast('Solicitação não encontrada.', 'error');
      return;
    }
    if (!editingId && !pendingFile) {
      showToast('Anexe um arquivo para enviar a solicitação.', 'error');
      return;
    }

    uploadBusy = true;
    var btn = document.getElementById('sp-btn-enviar');
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<span class="material-symbols-outlined text-[18px] animate-spin">progress_activity</span>Enviando…';
    }

    requireDriveConnected().then(function () {
      var filePromise = pendingFile
        ? uploadAnexo(pendingFile, existing && existing.arquivo && existing.arquivo.id)
        : Promise.resolve(existing ? existing.arquivo : null);

      return filePromise.then(function (arquivoMeta) {
        if (!arquivoMeta) throw new Error('Anexo obrigatório.');

        var shouldUploadDrive = !!pendingFile || !(existing && existing.drive && existing.drive.fileId);
        if (!shouldUploadDrive) {
          return { arquivoMeta: arquivoMeta, driveMeta: existing.drive };
        }

        setUploadProgress(40, 'Enviando ao Google Drive…');
        var solicitanteDrive = (existing && existing.solicitante) || getSolicitanteNome();
        return uploadToDriveFromLocal(tipo, arquivoMeta, function (pct, label) {
          setUploadProgress(40 + Math.round((pct || 0) * 0.55), label || 'Google Drive…');
        }, solicitanteDrive).then(function (driveMeta) {
          setUploadProgress(100, 'Concluído');
          return { arquivoMeta: arquivoMeta, driveMeta: driveMeta };
        });
      });
    }).then(function (result) {
      var arquivoMeta = result.arquivoMeta;
      var driveMeta = result.driveMeta;
      var now = todayIso();
      var solicitante = (existing && existing.solicitante) || getSolicitanteNome();
      if (existing) {
        existing.tipo = tipo;
        existing.dataAplicacao = dataAplicacao;
        existing.turmas = turmas;
        existing.observacoes = observacoes;
        existing.arquivo = arquivoMeta || existing.arquivo || null;
        if (driveMeta) existing.drive = driveMeta;
        if (!existing.solicitante) existing.solicitante = solicitante;
        existing.updatedAt = new Date().toISOString();
      } else {
        list.unshift({
          id: uid(),
          tipo: tipo,
          turmas: turmas,
          dataSolicitacao: now,
          dataAplicacao: dataAplicacao,
          observacoes: observacoes,
          status: 'pendente',
          solicitante: solicitante,
          arquivo: arquivoMeta,
          drive: driveMeta || null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        });
      }
      saveList(list);
      uploadBusy = false;
      var pathMsg = (driveMeta && driveMeta.folderPath)
        ? (' Salvo em: ' + driveMeta.folderPath)
        : '';
      showToast(
        (existing ? 'Solicitação atualizada.' : 'Solicitação enviada.') + pathMsg,
        'success'
      );
      fecharModal(true);
      renderList();
    }).catch(function (err) {
      uploadBusy = false;
      hideUploadProgress();
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = '<span class="material-symbols-outlined text-[18px]">send</span>Enviar Solicitação';
      }
      showToast((err && err.message) || 'Falha no envio do arquivo.', 'error');
    });
  }

  function findById(id) {
    return getList().find(function (x) { return x.id === id; }) || null;
  }

  function abrirPastaDrive(id) {
    var item = findById(id);
    if (!item || !item.drive) {
      showToast('Esta solicitação ainda não tem arquivo no Drive da escola.', 'error');
      return;
    }
    var folderLink = item.drive.folderWebLink ||
      (item.drive.folderId
        ? ('https://drive.google.com/drive/folders/' + item.drive.folderId)
        : '');
    if (folderLink) {
      window.open(folderLink, '_blank', 'noopener,noreferrer');
      showToast(
        item.drive.folderPath
          ? ('Abrindo pasta: ' + item.drive.folderPath)
          : 'Abrindo pasta no Drive…',
        'success'
      );
      return;
    }
    showToast(
      (item.drive.folderPath
        ? ('Salvo em: ' + item.drive.folderPath)
        : 'Arquivo no Drive institucional da escola.') +
        ' Use “Abrir Arquivo” no SIGA.',
      'success'
    );
  }

  function enviarAoDrive(id) {
    var list = getList();
    var item = list.find(function (x) { return x.id === id; });
    if (!item) {
      showToast('Solicitação não encontrada.', 'error');
      return;
    }
    if (!item.arquivo || !item.arquivo.id) {
      showToast('Nenhum arquivo anexado para enviar.', 'error');
      return;
    }
    showToast('Enviando ao Drive da escola…', 'success');
    uploadToDriveFromLocal(item.tipo, item.arquivo, null, item.solicitante).then(function (driveMeta) {
      item.drive = driveMeta;
      if (!item.solicitante) item.solicitante = getSolicitanteNome();
      item.updatedAt = new Date().toISOString();
      saveList(list);
      showToast(
        'Arquivo salvo em: ' + (driveMeta.folderPath || 'Drive da escola'),
        'success'
      );
      renderList();
    }).catch(function (err) {
      showToast((err && err.message) || 'Falha ao enviar ao Drive.', 'error');
    });
  }

  function openLocalAnexo(arquivoMeta) {
    if (!arquivoMeta || !arquivoMeta.id) {
      return Promise.resolve(false);
    }
    return idbGet(arquivoMeta.id).then(function (rec) {
      if (!rec || !rec.blob) return false;
      var url = URL.createObjectURL(rec.blob);
      window.open(url, '_blank');
      setTimeout(function () { URL.revokeObjectURL(url); }, 60000);
      return true;
    }).catch(function () {
      return false;
    });
  }

  function abrirArquivo(id) {
    var item = findById(id);
    if (!item) {
      showToast('Solicitação não encontrada.', 'error');
      return;
    }
    // Preferir Drive institucional (destino real). blob: é só cópia local no navegador.
    if (item.drive && (item.drive.webViewLink || item.drive.fileId)) {
      var drive = getDriveApi();
      if (drive && drive.openInDrive) {
        drive.openInDrive(item.drive.webViewLink || item.drive.fileId);
      } else {
        var link = item.drive.webViewLink ||
          ('https://drive.google.com/file/d/' + item.drive.fileId + '/view?usp=sharing');
        window.open(link, '_blank', 'noopener,noreferrer');
      }
      if (item.drive.folderPath) {
        showToast('Abrindo arquivo do Drive: ' + item.drive.folderPath, 'success');
      }
      return;
    }
    openLocalAnexo(item.arquivo).then(function (ok) {
      if (ok) {
        showToast('Arquivo local (ainda não está no Drive). Use “Enviar ao Drive”.', 'error');
        return;
      }
      showToast('Arquivo não encontrado. Reenvie a solicitação.', 'error');
    });
  }

  function tratarDemanda(id) {
    var list = getList();
    var item = list.find(function (x) { return x.id === id; });
    if (!item) {
      showToast('Solicitação não encontrada.', 'error');
      return;
    }
    item.status = 'aceita';
    item.tratadoEm = new Date().toISOString();
    item.updatedAt = item.tratadoEm;
    saveList(list);
    showToast('Demanda marcada como Aceita.', 'success');
    renderList();
  }

  function verSolicitacao(id) {
    var item = findById(id);
    if (!item) {
      showToast('Solicitação não encontrada.', 'error');
      return;
    }
    var body = document.getElementById('sp-view-body');
    var modal = document.getElementById('sp-view-modal');
    if (!body || !modal) return;
    body.innerHTML =
      '<dl class="space-y-3 text-body-md">' +
      '<div><dt class="text-[10px] uppercase font-bold text-text-secondary">Tipo</dt><dd class="font-semibold">' + escapeHtml(item.tipo) + '</dd></div>' +
      '<div class="grid grid-cols-2 gap-3">' +
      '<div><dt class="text-[10px] uppercase font-bold text-text-secondary">Data da solicitação</dt><dd>' + escapeHtml(formatDateBr(item.dataSolicitacao)) + '</dd></div>' +
      '<div><dt class="text-[10px] uppercase font-bold text-text-secondary">Data da aplicação</dt><dd>' + escapeHtml(formatDateBr(item.dataAplicacao)) + '</dd></div>' +
      '</div>' +
      '<div><dt class="text-[10px] uppercase font-bold text-text-secondary">Turmas</dt><dd>' + escapeHtml((item.turmas || []).join(', ') || '—') + '</dd></div>' +
      '<div><dt class="text-[10px] uppercase font-bold text-text-secondary">Status</dt><dd>' + escapeHtml((item.status || 'pendente') === 'aceita' ? 'Aceita' : 'Pendente') + '</dd></div>' +
      '<div><dt class="text-[10px] uppercase font-bold text-text-secondary">Arquivo</dt><dd>' + escapeHtml((item.arquivo && item.arquivo.name) || '—') + '</dd></div>' +
      '<div><dt class="text-[10px] uppercase font-bold text-text-secondary">Drive da escola</dt><dd>' +
      (item.drive && (item.drive.folderPath || item.drive.fileId)
        ? (escapeHtml(item.drive.folderPath || 'Salvo no Drive') +
          (item.drive.webViewLink
            ? ' · <a class="text-primary font-semibold underline" href="' + escapeHtml(item.drive.webViewLink) + '" target="_blank" rel="noopener">abrir arquivo</a>'
            : '') +
          (item.drive.folderWebLink || item.drive.folderId
            ? ' · <a class="text-primary font-semibold underline" href="' +
              escapeHtml(item.drive.folderWebLink || ('https://drive.google.com/drive/folders/' + item.drive.folderId)) +
              '" target="_blank" rel="noopener">abrir pasta</a>'
            : ''))
        : 'Ainda não enviado — use “Enviar ao Drive”') +
      '</dd></div>' +
      '<div><dt class="text-[10px] uppercase font-bold text-text-secondary">Observações</dt><dd class="whitespace-pre-wrap">' + escapeHtml(item.observacoes || '—') + '</dd></div>' +
      '</dl>';
    modal.classList.remove('hidden');
    modal.classList.add('flex');
  }

  function fecharViewModal() {
    var modal = document.getElementById('sp-view-modal');
    if (!modal) return;
    modal.classList.add('hidden');
    modal.classList.remove('flex');
  }

  function excluirSolicitacao(id) {
    var item = findById(id);
    if (!item) {
      showToast('Solicitação não encontrada.', 'error');
      return;
    }
    if (!window.confirm('Excluir esta solicitação?')) return;
    var list = getList().filter(function (x) { return x.id !== id; });
    saveList(list);
    var fileId = item.arquivo && item.arquivo.id;
    idbDelete(fileId).finally(function () {
      showToast('Solicitação excluída.', 'success');
      renderList();
    });
  }

  function wireUi() {
    populateTipoSelects();
    populateTurmaCheckboxes();

    var drop = document.getElementById('sp-dropzone');
    var fileInput = document.getElementById('sp-file');
    if (drop && fileInput) {
      drop.addEventListener('click', function () { fileInput.click(); });
      drop.addEventListener('dragover', function (e) {
        e.preventDefault();
        drop.classList.add('border-primary', 'bg-primary/5');
      });
      drop.addEventListener('dragleave', function () {
        drop.classList.remove('border-primary', 'bg-primary/5');
      });
      drop.addEventListener('drop', function (e) {
        e.preventDefault();
        drop.classList.remove('border-primary', 'bg-primary/5');
        var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
        if (f) {
          fileInput.files = e.dataTransfer.files;
          onFilePicked(f);
        }
      });
      fileInput.addEventListener('change', function () {
        onFilePicked(fileInput.files && fileInput.files[0]);
      });
    }

    document.addEventListener('click', function (e) {
      var panel = document.getElementById('sp-turma-panel');
      var wrap = document.getElementById('sp-turma-wrap');
      if (!panel || !wrap || panel.classList.contains('hidden')) return;
      if (!wrap.contains(e.target)) toggleTurmaDropdown(false);
    });

    var drive = getDriveApi();
    if (drive && drive.onStatusChange) drive.onStatusChange(updateDriveStatusUi);
    updateDriveStatusUi();
    renderList();
  }

  document.addEventListener('DOMContentLoaded', wireUi);

  window.abrirModalSolicitacaoPed = function () { abrirModal(null); };
  window.fecharModalSolicitacaoPed = fecharModal;
  window.enviarSolicitacaoPed = enviarSolicitacao;
  window.toggleTurmasSolicitacaoPed = function () { toggleTurmaDropdown(); };
  window.setPeriodoFiltroSolicitacaoPed = setPeriodMode;
  window.setStatusFiltroSolicitacaoPed = setStatusFilter;
  window.filtrarSolicitacoesPed = renderList;
  window.abrirArquivoSolicitacaoPed = abrirArquivo;
  window.abrirPastaDriveSolicitacaoPed = abrirPastaDrive;
  window.enviarAoDriveSolicitacaoPed = enviarAoDrive;
  window.conectarGoogleDriveSolicitacaoPed = conectarGoogleDrive;
  window.tratarDemandaSolicitacaoPed = tratarDemanda;
  window.verSolicitacaoPed = verSolicitacao;
  window.fecharViewSolicitacaoPed = fecharViewModal;
  window.editarSolicitacaoPed = function (id) { abrirModal(id); };
  window.excluirSolicitacaoPed = excluirSolicitacao;
})();
