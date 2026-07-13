/**
 * SIGA Educa — Módulo de Boletins
 * Upload de PDF único da turma → separa pelo Código INEP impresso (ALUNO: INEP - Nome)
 * Status por turma em localStorage; PDFs em IndexedDB
 */
(function () {
  'use strict';

  var STATUS_KEY = 'siga_boletim_status';
  var META_KEY = 'siga_boletim_meta';
  var DB_NAME = 'siga_boletins_db';
  var STORE = 'pdfs';

  function escapeHtml(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function normalizeName(name) {
    return String(name || '')
      .toUpperCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^A-Z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function getStudents() {
    try {
      var s = JSON.parse(localStorage.getItem('siga_students') || '[]');
      if ((!s || !s.length) && typeof getDefaultStudents === 'function') {
        s = getDefaultStudents();
        localStorage.setItem('siga_students', JSON.stringify(s));
      }
      return s || [];
    } catch (e) {
      return typeof getDefaultStudents === 'function' ? getDefaultStudents() : [];
    }
  }

  function getTurmas() {
    try {
      if (typeof getClasses === 'function') return getClasses() || [];
      return JSON.parse(localStorage.getItem('siga_classes') || '[]') || [];
    } catch (e) {
      return [];
    }
  }

  function getStatusMap() {
    try {
      return JSON.parse(localStorage.getItem(STATUS_KEY) || '{}') || {};
    } catch (e) {
      return {};
    }
  }

  function saveStatusMap(map) {
    localStorage.setItem(STATUS_KEY, JSON.stringify(map || {}));
  }

  function getMetaMap() {
    try {
      return JSON.parse(localStorage.getItem(META_KEY) || '{}') || {};
    } catch (e) {
      return {};
    }
  }

  function saveMetaMap(map) {
    localStorage.setItem(META_KEY, JSON.stringify(map || {}));
  }

  function statusKey(turma, ano, bimestre) {
    return [turma, ano, bimestre].join('|');
  }

  function boletimId(alunoId, ano, bimestre) {
    return [alunoId, ano, bimestre].join('|');
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
        tx.oncomplete = function () { resolve(); };
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

  function idbDeleteByTurma(turma, ano, bimestre) {
    return openDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(STORE, 'readwrite');
        var store = tx.objectStore(STORE);
        var req = store.openCursor();
        req.onsuccess = function (e) {
          var cursor = e.target.result;
          if (!cursor) return;
          var v = cursor.value;
          if (v.turma === turma && v.ano === ano && v.bimestre === bimestre) {
            cursor.delete();
          }
          cursor.continue();
        };
        tx.oncomplete = function () { resolve(); };
        tx.onerror = function () { reject(tx.error); };
      });
    });
  }

  function idbListByAluno(alunoId) {
    return openDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(STORE, 'readonly');
        var req = tx.objectStore(STORE).getAll();
        req.onsuccess = function () {
          var all = req.result || [];
          resolve(all.filter(function (r) { return String(r.alunoId) === String(alunoId); }));
        };
        req.onerror = function () { reject(req.error); };
      });
    });
  }

  function boletimToast(msg, type) {
    if (typeof window.showToast === 'function') {
      try { window.showToast(msg, type); return; } catch (e) {}
    }
    var el = document.getElementById('boletim-toast');
    if (!el) {
      alert(msg);
      return;
    }
    el.textContent = msg;
    el.setAttribute('data-type', type || 'success');
    el.classList.remove('hidden');
    clearTimeout(el._t);
    el._t = setTimeout(function () { el.classList.add('hidden'); }, 3500);
  }

  function ensurePdfLibs() {
    return new Promise(function (resolve, reject) {
      function ready() {
        if (window.pdfjsLib && window.PDFLib) resolve();
        else reject(new Error('Bibliotecas PDF não carregaram.'));
      }
      if (window.pdfjsLib && window.PDFLib) {
        ready();
        return;
      }
      var pending = 0;
      function done() {
        pending--;
        if (pending <= 0) ready();
      }
      if (!window.pdfjsLib) {
        pending++;
        var s1 = document.createElement('script');
        s1.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
        s1.onload = function () {
          window.pdfjsLib.GlobalWorkerOptions.workerSrc =
            'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
          done();
        };
        s1.onerror = function () { reject(new Error('Falha ao carregar PDF.js')); };
        document.head.appendChild(s1);
      }
      if (!window.PDFLib) {
        pending++;
        var s2 = document.createElement('script');
        s2.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf-lib/1.17.1/pdf-lib.min.js';
        s2.onload = done;
        s2.onerror = function () { reject(new Error('Falha ao carregar pdf-lib')); };
        document.head.appendChild(s2);
      }
      if (pending === 0) ready();
    });
  }

  function digitsOnly(value) {
    return String(value || '').replace(/\D/g, '');
  }

  /** Extrai o Código INEP do aluno no texto do boletim SEDUC (ALUNO: 128123943155 - NOME). */
  function extractInepFromPage(pageText) {
    var raw = String(pageText || '');
    var m = raw.match(/ALUNO\s*:?\s*(\d{11,14})\b/i);
    if (m) return m[1];
    // Fallback: número longo seguido de hífen e nome (evita o INEP da escola, geralmente 8 dígitos)
    m = raw.match(/\b(\d{11,14})\s*[-–]\s*[A-ZÀ-Ú]/i);
    if (m) return m[1];
    return '';
  }

  async function extractPageTexts(arrayBuffer) {
    var pdf = await window.pdfjsLib.getDocument({ data: arrayBuffer.slice(0) }).promise;
    var texts = [];
    for (var i = 1; i <= pdf.numPages; i++) {
      var page = await pdf.getPage(i);
      var content = await page.getTextContent();
      var raw = content.items.map(function (it) { return it.str; }).join(' ');
      texts.push(normalizeName(raw));
    }
    return texts;
  }

  function matchStudentByName(pageText, students) {
    var best = null;
    var bestLen = 0;
    students.forEach(function (s) {
      var n = normalizeName(s.nome);
      if (!n || n.length < 5) return;
      if (pageText.indexOf(n) !== -1 && n.length > bestLen) {
        best = s;
        bestLen = n.length;
      } else {
        var parts = n.split(' ').filter(Boolean);
        if (parts.length >= 2) {
          var loose = parts[0] + ' ' + parts[parts.length - 1];
          if (pageText.indexOf(parts[0]) !== -1 && pageText.indexOf(parts[parts.length - 1]) !== -1 && loose.length > bestLen) {
            best = s;
            bestLen = loose.length;
          }
        }
      }
    });
    return best;
  }

  function matchStudentOnPage(pageText, students, preferName) {
    if (!preferName) {
      var inep = extractInepFromPage(pageText);
      if (inep) {
        var byInep = students.find(function (s) {
          return digitsOnly(s.codigoInep) === inep;
        });
        if (byInep) return byInep;
      }
    }
    return matchStudentByName(pageText, students);
  }

  async function splitAndSave(file, turmaCode, ano, bimestre, mode) {
    await ensurePdfLibs();
    var bytes = await file.arrayBuffer();
    var students = getStudents().filter(function (s) {
      return String(s.turma || '').split(' - ')[0] === String(turmaCode);
    });
    if (!students.length) {
      throw new Error('Nenhum aluno cadastrado nesta turma.');
    }

    var pageTexts = await extractPageTexts(bytes);
    var srcDoc = await window.PDFLib.PDFDocument.load(bytes);
    var pageCount = srcDoc.getPageCount();

    // Mapa página → aluno (padrão: Código INEP da linha ALUNO: do boletim SEDUC)
    var pageOwner = [];
    if (mode === 'ordem') {
      var ordered = students.slice().sort(function (a, b) {
        return String(a.nome).localeCompare(String(b.nome), 'pt-BR');
      });
      for (var i = 0; i < pageCount; i++) {
        pageOwner[i] = ordered[i] || null;
      }
    } else {
      var preferName = mode === 'nome';
      for (var p = 0; p < pageCount; p++) {
        pageOwner[p] = matchStudentOnPage(pageTexts[p] || '', students, preferName);
      }
    }

    // Agrupa páginas por aluno (páginas consecutivas do mesmo aluno)
    var byAluno = {};
    pageOwner.forEach(function (stu, idx) {
      if (!stu) return;
      if (!byAluno[stu.id]) byAluno[stu.id] = { student: stu, pages: [] };
      byAluno[stu.id].pages.push(idx);
    });

    var ids = Object.keys(byAluno);
    if (!ids.length) {
      throw new Error('Não foi possível identificar alunos no PDF. Confira se o Código INEP está cadastrado no aluno e impresso como "ALUNO: número - nome" no boletim.');
    }

    showProgress(true, 'Preparando...', 0, ids.length);

    await idbDeleteByTurma(turmaCode, ano, bimestre);

    var saved = 0;
    for (var k = 0; k < ids.length; k++) {
      var pack = byAluno[ids[k]];
      showProgress(true, 'Processando: ' + pack.student.nome, k + 1, ids.length);
      var newDoc = await window.PDFLib.PDFDocument.create();
      var copied = await newDoc.copyPages(srcDoc, pack.pages);
      copied.forEach(function (pg) { newDoc.addPage(pg); });
      var outBytes = await newDoc.save();
      var id = boletimId(pack.student.id, ano, bimestre);
      await idbPut({
        id: id,
        alunoId: pack.student.id,
        alunoNome: pack.student.nome,
        turma: turmaCode,
        ano: ano,
        bimestre: bimestre,
        fileName: 'Boletim ' + bimestre + ' - ' + pack.student.nome + '.pdf',
        blob: outBytes,
        updatedAt: new Date().toISOString()
      });
      // meta leve no localStorage
      var meta = getMetaMap();
      meta[id] = {
        alunoId: pack.student.id,
        alunoNome: pack.student.nome,
        turma: turmaCode,
        ano: ano,
        bimestre: bimestre,
        fileName: 'Boletim ' + bimestre + ' - ' + pack.student.nome + '.pdf',
        updatedAt: new Date().toISOString()
      };
      saveMetaMap(meta);
      saved++;
      await new Promise(function (r) { setTimeout(r, 30); });
    }

    var st = getStatusMap();
    st[statusKey(turmaCode, ano, bimestre)] = {
      status: 'Publicado',
      count: saved,
      totalAlunos: students.length,
      fileName: file.name,
      updatedAt: new Date().toISOString()
    };
    saveStatusMap(st);
    showProgress(false);
    return { saved: saved, totalPages: pageCount, unmatched: pageOwner.filter(function (x) { return !x; }).length };
  }

  function showProgress(visible, label, current, total) {
    var modal = document.getElementById('modal-boletim-progress');
    if (!modal) return;
    if (!visible) {
      modal.classList.add('hidden');
      return;
    }
    modal.classList.remove('hidden');
    var nameEl = document.getElementById('boletim-progress-name');
    var countEl = document.getElementById('boletim-progress-count');
    var bar = document.getElementById('boletim-progress-bar');
    if (nameEl) nameEl.textContent = label || '';
    if (countEl) countEl.textContent = (current || 0) + ' de ' + (total || 0) + ' boletins salvos';
    if (bar) {
      var pct = total ? Math.round((current / total) * 100) : 0;
      bar.style.width = pct + '%';
    }
  }

  /* ===== UI ===== */

  function switchTab(tab) {
    document.querySelectorAll('[data-boletim-tab]').forEach(function (btn) {
      var active = btn.getAttribute('data-boletim-tab') === tab;
      btn.className = active
        ? 'flex items-center gap-2 px-4 py-2.5 rounded-lg bg-[#121c2a] text-white text-sm font-semibold'
        : 'flex items-center gap-2 px-4 py-2.5 rounded-lg bg-white border border-border-subtle text-on-surface text-sm font-semibold hover:bg-surface-container';
    });
    document.querySelectorAll('[data-boletim-panel]').forEach(function (panel) {
      if (panel.getAttribute('data-boletim-panel') === tab) panel.classList.remove('hidden');
      else panel.classList.add('hidden');
    });
    if (tab === 'status') renderStatusTable();
  }

  function populateTurmaSelect() {
    var sel = document.getElementById('boletim-upload-turma');
    if (!sel) return;
    var turmas = getTurmas();
    sel.innerHTML = '<option value="">Selecione a turma</option>' +
      turmas.map(function (c) {
        return '<option value="' + escapeHtml(c.code) + '">' +
          escapeHtml(c.code + ' - ' + (c.serie || '') + ' (' + (c.turno || '') + ')') + '</option>';
      }).join('');
  }

  function renderStatusTable() {
    var tbody = document.getElementById('boletim-status-tbody');
    var countEl = document.getElementById('boletim-status-count');
    if (!tbody) return;
    var ano = (document.getElementById('boletim-filter-ano') || {}).value || '2026';
    var bim = (document.getElementById('boletim-filter-bimestre') || {}).value || '1º Bimestre';
    var turmas = getTurmas();
    var stMap = getStatusMap();
    var published = 0;

    tbody.innerHTML = turmas.map(function (c) {
      var info = stMap[statusKey(c.code, ano, bim)];
      var publishedOk = info && info.status === 'Publicado';
      if (publishedOk) published++;
      var badge = publishedOk
        ? '<span class="px-2.5 py-1 rounded-full text-[11px] font-bold bg-green-100 text-green-700">Publicado</span>'
        : '<span class="px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-100 text-amber-800">Pendente</span>';
      return '<tr class="hover:bg-surface-container-low/40">' +
        '<td class="px-4 py-3 font-semibold text-on-surface">' + escapeHtml(c.code) + '</td>' +
        '<td class="px-4 py-3 text-on-surface">' + escapeHtml(c.serie || '—') + '</td>' +
        '<td class="px-4 py-3 text-on-surface">' + escapeHtml(c.turno || '—') + '</td>' +
        '<td class="px-4 py-3">' + badge + '</td>' +
        '<td class="px-4 py-3 text-right">' +
        '<div class="inline-flex gap-2">' +
        '<button type="button" class="px-3 py-1.5 border border-border-subtle rounded-lg text-sm hover:bg-white" data-view-turma="' + escapeHtml(c.code) + '" title="Ver">' +
        '<span class="material-symbols-outlined text-[18px] align-middle">visibility</span> Ver PDF</button>' +
        '<button type="button" class="px-3 py-1.5 border border-border-subtle rounded-lg text-sm hover:bg-white" data-download-turma="' + escapeHtml(c.code) + '">' +
        '<span class="material-symbols-outlined text-[18px] align-middle">cloud_download</span> Baixar</button>' +
        '<button type="button" class="px-3 py-1.5 border border-red-200 text-error rounded-lg text-sm hover:bg-red-50" data-delete-turma="' + escapeHtml(c.code) + '">' +
        '<span class="material-symbols-outlined text-[18px] align-middle">delete</span> Excluir</button>' +
        '</div></td></tr>';
    }).join('');

    if (countEl) countEl.textContent = published + ' de ' + turmas.length + ' Publicados';
  }

  async function deleteTurmaBoletins(turma) {
    var ano = (document.getElementById('boletim-filter-ano') || {}).value || '2026';
    var bim = (document.getElementById('boletim-filter-bimestre') || {}).value || '1º Bimestre';
    if (!confirm('Excluir boletins publicados da turma ' + turma + ' (' + bim + ' / ' + ano + ')?')) return;
    await idbDeleteByTurma(turma, ano, bim);
    var st = getStatusMap();
    delete st[statusKey(turma, ano, bim)];
    saveStatusMap(st);
    var meta = getMetaMap();
    Object.keys(meta).forEach(function (k) {
      if (meta[k].turma === turma && meta[k].ano === ano && meta[k].bimestre === bim) delete meta[k];
    });
    saveMetaMap(meta);
    renderStatusTable();
    boletimToast('Boletins da turma removidos.', 'info');
  }

  async function handleUpload(file) {
    var turma = (document.getElementById('boletim-upload-turma') || {}).value;
    var ano = (document.getElementById('boletim-upload-ano') || {}).value || '2026';
    var bim = (document.getElementById('boletim-upload-bimestre') || {}).value || '1º Bimestre';
    var mode = (document.getElementById('boletim-match-mode') || {}).value || 'inep';
    if (!turma) {
      boletimToast('Selecione a turma de destino.', 'error');
      return;
    }
    if (!file || file.type !== 'application/pdf') {
      boletimToast('Envie um arquivo PDF da turma.', 'error');
      return;
    }
    try {
      var result = await splitAndSave(file, turma, ano, bim, mode);
      boletimToast('Gravados ' + result.saved + ' boletins. Turma marcada como Publicada.');
      // sync filters
      var fa = document.getElementById('boletim-filter-ano');
      var fb = document.getElementById('boletim-filter-bimestre');
      if (fa) fa.value = ano;
      if (fb) fb.value = bim;
      switchTab('status');
    } catch (err) {
      showProgress(false);
      console.error(err);
      boletimToast(err.message || 'Falha ao processar o PDF.', 'error');
    }
  }

  function bindUploadUi() {
    var zone = document.getElementById('boletim-dropzone');
    var input = document.getElementById('boletim-file-input');
    var nameEl = document.getElementById('boletim-file-name');
    if (!zone || !input) return;

    zone.addEventListener('click', function () { input.click(); });
    zone.addEventListener('dragover', function (e) {
      e.preventDefault();
      zone.classList.add('ring-2', 'ring-primary');
    });
    zone.addEventListener('dragleave', function () {
      zone.classList.remove('ring-2', 'ring-primary');
    });
    zone.addEventListener('drop', function (e) {
      e.preventDefault();
      zone.classList.remove('ring-2', 'ring-primary');
      var file = e.dataTransfer.files && e.dataTransfer.files[0];
      if (file) {
        if (nameEl) nameEl.textContent = file.name + ' (' + Math.round(file.size / 1024) + ' KB)';
        handleUpload(file);
      }
    });
    input.addEventListener('change', function () {
      var file = input.files && input.files[0];
      if (file) {
        if (nameEl) nameEl.textContent = file.name + ' (' + Math.round(file.size / 1024) + ' KB)';
        handleUpload(file);
      }
      input.value = '';
    });
  }

  function bindEvents() {
    document.querySelectorAll('[data-boletim-tab]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        switchTab(btn.getAttribute('data-boletim-tab'));
      });
    });

    ['boletim-filter-ano', 'boletim-filter-bimestre'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.addEventListener('change', renderStatusTable);
    });

    var tbody = document.getElementById('boletim-status-tbody');
    if (tbody) {
      tbody.addEventListener('click', function (e) {
        var del = e.target.closest('[data-delete-turma]');
        if (del) {
          deleteTurmaBoletins(del.getAttribute('data-delete-turma'));
          return;
        }
        var view = e.target.closest('[data-view-turma]');
        if (view) {
          switchTab('enviar');
          var sel = document.getElementById('boletim-upload-turma');
          if (sel) sel.value = view.getAttribute('data-view-turma');
          boletimToast('Abra o PDF da turma para republicar ou consulte na Ficha do Aluno.');
        }
        var dl = e.target.closest('[data-download-turma]');
        if (dl) {
          boletimToast('Baixe o boletim individual na Ficha do Aluno (Desempenho Acadêmico).');
        }
      });
    }

    bindUploadUi();
  }

  function initBoletinsPage() {
    if (typeof getClasses === 'function') getClasses();
    getStudents();
    populateTurmaSelect();
    bindEvents();
    switchTab('status');
  }

  /* ===== Ficha do aluno ===== */

  async function renderFichaBoletins(alunoId) {
    var box = document.getElementById('ficha-desempenho-list');
    if (!box) return;
    var list = await idbListByAluno(alunoId);
    // também inclui meta (caso blob falhe)
    var meta = getMetaMap();
    Object.keys(meta).forEach(function (k) {
      if (String(meta[k].alunoId) === String(alunoId) && !list.find(function (x) { return x.id === k; })) {
        list.push(Object.assign({ id: k }, meta[k]));
      }
    });
    list.sort(function (a, b) {
      return String(b.updatedAt || '').localeCompare(String(a.updatedAt || ''));
    });

    var title = document.getElementById('ficha-desempenho-title');
    if (title) {
      var years = list.map(function (x) { return x.ano; }).filter(Boolean);
      var y = years[0] || '2026';
      title.textContent = 'Desempenho Acadêmico (' + y + ')';
    }

    if (!list.length) {
      box.innerHTML = '<p class="text-body-md text-text-secondary italic py-4">Nenhum boletim publicado para este aluno ainda.</p>';
      return;
    }

    box.innerHTML = list.map(function (b) {
      return '<div class="flex items-center justify-between gap-4 py-4 border-b border-border-subtle last:border-0">' +
        '<div class="flex items-center gap-3 min-w-0">' +
        '<div class="w-10 h-10 rounded-lg bg-error/10 text-error flex items-center justify-center shrink-0">' +
        '<span class="material-symbols-outlined">picture_as_pdf</span></div>' +
        '<div class="min-w-0">' +
        '<p class="font-semibold text-body-md text-on-surface truncate">' + escapeHtml(b.fileName || ('Boletim ' + b.bimestre)) + '</p>' +
        '<p class="text-label-sm text-text-secondary">' + escapeHtml((b.bimestre || '') + ' · ' + (b.ano || '') + ' · Turma ' + (b.turma || '')) + '</p>' +
        '</div></div>' +
        '<div class="relative boletim-actions-dropdown shrink-0">' +
        '<button type="button" class="flex items-center gap-1 bg-surface-container hover:bg-primary hover:text-white px-4 py-2 rounded-lg text-label-md font-semibold transition-all" data-boletim-menu>' +
        '<span>Boletim</span><span class="material-symbols-outlined text-[18px]">expand_more</span></button>' +
        '<div class="dropdown-menu hidden absolute right-0 bottom-full mb-2 w-48 bg-white border border-border-subtle rounded-xl shadow-xl z-50 overflow-visible">' +
        '<button type="button" class="w-full px-4 py-2.5 text-body-md hover:bg-surface-container text-on-surface flex items-center gap-2 rounded-t-xl" data-view-boletim-id="' + escapeHtml(b.id) + '">' +
        '<span class="material-symbols-outlined text-[18px]">visibility</span> Ver</button>' +
        '<button type="button" class="w-full px-4 py-2.5 text-body-md hover:bg-surface-container text-on-surface flex items-center gap-2" data-print-boletim-id="' + escapeHtml(b.id) + '">' +
        '<span class="material-symbols-outlined text-[18px]">print</span> Imprimir</button>' +
        '<button type="button" class="w-full px-4 py-2.5 text-body-md hover:bg-surface-container text-on-surface flex items-center gap-2 rounded-b-xl border-t border-border-subtle" data-download-boletim-id="' + escapeHtml(b.id) + '">' +
        '<span class="material-symbols-outlined text-[18px]">download</span> Baixar PDF</button>' +
        '</div></div></div>';
    }).join('');
  }

  async function openBoletimPdf(id, mode) {
    var rec = await idbGet(id);
    if (!rec || !rec.blob) {
      boletimToast('Arquivo do boletim não encontrado.', 'error');
      return;
    }
    var blob = new Blob([rec.blob], { type: 'application/pdf' });
    var url = URL.createObjectURL(blob);
    if (mode === 'download') {
      var a = document.createElement('a');
      a.href = url;
      a.download = rec.fileName || 'boletim.pdf';
      a.click();
      setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
      return;
    }
    // view / print
    var w = window.open(url, '_blank');
    if (mode === 'print' && w) {
      setTimeout(function () {
        try { w.print(); } catch (e) {}
      }, 800);
    }
  }

  function bindFichaBoletins() {
    var box = document.getElementById('ficha-desempenho-list');
    if (!box) return;
    box.addEventListener('click', function (e) {
      var menuBtn = e.target.closest('[data-boletim-menu]');
      if (menuBtn) {
        e.stopPropagation();
        var menu = menuBtn.parentElement.querySelector('.dropdown-menu');
        document.querySelectorAll('.boletim-actions-dropdown .dropdown-menu').forEach(function (m) {
          if (m !== menu) m.classList.add('hidden');
        });
        if (menu) menu.classList.toggle('hidden');
        return;
      }
      var view = e.target.closest('[data-view-boletim-id]');
      if (view) { openBoletimPdf(view.getAttribute('data-view-boletim-id'), 'view'); return; }
      var printBtn = e.target.closest('[data-print-boletim-id]');
      if (printBtn) { openBoletimPdf(printBtn.getAttribute('data-print-boletim-id'), 'print'); return; }
      var dl = e.target.closest('[data-download-boletim-id]');
      if (dl) { openBoletimPdf(dl.getAttribute('data-download-boletim-id'), 'download'); }
    });
    document.addEventListener('click', function () {
      document.querySelectorAll('.boletim-actions-dropdown .dropdown-menu').forEach(function (m) {
        m.classList.add('hidden');
      });
    });
  }

  function initFichaBoletins() {
    var params = new URLSearchParams(window.location.search || '');
    var id = params.get('id') || '1';
    bindFichaBoletins();
    renderFichaBoletins(id);

    // Código INEP na ficha
    var students = getStudents();
    var student = students.find(function (s) { return String(s.id) === String(id); }) || students[0];
    var inepEl = document.getElementById('ficha-codigo-inep');
    if (inepEl && student) inepEl.textContent = student.codigoInep || '—';
    var cpfEl = document.getElementById('ficha-cpf');
    if (cpfEl && student) cpfEl.textContent = student.cpf || '—';
    var emailEl = document.getElementById('ficha-email');
    if (emailEl && student) emailEl.textContent = student.email || '—';
    var contatoEl = document.getElementById('ficha-contato');
    if (contatoEl && student) contatoEl.textContent = student.contato || '—';
    var senhaEl = document.getElementById('ficha-senha');
    if (senhaEl && student) {
      senhaEl.textContent = student.senha ? '•••••••• (definida)' : 'Não definida';
    }
  }

  window.initBoletinsPage = initBoletinsPage;
  window.initFichaBoletins = initFichaBoletins;
  window.renderFichaBoletins = renderFichaBoletins;
  window.openBoletimPdf = openBoletimPdf;

  document.addEventListener('DOMContentLoaded', function () {
    var path = (window.location.pathname || '').toLowerCase();
    if (path.indexOf('boletins.html') !== -1) initBoletinsPage();
    if (path.indexOf('fichadoaluno.html') !== -1) initFichaBoletins();
  });
})();
