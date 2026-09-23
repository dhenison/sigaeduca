/**
 * SIGA EDUCA — Informativos do Portal do Aluno (Gestão Escolar)
 * Admin cria/edita; o destino escolhe aluno, professor ou ambos.
 */
(function (global) {
  'use strict';

  var STORAGE_KEY = 'siga_portal_informativos';
  var MAX_IMAGE_BYTES = 900 * 1024;
  var editingId = null;
  var pendingImageData = null;

  function toast(msg, type) {
    var el = document.getElementById('inf-toast');
    if (!el) {
      if (typeof showToast === 'function') showToast(msg, type || 'success');
      else alert(msg);
      return;
    }
    el.textContent = msg;
    el.setAttribute('data-type', type || 'success');
    el.classList.remove('hidden');
    clearTimeout(el._timer);
    el._timer = setTimeout(function () { el.classList.add('hidden'); }, 3200);
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function uid() {
    return 'inf-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
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
    toast('Acesso restrito a gestores escolares (Diretor e Vice-diretores).', 'erro');
    setTimeout(function () { window.location.href = 'painelprincipal.html'; }, 700);
    return false;
  }

  function getActiveSchoolId() {
    try {
      var fromLs = localStorage.getItem('siga_active_school') || '';
      if (fromLs) return fromLs;
      var session = getSession();
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
    var session = getSession();
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
      return getActiveSchoolId() || '';
    }).catch(function () { return getActiveSchoolId() || ''; });
  }

  function getSupabaseClient() {
    if (global.SigaSupabase && typeof global.SigaSupabase.getClient === 'function') {
      try { return global.SigaSupabase.getClient(); } catch (e) { return null; }
    }
    return null;
  }

  function ensureSupabaseAuth() {
    var sb = getSupabaseClient();
    if (!sb || !sb.auth || typeof sb.auth.getSession !== 'function') {
      return Promise.resolve({ ok: false, reason: 'no_cloud', sb: null });
    }
    return sb.auth.getSession().then(function (res) {
      var session = res && res.data ? res.data.session : null;
      if (!session) return { ok: false, reason: 'no_auth', sb: sb };
      return { ok: true, sb: sb, session: session };
    }).catch(function () {
      return { ok: false, reason: 'no_auth', sb: sb };
    });
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

  function formatDateBr(iso) {
    if (!iso) return '—';
    var d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
  }

  function statusLabel(st) {
    if (st === 'rascunho') return 'Rascunho';
    if (st === 'arquivado') return 'Arquivado';
    return 'Publicado';
  }

  function layoutLabel(layout) {
    var map = {
      texto: 'Somente texto',
      imagem: 'Somente imagem',
      texto_imagem: 'Texto → imagem',
      imagem_texto: 'Imagem → texto'
    };
    return map[layout] || layout;
  }

  function getTurmasOptions() {
    var codes = {};
    try {
      var students = JSON.parse(localStorage.getItem('siga_students') || '[]');
      (students || []).forEach(function (s) {
        var c = String((s && (s.turma || s.class_code || s.classCode)) || '').trim();
        if (c) codes[c] = true;
      });
    } catch (e) { /* ignore */ }
    try {
      var turmas = JSON.parse(localStorage.getItem('siga_turmas') || '[]');
      (turmas || []).forEach(function (t) {
        var c = String((t && (t.codigo || t.code || t.nome || t.name)) || '').trim();
        if (c) codes[c] = true;
      });
    } catch (e2) { /* ignore */ }
    return Object.keys(codes).sort(function (a, b) {
      return a.localeCompare(b, 'pt-BR');
    });
  }

  function compressImageFile(file) {
    return new Promise(function (resolve, reject) {
      if (!file || !/^image\//.test(file.type || '')) {
        reject(new Error('Selecione uma imagem (JPG ou PNG).'));
        return;
      }
      var reader = new FileReader();
      reader.onerror = function () { reject(new Error('Falha ao ler a imagem.')); };
      reader.onload = function () {
        var img = new Image();
        img.onerror = function () { reject(new Error('Imagem inválida.')); };
        img.onload = function () {
          var maxW = 1000;
          var scale = img.width > maxW ? maxW / img.width : 1;
          var w = Math.round(img.width * scale);
          var h = Math.round(img.height * scale);
          var canvas = document.createElement('canvas');
          canvas.width = w;
          canvas.height = h;
          var ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, w, h);
          var quality = 0.78;
          var dataUrl = canvas.toDataURL('image/jpeg', quality);
          while (dataUrl.length > MAX_IMAGE_BYTES * 1.37 && quality > 0.45) {
            quality -= 0.08;
            dataUrl = canvas.toDataURL('image/jpeg', quality);
          }
          if (dataUrl.length > MAX_IMAGE_BYTES * 1.37) {
            reject(new Error('Imagem ainda grande demais após compressão. Use outra foto.'));
            return;
          }
          resolve(dataUrl);
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

  function syncCloud(item) {
    return ensureSupabaseAuth().then(function (auth) {
      if (!auth.ok || !auth.sb) {
        return { ok: false, reason: auth.reason || 'no_auth', message: 'Faça login novamente para sincronizar.' };
      }
      return resolveSchoolIdAsync().then(function (schoolId) {
        if (!schoolId) return { ok: false, reason: 'no_school', message: 'Escola não vinculada.' };
        var row = {
          school_id: schoolId,
          local_id: item.id,
          title: item.title,
          body_text: item.bodyText || null,
          image_data: item.imageData || null,
          layout: item.layout || 'texto_imagem',
          audience: item.audience || 'todos',
          destinatario: item.destinatario || 'alunos',
          class_codes: item.classCodes || [],
          status: item.status || 'publicado',
          published_at: item.publishedAt || null,
          expires_at: item.expiresAt || null,
          created_by_name: item.createdBy || null,
          created_at: item.createdAt || new Date().toISOString(),
          video_url: item.videoUrl || null,
          aula_dados: item.aulaDados || null,
          enem_digital: !!item.enemDigital
        };
        return auth.sb.from('portal_informativos')
          .upsert(row, { onConflict: 'school_id,local_id' })
          .then(function (res) {
            if (res.error) {
              console.warn('[SIGA] upsert portal_informativos:', res.error.message);
              return { ok: false, message: res.error.message };
            }
            return { ok: true, schoolId: schoolId };
          });
      });
    }).catch(function (err) {
      return { ok: false, message: (err && err.message) || 'erro sync' };
    });
  }

  function deleteCloud(localId) {
    return ensureSupabaseAuth().then(function (auth) {
      if (!auth.ok || !auth.sb) return { ok: true };
      return resolveSchoolIdAsync().then(function (schoolId) {
        if (!schoolId || !localId) return { ok: true };
        return auth.sb.from('portal_informativos')
          .delete()
          .eq('school_id', schoolId)
          .eq('local_id', localId)
          .then(function (res) {
            if (res.error) return { ok: false, message: res.error.message };
            return { ok: true };
          });
      });
    }).catch(function (err) {
      return { ok: false, message: (err && err.message) || 'erro' };
    });
  }

  function mapCloudRow(row) {
    if (!row) return null;
    return {
      id: row.local_id,
      title: row.title || '',
      bodyText: row.body_text || '',
      imageData: row.image_data || '',
      layout: row.layout || 'texto_imagem',
      audience: row.audience || 'todos',
      destinatario: row.destinatario || 'alunos',
      classCodes: Array.isArray(row.class_codes) ? row.class_codes : [],
      status: row.status || 'publicado',
      publishedAt: row.published_at || null,
      expiresAt: row.expires_at || null,
      createdBy: row.created_by_name || '',
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      videoUrl: row.video_url || '',
      aulaDados: row.aula_dados || '',
      enemDigital: row.enem_digital === true
    };
  }

  function loadFromCloud() {
    return ensureSupabaseAuth().then(function (auth) {
      if (!auth.ok || !auth.sb) return { ok: false };
      return resolveSchoolIdAsync().then(function (schoolId) {
        if (!schoolId) return { ok: false, reason: 'no_school' };
        return auth.sb.from('portal_informativos')
          .select('*')
          .eq('school_id', schoolId)
          .order('created_at', { ascending: false })
          .then(function (res) {
            if (res.error) {
              console.warn('[SIGA] list portal_informativos:', res.error.message);
              return { ok: false, message: res.error.message };
            }
            var cloud = (res.data || []).map(mapCloudRow).filter(Boolean);
            var map = {};
            getList().forEach(function (d) { if (d && d.id) map[d.id] = d; });
            cloud.forEach(function (d) { if (d && d.id) map[d.id] = d; });
            var merged = Object.keys(map).map(function (k) { return map[k]; }).sort(function (a, b) {
              return String(b.createdAt || '').localeCompare(String(a.createdAt || ''));
            });
            saveList(merged);
            return { ok: true, count: merged.length };
          });
      });
    }).catch(function () { return { ok: false }; });
  }

  function renderKpis(list) {
    var pub = list.filter(function (i) { return i.status === 'publicado'; }).length;
    var draft = list.filter(function (i) { return i.status === 'rascunho'; }).length;
    var elT = document.getElementById('kpi-inf-total');
    var elP = document.getElementById('kpi-inf-pub');
    var elD = document.getElementById('kpi-inf-draft');
    if (elT) elT.textContent = String(list.length);
    if (elP) elP.textContent = String(pub);
    if (elD) elD.textContent = String(draft);
  }

  function renderList() {
    var list = getList();
    var filter = (document.getElementById('inf-filter-status') || {}).value || '';
    var filtered = list.filter(function (i) {
      return !filter || i.status === filter;
    });
    renderKpis(list);
    var box = document.getElementById('inf-list');
    var empty = document.getElementById('inf-empty');
    if (!box) return;
    if (!filtered.length) {
      box.innerHTML = '';
      if (empty) empty.classList.remove('hidden');
      return;
    }
    if (empty) empty.classList.add('hidden');
    box.innerHTML = filtered.map(function (item) {
      var badge =
        item.status === 'publicado'
          ? 'bg-emerald-100 text-emerald-800'
          : item.status === 'rascunho'
            ? 'bg-amber-100 text-amber-800'
            : 'bg-slate-100 text-slate-600';
      var thumb = item.imageData
        ? '<img src="' + escapeHtml(item.imageData) + '" alt="" class="w-16 h-16 rounded-xl object-cover border border-border-subtle"/>'
        : '<div class="w-16 h-16 rounded-xl bg-primary/10 text-primary flex items-center justify-center"><span class="material-symbols-outlined">campaign</span></div>';
      return (
        '<article class="bg-white border border-border-subtle rounded-2xl p-4 custom-shadow flex gap-4">' +
        thumb +
        '<div class="min-w-0 flex-1">' +
        '<div class="flex flex-wrap items-center gap-2">' +
        '<h3 class="text-headline-sm text-on-surface truncate">' + escapeHtml(item.title) + '</h3>' +
        '<span class="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ' + badge + '">' +
        escapeHtml(statusLabel(item.status)) + '</span></div>' +
        '<p class="text-label-md text-text-secondary mt-1">' + escapeHtml(layoutLabel(item.layout)) +
        ' · ' + escapeHtml(destinoLabel(item.destinatario)) +
        (item.enemDigital ? ' · Enem Pará Digital' : '') +
        (item.destinatario !== 'professores' && item.audience === 'turmas'
          ? (' · Turmas: ' + escapeHtml((item.classCodes || []).join(', ') || '—'))
          : '') +
        '</p>' +
        '<p class="text-[11px] text-text-secondary mt-1">' + escapeHtml(item.createdBy || '') +
        ' · ' + escapeHtml(formatDateBr(item.publishedAt || item.createdAt)) + '</p>' +
        '<div class="flex flex-wrap gap-2 mt-3">' +
        '<button type="button" class="px-3 py-1.5 rounded-lg border border-border-subtle text-label-md font-semibold" data-inf-edit="' +
        escapeHtml(item.id) + '">Editar</button>' +
        (item.status !== 'publicado'
          ? '<button type="button" class="px-3 py-1.5 rounded-lg bg-primary text-white text-label-md font-semibold" data-inf-pub="' +
            escapeHtml(item.id) + '">Publicar</button>'
          : '<button type="button" class="px-3 py-1.5 rounded-lg border border-border-subtle text-label-md font-semibold" data-inf-arch="' +
            escapeHtml(item.id) + '">Arquivar</button>') +
        '<button type="button" class="px-3 py-1.5 rounded-lg text-error text-label-md font-semibold" data-inf-del="' +
        escapeHtml(item.id) + '">Excluir</button>' +
        '</div></div></article>'
      );
    }).join('');

    box.querySelectorAll('[data-inf-edit]').forEach(function (btn) {
      btn.addEventListener('click', function () { openModal(btn.getAttribute('data-inf-edit')); });
    });
    box.querySelectorAll('[data-inf-del]').forEach(function (btn) {
      btn.addEventListener('click', function () { removeItem(btn.getAttribute('data-inf-del')); });
    });
    box.querySelectorAll('[data-inf-pub]').forEach(function (btn) {
      btn.addEventListener('click', function () { setStatus(btn.getAttribute('data-inf-pub'), 'publicado'); });
    });
    box.querySelectorAll('[data-inf-arch]').forEach(function (btn) {
      btn.addEventListener('click', function () { setStatus(btn.getAttribute('data-inf-arch'), 'arquivado'); });
    });
  }

  function fillTurmaCheckboxes(selected) {
    var host = document.getElementById('inf-turmas');
    if (!host) return;
    var opts = getTurmasOptions();
    var sel = selected || [];
    if (!opts.length) {
      host.innerHTML = '<p class="text-label-md text-text-secondary">Nenhuma turma encontrada no cadastro local. Digite os códigos abaixo.</p>';
      return;
    }
    host.innerHTML = opts.map(function (code) {
      var checked = sel.indexOf(code) >= 0 ? ' checked' : '';
      return (
        '<label class="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-border-subtle bg-white text-label-md">' +
        '<input type="checkbox" class="inf-turma-cb rounded border-border-subtle text-primary" value="' +
        escapeHtml(code) + '"' + checked + '/>' +
        escapeHtml(code) + '</label>'
      );
    }).join('');
  }

  function openModal(id) {
    editingId = id || null;
    pendingImageData = null;
    var item = id ? getList().find(function (x) { return x.id === id; }) : null;
    var titleEl = document.getElementById('inf-modal-title');
    if (titleEl) titleEl.textContent = item ? 'Editar informativo' : 'Novo informativo';

    document.getElementById('inf-title').value = item ? item.title : '';
    document.getElementById('inf-body').value = item ? (item.bodyText || '') : '';
    document.getElementById('inf-layout').value = item ? (item.layout || 'texto_imagem') : 'texto_imagem';
    document.getElementById('inf-status').value = item ? (item.status || 'publicado') : 'publicado';
    document.getElementById('inf-destino').value = item ? (item.destinatario || 'alunos') : 'alunos';
    document.getElementById('inf-audience').value = item ? (item.audience || 'todos') : 'todos';
    document.getElementById('inf-expires').value = item && item.expiresAt
      ? String(item.expiresAt).slice(0, 16)
      : '';
    document.getElementById('inf-turmas-extra').value = '';
    var enemEl = document.getElementById('inf-enem');
    if (enemEl) enemEl.checked = !!(item && item.enemDigital);
    var videoEl = document.getElementById('inf-video');
    if (videoEl) videoEl.value = item ? (item.videoUrl || '') : '';
    var dadosEl = document.getElementById('inf-aula-dados');
    if (dadosEl) dadosEl.value = item ? (item.aulaDados || '') : '';
    toggleEnemFields();
    pendingImageData = item && item.imageData ? item.imageData : null;
    updateImagePreview();
    fillTurmaCheckboxes(item ? item.classCodes : []);
    toggleAudienceUi();
    var modal = document.getElementById('inf-modal');
    if (modal) {
      modal.classList.remove('hidden');
      modal.classList.add('flex');
    }
  }

  function closeModal() {
    var modal = document.getElementById('inf-modal');
    if (modal) {
      modal.classList.add('hidden');
      modal.classList.remove('flex');
    }
    editingId = null;
    pendingImageData = null;
  }

  function updateImagePreview() {
    var wrap = document.getElementById('inf-image-preview-wrap');
    var img = document.getElementById('inf-image-preview');
    var name = document.getElementById('inf-image-name');
    if (!wrap || !img) return;
    if (pendingImageData) {
      wrap.classList.remove('hidden');
      img.src = pendingImageData;
      if (name) name.textContent = 'Imagem anexada';
    } else {
      wrap.classList.add('hidden');
      img.removeAttribute('src');
      if (name) name.textContent = 'Nenhuma imagem';
    }
  }

  function destinoLabel(value) {
    if (value === 'professores') return 'Professores';
    if (value === 'ambos') return 'Alunos e professores';
    return 'Alunos';
  }

  function destinoValue() {
    var el = document.getElementById('inf-destino');
    var value = el ? String(el.value || 'alunos') : 'alunos';
    return value === 'professores' || value === 'ambos' ? value : 'alunos';
  }

  function isYoutubeUrl(value) {
    return /(?:youtu\.be\/|youtube(?:-nocookie)?\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/))[A-Za-z0-9_-]{11}/.test(String(value || ''));
  }

  function toggleEnemFields() {
    var box = document.getElementById('inf-enem');
    var fields = document.getElementById('inf-enem-fields');
    if (fields) fields.classList.toggle('hidden', !(box && box.checked));
  }

  function toggleAudienceUi() {
    var destino = destinoValue();
    var aud = document.getElementById('inf-audience');
    var wrap = document.getElementById('inf-turmas-wrap');
    var audienceWrap = document.getElementById('inf-audience-wrap');
    var forStudents = destino !== 'professores';
    if (audienceWrap) audienceWrap.classList.toggle('hidden', !forStudents);
    if (!forStudents && aud) aud.value = 'todos';
    if (wrap) wrap.classList.toggle('hidden', !forStudents || !aud || aud.value !== 'turmas');
  }

  function collectClassCodes() {
    var codes = [];
    document.querySelectorAll('.inf-turma-cb:checked').forEach(function (cb) {
      codes.push(cb.value);
    });
    var extra = String((document.getElementById('inf-turmas-extra') || {}).value || '');
    extra.split(/[,;\n]+/).forEach(function (part) {
      var c = part.trim();
      if (c && codes.indexOf(c) < 0) codes.push(c);
    });
    return codes;
  }

  function saveItem(ev) {
    if (ev) ev.preventDefault();
    var title = String((document.getElementById('inf-title') || {}).value || '').trim();
    var bodyText = String((document.getElementById('inf-body') || {}).value || '').trim();
    var layout = String((document.getElementById('inf-layout') || {}).value || 'texto_imagem');
    var status = String((document.getElementById('inf-status') || {}).value || 'publicado');
    var destinatario = destinoValue();
    var audience = destinatario === 'professores'
      ? 'todos'
      : String((document.getElementById('inf-audience') || {}).value || 'todos');
    var expiresRaw = String((document.getElementById('inf-expires') || {}).value || '').trim();
    var classCodes = audience === 'turmas' ? collectClassCodes() : [];
    var enem = !!(document.getElementById('inf-enem') && document.getElementById('inf-enem').checked);
    var videoUrl = String((document.getElementById('inf-video') || {}).value || '').trim();
    var aulaDados = String((document.getElementById('inf-aula-dados') || {}).value || '').trim();

    if (!title) {
      toast('Informe o título.', 'erro');
      return;
    }
    if (enem && !isYoutubeUrl(videoUrl)) {
      toast('Informe o link do YouTube da aula.', 'erro');
      return;
    }
    if (!enem) {
      if (layout === 'texto' && !bodyText) {
        toast('Informe o texto do informativo.', 'erro');
        return;
      }
      if (layout === 'imagem' && !pendingImageData) {
        toast('Anexe uma imagem.', 'erro');
        return;
      }
      if ((layout === 'texto_imagem' || layout === 'imagem_texto') && !bodyText && !pendingImageData) {
        toast('Informe texto e/ou imagem.', 'erro');
        return;
      }
      if (!bodyText && !pendingImageData) {
        toast('Inclua texto ou imagem.', 'erro');
        return;
      }
    }
    if (audience === 'turmas' && !classCodes.length) {
      toast('Selecione ao menos uma turma.', 'erro');
      return;
    }

    var list = getList();
    var now = new Date().toISOString();
    var prev = editingId ? list.find(function (x) { return x.id === editingId; }) : null;
    var item = {
      id: editingId || uid(),
      title: title,
      bodyText: bodyText,
      imageData: pendingImageData || '',
      layout: layout,
      audience: audience,
      destinatario: destinatario,
      classCodes: classCodes,
      status: status,
      publishedAt: status === 'publicado'
        ? ((prev && prev.publishedAt) || now)
        : (prev && prev.publishedAt) || null,
      expiresAt: expiresRaw ? new Date(expiresRaw).toISOString() : null,
      createdBy: (prev && prev.createdBy) || sessionUserName(),
      createdAt: (prev && prev.createdAt) || now,
      updatedAt: now,
      videoUrl: enem ? videoUrl : '',
      aulaDados: enem ? aulaDados : '',
      enemDigital: enem
    };

    if (editingId) {
      list = list.map(function (x) { return x.id === editingId ? item : x; });
    } else {
      list.unshift(item);
    }
    saveList(list);
    closeModal();
    renderList();
    toast(status === 'publicado' ? 'Informativo salvo e publicado no portal.' : 'Informativo salvo.');

    syncCloud(item).then(function (res) {
      if (!res.ok) {
        toast((res.message || 'Salvo localmente. Sincronização com a nuvem pendente.'), 'alerta');
      }
    });
  }

  function setStatus(id, status) {
    var list = getList();
    var item = null;
    list = list.map(function (x) {
      if (x.id !== id) return x;
      item = Object.assign({}, x, {
        status: status,
        publishedAt: status === 'publicado' ? (x.publishedAt || new Date().toISOString()) : x.publishedAt,
        updatedAt: new Date().toISOString()
      });
      return item;
    });
    if (!item) return;
    saveList(list);
    renderList();
    syncCloud(item).then(function (res) {
      if (!res.ok) toast(res.message || 'Atualizado localmente.', 'alerta');
      else toast(status === 'publicado' ? 'Publicado no portal.' : 'Arquivado.');
    });
  }

  function removeItem(id) {
    if (!confirm('Excluir este informativo? Ele deixará de aparecer no aplicativo.')) return;
    saveList(getList().filter(function (x) { return x.id !== id; }));
    renderList();
    deleteCloud(id).then(function (res) {
      if (!res.ok) toast(res.message || 'Excluído localmente.', 'alerta');
      else toast('Informativo excluído.');
    });
  }

  function bindUi() {
    var btnNew = document.getElementById('inf-btn-new');
    if (btnNew) btnNew.addEventListener('click', function () { openModal(null); });

    var btnClose = document.getElementById('inf-btn-close');
    if (btnClose) btnClose.addEventListener('click', closeModal);
    var btnCancel = document.getElementById('inf-btn-cancel');
    if (btnCancel) btnCancel.addEventListener('click', closeModal);

    var form = document.getElementById('inf-form');
    if (form) form.addEventListener('submit', saveItem);

    var aud = document.getElementById('inf-audience');
    if (aud) aud.addEventListener('change', toggleAudienceUi);
    var destino = document.getElementById('inf-destino');
    if (destino) destino.addEventListener('change', toggleAudienceUi);
    var enemBox = document.getElementById('inf-enem');
    if (enemBox) enemBox.addEventListener('change', toggleEnemFields);

    var filter = document.getElementById('inf-filter-status');
    if (filter) filter.addEventListener('change', renderList);

    var file = document.getElementById('inf-image');
    if (file) {
      file.addEventListener('change', function () {
        var f = file.files && file.files[0];
        if (!f) return;
        compressImageFile(f).then(function (dataUrl) {
          pendingImageData = dataUrl;
          updateImagePreview();
          toast('Imagem anexada.');
        }).catch(function (err) {
          toast((err && err.message) || 'Falha na imagem.', 'erro');
        });
      });
    }

    var btnClearImg = document.getElementById('inf-btn-clear-image');
    if (btnClearImg) {
      btnClearImg.addEventListener('click', function () {
        pendingImageData = null;
        var inp = document.getElementById('inf-image');
        if (inp) inp.value = '';
        updateImagePreview();
      });
    }

    var modal = document.getElementById('inf-modal');
    if (modal) {
      modal.addEventListener('click', function (e) {
        if (e.target === modal) closeModal();
      });
    }
  }

  function init() {
    if (!ensureAccess()) return;
    bindUi();
    renderList();
    loadFromCloud().then(function () { renderList(); });
  }

  global.SigaInformativos = {
    init: init,
    openModal: openModal,
    closeModal: closeModal
  };

  document.addEventListener('DOMContentLoaded', init);
})(window);
