// State Management
let appState = {
    data: [],
    currentPage: 1,
    itemsPerPage: 15,
    currentView: 'dashboard',
    theme: 'light',
    filters: {
        search: '',
        turno: '',
        turma: '',
        modal: '',
        disciplina: '',
        status: '' // 'lotado' or 'vago'
    },
    professores: [],
    filtersCad: {
        search: ''
    }
};

// DOM Elements cache
const DOM = {
    sidebar: null,
    appContainer: null,
    themeToggleBtn: null,
    mobileMenuBtn: null,
    sidebarLinks: null,
    pageViews: null,
    
    // Modals
    modalOverlay: null,
    modalTitle: null,
    modalBody: null,
    modalConfirmBtn: null,
    modalCancelBtn: null,
    
    // Filters
    searchInput: null,
    filterTurno: null,
    filterTurma: null,
    filterModal: null,
    filterDisciplina: null,
    filterStatus: null,
    btnClearFilters: null,
    
    // Tabela
    tabelaCorpo: null,
    paginationInfo: null,
    paginationButtons: null
};

// Charts references
let charts = {
    allocation: null,
    shifts: null,
    topTeachers: null
};

/* ==========================================================================
   INITIALIZATION
   ========================================================================== */
document.addEventListener('DOMContentLoaded', () => {
    initDOM();
    initTheme();
    loadData();
    initEventListeners();
    initFiltersOptions();
    switchView('dashboard');
    syncLotacaoFromCloud();
});

function initDOM() {
    DOM.sidebar = document.querySelector('.sidebar');
    DOM.appContainer = document.querySelector('.app-container');
    DOM.themeToggleBtn = document.querySelector('.theme-toggle-btn');
    DOM.mobileMenuBtn = document.querySelector('.mobile-menu-btn');
    DOM.sidebarLinks = document.querySelectorAll('.sidebar-link');
    DOM.pageViews = document.querySelectorAll('.page-view');
    
    // Modals
    DOM.modalOverlay = document.getElementById('modalOverlay');
    DOM.modalTitle = document.getElementById('modalTitle');
    DOM.modalBody = document.getElementById('modalBody');
    DOM.modalConfirmBtn = document.getElementById('modalConfirm');
    DOM.modalCancelBtn = document.getElementById('modalCancel');
    
    // Filters
    DOM.searchInput = document.getElementById('searchInput');
    DOM.filterTurno = document.getElementById('filterTurno');
    DOM.filterTurma = document.getElementById('filterTurma');
    DOM.filterModal = document.getElementById('filterModal');
    DOM.filterDisciplina = document.getElementById('filterDisciplina');
    DOM.filterStatus = document.getElementById('filterStatus');
    DOM.btnClearFilters = document.getElementById('btnClearFilters');
    
    // Tabela
    DOM.tabelaCorpo = document.getElementById('tabelaCorpo');
    DOM.paginationInfo = document.getElementById('paginationInfo');
    DOM.paginationButtons = document.getElementById('paginationButtons');
}

function initTheme() {
    const savedTheme = localStorage.getItem('theme') || 'light';
    appState.theme = savedTheme;
    document.documentElement.setAttribute('data-theme', savedTheme);
    updateThemeIcon();
}

function updateThemeIcon() {
    const icon = DOM.themeToggleBtn.querySelector('i');
    if (appState.theme === 'dark') {
        icon.className = 'fas fa-sun';
    } else {
        icon.className = 'fas fa-moon';
    }
}

function toggleTheme() {
    appState.theme = appState.theme === 'light' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', appState.theme);
    localStorage.setItem('theme', appState.theme);
    updateThemeIcon();
    
    // Re-render charts to adjust text color in dark theme
    if (appState.currentView === 'dashboard') {
        renderDashboardCharts();
    }
}

function loadData() {
    const currentVersion = 'v7_ficha_avulsa';
    const savedVersion = localStorage.getItem('lotacao_db_version');
    
    if (savedVersion !== currentVersion) {
        localStorage.setItem('lotacao_data', JSON.stringify(INITIAL_LOTACAO_DATA));
        localStorage.setItem('lotacao_db_version', currentVersion);
        
        // Regenerate teachers registry from INITIAL_LOTACAO_DATA
        const profList = [];
        const seen = new Set();
        INITIAL_LOTACAO_DATA.forEach(item => {
            if (item.professor !== '-' && !seen.has(item.professor)) {
                seen.add(item.professor);
                const parts = item.matricula.split('-');
                let guessedCargo = "PROFESSOR";
                const firstName = item.professor.split(" ")[0].toUpperCase();
                if ((firstName.endsWith("A") || firstName.endsWith("E")) && 
                    !["JOSÉ", "JOSE", "GEORGE", "JORGE", "ROMIS"].includes(firstName)) {
                    guessedCargo = "PROFESSORA";
                }
                profList.push({
                    nome: item.professor,
                    matricula: parts[0],
                    dv: parts[1] || '',
                    cargo: guessedCargo,
                    vinculo: "EFETIVO",
                    setor: ""
                });
            }
        });
        localStorage.setItem('professores_cadastro', JSON.stringify(profList));
        
        // Reload page to apply changes cleanly
        window.location.reload();
        return;
    }
    const CODES_MAP = {
        "ARTES": "2399", "BIOLOGIA": "2034", "EDUCACAO FISICA": "1008", "EDUCAÇÃO FÍSICA": "1008",
        "FILOSOFIA": "2043", "FISICA": "2036", "FÍSICA": "2036", "GEOGRAFIA": "2003",
        "HISTORIA": "2002", "HISTÓRIA": "2002", "LINGUA INGLESA": "7585", "LÍNGUA INGLESA": "7585",
        "LINGUA PORTUGUESA E SUAS LITERATURAS": "7580", "LINGUA PORTUGUESA": "7580",
        "MATEMATICA": "2006", "MATEMÁTICA": "2006", "QUIMICA": "2035", "QUÍMICA": "2035",
        "SOCIOLOGIA": "2038", "EDUCACAO AMBIENTAL, SUSTENTABILIDADE E CLIMA": "2746", "EDUCAÇÃO AMBIENTAL, SUSTENTABILIDADE E CLIMA": "2746", "EDUCACAO ESPECIAL": "1003", "EDUCAÇÃO ESPECIAL": "1003",
        
        "LGG - APROF DE AREAS DE LINGUAGENS E SUAS TECNOLOGIAS": "2786",
        "LGG - APROF DE AREAS DE MATEMATICA E SUAS TECNOLOGIAS": "2788",
        "LGG - EDUCACAO AMBIENTAL, SUSTENTABILIDADE E CLIMA": "2789",
        "LGG - PRODUCAO TEXTUAL": "2787",
        "LGG - PRODUÇÃO TEXTUAL": "2787",
        "MAT - APROF DE AREAS DE LINGUAGENS E SUAS TECNOLOGIAS": "2791",
        "MAT - APROF DE AREAS DE MATEMATICA E SUAS TECNOLOGIAS": "2790",
        "MAT - EDUCACAO AMBIENTAL, SUSTENTABILIDADE E CLIMA": "2792",
        
        "CHSA - APROF DE AREAS DE CIENCIAS HUMANAS E SOCIAIS APLICADAS": "2793",
        "CHSA - APROF DE AREAS DE LINGUAGENS E SUAS TECNOLOGIAS": "2795",
        "CHSA - EDUCACAO AMBIENTAL, SUSTENTABILIDADE E CLIMA": "2796",
        "CHSA - SOCIEDADE, CULTURA E TECNOLOGIA": "2794",
        "CNT - APROF DE AREAS DE CIENCIAS DA NATUREZA E SUAS TECNOLOGIAS": "2797",
        "CNT - APROF DE AREAS DE MATEMATICA E SUAS TECNOLOGIAS": "2799",
        "CNT - CIENCIA, TECNOLOGIA E INOVACAO": "2798",
        "CNT - EDUCACAO AMBIENTAL, SUSTENTABILIDADE E CLIMA": "2800"
    };

    const savedData = localStorage.getItem('lotacao_data');
    if (savedData) {
        let loaded = JSON.parse(savedData);
        // Exclude M1NNM03 and M2NNJ02 from localstorage
        const initialCount = loaded.length;
        loaded = loaded.filter(item => item.turma !== 'M1NNM03' && item.turma !== 'M2NNJ02');
        
        // Ensure all loaded items have the "codigo" field and are cleaned up
        let upgraded = false;
        loaded.forEach(item => {
            let origD = item.disciplina;
            let d = origD;
            
            // Clean up old parser errors and allocate to Franco Montiel
            if (d.includes("FRANCO MONTIEL")) {
                item.professor = "FRANCO MONTIEL DA SILVA DOS SANTOS";
                item.matricula = "5998964-1";
                item.ch_professor = 28;
                d = d.split(/\s+\d\s+FRANCO/)[0].trim();
                item.disciplina = d;
                upgraded = true;
            }
            
            if (d === "APROF DE AREAS DE CIENCIAS DA NATUREZA E SUAS TECNOLOGIAS") {
                d = "CNT - APROF DE AREAS DE CIENCIAS DA NATUREZA E SUAS TECNOLOGIAS";
                item.disciplina = d;
                upgraded = true;
            } else if (d === "APROF DE AREAS DE CIENCIAS HUMANAS E SOCIAIS APLICADAS") {
                d = "CHSA - APROF DE AREAS DE CIENCIAS HUMANAS E SOCIAIS APLICADAS";
                item.disciplina = d;
                upgraded = true;
            } else if (d === "PRODUCAO TEXTUAL") {
                d = "LGG - PRODUCAO TEXTUAL";
                item.disciplina = d;
                upgraded = true;
            }
            
            const correctCode = CODES_MAP[d] || "-";
            if (item.codigo !== correctCode) {
                item.codigo = correctCode;
                upgraded = true;
            }
        });
        
        // Auto-merge restored official PDF allocations into active localStorage
        INITIAL_LOTACAO_DATA.forEach((initItem, idx) => {
            if (initItem.professor !== "-" && idx < loaded.length) {
                const localItem = loaded[idx];
                if (localItem.professor === "-" && 
                    localItem.turma === initItem.turma && 
                    localItem.disciplina === initItem.disciplina) {
                    localItem.professor = initItem.professor;
                    localItem.matricula = initItem.matricula;
                    localItem.ch_professor = initItem.ch_professor;
                    localItem.codigo = initItem.codigo;
                    upgraded = true;
                }
            }
        });

        // Inclui turmas/disciplinas novas do data.js (ex.: M2NNM03) que faltam no localStorage
        INITIAL_LOTACAO_DATA.forEach(function (initItem) {
            var exists = loaded.some(function (localItem) {
                return localItem.turma === initItem.turma &&
                    localItem.disciplina === initItem.disciplina &&
                    String(localItem.oferta) === String(initItem.oferta);
            });
            if (!exists) {
                loaded.push(Object.assign({}, initItem));
                upgraded = true;
            }
        });
        
        appState.data = loaded;
        if (loaded.length !== initialCount || upgraded) {
            saveDataToStorage();
        }
    } else {
        // INITIAL_LOTACAO_DATA comes from data.js
        appState.data = [...INITIAL_LOTACAO_DATA];
        saveDataToStorage();
    }
    
    // Load/Create Teachers Registry
    const savedProfs = localStorage.getItem('professores_cadastro');
    if (savedProfs) {
        appState.professores = JSON.parse(savedProfs);
        
        // Auto-normalize any legacy/custom role/vinculo titles to strict "PROFESSOR"/"PROFESSORA" and "EFETIVO"/"TEMPORÁRIO"
        let registryUpgraded = false;
        appState.professores.forEach(p => {
            const originalCargo = p.cargo || "PROFESSOR";
            let normCargo = "PROFESSOR";
            if (originalCargo.toUpperCase().includes("PROFESSORA")) {
                normCargo = "PROFESSORA";
            } else if (originalCargo.toUpperCase().includes("PROFESSOR")) {
                normCargo = "PROFESSOR";
            }
            if (p.cargo !== normCargo) {
                p.cargo = normCargo;
                registryUpgraded = true;
            }
            
            const originalVinculo = p.vinculo || "EFETIVO";
            let normVinculo = "EFETIVO";
            if (originalVinculo.toUpperCase().includes("TEMPOR") || originalVinculo.toUpperCase().includes("CONTRAT")) {
                normVinculo = "TEMPORÁRIO";
            } else if (originalVinculo.toUpperCase().includes("EFETIV")) {
                normVinculo = "EFETIVO";
            }
            if (p.vinculo !== normVinculo) {
                p.vinculo = normVinculo;
                registryUpgraded = true;
            }
        });

        // Ensure Franco Montiel is in the registry list if it exists
        const hasFranco = appState.professores.some(p => p.nome === "FRANCO MONTIEL DA SILVA DOS SANTOS");
        if (!hasFranco) {
            appState.professores.push({
                nome: "FRANCO MONTIEL DA SILVA DOS SANTOS",
                matricula: "5998964",
                dv: "1",
                cargo: "PROFESSOR",
                vinculo: "EFETIVO",
                setor: ""
            });
            registryUpgraded = true;
        }

                const has5998425 = appState.professores.some(p => p.nome === "WANDERSON SANTOS SOUSA COIMBRA");
        if (!has5998425) {
            appState.professores.push({
                nome: "WANDERSON SANTOS SOUSA COIMBRA",
                matricula: "5998425",
                dv: "1",
                cargo: "PROFESSOR",
                vinculo: "EFETIVO",
                setor: ""
            });
            registryUpgraded = true;
        }

                const has6404470 = appState.professores.some(p => p.nome === "GISELIE DA SILVA PUGAS");
        if (!has6404470) {
            appState.professores.push({
                nome: "GISELIE DA SILVA PUGAS",
                matricula: "6404470",
                dv: "1",
                cargo: "PROFESSOR",
                vinculo: "EFETIVO",
                setor: ""
            });
            registryUpgraded = true;
        }

                const has5952068 = appState.professores.some(p => p.nome === "FRANCISCA MARIA DA CONCEICAO");
        if (!has5952068) {
            appState.professores.push({
                nome: "FRANCISCA MARIA DA CONCEICAO",
                matricula: "5952068",
                dv: "2",
                cargo: "PROFESSOR",
                vinculo: "EFETIVO",
                setor: ""
            });
            registryUpgraded = true;
        }

                const has5998656 = appState.professores.some(p => p.nome === "ELIANE ALVES SILVA MOURA");
        if (!has5998656) {
            appState.professores.push({
                nome: "ELIANE ALVES SILVA MOURA",
                matricula: "5998656",
                dv: "1",
                cargo: "PROFESSOR",
                vinculo: "EFETIVO",
                setor: ""
            });
            registryUpgraded = true;
        }

                const has6300562 = appState.professores.some(p => p.nome === "JAQUELINE MENDES GONCALVES");
        if (!has6300562) {
            appState.professores.push({
                nome: "JAQUELINE MENDES GONCALVES",
                matricula: "6300562",
                dv: "1",
                cargo: "PROFESSOR",
                vinculo: "EFETIVO",
                setor: ""
            });
            registryUpgraded = true;
        }

                const has5951608 = appState.professores.some(p => p.nome === "TALIANE DE SOUZA DUARTE");
        if (!has5951608) {
            appState.professores.push({
                nome: "TALIANE DE SOUZA DUARTE",
                matricula: "5951608",
                dv: "2",
                cargo: "PROFESSOR",
                vinculo: "EFETIVO",
                setor: ""
            });
            registryUpgraded = true;
        }

                const has5948546 = appState.professores.some(p => p.nome === "LUCIA DA SILVA SANTOS LEITE");
        if (!has5948546) {
            appState.professores.push({
                nome: "LUCIA DA SILVA SANTOS LEITE",
                matricula: "5948546",
                dv: "1",
                cargo: "PROFESSOR",
                vinculo: "EFETIVO",
                setor: ""
            });
            registryUpgraded = true;
        }

                const has57204076 = appState.professores.some(p => p.nome === "ROMIS DE SOUSA MORAES");
        if (!has57204076) {
            appState.professores.push({
                nome: "ROMIS DE SOUSA MORAES",
                matricula: "57204076",
                dv: "1",
                cargo: "PROFESSOR",
                vinculo: "EFETIVO",
                setor: ""
            });
            registryUpgraded = true;
        }

                const has57195008 = appState.professores.some(p => p.nome === "RONERIO BEZERRA DE OLIVEIRA");
        if (!has57195008) {
            appState.professores.push({
                nome: "RONERIO BEZERRA DE OLIVEIRA",
                matricula: "57195008",
                dv: "1",
                cargo: "PROFESSOR",
                vinculo: "EFETIVO",
                setor: ""
            });
            registryUpgraded = true;
        }

                const has57198307 = appState.professores.some(p => p.nome === "HELICLENE DA SILVA LIMA");
        if (!has57198307) {
            appState.professores.push({
                nome: "HELICLENE DA SILVA LIMA",
                matricula: "57198307",
                dv: "4",
                cargo: "PROFESSOR",
                vinculo: "EFETIVO",
                setor: ""
            });
            registryUpgraded = true;
        }

                const has54192960 = appState.professores.some(p => p.nome === "DANIEL FERNANDES CARNEIRO");
        if (!has54192960) {
            appState.professores.push({
                nome: "DANIEL FERNANDES CARNEIRO",
                matricula: "54192960",
                dv: "2",
                cargo: "PROFESSOR",
                vinculo: "EFETIVO",
                setor: ""
            });
            registryUpgraded = true;
        }

                const has5973369 = appState.professores.some(p => p.nome === "POLIANA PEREIRA ROMUALDO DA SILVA");
        if (!has5973369) {
            appState.professores.push({
                nome: "POLIANA PEREIRA ROMUALDO DA SILVA",
                matricula: "5973369",
                dv: "2",
                cargo: "PROFESSOR",
                vinculo: "EFETIVO",
                setor: ""
            });
            registryUpgraded = true;
        }

                const has5973374 = appState.professores.some(p => p.nome === "MARCIEL APARECIDO DELFINO");
        if (!has5973374) {
            appState.professores.push({
                nome: "MARCIEL APARECIDO DELFINO",
                matricula: "5973374",
                dv: "2",
                cargo: "PROFESSOR",
                vinculo: "EFETIVO",
                setor: ""
            });
            registryUpgraded = true;
        }

                const has54187301 = appState.professores.some(p => p.nome === "GILMAR VIEIRA DE SOUZA");
        if (!has54187301) {
            appState.professores.push({
                nome: "GILMAR VIEIRA DE SOUZA",
                matricula: "54187301",
                dv: "2",
                cargo: "PROFESSOR",
                vinculo: "EFETIVO",
                setor: ""
            });
            registryUpgraded = true;
        }

                const has5957224 = appState.professores.some(p => p.nome === "LUCIENE DIVINA AFONSO DE SOUSA");
        if (!has5957224) {
            appState.professores.push({
                nome: "LUCIENE DIVINA AFONSO DE SOUSA",
                matricula: "5957224",
                dv: "1",
                cargo: "PROFESSOR",
                vinculo: "EFETIVO",
                setor: ""
            });
            registryUpgraded = true;
        }

                const has5919993 = appState.professores.some(p => p.nome === "FRANCINALDO OLIVEIRA ARAUJO");
        if (!has5919993) {
            appState.professores.push({
                nome: "FRANCINALDO OLIVEIRA ARAUJO",
                matricula: "5919993",
                dv: "4",
                cargo: "PROFESSOR",
                vinculo: "EFETIVO",
                setor: ""
            });
            registryUpgraded = true;
        }

                const has5973737 = appState.professores.some(p => p.nome === "JADNA PEREIRA DA SILVA");
        if (!has5973737) {
            appState.professores.push({
                nome: "JADNA PEREIRA DA SILVA",
                matricula: "5973737",
                dv: "2",
                cargo: "PROFESSOR",
                vinculo: "EFETIVO",
                setor: ""
            });
            registryUpgraded = true;
        }

                const has51855718 = appState.professores.some(p => p.nome === "ROMULO FRANCA CRUZ");
        if (!has51855718) {
            appState.professores.push({
                nome: "ROMULO FRANCA CRUZ",
                matricula: "51855718",
                dv: "2",
                cargo: "PROFESSOR",
                vinculo: "EFETIVO",
                setor: ""
            });
            registryUpgraded = true;
        }

                const has5973375 = appState.professores.some(p => p.nome === "IPOJIANA TAVARES PAIVA");
        if (!has5973375) {
            appState.professores.push({
                nome: "IPOJIANA TAVARES PAIVA",
                matricula: "5973375",
                dv: "2",
                cargo: "PROFESSOR",
                vinculo: "EFETIVO",
                setor: ""
            });
            registryUpgraded = true;
        }

                const has57220557 = appState.professores.some(p => p.nome === "FRANCISCO BENTO DE MORAIS FILHO");
        if (!has57220557) {
            appState.professores.push({
                nome: "FRANCISCO BENTO DE MORAIS FILHO",
                matricula: "57220557",
                dv: "1",
                cargo: "PROFESSOR",
                vinculo: "EFETIVO",
                setor: ""
            });
            registryUpgraded = true;
        }

                const has5948444 = appState.professores.some(p => p.nome === "MANOEL MESSIAS NERES SILVA");
        if (!has5948444) {
            appState.professores.push({
                nome: "MANOEL MESSIAS NERES SILVA",
                matricula: "5948444",
                dv: "1",
                cargo: "PROFESSOR",
                vinculo: "EFETIVO",
                setor: ""
            });
            registryUpgraded = true;
        }

        if (registryUpgraded) {
            localStorage.setItem('professores_cadastro', JSON.stringify(appState.professores));
        }
    } else {
        const profList = [];
        const seen = new Set();
        appState.data.forEach(item => {
            if (item.professor !== '-' && !seen.has(item.professor)) {
                seen.add(item.professor);
                const parts = item.matricula.split('-');
                profList.push({
                    nome: item.professor,
                    matricula: parts[0],
                    dv: parts[1] || '',
                    cargo: "PROFESSOR",
                    vinculo: "EFETIVO",
                    setor: ""
                });
            }
        });
        appState.professores = profList;
        localStorage.setItem('professores_cadastro', JSON.stringify(profList));
    }
}

function saveDataToStorage() {
    localStorage.setItem('lotacao_data', JSON.stringify(appState.data));
    try {
        localStorage.setItem('professores_cadastro', JSON.stringify(appState.professores || []));
    } catch (e) { /* ignore */ }
    scheduleLotacaoCloudPersist();
}

function saveProfessoresToStorage() {
    localStorage.setItem('professores_cadastro', JSON.stringify(appState.professores || []));
    scheduleLotacaoCloudPersist();
}

function scheduleLotacaoCloudPersist() {
    var sync = window.SigaLotacaoSync;
    if (!sync || typeof sync.persistDebounced !== 'function') return;
    sync.persistDebounced(appState.data, appState.professores, { year: 2026 })
        .then(function (res) {
            if (!res) return;
            if (res.ok) {
                console.info('[Lotação] Sincronizado com o banco:', res.count != null ? res.count + ' linhas' : 'ok');
            } else if (res.reason !== 'not_configured' && res.reason !== 'no_school') {
                console.warn('[Lotação] Sync cloud:', res.message || res.reason);
            }
        })
        .catch(function (err) {
            console.warn('[Lotação] Sync cloud falhou:', err && err.message ? err.message : err);
        });
}

/**
 * Após carregar o espelho local, prioriza o mapa no Supabase (mesma escola do SIGA).
 * Se o banco estiver vazio, faz bootstrap com o localStorage atual.
 */
function syncLotacaoFromCloud() {
    var sync = window.SigaLotacaoSync;
    if (!sync || typeof sync.hydrate !== 'function') return;

    sync.hydrate({
        year: 2026,
        data: appState.data,
        professores: appState.professores
    }).then(function (res) {
        if (!res || !res.ok) return;

        if (res.source === 'cloud' && Array.isArray(res.data)) {
            appState.data = res.data;
            if (Array.isArray(res.professores) && res.professores.length) {
                appState.professores = res.professores;
            }
            try {
                localStorage.setItem('lotacao_data', JSON.stringify(appState.data));
                localStorage.setItem('professores_cadastro', JSON.stringify(appState.professores || []));
            } catch (e) { /* ignore */ }

            if (typeof initFiltersOptions === 'function') initFiltersOptions();
            if (appState.currentView === 'dashboard' && typeof renderDashboardView === 'function') {
                renderDashboardView();
            } else if (appState.currentView === 'mapa' && typeof renderTabelaView === 'function') {
                renderTabelaView();
            } else if ((appState.currentView === 'cadastro' || appState.currentView === 'professores') && typeof renderCadastroProfView === 'function') {
                renderCadastroProfView();
            } else if (typeof renderDashboardView === 'function') {
                renderDashboardView();
            }
            showToast('Lotação sincronizada com o SIGA EDUCA (banco).');
            return;
        }

        if (res.source === 'local_bootstrapped' && res.synced) {
            showToast('Mapa local enviado ao banco do SIGA EDUCA.');
            return;
        }

        if (res.reason === 'no_school' || res.reason === 'not_configured') {
            console.info('[Lotação] Modo local:', res.message || res.reason);
        }
    }).catch(function (err) {
        console.warn('[Lotação] hydrate:', err && err.message ? err.message : err);
    });
}

function initEventListeners() {
    // Theme toggle
    DOM.themeToggleBtn.addEventListener('click', toggleTheme);
    
    // Mobile menu toggle
    DOM.mobileMenuBtn.addEventListener('click', () => {
        DOM.sidebar.classList.toggle('active');
    });
    
    // Collapsing sidebar in Desktop
    document.querySelector('.sidebar-toggle-btn').addEventListener('click', () => {
        DOM.sidebar.classList.toggle('collapsed');
    });
    
    // Navigation links (views internas — não interceptar "Voltar ao SIGA EDUCA")
    DOM.sidebarLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            if (link.classList.contains('sidebar-back-link') || !link.getAttribute('data-view')) {
                return; // permite navegação normal para fora do módulo
            }
            e.preventDefault();
            const viewId = link.getAttribute('data-view');
            switchView(viewId);
            // Close mobile sidebar if open
            DOM.sidebar.classList.remove('active');
        });
    });

    // Voltar ao SIGA EDUCA (caminho absoluto a partir da pasta do módulo)
    const btnVoltarSiga = document.getElementById('btn-voltar-siga');
    if (btnVoltarSiga) {
        btnVoltarSiga.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            try {
                const dest = new URL('../painelprincipal.html', window.location.href).href;
                window.location.assign(dest);
            } catch (err) {
                window.location.href = '../painelprincipal.html';
            }
        });
    }
    
    // Tabela Filters
    DOM.searchInput.addEventListener('input', (e) => {
        appState.filters.search = e.target.value;
        appState.currentPage = 1;
        renderTabelaView();
    });
    
    const filterSelects = [DOM.filterTurno, DOM.filterTurma, DOM.filterModal, DOM.filterDisciplina, DOM.filterStatus];
    filterSelects.forEach(select => {
        if(select) {
            select.addEventListener('change', (e) => {
                const filterKey = select.id.replace('filter', '').toLowerCase();
                appState.filters[filterKey] = e.target.value;
                appState.currentPage = 1;
                renderTabelaView();
            });
        }
    });
    
    DOM.btnClearFilters.addEventListener('click', () => {
        appState.filters = { search: '', turno: '', turma: '', modal: '', disciplina: '', status: '' };
        DOM.searchInput.value = '';
        DOM.filterTurno.value = '';
        DOM.filterTurma.value = '';
        DOM.filterModal.value = '';
        DOM.filterDisciplina.value = '';
        DOM.filterStatus.value = '';
        appState.currentPage = 1;
        renderTabelaView();
    });
    
    // Cadastro search filter
    const searchCad = document.getElementById('searchCadInput');
    if (searchCad) {
        searchCad.addEventListener('input', (e) => {
            if(!appState.filtersCad) appState.filtersCad = { search: '' };
            appState.filtersCad.search = e.target.value;
            renderCadastroProfView();
        });
    }

    // Modal cancel button
    DOM.modalCancelBtn.addEventListener('click', closeModal);
    DOM.modalOverlay.addEventListener('click', (e) => {
        if (e.target === DOM.modalOverlay) closeModal();
    });
}

function initFiltersOptions() {
    // Populate filter dropdowns dynamically based on database contents
    const turnos = [...new Set(appState.data.map(item => item.turno))].sort();
    const turmas = [...new Set(appState.data.map(item => item.turma))].sort();
    const modais = [...new Set(appState.data.map(item => item.modal))].sort();
    const disciplinas = [...new Set(appState.data.map(item => item.disciplina))].sort();
    
    populateDropdown(DOM.filterTurno, turnos);
    populateDropdown(DOM.filterTurma, turmas);
    populateDropdown(DOM.filterModal, modais);
    populateDropdown(DOM.filterDisciplina, disciplinas);
}

function populateDropdown(selectElement, list) {
    if (!selectElement) return;
    selectElement.innerHTML = `<option value="">Todos</option>`;
    list.forEach(val => {
        selectElement.innerHTML += `<option value="${val}">${val}</option>`;
    });
}

/* ==========================================================================
   SPA NAVIGATION
   ========================================================================== */
function switchView(viewId) {
    appState.currentView = viewId;
    
    // Update Sidebar Navigation state
    DOM.sidebarLinks.forEach(link => {
        const item = link.parentElement;
        if (link.getAttribute('data-view') === viewId) {
            item.classList.add('active');
        } else {
            item.classList.remove('active');
        }
    });
    
    // Update Page View visibility
    DOM.pageViews.forEach(view => {
        if (view.id === `${viewId}View`) {
            view.classList.add('active');
        } else {
            view.classList.remove('active');
        }
    });
    
    // Trigger specific page renderers
    switch(viewId) {
        case 'dashboard':
            renderDashboardView();
            break;
        case 'tabela':
            renderTabelaView();
            break;
        case 'cadastroProf':
            renderCadastroProfView();
            break;
        case 'disciplinas':
            initDisciplinasView();
            break;
        case 'fichaLotacao':
            initFichaLotacaoView();
            break;
        case 'fichaDesistencia':
            initFichaDesistenciaView();
            break;
        case 'relatorios':
            renderRelatoriosView();
            break;
    }
    
    // Scroll content container back to top
    document.querySelector('.app-content').scrollTop = 0;
}

/* ==========================================================================
   DASHBOARD VIEW
   ========================================================================== */
function renderDashboardView() {
    // 1. Calculate General Statistics
    const totalVagas = appState.data.length;
    const disciplinasSemProf = appState.data.filter(item => item.professor === '-').length;
    const disciplinasComProf = totalVagas - disciplinasSemProf;
    
    const chTotal = appState.data.reduce((sum, item) => sum + item.ch_disciplina, 0);
    const chAlocada = appState.data.filter(item => item.professor !== '-').reduce((sum, item) => sum + item.ch_disciplina, 0);
    const chPendente = chTotal - chAlocada;
    
    const professoresUnicos = [...new Set(appState.data.map(item => item.professor).filter(p => p !== '-'))].length;
    const turmasUnicas = [...new Set(appState.data.map(item => item.turma))].length;
    
    // Render to DOM
    document.getElementById('dashTotalTurmas').innerText = turmasUnicas;
    document.getElementById('dashDisciplinasSemProf').innerText = disciplinasSemProf;
    document.getElementById('dashChAlocada').innerText = `${chAlocada}h / ${chTotal}h`;
    document.getElementById('dashProfessores').innerText = professoresUnicos;
    
    // Allocation rate progress bar
    const rate = ((chAlocada / chTotal) * 100).toFixed(1);
    document.getElementById('dashAllocationRateText').innerText = `Taxa de Lotação: ${rate}%`;
    document.getElementById('dashAllocationProgressBar').style.width = `${rate}%`;
    
    // 2. Render Dashboard Charts
    setTimeout(renderDashboardCharts, 50); // Small timeout to ensure DOM is ready
}

function renderDashboardCharts() {
    const isDark = appState.theme === 'dark';
    const textThemeColor = isDark ? '#94a3b8' : '#475569';
    const gridThemeColor = isDark ? '#1e293b' : '#e2e8f0';
    
    // 2.1 Doughnut: Allocation status (Hours allocated vs pending)
    const chAlocada = appState.data.filter(item => item.professor !== '-').reduce((sum, item) => sum + item.ch_disciplina, 0);
    const chPendente = appState.data.reduce((sum, item) => sum + item.ch_disciplina, 0) - chAlocada;
    
    if (charts.allocation) charts.allocation.destroy();
    const ctxAlloc = document.getElementById('chartAllocation').getContext('2d');
    charts.allocation = new Chart(ctxAlloc, {
        type: 'doughnut',
        data: {
            labels: ['Horas Loteadas', 'Horas Sem Professor'],
            datasets: [{
                data: [chAlocada, chPendente],
                backgroundColor: ['#006d37', '#ba1a1a'],
                borderWidth: 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: { color: textThemeColor }
                }
            },
            cutout: '70%'
        }
    });
    
    // 2.2 Bar: Workload by Shift (Turno)
    const turnos = ['MANHA', 'TARDE', 'NOITE'];
    const chByShift = turnos.map(shift => {
        return appState.data.filter(item => item.turno === shift).reduce((sum, item) => sum + item.ch_disciplina, 0);
    });
    const vagoByShift = turnos.map(shift => {
        return appState.data.filter(item => item.turno === shift && item.professor === '-').reduce((sum, item) => sum + item.ch_disciplina, 0);
    });
    
    if (charts.shifts) charts.shifts.destroy();
    const ctxShifts = document.getElementById('chartShifts').getContext('2d');
    charts.shifts = new Chart(ctxShifts, {
        type: 'bar',
        data: {
            labels: ['Manhã', 'Tarde', 'Noite'],
            datasets: [
                {
                    label: 'CH Total',
                    data: chByShift,
                    backgroundColor: 'rgba(79, 70, 229, 0.8)',
                    borderRadius: 4
                },
                {
                    label: 'CH Sem Professor',
                    data: vagoByShift,
                    backgroundColor: 'rgba(239, 68, 68, 0.8)',
                    borderRadius: 4
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    labels: { color: textThemeColor }
                }
            },
            scales: {
                x: {
                    grid: { color: gridThemeColor },
                    ticks: { color: textThemeColor }
                },
                y: {
                    grid: { color: gridThemeColor },
                    ticks: { color: textThemeColor }
                }
            }
        }
    });
    
    // 2.3 Horizontal Bar: Top 5 teachers by workload load
    const profHours = {};
    appState.data.forEach(item => {
        if (item.professor !== '-') {
            profHours[item.professor] = (profHours[item.professor] || 0) + item.ch_disciplina;
        }
    });
    const sortedProfs = Object.entries(profHours)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5);
        
    const topLabels = sortedProfs.map(x => x[0].split(' ').slice(0, 2).join(' ')); // Short name (first 2 words)
    const topValues = sortedProfs.map(x => x[1]);
    
    if (charts.topTeachers) charts.topTeachers.destroy();
    const ctxTop = document.getElementById('chartTopTeachers').getContext('2d');
    charts.topTeachers = new Chart(ctxTop, {
        type: 'bar',
        data: {
            labels: topLabels,
            datasets: [{
                label: 'Carga Horária Loteada (Horas)',
                data: topValues,
                backgroundColor: 'rgba(16, 185, 129, 0.8)',
                borderRadius: 4
            }]
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    labels: { color: textThemeColor }
                }
            },
            scales: {
                x: {
                    grid: { color: gridThemeColor },
                    ticks: { color: textThemeColor }
                },
                y: {
                    grid: { color: gridThemeColor },
                    ticks: { color: textThemeColor }
                }
            }
        }
    });
}

/* ==========================================================================
   TABELA VIEW (CRM MAIN LISTING)
   ========================================================================== */
function renderTabelaView() {
    // 1. Apply active state filters
    let filtered = appState.data.filter(item => {
        // Text search (checks professor, disciplina, turma, oferta)
        const text = appState.filters.search.toLowerCase();
        const matchesSearch = !text || 
            item.professor.toLowerCase().includes(text) ||
            item.disciplina.toLowerCase().includes(text) ||
            item.turma.toLowerCase().includes(text) ||
            String(item.oferta).includes(text) ||
            String(item.matricula).includes(text);
            
        // Select selectors
        const matchesTurno = !appState.filters.turno || item.turno === appState.filters.turno;
        const matchesTurma = !appState.filters.turma || item.turma === appState.filters.turma;
        const matchesModal = !appState.filters.modal || item.modal === appState.filters.modal;
        const matchesDisciplina = !appState.filters.disciplina || item.disciplina === appState.filters.disciplina;
        
        // Status filter
        let matchesStatus = true;
        if (appState.filters.status === 'lotado') {
            matchesStatus = item.professor !== '-';
        } else if (appState.filters.status === 'vago') {
            matchesStatus = item.professor === '-';
        }
        
        return matchesSearch && matchesTurno && matchesTurma && matchesModal && matchesDisciplina && matchesStatus;
    });
    
    // Sort so empty ones are on top (or simple index sort)
    // We maintain default sorting (by school order from PDF)
    
    // 2. Pagination Math
    const totalItems = filtered.length;
    const totalPages = Math.ceil(totalItems / appState.itemsPerPage) || 1;
    if (appState.currentPage > totalPages) appState.currentPage = totalPages;
    
    const startIndex = (appState.currentPage - 1) * appState.itemsPerPage;
    const endIndex = Math.min(startIndex + appState.itemsPerPage, totalItems);
    
    const pageItems = filtered.slice(startIndex, endIndex);
    
    // 3. Render items in table body
    DOM.tabelaCorpo.innerHTML = '';
    
    if (pageItems.length === 0) {
        DOM.tabelaCorpo.innerHTML = `
            <tr>
                <td colspan="10" style="text-align: center; padding: 3rem; color: var(--text-muted);">
                    <i class="fas fa-folder-open" style="font-size: 2rem; margin-bottom: 0.5rem; display: block;"></i>
                    Nenhum registro encontrado com os filtros aplicados.
                </td>
            </tr>
        `;
        DOM.paginationInfo.innerText = 'Mostrando 0 de 0 registros';
        DOM.paginationButtons.innerHTML = '';
        return;
    }
    
    pageItems.forEach((item, idx) => {
        const isVago = item.professor === '-';
        const globalIndex = appState.data.findIndex(x => x.oferta === item.oferta && x.disciplina === item.disciplina);
        
        const rowHTML = `
            <tr>
                <td><strong>${item.oferta}</strong></td>
                <td><span class="badge ${item.modal === 'REG' ? 'badge-info' : item.modal === 'EJA' ? 'badge-warning' : 'badge-success'}">${item.modal}</span></td>
                <td>${item.turno}</td>
                <td><strong>${item.turma}</strong></td>
                <td>${item.num_alunos}</td>
                <td><span class="badge badge-secondary">${item.codigo || '-'}</span></td>
                <td style="max-width: 250px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${item.disciplina}">${item.disciplina}</td>
                <td><span class="badge badge-info">${item.ch_disciplina}h</span></td>
                <td>
                    ${isVago 
                        ? `<span class="badge badge-danger"><i class="fas fa-exclamation-triangle"></i> VAGO</span>` 
                        : `<div>
                             <div style="font-weight:600; font-size:0.825rem;">${item.professor}</div>
                             <div style="font-size:0.7rem; color:var(--text-muted);">${item.matricula} (${item.ch_professor}h)</div>
                           </div>`
                    }
                </td>
                <td>
                    ${isVago
                        ? `<button class="btn btn-primary btn-sm" onclick="abrirModalAlocacao(${globalIndex})">
                             <i class="fas fa-user-plus"></i> Lotar
                           </button>`
                        : `<button class="btn btn-secondary btn-sm" onclick="irParaBaixa(${globalIndex})">
                             <i class="fas fa-user-minus"></i> Dar Baixa
                           </button>`
                    }
                </td>
            </tr>
        `;
        DOM.tabelaCorpo.innerHTML += rowHTML;
    });
    
    // 4. Render Pagination UI
    DOM.paginationInfo.innerText = `Mostrando ${startIndex + 1} a ${endIndex} de ${totalItems} registros`;
    
    DOM.paginationButtons.innerHTML = '';
    
    // Prev button
    const btnPrev = document.createElement('button');
    btnPrev.className = 'btn-page';
    btnPrev.innerHTML = '<i class="fas fa-chevron-left"></i>';
    btnPrev.disabled = appState.currentPage === 1;
    btnPrev.addEventListener('click', () => {
        appState.currentPage--;
        renderTabelaView();
    });
    DOM.paginationButtons.appendChild(btnPrev);
    
    // Page range logic
    let startPage = Math.max(1, appState.currentPage - 2);
    let endPage = Math.min(totalPages, startPage + 4);
    if (endPage - startPage < 4) {
        startPage = Math.max(1, endPage - 4);
    }
    
    for (let p = startPage; p <= endPage; p++) {
        const btnPage = document.createElement('button');
        btnPage.className = `btn-page ${p === appState.currentPage ? 'active' : ''}`;
        btnPage.innerText = p;
        btnPage.addEventListener('click', () => {
            appState.currentPage = p;
            renderTabelaView();
        });
        DOM.paginationButtons.appendChild(btnPage);
    }
    
    // Next button
    const btnNext = document.createElement('button');
    btnNext.className = 'btn-page';
    btnNext.innerHTML = '<i class="fas fa-chevron-right"></i>';
    btnNext.disabled = appState.currentPage === totalPages;
    btnNext.addEventListener('click', () => {
        appState.currentPage++;
        renderTabelaView();
    });
    DOM.paginationButtons.appendChild(btnNext);
}

/* ==========================================================================
   ALLOCATION / DEALLOCATION MODALS
   ========================================================================== */
function abrirModalAlocacao(globalIndex) {
    const item = appState.data[globalIndex];
    
    DOM.modalTitle.innerText = 'Lotar Professor na Disciplina';
    DOM.modalBody.innerHTML = `
        <div style="background-color: var(--bg-main); padding:1rem; border-radius:var(--border-radius-sm); margin-bottom:1.5rem; font-size:0.875rem;">
            <div><strong>Turma:</strong> ${item.turma} (${item.turno})</div>
            <div><strong>Disciplina:</strong> ${item.disciplina}</div>
            <div><strong>Carga Horária:</strong> ${item.ch_disciplina}h</div>
        </div>
        <form id="formAlocacao">
            <div class="form-group">
                <label for="modalProfNome">Nome do Professor</label>
                <input type="text" id="modalProfNome" class="form-control" placeholder="Ex: JOAO DA SILVA SANTOS" required>
            </div>
            <div class="form-group">
                <label for="modalProfMatricula">Matrícula</label>
                <input type="text" id="modalProfMatricula" class="form-control" placeholder="Ex: 1234567-1" required>
            </div>
            <div class="form-group">
                <label for="modalProfCh">Carga Horária Total do Prof. (Opcional)</label>
                <input type="number" id="modalProfCh" class="form-control" placeholder="Carga horária atual contratual do professor" min="1" max="60">
            </div>
        </form>
    `;
    
    openModal();
    
    // Handle submission
    DOM.modalConfirmBtn.onclick = () => {
        const form = document.getElementById('formAlocacao');
        if (!form.reportValidity()) return;
        
        const nome = document.getElementById('modalProfNome').value.toUpperCase().stripSpaces();
        const matricula = document.getElementById('modalProfMatricula').value.trim();
        const chVal = document.getElementById('modalProfCh').value;
        const chProf = chVal ? parseInt(chVal) : 40; // Default to 40 if not specified
        
        // Update database
        appState.data[globalIndex].professor = nome;
        appState.data[globalIndex].matricula = matricula;
        appState.data[globalIndex].ch_professor = chProf;
        
        saveDataToStorage();
        closeModal();
        renderTabelaView();
        
        // Show success visual notification
        showToast('Professor alocado com sucesso!');
    };
}

// Redirects to Ficha de Desistência pre-filled
function irParaBaixa(globalIndex) {
    const item = appState.data[globalIndex];
    switchView('fichaDesistencia');
    
    // Pre-fill the teacher select in the Desistência form
    const select = document.getElementById('desistenciaProfSelect');
    select.value = item.professor;
    
    // Trigger the change event manually to load their disciplines
    const event = new Event('change');
    select.dispatchEvent(event);
}

function openModal() {
    DOM.modalOverlay.classList.add('active');
}

function closeModal() {
    DOM.modalOverlay.classList.remove('active');
}

/* ==========================================================================
   FICHA DE LOTAÇÃO VIEW
   ========================================================================== */
function initFichaLotacaoView() {
    const select = document.getElementById('lotacaoProfSelect');
    const dataGeralInput = document.getElementById('lotacaoDataGeral');
    
    // Get unique list of registered teachers
    const professores = appState.professores.map(p => p.nome).sort();
    
    select.innerHTML = `
        <option value="">-- Selecione o Professor --</option>
        <option value="AVULSO" style="font-weight: bold; color: var(--primary);">-- GERAR FICHA AVULSA (PREENCHIMENTO MANUAL) --</option>
    `;
    professores.forEach(prof => {
        select.innerHTML += `<option value="${prof}">${prof}</option>`;
    });
    
    // Clear display initially
    document.getElementById('lotacaoContainer').style.display = 'none';
    
    // Event listener for date propagation
    if (dataGeralInput) {
        dataGeralInput.oninput = () => {
            const dateVal = dataGeralInput.value;
            const dateInputs = document.querySelectorAll('.fic-doc-date');
            dateInputs.forEach(input => {
                if (input.dataset.customized !== 'true') {
                    input.value = dateVal;
                }
            });
        };
    }
    
    select.onchange = (e) => {
        const profNome = e.target.value;
        const avulsaDiv = document.getElementById('fichaAvulsaInputs');
        
        if (!profNome) {
            document.getElementById('lotacaoContainer').style.display = 'none';
            if (avulsaDiv) avulsaDiv.style.display = 'none';
            return;
        }
        
        if (profNome === 'AVULSO') {
            if (avulsaDiv) avulsaDiv.style.display = 'block';
            
            // Set default blank values
            document.getElementById('avulsaNome').value = '';
            document.getElementById('avulsaMatricula').value = '';
            document.getElementById('avulsaDV').value = '';
            document.getElementById('avulsaCargo').value = 'PROFESSOR';
            document.getElementById('avulsaVinculo').value = 'EFETIVO';
            
            const renderAvulsa = () => {
                const manualNome = document.getElementById('avulsaNome').value.toUpperCase();
                const manualMat = document.getElementById('avulsaMatricula').value;
                const manualDV = document.getElementById('avulsaDV').value;
                const manualCargo = document.getElementById('avulsaCargo').value;
                const manualVinculo = document.getElementById('avulsaVinculo').value;
                
                const manualRegistry = {
                    nome: manualNome || 'NOME DO PROFESSOR',
                    matricula: manualMat || '-',
                    dv: manualDV || '',
                    cargo: manualCargo,
                    vinculo: manualVinculo,
                    setor: ''
                };
                
                const printArea = document.getElementById('fichaLotacaoPrintArea');
                const dateVal = dataGeralInput ? dataGeralInput.value : '09/07/2026';
                
                // For manual/avulsa ficha, we just render 1 blank page (10 empty rows)
                const pageItems = Array(10).fill(undefined);
                printArea.innerHTML = gerarHtmlFichaPagina(manualRegistry.nome, manualRegistry, pageItems, 1, dateVal);
            };
            
            // Re-render whenever inputs change
            document.getElementById('avulsaNome').oninput = renderAvulsa;
            document.getElementById('avulsaMatricula').oninput = renderAvulsa;
            document.getElementById('avulsaDV').oninput = renderAvulsa;
            document.getElementById('avulsaCargo').onchange = renderAvulsa;
            document.getElementById('avulsaVinculo').onchange = change => {
                renderAvulsa();
            };
            
            // Initial render
            renderAvulsa();
            document.getElementById('lotacaoContainer').style.display = 'block';
            return;
        }
        
        if (avulsaDiv) avulsaDiv.style.display = 'none';
        
        // Find teacher in registry
        const profRegistry = appState.professores.find(p => p.nome === profNome) || {
            nome: profNome,
            matricula: '-',
            dv: '-',
            cargo: 'PROFESSOR',
            vinculo: 'EFETIVO',
            setor: ''
        };
        
        // Get all classes of this teacher
        const profDisciplinas = appState.data.filter(item => item.professor === profNome);
        
        // Determine how many pages to render (slice into blocks of 10 rows)
        const itemsPerPage = 10;
        const totalPages = Math.max(1, Math.ceil(profDisciplinas.length / itemsPerPage));
        
        const printArea = document.getElementById('fichaLotacaoPrintArea');
        printArea.innerHTML = '';
        
        const dateVal = dataGeralInput ? dataGeralInput.value : '09/07/2026';
        
        // Generate pages
        for (let page = 0; page < totalPages; page++) {
            const startIdx = page * itemsPerPage;
            const endIdx = startIdx + itemsPerPage;
            const pageItems = profDisciplinas.slice(startIdx, endIdx);
            
            printArea.innerHTML += gerarHtmlFichaPagina(profNome, profRegistry, pageItems, startIdx + 1, dateVal);
        }
        
        document.getElementById('lotacaoContainer').style.display = 'block';
    };
}

/* ==========================================================================
   FICHA DE DESISTÊNCIA VIEW
   ========================================================================== */
function initFichaDesistenciaView() {
    const select = document.getElementById('desistenciaProfSelect');
    const subSelect = document.getElementById('substitutoSelect');
    const inputName = document.getElementById('substitutoNome');
    const inputMat = document.getElementById('substitutoMatricula');
    
    const professores = appState.professores.map(p => p.nome).sort();
    
    select.innerHTML = '<option value="">-- Selecione o Professor Desistente --</option>';
    professores.forEach(prof => {
        select.innerHTML += `<option value="${prof}">${prof}</option>`;
    });
    
    subSelect.innerHTML = '<option value="">-- Cadastrar Novo Professor --</option>';
    professores.forEach(prof => {
        subSelect.innerHTML += `<option value="${prof}">${prof}</option>`;
    });
    
    // Clear display
    document.getElementById('desistenciaContainer').style.display = 'none';
    
    select.onchange = (e) => {
        const prof = e.target.value;
        if (!prof) {
            document.getElementById('desistenciaContainer').style.display = 'none';
            return;
        }
        
        // Get all classes of this teacher
        const profDisciplinas = appState.data.filter(item => item.professor === prof);
        
        const profRegistry = appState.professores.find(p => p.nome === prof) || { matricula: '-' };
        renderFichasDesistencia(prof, profRegistry, profDisciplinas);
        
        document.getElementById('desistenciaContainer').style.display = 'block';
    };
    
    // Handle substitute selection change
    subSelect.onchange = (e) => {
        const name = e.target.value;
        if (name) {
            inputName.value = name;
            const match = appState.professores.find(x => x.nome === name);
            inputMat.value = match ? match.matricula : '';
            inputName.disabled = true;
            inputMat.disabled = true;
        } else {
            inputName.value = '';
            inputMat.value = '';
            inputName.disabled = false;
            inputMat.disabled = false;
        }
        atualizarFichasDesistencia();
    };

    inputName.oninput = atualizarFichasDesistencia;
    inputMat.oninput = atualizarFichasDesistencia;
}

function atualizarFichasDesistencia() {
    const prof = document.getElementById('desistenciaProfSelect').value;
    if (!prof) return;

    const profRegistry = appState.professores.find(p => p.nome === prof) || { matricula: '-' };
    const profDisciplinas = appState.data.filter(item => item.professor === prof);
    renderFichasDesistencia(prof, profRegistry, profDisciplinas);
}

function renderFichasDesistencia(profNome, profRegistry, profDisciplinas) {
    const itemsPerPage = 5;
    const totalPages = Math.max(1, Math.ceil(profDisciplinas.length / itemsPerPage));
    const printArea = document.getElementById('fichaDesistenciaPrintArea');
    const subNome = document.getElementById('substitutoNome').value.trim();
    const subMatricula = document.getElementById('substitutoMatricula').value.trim();
    const subRegistry = appState.professores.find(p => p.nome === subNome) || {};

    printArea.innerHTML = '';
    for (let page = 0; page < totalPages; page++) {
        const startIdx = page * itemsPerPage;
        const pageItems = profDisciplinas.slice(startIdx, startIdx + itemsPerPage);
        printArea.innerHTML += gerarHtmlDesistenciaPagina(
            profNome,
            profRegistry,
            pageItems,
            startIdx + 1,
            subNome,
            subMatricula,
            subRegistry.dv || ''
        );
    }
}

function gerarHtmlDesistenciaPagina(profNome, profRegistry, disciplinasPagina, startSeq, subNome, subMatricula, subDv) {
    let rowsHtml = '';
    let subRowsHtml = '';
    let totalCh = 0;

    for (let i = 0; i < 5; i++) {
        const item = disciplinasPagina[i];
        const seq = startSeq + i;
        totalCh += item ? Number(item.ch_disciplina) || 0 : 0;
        rowsHtml += gerarLinhaPesquisaFicha(item, seq, `des-${seq}`);
        subRowsHtml += gerarLinhaPesquisaFicha(item, seq, `sub-${seq}`);
    }

    const vinculo = profRegistry.vinculo || '';
    const dv = profRegistry.dv || '';
    const cargo = profRegistry.cargo || 'PROFESSOR';
    const setor = profRegistry.setor || '';
    const idFuncional = [profRegistry.matricula || '', dv].filter(Boolean).join('-');

    return `
        <div class="form-view-container form-desistencia-page">
            <div class="form-header-official" style="display:flex; align-items:center; border-bottom:2px solid #000; padding-bottom:0.5rem; margin-bottom:1.5rem; gap:1.5rem;">
                <div style="flex-shrink:0; display:flex; align-items:center; justify-content:center;">
                    <img src="logo_para.jpg" alt="Brasão Pará" style="height:65px; width:auto;">
                </div>
                <div class="form-header-title" style="text-align:left; line-height:1.4;">
                    <h1>GOVERNO DO ESTADO DO PARÁ</h1>
                    <h2>SECRETARIA DE ESTADO DE EDUCAÇÃO</h2>
                    <h2>SECRETARIA ADJUNTA DE GESTÃO DE PESSOAS</h2>
                    <h2>DIRETORIA DE PLANEJAMENTO E GESTÃO DE PESSOAS</h2>
                    <h2>COORDENADORIA DE DESCENTRALIZAÇÃO</h2>
                </div>
            </div>

            <div class="form-title-official">FORMULÁRIO DE DESISTÊNCIA DE CARGA HORÁRIA</div>

            <div class="form-section-title-bar"><span>Professor Desistente</span></div>
            <div class="official-horizontal-fields desistencia-identificacao">
                <div class="field-row">
                    <span><strong>URE/USE:</strong> 22 - XINGUARA</span>
                    <span><strong>Município:</strong> OURILÂNDIA DO NORTE</span>
                    <span><strong>Cód MEC:</strong> 15120902</span>
                </div>
                <div class="field-row">
                    <span><strong>Setor:</strong><span class="official-underline-span des-field-setor">${setor}</span></span>
                    <span class="des-field-escola"><strong>Escola:</strong> ESCOLA ESTADUAL DR ROMILDO VELOSO E SILVA</span>
                    <span><strong>T. de vínculo:</strong><span class="official-underline-span des-field-vinculo">${vinculo}</span></span>
                </div>
                <div class="field-row">
                    <span><strong>Matrícula:</strong><span class="official-underline-span des-field-matricula">${profRegistry.matricula || ''}</span></span>
                    <span><strong>V:</strong><span class="official-underline-span des-field-dv">${dv}</span></span>
                    <span class="des-field-nome"><strong>Nome:</strong><span class="official-underline-span">${profNome}</span></span>
                    <span><strong>Cargo:</strong><span class="official-underline-span des-field-cargo">${cargo}</span></span>
                </div>
            </div>

            <table class="ficha-table-official desistencia-table">
                <thead>
                    <tr>
                        <th style="width:8%; text-align:center;">Nº Seq</th>
                        <th style="width:20%;">Turma</th>
                        <th style="width:52%;"><span class="ficha-screen-only">Código</span><span class="ficha-print-only">Disciplina</span></th>
                        <th style="width:20%; text-align:center;">CH Semanal</th>
                    </tr>
                </thead>
                <tbody>${rowsHtml}</tbody>
                <tfoot>
                    <tr>
                        <td colspan="3" style="text-align:right; font-weight:bold;">Total de Carga Horária</td>
                        <td><input class="ficha-total-ch" type="text" value="${totalCh}h" readonly style="text-align:center; font-weight:bold;"></td>
                    </tr>
                </tfoot>
            </table>

            <div class="desistencia-declaracao">
                Eu, <span class="official-underline-span">${profNome}</span>, Id. Fund.
                <span class="official-underline-span des-field-id">${idFuncional}</span>, autorizo a baixa de carga horária acima especificada a partir desta data.
            </div>
            <div class="desistencia-data"><strong>Data de Desistência:</strong> <input type="text" placeholder="__/__/____"></div>
            <div class="desistencia-signature desistencia-signature-center"><div class="signature-block">Assinatura do(a) Servidor(a)</div></div>

            <div class="form-section-title-bar desistencia-sub-title"><span>Professor Substituto</span></div>
            <div class="official-horizontal-fields desistencia-substituto">
                <div class="field-row"><strong>Professor Substituto:</strong><span class="official-underline-span">${subNome}</span></div>
                <div class="field-row">
                    <strong>Matrícula:</strong><span class="official-underline-span des-field-submat">${subMatricula}</span>
                    <strong>V:</strong><span class="official-underline-span des-field-dv">${subDv}</span>
                </div>
            </div>

            <table class="ficha-table-official desistencia-table desistencia-table-sub">
                <thead>
                    <tr>
                        <th style="width:8%; text-align:center;">Nº Seq</th>
                        <th style="width:20%;">Turma</th>
                        <th style="width:52%;"><span class="ficha-screen-only">Código</span><span class="ficha-print-only">Disciplina</span></th>
                        <th style="width:20%; text-align:center;">CH Semanal</th>
                    </tr>
                </thead>
                <tbody>${subRowsHtml}</tbody>
                <tfoot>
                    <tr>
                        <td colspan="3" style="text-align:right; font-weight:bold;">Total de Carga Horária</td>
                        <td><input class="ficha-total-ch" type="text" value="${totalCh}h" readonly style="text-align:center; font-weight:bold;"></td>
                    </tr>
                </tfoot>
            </table>

            <div class="desistencia-data"><strong>Data:</strong> <input type="text" placeholder="__/__/____"></div>
            <div class="desistencia-signatures-final">
                <div class="signature-block">Assinatura do(a) Servidor(a)</div>
                <div class="signature-block">Assinatura do(a) Diretor(a)</div>
                <div class="signature-block">Assinatura do(a) Gestor(a)</div>
            </div>
        </div>
    `;
}

// Executes the workload relief / substitution transaction
function processarBaixaSubstituicao() {
    const desistente = document.getElementById('desistenciaProfSelect').value;
    const subNome = document.getElementById('substitutoNome').value.toUpperCase().stripSpaces();
    const subMat = document.getElementById('substitutoMatricula').value.trim();
    
    if (!desistente) return;
    
    // Get all disciplines currently under the desistente teacher
    const items = appState.data.filter(item => item.professor === desistente);
    
    if (items.length === 0) return;
    
    // Ask for user confirmation
    const confirmMsg = subNome 
        ? `Tem certeza que deseja substituir ${desistente} por ${subNome} em todas as ${items.length} disciplinas?`
        : `Tem certeza que deseja dar baixa na carga horária de ${desistente} e deixar as ${items.length} disciplinas vagas?`;
        
    if (!confirm(confirmMsg)) return;
    
    // Process replacement or clearance
    appState.data.forEach(item => {
        if (item.professor === desistente) {
            if (subNome) {
                // Substitute teacher
                item.professor = subNome;
                item.matricula = subMat;
                item.ch_professor = 40; // Default or retain
            } else {
                // Clear teacher (set vago)
                item.professor = '-';
                item.matricula = '-';
                item.ch_professor = null;
            }
        }
    });
    
    saveDataToStorage();
    showToast(subNome ? 'Substituição realizada com sucesso!' : 'Baixa de carga horária concluída!');
    
    // Reload state and return to dashboard
    loadData();
    switchView('dashboard');
}

/* ==========================================================================
   RELATÓRIOS VIEW
   ========================================================================== */
function renderRelatoriosView() {
    // 1. Report: Classes without teacher
    const semProfList = appState.data.filter(item => item.professor === '-');
    const tbodySemProf = document.getElementById('repSemProfBody');
    tbodySemProf.innerHTML = '';
    
    document.getElementById('repSemProfCount').innerText = `${semProfList.length} disciplinas sem lotação`;
    
    if (semProfList.length === 0) {
        tbodySemProf.innerHTML = `<tr><td colspan="5" style="text-align:center; color:var(--text-muted);">Excelente! Nenhuma disciplina sem professor.</td></tr>`;
    } else {
        semProfList.slice(0, 10).forEach(item => {
            tbodySemProf.innerHTML += `
                <tr>
                    <td><strong>${item.oferta}</strong></td>
                    <td><span class="badge badge-warning">${item.turno}</span></td>
                    <td><strong>${item.turma}</strong></td>
                    <td>${item.disciplina}</td>
                    <td><span class="badge badge-danger">${item.ch_disciplina}h</span></td>
                </tr>
            `;
        });
        if (semProfList.length > 10) {
            tbodySemProf.innerHTML += `<tr><td colspan="5" style="text-align:center; font-weight:600; color:var(--primary);">... e mais ${semProfList.length - 10} disciplinas sem lotação. Veja todas na aba Mapa.</td></tr>`;
        }
    }
    
    // 2. Report: Teacher workloads
    const profHours = {};
    const profMats = {};
    appState.data.forEach(item => {
        if (item.professor !== '-') {
            profHours[item.professor] = (profHours[item.professor] || 0) + item.ch_disciplina;
            profMats[item.professor] = item.matricula;
        }
    });
    
    const tbodyProfs = document.getElementById('repProfBody');
    tbodyProfs.innerHTML = '';
    
    const sortedProfs = Object.entries(profHours).sort((a, b) => b[1] - a[1]);
    
    sortedProfs.slice(0, 10).forEach(([name, hours]) => {
        const mat = profMats[name];
        // If workload exceeds 40h, flag it
        const isOverload = hours > 40;
        
        tbodyProfs.innerHTML += `
            <tr>
                <td><strong>${mat}</strong></td>
                <td><strong>${name}</strong></td>
                <td>
                    <span class="badge ${isOverload ? 'badge-danger' : 'badge-success'}">${hours}h</span>
                    ${isOverload ? `<span style="font-size:0.7rem; color:var(--danger-text); font-weight:600; margin-left:0.5rem;"><i class="fas fa-exclamation-circle"></i> Sobrecarga</span>` : ''}
                </td>
            </tr>
        `;
    });
    
    // 3. Detailed Teacher Workload Report
    const repSelect = document.getElementById('repDocenteSelect');
    if (repSelect) {
        const professoresList = [...new Set(appState.data.map(item => item.professor).filter(p => p !== '-'))].sort();
        
        repSelect.innerHTML = '<option value="">-- Selecione o Professor --</option>';
        professoresList.forEach(prof => {
            repSelect.innerHTML += `<option value="${prof}">${prof}</option>`;
        });
        
        document.getElementById('repDocenteContainer').style.display = 'none';
        document.getElementById('btnPrintRepDocente').style.display = 'none';
        
        repSelect.onchange = (e) => {
            const profName = e.target.value;
            const container = document.getElementById('repDocenteContainer');
            const printBtn = document.getElementById('btnPrintRepDocente');
            
            if (!profName) {
                container.style.display = 'none';
                printBtn.style.display = 'none';
                return;
            }
            
            const profDisciplinas = appState.data.filter(item => item.professor === profName);
            const firstItem = profDisciplinas[0];
            
            document.getElementById('repDocenteNome').innerText = profName;
            document.getElementById('repDocenteMatricula').innerText = firstItem ? firstItem.matricula : '-';
            
            let totalChVal = 0;
            const tbody = document.getElementById('repDocenteTableBody');
            tbody.innerHTML = '';
            
            profDisciplinas.forEach(item => {
                totalChVal += item.ch_disciplina;
                tbody.innerHTML += `
                    <tr>
                        <td><strong>${item.turma}</strong></td>
                        <td><span class="badge badge-secondary">${item.codigo || '-'}</span></td>
                        <td>${item.disciplina}</td>
                        <td>${item.turno}</td>
                        <td><span class="badge badge-info">${item.ch_disciplina}h</span></td>
                    </tr>
                `;
            });
            
            document.getElementById('repDocenteChTotal').innerText = `${totalChVal}h`;
            
            container.style.display = 'block';
            printBtn.style.display = 'inline-flex';
        };
    }
}

/* ==========================================================================
   EXPORT FUNCTIONS (PDF & EXCEL)
   ========================================================================== */
function exportarExcelCompleto() {
    // Generate an excel spreadsheet using sheetjs
    try {
        // Headers mapping
        const headers = ["ANO", "OFERTA", "MODALIDADE", "TURNO", "TURMA", "Nº ALUNOS", "DISCIPLINA", "CH DISCIPLINA", "PROFESSOR", "MATRICULA", "CH PROFESSOR"];
        
        const rawRows = appState.data.map(item => [
            item.ano,
            item.oferta,
            item.modal,
            item.turno,
            item.turma,
            item.num_alunos,
            item.disciplina,
            item.ch_disciplina,
            item.professor,
            item.matricula,
            item.ch_professor || '-'
        ]);
        
        const sheetData = [headers, ...rawRows];
        
        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.aoa_to_sheet(sheetData);
        
        // Apply column widths
        const wscols = [
            {wch: 8}, {wch: 10}, {wch: 12}, {wch: 10}, {wch: 12}, {wch: 10}, {wch: 35}, {wch: 15}, {wch: 30}, {wch: 15}, {wch: 15}
        ];
        ws['!cols'] = wscols;
        
        XLSX.utils.book_append_sheet(wb, ws, "Mapa de Lotação");
        XLSX.writeFile(wb, `MAPA_DE_LOTACAO_COMPLETO_2026.xlsx`);
        showToast('Planilha Excel exportada com sucesso!');
    } catch(err) {
        console.error(err);
        alert('Erro ao exportar planilha Excel. Verifique se a biblioteca SheetJS está carregada.');
    }
}

function exportarPDFCompleto() {
    // Generate PDF using jsPDF
    try {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF('l', 'mm', 'a4'); // landscape
        
        doc.setFont('helvetica');
        doc.setFontSize(14);
        doc.text("SECRETARIA DE ESTADO DE EDUCAÇÃO DO PARÁ", 15, 15);
        doc.setFontSize(11);
        doc.text("RELATÓRIO DE MAPEAMENTO DE TURMAS E LOTAÇÃO - ANO 2026", 15, 22);
        doc.text(`Escola: EE DR ROMILDO VELOSO E SILVA - Ourilândia do Norte`, 15, 28);
        
        // Get data to render
        const headers = [["Oferta", "Modal", "Turno", "Turma", "Alunos", "Disciplina", "CH", "Professor", "Matrícula"]];
        
        // Map top 40 items just for preview speed or full list (A4 landscape fits nicely)
        // Since printing all 631 rows might take 15+ pages, let's export the full list in chunks or full table
        const rows = appState.data.map(item => [
            item.oferta,
            item.modal,
            item.turno,
            item.turma,
            item.num_alunos,
            item.disciplina,
            item.ch_disciplina,
            item.professor,
            item.matricula
        ]);
        
        doc.autoTable({
            head: headers,
            body: rows,
            startY: 35,
            theme: 'grid',
            styles: { fontSize: 8, cellPadding: 2 },
            headStyles: { fillColor: [79, 70, 229] },
            margin: { left: 15, right: 15 }
        });
        
        doc.save(`MAPA_DE_LOTACAO_COMPLETO_2026.pdf`);
        showToast('Documento PDF exportado com sucesso!');
    } catch(err) {
        console.error(err);
        alert('Erro ao exportar PDF. Verifique se as bibliotecas jsPDF e jspdf-autotable estão carregadas.');
    }
}

function imprimirFicha() {
    const originalTitle = document.title;
    const restoreTitle = () => {
        document.title = originalTitle;
    };

    // Prevent the application name from appearing in browser-generated headers.
    document.title = '';
    window.addEventListener('afterprint', restoreTitle, { once: true });
    window.print();
}

function imprimirRelatorioDocente() {
    const content = document.getElementById('repDocenteContainer').innerHTML;
    const win = window.open('', '_blank');
    win.document.write(`
        <html>
        <head>
            <title>Relatório de Lotação Docente - ${document.getElementById('repDocenteNome').innerText}</title>
            <style>
                body { background: white; color: black; padding: 2rem; font-family: sans-serif; }
                #repDocenteContainer { display: block !important; border: none !important; padding: 0 !important; background: transparent !important; }
                .table-responsive { border: none !important; }
                .custom-table { width: 100%; border-collapse: collapse; margin-top: 1rem; }
                .custom-table th, .custom-table td { border: 1px solid #000 !important; padding: 8px !important; text-align: left; font-size: 10pt; }
                .custom-table th { background-color: #f1f5f9 !important; font-weight: bold; }
                .badge { border: 1px solid #ccc; padding: 2px 6px; border-radius: 4px; font-size: 0.8rem; }
                .badge-success { background-color: #d1fae5; color: #065f46; font-weight: bold; }
                .badge-secondary { background-color: #f1f5f9; color: #334155; }
                .badge-info { background-color: #e6f7ed; color: #006d37; }
            </style>
        </head>
        <body>
            <h2 style="font-size: 14pt; font-weight: bold; margin-bottom: 0.25rem; text-transform: uppercase;">Governo do Estado do Pará</h2>
            <h3 style="font-size: 12pt; font-weight: 500; margin-bottom: 1.5rem; color: #444;">Secretaria de Estado de Educação - SEDUC</h3>
            <div id="repDocenteContainer">${content}</div>
            <script>
                setTimeout(() => { window.print(); window.close(); }, 500);
            </script>
        </body>
        </html>
    `);
    win.document.close();
}

/* ==========================================================================
   HELPER UTILITIES
   ========================================================================== */
function showToast(message) {
    // Basic CSS Toast notification
    const toast = document.createElement('div');
    toast.style.position = 'fixed';
    toast.style.bottom = '2rem';
    toast.style.right = '2rem';
    toast.style.backgroundColor = 'var(--primary)';
    toast.style.color = '#fff';
    toast.style.padding = '1rem 1.5rem';
    toast.style.borderRadius = 'var(--border-radius-md)';
    toast.style.boxShadow = 'var(--shadow-lg)';
    toast.style.zIndex = '300';
    toast.style.fontWeight = '600';
    toast.style.display = 'flex';
    toast.style.alignItems = 'center';
    toast.style.gap = '0.5rem';
    toast.innerHTML = `<i class="fas fa-check-circle"></i> ${message}`;
    
    document.body.appendChild(toast);
    
    // Slide up animation
    toast.animate([
        { transform: 'translateY(20px)', opacity: 0 },
        { transform: 'translateY(0)', opacity: 1 }
    ], { duration: 200, easing: 'ease-out' });
    
    setTimeout(() => {
        toast.animate([
            { transform: 'translateY(0)', opacity: 1 },
            { transform: 'translateY(20px)', opacity: 0 }
        ], { duration: 200, easing: 'ease-in' }).onfinish = () => {
            toast.remove();
        };
    }, 3000);
}

// Prototype extensions for sanitizing text
String.prototype.stripSpaces = function() {
    return this.replace(/\s+/g, ' ').trim();
};


/* ==========================================================================
   CADASTRO DE PROFESSORES VIEW
   ========================================================================== */
function renderCadastroProfView() {
    const tbody = document.getElementById('cadProfCorpo');
    if (!tbody) return;
    
    const searchVal = (appState.filtersCad && appState.filtersCad.search || '').toLowerCase();
    
    let filtered = appState.professores;
    if (searchVal) {
        filtered = appState.professores.filter(p => 
            p.nome.toLowerCase().includes(searchVal) ||
            p.matricula.toLowerCase().includes(searchVal) ||
            p.cargo.toLowerCase().includes(searchVal) ||
            p.vinculo.toLowerCase().includes(searchVal)
        );
    }
    
    tbody.innerHTML = '';
    
    if (filtered.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="7" style="text-align: center; padding: 2rem; color: var(--text-muted);">
                    Nenhum professor cadastrado.
                </td>
            </tr>
        `;
        return;
    }
    
    filtered.forEach(p => {
        tbody.innerHTML += `
            <tr>
                <td><strong>${p.matricula}</strong></td>
                <td><strong>${p.dv || '-'}</strong></td>
                <td><strong>${p.nome}</strong></td>
                <td>${p.cargo}</td>
                <td><span class="badge badge-info">${p.vinculo}</span></td>
                <td>${p.setor}</td>
                <td>
                    <button class="btn btn-secondary btn-sm" onclick="abrirModalCadastroProf('${p.matricula}')">
                        <i class="fas fa-edit"></i> Editar
                    </button>
                    <button class="btn btn-danger btn-sm" onclick="excluirProfessor('${p.matricula}')">
                        <i class="fas fa-trash"></i> Excluir
                    </button>
                </td>
            </tr>
        `;
    });
}

function abrirModalCadastroProf(matriculaToEdit = null) {
    const isEdit = matriculaToEdit !== null;
    let profObj = { nome: '', matricula: '', dv: '', cargo: 'PROFESSOR', vinculo: 'EFETIVO', setor: '' };
    
    if (isEdit) {
        profObj = appState.professores.find(p => p.matricula === matriculaToEdit) || profObj;
    }
    
    // Normalize old cargos to PROFESSOR or PROFESSORA if needed
    let currentCargo = profObj.cargo || 'PROFESSOR';
    if (!currentCargo.includes('PROFESSOR') && !currentCargo.includes('PROFESSORA')) {
        currentCargo = 'PROFESSOR';
    } else if (currentCargo.includes('PROFESSORA')) {
        currentCargo = 'PROFESSORA';
    } else {
        currentCargo = 'PROFESSOR';
    }

    let currentVinculo = profObj.vinculo || 'EFETIVO';
    if (!currentVinculo.includes('EFETIVO') && !currentVinculo.includes('TEMPORÁRIO')) {
        currentVinculo = 'EFETIVO';
    }
    
    DOM.modalTitle.innerText = isEdit ? 'Editar Professor' : 'Cadastrar Novo Professor';
    DOM.modalBody.innerHTML = `
        <form id="formCadastroProf">
            <div class="form-group">
                <label for="cadProfNome">Nome Completo</label>
                <input type="text" id="cadProfNome" class="form-control" value="${profObj.nome}" placeholder="Ex: MARIA SOUZA SILVA" required>
            </div>
            <div style="display:grid; grid-template-columns: 3fr 1fr; gap:1rem; margin-bottom:1rem;">
                <div class="form-group" style="margin-bottom:0;">
                    <label for="cadProfMatricula">Matrícula</label>
                    <input type="text" id="cadProfMatricula" class="form-control" value="${profObj.matricula}" placeholder="Ex: 5973373" required ${isEdit ? 'disabled' : ''}>
                </div>
                <div class="form-group" style="margin-bottom:0;">
                    <label for="cadProfDV">V (DV)</label>
                    <input type="text" id="cadProfDV" class="form-control" value="${profObj.dv}" placeholder="Ex: 2" maxlength="1">
                </div>
            </div>
            <div class="form-group">
                <label for="cadProfCargo">Cargo</label>
                <select id="cadProfCargo" class="form-control" required>
                    <option value="PROFESSOR" ${currentCargo === 'PROFESSOR' ? 'selected' : ''}>PROFESSOR</option>
                    <option value="PROFESSORA" ${currentCargo === 'PROFESSORA' ? 'selected' : ''}>PROFESSORA</option>
                </select>
            </div>
            <div class="form-group">
                <label for="cadProfVinculo">T. de Vínculo</label>
                <select id="cadProfVinculo" class="form-control" required>
                    <option value="EFETIVO" ${currentVinculo === 'EFETIVO' ? 'selected' : ''}>EFETIVO</option>
                    <option value="TEMPORÁRIO" ${currentVinculo === 'TEMPORÁRIO' ? 'selected' : ''}>TEMPORÁRIO</option>
                </select>
            </div>
        </form>
    `;
    
    openModal();
    
    DOM.modalConfirmBtn.onclick = () => {
        const form = document.getElementById('formCadastroProf');
        if (!form.reportValidity()) return;
        
        const nome = document.getElementById('cadProfNome').value.toUpperCase().stripSpaces();
        const matricula = document.getElementById('cadProfMatricula').value.trim();
        const dv = document.getElementById('cadProfDV').value.trim();
        const cargo = document.getElementById('cadProfCargo').value;
        const vinculo = document.getElementById('cadProfVinculo').value;
        const setor = ''; // Setor is a fixed blank line on the form
        
        if (isEdit) {
            const index = appState.professores.findIndex(p => p.matricula === matriculaToEdit);
            const oldName = appState.professores[index].nome;
            
            appState.professores[index] = { nome, matricula, dv, cargo, vinculo, setor };
            
            // Cascade update to Lotações database if name/matricula changes!
            appState.data.forEach(item => {
                if (item.professor === oldName) {
                    item.professor = nome;
                    item.matricula = `${matricula}-${dv}`;
                }
            });
            saveDataToStorage();
        } else {
            // Check for duplicate matricula
            if (appState.professores.some(p => p.matricula === matricula)) {
                alert('Já existe um professor cadastrado com esta matrícula!');
                return;
            }
            appState.professores.push({ nome, matricula, dv, cargo, vinculo, setor });
        }
        
        saveProfessoresToStorage();
        closeModal();
        renderCadastroProfView();
        showToast(isEdit ? 'Professor atualizado!' : 'Professor cadastrado com sucesso!');
    };
}

function excluirProfessor(matricula) {
    const prof = appState.professores.find(p => p.matricula === matricula);
    if (!prof) return;
    
    if (!confirm(`Tem certeza que deseja excluir o cadastro do professor ${prof.nome}? (Isso não altera o mapa de lotações atual)`)) return;
    
    appState.professores = appState.professores.filter(p => p.matricula !== matricula);
    saveProfessoresToStorage();
    renderCadastroProfView();
    showToast('Professor removido do cadastro!');
}


/* Helper to render official Ficha pages dynamically */
function formatarTurmaFicha(item) {
    return item ? `${item.turma} (${item.turno})` : '';
}

function gerarOpcoesTurmaFicha() {
    const turmas = [...new Set(appState.data.map(formatarTurmaFicha))].filter(Boolean).sort();
    return turmas.map(turma => `<option value="${turma}"></option>`).join('');
}

function gerarOpcoesCodigoFicha(turmaSelecionada = '') {
    const registros = turmaSelecionada
        ? appState.data.filter(item => formatarTurmaFicha(item) === turmaSelecionada)
        : appState.data;
    const unicos = new Map();

    registros.forEach(item => {
        if (item.codigo && !unicos.has(String(item.codigo))) {
            unicos.set(String(item.codigo), item.disciplina);
        }
    });

    return [...unicos.entries()]
        .sort((a, b) => a[0].localeCompare(b[0], 'pt-BR', { numeric: true }))
        .map(([codigo, disciplina]) => `<option value="${codigo}">${disciplina}</option>`)
        .join('');
}

function gerarLinhaPesquisaFicha(item, seq, prefixo, dateVal = null) {
    const turma = formatarTurmaFicha(item);
    const codigo = item?.codigo || '';
    const disciplina = item?.disciplina || '';
    const ch = item ? `${item.ch_disciplina}h` : '';
    const turmaListId = `${prefixo}-turmas`;
    const codigoListId = `${prefixo}-codigos`;
    const dataCell = dateVal === null ? '' : `
        <td><input type="text" class="fic-doc-date" data-customized="false" value="${item ? dateVal : ''}" oninput="this.dataset.customized='true'"></td>
    `;

    return `
        <tr class="ficha-pesquisa-row">
            <td style="text-align:center; font-weight:bold;">${seq}</td>
            <td>
                <input class="ficha-search-control ficha-filtro-turma" type="text" list="${turmaListId}" value="${turma}" placeholder="Pesquisar turma" onchange="sincronizarLinhaFicha(this, 'turma')">
                <datalist id="${turmaListId}">${gerarOpcoesTurmaFicha()}</datalist>
                <span class="ficha-print-value ficha-print-turma">${turma}</span>
            </td>
            <td>
                <input class="ficha-search-control ficha-filtro-codigo" type="text" list="${codigoListId}" value="${codigo}" placeholder="Pesquisar código" onchange="sincronizarLinhaFicha(this, 'codigo')">
                <datalist id="${codigoListId}">${gerarOpcoesCodigoFicha(turma)}</datalist>
                <span class="ficha-print-value ficha-print-disciplina">${disciplina}</span>
            </td>
            <td style="text-align:center;"><input class="ficha-filtro-ch" type="text" value="${ch}" readonly style="text-align:center; font-weight:bold;"></td>
            ${dataCell}
        </tr>
    `;
}

function sincronizarLinhaFicha(input, tipo) {
    const row = input.closest('.ficha-pesquisa-row');
    if (!row) return;

    const turmaSelect = row.querySelector('.ficha-filtro-turma');
    const codigoSelect = row.querySelector('.ficha-filtro-codigo');
    const turmaPrint = row.querySelector('.ficha-print-turma');
    const disciplinaPrint = row.querySelector('.ficha-print-disciplina');
    const chInput = row.querySelector('.ficha-filtro-ch');

    if (tipo === 'turma') {
        const chosenTurma = turmaSelect.value;
        
        // Re-populate the disciplines dropdown for this chosen turma
        let codigoOptionsHtml = '<option value="">-- Selecione a Disciplina --</option>';
        if (chosenTurma) {
            const matchingRegs = appState.data.filter(reg => formatarTurmaFicha(reg) === chosenTurma);
            const seenCodes = new Set();
            matchingRegs.forEach(reg => {
                const key = `${reg.codigo}-${reg.disciplina}`;
                if (!seenCodes.has(key)) {
                    seenCodes.add(key);
                    codigoOptionsHtml += `<option value="${reg.codigo}">${reg.codigo} - ${reg.disciplina}</option>`;
                }
            });
        }
        codigoSelect.innerHTML = codigoOptionsHtml;
        codigoSelect.value = '';
        
        // Clear outputs
        turmaPrint.textContent = chosenTurma;
        disciplinaPrint.textContent = '';
        chInput.value = '';
        atualizarTotalTabelaFicha(row);
        return;
    }

    if (tipo === 'codigo') {
        const chosenTurma = turmaSelect.value;
        const chosenCodigo = codigoSelect.value;
        
        if (!chosenTurma || !chosenCodigo) {
            disciplinaPrint.textContent = '';
            chInput.value = '';
            atualizarTotalTabelaFicha(row);
            return;
        }
        
        // Find matching item in database
        const item = appState.data.find(reg => 
            formatarTurmaFicha(reg) === chosenTurma && 
            String(reg.codigo) === chosenCodigo
        );
        
        if (item) {
            disciplinaPrint.textContent = item.codigo || '-';
            chInput.value = `${item.ch_disciplina}h`;
        } else {
            disciplinaPrint.textContent = '';
            chInput.value = '';
        }
        
        atualizarTotalTabelaFicha(row);
    }
}

function atualizarTotalTabelaFicha(row) {
    const table = row.closest('table');
    const totalInput = table?.querySelector('.ficha-total-ch');
    if (!totalInput) return;

    const total = [...table.querySelectorAll('.ficha-filtro-ch')]
        .reduce((sum, input) => sum + (Number.parseFloat(input.value) || 0), 0);
    totalInput.value = `${total}h`;
}

function gerarHtmlFichaPagina(profNome, profRegistry, disciplinasPagina, startSeq, dateVal) {
    let docenciaRowsHtml = '';
    for (let i = 0; i < 10; i++) {
        const item = disciplinasPagina[i];
        const seq = startSeq + i;
        docenciaRowsHtml += gerarLinhaPesquisaFicha(item, seq, `lot-${seq}`, dateVal);
    }

    return `
        <div class="form-view-container">
            <!-- Official Header -->
            <div class="form-header-official" style="display: flex; align-items: center; border-bottom: 2px solid #000; padding-bottom: 0.5rem; margin-bottom: 1.5rem; gap: 1.5rem;">
                <div style="flex-shrink: 0; display: flex; align-items: center; justify-content: center;">
                    <img src="logo_para.jpg" alt="Brasão Pará" style="height: 65px; width: auto;">
                </div>
                <div class="form-header-title" style="text-align: left; line-height: 1.4;">
                    <h1 style="font-size: 0.95rem; font-weight: 800; margin: 0; text-transform: uppercase; color: #000; font-family: sans-serif; letter-spacing: 0.02em;">GOVERNO DO ESTADO DO PARÁ</h1>
                    <h2 style="font-size: 0.85rem; font-weight: 800; margin: 0; text-transform: uppercase; color: #000; font-family: sans-serif; letter-spacing: 0.02em;">SECRETARIA DE ESTADO DE EDUCAÇÃO</h2>
                    <h2 style="font-size: 0.85rem; font-weight: 800; margin: 0; text-transform: uppercase; color: #000; font-family: sans-serif; letter-spacing: 0.02em;">SECRETARIA ADJUNTA DE GESTÃO DE PESSOAS</h2>
                    <h2 style="font-size: 0.85rem; font-weight: 800; margin: 0; text-transform: uppercase; color: #000; font-family: sans-serif; letter-spacing: 0.02em;">DIRETORIA DE PLANEJAMENTO E GESTÃO DE PESSOAS</h2>
                    <h2 style="font-size: 0.85rem; font-weight: 800; margin: 0; text-transform: uppercase; color: #000; font-family: sans-serif; letter-spacing: 0.02em;">COORDENADORIA DE DESCENTRALIZAÇÃO</h2>
                </div>
            </div>
            
            <div class="form-title-official" style="text-align: center; font-size: 1.25rem; font-weight: 800; text-transform: uppercase; margin-bottom: 1.5rem; letter-spacing: 0.05em; color: #000;">FORMULÁRIO AVULSO DE LOTAÇÃO</div>
            
            <!-- Section 1 -->
            <div class="form-section-title-bar">
                <span>Informações da Nova Lotação</span>
                <span>ANO: 2026</span>
            </div>
            
            <!-- Horizontal fields -->
            <div class="official-horizontal-fields">
                <div class="field-row">
                    <span style="flex-grow: 0; margin-right: 3rem;"><strong>URE/USE:</strong> 22 - XINGUARA</span>
                    <span style="flex-grow: 1; margin-right: 2rem;"><strong>Município:</strong> OURILÂNDIA DO NORTE</span>
                    <span style="flex-grow: 0;"><strong>Cód MEC:</strong> 15120902</span>
                </div>
                
                <div class="field-row" style="margin-top: 0.75rem;">
                    <span style="flex-grow: 0; display: inline-flex; align-items: center;">
                        <strong>Setor:</strong>
                        <span class="official-underline-span" style="width: 140px; margin-left: 5px;"></span>
                    </span>
                    <span style="flex-grow: 1; margin-left: 2rem; margin-right: 2rem;">
                        <strong>Escola:</strong> ESCOLA ESTADUAL DR ROMILDO VELOSO E SILVA
                    </span>
                    <span style="flex-grow: 0; display: inline-flex; align-items: center;">
                        <strong>T. de vínculo:</strong>
                        <span class="official-underline-span" style="width: 130px; margin-left: 5px;">${profRegistry.vinculo}</span>
                    </span>
                </div>
                
                <div class="field-row" style="margin-top: 0.75rem;">
                    <span style="flex-grow: 0; display: inline-flex; align-items: center;">
                        <strong>Matrícula:</strong>
                        <span class="official-underline-span" style="width: 120px; margin-left: 5px;">${profRegistry.matricula}</span>
                    </span>
                    <span style="flex-grow: 0; margin-left: 1.5rem; display: inline-flex; align-items: center;">
                        <strong>V:</strong>
                        <span class="official-underline-span" style="width: 35px; margin-left: 5px;">${profRegistry.dv}</span>
                    </span>
                    <span style="flex-grow: 1; margin-left: 2rem; margin-right: 2rem; display: inline-flex; align-items: center;">
                        <strong>Nome:</strong>
                        <span class="official-underline-span" style="width: 100%; margin-left: 5px; font-weight: bold; text-align: left;">${profNome}</span>
                    </span>
                    <span style="flex-grow: 0; display: inline-flex; align-items: center;">
                        <strong>Cargo:</strong>
                        <span class="official-underline-span" style="width: 150px; margin-left: 5px;">${profRegistry.cargo}</span>
                    </span>
                </div>
            </div>
            
            <!-- Section 2 -->
            <div class="form-section-title-bar" style="margin-top: 1.25rem;">
                <span>Inclusões de Docência</span>
                <span>Total CH. neste setor para o Ano</span>
                <span>Horas/semanais</span>
            </div>
            <table class="ficha-table-official">
                <thead>
                    <tr style="font-size: 0.75rem; font-weight: bold; text-transform: uppercase;">
                        <th style="width: 8%; text-align:center; border:none; padding-bottom: 4px;">N° Seq</th>
                        <th style="width: 25%; border:none; padding-bottom: 4px;">Turma</th>
                        <th style="width: 42%; border:none; padding-bottom: 4px;"><span class="ficha-screen-only">Código</span><span class="ficha-print-only">Disciplina</span></th>
                        <th style="width: 12%; text-align:center; border:none; padding-bottom: 4px;">CH Semanal</th>
                        <th style="width: 13%; text-align:center; border:none; padding-bottom: 4px;">Data Inicial</th>
                    </tr>
                </thead>
                <tbody>
                    ${docenciaRowsHtml}
                </tbody>
            </table>
            
            <!-- Section 3 -->
            <div class="form-section-title-bar" style="margin-top: 1.25rem;">
                <span>Inclusões de Apoio</span>
                <span>Total CH. neste setor para o Ano</span>
                <span>Horas/semanais</span>
            </div>
            <table class="ficha-table-official">
                <thead>
                    <tr style="font-size: 0.75rem; font-weight: bold; text-transform: uppercase;">
                        <th style="width: 8%; text-align:center; border:none; padding-bottom: 4px;">N° Seq</th>
                        <th style="width: 15%; border:none; padding-bottom: 4px;">Código</th>
                        <th style="width: 45%; border:none; padding-bottom: 4px;">Atividade</th>
                        <th style="width: 20%; border:none; padding-bottom: 4px;">Turno</th>
                        <th style="width: 12%; text-align:center; border:none; padding-bottom: 4px;">CH Semanal</th>
                        <th style="width: 13%; text-align:center; border:none; padding-bottom: 4px;">Data Inicial</th>
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        <td style="text-align:center; font-weight:bold;">1</td>
                        <td><input type="text" class="official-underline-input"></td>
                        <td><input type="text" class="official-underline-input"></td>
                        <td><input type="text" class="official-underline-input"></td>
                        <td><input type="text" class="official-underline-input" style="text-align:center;"></td>
                        <td><input type="text" class="official-underline-input" placeholder="__/__/____" style="text-align:center;"></td>
                    </tr>
                    <tr>
                        <td style="text-align:center; font-weight:bold;">2</td>
                        <td><input type="text" class="official-underline-input"></td>
                        <td><input type="text" class="official-underline-input"></td>
                        <td><input type="text" class="official-underline-input"></td>
                        <td><input type="text" class="official-underline-input" style="text-align:center;"></td>
                        <td><input type="text" class="official-underline-input" placeholder="__/__/____" style="text-align:center;"></td>
                    </tr>
                    <tr>
                        <td style="text-align:center; font-weight:bold;">3</td>
                        <td><input type="text" class="official-underline-input"></td>
                        <td><input type="text" class="official-underline-input"></td>
                        <td><input type="text" class="official-underline-input"></td>
                        <td><input type="text" class="official-underline-input" style="text-align:center;"></td>
                        <td><input type="text" class="official-underline-input" placeholder="__/__/____" style="text-align:center;"></td>
                    </tr>
                    <tr>
                        <td style="text-align:center; font-weight:bold;">4</td>
                        <td><input type="text" class="official-underline-input"></td>
                        <td><input type="text" class="official-underline-input"></td>
                        <td><input type="text" class="official-underline-input"></td>
                        <td><input type="text" class="official-underline-input" style="text-align:center;"></td>
                        <td><input type="text" class="official-underline-input" placeholder="__/__/____" style="text-align:center;"></td>
                    </tr>
                    <tr>
                        <td style="text-align:center; font-weight:bold;">5</td>
                        <td><input type="text" class="official-underline-input"></td>
                        <td><input type="text" class="official-underline-input"></td>
                        <td><input type="text" class="official-underline-input"></td>
                        <td><input type="text" class="official-underline-input" style="text-align:center;"></td>
                        <td><input type="text" class="official-underline-input" placeholder="__/__/____" style="text-align:center;"></td>
                    </tr>
                </tbody>
            </table>
            
            <!-- Date at the bottom -->
            <div style="margin-top: 1.5rem; font-weight: bold; font-size: 0.85rem;">
                Data: <input type="text" class="official-underline-input" value="${dateVal}" style="width: 150px; text-align: center;">
            </div>
            
            <!-- Signatures -->
            <div class="signatures-section" style="margin-top: 2.5rem;">
                <div class="signature-block" style="border-top: 1px solid #000; max-width: 250px;">
                    Assinatura do(a) Servidor(a)
                </div>
                <div class="signature-block" style="border-top: 1px solid #000; max-width: 250px;">
                    Assinatura do(a) Diretor(a)
                </div>
            </div>
        </div>
    `;
}


/* View for Disciplinas Tab */
function initDisciplinasView() {
    const select = document.getElementById('disciplinasTurmaSelect');
    if (!select) return;
    
    // Get unique list of active turmas
    const turmas = [...new Set(appState.data.map(item => item.turma))].sort();
    
    select.innerHTML = '<option value="">-- Selecione a Turma --</option>';
    turmas.forEach(t => {
        select.innerHTML += `<option value="${t}">${t}</option>`;
    });
    
    const container = document.getElementById('disciplinasTurmaContainer');
    container.style.display = 'none';
    
    select.onchange = (e) => {
        const turmaSelected = e.target.value;
        if (!turmaSelected) {
            container.style.display = 'none';
            return;
        }
        
        // Find disciplines of this turma
        const turmaItems = appState.data.filter(item => item.turma === turmaSelected);
        if (turmaItems.length === 0) {
            container.style.display = 'none';
            return;
        }
        
        // Get details of the first item to populate header
        const refItem = turmaItems[0];
        
        // Map details
        document.getElementById('dispTurma').innerText = refItem.turma;
        document.getElementById('dispTurno').innerText = refItem.turno;
        
        // Determine Série from turma name (e.g. M1... -> PRIMEIRA, M2... -> SEGUNDA, M3... -> TERCEIRA)
        let serie = 'NÃO INFORMADA';
        if (refItem.turma.startsWith('M1')) {
            serie = 'PRIMEIRA';
        } else if (refItem.turma.startsWith('M2')) {
            serie = 'SEGUNDA';
        } else if (refItem.turma.startsWith('M3')) {
            serie = 'TERCEIRA';
        }
        document.getElementById('dispSerie').innerText = serie;
        
        // Determine Curso (e.g., AEE -> ATENDIMENTO EDUCACIONAL ESPECIALIZADO, or if modal REG -> ENS MED REGULAR)
        let curso = 'ENS MED REGULAR';
        if (refItem.modal === 'AEE') {
            curso = 'AEE - ATENDIMENTO EDUCACIONAL ESPECIALIZADO';
        }
        document.getElementById('dispCurso').innerText = curso;
        
        // Render disciplines list in table body
        const tbody = document.getElementById('disciplinasTurmaCorpo');
        tbody.innerHTML = '';
        
        turmaItems.forEach(item => {
            let profText = '<span style="color: var(--text-muted); font-style: italic;">Não alocado (pendente)</span>';
            let badgeClass = 'badge badge-warning';
            
            if (item.professor && item.professor !== '-') {
                // Find if they have matricula details in registry to show like "5908639/4 - CHARLENE SILVA MAIA"
                const parts = item.matricula ? item.matricula.split('-') : [];
                const matStr = parts[0] ? `${parts[0]}${parts[1] ? '/' + parts[1] : ''}` : '';
                profText = `<strong>${matStr ? matStr + ' - ' : ''}${item.professor}</strong>`;
                badgeClass = 'badge badge-success';
            }
            
            tbody.innerHTML += `
                <tr>
                    <td style="font-weight: bold; color: var(--primary);">${item.codigo || '-'}</td>
                    <td style="font-weight: 500;">${item.disciplina}</td>
                    <td style="text-align: center; font-weight: bold;">${item.ch_disciplina}h</td>
                    <td>
                        <div style="display: flex; align-items: center; justify-content: space-between; gap: 1rem;">
                            <span>${profText}</span>
                            <span class="${badgeClass}">${badgeClass.includes('success') ? 'Alocado' : 'Pendente'}</span>
                        </div>
                    </td>
                </tr>
            `;
        });
        
        container.style.display = 'block';
    };
}
