/**
 * Painel Principal — integrado aos dados do SIGA (localStorage)
 */
(function () {
  'use strict';

  function readJson(key, fallback) {
    try {
      var v = JSON.parse(localStorage.getItem(key) || 'null');
      return v == null ? fallback : v;
    } catch (e) {
      return fallback;
    }
  }

  function getStudents() {
    var s = readJson('siga_students', []);
    return Array.isArray(s) ? s : [];
  }

  function getClasses() {
    if (typeof window.getClasses === 'function') {
      try { return window.getClasses() || []; } catch (e) { /* fallthrough */ }
    }
    var c = readJson('siga_classes', []);
    return Array.isArray(c) ? c : [];
  }

  function getOccurrences() {
    var o = readJson('siga_occurrences', []);
    return Array.isArray(o) ? o : [];
  }

  function getAgenda() {
    var a = readJson('siga_agenda_events', []);
    return Array.isArray(a) ? a : [];
  }

  function getDocs() {
    var d = readJson('siga_documentos_secretaria', []);
    return Array.isArray(d) ? d : [];
  }

  function getOlimpiadas() {
    var o = readJson('siga_olimpiadas', []);
    return Array.isArray(o) ? o : [];
  }

  function getInscricoes() {
    var i = readJson('siga_olimpiada_inscricoes', []);
    return Array.isArray(i) ? i : [];
  }

  function setText(id, text) {
    var el = document.getElementById(id);
    if (el) el.textContent = text;
  }

  function setHint(id, text, positive) {
    var el = document.getElementById(id);
    if (!el) return;
    el.className = 'flex items-center gap-1 text-[11px] font-bold ' +
      (positive === true ? 'text-primary' : positive === false ? 'text-error' : 'text-text-secondary');
    el.innerHTML = '<span class="material-symbols-outlined text-[14px]">' +
      (positive === true ? 'trending_up' : positive === false ? 'trending_down' : 'info') +
      '</span><span>' + text + '</span>';
  }

  function formatDateBr(iso) {
    if (!iso) return '—';
    var s = String(iso);
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
      var p = s.slice(0, 10).split('-');
      return p[2] + '/' + p[1] + '/' + p[0];
    }
    if (/^\d{2}\/\d{2}\/\d{4}/.test(s)) return s.slice(0, 10);
    return s;
  }

  function formatDateLong(iso) {
    if (!iso || !/^\d{4}-\d{2}-\d{2}/.test(iso)) return formatDateBr(iso);
    var d = new Date(iso.slice(0, 10) + 'T12:00:00');
    if (isNaN(d.getTime())) return formatDateBr(iso);
    return d.toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' });
  }

  function firstName(full) {
    var n = String(full || '').trim();
    if (!n) return '';
    return n.split(/\s+/)[0];
  }

  function normalizeTipo(t) {
    var x = String(t || '').toLowerCase();
    if (x.includes('indiscipl') || x.includes('discipl')) return 'Disciplinares';
    if (x.includes('atras')) return 'Atrasos';
    if (x.includes('elog') || x.includes('justif')) return 'Justificadas';
    return 'Outras';
  }

  function modalidadeBucket(mod, serie) {
    var m = String(mod || '').toLowerCase();
    var s = String(serie || '').toLowerCase();
    if (m.includes('eja') || s.includes('eja')) return 'EJA';
    if (m.includes('fluxo') || s.includes('fluxo')) return 'Fluxo';
    if (m.includes('especial') || s.includes('especial')) return 'Educação Especial';
    return 'Ensino Médio';
  }

  function renderKpis(students, classes, occurrences, docs) {
    var ativos = students.filter(function (s) {
      var st = String(s.status || 'Ativo');
      return st.toLowerCase() !== 'inativo';
    });
    var turmasAtivas = classes.filter(function (c) {
      return String(c.status || 'Ativo').toLowerCase() !== 'inativo';
    });

    setText('dash-kpi-alunos', String(ativos.length));
    setHint('dash-kpi-alunos-hint',
      ativos.length ? (ativos.length + ' de ' + students.length + ' cadastrados') : 'Importe ou cadastre alunos',
      ativos.length ? true : null);

    setText('dash-kpi-turmas', String(turmasAtivas.length));
    setHint('dash-kpi-turmas-hint',
      turmasAtivas.length ? 'Turmas no ano letivo' : 'Importe ou cadastre turmas',
      turmasAtivas.length ? true : null);

    var freqs = ativos.map(function (s) { return Number(s.frequencia); }).filter(function (n) { return !isNaN(n) && n >= 0; });
    if (freqs.length) {
      var avg = freqs.reduce(function (a, b) { return a + b; }, 0) / freqs.length;
      setText('dash-kpi-freq', avg.toFixed(1).replace('.', ',') + '%');
      setHint('dash-kpi-freq-hint', 'Média dos alunos ativos', true);
    } else {
      setText('dash-kpi-freq', '—');
      setHint('dash-kpi-freq-hint', 'Sem frequência registrada', null);
    }

    setText('dash-kpi-ocorrencias', String(occurrences.length));
    setHint('dash-kpi-ocorrencias-hint',
      occurrences.length ? 'Registros no sistema' : 'Nenhuma ocorrência',
      occurrences.length ? false : null);

    setText('dash-kpi-docs', String(docs.length));
    setHint('dash-kpi-docs-hint',
      docs.length ? 'Documentos da secretaria' : 'Nenhum documento',
      docs.length ? true : null);
  }

  function renderWelcome(students, classes) {
    var name = localStorage.getItem('siga_profile_name') || '';
    var school = localStorage.getItem('siga_school_name') || '';
    var title = document.getElementById('dash-welcome-title');
    if (title) {
      title.textContent = name ? ('Olá, ' + firstName(name) + '! 👋') : 'Olá! 👋';
    }
    var text = document.getElementById('dash-welcome-text');
    if (text) {
      var parts = [];
      if (school) parts.push(school);
      parts.push(students.length + ' aluno(s)');
      parts.push(classes.length + ' turma(s)');
      text.textContent = parts.join(' · ') + '. Resumo atualizado com os dados do sistema.';
    }
  }

  function renderFreqChart(students) {
    var path = document.getElementById('dash-freq-path');
    var svg = document.getElementById('dash-freq-svg');
    if (!path || !svg) return;

    var ativos = students.filter(function (s) {
      return String(s.status || 'Ativo').toLowerCase() !== 'inativo';
    });
    var freqs = ativos.map(function (s) { return Number(s.frequencia); }).filter(function (n) { return !isNaN(n); });
    var avg = freqs.length ? freqs.reduce(function (a, b) { return a + b; }, 0) / freqs.length : 0;

    // Fake 6-month trend around average (visual only when we have data)
    var values = [];
    if (freqs.length) {
      for (var i = 0; i < 6; i++) {
        var wobble = ((i % 3) - 1) * 2.5;
        values.push(Math.max(0, Math.min(100, avg + wobble)));
      }
    } else {
      values = [0, 0, 0, 0, 0, 0];
    }

    var pts = values.map(function (v, i) {
      var x = (i / 5) * 600;
      var y = 180 - (v / 100) * 140;
      return { x: x, y: y };
    });

    var d = pts.map(function (p, i) {
      return (i === 0 ? 'M' : 'L') + p.x + ',' + p.y;
    }).join(' ');
    path.setAttribute('d', d || 'M0,180 L600,180');

    // refresh circles
    Array.from(svg.querySelectorAll('circle.dash-freq-dot')).forEach(function (c) { c.remove(); });
    pts.forEach(function (p) {
      var c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      c.setAttribute('class', 'dash-freq-dot');
      c.setAttribute('cx', p.x);
      c.setAttribute('cy', p.y);
      c.setAttribute('r', '4');
      c.setAttribute('fill', 'white');
      c.setAttribute('stroke', '#2EAF62');
      c.setAttribute('stroke-width', '2');
      svg.appendChild(c);
    });

    setText('dash-freq-label', freqs.length
      ? ('Média atual: ' + avg.toFixed(1).replace('.', ',') + '%')
      : 'Sem frequência cadastrada');
  }

  function renderComunicados(agenda) {
    var box = document.getElementById('dash-comunicados');
    if (!box) return;
    var today = new Date();
    today.setHours(0, 0, 0, 0);

    var upcoming = agenda
      .filter(function (e) { return e && e.date; })
      .slice()
      .sort(function (a, b) { return String(a.date).localeCompare(String(b.date)); })
      .filter(function (e) {
        var d = new Date(String(e.date).slice(0, 10) + 'T12:00:00');
        return !isNaN(d.getTime()) && d >= today;
      })
      .slice(0, 5);

    if (!upcoming.length) {
      // show most recent past if no upcoming
      upcoming = agenda
        .filter(function (e) { return e && e.date; })
        .slice()
        .sort(function (a, b) { return String(b.date).localeCompare(String(a.date)); })
        .slice(0, 3);
    }

    if (!upcoming.length) {
      box.innerHTML = '<p class="text-body-md text-text-secondary">Nenhum evento na agenda ainda.</p>';
      return;
    }

    box.innerHTML = upcoming.map(function (e) {
      var isGeral = e.scope === 'geral' || e.allTurmas;
      var badge = isGeral ? 'Geral' : 'Turma';
      var badgeClass = isGeral ? 'bg-primary-light/20 text-primary' : 'bg-surface-container-high text-secondary';
      var hora = e.startTime || e.type || '';
      return '<a href="agenda.html" class="flex items-center justify-between p-3 rounded-xl hover:bg-surface-container-low transition-colors cursor-pointer group">' +
        '<div class="flex flex-col min-w-0">' +
        '<p class="text-body-md font-semibold truncate">' + escapeHtml(e.title || 'Evento') + '</p>' +
        '<span class="text-[11px] text-text-secondary">' + formatDateBr(e.date) +
        (hora ? ' · ' + escapeHtml(hora) : '') + '</span>' +
        '</div>' +
        '<span class="px-2 py-1 ' + badgeClass + ' text-[10px] rounded font-bold shrink-0">' + badge + '</span>' +
        '</a>';
    }).join('');
  }

  function renderOcorrenciasChart(occurrences) {
    var box = document.getElementById('dash-ocorrencias-chart');
    if (!box) return;
    if (!occurrences.length) {
      box.innerHTML = '<p class="text-body-md text-text-secondary w-full text-center self-center">Sem ocorrências registradas.</p>';
      return;
    }

    var order = ['Disciplinares', 'Atrasos', 'Justificadas', 'Outras'];
    var colors = {
      Disciplinares: 'bg-primary-container',
      Atrasos: 'bg-secondary-container',
      Justificadas: 'bg-tertiary-container',
      Outras: 'bg-surface-variant'
    };
    var counts = { Disciplinares: 0, Atrasos: 0, Justificadas: 0, Outras: 0 };
    occurrences.forEach(function (o) {
      var k = normalizeTipo(o.type || o.tipo);
      counts[k] = (counts[k] || 0) + 1;
    });
    var max = Math.max.apply(null, order.map(function (k) { return counts[k]; })) || 1;

    box.innerHTML = order.map(function (k) {
      var n = counts[k];
      var h = Math.max(8, Math.round((n / max) * 80));
      return '<div class="flex flex-col items-center flex-1 gap-2">' +
        '<div class="text-[12px] font-bold">' + n + '</div>' +
        '<div class="w-full ' + colors[k] + ' rounded-t-lg" style="height:' + h + '%;"></div>' +
        '<span class="text-[10px] text-text-secondary text-center">' + k + '</span>' +
        '</div>';
    }).join('');
  }

  function renderDistribuicao(students, classes) {
    var classMap = {};
    classes.forEach(function (c) { classMap[c.code] = c; });

    var buckets = {};
    students.forEach(function (s) {
      var cls = classMap[s.turma] || {};
      var key = modalidadeBucket(cls.modalidade, s.serie || cls.serie);
      buckets[key] = (buckets[key] || 0) + 1;
    });

    // If no students, fall back to class counts
    if (!students.length) {
      classes.forEach(function (c) {
        var key = modalidadeBucket(c.modalidade, c.serie);
        buckets[key] = (buckets[key] || 0) + 1;
      });
    }

    var total = Object.keys(buckets).reduce(function (a, k) { return a + buckets[k]; }, 0);
    setText('dash-dist-total', String(total));

    var legend = document.getElementById('dash-dist-legend');
    var svg = document.getElementById('dash-dist-svg');
    if (!legend || !svg) return;

    if (!total) {
      svg.innerHTML = '<circle cx="16" cy="16" fill="transparent" r="16" stroke="#E5E7EB" stroke-width="12"></circle>';
      legend.innerHTML = '<p class="text-body-md text-text-secondary text-center">Cadastre turmas e alunos para ver a distribuição.</p>';
      return;
    }

    var palette = [
      { key: 'Ensino Médio', color: '#2EAF62', dot: 'bg-primary-container' },
      { key: 'EJA', color: '#2170E4', dot: 'bg-secondary-container' },
      { key: 'Fluxo', color: '#C39200', dot: 'bg-tertiary-container' },
      { key: 'Educação Especial', color: '#64DE8B', dot: 'bg-primary-fixed-dim' }
    ];

    var entries = palette.filter(function (p) { return buckets[p.key]; });
    // include any unexpected keys
    Object.keys(buckets).forEach(function (k) {
      if (!entries.some(function (e) { return e.key === k; })) {
        entries.push({ key: k, color: '#ADC6FF', dot: 'bg-secondary-fixed-dim' });
      }
    });

    var offset = 0;
    var circles = entries.map(function (e) {
      var pct = (buckets[e.key] / total) * 100;
      var circ = '<circle cx="16" cy="16" fill="transparent" r="16" stroke="' + e.color +
        '" stroke-dasharray="' + pct.toFixed(2) + ' 100" stroke-dashoffset="-' + offset.toFixed(2) +
        '" stroke-width="12"></circle>';
      offset += pct;
      return circ;
    }).join('');
    svg.innerHTML = circles;

    legend.innerHTML = entries.map(function (e) {
      var pct = Math.round((buckets[e.key] / total) * 100);
      return '<div class="flex items-center justify-between">' +
        '<div class="flex items-center gap-2">' +
        '<span class="w-3 h-3 rounded-full ' + e.dot + '"></span>' +
        '<span class="text-body-md">' + escapeHtml(e.key) + '</span>' +
        '</div>' +
        '<span class="font-bold">' + pct + '% · ' + buckets[e.key] + '</span>' +
        '</div>';
    }).join('');
  }

  function renderAtividades(occurrences, agenda, students) {
    var box = document.getElementById('dash-atividades');
    if (!box) return;

    var items = [];

    occurrences.slice().reverse().slice(0, 5).forEach(function (o) {
      items.push({
        icon: 'warning',
        bg: 'bg-tertiary-fixed text-tertiary',
        title: 'Ocorrência: ' + (o.type || o.tipo || 'Registro') +
          (o.student || o.aluno ? ' — ' + (o.student || o.aluno) : ''),
        when: formatDateBr(o.date || o.data)
      });
    });

    agenda.slice().sort(function (a, b) {
      return String(b.date || '').localeCompare(String(a.date || ''));
    }).slice(0, 3).forEach(function (e) {
      items.push({
        icon: 'event',
        bg: 'bg-primary-light/20 text-primary',
        title: 'Agenda: ' + (e.title || 'Evento'),
        when: formatDateBr(e.date)
      });
    });

    if (students.length) {
      items.push({
        icon: 'groups',
        bg: 'bg-surface-container-high text-secondary',
        title: students.length + ' aluno(s) na base',
        when: 'Cadastro atual'
      });
    }

    items = items.slice(0, 5);
    if (!items.length) {
      box.innerHTML = '<p class="text-body-md text-text-secondary pl-12">Nenhuma atividade recente.</p>';
      return;
    }

    box.innerHTML = items.map(function (it) {
      return '<div class="relative pl-12">' +
        '<div class="absolute left-0 w-10 h-10 rounded-full ' + it.bg + ' flex items-center justify-center z-10 border-4 border-white">' +
        '<span class="material-symbols-outlined text-[18px]">' + it.icon + '</span></div>' +
        '<p class="text-body-md font-semibold">' + escapeHtml(it.title) + '</p>' +
        '<p class="text-label-sm text-text-secondary">' + escapeHtml(it.when) + '</p>' +
        '</div>';
    }).join('');
  }

  function renderProximoEvento(agenda) {
    var today = new Date();
    today.setHours(0, 0, 0, 0);
    var next = agenda
      .filter(function (e) { return e && e.date; })
      .map(function (e) {
        return { e: e, d: new Date(String(e.date).slice(0, 10) + 'T12:00:00') };
      })
      .filter(function (x) { return !isNaN(x.d.getTime()) && x.d >= today; })
      .sort(function (a, b) { return a.d - b.d; })[0];

    if (!next) {
      setText('dash-evento-titulo', 'Nenhum evento');
      setText('dash-evento-data', 'Agenda vazia');
      setText('dash-evento-hora', 'Cadastre atividades na Agenda');
      return;
    }

    setText('dash-evento-titulo', next.e.title || 'Evento');
    setText('dash-evento-data', formatDateLong(next.e.date));
    var hora = '';
    if (next.e.startTime) hora += next.e.startTime;
    if (next.e.endTime) hora += (hora ? ' - ' : '') + next.e.endTime;
    if (!hora && next.e.type) hora = next.e.type;
    if (!hora && next.e.scope === 'geral') hora = 'Agenda geral';
    if (!hora && next.e.turmas && next.e.turmas.length) hora = next.e.turmas.join(', ');
    setText('dash-evento-hora', hora || 'Ver detalhes na Agenda');
  }

  function renderOlimpiadas() {
    var ols = getOlimpiadas();
    var insc = getInscricoes();
    var el = document.getElementById('dash-olimpiadas-text');
    if (!el) return;
    if (!ols.length) {
      el.textContent = 'Cadastre olimpíadas e acompanhe as inscrições dos alunos no Projeto Olímpico.';
      return;
    }
    el.textContent = ols.length + ' olimpíada(s) cadastrada(s) · ' + insc.length + ' inscrição(ões). Acompanhe no Projeto Olímpico.';
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function initPainelPrincipal() {
    if (!document.getElementById('dash-kpi-alunos')) return;

    var students = getStudents();
    var classes = getClasses();
    var occurrences = getOccurrences();
    var agenda = getAgenda();
    var docs = getDocs();

    renderWelcome(students, classes);
    renderKpis(students, classes, occurrences, docs);
    renderFreqChart(students);
    renderComunicados(agenda);
    renderOcorrenciasChart(occurrences);
    renderDistribuicao(students, classes);
    renderAtividades(occurrences, agenda, students);
    renderProximoEvento(agenda);
    renderOlimpiadas();
  }

  window.initPainelPrincipal = initPainelPrincipal;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initPainelPrincipal);
  } else {
    initPainelPrincipal();
  }
})();
