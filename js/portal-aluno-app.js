/**
 * SIGA EDUCA — Portal do Aluno (base do app)
 * Sessão real do SIGA + navegação compartilhada com as telas em /app.
 */
(function (global) {
  "use strict";

  var SESSION_KEY = "siga_session";
  var STUDENTS_KEY = "siga_students";
  var PREFS_KEY = "siga_portal_prefs";
  var ACTIVE_SCHOOL_KEY = "siga_active_school";
  var DOMAIN_ALUNO = "@aluno.seduc.pa.gov.br";

  /** Frases motivacionais (estudos / dedicação) — uma sorteada por dia. */
  var MOTIVATIONAL_QUOTES = [
    { text: "A educação é a arma mais poderosa que você pode usar para mudar o mundo.", author: "Nelson Mandela" },
    { text: "O sucesso é a soma de pequenos esforços repetidos dia após dia.", author: "Robert Collier" },
    { text: "Não espere por oportunidades. Crie-as estudando com constância.", author: "Adaptado de George Bernard Shaw" },
    { text: "A dedicação de hoje constrói o sucesso de amanhã.", author: "Provérbio" },
    { text: "Quem estuda com o coração e a disciplina, colhe frutos que o tempo não apaga.", author: "Provérbio popular" },
    { text: "A perseverança é o caminho invisível entre o esforço e a conquista.", author: "Adaptado" },
    { text: "Investir em conhecimento rende sempre os melhores juros.", author: "Benjamin Franklin" },
    { text: "Não é o talento que define o aluno, e sim a disciplina de estudar todos os dias.", author: "Adaptado" },
    { text: "Cada página lida é um passo a mais rumo ao seu futuro.", author: "Provérbio" },
    { text: "O aprendizado nunca cansa a mente; o que cansa é desistir.", author: "Leonardo da Vinci (adaptado)" },
    { text: "Estude não para provar algo a alguém, mas para tornar-se quem você pode ser.", author: "Adaptado" },
    { text: "A constância vence o que a pressa não alcança.", author: "Provérbio" },
    { text: "Grandes conquistas começam com a coragem de começar a estudar.", author: "Adaptado" },
    { text: "Seu futuro é criado pelo que você faz hoje, não amanhã.", author: "Robert Kiyosaki" },
    { text: "A excelência não é um ato, mas um hábito de dedicação.", author: "Aristóteles" },
    { text: "Não há atalho para o saber: há estudo, prática e paciência.", author: "Provérbio" },
    { text: "O aluno dedicado transforma dúvidas em pontes para o conhecimento.", author: "Adaptado" },
    { text: "Sonhe alto, estude com foco e aja com disciplina.", author: "Adaptado" },
    { text: "O sucesso nos estudos nasce da vontade de aprender um pouco mais a cada dia.", author: "Provérbio" },
    { text: "Educar-se é libertar-se: cada aula é uma chave a mais.", author: "Adaptado de Paulo Freire" },
  ];

  function normEmail(v) {
    return String(v || "")
      .trim()
      .toLowerCase();
  }

  function inAppFolder() {
    return /(?:^|\/)app(?:\/|$)/i.test(String(global.location.pathname || ""));
  }

  function rootPrefix() {
    return inAppFolder() ? "../" : "";
  }

  function getSession() {
    try {
      return JSON.parse(localStorage.getItem(SESSION_KEY) || "null");
    } catch (e) {
      return null;
    }
  }

  function getStudents() {
    try {
      return JSON.parse(localStorage.getItem(STUDENTS_KEY) || "[]") || [];
    } catch (e) {
      return [];
    }
  }

  function saveStudents(list) {
    localStorage.setItem(STUDENTS_KEY, JSON.stringify(list || []));
  }

  /** Remove aluno fictício de testes anteriores. */
  function purgeDemoStudents() {
    var before = getStudents();
    var next = before.filter(function (s) {
      if (!s) return false;
      if (s._demo) return false;
      if (String(s.id) === "aluno_andre_siga_demo") return false;
      if (normEmail(s.email) === "andre.siga" + DOMAIN_ALUNO) return false;
      return true;
    });
    if (next.length !== before.length) saveStudents(next);
    return next;
  }

  function upsertLocalStudent(student) {
    if (!student || !student.id) return null;
    var list = getStudents();
    var idx = list.findIndex(function (s) {
      return String(s.id) === String(student.id) ||
        (student.email && normEmail(s.email) === normEmail(student.email));
    });
    var merged = Object.assign({}, idx >= 0 ? list[idx] : {}, student, { _demo: undefined });
    delete merged._demo;
    if (idx >= 0) list[idx] = merged;
    else list.unshift(merged);
    saveStudents(list);
    return merged;
  }

  function studentFromPortalPayload(payload) {
    if (!payload) return null;
    return {
      id: payload.id,
      codigoInep: payload.codigo_inep || "",
      nome: payload.nome || "",
      cpf: payload.cpf || "",
      serie: payload.serie || "",
      turma: payload.turma || "",
      turno: payload.turno || "",
      dataNascimento: payload.birth_date || "",
      email: payload.email || "",
      responsavel: payload.guardian_name || "",
      contato: payload.guardian_contact || "",
      status: payload.status || "Ativo",
      frequencia: payload.attendance_pct != null ? Number(payload.attendance_pct) : null,
      avatar: payload.avatar_url || "",
      precisaDefinirSenha: false,
      schoolId: payload.school_id || null,
    };
  }

  function getSb() {
    var a = global.SigaSupabase || global.SigaAuth;
    return a && typeof a.getClient === "function" ? a.getClient() : null;
  }

  function refreshStudentFromCloud(session) {
    session = session || getSession();
    if (!session || !session.id) return Promise.resolve(null);
    var sb = getSb();
    if (!sb || !/^[0-9a-f-]{36}$/i.test(String(session.id))) {
      return Promise.resolve(findStudentForSession(session));
    }
    return sb
      .rpc("student_portal_profile", { p_student_id: session.id })
      .then(function (res) {
        if (res.error || !res.data) return findStudentForSession(session);
        var local = studentFromPortalPayload(res.data);
        if (local) {
          upsertLocalStudent(local);
          if (local.schoolId) {
            try {
              localStorage.setItem(ACTIVE_SCHOOL_KEY, local.schoolId);
            } catch (e) { /* ignore */ }
            session.schoolId = local.schoolId;
            try {
              localStorage.setItem(SESSION_KEY, JSON.stringify(session));
            } catch (e2) { /* ignore */ }
          }
        }
        return local || findStudentForSession(session);
      })
      .catch(function () {
        return findStudentForSession(session);
      });
  }

  function requireAlunoSession(options) {
    options = options || {};
    purgeDemoStudents();
    return Promise.resolve().then(function () {
      var session = getSession();
      if (!session || session.tipo !== "aluno") {
        if (!options.silent) {
          global.location.replace(rootPrefix() + "login.html");
        }
        return null;
      }
      return refreshStudentFromCloud(session).then(function (student) {
        return { session: session, student: student };
      });
    });
  }

  function findStudentForSession(session) {
    session = session || getSession();
    if (!session) return null;
    var list = getStudents();
    return (
      list.find(function (s) {
        return (
          String(s.id) === String(session.id) ||
          normEmail(s.email) === normEmail(session.email)
        );
      }) || null
    );
  }

  function initials(name) {
    var parts = String(name || "A")
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    if (!parts.length) return "A";
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }

  function navItems(active) {
    var p = rootPrefix();
    return [
      {
        id: "inicio",
        href: p + "portal-aluno.html",
        icon: "home",
        label: "Início",
      },
      {
        id: "frequencia",
        href: p + "app/appfrequencia.html",
        icon: "fact_check",
        label: "Frequência",
      },
      {
        id: "horarios",
        href: p + "app/apphorarios.html",
        icon: "calendar_month",
        label: "Horários",
      },
      {
        id: "perfil",
        href: p + "app/appperfil.html",
        icon: "person",
        label: "Perfil",
      },
    ].map(function (item) {
      item.active = item.id === active;
      return item;
    });
  }

  function renderBottomNav(active) {
    var host = document.getElementById("portal-aluno-bottom-nav");
    if (!host) return;
    var items = navItems(active);
    host.innerHTML = items
      .map(function (item) {
        if (item.active) {
          return (
            '<a class="flex flex-col items-center justify-center bg-primary text-white rounded-full px-5 py-2 active:scale-90 transition-all duration-200" href="' +
            item.href +
            '">' +
            '<span class="material-symbols-outlined" style="font-variation-settings:\'FILL\' 1">' +
            item.icon +
            "</span>" +
            '<span class="text-[11px] font-semibold">' +
            item.label +
            "</span></a>"
          );
        }
        return (
          '<a class="flex flex-col items-center justify-center text-slate-500 px-4 py-1 hover:bg-slate-100 active:scale-90 transition-all duration-200 rounded-xl" href="' +
          item.href +
          '">' +
          '<span class="material-symbols-outlined">' +
          item.icon +
          "</span>" +
          '<span class="text-[11px] font-medium">' +
          item.label +
          "</span></a>"
        );
      })
      .join("");
  }

  function greetingByHour(date) {
    var h = (date || new Date()).getHours();
    if (h >= 5 && h < 12) return "Bom dia";
    if (h >= 12 && h < 18) return "Boa tarde";
    return "Boa noite";
  }

  function firstName(nome) {
    var n = String(nome || "Aluno").trim();
    return n.split(/\s+/)[0] || "Aluno";
  }

  /** Índice estável por dia (mesmo navegador / data = mesma frase). */
  function dailyQuoteIndex(date) {
    date = date || new Date();
    var key =
      date.getFullYear() +
      "-" +
      String(date.getMonth() + 1).padStart(2, "0") +
      "-" +
      String(date.getDate()).padStart(2, "0");
    var hash = 0;
    for (var i = 0; i < key.length; i++) {
      hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
    }
    return MOTIVATIONAL_QUOTES.length
      ? hash % MOTIVATIONAL_QUOTES.length
      : 0;
  }

  function quoteOfTheDay(date) {
    var q = MOTIVATIONAL_QUOTES[dailyQuoteIndex(date)];
    return q || { text: "Estude com dedicação.", author: "SIGA Educa" };
  }

  function fillHeroBanner(session, student) {
    var nome =
      (student && student.nome) || (session && session.nome) || "Aluno";
    var saudacaoEl = document.getElementById("portal-hero-saudacao");
    var textoEl = document.getElementById("portal-hero-frase-texto");
    var autorEl = document.getElementById("portal-hero-frase-autor");
    if (saudacaoEl) {
      saudacaoEl.textContent =
        greetingByHour() + ", " + firstName(nome);
    }
    var quote = quoteOfTheDay();
    if (textoEl) textoEl.textContent = quote.text;
    if (autorEl) autorEl.textContent = "— " + quote.author;
  }

  function loadAllPrefs() {
    try {
      return JSON.parse(localStorage.getItem(PREFS_KEY) || "{}") || {};
    } catch (e) {
      return {};
    }
  }

  function getPrefs(studentId) {
    var all = loadAllPrefs();
    var id = String(studentId || "default");
    return Object.assign(
      {
        darkMode: false,
        accent: "#006d37",
        bio: "",
      },
      all[id] || {}
    );
  }

  function savePrefs(studentId, patch) {
    var all = loadAllPrefs();
    var id = String(studentId || "default");
    all[id] = Object.assign({}, getPrefs(id), patch || {});
    localStorage.setItem(PREFS_KEY, JSON.stringify(all));
    return all[id];
  }

  function ensureThemeStyles() {
    if (document.getElementById("siga-portal-theme-style")) return;
    var style = document.createElement("style");
    style.id = "siga-portal-theme-style";
    style.textContent = [
      "html.siga-theme-dark,",
      "html.siga-theme-dark body{",
      "  color-scheme:dark;",
      "  background-color:#0f1419 !important;",
      "  color:#e8eef7 !important;",
      "}",
      "html.siga-theme-dark .bg-background,",
      "html.siga-theme-dark .bg-surface,",
      "html.siga-theme-dark .bg-surface-bright,",
      "html.siga-theme-dark .bg-surface-container-lowest,",
      "html.siga-theme-dark .bg-white{",
      "  background-color:#151c27 !important;",
      "}",
      "html.siga-theme-dark .bg-surface-container,",
      "html.siga-theme-dark .bg-surface-container-low,",
      "html.siga-theme-dark .bg-surface-container-high,",
      "html.siga-theme-dark .bg-surface-container-highest,",
      "html.siga-theme-dark .bg-surface-variant,",
      "html.siga-theme-dark .bg-secondary-container{",
      "  background-color:#1e2633 !important;",
      "}",
      "html.siga-theme-dark .text-on-surface,",
      "html.siga-theme-dark .text-on-background,",
      "html.siga-theme-dark .text-on-secondary-container,",
      "html.siga-theme-dark .font-display{",
      "  color:#e8eef7 !important;",
      "}",
      "html.siga-theme-dark .text-on-surface-variant,",
      "html.siga-theme-dark .text-text-secondary,",
      "html.siga-theme-dark .text-slate-500{",
      "  color:#9aa7b8 !important;",
      "}",
      "html.siga-theme-dark .border-border-subtle,",
      "html.siga-theme-dark .border-outline,",
      "html.siga-theme-dark .border-outline-variant,",
      "html.siga-theme-dark .border-slate-200,",
      "html.siga-theme-dark .border-b,",
      "html.siga-theme-dark .border-t{",
      "  border-color:#2f3a4a !important;",
      "}",
      "html.siga-theme-dark header,",
      "html.siga-theme-dark nav#portal-aluno-bottom-nav{",
      "  background-color:#151c27 !important;",
      "  border-color:#2f3a4a !important;",
      "  color:#e8eef7 !important;",
      "}",
      "html.siga-theme-dark input,",
      "html.siga-theme-dark textarea,",
      "html.siga-theme-dark select{",
      "  background-color:#0f1419 !important;",
      "  color:#e8eef7 !important;",
      "  border-color:#3a4658 !important;",
      "}",
      "html.siga-theme-dark input::placeholder,",
      "html.siga-theme-dark textarea::placeholder{",
      "  color:#7a8799 !important;",
      "}",
      "html.siga-theme-dark .bento-card,",
      "html.siga-theme-dark section.bg-surface,",
      "html.siga-theme-dark section.rounded-2xl.bg-surface,",
      "html.siga-theme-dark section.rounded-xl{",
      "  background-color:#1a222e !important;",
      "  border-color:#2f3a4a !important;",
      "}",
      "html.siga-theme-dark #themeToggle.siga-theme-on{",
      "  background-color:#2a313d !important;",
      "}",
      "html.siga-theme-dark #toggleThumb{",
      "  background-color:#ffffff !important;",
      "}",
      "html.siga-theme-light body{",
      "  color-scheme:light;",
      "}",
    ].join("\n");
    document.head.appendChild(style);
  }

  function applyAccent(color) {
    color = String(color || "#006d37");
    var root = document.documentElement;
    root.style.setProperty("--primary-color", color);
    root.style.setProperty("--color-primary", color);
    try {
      var style = document.getElementById("siga-portal-accent-style");
      if (!style) {
        style = document.createElement("style");
        style.id = "siga-portal-accent-style";
        document.head.appendChild(style);
      }
      style.textContent =
        ":root{--tw-color-primary:" +
        color +
        ";}" +
        ".text-primary{color:" +
        color +
        "!important;}" +
        ".bg-primary{background-color:" +
        color +
        "!important;}" +
        ".bg-primary-container{background-color:" +
        color +
        "cc!important;}" +
        ".bg-primary\\/10,.bg-primary\\/15{background-color:" +
        color +
        "1a!important;}" +
        ".border-primary,.ring-primary{border-color:" +
        color +
        "!important;--tw-ring-color:" +
        color +
        ";}" +
        ".shadow-primary\\/20{--tw-shadow-color:" +
        color +
        "33;}" +
        "html.siga-theme-dark .bg-primary{background-color:" +
        color +
        "!important;}";
    } catch (e) { /* ignore */ }
  }

  function applyTheme(prefs) {
    prefs = prefs || {};
    ensureThemeStyles();
    var dark = !!prefs.darkMode;
    var root = document.documentElement;
    root.classList.toggle("dark", dark);
    root.classList.toggle("light", !dark);
    root.classList.toggle("siga-theme-dark", dark);
    root.classList.toggle("siga-theme-light", !dark);
    if (document.body) {
      document.body.classList.toggle("dark", dark);
      document.body.dataset.theme = dark ? "dark" : "light";
    }
    applyAccent(prefs.accent || "#006d37");
    // Atualiza o interruptor se estiver na tela
    syncThemeToggleUi(dark);
  }

  function syncThemeToggleUi(dark) {
    var themeToggle = document.getElementById("themeToggle");
    var toggleThumb = document.getElementById("toggleThumb");
    if (!themeToggle || !toggleThumb) return;
    var icon = toggleThumb.querySelector("span");
    themeToggle.setAttribute("aria-pressed", dark ? "true" : "false");
    themeToggle.title = dark ? "Modo escuro ativo" : "Modo claro ativo";
    if (dark) {
      toggleThumb.style.transform = "translateX(24px)";
      themeToggle.classList.add("siga-theme-on", "bg-[#2a313d]");
      themeToggle.classList.remove("bg-surface-container-highest", "bg-primary");
      if (icon) {
        icon.textContent = "dark_mode";
        icon.classList.remove("text-on-surface-variant");
        icon.style.color = "#151c27";
      }
    } else {
      toggleThumb.style.transform = "translateX(0)";
      themeToggle.classList.remove("siga-theme-on", "bg-[#2a313d]", "bg-primary");
      themeToggle.classList.add("bg-surface-container-highest");
      if (icon) {
        icon.textContent = "light_mode";
        icon.style.color = "";
        icon.classList.add("text-on-surface-variant");
      }
    }
  }

  function updateStudentFields(studentId, patch) {
    var list = getStudents();
    var idx = list.findIndex(function (s) {
      return String(s.id) === String(studentId);
    });
    if (idx < 0) return null;
    list[idx] = Object.assign({}, list[idx], patch || {});
    saveStudents(list);
    return list[idx];
  }

  function fillHeader(session, student) {
    var nameEl = document.getElementById("portal-aluno-nome");
    var metaEl = document.getElementById("portal-aluno-meta");
    var avatarEl = document.getElementById("portal-aluno-avatar");
    var nome = (student && student.nome) || (session && session.nome) || "Aluno";
    if (nameEl) nameEl.textContent = firstName(nome);
    if (metaEl) {
      var turma = (student && student.turma) || "—";
      var serie = (student && student.serie) || "";
      metaEl.textContent = [turma, serie].filter(Boolean).join(" · ");
    }
    if (avatarEl) {
      if (student && student.avatar) {
        avatarEl.innerHTML =
          '<img class="w-full h-full object-cover" src="' +
          student.avatar +
          '" alt="">';
      } else {
        avatarEl.textContent = initials(nome);
      }
    }
  }

  function logout() {
    try {
      localStorage.removeItem(SESSION_KEY);
    } catch (e) { /* ignore */ }
    global.location.href = rootPrefix() + "login.html";
  }

  function boot(activeNav) {
    return requireAlunoSession().then(function (pack) {
      if (!pack || !pack.session) return null;
      var session = pack.session;
      var student = pack.student || findStudentForSession(session);
      var prefs = getPrefs(student && student.id);
      applyTheme(prefs);
      fillHeader(session, student);
      renderBottomNav(activeNav || "inicio");
      try {
        if (student && student.id) {
          localStorage.setItem("siga_portal_aluno_id", String(student.id));
        }
      } catch (e) { /* ignore */ }
      var logoutBtn = document.getElementById("portal-aluno-logout");
      if (logoutBtn) logoutBtn.addEventListener("click", logout);
      return { session: session, student: student, prefs: prefs };
    });
  }

  function bootPerfil() {
    return boot("perfil").then(function (ctx) {
      if (!ctx) return null;
      initPerfilPage(ctx);
      return ctx;
    });
  }

  function initPerfilPage(ctx) {
    var student = ctx.student || {};
    var session = ctx.session || {};
    var prefs = ctx.prefs || getPrefs(student.id);
    var nome =
      student.nome || session.nome || "Aluno";
    var email = student.email || session.email || "";
    var turmaLabel =
      [student.turma, student.serie].filter(Boolean).join(" · ") ||
      student.turma ||
      "Turma não informada";

    var titleEl = document.getElementById("perfil-nome");
    var turmaEl = document.getElementById("perfil-turma");
    var avatarImg = document.getElementById("perfil-avatar-img");
    var avatarFallback = document.getElementById("perfil-avatar-fallback");
    if (titleEl) titleEl.textContent = nome;
    if (turmaEl) turmaEl.textContent = turmaLabel;
    if (avatarImg && student.avatar) {
      avatarImg.src = student.avatar;
      avatarImg.classList.remove("hidden");
      if (avatarFallback) avatarFallback.classList.add("hidden");
    } else if (avatarFallback) {
      avatarFallback.textContent = initials(nome);
      avatarFallback.classList.remove("hidden");
      if (avatarImg) avatarImg.classList.add("hidden");
    }

    var nomeInput = document.getElementById("perfil-input-nome");
    var emailInput = document.getElementById("perfil-input-email");
    var telInput = document.getElementById("perfil-input-telefone");
    var bioInput = document.getElementById("perfil-input-bio");
    var bioCount = document.getElementById("perfil-bio-count");
    var saveBtn = document.getElementById("perfil-salvar-dados");
    var saveMsg = document.getElementById("perfil-salvar-msg");

    if (nomeInput) {
      nomeInput.value = nome;
      nomeInput.readOnly = true;
    }
    if (emailInput) {
      emailInput.value = email;
      emailInput.readOnly = true;
    }
    if (telInput) {
      telInput.value = student.contato || student.telefone || "";
      telInput.readOnly = false;
    }
    if (bioInput) {
      bioInput.value = String(prefs.bio || "").slice(0, 150);
      bioInput.maxLength = 150;
      function syncBioCount() {
        if (bioCount) {
          bioCount.textContent = String(bioInput.value.length) + "/150";
        }
      }
      syncBioCount();
      bioInput.addEventListener("input", syncBioCount);
    }

    if (saveBtn && !saveBtn._bound) {
      saveBtn._bound = true;
      saveBtn.addEventListener("click", function () {
        var phone = telInput ? String(telInput.value || "").trim() : "";
        var bio = bioInput ? String(bioInput.value || "").slice(0, 150) : "";
        if (student.id) {
          updateStudentFields(student.id, { contato: phone, telefone: phone });
          savePrefs(student.id, { bio: bio });
          if (global.SigaSchoolData && typeof global.SigaSchoolData.upsertStudents === "function") {
            try {
              var fresh = findStudentForSession(session) || student;
              global.SigaSchoolData.upsertStudents([fresh]);
            } catch (eSync) { /* ignore */ }
          }
        }
        if (saveMsg) {
          saveMsg.textContent = "Dados salvos.";
          saveMsg.classList.remove("hidden");
          setTimeout(function () {
            saveMsg.classList.add("hidden");
          }, 2200);
        }
      });
    }

    // Do Meu Jeito — modo claro / escuro
    var themeToggle = document.getElementById("themeToggle");
    syncThemeToggleUi(!!prefs.darkMode);
    if (themeToggle && !themeToggle._bound) {
      themeToggle._bound = true;
      themeToggle.addEventListener("click", function () {
        var nextDark = !document.documentElement.classList.contains("siga-theme-dark");
        prefs = savePrefs(student.id, { darkMode: nextDark });
        applyTheme(prefs);
      });
    }

    // Cores de destaque
    var colorHost = document.getElementById("perfil-cores");
    var dots = colorHost
      ? colorHost.querySelectorAll("[data-accent]")
      : [];
    function paintDots(active) {
      dots.forEach(function (dot) {
        var c = dot.getAttribute("data-accent");
        var on = c === active;
        dot.classList.toggle("ring-2", on);
        dot.classList.toggle("ring-primary", on);
        dot.classList.toggle("border-white", on);
        dot.classList.toggle("border-transparent", !on);
      });
    }
    paintDots(prefs.accent || "#006d37");
    applyAccent(prefs.accent || "#006d37");
    dots.forEach(function (dot) {
      if (dot._bound) return;
      dot._bound = true;
      dot.addEventListener("click", function () {
        var color = dot.getAttribute("data-accent") || "#006d37";
        prefs = savePrefs(student.id, { accent: color });
        applyAccent(color);
        paintDots(color);
      });
    });

    var backBtn = document.getElementById("perfil-voltar");
    if (backBtn && !backBtn._bound) {
      backBtn._bound = true;
      backBtn.addEventListener("click", function () {
        global.location.href = rootPrefix() + "portal-aluno.html";
      });
    }
  }

  global.SigaPortalAluno = {
    DOMAIN_ALUNO: DOMAIN_ALUNO,
    purgeDemoStudents: purgeDemoStudents,
    upsertLocalStudent: upsertLocalStudent,
    studentFromPortalPayload: studentFromPortalPayload,
    requireAlunoSession: requireAlunoSession,
    findStudentForSession: findStudentForSession,
    refreshStudentFromCloud: refreshStudentFromCloud,
    renderBottomNav: renderBottomNav,
    fillHeader: fillHeader,
    fillHeroBanner: fillHeroBanner,
    greetingByHour: greetingByHour,
    quoteOfTheDay: quoteOfTheDay,
    getPrefs: getPrefs,
    savePrefs: savePrefs,
    applyTheme: applyTheme,
    boot: boot,
    bootPerfil: bootPerfil,
    logout: logout,
    rootPrefix: rootPrefix,
    getSession: getSession,
  };
})(typeof window !== "undefined" ? window : this);
