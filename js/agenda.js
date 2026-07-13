/**
 * SIGA Educa — Agenda Escolar 2026
 * localStorage: siga_agenda_events
 * Escopo: geral (todas as turmas) ou turmas específicas (uma ou mais)
 */
(function () {
  'use strict';

  var STORAGE_KEY = 'siga_agenda_events';
  var MONTHS = [
    'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
  ];
  var MONTHS_SHORT = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ'];
  var TURNOS = ['Manhã', 'Tarde', 'Noite'];

  var state = {
    year: 2026,
    month: new Date().getFullYear() === 2026 ? new Date().getMonth() : 0, // 0-11
    filterTurma: '',
    filterTurno: '',
    filterTurmaLabel: '',
    filterTipo: '',
    editingId: null
  };

  function uid() {
    return 'ag_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7);
  }

  function todayISO() {
    return new Date().toISOString().slice(0, 10);
  }

  function formatDateBr(iso) {
    if (!iso) return '—';
    var p = String(iso).slice(0, 10).split('-');
    if (p.length !== 3) return iso;
    return p[2] + '/' + p[1] + '/' + p[0];
  }

  function escapeHtml(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function getEvents() {
    try {
      var list = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]') || [];
      return list.map(normalizeEvent);
    } catch (e) {
      return [];
    }
  }

  function saveEvents(list) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list || []));
  }

  function normalizeEvent(evt) {
    var e = Object.assign({}, evt);
    if (!e.id) e.id = uid();
    if (e.scope !== 'turmas') e.scope = 'geral';
    if (!Array.isArray(e.turmas)) e.turmas = [];
    e.turmas = e.turmas.map(String);
    return e;
  }

  function getTurmas() {
    try {
      if (typeof getClasses === 'function') return getClasses() || [];
      return JSON.parse(localStorage.getItem('siga_classes') || '[]') || [];
    } catch (e) {
      return [];
    }
  }

  function turmaLabel(cls) {
    if (!cls) return '—';
    var code = cls.code || '';
    var serie = cls.serie || '';
    return code + (serie ? ' - ' + serie : '');
  }

  function turmasByTurno() {
    var map = { 'Manhã': [], 'Tarde': [], 'Noite': [] };
    getTurmas().forEach(function (c) {
      var t = c.turno || 'Manhã';
      if (!map[t]) map[t] = [];
      map[t].push(c);
    });
    Object.keys(map).forEach(function (k) {
      map[k].sort(function (a, b) {
        return String(a.code || '').localeCompare(String(b.code || ''));
      });
    });
    return map;
  }

  function getTypeStyle(type) {
    switch (type) {
      case 'Provas & Testes':
        return { bg: 'bg-primary/10', text: 'text-primary', border: 'border-primary' };
      case 'Entrega de Trabalho':
        return { bg: 'bg-primary-light/30', text: 'text-on-primary-container', border: 'border-primary-light' };
      case 'Reunião de Pais':
        return { bg: 'bg-secondary/10', text: 'text-secondary', border: 'border-secondary' };
      case 'Evento Escolar':
        return { bg: 'bg-tertiary/10', text: 'text-tertiary', border: 'border-tertiary' };
      case 'Feriado / Recesso':
        return { bg: 'bg-error/10', text: 'text-error', border: 'border-error' };
      default:
        return { bg: 'bg-primary/10', text: 'text-primary', border: 'border-primary' };
    }
  }

  /**
   * Regras de visibilidade:
   * - Sem turma filtrada ("Todas as turmas"): mostra tudo.
   * - Com turma filtrada: mostra atividades GLOBAIS (Agenda Geral)
   *   + atividades atribuídas especificamente a essa turma.
   * - Atividades de outras turmas NÃO aparecem.
   */
  function eventMatchesFilters(evt) {
    if (!evt) return false;
    if (state.filterTipo && evt.type !== state.filterTipo) return false;

    var selected = String(state.filterTurma || '').trim();
    if (!selected) return true; // Todas as turmas

    // Atividades globais sempre aparecem para qualquer turma
    if (isGlobalEvent(evt)) return true;

    // Apenas se a turma selecionada estiver na lista da atividade
    var turmas = (evt.turmas || []).map(function (t) { return String(t).trim(); });
    return turmas.indexOf(selected) !== -1;
  }

  function isGlobalEvent(evt) {
    if (!evt) return false;
    if (evt.scope === 'geral') return true;
    // Sem escopo de turmas (ou lista vazia) = agenda geral
    if (evt.scope !== 'turmas') return true;
    return !evt.turmas || !evt.turmas.length;
  }

  function eventsForDay(isoDate) {
    return getEvents().filter(function (e) {
      return e.date === isoDate && eventMatchesFilters(e);
    });
  }

  function showAgendaToast(msg, type) {
    type = type || 'success';
    var el = document.getElementById('agenda-toast');
    if (!el) {
      if (typeof showToast === 'function') showToast(msg, type);
      else alert(msg);
      return;
    }
    el.textContent = msg;
    el.setAttribute('data-type', type);
    el.classList.remove('hidden');
    clearTimeout(el._t);
    el._t = setTimeout(function () { el.classList.add('hidden'); }, 3000);
  }

  function openModal() {
    document.getElementById('modal-new-activity').classList.remove('hidden');
  }

  function closeModal() {
    document.getElementById('modal-new-activity').classList.add('hidden');
    state.editingId = null;
  }

  function populateFilterTurmas() {
    var by = turmasByTurno();
    document.querySelectorAll('[data-turno-dropdown]').forEach(function (wrap) {
      var turno = wrap.getAttribute('data-turno-dropdown');
      var menu = wrap.querySelector('.turno-dropdown-menu');
      if (!menu) return;
      var list = by[turno] || [];
      if (!list.length) {
        menu.innerHTML = '<p class="px-4 py-3 text-sm text-text-secondary italic">Nenhuma turma neste turno.</p>';
        return;
      }
      menu.innerHTML = list.map(function (c) {
        return '<button type="button" class="w-full text-left px-4 py-2.5 text-body-md hover:bg-surface-container-low transition-colors" data-select-turma="' +
          escapeHtml(c.code) + '" data-turma-label="' + escapeHtml(turmaLabel(c)) + '" data-turma-turno="' + escapeHtml(turno) + '">' +
          escapeHtml(turmaLabel(c)) + '</button>';
      }).join('');
    });
    updateFilterButtonsUI();
  }

  function closeAllTurnoDropdowns() {
    document.querySelectorAll('.turno-dropdown-menu').forEach(function (m) {
      m.classList.add('hidden');
    });
  }

  function updateFilterButtonsUI() {
    var allBtn = document.getElementById('filter-todas-turmas');
    var label = document.getElementById('agenda-filter-label');
    var activeTurma = state.filterTurma;
    var activeTurno = state.filterTurno || '';

    if (allBtn) {
      if (!activeTurma) {
        allBtn.className = 'px-4 py-2 rounded-lg bg-primary text-white text-label-md font-semibold border border-primary shadow-sm';
      } else {
        allBtn.className = 'px-4 py-2 rounded-lg bg-white text-text-secondary text-label-md font-medium border border-border-subtle hover:border-primary transition-colors';
      }
    }

    document.querySelectorAll('[data-turno-dropdown]').forEach(function (wrap) {
      var turno = wrap.getAttribute('data-turno-dropdown');
      var btn = wrap.querySelector('.turno-filter-btn');
      if (!btn) return;
      var isActive = !!activeTurma && activeTurno === turno;
      btn.className = isActive
        ? 'turno-filter-btn px-4 py-2 rounded-lg bg-primary text-white text-label-md font-semibold border border-primary shadow-sm inline-flex items-center gap-1'
        : 'turno-filter-btn px-4 py-2 rounded-lg bg-white text-text-secondary text-label-md font-medium border border-border-subtle hover:border-primary transition-colors inline-flex items-center gap-1';
    });

    if (label) {
      if (!activeTurma) {
        label.textContent = 'Exibindo todas as atividades (gerais e por turma).';
      } else {
        label.textContent = 'Turma ' + (state.filterTurmaLabel || activeTurma) +
          ': atividades gerais (todas as turmas) + atividades só desta turma.';
      }
    }
  }

  function setFilterTodas() {
    state.filterTurma = '';
    state.filterTurno = '';
    state.filterTurmaLabel = '';
    closeAllTurnoDropdowns();
    updateFilterButtonsUI();
    renderAll();
  }

  function setFilterTurma(code, label, turno) {
    state.filterTurma = code || '';
    state.filterTurno = turno || '';
    state.filterTurmaLabel = label || code || '';
    closeAllTurnoDropdowns();
    updateFilterButtonsUI();
    renderAll();
  }

  function populateModalTurmasCheckboxes() {
    var box = document.getElementById('agenda-turmas-checkboxes');
    if (!box) return;
    var by = turmasByTurno();
    var html = '';
    TURNOS.forEach(function (turno) {
      var list = by[turno] || [];
      if (!list.length) return;
      html += '<div class="mb-3">' +
        '<p class="text-[11px] font-bold uppercase text-text-secondary mb-2">' + escapeHtml(turno) + '</p>' +
        '<div class="space-y-1.5 pl-1">';
      list.forEach(function (c) {
        html += '<label class="flex items-center gap-2 text-body-md cursor-pointer hover:bg-surface-container-low rounded-lg px-2 py-1.5">' +
          '<input type="checkbox" class="agenda-turma-cb rounded border-border-subtle text-primary focus:ring-primary" value="' +
          escapeHtml(c.code) + '"/>' +
          '<span>' + escapeHtml(turmaLabel(c)) + '</span></label>';
      });
      html += '</div></div>';
    });
    if (!html) html = '<p class="text-sm text-text-secondary italic">Nenhuma turma cadastrada.</p>';
    box.innerHTML = html;
  }

  function setScopeUI(scope) {
    var geral = document.getElementById('scope-geral');
    var turmas = document.getElementById('scope-turmas');
    var panel = document.getElementById('agenda-turmas-panel');
    if (geral) geral.checked = scope !== 'turmas';
    if (turmas) turmas.checked = scope === 'turmas';
    if (panel) {
      if (scope === 'turmas') panel.classList.remove('hidden');
      else panel.classList.add('hidden');
    }
  }

  function getSelectedTurmas() {
    return Array.from(document.querySelectorAll('.agenda-turma-cb:checked')).map(function (cb) {
      return cb.value;
    });
  }

  function setSelectedTurmas(codes) {
    var set = {};
    (codes || []).forEach(function (c) { set[String(c)] = true; });
    document.querySelectorAll('.agenda-turma-cb').forEach(function (cb) {
      cb.checked = !!set[cb.value];
    });
  }

  function openNovaAtividade() {
    state.editingId = null;
    var form = document.getElementById('form-agenda-atividade');
    if (form) form.reset();
    document.getElementById('agenda-activity-id').value = '';
    document.getElementById('agenda-modal-title').textContent = 'Nova Atividade';
    document.getElementById('agenda-submit-btn').textContent = 'Criar Atividade';
    document.getElementById('agenda-delete-btn').classList.add('hidden');
    document.getElementById('agenda-date').value = todayISO();
    populateModalTurmasCheckboxes();
    setScopeUI('geral');
    setSelectedTurmas([]);
    openModal();
  }

  function openEditAtividade(id) {
    var evt = getEvents().find(function (e) { return e.id === id; });
    if (!evt) {
      showAgendaToast('Atividade não encontrada.', 'error');
      return;
    }
    state.editingId = id;
    populateModalTurmasCheckboxes();
    document.getElementById('agenda-activity-id').value = id;
    document.getElementById('agenda-modal-title').textContent = 'Editar Atividade';
    document.getElementById('agenda-submit-btn').textContent = 'Salvar Alterações';
    document.getElementById('agenda-delete-btn').classList.remove('hidden');
    document.getElementById('agenda-title').value = evt.title || '';
    document.getElementById('agenda-type').value = evt.type || 'Provas & Testes';
    document.getElementById('agenda-date').value = evt.date || '';
    document.getElementById('agenda-desc').value = evt.desc || '';
    setScopeUI(evt.scope === 'turmas' ? 'turmas' : 'geral');
    setSelectedTurmas(evt.turmas || []);
    openModal();
  }

  function deleteAtividade() {
    var id = state.editingId || document.getElementById('agenda-activity-id').value;
    if (!id) return;
    var evt = getEvents().find(function (e) { return e.id === id; });
    if (!evt) return;
    if (!confirm('Excluir a atividade "' + evt.title + '"?')) return;
    saveEvents(getEvents().filter(function (e) { return e.id !== id; }));
    closeModal();
    renderAll();
    showAgendaToast('Atividade excluída.', 'info');
  }

  function submitAtividade(e) {
    e.preventDefault();
    var title = (document.getElementById('agenda-title').value || '').trim();
    var type = document.getElementById('agenda-type').value;
    var date = document.getElementById('agenda-date').value;
    var desc = (document.getElementById('agenda-desc').value || '').trim();
    var scopeGeral = document.getElementById('scope-geral').checked;
    var turmas = getSelectedTurmas();

    if (!title || !date) {
      showAgendaToast('Preencha o título e a data.', 'error');
      return;
    }
    if (!scopeGeral && !turmas.length) {
      showAgendaToast('Selecione ao menos uma turma ou escolha Agenda Geral.', 'error');
      return;
    }

    var list = getEvents();
    var payload = {
      id: state.editingId || uid(),
      title: title,
      type: type,
      date: date,
      desc: desc,
      scope: scopeGeral ? 'geral' : 'turmas',
      turmas: scopeGeral ? [] : turmas
    };

    if (state.editingId) {
      var idx = list.findIndex(function (x) { return x.id === state.editingId; });
      if (idx < 0) {
        showAgendaToast('Atividade não encontrada.', 'error');
        return;
      }
      list[idx] = payload;
      saveEvents(list);
      showAgendaToast('Atividade atualizada.');
    } else {
      list.unshift(payload);
      saveEvents(list);
      showAgendaToast('Atividade criada.');
    }
    closeModal();
    renderAll();
  }

  function isoForDay(year, monthIndex, day) {
    var m = String(monthIndex + 1).padStart(2, '0');
    var d = String(day).padStart(2, '0');
    return year + '-' + m + '-' + d;
  }

  function turmasLabel(evt) {
    if (isGlobalEvent(evt)) return 'Agenda Geral';
    return (evt.turmas || []).join(', ') || 'Turmas específicas';
  }

  function renderCalendar() {
    var titleEl = document.getElementById('agenda-month-title');
    var grid = document.getElementById('agenda-calendar-days');
    if (!grid) return;

    if (titleEl) titleEl.textContent = MONTHS[state.month] + ' ' + state.year;

    var first = new Date(state.year, state.month, 1);
    var startPad = first.getDay(); // 0=Sun
    var daysInMonth = new Date(state.year, state.month + 1, 0).getDate();
    var prevDays = new Date(state.year, state.month, 0).getDate();
    var today = todayISO();

    var html = '';
    // previous month padding
    for (var i = 0; i < startPad; i++) {
      var pd = prevDays - startPad + i + 1;
      html += '<div class="min-h-[110px] bg-background-surface/50 p-2 border-r border-b border-border-subtle opacity-40">' +
        '<span class="text-label-md">' + pd + '</span></div>';
    }

    for (var day = 1; day <= daysInMonth; day++) {
      var iso = isoForDay(state.year, state.month, day);
      var isToday = iso === today;
      var dayEvents = eventsForDay(iso);
      var cellClass = isToday
        ? 'min-h-[110px] bg-primary/5 ring-1 ring-primary/20 ring-inset p-2 border-r border-b border-border-subtle'
        : 'min-h-[110px] bg-background-surface p-2 border-r border-b border-border-subtle';
      var dayLabel = isToday
        ? '<span class="inline-flex items-center justify-center w-7 h-7 bg-primary text-white rounded-full text-label-md font-bold">' + day + '</span>'
        : '<span class="text-label-md font-bold">' + day + '</span>';

      var eventsHtml = dayEvents.slice(0, 3).map(function (evt) {
        var st = getTypeStyle(evt.type);
        var prefix = isGlobalEvent(evt) ? '[Geral] ' : '';
        return '<button type="button" data-edit-event="' + escapeHtml(evt.id) + '" ' +
          'class="w-full text-left mt-1 p-1.5 ' + st.bg + ' ' + st.text + ' rounded text-[10px] font-bold border-l-2 ' + st.border + ' truncate hover:brightness-95" ' +
          'title="' + escapeHtml(evt.title + ' — ' + turmasLabel(evt)) + '">' +
          escapeHtml(prefix + evt.title) + '</button>';
      }).join('');
      if (dayEvents.length > 3) {
        eventsHtml += '<p class="text-[10px] text-text-secondary mt-1 font-medium">+' + (dayEvents.length - 3) + ' mais</p>';
      }

      html += '<div class="' + cellClass + '" data-day-iso="' + iso + '">' + dayLabel +
        '<div class="mt-1 space-y-0.5">' + eventsHtml + '</div></div>';
    }

    // next month padding to complete weeks
    var totalCells = startPad + daysInMonth;
    var rem = totalCells % 7 === 0 ? 0 : 7 - (totalCells % 7);
    for (var n = 1; n <= rem; n++) {
      html += '<div class="min-h-[110px] bg-background-surface/50 p-2 border-r border-b border-border-subtle opacity-40">' +
        '<span class="text-label-md">' + n + '</span></div>';
    }

    grid.innerHTML = html;
  }

  function renderUpcoming() {
    var box = document.getElementById('agenda-proximos-eventos');
    if (!box) return;
    var today = todayISO();
    var list = getEvents()
      .filter(eventMatchesFilters)
      .filter(function (e) { return e.date >= today; })
      .sort(function (a, b) { return String(a.date).localeCompare(String(b.date)); })
      .slice(0, 8);

    if (!list.length) {
      box.innerHTML = '<p class="text-body-md text-text-secondary italic py-4">Nenhuma atividade próxima.</p>';
      return;
    }

    box.innerHTML = list.map(function (evt) {
      var parts = evt.date.split('-');
      var mon = MONTHS_SHORT[parseInt(parts[1], 10) - 1] || '';
      var day = parts[2];
      return '<button type="button" data-edit-event="' + escapeHtml(evt.id) + '" ' +
        'class="w-full text-left flex gap-4 group cursor-pointer p-2 -mx-2 hover:bg-surface-container-low rounded-xl transition-all">' +
        '<div class="flex flex-col items-center justify-center min-w-[56px] h-[56px] bg-surface-container-low rounded-lg border border-border-subtle group-hover:bg-primary-light/20 transition-colors">' +
        '<span class="text-label-sm font-bold text-text-secondary">' + escapeHtml(mon) + '</span>' +
        '<span class="text-headline-sm font-bold text-primary">' + escapeHtml(day) + '</span></div>' +
        '<div class="flex-1 min-w-0">' +
        '<p class="text-body-md font-bold text-on-surface group-hover:text-primary transition-colors truncate">' + escapeHtml(evt.title) + '</p>' +
        '<p class="text-label-sm text-text-secondary flex items-center gap-1">' +
        '<span class="material-symbols-outlined text-[14px]">' + (isGlobalEvent(evt) ? 'language' : 'groups') + '</span> ' +
        escapeHtml(turmasLabel(evt)) + '</p>' +
        '<p class="text-[11px] text-outline mt-0.5">' + escapeHtml(evt.type) + '</p>' +
        '</div></button>';
    }).join('');
  }

  function openAgendaCompleta() {
    var mes = document.getElementById('completa-filtro-mes');
    var ini = document.getElementById('completa-periodo-inicio');
    var fim = document.getElementById('completa-periodo-fim');
    if (mes) mes.value = String(state.month + 1).padStart(2, '0');
    if (ini) ini.value = '';
    if (fim) fim.value = '';
    renderAgendaCompleta();
    var modal = document.getElementById('modal-agenda-completa');
    if (modal) modal.classList.remove('hidden');
  }

  function closeAgendaCompleta() {
    var modal = document.getElementById('modal-agenda-completa');
    if (modal) modal.classList.add('hidden');
  }

  function getCompletaFilteredEvents() {
    var mes = (document.getElementById('completa-filtro-mes') || {}).value || '';
    var ini = (document.getElementById('completa-periodo-inicio') || {}).value || '';
    var fim = (document.getElementById('completa-periodo-fim') || {}).value || '';

    if (ini && fim && ini > fim) {
      var tmp = ini;
      ini = fim;
      fim = tmp;
      var iniEl = document.getElementById('completa-periodo-inicio');
      var fimEl = document.getElementById('completa-periodo-fim');
      if (iniEl) iniEl.value = ini;
      if (fimEl) fimEl.value = fim;
    }

    return getEvents()
      .filter(eventMatchesFilters)
      .filter(function (e) {
        if (!e.date) return false;
        var parts = String(e.date).split('-');
        if (mes && parts[1] !== mes) return false;
        if (ini && e.date < ini) return false;
        if (fim && e.date > fim) return false;
        return true;
      })
      .sort(function (a, b) { return String(a.date).localeCompare(String(b.date)); });
  }

  function renderAgendaCompleta() {
    var box = document.getElementById('completa-lista');
    var countEl = document.getElementById('completa-count');
    if (!box) return;

    var list = getCompletaFilteredEvents();
    if (countEl) {
      countEl.textContent = list.length + (list.length === 1 ? ' atividade' : ' atividades');
    }

    if (!list.length) {
      box.innerHTML = '<p class="text-center text-text-secondary italic py-10">Nenhuma atividade encontrada para os filtros selecionados.</p>';
      return;
    }

    box.innerHTML = list.map(function (evt) {
      var parts = String(evt.date || '').split('-');
      var mon = MONTHS_SHORT[parseInt(parts[1], 10) - 1] || '—';
      var day = parts[2] || '—';
      var st = getTypeStyle(evt.type);
      return '<div class="flex items-start gap-3 p-3 rounded-xl border border-border-subtle hover:bg-surface-container-low/40 transition-colors">' +
        '<div class="flex flex-col items-center justify-center min-w-[52px] h-[52px] bg-surface-container-low rounded-lg border border-border-subtle">' +
        '<span class="text-[10px] font-bold text-text-secondary">' + escapeHtml(mon) + '</span>' +
        '<span class="text-lg font-bold text-primary leading-none">' + escapeHtml(day) + '</span></div>' +
        '<div class="flex-1 min-w-0">' +
        '<div class="flex items-start justify-between gap-2">' +
        '<p class="text-body-md font-bold text-on-surface">' + escapeHtml(evt.title) + '</p>' +
        '<span class="shrink-0 px-2 py-0.5 rounded text-[10px] font-bold ' + st.bg + ' ' + st.text + '">' + escapeHtml(evt.type) + '</span></div>' +
        '<p class="text-label-sm text-text-secondary mt-1">' + escapeHtml(formatDateBr(evt.date)) +
        ' · ' + escapeHtml(turmasLabel(evt)) + '</p>' +
        (evt.desc ? '<p class="text-label-sm text-outline mt-1 line-clamp-2">' + escapeHtml(evt.desc) + '</p>' : '') +
        '</div>' +
        '<button type="button" data-edit-event="' + escapeHtml(evt.id) + '" class="p-2 text-outline hover:text-primary hover:bg-primary/10 rounded-lg shrink-0" title="Editar">' +
        '<span class="material-symbols-outlined text-[20px]">edit</span></button></div>';
    }).join('');
  }

  function limparFiltrosCompleta() {
    var mes = document.getElementById('completa-filtro-mes');
    var ini = document.getElementById('completa-periodo-inicio');
    var fim = document.getElementById('completa-periodo-fim');
    if (mes) mes.value = '';
    if (ini) ini.value = '';
    if (fim) fim.value = '';
    renderAgendaCompleta();
  }

  function renderAll() {
    renderCalendar();
    renderUpcoming();
  }

  function bindEvents() {
    var btnNew = document.getElementById('btn-nova-atividade');
    if (btnNew) btnNew.addEventListener('click', openNovaAtividade);

    var btnCompleta = document.getElementById('btn-ver-agenda-completa');
    if (btnCompleta) btnCompleta.addEventListener('click', openAgendaCompleta);

    var btnCloseCompleta = document.getElementById('btn-close-agenda-completa');
    if (btnCloseCompleta) btnCloseCompleta.addEventListener('click', closeAgendaCompleta);

    var modalCompleta = document.getElementById('modal-agenda-completa');
    if (modalCompleta) {
      modalCompleta.addEventListener('click', function (e) {
        if (e.target === modalCompleta) closeAgendaCompleta();
      });
    }

    ['completa-filtro-mes', 'completa-periodo-inicio', 'completa-periodo-fim'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.addEventListener('change', renderAgendaCompleta);
    });

    var btnLimparCompleta = document.getElementById('completa-limpar-filtros');
    if (btnLimparCompleta) btnLimparCompleta.addEventListener('click', limparFiltrosCompleta);

    var form = document.getElementById('form-agenda-atividade');
    if (form) form.addEventListener('submit', submitAtividade);

    var btnDel = document.getElementById('agenda-delete-btn');
    if (btnDel) btnDel.addEventListener('click', deleteAtividade);

    document.querySelectorAll('[data-close-agenda-modal]').forEach(function (btn) {
      btn.addEventListener('click', closeModal);
    });

    var scopeGeral = document.getElementById('scope-geral');
    var scopeTurmas = document.getElementById('scope-turmas');
    if (scopeGeral) scopeGeral.addEventListener('change', function () { if (scopeGeral.checked) setScopeUI('geral'); });
    if (scopeTurmas) scopeTurmas.addEventListener('change', function () { if (scopeTurmas.checked) setScopeUI('turmas'); });

    var filterTurmaWrap = document.getElementById('agenda-turma-filter');
    if (filterTurmaWrap) {
      filterTurmaWrap.addEventListener('click', function (e) {
        var allBtn = e.target.closest('[data-filter-all]');
        if (allBtn) {
          e.preventDefault();
          setFilterTodas();
          return;
        }

        var turmaBtn = e.target.closest('[data-select-turma]');
        if (turmaBtn) {
          e.preventDefault();
          setFilterTurma(
            turmaBtn.getAttribute('data-select-turma'),
            turmaBtn.getAttribute('data-turma-label'),
            turmaBtn.getAttribute('data-turma-turno')
          );
          return;
        }

        var turnoBtn = e.target.closest('.turno-filter-btn');
        if (turnoBtn) {
          e.preventDefault();
          e.stopPropagation();
          var wrap = turnoBtn.closest('[data-turno-dropdown]');
          var menu = wrap ? wrap.querySelector('.turno-dropdown-menu') : null;
          var wasOpen = menu && !menu.classList.contains('hidden');
          closeAllTurnoDropdowns();
          if (menu && !wasOpen) menu.classList.remove('hidden');
        }
      });
    }

    document.addEventListener('click', function (e) {
      if (!e.target.closest('#agenda-turma-filter')) closeAllTurnoDropdowns();
    });

    var filterTipo = document.getElementById('filter-tipo-agenda');
    if (filterTipo) {
      filterTipo.addEventListener('change', function () {
        state.filterTipo = filterTipo.value;
        renderAll();
      });
    }

    var prev = document.getElementById('agenda-prev-month');
    var next = document.getElementById('agenda-next-month');
    var todayBtn = document.getElementById('agenda-today-btn');
    if (prev) {
      prev.addEventListener('click', function () {
        state.month -= 1;
        if (state.month < 0) { state.month = 11; state.year -= 1; }
        renderAll();
      });
    }
    if (next) {
      next.addEventListener('click', function () {
        state.month += 1;
        if (state.month > 11) { state.month = 0; state.year += 1; }
        renderAll();
      });
    }
    if (todayBtn) {
      todayBtn.addEventListener('click', function () {
        var now = new Date();
        state.year = now.getFullYear();
        state.month = now.getMonth();
        renderAll();
      });
    }

    document.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-edit-event]');
      if (!btn) return;
      var id = btn.getAttribute('data-edit-event');
      closeAgendaCompleta();
      openEditAtividade(id);
    });
  }

  function initAgendaPageNew() {
    // Prefer 2026 view; if today is in 2026 use current month
    var now = new Date();
    if (now.getFullYear() === 2026) {
      state.year = 2026;
      state.month = now.getMonth();
    } else {
      state.year = 2026;
      state.month = 0;
    }
    if (typeof getClasses === 'function') getClasses();
    populateFilterTurmas();
    bindEvents();
    renderAll();
  }

  window.openNovaAtividadeAgenda = openNovaAtividade;
  window.openEditAtividadeAgenda = openEditAtividade;
  window.closeAgendaModal = closeModal;
  window.openAgendaCompleta = openAgendaCompleta;
  window.initAgendaPageNew = initAgendaPageNew;

  document.addEventListener('DOMContentLoaded', function () {
    var path = (window.location.pathname || '').toLowerCase();
    if (path.indexOf('agenda.html') !== -1) initAgendaPageNew();
  });
})();
