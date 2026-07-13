/**
 * SIGA Educa — Projeto Olímpico
 * localStorage: siga_olimpiadas, siga_olimpiada_inscricoes, siga_portal_aluno_id
 */
(function () {
  'use strict';

  var OLIMPIADAS_KEY = 'siga_olimpiadas';
  var INSC_KEY = 'siga_olimpiada_inscricoes';
  var PORTAL_ALUNO_KEY = 'siga_portal_aluno_id';

  function uid(prefix) {
    return (prefix || 'ol') + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7);
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

  function getDefaultOlimpiadas() {
    return [];
  }

  function getOlimpiadas() {
    try {
      var raw = JSON.parse(localStorage.getItem(OLIMPIADAS_KEY) || 'null');
      if (!raw || !raw.length) {
        raw = getDefaultOlimpiadas();
        localStorage.setItem(OLIMPIADAS_KEY, JSON.stringify(raw));
      }
      return raw;
    } catch (e) {
      return getDefaultOlimpiadas();
    }
  }

  function saveOlimpiadas(list) {
    localStorage.setItem(OLIMPIADAS_KEY, JSON.stringify(list || []));
  }

  function getInscricoes() {
    try {
      return JSON.parse(localStorage.getItem(INSC_KEY) || '[]') || [];
    } catch (e) {
      return [];
    }
  }

  function saveInscricoes(list) {
    localStorage.setItem(INSC_KEY, JSON.stringify(list || []));
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

  function normalizeTurmaCode(value) {
    return String(value || '').split(' - ')[0].trim();
  }

  function inscricoesDaOlimpiada(olimpiadaId) {
    return getInscricoes().filter(function (i) { return i.olimpiadaId === olimpiadaId; });
  }

  function jaInscrito(olimpiadaId, alunoId) {
    if (!olimpiadaId || !alunoId) return false;
    return getInscricoes().some(function (i) {
      return i.olimpiadaId === olimpiadaId && String(i.alunoId) === String(alunoId);
    });
  }

  /**
   * Inscreve aluno. Retorna { ok, reason, inscricao }
   */
  function inscreverAluno(olimpiadaId, aluno, origem) {
    origem = origem || 'admin';
    if (!olimpiadaId || !aluno || !aluno.id) {
      return { ok: false, reason: 'Dados incompletos.' };
    }
    var olimp = getOlimpiadas().find(function (o) { return o.id === olimpiadaId; });
    if (!olimp) return { ok: false, reason: 'Olimpíada não encontrada.' };

    if (jaInscrito(olimpiadaId, aluno.id)) {
      return { ok: false, reason: 'Este aluno já está inscrito nesta olimpíada.' };
    }

    var inscricao = {
      id: uid('insc'),
      olimpiadaId: olimpiadaId,
      alunoId: String(aluno.id),
      alunoNome: aluno.nome || '',
      alunoTurma: normalizeTurmaCode(aluno.turma) || '',
      origem: origem,
      dataInscricao: todayISO(),
      medalha: ''
    };
    var list = getInscricoes();
    list.unshift(inscricao);
    saveInscricoes(list);
    return { ok: true, inscricao: inscricao };
  }

  function removerInscricao(inscId) {
    saveInscricoes(getInscricoes().filter(function (i) { return i.id !== inscId; }));
  }

  function showOlimpiadaToast(msg, type) {
    type = type || 'success';
    var el = document.getElementById('olimpiada-toast');
    if (!el) {
      alert(msg);
      return;
    }
    el.textContent = msg;
    el.setAttribute('data-type', type);
    el.classList.remove('hidden');
    clearTimeout(el._t);
    el._t = setTimeout(function () { el.classList.add('hidden'); }, 3200);
  }

  function openModal(id) {
    var m = document.getElementById(id);
    if (m) m.classList.remove('hidden');
  }

  function closeModal(id) {
    var m = document.getElementById(id);
    if (m) m.classList.add('hidden');
  }

  function readFileAsDataUrl(file, maxBytes) {
    maxBytes = maxBytes || 700000;
    return new Promise(function (resolve, reject) {
      if (!file) {
        resolve('');
        return;
      }
      if (file.size > maxBytes) {
        reject(new Error('Imagem muito grande. Use um arquivo de até ~700 KB.'));
        return;
      }
      var reader = new FileReader();
      reader.onload = function () { resolve(String(reader.result || '')); };
      reader.onerror = function () { reject(new Error('Falha ao ler o arquivo.')); };
      reader.readAsDataURL(file);
    });
  }

  function statusFromDates(o) {
    var today = todayISO();
    if (o.status === 'Finalizada') return 'Finalizada';
    if (o.dataLimite && o.dataLimite < today) return 'Encerrada';
    if (o.dataInicio && today < o.dataInicio) return 'Em breve';
    return o.status || 'Inscrições';
  }

  function badgeClassForStatus(status) {
    if (status === 'Finalizada' || status === 'Encerrada') return 'bg-blue-100 text-blue-700';
    if (status === 'Em breve') return 'bg-orange-100 text-orange-700';
    if (status === 'Aulas' || status === 'Fase 2') return 'bg-red-100 text-red-700';
    return 'bg-green-100 text-green-700';
  }

  function normalizeMedalha(value) {
    var v = String(value || '').toLowerCase().trim();
    if (v === 'ouro' || v === 'prata' || v === 'bronze') return v;
    return '';
  }

  function countMedalhas() {
    var counts = { ouro: 0, prata: 0, bronze: 0, total: 0 };
    getInscricoes().forEach(function (i) {
      var m = normalizeMedalha(i.medalha);
      if (!m) return;
      counts[m] += 1;
      counts.total += 1;
    });
    return counts;
  }

  function campanhaAno() {
    var years = getOlimpiadas().map(function (o) {
      return String(o.dataInicio || o.dataLimite || o.createdAt || '').slice(0, 4);
    }).filter(function (y) { return /^\d{4}$/.test(y); });
    if (years.length) {
      years.sort();
      return years[years.length - 1];
    }
    return '2026';
  }

  function renderHallDaFama() {
    var counts = countMedalhas();
    var ano = campanhaAno();
    var texto = document.getElementById('hall-fama-texto');
    var ouro = document.getElementById('hall-fama-ouro');
    var prata = document.getElementById('hall-fama-prata');
    var bronze = document.getElementById('hall-fama-bronze');
    var campanha = document.getElementById('olimp-campanha-ano');

    if (ouro) ouro.textContent = String(counts.ouro);
    if (prata) prata.textContent = String(counts.prata);
    if (bronze) bronze.textContent = String(counts.bronze);
    if (campanha) campanha.textContent = 'CAMPANHA ' + ano;

    if (texto) {
      if (counts.total) {
        texto.textContent = 'Nossa escola já conquistou ' + counts.total +
          ' medalha' + (counts.total === 1 ? '' : 's') + ' em ' + ano + '.';
      } else {
        texto.textContent = 'Ainda não há medalhas registradas. Cadastre olimpíadas e registre os resultados dos alunos.';
      }
    }
  }

  function setInscricaoMedalha(inscId, medalha) {
    var list = getInscricoes();
    var idx = list.findIndex(function (i) { return i.id === inscId; });
    if (idx < 0) return false;
    list[idx].medalha = normalizeMedalha(medalha);
    saveInscricoes(list);
    return true;
  }

  /* ========== Admin: topodosaber.html ========== */

  function renderOlimpiadasCards() {
    var grid = document.getElementById('olimpiadas-grid');
    if (!grid) return;
    var list = getOlimpiadas();
    if (!list.length) {
      grid.innerHTML = '<p class="col-span-full text-center text-text-secondary py-8">Nenhuma olimpíada cadastrada. Clique em Inscrever Olimpíada.</p>';
      return;
    }
    grid.innerHTML = list.map(function (o) {
      var count = inscricoesDaOlimpiada(o.id).length;
      var st = statusFromDates(o);
      var badge = o.badgeClass || badgeClassForStatus(st);
      var logoHtml = o.logo
        ? '<img src="' + escapeHtml(o.logo) + '" alt="" class="w-12 h-12 rounded-lg object-cover border border-border-subtle"/>'
        : '<div class="w-12 h-12 ' + escapeHtml(o.iconBg || 'bg-primary-fixed') + ' rounded-lg flex items-center justify-center ' +
          escapeHtml(o.iconColor || 'text-primary') + '"><span class="material-symbols-outlined text-2xl">' +
          escapeHtml(o.icon || 'emoji_events') + '</span></div>';
      var sub = o.extras || (o.site ? o.site.replace(/^https?:\/\//, '') : 'Olimpíada escolar');
      return '<button type="button" class="text-left bg-white p-card-padding rounded-xl border border-border-subtle shadow-sm hover:shadow-md hover:border-primary/30 transition-all cursor-pointer w-full" data-open-olimpiada="' + escapeHtml(o.id) + '">' +
        '<div class="flex justify-between items-start mb-6">' + logoHtml +
        '<span class="px-2 py-1 ' + badge + ' rounded text-label-sm font-bold">' + escapeHtml(st) + '</span></div>' +
        '<h3 class="font-headline-sm text-headline-sm text-on-surface mb-2">' + escapeHtml(o.nome) + '</h3>' +
        '<p class="text-label-md text-text-secondary mb-2 line-clamp-2">' + escapeHtml(sub) + '</p>' +
        '<p class="text-[11px] text-outline mb-4">' + escapeHtml(formatDateBr(o.dataInicio)) + ' — ' + escapeHtml(formatDateBr(o.dataLimite)) + '</p>' +
        '<div class="flex items-center text-label-sm text-on-surface-variant gap-2">' +
        '<span class="material-symbols-outlined text-sm">group</span>' +
        count + ' Aluno' + (count === 1 ? '' : 's') + ' Inscrito' + (count === 1 ? '' : 's') +
        '</div></button>';
    }).join('');
  }

  function renderAgendaProvas() {
    var box = document.getElementById('agenda-provas-olimpiadas');
    if (!box) return;
    var list = getOlimpiadas().slice().sort(function (a, b) {
      return String(a.dataInicio || '').localeCompare(String(b.dataInicio || ''));
    }).slice(0, 5);
    if (!list.length) {
      box.innerHTML = '<p class="text-body-md text-text-secondary italic">Nenhuma prova agendada.</p>';
      return;
    }
    var months = ['JAN','FEV','MAR','ABR','MAI','JUN','JUL','AGO','SET','OUT','NOV','DEZ'];
    box.innerHTML = list.map(function (o) {
      var d = (o.dataInicio || '').split('-');
      var mon = d.length === 3 ? months[parseInt(d[1], 10) - 1] : '—';
      var day = d.length === 3 ? String(parseInt(d[2], 10)) : '—';
      return '<div class="flex items-start gap-4">' +
        '<div class="w-12 h-12 bg-surface-container rounded flex flex-col items-center justify-center border border-border-subtle">' +
        '<span class="text-label-sm font-bold text-primary">' + escapeHtml(mon) + '</span>' +
        '<span class="text-headline-sm font-bold">' + escapeHtml(day) + '</span></div>' +
        '<div><h4 class="text-body-md font-bold text-on-surface">' + escapeHtml(o.nome) + '</h4>' +
        '<p class="text-label-sm text-text-secondary">Até ' + escapeHtml(formatDateBr(o.dataLimite)) +
        (o.site ? ' · <a class="text-primary underline" href="' + escapeHtml(o.site) + '" target="_blank" rel="noopener">site</a>' : '') +
        '</p></div></div>';
    }).join('');
  }

  function renderRadarAlunos() {
    var tbody = document.getElementById('radar-olimpico-tbody');
    if (!tbody) return;
    var insc = getInscricoes();
    var byAluno = {};
    insc.forEach(function (i) {
      if (!byAluno[i.alunoId]) {
        byAluno[i.alunoId] = { alunoId: i.alunoId, nome: i.alunoNome, turma: i.alunoTurma, count: 0, olimpiadas: [] };
      }
      byAluno[i.alunoId].count += 1;
      var ol = getOlimpiadas().find(function (o) { return o.id === i.olimpiadaId; });
      if (ol) byAluno[i.alunoId].olimpiadas.push(ol.nome);
    });
    var rows = Object.keys(byAluno).map(function (k) { return byAluno[k]; });
    if (!rows.length) {
      tbody.innerHTML = '<tr><td colspan="4" class="px-6 py-10 text-center text-text-secondary">Nenhuma inscrição ainda. Cadastre olimpíadas e adicione alunos.</td></tr>';
      return;
    }
    tbody.innerHTML = rows.map(function (r) {
      var initials = (r.nome || '?').split(/\s+/).slice(0, 2).map(function (p) { return p[0]; }).join('').toUpperCase();
      var medalhasAluno = getInscricoes().filter(function (i) {
        return String(i.alunoId) === String(r.alunoId) && normalizeMedalha(i.medalha);
      }).map(function (i) { return normalizeMedalha(i.medalha); });
      var statusLabel = medalhasAluno.length
        ? medalhasAluno.map(function (m) {
            return m.charAt(0).toUpperCase() + m.slice(1);
          }).join(', ')
        : 'Ativo';
      var statusClass = medalhasAluno.length ? 'text-amber-700' : 'text-primary';
      return '<tr class="hover:bg-surface-container-low transition-colors">' +
        '<td class="px-6 py-5"><div class="flex items-center gap-3">' +
        '<div class="w-10 h-10 rounded-full bg-primary-light/20 flex items-center justify-center text-primary font-bold">' + escapeHtml(initials) + '</div>' +
        '<div><p class="text-body-md font-bold text-on-surface">' + escapeHtml(r.nome) + '</p>' +
        '<p class="text-label-sm text-text-secondary">' + escapeHtml(r.turma || '—') + '</p></div></div></td>' +
        '<td class="px-6 py-5"><span class="text-body-md font-medium">' + r.count + ' inscrição' + (r.count === 1 ? '' : 'ões') + '</span></td>' +
        '<td class="px-6 py-5"><p class="text-label-md text-text-secondary line-clamp-2">' + escapeHtml(r.olimpiadas.join(', ')) + '</p></td>' +
        '<td class="px-6 py-5 text-right"><span class="text-label-sm ' + statusClass + ' font-bold">' + escapeHtml(statusLabel) + '</span></td></tr>';
    }).join('');
  }

  function openNovaOlimpiadaModal() {
    var form = document.getElementById('form-nova-olimpiada');
    if (form) form.reset();
    var preview = document.getElementById('olimp-logo-preview');
    if (preview) {
      preview.classList.add('hidden');
      preview.removeAttribute('src');
    }
    document.getElementById('olimp-logo-data').value = '';
    openModal('modal-nova-olimpiada');
  }

  function submitNovaOlimpiada(e) {
    e.preventDefault();
    var nome = (document.getElementById('olimp-nome').value || '').trim();
    var site = (document.getElementById('olimp-site').value || '').trim();
    var dataInicio = document.getElementById('olimp-data-inicio').value;
    var dataLimite = document.getElementById('olimp-data-limite').value;
    var extras = (document.getElementById('olimp-extras').value || '').trim();
    var logo = document.getElementById('olimp-logo-data').value || '';
    if (!nome) {
      showOlimpiadaToast('Informe o nome da olimpíada.', 'error');
      return;
    }
    if (!dataInicio || !dataLimite) {
      showOlimpiadaToast('Informe as datas de início e limite da prova.', 'error');
      return;
    }
    if (dataLimite < dataInicio) {
      showOlimpiadaToast('A data limite não pode ser anterior à data de início.', 'error');
      return;
    }
    var list = getOlimpiadas();
    list.unshift({
      id: uid('ol'),
      nome: nome,
      site: site,
      dataInicio: dataInicio,
      dataLimite: dataLimite,
      logo: logo,
      extras: extras,
      status: 'Inscrições',
      icon: 'emoji_events',
      iconBg: 'bg-primary-fixed',
      iconColor: 'text-primary',
      badgeClass: 'bg-green-100 text-green-700',
      createdAt: todayISO()
    });
    saveOlimpiadas(list);
    closeModal('modal-nova-olimpiada');
    refreshAdminViews();
    showOlimpiadaToast('Olimpíada registrada com sucesso.');
  }

  function openEditOlimpiadaModal(id) {
    var o = getOlimpiadas().find(function (x) { return x.id === id; });
    if (!o) {
      showOlimpiadaToast('Olimpíada não encontrada.', 'error');
      return;
    }
    document.getElementById('edit-olimp-id').value = o.id;
    document.getElementById('edit-olimp-nome').value = o.nome || '';
    document.getElementById('edit-olimp-site').value = o.site || '';
    document.getElementById('edit-olimp-data-inicio').value = o.dataInicio || '';
    document.getElementById('edit-olimp-data-limite').value = o.dataLimite || '';
    document.getElementById('edit-olimp-extras').value = o.extras || '';
    document.getElementById('edit-olimp-status').value = o.status || 'Inscrições';
    document.getElementById('edit-olimp-logo-data').value = o.logo || '';
    var preview = document.getElementById('edit-olimp-logo-preview');
    if (preview) {
      if (o.logo) {
        preview.src = o.logo;
        preview.classList.remove('hidden');
      } else {
        preview.classList.add('hidden');
        preview.removeAttribute('src');
      }
    }
    populateEditInscTurma();
    populateEditInscAluno('');
    renderEditInscritos(o.id);
    openModal('modal-edit-olimpiada');
  }

  function renderEditInscritos(olimpiadaId) {
    var box = document.getElementById('edit-inscritos-list');
    var countEl = document.getElementById('edit-inscritos-count');
    var list = inscricoesDaOlimpiada(olimpiadaId);
    if (countEl) countEl.textContent = list.length + (list.length === 1 ? ' inscrito' : ' inscritos');
    if (!box) return;
    if (!list.length) {
      box.innerHTML = '<p class="text-body-md text-text-secondary italic py-4 text-center">Nenhum aluno inscrito ainda.</p>';
      return;
    }
    box.innerHTML = list.map(function (i) {
      var medal = normalizeMedalha(i.medalha);
      return '<div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 py-2.5 border-b border-border-subtle last:border-0">' +
        '<div class="min-w-0"><p class="text-body-md font-semibold text-on-surface">' + escapeHtml(i.alunoNome) + '</p>' +
        '<p class="text-label-md text-text-secondary">Turma ' + escapeHtml(i.alunoTurma || '—') +
        ' · ' + escapeHtml(formatDateBr(i.dataInscricao)) +
        ' · ' + escapeHtml(i.origem === 'portal' ? 'Portal do aluno' : 'Admin') + '</p></div>' +
        '<div class="flex items-center gap-2 shrink-0">' +
        '<select class="px-2 py-1.5 border border-border-subtle rounded-lg text-xs bg-white" data-medalha-insc="' + escapeHtml(i.id) + '" title="Medalha">' +
        '<option value=""' + (!medal ? ' selected' : '') + '>Sem medalha</option>' +
        '<option value="ouro"' + (medal === 'ouro' ? ' selected' : '') + '>Ouro</option>' +
        '<option value="prata"' + (medal === 'prata' ? ' selected' : '') + '>Prata</option>' +
        '<option value="bronze"' + (medal === 'bronze' ? ' selected' : '') + '>Bronze</option>' +
        '</select>' +
        '<button type="button" class="p-2 text-error hover:bg-red-50 rounded-lg" data-remove-insc="' + escapeHtml(i.id) + '" title="Remover inscrição">' +
        '<span class="material-symbols-outlined text-[18px]">person_remove</span></button></div></div>';
    }).join('');
  }

  function populateEditInscTurma() {
    var sel = document.getElementById('edit-insc-turma');
    if (!sel) return;
    var codes = {};
    getStudents().forEach(function (s) {
      var c = normalizeTurmaCode(s.turma);
      if (c) codes[c] = true;
    });
    getTurmas().forEach(function (c) { if (c && c.code) codes[c.code] = true; });
    sel.innerHTML = '<option value="">Turma...</option>' +
      Object.keys(codes).sort().map(function (c) {
        return '<option value="' + escapeHtml(c) + '">' + escapeHtml(c) + '</option>';
      }).join('');
  }

  function populateEditInscAluno(turmaCode) {
    var sel = document.getElementById('edit-insc-aluno');
    if (!sel) return;
    var code = normalizeTurmaCode(turmaCode);
    if (!code) {
      sel.innerHTML = '<option value="">Selecione a turma...</option>';
      sel.disabled = true;
      return;
    }
    var olimpiadaId = document.getElementById('edit-olimp-id').value;
    var students = getStudents().filter(function (s) {
      return normalizeTurmaCode(s.turma) === code && !jaInscrito(olimpiadaId, s.id);
    });
    if (!students.length) {
      sel.innerHTML = '<option value="">Nenhum aluno disponível nesta turma</option>';
      sel.disabled = true;
      return;
    }
    sel.disabled = false;
    sel.innerHTML = '<option value="">Selecione o aluno...</option>' +
      students.map(function (s) {
        return '<option value="' + escapeHtml(s.id) + '">' + escapeHtml(s.nome) + '</option>';
      }).join('');
  }

  function submitEditOlimpiada(e) {
    e.preventDefault();
    var id = document.getElementById('edit-olimp-id').value;
    var list = getOlimpiadas();
    var idx = list.findIndex(function (o) { return o.id === id; });
    if (idx < 0) {
      showOlimpiadaToast('Olimpíada não encontrada.', 'error');
      return;
    }
    var nome = (document.getElementById('edit-olimp-nome').value || '').trim();
    var dataInicio = document.getElementById('edit-olimp-data-inicio').value;
    var dataLimite = document.getElementById('edit-olimp-data-limite').value;
    if (!nome || !dataInicio || !dataLimite) {
      showOlimpiadaToast('Preencha nome e datas.', 'error');
      return;
    }
    if (dataLimite < dataInicio) {
      showOlimpiadaToast('A data limite não pode ser anterior ao início.', 'error');
      return;
    }
    list[idx] = Object.assign({}, list[idx], {
      nome: nome,
      site: (document.getElementById('edit-olimp-site').value || '').trim(),
      dataInicio: dataInicio,
      dataLimite: dataLimite,
      extras: (document.getElementById('edit-olimp-extras').value || '').trim(),
      status: document.getElementById('edit-olimp-status').value || 'Inscrições',
      logo: document.getElementById('edit-olimp-logo-data').value || list[idx].logo || ''
    });
    saveOlimpiadas(list);
    closeModal('modal-edit-olimpiada');
    refreshAdminViews();
    showOlimpiadaToast('Olimpíada atualizada.');
  }

  function addInscritoFromEdit() {
    var olimpiadaId = document.getElementById('edit-olimp-id').value;
    var alunoId = document.getElementById('edit-insc-aluno').value;
    if (!alunoId) {
      showOlimpiadaToast('Selecione o aluno.', 'error');
      return;
    }
    var aluno = getStudents().find(function (s) { return String(s.id) === String(alunoId); });
    var result = inscreverAluno(olimpiadaId, aluno, 'admin');
    if (!result.ok) {
      showOlimpiadaToast(result.reason, 'error');
      return;
    }
    populateEditInscAluno(document.getElementById('edit-insc-turma').value);
    renderEditInscritos(olimpiadaId);
    refreshAdminViews();
    showOlimpiadaToast('Aluno inscrito.');
  }

  function excluirOlimpiadaAtual() {
    var id = document.getElementById('edit-olimp-id').value;
    var o = getOlimpiadas().find(function (x) { return x.id === id; });
    if (!o) return;
    if (!confirm('Excluir a olimpíada "' + o.nome + '" e todas as inscrições?')) return;
    saveOlimpiadas(getOlimpiadas().filter(function (x) { return x.id !== id; }));
    saveInscricoes(getInscricoes().filter(function (i) { return i.olimpiadaId !== id; }));
    closeModal('modal-edit-olimpiada');
    refreshAdminViews();
    showOlimpiadaToast('Olimpíada excluída.', 'info');
  }

  function exportCronograma() {
    var lines = ['Olimpíada;Site;Início;Limite;Status;Inscritos'];
    getOlimpiadas().forEach(function (o) {
      lines.push([
        o.nome, o.site || '', formatDateBr(o.dataInicio), formatDateBr(o.dataLimite),
        statusFromDates(o), String(inscricoesDaOlimpiada(o.id).length)
      ].map(function (c) { return '"' + String(c).replace(/"/g, '""') + '"'; }).join(';'));
    });
    var blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'cronograma-olimpiadas-2026.csv';
    a.click();
    URL.revokeObjectURL(a.href);
    showOlimpiadaToast('Cronograma exportado.');
  }

  function bindLogoInput(inputId, dataId, previewId) {
    var input = document.getElementById(inputId);
    if (!input) return;
    input.addEventListener('change', function () {
      var file = input.files && input.files[0];
      if (!file) return;
      readFileAsDataUrl(file).then(function (data) {
        document.getElementById(dataId).value = data;
        var preview = document.getElementById(previewId);
        if (preview) {
          preview.src = data;
          preview.classList.remove('hidden');
        }
      }).catch(function (err) {
        showOlimpiadaToast(err.message || 'Erro no upload.', 'error');
        input.value = '';
      });
    });
  }

  function refreshAdminViews() {
    renderOlimpiadasCards();
    renderAgendaProvas();
    renderRadarAlunos();
    renderHallDaFama();
  }

  function bindAdminEvents() {
    var formNew = document.getElementById('form-nova-olimpiada');
    if (formNew) formNew.addEventListener('submit', submitNovaOlimpiada);
    var formEdit = document.getElementById('form-edit-olimpiada');
    if (formEdit) formEdit.addEventListener('submit', submitEditOlimpiada);

    bindLogoInput('olimp-logo', 'olimp-logo-data', 'olimp-logo-preview');
    bindLogoInput('edit-olimp-logo', 'edit-olimp-logo-data', 'edit-olimp-logo-preview');

    var turma = document.getElementById('edit-insc-turma');
    if (turma) {
      turma.addEventListener('change', function () {
        populateEditInscAluno(turma.value);
      });
    }

    var btnAdd = document.getElementById('btn-add-inscrito');
    if (btnAdd) btnAdd.addEventListener('click', addInscritoFromEdit);

    var grid = document.getElementById('olimpiadas-grid');
    if (grid) {
      grid.addEventListener('click', function (e) {
        var btn = e.target.closest('[data-open-olimpiada]');
        if (btn) openEditOlimpiadaModal(btn.getAttribute('data-open-olimpiada'));
      });
    }

    var inscBox = document.getElementById('edit-inscritos-list');
    if (inscBox) {
      inscBox.addEventListener('click', function (e) {
        var btn = e.target.closest('[data-remove-insc]');
        if (!btn) return;
        if (!confirm('Remover esta inscrição?')) return;
        removerInscricao(btn.getAttribute('data-remove-insc'));
        var oid = document.getElementById('edit-olimp-id').value;
        populateEditInscAluno(document.getElementById('edit-insc-turma').value);
        renderEditInscritos(oid);
        refreshAdminViews();
        showOlimpiadaToast('Inscrição removida.', 'info');
      });
      inscBox.addEventListener('change', function (e) {
        var sel = e.target.closest('[data-medalha-insc]');
        if (!sel) return;
        if (setInscricaoMedalha(sel.getAttribute('data-medalha-insc'), sel.value)) {
          refreshAdminViews();
          showOlimpiadaToast('Medalha atualizada.');
        }
      });
    }
  }

  function initTopoDoSaberPage() {
    getOlimpiadas();
    getStudents();
    bindAdminEvents();
    refreshAdminViews();
  }

  /* ========== Portal do aluno ========== */

  function getPortalAlunoId() {
    var params = new URLSearchParams(window.location.search || '');
    var fromUrl = params.get('aluno');
    if (fromUrl) {
      localStorage.setItem(PORTAL_ALUNO_KEY, fromUrl);
      return fromUrl;
    }
    return localStorage.getItem(PORTAL_ALUNO_KEY) || '';
  }

  function setPortalAlunoId(id) {
    localStorage.setItem(PORTAL_ALUNO_KEY, id || '');
  }

  function renderPortalAlunoSelect() {
    var sel = document.getElementById('portal-aluno-select');
    if (!sel) return;
    var students = getStudents();
    var current = getPortalAlunoId();
    sel.innerHTML = '<option value="">Selecione seu nome...</option>' +
      students.map(function (s) {
        return '<option value="' + escapeHtml(s.id) + '">' +
          escapeHtml(s.nome) + ' (' + escapeHtml(normalizeTurmaCode(s.turma) || '—') + ')</option>';
      }).join('');
    if (current) sel.value = current;
  }

  function renderPortalOlimpiadas() {
    var grid = document.getElementById('portal-olimpiadas-grid');
    var alunoId = getPortalAlunoId();
    var info = document.getElementById('portal-aluno-info');
    if (info) {
      var aluno = getStudents().find(function (s) { return String(s.id) === String(alunoId); });
      info.textContent = aluno
        ? ('Logado como: ' + aluno.nome + ' · Turma ' + (normalizeTurmaCode(aluno.turma) || '—'))
        : 'Selecione o aluno para ver e realizar inscrições.';
    }
    if (!grid) return;
    var list = getOlimpiadas();
    if (!list.length) {
      grid.innerHTML = '<p class="col-span-full text-center text-text-secondary py-10">Nenhuma olimpíada disponível.</p>';
      return;
    }
    grid.innerHTML = list.map(function (o) {
      var st = statusFromDates(o);
      var inscrito = alunoId && jaInscrito(o.id, alunoId);
      var podeInscrever = !!alunoId && !inscrito && st !== 'Finalizada' && st !== 'Encerrada';
      var logoHtml = o.logo
        ? '<img src="' + escapeHtml(o.logo) + '" class="w-14 h-14 rounded-xl object-cover border border-border-subtle" alt=""/>'
        : '<div class="w-14 h-14 rounded-xl bg-primary/10 text-primary flex items-center justify-center"><span class="material-symbols-outlined text-3xl">emoji_events</span></div>';
      var btnLabel = !alunoId ? 'Selecione o aluno' : (inscrito ? 'Já inscrito' : (podeInscrever ? 'Inscrever-me' : 'Inscrições encerradas'));
      var btnClass = inscrito
        ? 'bg-green-100 text-green-800 cursor-default'
        : (podeInscrever ? 'bg-primary text-white hover:bg-primary/90' : 'bg-surface-container text-text-secondary cursor-not-allowed');
      return '<div class="bg-white rounded-2xl border border-border-subtle shadow-sm p-5 flex flex-col gap-4">' +
        '<div class="flex gap-4 items-start">' + logoHtml +
        '<div class="flex-1 min-w-0"><div class="flex items-start justify-between gap-2">' +
        '<h3 class="font-headline-sm font-bold text-on-surface">' + escapeHtml(o.nome) + '</h3>' +
        '<span class="shrink-0 px-2 py-0.5 rounded text-[11px] font-bold ' + badgeClassForStatus(st) + '">' + escapeHtml(st) + '</span></div>' +
        '<p class="text-label-md text-text-secondary mt-1">' + escapeHtml(o.extras || 'Olimpíada escolar') + '</p>' +
        '<p class="text-[11px] text-outline mt-2">Prova: ' + escapeHtml(formatDateBr(o.dataInicio)) + ' — ' + escapeHtml(formatDateBr(o.dataLimite)) + '</p>' +
        (o.site ? '<a class="text-label-md text-primary font-semibold underline mt-1 inline-block" href="' + escapeHtml(o.site) + '" target="_blank" rel="noopener">Site oficial</a>' : '') +
        '</div></div>' +
        '<button type="button" class="w-full py-2.5 rounded-xl font-bold text-sm transition-colors ' + btnClass + '" ' +
        (podeInscrever ? 'data-portal-inscrever="' + escapeHtml(o.id) + '"' : 'disabled') + '>' +
        btnLabel + '</button></div>';
    }).join('');
  }

  function portalInscrever(olimpiadaId) {
    var alunoId = getPortalAlunoId();
    if (!alunoId) {
      showOlimpiadaToast('Selecione o aluno no portal.', 'error');
      return;
    }
    if (jaInscrito(olimpiadaId, alunoId)) {
      showOlimpiadaToast('Você já está inscrito nesta olimpíada.', 'error');
      return;
    }
    var aluno = getStudents().find(function (s) { return String(s.id) === String(alunoId); });
    var result = inscreverAluno(olimpiadaId, aluno, 'portal');
    if (!result.ok) {
      showOlimpiadaToast(result.reason, 'error');
      return;
    }
    renderPortalOlimpiadas();
    showOlimpiadaToast('Inscrição realizada com sucesso!');
  }

  function initPortalAlunoPage() {
    getOlimpiadas();
    getStudents();
    renderPortalAlunoSelect();
    renderPortalOlimpiadas();

    var sel = document.getElementById('portal-aluno-select');
    if (sel) {
      // Se veio do login como aluno, trava a identificação na sessão
      try {
        var session = JSON.parse(localStorage.getItem('siga_session') || 'null');
        if (session && session.tipo === 'aluno' && session.id) {
          sel.value = String(session.id);
          setPortalAlunoId(String(session.id));
          sel.disabled = true;
          var info = document.getElementById('portal-aluno-info');
          if (info) info.textContent = 'Logado como ' + (session.nome || 'aluno') + ' · ' + (session.email || '');
          renderPortalOlimpiadas();
        }
      } catch (e) { /* ignore */ }

      sel.addEventListener('change', function () {
        setPortalAlunoId(sel.value);
        renderPortalOlimpiadas();
      });
    }

    var grid = document.getElementById('portal-olimpiadas-grid');
    if (grid) {
      grid.addEventListener('click', function (e) {
        var btn = e.target.closest('[data-portal-inscrever]');
        if (!btn) return;
        portalInscrever(btn.getAttribute('data-portal-inscrever'));
      });
    }
  }

  window.getOlimpiadas = getOlimpiadas;
  window.getInscricoesOlimpiadas = getInscricoes;
  window.inscreverAlunoOlimpiada = inscreverAluno;
  window.jaInscritoOlimpiada = jaInscrito;
  window.openNovaOlimpiadaModal = openNovaOlimpiadaModal;
  window.openEditOlimpiadaModal = openEditOlimpiadaModal;
  window.closeModalOlimpiada = closeModal;
  window.excluirOlimpiadaAtual = excluirOlimpiadaAtual;
  window.exportCronogramaOlimpiadas = exportCronograma;
  window.initTopoDoSaberPage = initTopoDoSaberPage;
  window.initPortalAlunoPage = initPortalAlunoPage;
  window.showOlimpiadaToast = showOlimpiadaToast;

  document.addEventListener('DOMContentLoaded', function () {
    var path = (window.location.pathname || '').toLowerCase();
    if (path.indexOf('topodosaber.html') !== -1) initTopoDoSaberPage();
    if (path.indexOf('portal-aluno.html') !== -1) initPortalAlunoPage();
  });
})();
