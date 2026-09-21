/**
 * SIGA EDUCA — Informativos no Portal do Aluno (somente leitura)
 */
(function (global) {
  'use strict';

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function formatDateBr(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  function getClient() {
    if (global.SigaSupabase && typeof global.SigaSupabase.getClient === 'function') {
      try { return global.SigaSupabase.getClient(); } catch (e) { return null; }
    }
    return null;
  }

  function fetchInformativos(studentId) {
    var sb = getClient();
    if (!sb || !studentId) return Promise.resolve([]);
    return sb.rpc('student_portal_informativos', { p_student_id: studentId })
      .then(function (res) {
        if (res.error) {
          console.warn('[Portal] informativos:', res.error.message);
          return [];
        }
        var data = res.data;
        if (typeof data === 'string') {
          try { data = JSON.parse(data); } catch (e) { data = []; }
        }
        return Array.isArray(data) ? data : [];
      })
      .catch(function (err) {
        console.warn('[Portal] informativos fetch:', err);
        return [];
      });
  }

  function renderCard(item, compact) {
    var layout = item.layout || 'texto_imagem';
    var hasText = !!(item.body_text && String(item.body_text).trim());
    var hasImg = !!(item.image_data && String(item.image_data).trim());
    var date = formatDateBr(item.published_at);
    var textBlock = hasText
      ? '<p class="text-sm text-on-surface/90 leading-relaxed whitespace-pre-wrap">' +
        escapeHtml(item.body_text) + '</p>'
      : '';
    var imgBlock = hasImg
      ? '<img src="' + escapeHtml(item.image_data) + '" alt="" class="w-full rounded-xl object-cover max-h-64 border border-border-subtle/60"/>'
      : '';

    var body = '';
    if (layout === 'imagem' && hasImg) body = imgBlock;
    else if (layout === 'texto' && hasText) body = textBlock;
    else if (layout === 'imagem_texto') body = [imgBlock, textBlock].filter(Boolean).join('<div class="h-3"></div>');
    else body = [textBlock, imgBlock].filter(Boolean).join('<div class="h-3"></div>');

    if (compact) {
      var preview = hasText
        ? escapeHtml(String(item.body_text).trim().slice(0, 110)) + (String(item.body_text).trim().length > 110 ? '…' : '')
        : (hasImg ? 'Informativo com imagem' : '');
      return (
        '<a href="app/appinformativos.html" class="block bg-surface border border-border-subtle rounded-2xl p-4 shadow-sm hover:border-primary/30 transition-colors">' +
        '<div class="flex gap-3">' +
        (hasImg
          ? '<img src="' + escapeHtml(item.image_data) + '" alt="" class="w-16 h-16 rounded-xl object-cover shrink-0"/>'
          : '<div class="w-16 h-16 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0"><span class="material-symbols-outlined">campaign</span></div>') +
        '<div class="min-w-0 flex-1">' +
        '<p class="text-[10px] font-bold uppercase tracking-wide text-primary">Informativo</p>' +
        '<p class="font-semibold text-on-surface mt-0.5 line-clamp-2">' + escapeHtml(item.title || 'Aviso') + '</p>' +
        (preview ? '<p class="text-[12px] text-text-secondary mt-1 line-clamp-2">' + preview + '</p>' : '') +
        (date ? '<p class="text-[11px] text-text-secondary mt-1">' + escapeHtml(date) + '</p>' : '') +
        '</div></div></a>'
      );
    }

    return (
      '<article class="bg-surface border border-border-subtle rounded-2xl p-5 shadow-sm space-y-3">' +
      '<div class="flex items-start justify-between gap-2">' +
      '<div><p class="text-[10px] font-bold uppercase tracking-wide text-primary">Informativo da escola</p>' +
      '<h2 class="font-display font-bold text-lg text-on-surface mt-0.5">' + escapeHtml(item.title || 'Aviso') + '</h2></div>' +
      '<span class="material-symbols-outlined text-primary text-[28px]">campaign</span></div>' +
      body +
      '<p class="text-[11px] text-text-secondary">' +
      (date ? escapeHtml(date) : '') +
      (item.created_by_name ? (date ? ' · ' : '') + escapeHtml(item.created_by_name) : '') +
      '</p></article>'
    );
  }

  function updateHomePreview(list) {
    var preview = document.getElementById('portal-informes-preview');
    var count = document.getElementById('portal-informes-count');
    var notif = document.getElementById('portal-notif-badge');
    var n = list && list.length ? list.length : 0;
    if (preview) {
      preview.textContent = n
        ? (list[0].title || 'Novo informativo')
        : 'Fique por dentro das novidades, comunicados e avisos da escola.';
    }
    if (count) {
      count.hidden = !n;
      count.style.display = n ? 'inline-flex' : 'none';
      count.textContent = n ? String(n) : '';
    }
    if (notif) {
      notif.hidden = !n;
      notif.style.display = n ? 'inline-flex' : 'none';
      notif.textContent = n ? String(n) : '';
    }
  }

  function renderHome(list) {
    updateHomePreview(list);
    var host = document.getElementById('portal-informativos-home');
    if (!host) return;
    if (document.getElementById('portal-informes-preview')) {
      host.classList.add('hidden');
      host.innerHTML = '';
      return;
    }
    if (!list.length) {
      host.classList.add('hidden');
      host.innerHTML = '';
      return;
    }
    host.classList.remove('hidden');
    var top = list.slice(0, 3);
    host.innerHTML =
      '<div class="flex items-center justify-between gap-2 mb-3">' +
      '<h2 class="font-display font-bold text-lg">Informativos</h2>' +
      '<a href="app/appinformativos.html" class="text-label-md font-semibold text-primary inline-flex items-center gap-1">' +
      'Ver todos <span class="material-symbols-outlined text-[16px]">chevron_right</span></a></div>' +
      '<div class="space-y-3">' + top.map(function (i) { return renderCard(i, true); }).join('') + '</div>';
  }

  function renderFull(list) {
    var host = document.getElementById('portal-informativos-list');
    var empty = document.getElementById('portal-informativos-empty');
    if (!host) return;
    if (!list.length) {
      host.innerHTML = '';
      if (empty) empty.classList.remove('hidden');
      return;
    }
    if (empty) empty.classList.add('hidden');
    host.innerHTML = list.map(function (i) { return renderCard(i, false); }).join('');
  }

  function bootHome(ctx) {
    var studentId = ctx && ctx.student && (ctx.student.id || ctx.session && ctx.session.id);
    if (!studentId && ctx && ctx.session) studentId = ctx.session.id;
    if (!studentId) return Promise.resolve();
    return fetchInformativos(studentId).then(function (list) {
      renderHome(list);
      try {
        sessionStorage.setItem('siga_portal_informativos_cache', JSON.stringify(list));
      } catch (e) { /* ignore */ }
    });
  }

  function bootPage(ctx) {
    var studentId = ctx && ctx.student && ctx.student.id;
    if (!studentId && ctx && ctx.session) studentId = ctx.session.id;
    var cached = [];
    try {
      cached = JSON.parse(sessionStorage.getItem('siga_portal_informativos_cache') || '[]') || [];
    } catch (e) { cached = []; }
    if (cached.length) renderFull(cached);
    if (!studentId) {
      renderFull(cached);
      return Promise.resolve();
    }
    return fetchInformativos(studentId).then(function (list) {
      renderFull(list);
      try {
        sessionStorage.setItem('siga_portal_informativos_cache', JSON.stringify(list));
      } catch (e) { /* ignore */ }
    });
  }

  global.SigaPortalInformativos = {
    bootHome: bootHome,
    bootPage: bootPage,
    fetchInformativos: fetchInformativos
  };
})(window);
