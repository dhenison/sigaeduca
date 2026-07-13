/**
 * SIGA Educa — Controle de Livros (acervo e empréstimos)
 * localStorage: siga_books, siga_book_returns
 */
(function () {
  'use strict';

  var BOOKS_KEY = 'siga_books';
  var RETURNS_KEY = 'siga_book_returns';

  function uid(prefix) {
    return (prefix || 'bk') + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7);
  }

  function todayISO() {
    return new Date().toISOString().slice(0, 10);
  }

  function addDaysISO(days) {
    var d = new Date();
    d.setDate(d.getDate() + (days || 14));
    return d.toISOString().slice(0, 10);
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

  function getDefaultBooks() {
    return [];
  }

  function getBooks() {
    try {
      var raw = JSON.parse(localStorage.getItem(BOOKS_KEY) || 'null');
      if (!raw || !raw.length) {
        raw = getDefaultBooks();
        localStorage.setItem(BOOKS_KEY, JSON.stringify(raw));
      }
      return raw;
    } catch (e) {
      return getDefaultBooks();
    }
  }

  function saveBooks(list) {
    localStorage.setItem(BOOKS_KEY, JSON.stringify(list || []));
  }

  function getReturns() {
    try {
      return JSON.parse(localStorage.getItem(RETURNS_KEY) || '[]') || [];
    } catch (e) {
      return [];
    }
  }

  function saveReturns(list) {
    localStorage.setItem(RETURNS_KEY, JSON.stringify(list || []));
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
      var classes = JSON.parse(localStorage.getItem('siga_classes') || '[]');
      return classes || [];
    } catch (e) {
      return [];
    }
  }

  function turmaLabel(cls) {
    if (!cls) return '—';
    if (typeof cls === 'string') return cls;
    var code = cls.code || '';
    var serie = cls.serie || '';
    return code ? (code + (serie ? ' - ' + serie : '')) : serie || '—';
  }

  function normalizeTurmaCode(value) {
    return String(value || '').split(' - ')[0].trim();
  }

  function getLoanStatus(book) {
    if (!book || !book.loan) return 'Disponível';
    var limite = String(book.loan.dataLimite || '').slice(0, 10);
    if (limite && limite < todayISO()) return 'Atrasado';
    return 'Emprestado';
  }

  function topCategoria(books) {
    var map = {};
    books.forEach(function (b) {
      if (!b.loan) return;
      var c = b.categoria || 'Geral';
      map[c] = (map[c] || 0) + 1;
    });
    var best = '—';
    var max = 0;
    Object.keys(map).forEach(function (k) {
      if (map[k] > max) { max = map[k]; best = k; }
    });
    return best;
  }

  function showLivrosToast(msg, type) {
    type = type || 'success';
    var el = document.getElementById('livros-toast');
    if (!el) {
      if (typeof showToast === 'function') showToast(msg);
      return;
    }
    el.textContent = msg;
    el.setAttribute('data-type', type);
    el.classList.remove('hidden');
    clearTimeout(el._t);
    el._t = setTimeout(function () { el.classList.add('hidden'); }, 3000);
  }

  function updateKPIs(books) {
    var ativos = books.filter(function (b) { return !!b.loan; }).length;
    var atrasados = books.filter(function (b) { return getLoanStatus(b) === 'Atrasado'; }).length;
    var elAcervo = document.getElementById('kpi-acervo');
    var elAtivos = document.getElementById('kpi-ativos');
    var elAtrasados = document.getElementById('kpi-atrasados');
    var elTop = document.getElementById('kpi-top-cat');
    if (elAcervo) elAcervo.textContent = String(books.length);
    if (elAtivos) elAtivos.textContent = String(ativos);
    if (elAtrasados) elAtrasados.textContent = String(atrasados);
    if (elTop) elTop.textContent = topCategoria(books);
    var badgeCirc = document.getElementById('kpi-circ-badge');
    if (badgeCirc) {
      var pct = books.length ? Math.round((ativos / books.length) * 100) : 0;
      badgeCirc.textContent = pct + '% circulação';
    }
  }

  function statusBadge(status) {
    if (status === 'Atrasado') {
      return '<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-error-container text-on-error-container">Atrasado</span>';
    }
    if (status === 'Emprestado') {
      return '<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-secondary-container/10 text-secondary">Emprestado</span>';
    }
    return '<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-primary-light/20 text-primary">Disponível</span>';
  }

  function renderReturns() {
    var box = document.getElementById('ultimas-devolucoes');
    if (!box) return;
    var list = getReturns().slice(0, 5);
    if (!list.length) {
      box.innerHTML = '<p class="text-body-md text-text-secondary italic">Nenhuma devolução recente.</p>';
      return;
    }
    box.innerHTML = list.map(function (r) {
      return '<div class="flex items-center justify-between gap-3 py-2 border-b border-border-subtle last:border-0">' +
        '<div><p class="text-body-md font-semibold text-on-surface">' + escapeHtml(r.titulo) + '</p>' +
        '<p class="text-label-md text-text-secondary">' + escapeHtml(r.alunoNome || '—') + '</p></div>' +
        '<span class="text-label-md text-text-secondary">' + escapeHtml(formatDateBr(r.dataDevolucao)) + '</span></div>';
    }).join('');
  }

  function renderLivrosTable() {
    var books = getBooks();
    updateKPIs(books);
    renderReturns();

    var q = ((document.getElementById('livros-search') || {}).value || '').toLowerCase().trim();
    var fStatus = (document.getElementById('filter-status-livro') || {}).value || '';
    var fCat = (document.getElementById('filter-categoria-livro') || {}).value || '';

    var list = books.filter(function (b) {
      var st = getLoanStatus(b);
      if (fStatus && st !== fStatus) return false;
      if (fCat && (b.categoria || '') !== fCat) return false;
      if (q) {
        var hay = (b.titulo + ' ' + b.autor + ' ' + b.isbn + ' ' + (b.loan ? b.loan.alunoNome : '')).toLowerCase();
        if (hay.indexOf(q) === -1) return false;
      }
      return true;
    });

    var tbody = document.getElementById('livros-tbody');
    var countEl = document.getElementById('livros-count');
    if (countEl) {
      countEl.textContent = list.length + (list.length === 1 ? ' título' : ' títulos');
    }
    if (!tbody) return;

    if (!list.length) {
      tbody.innerHTML = '<tr><td colspan="7" class="px-6 py-12 text-center text-text-secondary">Nenhum registro encontrado.</td></tr>';
      return;
    }

    tbody.innerHTML = list.map(function (b) {
      var st = getLoanStatus(b);
      var loan = b.loan;
      var alunoHtml = loan
        ? '<p class="text-body-md text-on-surface">' + escapeHtml(loan.alunoNome) + '</p>' +
          '<p class="text-label-md text-text-secondary">' + escapeHtml(loan.alunoTurma || '') + '</p>'
        : '<p class="text-body-md text-outline italic">Disponível</p>';
      var pedidoHtml = loan
        ? '<p class="text-body-md text-on-surface">' + escapeHtml(formatDateBr(loan.dataEmprestimo || loan.dataPedido)) + '</p>'
        : '<p class="text-body-md text-outline">—</p>';
      var limiteHtml = loan
        ? '<p class="text-body-md ' + (st === 'Atrasado' ? 'font-bold text-error' : 'text-on-surface') + '">' +
          escapeHtml(formatDateBr(loan.dataLimite)) + '</p>'
        : '<p class="text-body-md text-outline">—</p>';

      var actions =
        '<div class="relative inline-block text-left">' +
        '<button type="button" class="p-2 text-outline hover:text-primary transition-colors btn-livro-menu" data-id="' + b.id + '">' +
        '<span class="material-symbols-outlined">more_vert</span></button>' +
        '<div class="action-menu-livro hidden absolute right-0 top-full mt-1 z-30 min-w-[200px] bg-white border border-border-subtle rounded-xl shadow-lg overflow-hidden" id="menu-livro-' + b.id + '">';

      if (!loan) {
        actions += '<button type="button" class="w-full text-left px-4 py-2.5 text-body-md hover:bg-surface-container-low flex items-center gap-2" data-action="emprestar" data-id="' + b.id + '">' +
          '<span class="material-symbols-outlined text-[16px]">handshake</span>Emprestar</button>';
      } else {
        actions += '<button type="button" class="w-full text-left px-4 py-2.5 text-body-md hover:bg-surface-container-low flex items-center gap-2" data-action="renovar" data-id="' + b.id + '">' +
          '<span class="material-symbols-outlined text-[16px]">event_repeat</span>Renovar empréstimo</button>';
        actions += '<button type="button" class="w-full text-left px-4 py-2.5 text-body-md hover:bg-surface-container-low flex items-center gap-2" data-action="devolver" data-id="' + b.id + '">' +
          '<span class="material-symbols-outlined text-[16px]">assignment_return</span>Devolver</button>';
      }
      actions += '<button type="button" class="w-full text-left px-4 py-2.5 text-body-md hover:bg-red-50 text-error flex items-center gap-2" data-action="excluir" data-id="' + b.id + '">' +
        '<span class="material-symbols-outlined text-[16px]">delete</span>Excluir</button>';
      actions += '</div></div>';

      return '<tr class="hover:bg-surface-container-low/20 transition-colors">' +
        '<td class="px-6 py-4"><div class="flex items-center gap-3">' +
        '<div class="w-10 h-12 bg-primary/10 text-primary flex-shrink-0 rounded-md flex items-center justify-center">' +
        '<span class="material-symbols-outlined">menu_book</span></div>' +
        '<div><p class="text-body-md font-bold text-on-surface">' + escapeHtml(b.titulo) + '</p>' +
        '<p class="text-label-md text-text-secondary">ISBN: ' + escapeHtml(b.isbn || '—') + '</p></div></div></td>' +
        '<td class="px-6 py-4"><p class="text-body-md text-on-surface">' + escapeHtml(b.autor) + '</p>' +
        '<span class="inline-block px-2 py-0.5 rounded text-[10px] font-bold bg-surface-container text-outline uppercase">' +
        escapeHtml(b.categoria || 'Geral') + '</span></td>' +
        '<td class="px-6 py-4">' + alunoHtml + '</td>' +
        '<td class="px-6 py-4">' + pedidoHtml + '</td>' +
        '<td class="px-6 py-4">' + limiteHtml + '</td>' +
        '<td class="px-6 py-4">' + statusBadge(st) + '</td>' +
        '<td class="px-6 py-4 text-right">' + actions + '</td></tr>';
    }).join('');
  }

  function populateCategoriaFilter() {
    var sel = document.getElementById('filter-categoria-livro');
    if (!sel) return;
    var cats = {};
    getBooks().forEach(function (b) { if (b.categoria) cats[b.categoria] = true; });
    var current = sel.value;
    sel.innerHTML = '<option value="">Todas as categorias</option>' +
      Object.keys(cats).sort().map(function (c) {
        return '<option value="' + escapeHtml(c) + '">' + escapeHtml(c) + '</option>';
      }).join('');
    if (current) sel.value = current;
  }

  function populateLivroSelect(preselectId) {
    var sel = document.getElementById('loan-book-id');
    if (!sel) return;
    var disponiveis = getBooks().filter(function (b) { return !b.loan; });
    if (!disponiveis.length) {
      sel.innerHTML = '<option value="">Nenhum livro disponível no acervo</option>';
      sel.disabled = true;
      return;
    }
    sel.disabled = false;
    sel.innerHTML = '<option value="">Selecione o livro...</option>' +
      disponiveis.map(function (b) {
        return '<option value="' + escapeHtml(b.id) + '">' +
          escapeHtml(b.titulo) + ' — ' + escapeHtml(b.autor) +
          (b.categoria ? ' (' + escapeHtml(b.categoria) + ')' : '') +
          '</option>';
      }).join('');
    if (preselectId) sel.value = preselectId;
  }

  function populateTurmaSelect() {
    var sel = document.getElementById('loan-turma');
    if (!sel) return;
    var turmas = getTurmas();
    var fromStudents = {};
    getStudents().forEach(function (s) {
      var code = normalizeTurmaCode(s.turma);
      if (code) fromStudents[code] = true;
    });
    turmas.forEach(function (c) {
      if (c && c.code) fromStudents[c.code] = true;
    });
    var codes = Object.keys(fromStudents).sort();
    sel.innerHTML = '<option value="">Selecione a turma...</option>' +
      codes.map(function (code) {
        var cls = turmas.find(function (c) { return c.code === code; });
        var label = cls ? turmaLabel(cls) : code;
        return '<option value="' + escapeHtml(code) + '">' + escapeHtml(label) + '</option>';
      }).join('');
  }

  function populateAlunoSelect(turmaCode, keepValue) {
    var sel = document.getElementById('loan-aluno');
    if (!sel) return;
    var code = normalizeTurmaCode(turmaCode);
    if (!code) {
      sel.innerHTML = '<option value="">Selecione a turma primeiro...</option>';
      sel.disabled = true;
      return;
    }
    var students = getStudents().filter(function (s) {
      return normalizeTurmaCode(s.turma) === code;
    });
    if (!students.length) {
      sel.innerHTML = '<option value="">Nenhum aluno nesta turma</option>';
      sel.disabled = true;
      return;
    }
    sel.disabled = false;
    var prev = keepValue || '';
    sel.innerHTML = '<option value="">Selecione o aluno...</option>' +
      students.map(function (s) {
        return '<option value="' + escapeHtml(s.id) + '" data-nome="' + escapeHtml(s.nome || '') +
          '" data-turma="' + escapeHtml(normalizeTurmaCode(s.turma) || code) + '">' +
          escapeHtml(s.nome) + '</option>';
      }).join('');
    if (prev) sel.value = prev;
  }

  function openModal(id) {
    var m = document.getElementById(id);
    if (m) m.classList.remove('hidden');
  }

  function closeModal(id) {
    var m = document.getElementById(id);
    if (m) m.classList.add('hidden');
  }

  function openNovoRegistroModal(preselectBookId) {
    var form = document.getElementById('form-emprestar');
    if (form) form.reset();
    populateLivroSelect(preselectBookId || '');
    populateTurmaSelect();
    populateAlunoSelect('');
    document.getElementById('loan-data-pedido').value = todayISO();
    document.getElementById('loan-data-limite').value = addDaysISO(14);
    var disponiveis = getBooks().filter(function (b) { return !b.loan; });
    if (!disponiveis.length) {
      showLivrosToast('Não há livros disponíveis. Cadastre no acervo primeiro.', 'error');
      return;
    }
    openModal('modal-emprestar');
  }

  function openNovoLivroModal() {
    var form = document.getElementById('form-novo-livro');
    if (form) form.reset();
    openModal('modal-novo-livro');
  }

  function submitNovoLivro(e) {
    e.preventDefault();
    var titulo = (document.getElementById('livro-titulo').value || '').trim();
    var autor = (document.getElementById('livro-autor').value || '').trim();
    var categoria = (document.getElementById('livro-categoria').value || '').trim() || 'Geral';
    var isbn = (document.getElementById('livro-isbn').value || '').trim();
    if (!titulo || !autor) {
      showLivrosToast('Preencha título e autor.', 'error');
      return;
    }
    var books = getBooks();
    books.unshift({
      id: uid('bk'), titulo: titulo, autor: autor, categoria: categoria, isbn: isbn, loan: null
    });
    saveBooks(books);
    populateCategoriaFilter();
    closeModal('modal-novo-livro');
    renderLivrosTable();
    showLivrosToast('Livro cadastrado no acervo.');
  }

  function openEmprestarModal(bookId) {
    openNovoRegistroModal(bookId);
  }

  function submitEmprestimo(e) {
    e.preventDefault();
    var bookSel = document.getElementById('loan-book-id');
    var bookId = bookSel.value;
    var turmaCode = (document.getElementById('loan-turma').value || '').trim();
    var alunoSel = document.getElementById('loan-aluno');
    var alunoId = alunoSel.value;
    var dataPedido = document.getElementById('loan-data-pedido').value;
    var dataLimite = document.getElementById('loan-data-limite').value;
    if (!bookId) {
      showLivrosToast('Selecione o livro cadastrado.', 'error');
      return;
    }
    if (!turmaCode) {
      showLivrosToast('Selecione a turma do aluno.', 'error');
      return;
    }
    if (!alunoId || !dataPedido || !dataLimite) {
      showLivrosToast('Preencha aluno, data do pedido e data da devolução.', 'error');
      return;
    }
    if (dataLimite < dataPedido) {
      showLivrosToast('A data da devolução não pode ser anterior à data do pedido.', 'error');
      return;
    }
    var opt = alunoSel.options[alunoSel.selectedIndex];
    var books = getBooks();
    var idx = books.findIndex(function (b) { return b.id === bookId; });
    if (idx < 0 || books[idx].loan) {
      showLivrosToast('Livro indisponível para empréstimo.', 'error');
      return;
    }
    books[idx].loan = {
      id: uid('ln'),
      alunoId: alunoId,
      alunoNome: opt.getAttribute('data-nome') || opt.textContent,
      alunoTurma: opt.getAttribute('data-turma') || turmaCode,
      dataEmprestimo: dataPedido,
      dataPedido: dataPedido,
      dataLimite: dataLimite
    };
    saveBooks(books);
    closeModal('modal-emprestar');
    renderLivrosTable();
    showLivrosToast('Empréstimo registrado.');
  }

  function openRenovarModal(bookId) {
    var book = getBooks().find(function (b) { return b.id === bookId; });
    if (!book || !book.loan) {
      showLivrosToast('Não há empréstimo ativo para renovar.', 'error');
      return;
    }
    document.getElementById('renovar-book-id').value = bookId;
    document.getElementById('renovar-book-title').textContent = book.titulo;
    document.getElementById('renovar-aluno').textContent = book.loan.alunoNome || '—';
    document.getElementById('renovar-pedido').textContent = formatDateBr(book.loan.dataEmprestimo || book.loan.dataPedido);
    document.getElementById('renovar-limite-atual').textContent = formatDateBr(book.loan.dataLimite);
    var next = book.loan.dataLimite && book.loan.dataLimite > todayISO()
      ? book.loan.dataLimite
      : todayISO();
    // default +14 days from current or today
    var base = new Date((book.loan.dataLimite || todayISO()) + 'T00:00:00');
    if (isNaN(base.getTime()) || base < new Date(todayISO() + 'T00:00:00')) {
      base = new Date(todayISO() + 'T00:00:00');
    }
    base.setDate(base.getDate() + 14);
    document.getElementById('renovar-nova-data').value = base.toISOString().slice(0, 10);
    document.getElementById('renovar-nova-data').min = todayISO();
    openModal('modal-renovar');
  }

  function submitRenovacao(e) {
    e.preventDefault();
    var bookId = document.getElementById('renovar-book-id').value;
    var novaData = document.getElementById('renovar-nova-data').value;
    if (!novaData) {
      showLivrosToast('Informe a nova data de devolução.', 'error');
      return;
    }
    if (novaData < todayISO()) {
      showLivrosToast('A data de devolução não pode ser anterior a hoje.', 'error');
      return;
    }
    var books = getBooks();
    var idx = books.findIndex(function (b) { return b.id === bookId; });
    if (idx < 0 || !books[idx].loan) {
      showLivrosToast('Empréstimo não encontrado.', 'error');
      return;
    }
    books[idx].loan.dataLimite = novaData;
    saveBooks(books);
    closeModal('modal-renovar');
    renderLivrosTable();
    showLivrosToast('Empréstimo renovado até ' + formatDateBr(novaData) + '.');
  }

  function devolverLivro(bookId) {
    var books = getBooks();
    var idx = books.findIndex(function (b) { return b.id === bookId; });
    if (idx < 0 || !books[idx].loan) {
      showLivrosToast('Não há empréstimo para devolver.', 'error');
      return;
    }
    if (!confirm('Confirmar devolução de "' + books[idx].titulo + '"?')) return;
    var loan = books[idx].loan;
    var returns = getReturns();
    returns.unshift({
      id: uid('ret'),
      bookId: books[idx].id,
      titulo: books[idx].titulo,
      alunoNome: loan.alunoNome,
      dataDevolucao: todayISO()
    });
    saveReturns(returns.slice(0, 50));
    books[idx].loan = null;
    saveBooks(books);
    renderLivrosTable();
    showLivrosToast('Devolução registrada.');
  }

  function excluirLivro(bookId) {
    var books = getBooks();
    var book = books.find(function (b) { return b.id === bookId; });
    if (!book) return;
    var msg = book.loan
      ? 'Excluir "' + book.titulo + '" e o empréstimo ativo?'
      : 'Excluir "' + book.titulo + '" do acervo?';
    if (!confirm(msg)) return;
    saveBooks(books.filter(function (b) { return b.id !== bookId; }));
    populateCategoriaFilter();
    renderLivrosTable();
    showLivrosToast('Registro excluído.', 'info');
  }

  function bindEvents() {
    var search = document.getElementById('livros-search');
    if (search) search.addEventListener('input', renderLivrosTable);
    var fStatus = document.getElementById('filter-status-livro');
    if (fStatus) fStatus.addEventListener('change', renderLivrosTable);
    var fCat = document.getElementById('filter-categoria-livro');
    if (fCat) fCat.addEventListener('change', renderLivrosTable);

    var formLivro = document.getElementById('form-novo-livro');
    if (formLivro) formLivro.addEventListener('submit', submitNovoLivro);
    var formLoan = document.getElementById('form-emprestar');
    if (formLoan) formLoan.addEventListener('submit', submitEmprestimo);
    var formRen = document.getElementById('form-renovar');
    if (formRen) formRen.addEventListener('submit', submitRenovacao);

    var turmaSel = document.getElementById('loan-turma');
    if (turmaSel) {
      turmaSel.addEventListener('change', function () {
        populateAlunoSelect(turmaSel.value);
      });
    }

    var tbody = document.getElementById('livros-tbody');
    if (tbody) {
      tbody.addEventListener('click', function (e) {
        var menuBtn = e.target.closest('.btn-livro-menu');
        if (menuBtn) {
          e.stopPropagation();
          var id = menuBtn.getAttribute('data-id');
          var menu = document.getElementById('menu-livro-' + id);
          document.querySelectorAll('.action-menu-livro').forEach(function (m) {
            if (m !== menu) m.classList.add('hidden');
          });
          if (menu) menu.classList.toggle('hidden');
          return;
        }
        var actionBtn = e.target.closest('[data-action]');
        if (!actionBtn) return;
        var action = actionBtn.getAttribute('data-action');
        var bookId = actionBtn.getAttribute('data-id');
        document.querySelectorAll('.action-menu-livro').forEach(function (m) { m.classList.add('hidden'); });
        if (action === 'emprestar') openEmprestarModal(bookId);
        else if (action === 'renovar') openRenovarModal(bookId);
        else if (action === 'devolver') devolverLivro(bookId);
        else if (action === 'excluir') excluirLivro(bookId);
      });
    }

    document.addEventListener('click', function () {
      document.querySelectorAll('.action-menu-livro').forEach(function (m) { m.classList.add('hidden'); });
    });
  }

  function initControleLivrosPage() {
    getBooks();
    populateCategoriaFilter();
    bindEvents();
    renderLivrosTable();
  }

  window.getBooks = getBooks;
  window.saveBooks = saveBooks;
  window.renderLivrosTable = renderLivrosTable;
  window.openNovoLivroModal = openNovoLivroModal;
  window.openNovoRegistroModal = openNovoRegistroModal;
  window.openEmprestarModal = openEmprestarModal;
  window.openRenovarModal = openRenovarModal;
  window.devolverLivro = devolverLivro;
  window.excluirLivro = excluirLivro;
  window.closeModalLivros = closeModal;
  window.initControleLivrosPage = initControleLivrosPage;
  window.showLivrosToast = showLivrosToast;

  document.addEventListener('DOMContentLoaded', function () {
    var path = (window.location.pathname || '').toLowerCase();
    if (path.indexOf('controlelivros.html') !== -1) {
      initControleLivrosPage();
    }
  });
})();
