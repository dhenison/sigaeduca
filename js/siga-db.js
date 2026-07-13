// SIGA EDUCA - Client-side Local Storage Database Layer
// Persists form submissions, profile edits, calendar events, occurrences and student class change logs locally.

let mediaStream = null;

// Limpeza única dos dados de exemplo já gravados no navegador
(function clearExampleDataOnce() {
    try {
        if (localStorage.getItem('siga_exemplo_removido') === '1') return;
        const keys = [];
        for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            if (k && k.startsWith('siga_')) keys.push(k);
        }
        keys.forEach((k) => localStorage.removeItem(k));
        if (typeof indexedDB !== 'undefined') {
            indexedDB.deleteDatabase('siga_boletins_db');
        }
        localStorage.setItem('siga_exemplo_removido', '1');
        localStorage.setItem('siga_students', '[]');
        localStorage.setItem('siga_classes', '[]');
        localStorage.setItem('siga_occurrences', '[]');
        localStorage.setItem('siga_agenda_events', '[]');
        localStorage.setItem('siga_books', '[]');
        localStorage.setItem('siga_book_returns', '[]');
        localStorage.setItem('siga_olimpiadas', '[]');
        localStorage.setItem('siga_olimpiada_inscricoes', '[]');
        localStorage.setItem('siga_documentos_secretaria', '[]');
        localStorage.setItem('siga_boletim_status', '{}');
        localStorage.setItem('siga_boletim_meta', '{}');
        localStorage.setItem('siga_student_occurrences', '{}');
    } catch (e) { /* ignore */ }
})();

document.addEventListener('DOMContentLoaded', () => {
    const pathForMatch = (window.location.pathname + ' ' + window.location.href).toLowerCase();
    const isAuthPage = /(?:^|[\/\s])login(?:\.html)?(?:[?#\s]|$)|(?:^|[\/\s])portal-aluno(?:\.html)?(?:[?#\s]|$)/i.test(pathForMatch);

    // Gate de autenticação no cliente (até Supabase Auth)
    if (window.SigaSecurity && typeof window.SigaSecurity.requireAuth === 'function') {
        if (!window.SigaSecurity.requireAuth()) return;
    }

    // Seed databases if needed
    getClasses();
    getCalendarDays();

    // Login / portal: não aplicar shell (padding da sidebar esmagava o card)
    if (isAuthPage) {
        document.body.classList.add('siga-auth-page');
        // Login/portal: sem rodapé global (evita scroll na tela de autenticação)
        return;
    }

    // 1. Sync User Profile globally on all pages
    syncProfile();

    // 2. Bind Profile Page Logic (meuperfil.html)
    if (window.location.pathname.includes('meuperfil.html')) {
        initProfilePage();
    }

    // 11. Bind Usuários Page Logic (usuarios.html)
    if (window.location.pathname.includes('usuarios.html')) {
        if (typeof initUsuariosPage === 'function') initUsuariosPage();
    }

    // 3. Bind School Page Logic (escola.html)
    if (window.location.pathname.includes('escola.html')) {
        initSchoolPage();
    }

    // 4. Bind Agenda Page Logic (agenda.html)
    if (window.location.pathname.includes('agenda.html')) {
        initAgendaPage();
    }

    // 5. Bind Occurrences Page Logic (ocorrencias.html)
    if (window.location.pathname.includes('ocorrencias.html')) {
        initOccurrencesPage();
    }

    // 6. Bind Permissions Page Logic (permissões.html)
    if (window.location.pathname.includes('permissões.html') || window.location.pathname.includes('permiss%C3%B5es.html') || /permiss/i.test(window.location.pathname)) {
        if (typeof window.initPermissionsPage === 'function') window.initPermissionsPage();
    }

    // 7. Bind Alunos Page Logic (alunos.html)
    if (window.location.pathname.includes('alunos.html')) {
        initAlunosPage();
    }

    // 8. Bind Ficha do Aluno Page Logic (fichadoaluno.html)
    if (window.location.pathname.includes('fichadoaluno.html')) {
        initFichaPage();
    }

    // 9. Bind Turmas Page Logic (turmas.html)
    if (window.location.pathname.includes('turmas.html')) {
        initTurmasPage();
    }

    // 10. Bind Turma Detalhe Page Logic (turmadetalhe.html)
    if (window.location.pathname.includes('turmadetalhe.html')) {
        initTurmaDetalhePage();
    }

    // 11. Bind Painel Principal (painelprincipal.html)
    if (window.location.pathname.includes('painelprincipal.html')) {
        if (typeof window.initPainelPrincipal === 'function') {
            window.initPainelPrincipal();
        }
    }

    // 11b. Painel Admin + permissões de menu por escola
    ensurePainelAdminScript(function () {
        if (typeof window.initPainelAdminPage === 'function') {
            window.initPainelAdminPage();
        } else if (typeof window.applySchoolMenuPermissions === 'function') {
            window.applySchoolMenuPermissions();
        }
    });

    // 12. Bind Relatórios (relatorios.html)
    if (window.location.pathname.includes('relatorios.html')) {
        if (typeof window.initRelatoriosPage === 'function') {
            window.initRelatoriosPage();
        }
    }

    // 13. Busca global no header (sempre visível)
    ensureBuscaGlobalScript(function () {
        if (typeof window.initGlobalHeaderSearch === 'function') {
            window.initGlobalHeaderSearch();
        }
    });

    // 14. Rodapé institucional
    ensureAppFooter();

    // 15. Shell responsivo (drawer mobile + sidebar)
    ensureShellAssets(function () {
        if (typeof window.initSigaShell === 'function') {
            window.initSigaShell();
        }
    });
});

const SIGA_FOOTER_TEXT = '© 2026 SIGA EDUCA Sistemas. Todos os direitos reservados - Desenvolvido por Dhenison Carlos';

function ensureAppFooter() {
    try {
        let hasExisting = false;
        // Atualiza rodapés/copyright já existentes
        document.querySelectorAll('footer p, footer, p, div').forEach((el) => {
            if (el.children.length > 3) return; // evita varrer containers grandes
            const t = (el.childNodes.length === 1 && el.childNodes[0].nodeType === 3)
                ? (el.textContent || '').trim()
                : (el.tagName === 'P' ? (el.textContent || '').trim() : '');
            if (!t || t.length > 180) return;
            if (/©\s*20\d{2}\s*SIGA EDUCA/i.test(t) || (/direitos reservados/i.test(t) && /SIGA EDUCA/i.test(t))) {
                el.textContent = SIGA_FOOTER_TEXT;
                hasExisting = true;
            }
        });

        // Login: texto costuma estar direto no div
        if (!hasExisting) {
            document.querySelectorAll('main > div, main div.text-center').forEach((el) => {
                const t = (el.textContent || '').trim();
                if (/©\s*20\d{2}\s*SIGA EDUCA/i.test(t) && el.children.length === 0) {
                    el.textContent = SIGA_FOOTER_TEXT;
                    hasExisting = true;
                }
            });
        }

        if (hasExisting || document.getElementById('siga-app-footer')) return;

        const footer = document.createElement('footer');
        footer.id = 'siga-app-footer';
        footer.setAttribute('aria-label', 'Rodapé');
        footer.style.cssText = [
            'margin-top:auto',
            'padding:20px 24px',
            'text-align:center',
            'font-size:12px',
            'line-height:1.5',
            'color:#6B7280',
            'border-top:1px solid #E5E7EB',
            'background:rgba(255,255,255,0.55)'
        ].join(';');
        footer.innerHTML = '<p style="margin:0">' + SIGA_FOOTER_TEXT + '</p>';

        const main = document.querySelector('main');
        if (main) {
            const content = Array.from(main.children).find((c) =>
                c.classList && (c.classList.contains('p-8') || String(c.className || '').indexOf('p-8') >= 0)
            );
            if (content && content.tagName !== 'HEADER') {
                content.appendChild(footer);
            } else {
                main.appendChild(footer);
            }
        } else {
            document.body.appendChild(footer);
        }

        // Login: contraste no fundo verde
        if ((window.location.pathname || '').toLowerCase().indexOf('login.html') >= 0) {
            footer.style.background = 'transparent';
            footer.style.borderTop = 'none';
            footer.style.color = 'rgba(18,28,42,0.75)';
            footer.style.padding = '8px 12px 0';
        }
    } catch (e) { /* ignore */ }
}

window.ensureAppFooter = ensureAppFooter;

function ensureBuscaGlobalScript(done) {
    if (typeof window.initGlobalHeaderSearch === 'function') {
        done();
        return;
    }
    const existing = document.querySelector('script[data-siga-busca-global]');
    if (existing) {
        existing.addEventListener('load', done);
        return;
    }
    const s = document.createElement('script');
    s.src = 'js/busca-global.js';
    s.dataset.sigaBuscaGlobal = '1';
    s.onload = done;
    s.onerror = done;
    document.head.appendChild(s);
}

function ensurePainelAdminScript(done) {
    if (typeof window.initPainelAdminPage === 'function' || typeof window.applySchoolMenuPermissions === 'function') {
        done();
        return;
    }
    const existing = document.querySelector('script[data-siga-painel-admin]');
    if (existing) {
        existing.addEventListener('load', done);
        existing.addEventListener('error', done);
        return;
    }
    const s = document.createElement('script');
    s.src = 'js/painel-admin.js';
    s.dataset.sigaPainelAdmin = '1';
    s.onload = done;
    s.onerror = done;
    document.head.appendChild(s);
}

function ensureShellAssets(done) {
    // Critical CSS early: hide drawer off-screen before full stylesheet loads
    if (!document.getElementById('siga-shell-critical')) {
        const crit = document.createElement('style');
        crit.id = 'siga-shell-critical';
        crit.textContent = '@media (max-width:1023.98px){aside#sidebar{position:fixed!important;left:0;top:0;height:100vh;width:min(86vw,300px)!important;transform:translateX(-105%)!important;z-index:120;display:flex!important;flex-direction:column!important}body.drawer-open aside#sidebar{transform:none!important}#btn-mobile-nav{display:inline-flex} @media (min-width:1024px){#btn-mobile-nav{display:none!important}}';
        document.head.appendChild(crit);
    }

    const finish = () => {
        done();
    };

    const loadJs = () => {
        if (typeof window.initSigaShell === 'function') {
            finish();
            return;
        }
        const existing = document.querySelector('script[data-siga-shell]');
        if (existing) {
            existing.addEventListener('load', finish);
            existing.addEventListener('error', finish);
            return;
        }
        const s = document.createElement('script');
        s.src = 'js/siga-shell.js';
        s.dataset.sigaShell = '1';
        s.onload = finish;
        s.onerror = finish;
        document.head.appendChild(s);
    };

    if (!document.querySelector('link[data-siga-shell-css]')) {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = 'css/siga-shell.css';
        link.dataset.sigaShellCss = '1';
        document.head.appendChild(link);
    }
    loadJs();
}

// Toast Notification Manager
function showToast(message, type = 'success') {
    let container = document.getElementById('siga-toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'siga-toast-container';
        container.style.cssText = 'position: fixed; bottom: 24px; right: 24px; z-index: 10000; display: flex; flex-direction: column; gap: 8px; font-family: "Inter", sans-serif;';
        document.body.appendChild(container);
    }
    
    const toast = document.createElement('div');
    toast.style.cssText = `
        background-color: ${type === 'success' ? '#006d37' : '#ba1a1a'};
        color: white;
        padding: 12px 24px;
        border-radius: 12px;
        box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.2), 0 4px 6px -2px rgba(0, 0, 0, 0.1);
        font-size: 14px;
        font-weight: 600;
        display: flex;
        align-items: center;
        gap: 8px;
        transform: translateY(20px);
        opacity: 0;
        transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    `;
    
    const icon = document.createElement('span');
    icon.className = 'material-symbols-outlined';
    icon.style.fontSize = '18px';
    icon.textContent = type === 'success' ? 'check_circle' : 'error';
    
    const text = document.createElement('span');
    text.textContent = message;
    
    toast.appendChild(icon);
    toast.appendChild(text);
    container.appendChild(toast);
    
    setTimeout(() => {
        toast.style.transform = 'translateY(0)';
        toast.style.opacity = '1';
    }, 50);
    
    setTimeout(() => {
        toast.style.transform = 'translateY(-20px)';
        toast.style.opacity = '0';
        setTimeout(() => {
            toast.remove();
        }, 300);
    }, 3000);
}

function findStaffUserForSession(session) {
    session = session || null;
    try {
        if (!session) session = JSON.parse(localStorage.getItem('siga_session') || 'null');
    } catch (e) {
        session = null;
    }
    if (!session || session.tipo === 'aluno') return null;
    try {
        const users = JSON.parse(localStorage.getItem('siga_users') || '[]') || [];
        if (!Array.isArray(users)) return null;
        return users.find((u) =>
            String(u.id) === String(session.id) ||
            String(u.email || '').toLowerCase() === String(session.email || '').toLowerCase()
        ) || null;
    } catch (e) {
        return null;
    }
}

function getProfileData() {
    let session = null;
    try {
        session = JSON.parse(localStorage.getItem('siga_session') || 'null');
    } catch (e) {
        session = null;
    }
    const staff = findStaffUserForSession(session);
    const name = localStorage.getItem('siga_profile_name') || (staff && staff.nome) || (session && session.nome) || 'Usuário';
    const role = localStorage.getItem('siga_profile_role') || (staff && (staff.cargo || staff.funcao)) || (session && session.role) || 'Administrador';
    const email = localStorage.getItem('siga_profile_email') || (staff && staff.email) || (session && session.email) || '';
    const phone = localStorage.getItem('siga_profile_phone') || (staff && staff.telefone) || '';
    const bio = localStorage.getItem('siga_profile_bio') || (staff && staff.bio) || '';
    // Foto única: perfil ↔ cadastro em Usuários
    let avatar = localStorage.getItem('siga_profile_avatar') || '';
    if (!avatar && staff && staff.avatar) {
        avatar = staff.avatar;
        try { localStorage.setItem('siga_profile_avatar', avatar); } catch (e) { /* ignore */ }
    }
    const twoFa = localStorage.getItem('siga_profile_2fa') !== 'false';
    return { name, role, email, phone, bio, avatar, twoFa, session, staff };
}

/** Comprime imagem/vídeo para JPEG leve (mesma política de Usuários) */
function compressProfileAvatar(source, onDone, onError) {
    const AVATAR_MAX_SIDE = 512;
    const AVATAR_JPEG_QUALITY = 0.72;
    const AVATAR_MAX_DATA_URL = 180000;

    function fail(msg) {
        if (typeof onError === 'function') onError(msg || 'Não foi possível processar a foto.');
        else showToast(msg || 'Não foi possível processar a foto.', 'error');
    }

    function drawAndEncode(imgW, imgH, drawFn) {
        const scale = Math.min(1, AVATAR_MAX_SIDE / Math.max(imgW, imgH));
        const w = Math.max(1, Math.round(imgW * scale));
        const h = Math.max(1, Math.round(imgH * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
            fail('Canvas indisponível neste navegador.');
            return;
        }
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, w, h);
        drawFn(ctx, w, h);

        let quality = AVATAR_JPEG_QUALITY;
        let dataUrl = canvas.toDataURL('image/jpeg', quality);
        while (dataUrl.length > AVATAR_MAX_DATA_URL && quality > 0.45) {
            quality -= 0.08;
            dataUrl = canvas.toDataURL('image/jpeg', quality);
        }
        if (dataUrl.length > AVATAR_MAX_DATA_URL) {
            fail('A foto ficou muito pesada mesmo após otimizar. Tente outra imagem.');
            return;
        }
        onDone(dataUrl);
    }

    if (!source) {
        fail('Nenhuma imagem selecionada.');
        return;
    }

    if (source instanceof HTMLVideoElement) {
        if (!source.videoWidth) {
            fail('Aguarde a câmera iniciar.');
            return;
        }
        drawAndEncode(source.videoWidth, source.videoHeight, (ctx, w, h) => {
            ctx.drawImage(source, 0, 0, w, h);
        });
        return;
    }

    let url = '';
    let revoke = false;
    if (typeof source === 'string') {
        url = source;
    } else if (source instanceof Blob) {
        url = URL.createObjectURL(source);
        revoke = true;
    } else {
        fail('Formato de imagem não suportado.');
        return;
    }

    const img = new Image();
    img.onload = () => {
        try {
            drawAndEncode(img.naturalWidth || img.width, img.naturalHeight || img.height, (ctx, w, h) => {
                ctx.drawImage(img, 0, 0, w, h);
            });
        } finally {
            if (revoke) URL.revokeObjectURL(url);
        }
    };
    img.onerror = () => {
        if (revoke) URL.revokeObjectURL(url);
        fail('Não foi possível ler a imagem.');
    };
    img.src = url;
}

function syncAvatarToStaffUsers(dataUrl) {
    let session = null;
    try {
        session = JSON.parse(localStorage.getItem('siga_session') || 'null');
    } catch (e) {
        session = null;
    }
    const email = String(
        (session && session.email) || localStorage.getItem('siga_profile_email') || ''
    ).toLowerCase();
    const id = session && session.id != null ? String(session.id) : '';
    try {
        const users = JSON.parse(localStorage.getItem('siga_users') || '[]') || [];
        if (!Array.isArray(users)) return;
        let changed = false;
        const next = users.map((u) => {
            const match =
                (id && String(u.id) === id) ||
                (email && String(u.email || '').toLowerCase() === email);
            if (!match) return u;
            changed = true;
            return Object.assign({}, u, { avatar: dataUrl || '' });
        });
        if (changed) localStorage.setItem('siga_users', JSON.stringify(next));
    } catch (e) { /* ignore */ }
}

function syncProfileFieldsToStaffUsers(fields) {
    let session = null;
    try {
        session = JSON.parse(localStorage.getItem('siga_session') || 'null');
    } catch (e) {
        session = null;
    }
    if (!session || session.tipo === 'aluno') return;
    const email = String(session.email || fields.email || '').toLowerCase();
    const id = session.id != null ? String(session.id) : '';
    try {
        const users = JSON.parse(localStorage.getItem('siga_users') || '[]') || [];
        if (!Array.isArray(users)) return;
        let changed = false;
        const next = users.map((u) => {
            const match =
                (id && String(u.id) === id) ||
                (email && String(u.email || '').toLowerCase() === email);
            if (!match) return u;
            changed = true;
            const patch = {};
            if (fields.name != null) patch.nome = fields.name;
            if (fields.phone != null) patch.telefone = fields.phone;
            if (fields.bio != null) patch.bio = fields.bio;
            if (fields.email != null) patch.email = fields.email;
            return Object.assign({}, u, patch);
        });
        if (changed) localStorage.setItem('siga_users', JSON.stringify(next));
    } catch (e) { /* ignore */ }
}

function profileInitials(name) {
    const parts = String(name || 'U').trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return 'U';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// Global Profile Sync — sidebar footer + remove header photo avatars
function syncProfile() {
    const profile = getProfileData();
    const initials = profileInitials(profile.name);

    // 1. Sidebar user block (end of menu)
    const sidebarRoot = document.querySelector('.sidebar-user-info');
    if (sidebarRoot) {
        const nameEl =
            sidebarRoot.querySelector('#sidebar-user-name') ||
            sidebarRoot.querySelector('p.font-semibold') ||
            sidebarRoot.querySelector('p.font-medium') ||
            sidebarRoot.querySelector('p.font-bold');
        if (nameEl) nameEl.textContent = profile.name;

        const roleEl =
            sidebarRoot.querySelector('#sidebar-user-role') ||
            sidebarRoot.querySelector('p.text-text-secondary');
        if (roleEl) roleEl.textContent = profile.role;

        const avatarHost =
            sidebarRoot.querySelector('.sidebar-user-avatar') ||
            sidebarRoot.querySelector('.w-10.h-10.rounded-full');
        if (avatarHost) {
            if (profile.avatar) {
                if (avatarHost.tagName === 'IMG') {
                    avatarHost.src = profile.avatar;
                    avatarHost.classList.add('sidebar-user-avatar', 'object-cover');
                } else {
                    const img = document.createElement('img');
                    img.src = profile.avatar;
                    img.alt = '';
                    img.className =
                        'w-10 h-10 rounded-full border-2 border-white shadow-sm flex-shrink-0 object-cover sidebar-user-avatar';
                    avatarHost.replaceWith(img);
                }
            } else if (avatarHost.tagName === 'IMG') {
                const div = document.createElement('div');
                div.className =
                    'w-10 h-10 rounded-full bg-primary-container text-white font-bold flex items-center justify-center flex-shrink-0 sidebar-user-avatar';
                div.setAttribute('aria-hidden', 'true');
                div.textContent = initials;
                avatarHost.replaceWith(div);
            } else {
                avatarHost.textContent = initials;
                avatarHost.classList.add('sidebar-user-avatar');
            }
        }

        // Ensure click opens Meu Perfil (if not already a link)
        const link = sidebarRoot.closest('a[href="meuperfil.html"]') ||
            sidebarRoot.querySelector('a[href="meuperfil.html"]') ||
            (sidebarRoot.tagName === 'A' ? sidebarRoot : null);
        if (!link) {
            const row =
                sidebarRoot.querySelector('a[href="meuperfil.html"]') ||
                sidebarRoot.querySelector('.flex.items-center.gap-3');
            if (row && row.tagName !== 'A') {
                row.style.cursor = 'pointer';
                row.setAttribute('title', 'Meu Perfil');
                row.addEventListener('click', (e) => {
                    if (e.target.closest('button')) return;
                    window.location.href = 'meuperfil.html';
                });
            } else if (sidebarRoot.tagName !== 'A') {
                sidebarRoot.style.cursor = 'pointer';
                sidebarRoot.setAttribute('title', 'Meu Perfil');
                sidebarRoot.addEventListener('click', (e) => {
                    if (e.target.closest('button, a')) return;
                    window.location.href = 'meuperfil.html';
                });
            }
        }
    }

    // 2. Remove photo / initials avatars from page headers (keep search + bell)
    document.querySelectorAll('header.siga-app-header img.rounded-full, header img#header-user-avatar').forEach((el) => el.remove());
    document.querySelectorAll('header.siga-app-header .w-8.h-8.rounded-full').forEach((el) => {
        if (el.tagName !== 'IMG' && !el.querySelector('span.material-symbols-outlined')) {
            // initials chip in header
            if (!el.closest('button')) el.remove();
        }
    });
}

// 2. Profile Page (meuperfil.html) — somente usuários/servidores
function initProfilePage() {
    let session = null;
    try {
        session = JSON.parse(localStorage.getItem('siga_session') || 'null');
    } catch (e) {
        session = null;
    }
    if (session && session.tipo === 'aluno') {
        window.location.replace('portal-aluno.html');
        return;
    }

    const profile = getProfileData();
    const nameInput = document.getElementById('profile-name');
    const emailInput = document.getElementById('profile-email');
    const phoneInput = document.getElementById('profile-phone');
    const roleInput = document.getElementById('profile-role');
    const bioEl = document.getElementById('profile-bio');
    const cardName = document.getElementById('profile-card-name');
    const cardEmail = document.getElementById('profile-card-email');
    const cardRole = document.getElementById('profile-card-role');
    const photoEl = document.getElementById('profile-photo');
    const photoInitials = document.getElementById('profile-photo-initials');
    const photoInput = document.getElementById('profile-photo-input');
    const twoFaInput = document.getElementById('profile-2fa');
    const saveBtn = document.getElementById('profile-save-btn');
    const discardBtn = document.getElementById('profile-discard-btn');
    const changePhotoBtn = document.getElementById('profile-change-photo-btn');
    const uploadPhotoBtn = document.getElementById('profile-photo-upload-btn');
    const cameraPhotoBtn = document.getElementById('profile-photo-camera-btn');
    const clearPhotoBtn = document.getElementById('profile-photo-clear-btn');
    const cameraBox = document.getElementById('profile-camera-box');
    const cameraVideo = document.getElementById('profile-camera-video');
    const cameraCapture = document.getElementById('profile-camera-capture');
    const cameraCancel = document.getElementById('profile-camera-cancel');
    const changePasswordBtn = document.getElementById('profile-change-password-btn');
    const passwordModal = document.getElementById('profile-password-modal');
    const passwordForm = document.getElementById('profile-password-form');
    const editBioBtn = document.getElementById('profile-edit-bio-btn');
    const sessionsList = document.getElementById('profile-sessions-list');
    const passwordHint = document.getElementById('profile-password-hint');

    let cameraStream = null;

    const defaultBio =
        'Especialista em Gestão Escolar com 15 anos de experiência. Focado em inovação pedagógica e implementação de tecnologias educacionais para otimização do aprendizado e engajamento da comunidade escolar.';

    function setPhotoPreview(avatar) {
        const initials = profileInitials(getProfileData().name);
        if (avatar) {
            if (photoEl) {
                photoEl.src = avatar;
                photoEl.classList.remove('hidden');
            }
            if (photoInitials) photoInitials.classList.add('hidden');
        } else {
            if (photoEl) {
                photoEl.removeAttribute('src');
                photoEl.classList.add('hidden');
            }
            if (photoInitials) {
                photoInitials.textContent = initials;
                photoInitials.classList.remove('hidden');
            }
        }
    }

    function applyAvatar(dataUrl, toastMsg) {
        if (dataUrl) localStorage.setItem('siga_profile_avatar', dataUrl);
        else localStorage.removeItem('siga_profile_avatar');
        syncAvatarToStaffUsers(dataUrl || '');
        setPhotoPreview(dataUrl || '');
        syncProfile();
        showToast(toastMsg || 'Foto atualizada!');
    }

    function stopCamera() {
        if (cameraStream) {
            cameraStream.getTracks().forEach((t) => t.stop());
            cameraStream = null;
        }
        if (cameraVideo) cameraVideo.srcObject = null;
        if (cameraBox) cameraBox.classList.add('hidden');
    }

    function startCamera() {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            showToast('Câmera não disponível neste navegador.', 'error');
            return;
        }
        stopCamera();
        navigator.mediaDevices.getUserMedia({
            video: { facingMode: 'user', width: { ideal: 720 }, height: { ideal: 720 } },
            audio: false
        }).then((stream) => {
            cameraStream = stream;
            if (cameraVideo) cameraVideo.srcObject = stream;
            if (cameraBox) cameraBox.classList.remove('hidden');
        }).catch(() => {
            showToast('Não foi possível acessar a câmera.', 'error');
        });
    }

    function passwordAgeHint() {
        const iso = localStorage.getItem('siga_profile_password_updated_at');
        if (!iso) {
            return 'Defina ou altere sua senha de acesso ao sistema.';
        }
        const then = new Date(iso);
        if (Number.isNaN(then.getTime())) {
            return 'Sua senha foi alterada recentemente.';
        }
        const days = Math.max(0, Math.floor((Date.now() - then.getTime()) / 86400000));
        if (days === 0) return 'Sua senha foi alterada hoje.';
        if (days === 1) return 'Sua senha foi alterada pela última vez há 1 dia.';
        return `Sua senha foi alterada pela última vez há ${days} dias.`;
    }

    function detectDeviceLabel() {
        const ua = navigator.userAgent || '';
        let device = 'Computador';
        if (/iPhone/i.test(ua)) device = 'iPhone';
        else if (/iPad/i.test(ua)) device = 'iPad';
        else if (/Android/i.test(ua)) device = 'Android';
        else if (/Windows/i.test(ua)) device = 'Windows PC';
        else if (/Mac OS|Macintosh/i.test(ua)) device = 'Mac';
        let browser = 'Navegador';
        if (/Edg\//i.test(ua)) browser = 'Edge';
        else if (/Chrome\//i.test(ua) && !/Edg\//i.test(ua)) browser = 'Chrome';
        else if (/Firefox\//i.test(ua)) browser = 'Firefox';
        else if (/Safari\//i.test(ua) && !/Chrome\//i.test(ua)) browser = 'Safari';
        return { device, browser };
    }

    function upsertCurrentSession() {
        const { device, browser } = detectDeviceLabel();
        const current = {
            id: 'current',
            device,
            browser,
            label: device,
            meta: `${browser} • Logado agora`,
            current: true,
            at: new Date().toISOString()
        };
        try {
            localStorage.setItem('siga_profile_session_current', JSON.stringify(current));
        } catch (e) { /* ignore */ }
        return current;
    }

    function renderSessions() {
        if (!sessionsList) return;
        const current = upsertCurrentSession();
        let extras = [];
        try {
            extras = JSON.parse(localStorage.getItem('siga_profile_sessions_extra') || '[]') || [];
        } catch (e) {
            extras = [];
        }
        if (!Array.isArray(extras)) extras = [];

        const rows = [current].concat(extras.filter((s) => s && !s.current));
        sessionsList.innerHTML = rows.map((s) => {
            const icon = /iPhone|Android|iPad|smartphone/i.test(String(s.device || s.label || ''))
                ? 'smartphone'
                : 'laptop';
            const action = s.current
                ? '<span class="text-primary text-[11px] font-bold">ESTA SESSÃO</span>'
                : `<button type="button" class="text-error text-[11px] font-bold hover:underline" data-end-session="${String(s.id)}">Encerrar</button>`;
            return (
                `<div class="flex items-center justify-between text-body-md">` +
                `<div class="flex items-center gap-3">` +
                `<span class="material-symbols-outlined text-text-secondary">${icon}</span>` +
                `<div>` +
                `<p class="font-medium">${escapeHtml(s.label || s.device || 'Dispositivo')}</p>` +
                `<p class="text-[11px] text-text-secondary">${escapeHtml(s.meta || '')}</p>` +
                `</div></div>${action}</div>`
            );
        }).join('');

        sessionsList.querySelectorAll('[data-end-session]').forEach((btn) => {
            btn.addEventListener('click', () => {
                const sid = btn.getAttribute('data-end-session');
                try {
                    const list = JSON.parse(localStorage.getItem('siga_profile_sessions_extra') || '[]') || [];
                    localStorage.setItem(
                        'siga_profile_sessions_extra',
                        JSON.stringify(list.filter((s) => String(s.id) !== String(sid)))
                    );
                } catch (e) { /* ignore */ }
                renderSessions();
                showToast('Sessão remota encerrada.', 'error');
            });
        });
    }

    function escapeHtml(str) {
        return String(str || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function openPasswordModal() {
        if (!passwordModal) return;
        passwordModal.classList.remove('hidden');
        const cur = document.getElementById('pwd-current');
        if (cur) cur.focus();
    }

    function closePasswordModal() {
        if (!passwordModal) return;
        passwordModal.classList.add('hidden');
        if (passwordForm) passwordForm.reset();
    }

    function fillForm() {
        const p = getProfileData();
        if (nameInput) nameInput.value = p.name === 'Usuário' ? '' : p.name;
        if (emailInput) emailInput.value = p.email;
        if (phoneInput) phoneInput.value = p.phone;
        if (roleInput) roleInput.value = p.role;
        if (cardName) cardName.textContent = p.name || 'Usuário';
        if (cardEmail) cardEmail.textContent = p.email || 'Conta do sistema';
        if (cardRole) cardRole.textContent = p.role;
        if (bioEl) bioEl.textContent = p.bio || defaultBio;
        if (twoFaInput) twoFaInput.checked = p.twoFa;
        setPhotoPreview(p.avatar);
        if (passwordHint) passwordHint.textContent = passwordAgeHint();
    }

    fillForm();
    renderSessions();
    syncProfile();

    if (saveBtn) {
        saveBtn.addEventListener('click', () => {
            const name = (nameInput && nameInput.value.trim()) || 'Usuário';
            const email = (emailInput && emailInput.value.trim()) || '';
            const phone = (phoneInput && phoneInput.value.trim()) || '';
            const role = (roleInput && roleInput.value.trim()) || getProfileData().role;
            const bio = (bioEl && bioEl.textContent.trim()) || '';

            localStorage.setItem('siga_profile_name', name);
            localStorage.setItem('siga_profile_email', email);
            localStorage.setItem('siga_profile_phone', phone);
            localStorage.setItem('siga_profile_role', role);
            if (twoFaInput) {
                localStorage.setItem('siga_profile_2fa', twoFaInput.checked ? 'true' : 'false');
            }

            try {
                const sess = JSON.parse(localStorage.getItem('siga_session') || 'null') || {};
                sess.nome = name;
                sess.email = email;
                sess.role = role;
                localStorage.setItem('siga_session', JSON.stringify(sess));
            } catch (e) { /* ignore */ }

            syncProfileFieldsToStaffUsers({ name, email, phone, bio });

            if (cardName) cardName.textContent = name;
            if (cardEmail) cardEmail.textContent = email || 'Conta do sistema';
            if (cardRole) cardRole.textContent = role;
            setPhotoPreview(getProfileData().avatar);
            syncProfile();
            showToast('Perfil atualizado com sucesso!');
        });
    }

    if (discardBtn) {
        discardBtn.addEventListener('click', () => {
            fillForm();
            showToast('Alterações descartadas.', 'error');
        });
    }

    function openPhotoPicker() {
        if (photoInput) photoInput.click();
    }
    if (changePhotoBtn) changePhotoBtn.addEventListener('click', openPhotoPicker);
    if (uploadPhotoBtn) uploadPhotoBtn.addEventListener('click', openPhotoPicker);
    if (cameraPhotoBtn) cameraPhotoBtn.addEventListener('click', startCamera);
    if (cameraCancel) cameraCancel.addEventListener('click', stopCamera);
    if (cameraCapture) {
        cameraCapture.addEventListener('click', () => {
            if (!cameraVideo || !cameraVideo.videoWidth) {
                showToast('Aguarde a câmera iniciar.', 'error');
                return;
            }
            compressProfileAvatar(cameraVideo, (dataUrl) => {
                applyAvatar(dataUrl, 'Foto capturada e sincronizada com Usuários!');
                stopCamera();
            });
        });
    }
    if (clearPhotoBtn) {
        clearPhotoBtn.addEventListener('click', () => {
            stopCamera();
            applyAvatar('', 'Foto removida.');
            if (photoInput) photoInput.value = '';
        });
    }
    if (photoInput) {
        photoInput.addEventListener('change', () => {
            const file = photoInput.files && photoInput.files[0];
            if (!file) return;
            if (!/^image\/(jpeg|png|jpg|webp)$/i.test(file.type)) {
                showToast('Use JPG, PNG ou WEBP.', 'error');
                return;
            }
            if (file.size > 8 * 1024 * 1024) {
                showToast('Arquivo original muito grande (máx. 8MB).', 'error');
                return;
            }
            compressProfileAvatar(file, (dataUrl) => {
                applyAvatar(dataUrl, 'Foto otimizada e sincronizada com Usuários!');
                stopCamera();
            });
            photoInput.value = '';
        });
    }

    if (changePasswordBtn) {
        changePasswordBtn.addEventListener('click', openPasswordModal);
    }
    if (passwordModal) {
        passwordModal.querySelectorAll('[data-pwd-close]').forEach((el) => {
            el.addEventListener('click', closePasswordModal);
        });
    }
    if (passwordForm) {
        passwordForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const sec = window.SigaSecurity;
            if (!sec) {
                showToast('Módulo de segurança indisponível.', 'error');
                return;
            }
            const current = (document.getElementById('pwd-current') || {}).value || '';
            const next = (document.getElementById('pwd-next') || {}).value || '';
            const confirmNext = (document.getElementById('pwd-confirm') || {}).value || '';
            if (next.length < 6) {
                showToast('A nova senha deve ter pelo menos 6 caracteres.', 'error');
                return;
            }
            if (next !== confirmNext) {
                showToast('As senhas não coincidem.', 'error');
                return;
            }
            const sess = sec.getSession() || session || {};
            Promise.resolve().then(async () => {
                let users = [];
                try { users = JSON.parse(localStorage.getItem('siga_users') || '[]') || []; } catch (err) { users = []; }
                const idx = users.findIndex((u) =>
                    String(u.id) === String(sess.id) ||
                    String(u.email || '').toLowerCase() === String(sess.email || '').toLowerCase()
                );
                if (idx < 0) {
                    showToast('Usuário da sessão não encontrado em Usuários.', 'error');
                    return;
                }
                const ok = await sec.verifyPassword(current, users[idx].senha || '');
                if (!ok) {
                    showToast('Senha atual incorreta.', 'error');
                    return;
                }
                users[idx].senha = await sec.hashPassword(next);
                users[idx].precisaDefinirSenha = false;
                localStorage.setItem('siga_users', JSON.stringify(users));
                localStorage.setItem('siga_profile_password_updated_at', new Date().toISOString());
                if (passwordHint) passwordHint.textContent = passwordAgeHint();
                closePasswordModal();
                showToast('Senha atualizada com sucesso!');
            });
        });
    }

    if (editBioBtn && bioEl) {
        editBioBtn.addEventListener('click', () => {
            const current = bioEl.textContent.trim();
            const next = prompt('Editar resumo profissional:', current);
            if (next === null) return;
            const trimmed = next.trim();
            localStorage.setItem('siga_profile_bio', trimmed);
            bioEl.textContent = trimmed || defaultBio;
            syncProfileFieldsToStaffUsers({ bio: trimmed });
            showToast('Resumo profissional atualizado!');
        });
    }

    if (twoFaInput) {
        twoFaInput.addEventListener('change', () => {
            localStorage.setItem('siga_profile_2fa', twoFaInput.checked ? 'true' : 'false');
            showToast(twoFaInput.checked ? '2FA ativado.' : '2FA desativado.');
        });
    }

    window.addEventListener('beforeunload', stopCamera);
}

// 3. School Page (escola.html) — lê/grava em public.schools (Supabase) com cache local
function initSchoolPage() {
    const inputs = Array.from(document.querySelectorAll('input'));
    const dbKeys = [
        'siga_school_name', 'siga_school_inep', 'siga_school_cnpj',
        'siga_school_address', 'siga_school_cep', 'siga_school_bairro',
        'siga_school_city_state', 'siga_school_email', 'siga_school_phone'
    ];
    const defaults = ['', '', '', '', '', '', '', '', ''];

    function fillFromLocal() {
        inputs.forEach((inp, idx) => {
            if (idx > 0 && idx <= 9) {
                const dbIdx = idx - 1;
                inp.value = localStorage.getItem(dbKeys[dbIdx]) || defaults[dbIdx];
            }
        });
    }

    function applySchoolRow(row) {
        if (!row) return;
        const map = {
            siga_school_name: row.nome || '',
            siga_school_inep: row.inep || '',
            siga_school_cnpj: row.cnpj || '',
            siga_school_address: row.endereco || '',
            siga_school_cep: row.cep || '',
            siga_school_bairro: row.bairro || '',
            siga_school_city_state: (row.municipio && row.uf) ? (row.municipio + '/' + row.uf) : (row.municipio || row.uf || ''),
            siga_school_email: row.email || '',
            siga_school_phone: row.telefone || ''
        };
        Object.keys(map).forEach((k) => localStorage.setItem(k, map[k]));
        fillFromLocal();
    }

    fillFromLocal();

    const schoolId = localStorage.getItem('siga_active_school');
    const cloud = window.SigaSupabase && window.SigaSupabase.isConfigured && window.SigaSupabase.isConfigured()
        ? window.SigaSupabase.getClient()
        : null;

    if (cloud && schoolId) {
        cloud.from('schools').select('*').eq('id', schoolId).maybeSingle().then((res) => {
            if (res.error) {
                console.warn('[SIGA] escola fetch:', res.error.message);
                return;
            }
            if (res.data) applySchoolRow(res.data);
        });
    }

    const buttons = Array.from(document.querySelectorAll('button'));
    const saveBtn = buttons.find(b => b.textContent.includes('Salvar Alterações'));
    const discardBtn = buttons.find(b => b.textContent.includes('Descartar'));

    if (saveBtn) {
        saveBtn.addEventListener('click', () => {
            const values = {};
            inputs.forEach((inp, idx) => {
                if (idx > 0 && idx <= 9) {
                    const dbIdx = idx - 1;
                    values[dbKeys[dbIdx]] = inp.value;
                    localStorage.setItem(dbKeys[dbIdx], inp.value);
                }
            });

            if (!cloud || !schoolId) {
                showToast('Informações salvas localmente (sem sessão Supabase da escola).');
                return;
            }

            const cityState = String(values.siga_school_city_state || '');
            let municipio = cityState;
            let uf = '';
            if (cityState.indexOf('/') !== -1) {
                const parts = cityState.split('/');
                municipio = parts[0].trim();
                uf = (parts[1] || '').trim().slice(0, 2).toUpperCase();
            }

            const payload = {
                nome: values.siga_school_name || '',
                inep: String(values.siga_school_inep || '').replace(/\D/g, ''),
                cnpj: values.siga_school_cnpj || null,
                endereco: values.siga_school_address || null,
                cep: values.siga_school_cep || null,
                bairro: values.siga_school_bairro || null,
                municipio: municipio || null,
                uf: uf || null,
                email: values.siga_school_email || null,
                telefone: values.siga_school_phone || null
            };

            cloud.from('schools').update(payload).eq('id', schoolId).select('*').single().then((res) => {
                if (res.error) {
                    console.warn(res.error);
                    showToast('Falha ao salvar no Supabase: ' + res.error.message, 'error');
                    return;
                }
                applySchoolRow(res.data);
                showToast('Informações da escola salvas no Supabase!');
            });
        });
    }

    if (discardBtn) {
        discardBtn.addEventListener('click', () => {
            fillFromLocal();
            showToast('Alterações descartadas.', 'error');
        });
    }
}

// 4. Agenda Page (agenda.html)
function initAgendaPage() {
    // A página agenda.html usa js/agenda.js (calendário 2026, turmas por turno, editar/excluir).
    if (document.getElementById('form-agenda-atividade') || typeof window.initAgendaPageNew === 'function') {
        return;
    }

    let customEvents = JSON.parse(localStorage.getItem('siga_agenda_events')) || [];
    
    function getTypeStyle(type) {
        switch(type) {
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
    
    function renderCustomEvents() {
        document.querySelectorAll('.siga-custom-event-element').forEach(el => el.remove());
        
        customEvents.forEach(evt => {
            if (!evt.date) return;
            const dateParts = evt.date.split('-');
            if (dateParts.length !== 3) return;
            const day = parseInt(dateParts[2], 10);
            const month = parseInt(dateParts[1], 10);
            
            // November 2024 is Month 11
            if (month === 11) {
                const cells = Array.from(document.querySelectorAll('.calendar-grid > div'));
                const cell = cells.find(c => {
                    const span = c.querySelector('span.font-bold') || c.querySelector('span.text-label-md') || c;
                    return span && span.textContent.trim() === day.toString();
                });
                
                if (cell) {
                    const styles = getTypeStyle(evt.type);
                    const eventDiv = document.createElement('div');
                    eventDiv.className = `siga-custom-event-element mt-1 p-1.5 ${styles.bg} ${styles.text} rounded text-[10px] font-bold border-l-2 ${styles.border} truncate`;
                    eventDiv.title = evt.title + (evt.desc ? ': ' + evt.desc : '');
                    eventDiv.textContent = evt.title;
                    
                    let container = cell.querySelector('.space-y-1') || cell.querySelector('.mt-2');
                    if (!container) {
                        container = document.createElement('div');
                        container.className = 'mt-2 space-y-1';
                        cell.appendChild(container);
                    }
                    container.appendChild(eventDiv);
                }
            }
        });
        
        const upcomingContainer = document.querySelector('.col-span-12.xl\\:col-span-4 .space-y-4');
        if (upcomingContainer) {
            customEvents.forEach(evt => {
                const dateParts = evt.date.split('-');
                const day = dateParts[2];
                const months = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ'];
                const monthLabel = months[parseInt(dateParts[1], 10) - 1] || 'NOV';
                
                const html = `
                    <div class="siga-custom-event-element flex gap-4 group cursor-pointer p-2 -mx-2 hover:bg-surface-container-low rounded-xl transition-all">
                        <div class="flex flex-col items-center justify-center min-w-[56px] h-[56px] bg-surface-container-low rounded-lg border border-border-subtle group-hover:bg-primary-light/20 transition-colors">
                            <span class="text-label-sm font-bold text-text-secondary">${monthLabel}</span>
                            <span class="text-headline-sm font-bold text-primary">${day}</span>
                         </div>
                         <div class="flex-1">
                             <p class="text-body-md font-bold text-on-surface group-hover:text-primary transition-colors">${evt.title}</p>
                             <p class="text-label-sm text-text-secondary flex items-center gap-1">
                                 <span class="material-symbols-outlined text-[14px]">event_note</span> ${evt.type}
                             </p>
                         </div>
                    </div>
                `;
                const tempDiv = document.createElement('div');
                tempDiv.innerHTML = html.trim();
                upcomingContainer.insertBefore(tempDiv.firstChild, upcomingContainer.firstChild);
            });
        }
    }
    
    renderCustomEvents();
    
    const form = document.querySelector('#modal-new-activity form');
    if (form) {
        form.addEventListener('submit', (e) => {
            e.preventDefault();
            
            const titleInput = form.querySelector('input[placeholder*="História"]');
            const typeSelect = form.querySelector('select');
            const dateInput = form.querySelector('input[type="date"]');
            const descTextarea = form.querySelector('textarea');
            
            if (!titleInput || !dateInput || !titleInput.value || !dateInput.value) {
                showToast('Por favor, preencha o título e a data!', 'error');
                return;
            }
            
            const newEvent = {
                title: titleInput.value,
                type: typeSelect ? typeSelect.value : 'Provas & Testes',
                date: dateInput.value,
                desc: descTextarea ? descTextarea.value : ''
            };
            
            customEvents.push(newEvent);
            localStorage.setItem('siga_agenda_events', JSON.stringify(customEvents));
            
            form.reset();
            document.getElementById('modal-new-activity').classList.add('hidden');
            
            renderCustomEvents();
            showToast('Evento agendado!');
        });
    }
}

// 5. Occurrences Page (ocorrencias.html)
function initOccurrencesPage() {
    // A página ocorrencias.html possui UI própria (modal com turmas/alunos do sistema).
    if (document.getElementById('modal-ocorrencia') || document.getElementById('form-ocorrencia')) {
        return;
    }

    const navOcorrenciaBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Nova Ocorrência'));
    const floatingBtn = document.querySelector('button.fixed.bottom-8.right-8');
    
    if (navOcorrenciaBtn) {
        navOcorrenciaBtn.addEventListener('click', openNewOccurrenceModal);
    }
    if (floatingBtn) {
        floatingBtn.addEventListener('click', openNewOccurrenceModal);
    }
    
    renderOccurrences();
}

function openNewOccurrenceModal() {
    let modal = document.getElementById('siga-modal-occurrence');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'siga-modal-occurrence';
        modal.className = 'fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-on-background/40 backdrop-blur-sm';
        modal.innerHTML = `
            <div class="bg-background-surface w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200 border border-border-subtle" style="font-family: 'Inter', sans-serif;">
                <div class="p-6 border-b border-border-subtle flex justify-between items-center bg-surface-container-low/30">
                    <div class="flex items-center gap-3">
                        <div class="w-10 h-10 bg-error/10 text-error rounded-full flex items-center justify-center">
                            <span class="material-symbols-outlined">report_problem</span>
                        </div>
                        <h3 class="font-headline-sm text-headline-sm text-on-surface font-semibold">Registrar Nova Ocorrência</h3>
                    </div>
                    <button class="p-2 hover:bg-surface-container-low rounded-full transition-colors text-text-secondary" onclick="document.getElementById('siga-modal-occurrence').remove()">
                        <span class="material-symbols-outlined">close</span>
                    </button>
                </div>
                <form class="p-6 space-y-4">
                    <div>
                        <label class="block text-label-md font-bold text-on-surface mb-1">Nome do Aluno</label>
                        <input type="text" id="occ-student" class="w-full border border-border-subtle rounded-lg px-4 py-2 text-body-md focus:border-primary focus:ring-2 focus:ring-primary/10 outline-none transition-all" placeholder="Ex: Lucas Oliveira" required>
                    </div>
                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                            <label class="block text-label-md font-bold text-on-surface mb-1">Tipo</label>
                            <select id="occ-type" class="w-full border border-border-subtle rounded-lg px-4 py-2 text-body-md focus:border-primary focus:ring-2 focus:ring-primary/10 outline-none transition-all">
                                <option>Indisciplina</option>
                                <option>Atraso</option>
                                <option>Elogio</option>
                            </select>
                        </div>
                        <div>
                            <label class="block text-label-md font-bold text-on-surface mb-1">Status</label>
                            <select id="occ-status" class="w-full border border-border-subtle rounded-lg px-4 py-2 text-body-md focus:border-primary focus:ring-2 focus:ring-primary/10 outline-none transition-all">
                                <option>Em Análise</option>
                                <option>Resolvida</option>
                            </select>
                        </div>
                    </div>
                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                            <label class="block text-label-md font-bold text-on-surface mb-1">Data</label>
                            <input type="date" id="occ-date" class="w-full border border-border-subtle rounded-lg px-4 py-2 text-body-md focus:border-primary focus:ring-2 focus:ring-primary/10 outline-none transition-all" required>
                        </div>
                        <div>
                            <label class="block text-label-md font-bold text-on-surface mb-1">Responsável</label>
                            <input type="text" id="occ-prof" class="w-full border border-border-subtle rounded-lg px-4 py-2 text-body-md focus:border-primary focus:ring-2 focus:ring-primary/10 outline-none transition-all" value="Prof. Marcos" required>
                        </div>
                    </div>
                    <div class="flex items-center justify-end gap-3 pt-4 border-t border-border-subtle">
                        <button type="button" class="px-5 py-2.5 text-label-md font-bold text-text-secondary hover:bg-surface-container-low rounded-lg transition-colors" onclick="document.getElementById('siga-modal-occurrence').remove()">Cancelar</button>
                        <button type="submit" class="px-6 py-2.5 bg-primary text-white rounded-lg font-bold shadow-lg shadow-primary/20 hover:brightness-90 transition-all active:scale-95">Gravar Ocorrência</button>
                    </div>
                </form>
            </div>
        `;
        document.body.appendChild(modal);
        
        document.getElementById('occ-date').value = new Date().toISOString().split('T')[0];
        
        modal.querySelector('form').addEventListener('submit', (e) => {
            e.preventDefault();
            const student = document.getElementById('occ-student').value;
            const type = document.getElementById('occ-type').value;
            const status = document.getElementById('occ-status').value;
            const date = document.getElementById('occ-date').value;
            const prof = document.getElementById('occ-prof').value;
            
            let occurrences = JSON.parse(localStorage.getItem('siga_occurrences')) || [];
            occurrences.unshift({ student, type, date, prof, status });
            localStorage.setItem('siga_occurrences', JSON.stringify(occurrences));
            
            modal.remove();
            renderOccurrences();
            showToast('Ocorrência gravada com sucesso!');
        });
    }
}

function renderOccurrences() {
    const tbody = document.getElementById('occurrences-tbody');
    if (!tbody) return;
    
    let occurrences = JSON.parse(localStorage.getItem('siga_occurrences'));
    if (!occurrences) {
        occurrences = [];
        localStorage.setItem('siga_occurrences', JSON.stringify(occurrences));
    }
    
    let html = '';
    occurrences.forEach(occ => {
        let typeStyle = "bg-error/10 text-error";
        if (occ.type === "Atraso") typeStyle = "bg-tertiary/10 text-tertiary";
        if (occ.type === "Elogio") typeStyle = "bg-primary/10 text-primary";
        
        let statusStyle = "bg-surface-container-highest text-on-surface";
        if (occ.status === "Resolvida") statusStyle = "bg-primary-light/20 text-on-primary-container";
        
        let displayDate = occ.date;
        if (occ.date.includes('-')) {
            const parts = occ.date.split('-');
            displayDate = `${parts[2]}/${parts[1]}/${parts[0]}`;
        }
        
        html += `
            <tr class="hover:bg-background-page transition-colors">
                <td class="px-6 py-4">
                    <div class="flex items-center gap-3">
                        <div class="w-8 h-8 rounded-full bg-surface-container flex items-center justify-center font-bold text-primary text-xs">
                            ${occ.student.split(' ').map(n => n[0]).join('')}
                        </div>
                        <div>
                            <p class="font-body-md font-semibold text-on-surface">${occ.student}</p>
                            <p class="text-[11px] text-text-secondary">Turma 9º A - Manhã</p>
                        </div>
                    </div>
                </td>
                <td class="px-6 py-4">
                    <span class="px-3 py-1 rounded-full text-[11px] font-bold uppercase ${typeStyle}">
                        ${occ.type}
                    </span>
                </td>
                <td class="px-6 py-4">
                    <p class="font-body-md text-on-surface">${displayDate}</p>
                    <p class="text-[11px] text-text-secondary">08:45 AM</p>
                </td>
                <td class="px-6 py-4">
                    <p class="font-body-md text-on-surface">${occ.prof}</p>
                    <p class="text-[11px] text-text-secondary">Matemática</p>
                </td>
                <td class="px-6 py-4">
                    <div class="flex justify-center">
                        <span class="px-3 py-1 rounded-full text-[11px] font-bold ${statusStyle}">
                            ${occ.status}
                        </span>
                    </div>
                </td>
                <td class="px-6 py-4 text-right">
                    <button class="p-2 text-text-secondary hover:text-primary transition-colors" onclick="showToast('Visualizando detalhes de ${occ.student}')">
                        <span class="material-symbols-outlined">visibility</span>
                    </button>
                    <button class="p-2 text-text-secondary hover:text-primary transition-colors">
                        <span class="material-symbols-outlined">more_vert</span>
                    </button>
                </td>
            </tr>
        `;
    });
    tbody.innerHTML = html;
}

// 6. Permissions Page — lógica em js/permissoes.js

// 7. Alunos Page (alunos.html)
let alunosPageState = {
    page: 1,
    pageSize: 10,
    search: '',
    turma: '',
    serie: '',
    status: ''
};

function initAlunosPage() {
    const navAlunosBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Novo Aluno'));
    if (navAlunosBtn) {
        navAlunosBtn.addEventListener('click', openNewStudentModal);
    }

    const searchInput = document.getElementById('alunos-search') ||
        document.querySelector('header input[type="text"]') ||
        document.querySelector('input[placeholder*="Buscar"]');
    if (searchInput && !searchInput.dataset.boundAlunos) {
        searchInput.addEventListener('input', (e) => {
            alunosPageState.search = e.target.value || '';
            alunosPageState.page = 1;
            renderAlunos();
        });
        searchInput.dataset.boundAlunos = '1';
    }

    ['alunos-filter-turma', 'alunos-filter-serie', 'alunos-filter-status'].forEach((id) => {
        const el = document.getElementById(id);
        if (!el || el.dataset.boundAlunos) return;
        el.addEventListener('change', () => {
            if (id.endsWith('turma')) alunosPageState.turma = el.value || '';
            if (id.endsWith('serie')) alunosPageState.serie = el.value || '';
            if (id.endsWith('status')) alunosPageState.status = el.value || '';
            alunosPageState.page = 1;
            renderAlunos();
        });
        el.dataset.boundAlunos = '1';
    });

    const importInput = document.getElementById('import-alunos-csv');
    if (importInput && !importInput.dataset.boundAlunos) {
        importInput.addEventListener('change', (e) => {
            const file = e.target.files && e.target.files[0];
            if (file) importAlunosFromFile(file);
            e.target.value = '';
        });
        importInput.dataset.boundAlunos = '1';
    }

    migrateStudentsSchema();
    refreshAlunosFilterOptions();
    renderAlunos();

    if (window.SigaSchoolData && typeof window.SigaSchoolData.hydrateStudents === 'function') {
        window.SigaSchoolData.hydrateStudents().then((res) => {
            if (res && res.ok && !res.skipped) {
                migrateStudentsSchema();
                refreshAlunosFilterOptions();
                renderAlunos();
            } else if (res && !res.ok) {
                console.warn('[SIGA] alunos hydrate:', res.message);
            }
        });
    }
}

function migrateStudentsSchema() {
    try {
        const students = JSON.parse(localStorage.getItem('siga_students') || '[]') || [];
        if (!students.length) return;
        const classes = (typeof getClasses === 'function' ? getClasses() : JSON.parse(localStorage.getItem('siga_classes') || '[]')) || [];
        let changed = false;
        students.forEach((s) => {
            if (s.codigoInep == null) { s.codigoInep = ''; changed = true; }
            if (s.senha == null) { s.senha = ''; changed = true; }
            if (!Array.isArray(s.aeeTurmas)) { s.aeeTurmas = []; changed = true; }
            // Se a turma principal for AEE, move para aeeTurmas
            if (s.turma && isAeeClassCode(s.turma)) {
                const code = String(s.turma).toUpperCase();
                if (s.aeeTurmas.indexOf(code) < 0) s.aeeTurmas.push(code);
                s.turma = '';
                changed = true;
            }
            if (!s.serie) {
                const cls = classes.find(c => c.code === s.turma);
                if (cls && cls.serie) { s.serie = cls.serie; changed = true; }
            }
        });
        if (changed) localStorage.setItem('siga_students', JSON.stringify(students));
    } catch (e) { /* ignore */ }
}

function downloadModeloAlunosCsv() {
    const header = 'codigoInep;cpf;aluno;serie;turma;dataNascimento;idade;emailInstitucional;senha;responsavel;contato';
    // Exemplo fictício — senha deve ser definida na importação (nunca use senhas reais no modelo)
    const example = '000000000000;000.000.000-00;Nome Exemplo;3o ano do ensino médio;3001;2011-01-01;15;exemplo.aluno@aluno.seduc.pa.gov.br;DEFINIR_SENHA;Responsavel Exemplo;(00) 00000-0000';
    const blob = new Blob(['\uFEFF' + header + '\n' + example + '\n'], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'modelo-alunos-siga.csv';
    a.click();
    URL.revokeObjectURL(a.href);
    showToast('Modelo de planilha baixado.');
}

function parseCsvLine(line, sep) {
    const out = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') {
            if (inQuotes && line[i + 1] === '"') { cur += '"'; i++; }
            else inQuotes = !inQuotes;
        } else if (ch === sep && !inQuotes) {
            out.push(cur.trim());
            cur = '';
        } else {
            cur += ch;
        }
    }
    out.push(cur.trim());
    return out;
}

function normalizeCsvHeader(h) {
    return String(h || '')
        .replace(/^\uFEFF/, '')
        .toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]/g, '');
}

/** Expande notação científica BR (1,24917E+11) ou EN (1.24917E+11) para dígitos. */
function expandScientificNumber(raw) {
    const s = String(raw || '').trim();
    if (!s) return '';
    if (/^\d+$/.test(s)) return s;
    const m = s.match(/^([0-9]+)([.,]([0-9]+))?E([+-]?\d+)$/i);
    if (!m) return s.replace(/\D/g, '') || s;
    const intPart = m[1];
    const frac = m[3] || '';
    const exp = parseInt(m[4], 10);
    const digits = intPart + frac;
    const point = intPart.length;
    const newPoint = point + exp;
    if (newPoint <= 0) return '0';
    if (newPoint >= digits.length) return digits + '0'.repeat(newPoint - digits.length);
    return digits;
}

function normalizeInepValue(raw) {
    const expanded = expandScientificNumber(raw);
    const digits = String(expanded || '').replace(/\D/g, '');
    return digits || String(raw || '').trim();
}

function normalizeCpfValue(raw) {
    return String(raw || '').trim();
}

function loadSheetJsLib() {
    return new Promise((resolve, reject) => {
        if (window.XLSX) return resolve(window.XLSX);
        const existing = document.querySelector('script[data-siga-xlsx]');
        if (existing) {
            existing.addEventListener('load', () => resolve(window.XLSX));
            existing.addEventListener('error', reject);
            return;
        }
        const s = document.createElement('script');
        s.src = 'https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js';
        s.dataset.sigaXlsx = '1';
        s.onload = () => resolve(window.XLSX);
        s.onerror = () => reject(new Error('Falha ao carregar leitor de Excel.'));
        document.head.appendChild(s);
    });
}

async function readAlunosSpreadsheetRows(file) {
    const name = (file.name || '').toLowerCase();
    if (name.endsWith('.xlsx') || name.endsWith('.xls')) {
        const XLSX = await loadSheetJsLib();
        const buf = await file.arrayBuffer();
        const wb = XLSX.read(buf, { type: 'array', cellDates: false, raw: false });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: false });
        return rows.map(r => (Array.isArray(r) ? r.map(c => String(c == null ? '' : c).trim()) : []));
    }

    const text = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(new Error('Falha ao ler o arquivo.'));
        reader.readAsText(file, 'UTF-8');
    });
    const lines = text.split(/\r?\n/).filter(l => l.trim());
    if (!lines.length) return [];
    const sep = lines[0].includes(';') ? ';' : ',';
    return lines.map(line => parseCsvLine(line, sep));
}

async function importAlunosFromFile(file) {
    try {
        const rows = await readAlunosSpreadsheetRows(file);
        if (!rows.length || rows.length < 2) {
            showToast('Planilha vazia ou sem dados.', 'error');
            return;
        }

        const headers = rows[0].map(normalizeCsvHeader);
        const idx = (aliases) => {
            for (const a of aliases) {
                const i = headers.indexOf(a);
                if (i !== -1) return i;
            }
            return -1;
        };

        const map = {
            codigoInep: idx(['codigoinep', 'codigonep', 'inep']),
            cpf: idx(['cpf']),
            nome: idx(['aluno', 'nome', 'nomecompleto']),
            serie: idx(['serie']),
            turma: idx(['turma', 'codigoturma']),
            dataNascimento: idx(['datanascimento', 'nascimento', 'datadenascimento']),
            idade: idx(['idade']),
            email: idx(['emailinstitucional', 'email', 'emaileducacional']),
            senha: idx(['senha', 'password']),
            responsavel: idx(['responsavel']),
            contato: idx(['contato', 'telefone', 'celular'])
        };

        if (map.nome < 0) {
            showToast('A planilha precisa da coluna Aluno (nome).', 'error');
            return;
        }

        const existingCount = (JSON.parse(localStorage.getItem('siga_students') || '[]') || []).length;
        let replace = true;
        if (existingCount > 0) {
            replace = confirm(
                `Há ${existingCount} aluno(s) cadastrado(s).\n\n` +
                'OK = substituir todos pelos da planilha (recomendado para importação completa)\n' +
                'Cancelar = mesclar / atualizar com a planilha'
            );
        }

        const classes = (typeof getClasses === 'function' ? getClasses() : []) || [];
        let students = replace ? [] : (JSON.parse(localStorage.getItem('siga_students') || '[]') || []);
        let added = 0;
        let updated = 0;
        let skipped = 0;
        const sd = window.SigaSchoolData || null;
        const isAee = (code) => {
            if (sd && typeof sd.isAeeClassCode === 'function') return sd.isAeeClassCode(code);
            return /^(EEMAE01|EETAE01)$/i.test(String(code || '').trim());
        };
        const mergeStudent = (existing, incoming) => {
            if (sd && typeof sd.mergeLocalStudent === 'function') return sd.mergeLocalStudent(existing, incoming);
            return Object.assign({}, existing || {}, incoming);
        };
        const findStudentIdx = (list, cpf, codigoInep, email, nome, dataNascimento) => {
            let idx = -1;
            if (cpf) idx = list.findIndex(s => (s.cpf || '') === cpf);
            if (idx < 0 && codigoInep) idx = list.findIndex(s => normalizeInepValue(s.codigoInep) === codigoInep);
            if (idx < 0 && email) idx = list.findIndex(s => (s.email || '').toLowerCase() === email.toLowerCase());
            if (idx < 0 && nome && dataNascimento) {
                idx = list.findIndex(s =>
                    (s.nome || '').toLowerCase() === nome.toLowerCase() &&
                    (s.dataNascimento || '') === dataNascimento
                );
            }
            return idx;
        };

        for (let r = 1; r < rows.length; r++) {
            const cols = rows[r];
            if (!cols || !cols.length || cols.every(c => !String(c || '').trim())) continue;
            const get = (key) => (map[key] >= 0 ? String(cols[map[key]] || '').trim() : '');

            const nome = get('nome');
            if (!nome) { skipped++; continue; }

            let turma = get('turma').split(' - ')[0].trim(); // pode ser vazio (não enturmado)
            const cls = turma ? classes.find(c => String(c.code || '').toLowerCase() === turma.toLowerCase()) : null;
            if (cls) turma = cls.code;
            let dataNascimento = get('dataNascimento');
            if (/^\d{2}\/\d{2}\/\d{4}$/.test(dataNascimento)) {
                const p = dataNascimento.split('/');
                dataNascimento = `${p[2]}-${p[1]}-${p[0]}`;
            }

            let idade = get('idade');
            if (!idade && dataNascimento) {
                const d = new Date(dataNascimento + 'T00:00:00');
                if (!isNaN(d.getTime())) {
                    const now = new Date();
                    idade = String(now.getFullYear() - d.getFullYear() - ((now.getMonth() < d.getMonth() || (now.getMonth() === d.getMonth() && now.getDate() < d.getDate())) ? 1 : 0));
                }
            }

            const cpf = normalizeCpfValue(get('cpf'));
            const codigoInep = normalizeInepValue(get('codigoInep'));
            const email = get('email');
            const aeeTurmas = isAee(turma) ? [String(turma).toUpperCase()] : [];
            const payload = {
                codigoInep,
                nome,
                cpf,
                serie: isAee(turma) ? '' : (get('serie') || (cls ? cls.serie : '')),
                turma: isAee(turma) ? '' : turma,
                aeeTurmas,
                turno: isAee(turma) ? '' : (cls ? cls.turno : ''),
                dataNascimento,
                idade,
                email,
                senha: (function () {
                    const raw = get('senha');
                    if (raw && raw !== 'DEFINIR_SENHA') return raw;
                    return '';
                })(),
                precisaDefinirSenha: !(get('senha') && get('senha') !== 'DEFINIR_SENHA'),
                responsavel: get('responsavel'),
                contato: get('contato'),
                rotaEscolar: '',
                status: 'Ativo',
                frequencia: 95,
                avatar: '',
                classHistory: []
            };

            // Sempre mescla por identidade (mesmo em replace) para não duplicar regular+AEE
            let existingIdx = findStudentIdx(students, cpf, codigoInep, email, nome, dataNascimento);

            if (existingIdx >= 0) {
                students[existingIdx] = mergeStudent(students[existingIdx], payload);
                updated++;
            } else {
                students.push(mergeStudent({
                    id: 'al_' + Date.now().toString(36) + '_' + r + '_' + Math.random().toString(36).slice(2, 6)
                }, payload));
                added++;
            }
        }

        // Hash de senhas em claro antes de persistir (mitigação local até Supabase Auth)
        if (window.SigaSecurity && typeof window.SigaSecurity.hashPassword === 'function') {
            for (let i = 0; i < students.length; i++) {
                const s = students[i];
                if (s.senha && !window.SigaSecurity.isHashedPassword(s.senha)) {
                    s.senha = await window.SigaSecurity.hashPassword(s.senha);
                    s.precisaDefinirSenha = false;
                }
            }
        }

        try {
            localStorage.setItem('siga_students', JSON.stringify(students));
        } catch (quotaErr) {
            console.error(quotaErr);
            showToast('Armazenamento cheio. Não foi possível salvar todos os alunos neste navegador.', 'error');
            return;
        }

        alunosPageState.page = 1;
        refreshAlunosFilterOptions();
        renderAlunos();

        const mode = replace ? 'substituição' : 'mescla';
        const localMsg = `Importação local (${mode}): ${students.length} alunos (${added} novos, ${updated} atualizados${skipped ? ', ' + skipped + ' ignorados' : ''}).`;

        if (window.SigaSchoolData && typeof window.SigaSchoolData.upsertStudents === 'function') {
            showToast('Sincronizando alunos com o banco…');
            const cloud = await window.SigaSchoolData.upsertStudents(students, { replace: replace });
            if (cloud && cloud.ok) {
                refreshAlunosFilterOptions();
                renderAlunos();
                showToast(`${localMsg} Gravado no Supabase.`);
            } else {
                showToast(
                    `${localMsg} Banco: ${(cloud && cloud.message) || 'não sincronizado (verifique login Supabase e escola ativa).'}`,
                    'error'
                );
            }
        } else {
            showToast(localMsg);
        }
    } catch (err) {
        console.error(err);
        showToast(err.message || 'Falha ao importar a planilha.', 'error');
    }
}

function importAlunosFromCsv(file) {
    return importAlunosFromFile(file);
}

window.downloadModeloAlunosCsv = downloadModeloAlunosCsv;
window.importAlunosFromCsv = importAlunosFromCsv;
window.importAlunosFromFile = importAlunosFromFile;
window.goAlunosPage = function (page) {
    alunosPageState.page = Math.max(1, Number(page) || 1);
    renderAlunos();
};

function refreshAlunosFilterOptions() {
    const students = JSON.parse(localStorage.getItem('siga_students') || '[]') || [];
    const turmaSel = document.getElementById('alunos-filter-turma');
    const serieSel = document.getElementById('alunos-filter-serie');
    if (turmaSel) {
        const cur = turmaSel.value;
        const turmas = [...new Set(students.map(s => s.turma).filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b), 'pt-BR'));
        turmaSel.innerHTML = '<option value="">Todas as Turmas</option>' +
            turmas.map(t => `<option value="${t}">${t}</option>`).join('');
        if ([...turmaSel.options].some(o => o.value === cur)) turmaSel.value = cur;
    }
    if (serieSel) {
        const cur = serieSel.value;
        const series = [...new Set(students.map(s => s.serie).filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b), 'pt-BR'));
        serieSel.innerHTML = '<option value="">Todas as Séries</option>' +
            series.map(s => `<option value="${s}">${s}</option>`).join('');
        if ([...serieSel.options].some(o => o.value === cur)) serieSel.value = cur;
    }
}

function getFilteredAlunos() {
    let students = JSON.parse(localStorage.getItem('siga_students'));
    if (!students) {
        students = getDefaultStudents();
        localStorage.setItem('siga_students', JSON.stringify(students));
    }

    const query = (alunosPageState.search || '').toLowerCase().trim();
    return students.filter(s => {
        const matchesSearch = !query ||
            (s.nome || '').toLowerCase().includes(query) ||
            (s.email || '').toLowerCase().includes(query) ||
            (s.cpf || '').includes(query) ||
            (s.turma || '').toLowerCase().includes(query) ||
            (s.codigoInep || '').toLowerCase().includes(query) ||
            (s.serie || '').toLowerCase().includes(query);
        const matchesTurma = !alunosPageState.turma || studentBelongsToClass(s, alunosPageState.turma);
        const matchesSerie = !alunosPageState.serie || s.serie === alunosPageState.serie;
        const matchesStatus = !alunosPageState.status || (s.status || 'Ativo') === alunosPageState.status;
        return matchesSearch && matchesTurma && matchesSerie && matchesStatus;
    });
}

function renderAlunosPagination(totalFiltered) {
    const label = document.getElementById('alunos-pagination-label');
    const controls = document.getElementById('alunos-pagination-controls');
    const pageSize = alunosPageState.pageSize;
    const totalPages = Math.max(1, Math.ceil(totalFiltered / pageSize));
    if (alunosPageState.page > totalPages) alunosPageState.page = totalPages;
    const page = alunosPageState.page;
    const from = totalFiltered ? ((page - 1) * pageSize + 1) : 0;
    const to = Math.min(page * pageSize, totalFiltered);

    if (label) {
        label.innerHTML = `Exibindo <span class="font-bold text-on-surface">${from} - ${to}</span> de <span class="font-bold text-on-surface">${totalFiltered.toLocaleString('pt-BR')}</span> alunos`;
    }
    if (!controls) return;

    const btn = (content, targetPage, opts = {}) => {
        const disabled = !!opts.disabled;
        const active = !!opts.active;
        const cls = active
            ? 'w-10 h-10 bg-primary-container text-white font-bold rounded-lg transition-all'
            : 'w-10 h-10 bg-white hover:bg-surface-container text-text-secondary font-bold rounded-lg transition-all border border-border-subtle';
        if (opts.icon) {
            return `<button type="button" class="p-2 text-text-secondary hover:bg-white rounded-lg transition-colors disabled:opacity-30" ${disabled ? 'disabled' : ''} onclick="goAlunosPage(${targetPage})"><span class="material-symbols-outlined">${content}</span></button>`;
        }
        return `<button type="button" class="${cls}" ${disabled ? 'disabled' : ''} onclick="goAlunosPage(${targetPage})">${content}</button>`;
    };

    const pages = [];
    const pushPage = (p) => pages.push(btn(String(p), p, { active: p === page }));
    if (totalPages <= 7) {
        for (let p = 1; p <= totalPages; p++) pushPage(p);
    } else {
        pushPage(1);
        if (page > 3) pages.push('<span class="px-2 text-text-secondary">...</span>');
        const start = Math.max(2, page - 1);
        const end = Math.min(totalPages - 1, page + 1);
        for (let p = start; p <= end; p++) pushPage(p);
        if (page < totalPages - 2) pages.push('<span class="px-2 text-text-secondary">...</span>');
        pushPage(totalPages);
    }

    controls.innerHTML =
        btn('chevron_left', page - 1, { icon: true, disabled: page <= 1 }) +
        pages.join('') +
        btn('chevron_right', page + 1, { icon: true, disabled: page >= totalPages });
}

function renderAlunos(searchTerm) {
    const tbody = document.getElementById('alunos-tbody');
    if (!tbody) return;

    if (typeof searchTerm === 'string') {
        alunosPageState.search = searchTerm;
    }

    let students = JSON.parse(localStorage.getItem('siga_students'));
    if (!students) {
        students = getDefaultStudents();
        localStorage.setItem('siga_students', JSON.stringify(students));
    }

    const totalEl = document.getElementById('kpi-alunos-total');
    const ativosEl = document.getElementById('kpi-alunos-ativos');
    const riscoEl = document.getElementById('kpi-alunos-risco');
    const inativosEl = document.getElementById('kpi-alunos-inativos');
    const ativosPctEl = document.getElementById('kpi-alunos-ativos-pct');
    const activeCount = students.filter(s => (s.status || 'Ativo') === 'Ativo').length;
    const riskCount = students.filter(s => s.status === 'Em Risco').length;
    const inactiveCount = students.filter(s => s.status === 'Inativo').length;
    if (totalEl) totalEl.textContent = students.length.toLocaleString('pt-BR');
    if (ativosEl) ativosEl.textContent = activeCount.toLocaleString('pt-BR');
    if (riscoEl) riscoEl.textContent = riskCount.toLocaleString('pt-BR');
    if (inativosEl) inativosEl.textContent = inactiveCount.toLocaleString('pt-BR');
    if (ativosPctEl) {
        ativosPctEl.textContent = students.length
            ? Math.round((activeCount / students.length) * 100) + '% Ativos'
            : '—';
    }

    // Fallback for old KPI markup without IDs
    if (!totalEl) {
        const cards = document.querySelectorAll('.grid.grid-cols-1.md\\:grid-cols-2.lg\\:grid-cols-4.gap-6 > div');
        if (cards.length >= 4) {
            const setH3 = (card, val) => {
                const el = card.querySelector('h3') || card.querySelector('.font-headline-lg');
                if (el) el.textContent = val;
            };
            setH3(cards[0], students.length);
            setH3(cards[1], activeCount);
            setH3(cards[2], riskCount);
            setH3(cards[3], inactiveCount);
        }
    }

    const filtered = getFilteredAlunos();
    const pageSize = alunosPageState.pageSize;
    const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
    if (alunosPageState.page > totalPages) alunosPageState.page = totalPages;
    const start = (alunosPageState.page - 1) * pageSize;
    const pageItems = filtered.slice(start, start + pageSize);

    renderAlunosPagination(filtered.length);

    if (!pageItems.length) {
        tbody.innerHTML = `<tr><td colspan="6" class="px-6 py-10 text-center text-body-md text-text-secondary">Nenhum aluno encontrado. Importe a planilha ou cadastre um novo aluno.</td></tr>`;
        return;
    }

    let html = '';
    pageItems.forEach(s => {
        const aeeText = studentAeeLabel(s);
        const turmaText = s.turma
            ? (aeeText ? `${s.turma} · AEE ${aeeText}` : s.turma)
            : (aeeText ? `AEE ${aeeText}` : '—');
        const safeId = String(s.id).replace(/'/g, "\\'");
        html += `
            <tr class="hover:bg-surface-container-low/30 transition-colors group">
                <td class="px-4 py-3">
                    <div class="flex items-center gap-3 min-w-[180px]">
                        <div class="w-9 h-9 rounded-full bg-primary-light/20 text-primary flex items-center justify-center text-xs font-bold shrink-0">
                            ${(s.nome || '?').split(/\s+/).slice(0, 2).map(n => n[0] || '').join('').toUpperCase()}
                        </div>
                        <div class="min-w-0">
                            <p class="font-semibold text-body-md text-on-surface truncate" title="${(s.nome || '').replace(/"/g, '&quot;')}">${s.nome || '—'}</p>
                            <p class="text-[11px] text-text-secondary truncate">${s.email || s.cpf || ''}</p>
                        </div>
                    </div>
                </td>
                <td class="px-4 py-3 text-body-md text-on-surface whitespace-nowrap">${turmaText}${s.turno && s.turma ? ' (' + s.turno + ')' : ''}${aeeText ? ' <span class="ml-1 px-1.5 py-0.5 rounded text-[10px] font-bold uppercase bg-violet-100 text-violet-800">AEE</span>' : ''}</td>
                <td class="px-4 py-3 text-body-md text-on-surface whitespace-nowrap">${s.idade ? s.idade + ' anos' : '—'}</td>
                <td class="px-4 py-3 text-body-md text-on-surface whitespace-nowrap">${s.responsavel || '—'}</td>
                <td class="px-4 py-3 text-body-md text-on-surface whitespace-nowrap">${s.contato || '—'}</td>
                <td class="px-4 py-3 text-right">
                    <div class="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <a class="p-2 text-text-secondary hover:text-primary hover:bg-primary-light/10 rounded-lg transition-all" href="fichadoaluno.html?id=${encodeURIComponent(s.id)}">
                            <span class="material-symbols-outlined text-[20px]">visibility</span>
                        </a>
                        <button class="p-2 text-text-secondary hover:text-primary hover:bg-primary-light/10 rounded-lg transition-all" onclick="openEditStudentModal('${safeId}')">
                            <span class="material-symbols-outlined text-[20px]">edit</span>
                        </button>
                        <button class="p-2 text-text-secondary hover:text-error hover:bg-error/10 rounded-lg transition-all" onclick="openDeleteStudentConfirm('${safeId}')">
                            <span class="material-symbols-outlined text-[20px]">delete</span>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    });
    tbody.innerHTML = html;
}

function openNewStudentModal() {
    let modal = document.getElementById('siga-modal-student');
    if (modal) modal.remove();

    modal = document.createElement('div');
    modal.id = 'siga-modal-student';
    modal.className = 'fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-on-background/40 backdrop-blur-sm';

    modal.innerHTML = `
        <div class="bg-background-surface w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200 border border-border-subtle" style="font-family: 'Inter', sans-serif;">
            <div class="p-6 border-b border-border-subtle flex justify-between items-center bg-surface-container-low/30">
                <div class="flex items-center gap-3">
                    <div class="w-10 h-10 bg-primary/10 text-primary rounded-full flex items-center justify-center">
                        <span class="material-symbols-outlined">person_add</span>
                    </div>
                    <h3 class="font-headline-sm text-headline-sm text-on-surface font-semibold">Adicionar Novo Aluno</h3>
                </div>
                <button class="p-2 hover:bg-surface-container-low rounded-full transition-colors text-text-secondary" onclick="document.getElementById('siga-modal-student').remove()">
                    <span class="material-symbols-outlined">close</span>
                </button>
            </div>
            <form class="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                        <label class="block text-label-md font-bold text-on-surface mb-1">Código INEP</label>
                        <input type="text" id="std-codigo-inep" class="w-full border border-border-subtle rounded-lg px-4 py-2 text-body-md focus:border-primary focus:ring-2 focus:ring-primary/10 outline-none transition-all" placeholder="Ex: 123456789012">
                    </div>
                    <div>
                        <label class="block text-label-md font-bold text-on-surface mb-1">CPF</label>
                        <input type="text" id="std-cpf" class="w-full border border-border-subtle rounded-lg px-4 py-2 text-body-md focus:border-primary focus:ring-2 focus:ring-primary/10 outline-none transition-all" placeholder="Ex: 123.456.789-00" required>
                    </div>
                </div>
                <div>
                    <label class="block text-label-md font-bold text-on-surface mb-1">Aluno (Nome Completo)</label>
                    <input type="text" id="std-nome" class="w-full border border-border-subtle rounded-lg px-4 py-2 text-body-md focus:border-primary focus:ring-2 focus:ring-primary/10 outline-none transition-all" placeholder="Ex: Arthur Pendragon" required>
                </div>
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                        <label class="block text-label-md font-bold text-on-surface mb-1">Turma regular</label>
                        <select id="std-turma" class="w-full border border-border-subtle rounded-lg px-4 py-2 text-body-md focus:border-primary focus:ring-2 focus:ring-primary/10 outline-none transition-all" onchange="updateStudentModalTurno(this)">
                            <option value="">— Sem turma regular —</option>
                            ${(function(){
                                const classes = getRegularClasses();
                                return classes.map((c, i) => `<option value="${c.code}" ${i === 0 ? 'selected' : ''}>${c.code} - ${c.serie}</option>`).join('');
                            })()}
                        </select>
                    </div>
                    <div>
                        <label class="block text-label-md font-bold text-on-surface mb-1">Série</label>
                        <input type="text" id="std-serie" class="w-full border border-border-subtle bg-surface-container-low rounded-lg px-4 py-2 text-body-md outline-none cursor-not-allowed text-text-secondary" readonly value="${(function(){
                            const classes = getRegularClasses();
                            return classes.length > 0 ? (classes[0].serie || '') : '';
                        })()}">
                    </div>
                </div>
                <div>
                    <label class="block text-label-md font-bold text-on-surface mb-2">AEE (Atendimento Educacional Especializado)</label>
                    <div class="flex flex-wrap gap-2">${buildAeeCheckboxesHtml([])}</div>
                    <p class="mt-1 text-[11px] text-text-secondary">O aluno permanece na turma regular e pode também estar em EEMAE01 / EETAE01.</p>
                </div>
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                        <label class="block text-label-md font-bold text-on-surface mb-1">Turno</label>
                        <input type="text" id="std-turno" class="w-full border border-border-subtle bg-surface-container-low rounded-lg px-4 py-2 text-body-md outline-none cursor-not-allowed text-text-secondary" readonly value="${(function(){
                            const classes = JSON.parse(localStorage.getItem('siga_classes')) || [];
                            return classes.length > 0 ? classes[0].turno : 'Manhã';
                        })()}">
                    </div>
                    <div>
                        <label class="block text-label-md font-bold text-on-surface mb-1">Data de Nascimento</label>
                        <input type="date" id="std-data-nascimento" class="w-full border border-border-subtle rounded-lg px-4 py-2 text-body-md focus:border-primary focus:ring-2 focus:ring-primary/10 outline-none transition-all" required>
                    </div>
                </div>
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                        <label class="block text-label-md font-bold text-on-surface mb-1">Idade (Calculada)</label>
                        <input type="text" id="std-idade" class="w-full border border-border-subtle bg-surface-container-low rounded-lg px-4 py-2 text-body-md outline-none cursor-not-allowed" readonly placeholder="Preencha a data de nascimento">
                    </div>
                    <div>
                        <label class="block text-label-md font-bold text-on-surface mb-1">Email Institucional</label>
                        <input type="email" id="std-email-institucional" class="w-full border border-border-subtle rounded-lg px-4 py-2 text-body-md focus:border-primary focus:ring-2 focus:ring-primary/10 outline-none transition-all" placeholder="Ex: nome.aluno@aluno.seduc.pa.gov.br" required>
                    </div>
                </div>
                <div>
                    <label class="block text-label-md font-bold text-on-surface mb-1">Senha</label>
                    <input type="password" id="std-senha" class="w-full border border-border-subtle rounded-lg px-4 py-2 text-body-md focus:border-primary focus:ring-2 focus:ring-primary/10 outline-none transition-all" placeholder="Senha de acesso do aluno" autocomplete="new-password" required>
                </div>
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                        <label class="block text-label-md font-bold text-on-surface mb-1">Responsável</label>
                        <input type="text" id="std-responsavel" class="w-full border border-border-subtle rounded-lg px-4 py-2 text-body-md focus:border-primary focus:ring-2 focus:ring-primary/10 outline-none transition-all" placeholder="Ex: Maria Pendragon" required>
                    </div>
                    <div>
                        <label class="block text-label-md font-bold text-on-surface mb-1">Contato</label>
                        <input type="text" id="std-contato" class="w-full border border-border-subtle rounded-lg px-4 py-2 text-body-md focus:border-primary focus:ring-2 focus:ring-primary/10 outline-none transition-all" placeholder="Ex: (11) 98765-4321" required>
                    </div>
                </div>
                <div>
                    <label class="block text-label-md font-bold text-on-surface mb-1">Rota Escolar (opcional)</label>
                    <input type="text" id="std-rota-escolar" class="w-full border border-border-subtle rounded-lg px-4 py-2 text-body-md focus:border-primary focus:ring-2 focus:ring-primary/10 outline-none transition-all" placeholder="Ex: Rota 12 - Norte">
                </div>

                <div class="flex items-center justify-end gap-3 pt-4 border-t border-border-subtle">
                    <button type="button" class="px-5 py-2.5 text-label-md font-bold text-text-secondary hover:bg-surface-container-low rounded-lg transition-colors" onclick="document.getElementById('siga-modal-student').remove()">Cancelar</button>
                    <button type="submit" class="px-6 py-2.5 bg-primary text-white rounded-lg font-bold shadow-lg shadow-primary/20 hover:brightness-90 transition-all active:scale-95">Cadastrar Aluno</button>
                </div>
            </form>
        </div>
    `;
    document.body.appendChild(modal);
    bindAgeCalculator();

    modal.querySelector('form').addEventListener('submit', (e) => {
        e.preventDefault();
        const nome = document.getElementById('std-nome').value;
        const cpf = document.getElementById('std-cpf').value;
        const turma = document.getElementById('std-turma').value;
        const turno = document.getElementById('std-turno').value;
        const serie = (document.getElementById('std-serie') || {}).value || '';
        const codigoInep = (document.getElementById('std-codigo-inep') || {}).value || '';
        const responsavel = document.getElementById('std-responsavel').value;
        const contato = document.getElementById('std-contato').value;
        const dataNascimento = document.getElementById('std-data-nascimento').value;
        const idade = document.getElementById('std-idade').value;
        const rotaEscolar = (document.getElementById('std-rota-escolar') || {}).value || '';
        const email = document.getElementById('std-email-institucional').value;
        const senha = (document.getElementById('std-senha') || {}).value || '';

        const id = Date.now().toString();
        const persist = async () => {
            let hashed = senha;
            if (window.SigaSecurity && senha) {
                hashed = await window.SigaSecurity.hashPassword(senha);
            }
            const newStudent = {
                id, codigoInep, nome, cpf, serie, turma, aeeTurmas: readSelectedAeeCodes(), turno, responsavel, contato, dataNascimento, idade, rotaEscolar, email,
                senha: hashed,
                precisaDefinirSenha: !senha,
                frequencia: 95, status: "Ativo", avatar: "", classHistory: []
            };

            const currentStudents = JSON.parse(localStorage.getItem('siga_students')) || [];
            currentStudents.unshift(newStudent);
            localStorage.setItem('siga_students', JSON.stringify(currentStudents));

            modal.remove();
            renderAlunos();
            showToast('Aluno cadastrado com sucesso!');
        };
        persist();
    });
}

function openEditStudentModal(studentId) {
    let modal = document.getElementById('siga-modal-student');
    if (modal) modal.remove();

    const students = JSON.parse(localStorage.getItem('siga_students')) || [];
    const student = students.find(s => s.id === studentId);
    if (!student) return;

    modal = document.createElement('div');
    modal.id = 'siga-modal-student';
    modal.className = 'fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-on-background/40 backdrop-blur-sm';

    const esc = (typeof escapeHtml === 'function') ? escapeHtml : (s) => String(s == null ? '' : s);
    const hasPwd = !!(student.senha);

    modal.innerHTML = `
        <div class="bg-background-surface w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200 border border-border-subtle" style="font-family: 'Inter', sans-serif;">
            <div class="p-6 border-b border-border-subtle flex justify-between items-center bg-surface-container-low/30">
                <div class="flex items-center gap-3">
                    <div class="w-10 h-10 bg-primary/10 text-primary rounded-full flex items-center justify-center">
                        <span class="material-symbols-outlined">edit</span>
                    </div>
                    <h3 class="font-headline-sm text-headline-sm text-on-surface font-semibold">Editar Cadastro</h3>
                </div>
                <button class="p-2 hover:bg-surface-container-low rounded-full transition-colors text-text-secondary" onclick="document.getElementById('siga-modal-student').remove()">
                    <span class="material-symbols-outlined">close</span>
                </button>
            </div>
            <form class="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                        <label class="block text-label-md font-bold text-on-surface mb-1">Código INEP</label>
                        <input type="text" id="std-codigo-inep" class="w-full border border-border-subtle rounded-lg px-4 py-2 text-body-md focus:border-primary focus:ring-2 focus:ring-primary/10 outline-none transition-all" value="${esc(student.codigoInep || '')}">
                    </div>
                    <div>
                        <label class="block text-label-md font-bold text-on-surface mb-1">CPF</label>
                        <input type="text" id="std-cpf" class="w-full border border-border-subtle rounded-lg px-4 py-2 text-body-md focus:border-primary focus:ring-2 focus:ring-primary/10 outline-none transition-all" value="${esc(student.cpf || '')}" required>
                    </div>
                </div>
                <div>
                    <label class="block text-label-md font-bold text-on-surface mb-1">Aluno (Nome Completo)</label>
                    <input type="text" id="std-nome" class="w-full border border-border-subtle rounded-lg px-4 py-2 text-body-md focus:border-primary focus:ring-2 focus:ring-primary/10 outline-none transition-all" value="${esc(student.nome || '')}" required>
                </div>
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                        <label class="block text-label-md font-bold text-on-surface mb-1">Turma regular</label>
                        <select id="std-turma" class="w-full border border-border-subtle rounded-lg px-4 py-2 text-body-md focus:border-primary focus:ring-2 focus:ring-primary/10 outline-none transition-all" onchange="updateStudentModalTurno(this)">
                            <option value="">— Sem turma regular —</option>
                            ${(function(){
                                const classes = getRegularClasses();
                                return classes.map(c => `<option value="${esc(c.code)}" ${student.turma === c.code ? 'selected' : ''}>${esc(c.code)} - ${esc(c.serie)}</option>`).join('');
                            })()}
                        </select>
                    </div>
                    <div>
                        <label class="block text-label-md font-bold text-on-surface mb-1">Série</label>
                        <input type="text" id="std-serie" class="w-full border border-border-subtle bg-surface-container-low rounded-lg px-4 py-2 text-body-md outline-none cursor-not-allowed text-text-secondary" readonly value="${esc((function(){
                            const classes = getRegularClasses();
                            const activeClass = classes.find(c => c.code === student.turma);
                            return student.serie || (activeClass ? activeClass.serie : '') || '';
                        })())}">
                    </div>
                </div>
                <div>
                    <label class="block text-label-md font-bold text-on-surface mb-2">AEE (Atendimento Educacional Especializado)</label>
                    <div class="flex flex-wrap gap-2">${buildAeeCheckboxesHtml(student.aeeTurmas || [])}</div>
                    <p class="mt-1 text-[11px] text-text-secondary">Mantém a turma regular e vincula EEMAE01 / EETAE01 sem substituí-la.</p>
                </div>
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                        <label class="block text-label-md font-bold text-on-surface mb-1">Turno</label>
                        <input type="text" id="std-turno" class="w-full border border-border-subtle bg-surface-container-low rounded-lg px-4 py-2 text-body-md outline-none cursor-not-allowed text-text-secondary" readonly value="${esc((function(){
                            const classes = getRegularClasses();
                            const activeClass = classes.find(c => c.code === student.turma);
                            return activeClass ? activeClass.turno : (student.turno || (classes.length > 0 ? classes[0].turno : 'Manhã'));
                        })())}">
                    </div>
                    <div>
                        <label class="block text-label-md font-bold text-on-surface mb-1">Data de Nascimento</label>
                        <input type="date" id="std-data-nascimento" class="w-full border border-border-subtle rounded-lg px-4 py-2 text-body-md focus:border-primary focus:ring-2 focus:ring-primary/10 outline-none transition-all" value="${esc(student.dataNascimento || '')}" required>
                    </div>
                </div>
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                        <label class="block text-label-md font-bold text-on-surface mb-1">Idade (Calculada)</label>
                        <input type="text" id="std-idade" class="w-full border border-border-subtle bg-surface-container-low rounded-lg px-4 py-2 text-body-md outline-none cursor-not-allowed" readonly value="${esc(student.idade || '')}">
                    </div>
                    <div>
                        <label class="block text-label-md font-bold text-on-surface mb-1">Email Institucional</label>
                        <input type="email" id="std-email-institucional" class="w-full border border-border-subtle rounded-lg px-4 py-2 text-body-md focus:border-primary focus:ring-2 focus:ring-primary/10 outline-none transition-all" value="${esc(student.email || '')}" required>
                    </div>
                </div>
                <div>
                    <label class="block text-label-md font-bold text-on-surface mb-1">Senha ${hasPwd ? '(deixe em branco para manter)' : ''}</label>
                    <input type="password" id="std-senha" class="w-full border border-border-subtle rounded-lg px-4 py-2 text-body-md focus:border-primary focus:ring-2 focus:ring-primary/10 outline-none transition-all" value="" placeholder="${hasPwd ? '••••••••' : 'Defina uma senha'}" autocomplete="new-password" ${hasPwd ? '' : 'required'}>
                </div>
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                        <label class="block text-label-md font-bold text-on-surface mb-1">Responsável</label>
                        <input type="text" id="std-responsavel" class="w-full border border-border-subtle rounded-lg px-4 py-2 text-body-md focus:border-primary focus:ring-2 focus:ring-primary/10 outline-none transition-all" value="${esc(student.responsavel || '')}" required>
                    </div>
                    <div>
                        <label class="block text-label-md font-bold text-on-surface mb-1">Contato</label>
                        <input type="text" id="std-contato" class="w-full border border-border-subtle rounded-lg px-4 py-2 text-body-md focus:border-primary focus:ring-2 focus:ring-primary/10 outline-none transition-all" value="${esc(student.contato || '')}" required>
                    </div>
                </div>
                <div>
                    <label class="block text-label-md font-bold text-on-surface mb-1">Rota Escolar (opcional)</label>
                    <input type="text" id="std-rota-escolar" class="w-full border border-border-subtle rounded-lg px-4 py-2 text-body-md focus:border-primary focus:ring-2 focus:ring-primary/10 outline-none transition-all" value="${esc(student.rotaEscolar || '')}">
                </div>

                <div class="flex items-center justify-end gap-3 pt-4 border-t border-border-subtle">
                    <button type="button" class="px-5 py-2.5 text-label-md font-bold text-text-secondary hover:bg-surface-container-low rounded-lg transition-colors" onclick="document.getElementById('siga-modal-student').remove()">Cancelar</button>
                    <button type="submit" class="px-6 py-2.5 bg-primary text-white rounded-lg font-bold shadow-lg shadow-primary/20 hover:brightness-90 transition-all active:scale-95">Salvar Alterações</button>
                </div>
            </form>
        </div>
    `;
    document.body.appendChild(modal);
    bindAgeCalculator();

    modal.querySelector('form').addEventListener('submit', (e) => {
        e.preventDefault();
        const nome = document.getElementById('std-nome').value;
        const cpf = document.getElementById('std-cpf').value;
        const turma = document.getElementById('std-turma').value;
        const turno = document.getElementById('std-turno').value;
        const serie = (document.getElementById('std-serie') || {}).value || '';
        const codigoInep = (document.getElementById('std-codigo-inep') || {}).value || '';
        const responsavel = document.getElementById('std-responsavel').value;
        const contato = document.getElementById('std-contato').value;
        const dataNascimento = document.getElementById('std-data-nascimento').value;
        const idade = document.getElementById('std-idade').value;
        const rotaEscolar = (document.getElementById('std-rota-escolar') || {}).value || '';
        const email = document.getElementById('std-email-institucional').value;
        const senha = (document.getElementById('std-senha') || {}).value || '';

        const persist = async () => {
            const currentStudents = JSON.parse(localStorage.getItem('siga_students')) || [];
            const index = currentStudents.findIndex(s => s.id === studentId);
            if (index !== -1) {
                let nextSenha = currentStudents[index].senha || '';
                let precisa = currentStudents[index].precisaDefinirSenha;
                if (senha) {
                    nextSenha = window.SigaSecurity
                        ? await window.SigaSecurity.hashPassword(senha)
                        : senha;
                    precisa = false;
                }
                currentStudents[index] = {
                    ...currentStudents[index],
                    codigoInep, nome, cpf, serie, turma, aeeTurmas: readSelectedAeeCodes(), turno, responsavel, contato, dataNascimento, idade, rotaEscolar, email,
                    senha: nextSenha,
                    precisaDefinirSenha: !!precisa && !nextSenha
                };
                localStorage.setItem('siga_students', JSON.stringify(currentStudents));
            }

            modal.remove();
            renderAlunos();
            showToast('Cadastro atualizado!');
        };
        persist();
    });
}

function openDeleteStudentConfirm(studentId) {
    let modal = document.getElementById('siga-modal-student-delete');
    if (modal) modal.remove();

    const students = JSON.parse(localStorage.getItem('siga_students')) || [];
    const student = students.find(s => s.id === studentId);
    if (!student) return;

    modal = document.createElement('div');
    modal.id = 'siga-modal-student-delete';
    modal.className = 'fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-on-background/40 backdrop-blur-sm';
    
    modal.innerHTML = `
        <div class="bg-background-surface w-full max-w-md rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200 border border-border-subtle" style="font-family: 'Inter', sans-serif;">
            <div class="p-6 border-b border-border-subtle flex justify-between items-center bg-error/10">
                <div class="flex items-center gap-3">
                    <div class="w-10 h-10 bg-error/20 text-error rounded-full flex items-center justify-center">
                        <span class="material-symbols-outlined">delete_forever</span>
                    </div>
                    <h3 class="font-headline-sm text-headline-sm text-error font-semibold">Excluir Aluno</h3>
                </div>
                <button class="p-2 hover:bg-surface-container-low rounded-full transition-colors text-text-secondary" onclick="document.getElementById('siga-modal-student-delete').remove()">
                    <span class="material-symbols-outlined">close</span>
                </button>
            </div>
            <div class="p-6 space-y-4">
                <p class="text-body-md text-on-surface">Você tem certeza que deseja excluir permanentemente o cadastro do aluno <strong class="font-semibold">${student.nome}</strong>?</p>
                <div class="flex items-center justify-end gap-3 pt-4 border-t border-border-subtle">
                    <button type="button" class="px-5 py-2.5 text-label-md font-bold text-text-secondary hover:bg-surface-container-low rounded-lg transition-colors" onclick="document.getElementById('siga-modal-student-delete').remove()">Cancelar</button>
                    <button type="button" id="confirm-delete-btn" class="px-6 py-2.5 bg-error text-white rounded-lg font-bold shadow-lg shadow-error/20 hover:brightness-90 transition-all active:scale-95">Sim, Excluir</button>
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(modal);

    document.getElementById('confirm-delete-btn').addEventListener('click', () => {
        const currentStudents = JSON.parse(localStorage.getItem('siga_students')) || [];
        const filteredStudents = currentStudents.filter(s => s.id !== studentId);
        localStorage.setItem('siga_students', JSON.stringify(filteredStudents));

        modal.remove();
        renderAlunos();
        showToast('Aluno removido com sucesso!');
    });
}

function calculateAge(dobString) {
    if (!dobString) return "";
    const dob = new Date(dobString);
    const today = new Date();
    let age = today.getFullYear() - dob.getFullYear();
    const m = today.getMonth() - dob.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) {
        age--;
    }
    return age >= 0 ? age : 0;
}

function bindAgeCalculator() {
    const dobInput = document.getElementById('std-data-nascimento');
    const ageInput = document.getElementById('std-idade');
    if (dobInput && ageInput) {
        dobInput.addEventListener('input', () => {
            const age = calculateAge(dobInput.value);
            ageInput.value = age;
        });
    }
}

function getDefaultStudents() {
    return [];
}

// 8. Ficha do Aluno Page (fichadoaluno.html)
function formatStudentTurmaLabel(student) {
    if (!student) return '—';
    const classes = (typeof getClasses === 'function' ? getClasses() : JSON.parse(localStorage.getItem('siga_classes') || '[]')) || [];
    const code = String(student.turma || '').trim();
    const cls = code ? classes.find(c => String(c.code) === code) : null;
    const serie = (cls && cls.serie) || student.serie || '';
    const turno = (cls && cls.turno) || student.turno || '';

    if (!code && !serie) return 'Sem turma';

    // Ex.: M1MNM01 — 1o ano do ensino médio · Manhã
    const parts = [];
    if (code) parts.push(code);
    if (serie && serie.toLowerCase() !== code.toLowerCase()) parts.push(serie);
    let label = parts.join(' — ');
    if (turno) label += (label ? ' · ' : '') + turno;
    return label || '—';
}

function formatDateBrFicha(iso) {
    if (!iso) return '—';
    const s = String(iso);
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
        const p = s.slice(0, 10).split('-');
        return `${p[2]}/${p[1]}/${p[0]}`;
    }
    if (/^\d{2}\/\d{2}\/\d{4}/.test(s)) return s.slice(0, 10);
    return s;
}

function initFichaPage() {
    const urlParams = new URLSearchParams(window.location.search);
    const studentId = urlParams.get('id') || '';

    const students = JSON.parse(localStorage.getItem('siga_students')) || [];
    let student = students.find(s => String(s.id) === String(studentId));
    if (!student) {
        student = {
            id: '', nome: 'Aluno não encontrado', cpf: '', serie: '', turma: '', turno: '',
            responsavel: '', contato: '', dataNascimento: '', idade: '', rotaEscolar: '',
            email: '', senha: '', status: 'Inativo', frequencia: 0, avatar: '', classHistory: []
        };
    }

    // Sync turno/série from class registry when available
    try {
        const classes = (typeof getClasses === 'function' ? getClasses() : []) || [];
        const cls = classes.find(c => c.code === student.turma);
        if (cls) {
            if (!student.turno) student.turno = cls.turno || '';
            if (!student.serie) student.serie = cls.serie || '';
        }
    } catch (e) { /* ignore */ }

    const turmaLabel = formatStudentTurmaLabel(student);

    // 1. Update Profile Photo
    const photoEl = document.getElementById('student-avatar-img');
    if (photoEl && student.avatar) {
        photoEl.src = student.avatar;
    }

    // 2. Update Student Name
    const nameEl = document.getElementById('ficha-student-name') || document.querySelector('h2.font-headline-lg');
    if (nameEl) nameEl.textContent = student.nome || '—';

    // 3. Update Status Badge
    const badgeEl = document.getElementById('ficha-student-status') ||
        document.querySelector('.bg-surface-container-lowest span.bg-primary-light\\/20');
    if (badgeEl) {
        let statusStyle = "bg-primary-light/20 text-primary";
        if (student.status === "Em Risco") {
            statusStyle = "bg-error-container text-error";
        } else if (student.status === "Inativo") {
            statusStyle = "bg-surface-container text-text-secondary";
        }
        badgeEl.className = `px-3 py-1 ${statusStyle} text-label-sm font-label-sm rounded-full flex items-center gap-1 uppercase tracking-wider`;
        badgeEl.innerHTML = `<span class="w-1.5 h-1.5 rounded-full ${student.status === 'Ativo' ? 'bg-primary animate-pulse' : student.status === 'Em Risco' ? 'bg-error animate-pulse' : 'bg-text-secondary'}"></span> ${student.status || 'Ativo'}`;
    }

    // 4. Update CPF
    const cpfEl = document.getElementById('ficha-student-cpf');
    if (cpfEl) {
        const esc = (typeof escapeHtml === 'function') ? escapeHtml : (s) => String(s == null ? '' : s);
        cpfEl.innerHTML = `CPF: <strong>${esc(student.cpf || '—')}</strong>`;
    } else {
        const matriculaEl = Array.from(document.querySelectorAll('span')).find(el => el.textContent.includes('Matrícula:') || el.textContent.includes('CPF:'));
        if (matriculaEl) {
            const esc = (typeof escapeHtml === 'function') ? escapeHtml : (s) => String(s == null ? '' : s);
            matriculaEl.innerHTML = `CPF: <strong>${esc(student.cpf || '—')}</strong>`;
        }
    }

    // 5. Update Turma (sempre a turma real do aluno)
    const turmaEl = document.getElementById('ficha-student-turma');
    if (turmaEl) {
        turmaEl.textContent = turmaLabel;
        turmaEl.title = turmaLabel;
    }

    // 6. Ingresso / série
    const ingressoEl = document.getElementById('ficha-student-ingresso');
    if (ingressoEl) {
        const serie = student.serie || '';
        ingressoEl.textContent = serie ? `Série: ${serie}` : 'Série: —';
    }

    // 7. Update Contact info (Responsavel, Contato, Email, Nascimento, Idade, Rota)
    const personalCardBody = document.querySelector('.col-span-12.lg\\:col-span-4 .p-card-padding.space-y-4');
    if (personalCardBody) {
        const esc = (typeof escapeHtml === 'function') ? escapeHtml : (s) => String(s == null ? '' : s);
        personalCardBody.innerHTML = `
            <div>
                <label class="block text-label-sm text-text-secondary uppercase tracking-tighter">Data de Nascimento</label>
                <p class="font-body-md text-body-md font-medium">${esc(formatDateBrFicha(student.dataNascimento))}${student.idade ? ' (' + esc(student.idade) + ' anos)' : ''}</p>
            </div>
            <div>
                <label class="block text-label-sm text-text-secondary uppercase tracking-tighter">Turma</label>
                <p class="font-body-md text-body-md font-medium">${esc(turmaLabel)}</p>
            </div>
            <div>
                <label class="block text-label-sm text-text-secondary uppercase tracking-tighter">Responsável</label>
                <p class="font-body-md text-body-md font-medium">${esc(student.responsavel || '—')}</p>
            </div>
            <div>
                <label class="block text-label-sm text-text-secondary uppercase tracking-tighter">Contato</label>
                <p class="font-body-md text-body-md font-medium flex items-center gap-2">
                    <span class="material-symbols-outlined text-[16px]">call</span> ${esc(student.contato || '—')}
                </p>
                <p class="font-body-md text-body-md font-medium flex items-center gap-2">
                    <span class="material-symbols-outlined text-[16px]">mail</span> ${esc(student.email || '—')}
                </p>
            </div>
            <div>
                <label class="block text-label-sm text-text-secondary uppercase tracking-tighter">Rota Escolar</label>
                <p class="font-body-md text-body-md font-medium flex items-center gap-2">
                    <span class="material-symbols-outlined text-[16px]">directions_bus</span> ${esc(student.rotaEscolar || '—')}
                </p>
            </div>
        `;
    }

    // 8. Update Frequency Widget
    const freqValEl = document.querySelector('.text-\\[44px\\].font-bold');
    if (freqValEl) freqValEl.textContent = (student.frequencia != null ? student.frequencia : 0) + '%';

    const freqBarEl = document.querySelector('.w-full.bg-surface-container-low.h-3.rounded-full div');
    if (freqBarEl) freqBarEl.style.width = (student.frequencia != null ? student.frequencia : 0) + '%';

    // 9. Bind "Editar Cadastro" button
    const editBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Editar Cadastro'));
    if (editBtn) {
        editBtn.onclick = () => {
            openEditStudentModal(student.id);
            setTimeout(() => {
                const form = document.querySelector('#siga-modal-student form');
                if (form) {
                    form.addEventListener('submit', () => {
                        setTimeout(() => {
                            window.location.reload();
                        }, 50);
                    });
                }
            }, 100);
        };
    }

    // 10. Render Class History timeline
    renderClassHistory(student);

    // 11. Render occurrences timeline dynamically
    renderFichaOccurrences(student);
}

window.gerarDeclaracaoMatriculaFicha = function () {
    const urlParams = new URLSearchParams(window.location.search);
    const studentId = urlParams.get('id') || '';
    if (!studentId) {
        if (typeof showToast === 'function') showToast('Aluno não identificado.', 'error');
        return;
    }
    if (typeof window.emitirDeclaracaoMatriculaAluno === 'function') {
        window.emitirDeclaracaoMatriculaAluno(studentId);
        return;
    }
    if (typeof showToast === 'function') {
        showToast('Módulo de documentos da secretaria não carregado.', 'error');
    }
};

function renderFichaOccurrences(student) {
    const container = document.getElementById('ficha-occurrences-container');
    if (!container) return;
    
    const allOccurrences = JSON.parse(localStorage.getItem('siga_occurrences')) || [];
    const studentOccurrences = allOccurrences.filter(o => (o.student === student.nome || o.aluno === student.nome));
    
    if (studentOccurrences.length === 0) {
        container.innerHTML = '<div class="text-center py-6 text-text-secondary text-body-md italic">Nenhuma ocorrência registrada para este aluno.</div>';
        return;
    }
    
    container.innerHTML = studentOccurrences.map(o => {
        let color = 'border-primary text-primary bg-surface-container-low/50';
        const type = o.type || o.tipo || 'Ocorrência';
        const desc = o.desc || o.descricao || '';
        const date = o.date || o.data || '';
        const status = o.status || 'Em Análise';
        
        if (['Indisciplina', 'Atraso'].indexOf(type) >= 0) color = 'border-tertiary text-tertiary bg-surface-container-low/50';
        if (['Evasão', 'Evasao', 'Agressão Física', 'Agressao Fisica', 'Suspensão', 'Suspensao', 'Bullying'].indexOf(type) >= 0) color = 'border-error text-error bg-surface-container-low/50';
        
        let displayDate = date;
        if (date.includes('-')) {
            const parts = date.split('-');
            displayDate = `${parts[2]}/${parts[1]}/${parts[0]}`;
        } else if (date.includes('T')) {
            const parts = date.split('T')[0].split('-');
            displayDate = `${parts[2]}/${parts[1]}/${parts[0]}`;
        }
        
        return `
            <div class="flex gap-4 p-3 rounded-lg border-l-4 ${color}">
                <div class="flex-1">
                    <div class="flex justify-between items-start mb-1">
                        <span class="text-label-md font-bold uppercase">${type}</span>
                        <div class="flex items-center gap-2">
                            <span class="text-xs px-2 py-0.5 rounded-full font-bold bg-white/70">${status}</span>
                            <span class="text-label-sm text-text-secondary">${displayDate}</span>
                        </div>
                    </div>
                    <p class="text-body-md text-on-surface leading-tight">${desc}</p>
                </div>
            </div>
        `;
    }).join('');
}

// Timeline rendering of class changes
function renderClassHistory(student) {
    const container = document.getElementById('class-history-container');
    if (!container) return;

    let html = `
        <div class="relative space-y-8 before:absolute before:inset-0 before:ml-5 before:-translate-x-px before:h-full before:w-0.5 before:bg-gradient-to-b before:from-primary before:via-primary-light before:to-transparent">
            <!-- Active / Current Class -->
            <div class="relative flex items-center justify-between gap-6 group">
                <div class="flex items-center gap-6">
                    <div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 border-primary bg-surface-container-lowest shadow-sm z-10">
                        <span class="material-symbols-outlined text-[20px] text-primary">school</span>
                    </div>
                    <div>
                        <p class="text-label-md font-bold text-primary">Atual</p>
                        <h4 class="text-body-md font-medium text-on-surface">${formatStudentTurmaLabel(student)}</h4>
                    </div>
                </div>
            </div>
    `;

    // Render historical changes
    const history = student.classHistory || [];
    if (history.length === 0) {
        html += `
            <div class="relative flex items-center gap-6 opacity-70">
                <div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 border-border-subtle bg-surface-container-lowest shadow-sm z-10">
                    <span class="material-symbols-outlined text-[20px] text-text-secondary">history</span>
                </div>
                <p class="text-body-md text-text-secondary">Nenhuma mudança de turma registrada.</p>
            </div>
        `;
    } else {
        history.forEach(h => {
            const year = h.date ? h.date.split('-')[0] : 'Histórico';
            html += `
                <div class="relative flex items-center justify-between gap-6 group cursor-pointer hover:bg-surface-container-low/50 p-2 -mx-2 rounded-lg transition-all" onclick="openHistoryDetailModal('${(h.turmaAnterior || '').replace(/'/g, "\\'")}', '${(h.justificativa || '').replace(/'/g, "\\'")}')">
                    <div class="flex items-center gap-6">
                        <div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 border-border-subtle bg-surface-container-lowest shadow-sm z-10 group-hover:border-primary transition-colors">
                            <span class="material-symbols-outlined text-[20px] text-text-secondary group-hover:text-primary transition-colors">history</span>
                        </div>
                        <div>
                            <p class="text-label-md font-bold text-text-secondary group-hover:text-primary transition-colors">${year}</p>
                            <h4 class="text-body-md font-medium text-on-surface">Anterior: ${h.turmaAnterior || '—'}</h4>
                        </div>
                    </div>
                    <span class="material-symbols-outlined text-text-secondary text-[20px] mr-2">visibility</span>
                </div>
            `;
        });
    }

    html += `</div>`;
    container.innerHTML = html;
}

// Modal for Changing Class
function openChangeClassModal() {
    let modal = document.getElementById('siga-modal-change-class');
    if (modal) modal.remove();

    const urlParams = new URLSearchParams(window.location.search);
    const studentId = urlParams.get('id') || '';
    
    const students = JSON.parse(localStorage.getItem('siga_students')) || [];
    const student = students.find(s => String(s.id) === String(studentId));
    if (!student) return;

    const classes = (typeof getClasses === 'function' ? getClasses() : JSON.parse(localStorage.getItem('siga_classes') || '[]')) || [];
    const currentClassText = formatStudentTurmaLabel(student);

    modal = document.createElement('div');
    modal.id = 'siga-modal-change-class';
    modal.className = 'fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-on-background/40 backdrop-blur-sm';
    
    modal.innerHTML = `
        <div class="bg-background-surface w-full max-w-md rounded-2xl shadow-2xl overflow-hidden border border-border-subtle flex flex-col animate-in fade-in zoom-in duration-200" style="font-family: 'Inter', sans-serif;">
            <div class="p-6 border-b border-border-subtle flex justify-between items-center bg-surface-container-low/30">
                <div class="flex items-center gap-3">
                    <div class="w-10 h-10 bg-primary/10 text-primary rounded-full flex items-center justify-center">
                        <span class="material-symbols-outlined">swap_horiz</span>
                    </div>
                    <h3 class="font-headline-sm text-on-surface font-semibold">Mudar de Turma</h3>
                </div>
                <button class="p-1.5 hover:bg-surface-container-low rounded-full transition-colors text-text-secondary" onclick="document.getElementById('siga-modal-change-class').remove()">
                    <span class="material-symbols-outlined text-[20px]">close</span>
                </button>
            </div>
            <form class="p-6 space-y-4">
                <div>
                    <label class="block text-label-md font-bold text-on-surface mb-1">Turma Atual</label>
                    <input type="text" class="w-full border border-border-subtle bg-surface-container-low rounded-lg px-4 py-2 text-body-md outline-none cursor-not-allowed text-text-secondary" readonly value="${currentClassText}">
                </div>
                <div>
                    <label class="block text-label-md font-bold text-on-surface mb-1">Nova Turma</label>
                    <select id="new-turma-select" class="w-full border border-border-subtle rounded-lg px-4 py-2 text-body-md focus:border-primary focus:ring-2 focus:ring-primary/10 outline-none transition-all">
                        ${classes.map(c => `<option value="${c.code}">${c.code} - ${c.serie} (${c.turno})</option>`).join('')}
                    </select>
                </div>
                <div>
                    <label class="block text-label-md font-bold text-on-surface mb-1">Justificativa da Mudança</label>
                    <textarea id="change-justification" rows="3" class="w-full border border-border-subtle rounded-lg px-4 py-2 text-body-md focus:border-primary focus:ring-2 focus:ring-primary/10 outline-none transition-all" placeholder="Escreva a justificativa para a mudança de turma..." required></textarea>
                </div>
                <div class="flex items-center justify-end gap-3 pt-4 border-t border-border-subtle">
                    <button type="button" class="px-5 py-2.5 text-label-md font-bold text-text-secondary hover:bg-surface-container-low rounded-lg transition-colors" onclick="document.getElementById('siga-modal-change-class').remove()">Cancelar</button>
                    <button type="submit" class="px-6 py-2.5 bg-primary text-white rounded-lg font-bold shadow-lg shadow-primary/20 hover:brightness-90 transition-all active:scale-95">Salvar</button>
                </div>
            </form>
        </div>
    `;
    document.body.appendChild(modal);

    modal.querySelector('form').addEventListener('submit', (e) => {
        e.preventDefault();
        const newClassCode = document.getElementById('new-turma-select').value;
        const justification = document.getElementById('change-justification').value;

        const targetClass = classes.find(c => c.code === newClassCode);
        if (!targetClass) return;

        const newTurmaName = targetClass.code;
        const newTurno = targetClass.turno;
        const fullNewTurma = `${targetClass.code} - ${targetClass.serie} (${targetClass.turno})`;

        // Save class change in student object
        const currentStudents = JSON.parse(localStorage.getItem('siga_students')) || [];
        const index = currentStudents.findIndex(s => String(s.id) === String(studentId));
        if (index !== -1) {
            const currentStudent = currentStudents[index];
            if (!currentStudent.classHistory) {
                currentStudent.classHistory = [];
            }
            
            // Add change record to history
            const historyRecord = {
                id: Date.now().toString(),
                date: new Date().toISOString().split('T')[0],
                turmaAnterior: currentClassText,
                turmaNova: fullNewTurma,
                justificativa: justification
            };
            currentStudent.classHistory.unshift(historyRecord);

            // Update student current class & shift
            currentStudent.turma = newTurmaName;
            currentStudent.turno = newTurno;
            currentStudent.serie = targetClass.serie || currentStudent.serie || '';

            localStorage.setItem('siga_students', JSON.stringify(currentStudents));
        }

        modal.remove();
        showToast('Turma alterada com sucesso!');
        setTimeout(() => {
            window.location.reload();
        }, 500);
    });
}

// Modal for Class History details
function openHistoryDetailModal(turmaAnterior, justificativa) {
    let modal = document.getElementById('siga-modal-history-detail');
    if (modal) modal.remove();

    modal = document.createElement('div');
    modal.id = 'siga-modal-history-detail';
    modal.className = 'fixed inset-0 z-[10001] flex items-center justify-center p-4 bg-on-background/40 backdrop-blur-sm';
    
    modal.innerHTML = `
        <div class="bg-background-surface w-full max-w-sm rounded-2xl shadow-2xl overflow-hidden border border-border-subtle p-6 space-y-4 animate-in fade-in zoom-in duration-200" style="font-family: 'Inter', sans-serif;">
            <div class="flex justify-between items-center border-b border-border-subtle pb-3">
                <h3 class="font-headline-sm text-on-surface font-semibold">Histórico de Turma</h3>
                <button class="p-1.5 hover:bg-surface-container-low rounded-full transition-colors text-text-secondary" onclick="document.getElementById('siga-modal-history-detail').remove()">
                    <span class="material-symbols-outlined text-[20px]">close</span>
                </button>
            </div>
            <div class="space-y-3 py-2 text-body-md text-on-surface">
                <div>
                    <span class="block text-label-sm text-text-secondary uppercase tracking-wider font-bold mb-1">Turma Anterior</span>
                    <p class="font-semibold text-primary">${turmaAnterior}</p>
                </div>
                <div>
                    <span class="block text-label-sm text-text-secondary uppercase tracking-wider font-bold mb-1">Justificativa da Mudança</span>
                    <p class="bg-surface-container-low p-3 rounded-lg text-body-md border border-border-subtle leading-tight whitespace-pre-wrap">${justificativa}</p>
                </div>
            </div>
            <div class="flex justify-end pt-2">
                <button class="px-5 py-2.5 bg-primary text-white rounded-lg font-bold shadow-lg shadow-primary/20 hover:brightness-90 transition-all" onclick="document.getElementById('siga-modal-history-detail').remove()">Fechar</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
}

// 9. Bulletins and file listing options
window.toggleBoletimMenu = function(button) {
    const dropdown = button.nextElementSibling;
    if (!dropdown) return;
    
    // Auto-close other dropdowns
    document.querySelectorAll('.boletim-actions-dropdown .dropdown-menu').forEach(m => {
        if (m !== dropdown) m.classList.add('hidden');
    });

    dropdown.classList.toggle('hidden');
};

window.viewBoletim = function(name) {
    let viewer = document.getElementById('siga-boletim-viewer');
    if (viewer) viewer.remove();

    viewer = document.createElement('div');
    viewer.id = 'siga-boletim-viewer';
    viewer.className = 'fixed inset-0 z-[10007] flex items-center justify-center p-4 bg-on-background/55 backdrop-blur-sm';
    viewer.innerHTML = `
        <div class="bg-background-surface w-full max-w-4xl h-[85vh] rounded-2xl shadow-2xl overflow-hidden border border-border-subtle flex flex-col" style="font-family: 'Inter', sans-serif;">
            <div class="p-6 border-b border-border-subtle flex justify-between items-center bg-surface-container-low/30">
                <div class="flex items-center gap-3">
                    <span class="material-symbols-outlined text-primary text-2xl">picture_as_pdf</span>
                    <h3 class="font-headline-sm text-on-surface font-semibold">${name}</h3>
                </div>
                <button class="p-1.5 hover:bg-surface-container-low rounded-full transition-colors text-text-secondary" onclick="document.getElementById('siga-boletim-viewer').remove()">
                    <span class="material-symbols-outlined text-[20px]">close</span>
                </button>
            </div>
            <div class="flex-1 bg-surface-container overflow-y-auto p-8 flex flex-col items-center justify-start gap-8">
                <div class="w-full max-w-2xl bg-white border border-border-subtle p-12 shadow-md rounded-lg flex flex-col gap-6 font-sans text-on-surface" id="printable-boletim-area">
                    <div class="flex justify-between items-center border-b border-primary/20 pb-4">
                        <div class="flex items-center gap-2">
                            <span class="material-symbols-outlined text-primary text-3xl">school</span>
                            <div>
                                <h1 class="font-bold text-headline-sm text-primary uppercase leading-tight">SIGA EDUCA</h1>
                                <p class="text-[10px] text-text-secondary tracking-widest font-bold">SISTEMA INTEGRADO DE GESTÃO ACADÊMICA</p>
                            </div>
                        </div>
                        <div class="text-right">
                            <p class="font-bold text-body-md text-on-surface">BOLETIM ESCOLAR OFICIAL</p>
                            <p class="text-label-sm text-text-secondary">Ano Letivo: 2026</p>
                        </div>
                    </div>
                    
                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 text-body-md border-b border-border-subtle pb-4">
                        <div>
                            <p class="text-text-secondary text-[11px] uppercase font-bold">Aluno(a)</p>
                            <p class="font-semibold" id="pdf-student-name">Ana Beatriz Oliveira da Silva</p>
                        </div>
                        <div>
                            <p class="text-text-secondary text-[11px] uppercase font-bold">CPF</p>
                            <p class="font-semibold" id="pdf-student-cpf">123.456.789-01</p>
                        </div>
                        <div>
                            <p class="text-text-secondary text-[11px] uppercase font-bold">Turma / Turno</p>
                            <p class="font-semibold" id="pdf-student-class">3º Ano A - Matutino</p>
                        </div>
                        <div>
                            <p class="text-text-secondary text-[11px] uppercase font-bold">Instituição</p>
                            <p class="font-semibold">EMEF Dom Pedro I</p>
                        </div>
                    </div>

                    <table class="w-full border-collapse border border-border-subtle text-left text-body-md">
                        <thead>
                            <tr class="bg-surface-container-low border-b border-border-subtle">
                                <th class="border border-border-subtle px-4 py-2 font-bold text-[11px] uppercase text-text-secondary">Componente Curricular</th>
                                <th class="border border-border-subtle px-2 py-2 font-bold text-[11px] uppercase text-text-secondary text-center">1º Bim</th>
                                <th class="border border-border-subtle px-2 py-2 font-bold text-[11px] uppercase text-text-secondary text-center">2º Bim</th>
                                <th class="border border-border-subtle px-2 py-2 font-bold text-[11px] uppercase text-text-secondary text-center">3º Bim</th>
                                <th class="border border-border-subtle px-2 py-2 font-bold text-[11px] uppercase text-text-secondary text-center">4º Bim</th>
                                <th class="border border-border-subtle px-2 py-2 font-bold text-[11px] uppercase text-text-secondary text-center">Faltas</th>
                                <th class="border border-border-subtle px-2 py-2 font-bold text-[11px] uppercase text-text-secondary text-center">Média</th>
                                <th class="border border-border-subtle px-2 py-2 font-bold text-[11px] uppercase text-text-secondary text-center">Situação</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td class="border border-border-subtle px-4 py-2 font-medium">Língua Portuguesa</td>
                                <td class="border border-border-subtle px-2 py-2 text-center">8.5</td>
                                <td class="border border-border-subtle px-2 py-2 text-center">9.0</td>
                                <td class="border border-border-subtle px-2 py-2 text-center">-</td>
                                <td class="border border-border-subtle px-2 py-2 text-center">-</td>
                                <td class="border border-border-subtle px-2 py-2 text-center">2</td>
                                <td class="border border-border-subtle px-2 py-2 text-center font-bold">8.8</td>
                                <td class="border border-border-subtle px-2 py-2 text-center text-primary font-bold">Aprovado</td>
                            </tr>
                            <tr>
                                <td class="border border-border-subtle px-4 py-2 font-medium">Matemática</td>
                                <td class="border border-border-subtle px-2 py-2 text-center">7.0</td>
                                <td class="border border-border-subtle px-2 py-2 text-center">7.5</td>
                                <td class="border border-border-subtle px-2 py-2 text-center">-</td>
                                <td class="border border-border-subtle px-2 py-2 text-center">-</td>
                                <td class="border border-border-subtle px-2 py-2 text-center">4</td>
                                <td class="border border-border-subtle px-2 py-2 text-center font-bold">7.3</td>
                                <td class="border border-border-subtle px-2 py-2 text-center text-primary font-bold">Aprovado</td>
                            </tr>
                        </tbody>
                    </table>

                    <div class="mt-8 flex justify-between items-end border-t border-border-subtle pt-6 text-[10px] text-text-secondary">
                        <div>
                            <p>Documento autenticado eletronicamente em conformidade com as diretrizes do SIGA.</p>
                            <p>Código de Validação: 48F29A38E7</p>
                        </div>
                        <div class="text-center border-t border-on-surface/30 w-44 pt-1">
                            <p class="font-bold text-on-surface">Secretaria Geral</p>
                            <p>Assinatura Digitalizada</p>
                        </div>
                    </div>
                </div>
            </div>
            <div class="p-6 flex justify-end gap-4 border-t border-border-subtle bg-surface-container-low/30">
                <button class="px-5 py-2.5 text-label-md font-bold text-text-secondary hover:bg-surface-container-low rounded-lg transition-colors" onclick="document.getElementById('siga-boletim-viewer').remove()">Fechar</button>
                <button class="px-6 py-2.5 bg-primary text-white rounded-lg font-bold shadow-lg shadow-primary/20 hover:brightness-90 transition-all flex items-center gap-2" onclick="printBoletim('${name}')">
                    <span class="material-symbols-outlined">print</span>
                    <span>Imprimir Boletim</span>
                </button>
            </div>
        </div>
    `;
    document.body.appendChild(viewer);

    const urlParams = new URLSearchParams(window.location.search);
    const studentId = urlParams.get('id') || '1';
    const students = JSON.parse(localStorage.getItem('siga_students')) || [];
    const student = students.find(s => s.id === studentId);
    if (student) {
        document.getElementById('pdf-student-name').textContent = student.nome;
        document.getElementById('pdf-student-cpf').textContent = student.cpf;
        document.getElementById('pdf-student-class').textContent = formatStudentTurmaLabel(student);
    }
};

window.printBoletim = function(name) {
    const printableArea = document.getElementById('printable-boletim-area');
    let printContents = '';
    if (printableArea) {
        printContents = printableArea.innerHTML;
    } else {
        const urlParams = new URLSearchParams(window.location.search);
        const studentId = urlParams.get('id') || '1';
        const students = JSON.parse(localStorage.getItem('siga_students')) || [];
        const student = students.find(s => s.id === studentId) || { nome: "—", cpf: "—", turma: "—", turno: "—" };
        
        printContents = `
            <div style="font-family: Arial, sans-serif; padding: 40px; color: #333; max-width: 800px; margin: 0 auto; border: 1px solid #ccc;">
                <h1 style="color: #006633; border-bottom: 2px solid #006633; padding-bottom: 10px;">SIGA EDUCA - BOLETIM ESCOLAR</h1>
                <p><strong>Aluno:</strong> ${student.nome}</p>
                <p><strong>CPF:</strong> ${student.cpf}</p>
                <p><strong>Turma/Turno:</strong> ${formatStudentTurmaLabel(student)}</p>
                <p><strong>Arquivo:</strong> ${name}</p>
            </div>
        `;
    }

    const printWindow = window.open('', '_blank');
    printWindow.document.write(`
        <html>
            <head>
                <title>Imprimir - ${name}</title>
                <style>
                    body { font-family: Arial, sans-serif; padding: 20px; }
                    table { width: 100%; border-collapse: collapse; margin-top: 20px; }
                    th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
                    th { background-color: #f2f2f2; }
                    .text-center { text-align: center; }
                    .font-bold { font-weight: bold; }
                </style>
            </head>
            <body onload="window.print(); window.close();">
                ${printContents}
            </body>
        </html>
    `);
    printWindow.document.close();
    showToast('Boletim enviado para fila de impressão!');
};

// Global click listener to close dropdown when clicking outside
document.addEventListener('click', (e) => {
    if (!e.target.closest('.boletim-actions-dropdown')) {
        document.querySelectorAll('.boletim-actions-dropdown .dropdown-menu').forEach(m => m.classList.add('hidden'));
    }
});

// Avatar camera options and camera modal
window.openHistoryDetailModal = openHistoryDetailModal;

// ==========================================
// 10. TURMAS (CLASSES) DATABASE LAYER
// ==========================================

function getClasses() {
    let classes = JSON.parse(localStorage.getItem('siga_classes'));
    if (!classes) {
        classes = [];
        localStorage.setItem('siga_classes', JSON.stringify(classes));
    }
    // Garante marcação AEE nas turmas especializadas
    let touched = false;
    classes = classes.map((c) => {
        const code = String(c.code || '').toUpperCase();
        if ((code === 'EEMAE01' || code === 'EETAE01') && c.modalidade !== 'AEE') {
            touched = true;
            return Object.assign({}, c, { modalidade: 'AEE', serie: c.serie || 'AEE' });
        }
        return c;
    });
    if (touched) localStorage.setItem('siga_classes', JSON.stringify(classes));
    return classes;
}

function isAeeClassCode(code) {
    if (window.SigaSchoolData && typeof window.SigaSchoolData.isAeeClassCode === 'function') {
        return window.SigaSchoolData.isAeeClassCode(code);
    }
    return /^(EEMAE01|EETAE01)$/i.test(String(code || '').trim());
}

function studentBelongsToClass(student, classCode) {
    if (window.SigaSchoolData && typeof window.SigaSchoolData.studentInClass === 'function') {
        return window.SigaSchoolData.studentInClass(student, classCode);
    }
    const code = String(classCode || '').trim().toUpperCase();
    if (!student || !code) return false;
    if (String(student.turma || '').trim().toUpperCase() === code) return true;
    const aee = Array.isArray(student.aeeTurmas) ? student.aeeTurmas : [];
    return aee.some((c) => String(c || '').trim().toUpperCase() === code);
}

function countStudentsInClass(students, classCode) {
    return (students || []).filter((s) => studentBelongsToClass(s, classCode)).length;
}

function studentAeeLabel(student) {
    const aee = Array.isArray(student && student.aeeTurmas) ? student.aeeTurmas.filter(Boolean) : [];
    return aee.length ? aee.join(', ') : '';
}

function getRegularClasses() {
    return getClasses().filter((c) => !isAeeClassCode(c.code) && String(c.modalidade || '').toUpperCase() !== 'AEE');
}

function getAeeClasses() {
    const fromDb = getClasses().filter((c) => isAeeClassCode(c.code) || String(c.modalidade || '').toUpperCase() === 'AEE');
    const codes = new Set(fromDb.map((c) => String(c.code || '').toUpperCase()));
    ['EEMAE01', 'EETAE01'].forEach((code) => {
        if (!codes.has(code)) {
            fromDb.push({ code, serie: 'AEE', turno: '', modalidade: 'AEE', status: 'Ativo', anoLetivo: '2026' });
        }
    });
    return fromDb;
}

function buildAeeCheckboxesHtml(selected) {
    const selectedSet = new Set((selected || []).map((c) => String(c || '').toUpperCase()));
    return getAeeClasses().map((c) => {
        const code = String(c.code || '').toUpperCase();
        const checked = selectedSet.has(code) ? 'checked' : '';
        return (
            `<label class="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-border-subtle bg-surface-container-low/40 text-label-md">` +
            `<input type="checkbox" class="std-aee-check accent-primary" value="${code}" ${checked}/>` +
            `<span><strong>${code}</strong> <span class="text-text-secondary">(AEE)</span></span>` +
            `</label>`
        );
    }).join('');
}

function readSelectedAeeCodes() {
    return Array.from(document.querySelectorAll('.std-aee-check:checked')).map((el) => el.value);
}

window.updateStudentModalTurno = function(selectEl) {
    const classCode = selectEl.value;
    const classes = getClasses();
    const cls = classes.find(c => c.code === classCode);
    const turnoInput = document.getElementById('std-turno');
    const serieInput = document.getElementById('std-serie');
    if (turnoInput && cls) {
        turnoInput.value = cls.turno;
    }
    if (serieInput && cls) {
        serieInput.value = cls.serie || '';
    }
};

function initTurmasPage() {
    getClasses(); // Seed database if needed
    refreshTurmasFilters();
    renderClasses();

    const importInput = document.getElementById('import-turmas-csv');
    if (importInput) {
        importInput.addEventListener('change', (e) => {
            const file = e.target.files && e.target.files[0];
            if (file) importTurmasFromCsv(file);
            e.target.value = '';
        });
    }

    // Close action menus when clicking outside
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.gerenciar-actions-wrapper')) {
            document.querySelectorAll('.gerenciar-actions-dropdown').forEach(m => m.classList.add('hidden'));
        }
    });

    if (window.SigaSchoolData && typeof window.SigaSchoolData.hydrateClasses === 'function') {
        window.SigaSchoolData.hydrateClasses().then((res) => {
            if (res && res.ok && !res.skipped) {
                refreshTurmasFilters();
                renderClasses();
            } else if (res && !res.ok) {
                console.warn('[SIGA] turmas hydrate:', res.message);
            }
        });
    }
}

function refreshTurmasFilters() {
    const classes = getClasses();
    const anoSel = document.getElementById('filter-ano-letivo');
    const serieSel = document.getElementById('filter-serie');
    const turnoSel = document.getElementById('filter-turno');

    const anos = [...new Set(classes.map(c => String(c.anoLetivo || '2026')).filter(Boolean))].sort();
    const series = [...new Set(classes.map(c => c.serie).filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b), 'pt-BR'));
    const turnos = [...new Set(classes.map(c => c.turno).filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b), 'pt-BR'));

    if (anoSel) {
        const current = anoSel.value;
        anoSel.innerHTML = '';
        const allOpt = document.createElement('option');
        allOpt.value = 'Todos';
        allOpt.textContent = 'Todos';
        anoSel.appendChild(allOpt);
        (anos.length ? anos : ['2026']).forEach(ano => {
            const opt = document.createElement('option');
            opt.value = ano;
            opt.textContent = ano;
            anoSel.appendChild(opt);
        });
        if ([...anoSel.options].some(o => o.value === current)) anoSel.value = current;
        else if (anos.includes('2026')) anoSel.value = '2026';
        else anoSel.value = 'Todos';
    }

    if (serieSel) {
        const current = serieSel.value;
        serieSel.innerHTML = '<option value="Todas as Séries">Todas as Séries</option>';
        series.forEach(s => {
            const opt = document.createElement('option');
            opt.value = s;
            opt.textContent = s;
            serieSel.appendChild(opt);
        });
        if ([...serieSel.options].some(o => o.value === current)) serieSel.value = current;
    }

    if (turnoSel) {
        const current = turnoSel.value;
        turnoSel.innerHTML = '<option value="Todos os Turnos">Todos os Turnos</option>';
        turnos.forEach(t => {
            const opt = document.createElement('option');
            opt.value = t;
            opt.textContent = t;
            turnoSel.appendChild(opt);
        });
        if ([...turnoSel.options].some(o => o.value === current)) turnoSel.value = current;
    }
}

function getTurmasOverviewStats(classes, students) {
    const CAPACIDADE_POR_TURMA = 35;
    const ativas = classes.filter(c => String(c.status || 'Ativo').toLowerCase() !== 'inativo');
    const codes = new Set(ativas.map(c => c.code));
    const enrolled = students.filter(s => codes.has(s.turma) && String(s.status || 'Ativo').toLowerCase() !== 'inativo');

    const freqs = enrolled.map(s => Number(s.frequencia)).filter(n => !isNaN(n) && n >= 0);
    const avgFreq = freqs.length
        ? (freqs.reduce((a, b) => a + b, 0) / freqs.length)
        : null;

    const slots = ativas.length * CAPACIDADE_POR_TURMA;
    const capacityPct = slots > 0
        ? Math.min(100, Math.round((enrolled.length / slots) * 100))
        : null;

    let diasLetivos = null;
    try {
        const days = typeof getCalendarDays === 'function' ? getCalendarDays() : {};
        const today = new Date();
        today.setHours(23, 59, 59, 999);
        const count = Object.entries(days || {}).filter(([dateStr, info]) => {
            if (!info || info.type !== 'letivo') return false;
            const d = new Date(dateStr + 'T12:00:00');
            return !isNaN(d.getTime()) && d <= today;
        }).length;
        diasLetivos = count;
    } catch (e) {
        diasLetivos = null;
    }

    return {
        ativas: ativas.length,
        enrolled: enrolled.length,
        avgFreq,
        capacityPct,
        diasLetivos
    };
}

function downloadModeloTurmasCsv() {
    const header = 'codigo;serie;turno;modalidade;status;anoLetivo';
    const example = 'M1MNM01;1o ano do ensino médio;Manhã;Ensino Médio;Ativo;2026';
    const blob = new Blob(['\uFEFF' + header + '\n' + example + '\n'], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'modelo-turmas-siga.csv';
    a.click();
    URL.revokeObjectURL(a.href);
    showToast('Modelo de planilha de turmas baixado.');
}

function normalizeTurnoTurma(raw) {
    const t = String(raw || '').trim().toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    if (t.startsWith('manh') || t === 'matutino') return 'Manhã';
    if (t.startsWith('tard') || t === 'vespertino') return 'Tarde';
    if (t.startsWith('noit') || t === 'noturno') return 'Noite';
    if (t.startsWith('integ')) return 'Integral';
    return String(raw || '').trim() || 'Manhã';
}

function inferModalidadeTurma(serie, modalidade) {
    const m = String(modalidade || '').trim();
    if (m) {
        if (/^aee$/i.test(m) || /atendimento educacional/i.test(m)) return 'AEE';
        return m;
    }
    const s = String(serie || '').toLowerCase();
    if (s.includes('eja')) return 'EJA';
    if (s.includes('fluxo') || s.includes('correcao') || s.includes('correção')) return 'Fluxo';
    if (s.includes('especial') || s === 'aee') return 'AEE';
    return 'Ensino Médio';
}

function importTurmasFromCsv(file) {
    const reader = new FileReader();
    reader.onload = async () => {
        try {
            const text = String(reader.result || '');
            const lines = text.split(/\r?\n/).filter(l => l.trim());
            if (lines.length < 2) {
                showToast('Planilha vazia ou sem dados.', 'error');
                return;
            }
            const sep = lines[0].includes(';') ? ';' : ',';
            const headers = parseCsvLine(lines[0], sep).map(normalizeCsvHeader);
            const idx = (aliases) => {
                for (const a of aliases) {
                    const i = headers.indexOf(a);
                    if (i !== -1) return i;
                }
                return -1;
            };

            const map = {
                codigo: idx(['codigo', 'codigoturma', 'turma', 'code']),
                serie: idx(['serie', 'serieano']),
                turno: idx(['turno', 'periodo', 'period']),
                modalidade: idx(['modalidade', 'tipo', 'modalidadedeensino']),
                status: idx(['status', 'situacao']),
                anoLetivo: idx(['anoletivo', 'anol'])
            };

            if (map.codigo < 0) {
                showToast('A planilha precisa da coluna Codigo (código da turma).', 'error');
                return;
            }

            let classes = getClasses();
            let added = 0;
            let updated = 0;

            for (let r = 1; r < lines.length; r++) {
                const cols = parseCsvLine(lines[r], sep);
                if (!cols.length || cols.every(c => !c)) continue;
                const get = (key) => (map[key] >= 0 ? (cols[map[key]] || '').trim() : '');

                const code = get('codigo').split(' - ')[0].trim().toUpperCase();
                if (!code) continue;

                const serie = get('serie') || '1o ano do ensino médio';
                const turno = normalizeTurnoTurma(get('turno'));
                let modalidade = inferModalidadeTurma(serie, get('modalidade'));
                if (isAeeClassCode(code)) {
                    modalidade = 'AEE';
                }
                const statusRaw = get('status');
                const status = !statusRaw || /ativo|active/i.test(statusRaw) ? 'Ativo' : 'Inativo';
                const anoLetivo = get('anoLetivo') || '2026';

                const payload = { code, serie: isAeeClassCode(code) ? (get('serie') || 'AEE') : serie, turno, modalidade, status, anoLetivo };
                const existingIdx = classes.findIndex(c => (c.code || '').toLowerCase() === code.toLowerCase() && String(c.anoLetivo || '2026') === String(anoLetivo));

                if (existingIdx >= 0) {
                    classes[existingIdx] = { ...classes[existingIdx], ...payload, code: classes[existingIdx].code };
                    updated++;
                } else {
                    classes.push(payload);
                    added++;
                }
            }

            localStorage.setItem('siga_classes', JSON.stringify(classes));
            refreshTurmasFilters();
            renderClasses();

            const localMsg = `Importação local: ${added} novas, ${updated} atualizadas.`;
            if (window.SigaSchoolData && typeof window.SigaSchoolData.upsertClasses === 'function') {
                showToast('Sincronizando turmas com o banco…');
                const cloud = await window.SigaSchoolData.upsertClasses(classes);
                if (cloud && cloud.ok) {
                    refreshTurmasFilters();
                    renderClasses();
                    showToast(`${localMsg} Gravado no Supabase.`);
                } else {
                    showToast(
                        `${localMsg} Banco: ${(cloud && cloud.message) || 'não sincronizado (verifique login Supabase e escola ativa).'}`,
                        'error'
                    );
                }
            } else {
                showToast(localMsg);
            }
        } catch (err) {
            console.error(err);
            showToast('Falha ao importar a planilha de turmas.', 'error');
        }
    };
    reader.readAsText(file, 'UTF-8');
}

window.downloadModeloTurmasCsv = downloadModeloTurmasCsv;
window.importTurmasFromCsv = importTurmasFromCsv;

function renderClasses(filteredClasses = null) {
    const grid = document.getElementById('classes-grid');
    const tbody = document.getElementById('classes-tbody');
    if (!grid && !tbody) return;

    const classes = filteredClasses || getClasses();
    const students = JSON.parse(localStorage.getItem('siga_students')) || [];

    if (grid) {
        let gridHtml = '';
        classes.forEach(c => {
            const enrolledCount = countStudentsInClass(students, c.code);
            const badgeColor = c.status === 'Ativo' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700';
            const modalidadeBadge = c.modalidade === 'AEE'
                ? 'bg-violet-100 text-violet-800'
                : c.modalidade === 'EJA'
                    ? 'bg-amber-100 text-amber-800'
                    : c.modalidade === 'Fluxo'
                        ? 'bg-indigo-100 text-indigo-800'
                        : 'bg-primary-light/20 text-primary';

            gridHtml += `
                <div class="glass-card rounded-[16px] overflow-hidden flex flex-col hover:shadow-lg transition-all border border-border-subtle group">
                    <div class="p-6">
                        <div class="flex justify-between items-start mb-4">
                            <div>
                                <span class="px-3 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider ${modalidadeBadge}">${c.modalidade}</span>
                                <h3 class="font-headline-md text-headline-md mt-2 text-on-surface group-hover:text-primary transition-colors">Turma ${c.code}</h3>
                            </div>
                            <span class="${badgeColor} px-2 py-1 rounded-md text-[10px] font-bold flex items-center gap-1">
                                <span class="w-1.5 h-1.5 ${c.status === 'Ativo' ? 'bg-green-500' : 'bg-red-500'} rounded-full"></span> ${c.status.toUpperCase()}
                            </span>
                        </div>
                        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
                            <div class="bg-surface-container-low p-3 rounded-xl border border-border-subtle/30">
                                <p class="text-[10px] text-text-secondary uppercase font-bold mb-1">Turno</p>
                                <p class="text-body-md font-semibold text-on-surface">${c.turno}</p>
                            </div>
                            <div class="bg-surface-container-low p-3 rounded-xl border border-border-subtle/30">
                                <p class="text-[10px] text-text-secondary uppercase font-bold mb-1">Estudantes</p>
                                <p class="text-body-md font-semibold text-on-surface">${enrolledCount} / 35</p>
                            </div>
                        </div>
                        <div class="bg-surface-container-low p-3 rounded-xl border border-border-subtle/30">
                            <p class="text-[10px] text-text-secondary uppercase font-bold mb-1">Série / Ano</p>
                            <p class="text-body-md font-semibold text-on-surface">${c.serie}</p>
                        </div>
                    </div>
                    <div class="mt-auto border-t border-border-subtle bg-surface-container-lowest p-4 flex gap-2">
                        <a class="flex-1 flex items-center justify-center gap-2 bg-surface-container hover:bg-primary hover:text-white text-text-secondary px-3 py-2.5 rounded-lg text-[12px] font-bold transition-all" href="turmadetalhe.html?code=${c.code}">
                            <span class="material-symbols-outlined text-[18px]">visibility</span>
                            <span>Ver Lista</span>
                        </a>
                        <div class="relative gerenciar-actions-wrapper">
                            <button class="flex items-center justify-center border border-border-subtle hover:bg-surface-container text-text-secondary p-2.5 rounded-lg transition-colors" onclick="toggleGerenciarMenu(event, '${c.code}')">
                                <span class="material-symbols-outlined text-[18px]">settings</span>
                            </button>
                            <div id="dropdown-${c.code}" class="gerenciar-actions-dropdown hidden absolute right-0 bottom-12 w-40 bg-background-surface border border-border-subtle rounded-xl shadow-xl z-50 overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-150">
                                <button class="w-full text-left px-4 py-2.5 hover:bg-surface-container text-body-md font-medium text-on-surface flex items-center gap-2 transition-colors" onclick="openEditClassModal('${c.code}')">
                                    <span class="material-symbols-outlined text-[16px]">edit</span>
                                    <span>Editar Turma</span>
                                </button>
                                <button class="w-full text-left px-4 py-2.5 hover:bg-error/10 hover:text-error text-body-md font-medium text-on-surface flex items-center gap-2 border-t border-border-subtle transition-colors" onclick="deleteClass('${c.code}')">
                                    <span class="material-symbols-outlined text-[16px]">delete</span>
                                    <span>Excluir Turma</span>
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        });

        // Append Stats card (dados reais do sistema)
        const overviewSource = filteredClasses ? classes : getClasses();
        const stats = getTurmasOverviewStats(overviewSource, students);
        const freqText = stats.avgFreq != null
            ? `${stats.avgFreq.toFixed(1).replace('.', ',')}% de presença média registrada`
            : 'sem presença média registrada';
        const capacityText = stats.capacityPct != null ? `${stats.capacityPct}%` : '—';
        const freqCard = stats.avgFreq != null
            ? `${stats.avgFreq.toFixed(1).replace('.', ',')}%`
            : '—';
        const diasText = stats.diasLetivos != null ? String(stats.diasLetivos) : '—';

        gridHtml += `
            <div class="xl:col-span-2 bg-gradient-to-br from-primary to-primary-container rounded-[16px] p-8 text-on-primary flex flex-col justify-between shadow-xl relative overflow-hidden">
                <div class="absolute -right-20 -bottom-20 opacity-10">
                    <span class="material-symbols-outlined text-[300px]">school</span>
                </div>
                <div class="relative z-10">
                    <h3 class="font-headline-md text-headline-md mb-2">Visão Geral de Turmas</h3>
                    <p class="opacity-90 max-w-md">Você possui ${stats.ativas} turma${stats.ativas === 1 ? '' : 's'} ativa${stats.ativas === 1 ? '' : 's'} neste ano letivo, atendendo um total de ${stats.enrolled} aluno${stats.enrolled === 1 ? '' : 's'}${stats.avgFreq != null ? ' com ' + freqText : ', ' + freqText}.</p>
                </div>
                <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-8 relative z-10">
                    <div class="bg-white/10 backdrop-blur-sm p-4 rounded-xl">
                        <p class="text-[11px] uppercase font-bold opacity-80 mb-1">Capacidade Total</p>
                        <p class="text-2xl font-extrabold tracking-tight">${capacityText}</p>
                    </div>
                    <div class="bg-white/10 backdrop-blur-sm p-4 rounded-xl">
                        <p class="text-[11px] uppercase font-bold opacity-80 mb-1">Presença Média</p>
                        <p class="text-2xl font-extrabold tracking-tight">${freqCard}</p>
                    </div>
                    <div class="bg-white/10 backdrop-blur-sm p-4 rounded-xl">
                        <p class="text-[11px] uppercase font-bold opacity-80 mb-1">Dias Letivos</p>
                        <p class="text-2xl font-extrabold tracking-tight">${diasText}</p>
                    </div>
                </div>
            </div>
        `;
        grid.innerHTML = gridHtml;
    }

    if (tbody) {
        let tableHtml = '';
        if (!classes.length) {
            tableHtml = `
                <tr>
                    <td colspan="5" class="px-6 py-10 text-center text-body-md text-text-secondary">
                        Nenhuma turma cadastrada. Importe a planilha ou clique em Nova Turma.
                    </td>
                </tr>
            `;
        }
        classes.forEach(c => {
            const count = countStudentsInClass(students, c.code);
            const badgeColor = c.status === 'Ativo' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700';

            tableHtml += `
                <tr class="hover:bg-surface-container-low/50 transition-colors">
                    <td class="px-6 py-4">
                        <p class="font-semibold text-on-surface">Turma ${c.code}</p>
                        <p class="text-label-sm text-text-secondary">${c.turno}</p>
                    </td>
                    <td class="px-6 py-4 text-body-md text-on-surface">${c.serie}</td>
                    <td class="px-6 py-4 text-body-md text-on-surface font-semibold">${count}</td>
                    <td class="px-6 py-4">
                        <span class="${badgeColor} px-2 py-0.5 rounded text-[11px] font-bold">${c.status}</span>
                    </td>
                    <td class="px-6 py-4 text-right">
                        <div class="flex justify-end items-center gap-2">
                            <a class="text-primary hover:underline font-semibold text-label-md mr-3" href="turmadetalhe.html?code=${c.code}">Ver</a>
                            <div class="relative gerenciar-actions-wrapper">
                                <button class="text-primary hover:underline font-semibold text-label-md" onclick="toggleGerenciarMenu(event, '${c.code}')">Gerenciar</button>
                                <div id="dropdown-table-${c.code}" class="gerenciar-actions-dropdown hidden absolute right-0 mt-1 w-40 bg-background-surface border border-border-subtle rounded-xl shadow-xl z-50 overflow-hidden">
                                    <button class="w-full text-left px-4 py-2.5 hover:bg-surface-container text-body-md font-medium text-on-surface flex items-center gap-2 transition-colors" onclick="openEditClassModal('${c.code}')">
                                        <span class="material-symbols-outlined text-[16px]">edit</span>
                                        <span>Editar Turma</span>
                                    </button>
                                    <button class="w-full text-left px-4 py-2.5 hover:bg-error/10 hover:text-error text-body-md font-medium text-on-surface flex items-center gap-2 border-t border-border-subtle transition-colors" onclick="deleteClass('${c.code}')">
                                        <span class="material-symbols-outlined text-[16px]">delete</span>
                                        <span>Excluir Turma</span>
                                    </button>
                                </div>
                            </div>
                        </div>
                    </td>
                </tr>
            `;
        });
        
        tbody.innerHTML = tableHtml;
        
        const footerLabel = document.getElementById('classes-footer-label');
        if (footerLabel) {
            footerLabel.textContent = `Mostrando ${classes.length} de ${getClasses().length} turmas encontradas`;
        }
    }
}

window.toggleGerenciarMenu = function(event, classCode) {
    event.stopPropagation();
    document.querySelectorAll('.gerenciar-actions-dropdown').forEach(m => {
        if (m.id !== `dropdown-${classCode}` && m.id !== `dropdown-table-${classCode}`) {
            m.classList.add('hidden');
        }
    });
    const cardDrop = document.getElementById(`dropdown-${classCode}`);
    const tableDrop = document.getElementById(`dropdown-table-${classCode}`);
    if (cardDrop) cardDrop.classList.toggle('hidden');
    if (tableDrop) tableDrop.classList.toggle('hidden');
};

window.filterClasses = function() {
    const searchVal = (document.getElementById('search-classes')?.value || '').toLowerCase();
    const anoFilter = document.getElementById('filter-ano-letivo')?.value || 'Todos';
    const serieFilter = document.getElementById('filter-serie')?.value || 'Todas as Séries';
    const turnoFilter = document.getElementById('filter-turno')?.value || 'Todos os Turnos';

    const classes = getClasses();
    const filtered = classes.filter(c => {
        const matchesSearch = (c.code || '').toLowerCase().includes(searchVal) || (c.serie || '').toLowerCase().includes(searchVal);
        const matchesAno = anoFilter === 'Todos' || String(c.anoLetivo || '2026') === String(anoFilter);
        const matchesSerie = serieFilter === 'Todas as Séries' || c.serie === serieFilter;
        const matchesTurno = turnoFilter === 'Todos os Turnos' || c.turno === turnoFilter;
        return matchesSearch && matchesAno && matchesSerie && matchesTurno;
    });

    renderClasses(filtered);
};

window.openNewClassModal = function() {
    let modal = document.getElementById('siga-modal-class');
    if (modal) modal.remove();

    modal = document.createElement('div');
    modal.id = 'siga-modal-class';
    modal.className = 'fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-on-background/40 backdrop-blur-sm';

    modal.innerHTML = `
        <div class="bg-background-surface w-full max-w-md rounded-2xl shadow-2xl overflow-hidden border border-border-subtle animate-in fade-in zoom-in duration-200" style="font-family: 'Inter', sans-serif;">
            <div class="p-6 border-b border-border-subtle flex justify-between items-center bg-surface-container-low/30">
                <div class="flex items-center gap-3">
                    <div class="w-10 h-10 bg-primary/10 text-primary rounded-full flex items-center justify-center">
                        <span class="material-symbols-outlined">add_circle</span>
                    </div>
                    <h3 class="font-headline-sm text-on-surface font-semibold">Nova Turma (Ano 2026)</h3>
                </div>
                <button class="p-1.5 hover:bg-surface-container-low rounded-full transition-colors text-text-secondary" onclick="document.getElementById('siga-modal-class').remove()">
                    <span class="material-symbols-outlined text-[20px]">close</span>
                </button>
            </div>
            <form class="p-6 space-y-4">
                <div>
                    <label class="block text-label-md font-bold text-on-surface mb-1">Código da Turma</label>
                    <input type="text" id="cls-code" class="w-full border border-border-subtle rounded-lg px-4 py-2 text-body-md focus:border-primary focus:ring-2 focus:ring-primary/10 outline-none transition-all" placeholder="Ex: 3002" required>
                </div>
                <div>
                    <label class="block text-label-md font-bold text-on-surface mb-1">Turno</label>
                    <select id="cls-turno" class="w-full border border-border-subtle rounded-lg px-4 py-2 text-body-md focus:border-primary focus:ring-2 focus:ring-primary/10 outline-none transition-all">
                        <option value="Manhã">Manhã</option>
                        <option value="Tarde">Tarde</option>
                        <option value="Noite">Noite</option>
                    </select>
                </div>
                <div>
                    <label class="block text-label-md font-bold text-on-surface mb-1">Série / Ano</label>
                    <select id="cls-serie" class="w-full border border-border-subtle rounded-lg px-4 py-2 text-body-md focus:border-primary focus:ring-2 focus:ring-primary/10 outline-none transition-all">
                        <option value="1o ano do ensino médio">1o ano do ensino médio</option>
                        <option value="2o ano do ensino médio">2o ano do ensino médio</option>
                        <option value="3o ano do ensino médio">3o ano do ensino médio</option>
                        <option value="1a etapa EJA">1a etapa EJA</option>
                        <option value="2a etapa EJA">2a etapa EJA</option>
                        <option value="EJA etapa única">EJA etapa única</option>
                        <option value="turma de fluxo">turma de fluxo</option>
                    </select>
                </div>
                <div>
                    <label class="block text-label-md font-bold text-on-surface mb-1">Modalidade</label>
                    <select id="cls-modalidade" class="w-full border border-border-subtle rounded-lg px-4 py-2 text-body-md focus:border-primary focus:ring-2 focus:ring-primary/10 outline-none transition-all">
                        <option value="Ensino Médio">Ensino Médio</option>
                        <option value="EJA">EJA</option>
                        <option value="Fluxo">Fluxo</option>
                        <option value="AEE">AEE</option>
                    </select>
                </div>
                <div class="flex items-center justify-end gap-3 pt-4 border-t border-border-subtle">
                    <button type="button" class="px-5 py-2.5 text-label-md font-bold text-text-secondary hover:bg-surface-container-low rounded-lg transition-colors" onclick="document.getElementById('siga-modal-class').remove()">Cancelar</button>
                    <button type="submit" class="px-6 py-2.5 bg-primary text-white rounded-lg font-bold shadow-lg shadow-primary/20 hover:brightness-90 transition-all active:scale-95">Criar Turma</button>
                </div>
            </form>
        </div>
    `;
    document.body.appendChild(modal);

    modal.querySelector('form').addEventListener('submit', (e) => {
        e.preventDefault();
        const code = document.getElementById('cls-code').value.trim();
        const turno = document.getElementById('cls-turno').value;
        const serie = document.getElementById('cls-serie').value;
        const modalidade = isAeeClassCode(code) ? 'AEE' : document.getElementById('cls-modalidade').value;

        const classes = getClasses();
        if (classes.some(c => c.code.toLowerCase() === code.toLowerCase())) {
            showToast('Erro: Já existe uma turma com este código!', 'error');
            return;
        }

        const newClass = {
            code,
            serie: isAeeClassCode(code) ? (serie || 'AEE') : serie,
            turno,
            modalidade,
            status: "Ativo",
            anoLetivo: "2026"
        };
        classes.push(newClass);
        localStorage.setItem('siga_classes', JSON.stringify(classes));

        modal.remove();
        showToast('Nova turma criada com sucesso!');
        refreshTurmasFilters();
        renderClasses();
    });
};

window.openEditClassModal = function(classCode) {
    let modal = document.getElementById('siga-modal-class');
    if (modal) modal.remove();

    const classes = getClasses();
    const cls = classes.find(c => c.code === classCode);
    if (!cls) return;

    modal = document.createElement('div');
    modal.id = 'siga-modal-class';
    modal.className = 'fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-on-background/40 backdrop-blur-sm';

    modal.innerHTML = `
        <div class="bg-background-surface w-full max-w-md rounded-2xl shadow-2xl overflow-hidden border border-border-subtle animate-in fade-in zoom-in duration-200" style="font-family: 'Inter', sans-serif;">
            <div class="p-6 border-b border-border-subtle flex justify-between items-center bg-surface-container-low/30">
                <div class="flex items-center gap-3">
                    <div class="w-10 h-10 bg-primary/10 text-primary rounded-full flex items-center justify-center">
                        <span class="material-symbols-outlined">edit</span>
                    </div>
                    <h3 class="font-headline-sm text-on-surface font-semibold">Editar Turma</h3>
                </div>
                <button class="p-1.5 hover:bg-surface-container-low rounded-full transition-colors text-text-secondary" onclick="document.getElementById('siga-modal-class').remove()">
                    <span class="material-symbols-outlined text-[20px]">close</span>
                </button>
            </div>
            <form class="p-6 space-y-4">
                <div>
                    <label class="block text-label-md font-bold text-on-surface mb-1">Código da Turma</label>
                    <input type="text" id="cls-code" class="w-full border border-border-subtle bg-surface-container-low rounded-lg px-4 py-2 text-body-md outline-none cursor-not-allowed text-text-secondary" readonly value="${cls.code}">
                </div>
                <div>
                    <label class="block text-label-md font-bold text-on-surface mb-1">Turno</label>
                    <select id="cls-turno" class="w-full border border-border-subtle rounded-lg px-4 py-2 text-body-md focus:border-primary focus:ring-2 focus:ring-primary/10 outline-none transition-all">
                        <option value="Manhã" ${cls.turno === 'Manhã' ? 'selected' : ''}>Manhã</option>
                        <option value="Tarde" ${cls.turno === 'Tarde' ? 'selected' : ''}>Tarde</option>
                        <option value="Noite" ${cls.turno === 'Noite' ? 'selected' : ''}>Noite</option>
                    </select>
                </div>
                <div>
                    <label class="block text-label-md font-bold text-on-surface mb-1">Série / Ano</label>
                    <select id="cls-serie" class="w-full border border-border-subtle rounded-lg px-4 py-2 text-body-md focus:border-primary focus:ring-2 focus:ring-primary/10 outline-none transition-all">
                        <option value="1o ano do ensino médio" ${cls.serie === '1o ano do ensino médio' ? 'selected' : ''}>1o ano do ensino médio</option>
                        <option value="2o ano do ensino médio" ${cls.serie === '2o ano do ensino médio' ? 'selected' : ''}>2o ano do ensino médio</option>
                        <option value="3o ano do ensino médio" ${cls.serie === '3o ano do ensino médio' ? 'selected' : ''}>3o ano do ensino médio</option>
                        <option value="1a etapa EJA" ${cls.serie === '1a etapa EJA' ? 'selected' : ''}>1a etapa EJA</option>
                        <option value="2a etapa EJA" ${cls.serie === '2a etapa EJA' ? 'selected' : ''}>2a etapa EJA</option>
                        <option value="EJA etapa única" ${cls.serie === 'EJA etapa única' ? 'selected' : ''}>EJA etapa única</option>
                        <option value="turma de fluxo" ${cls.serie === 'turma de fluxo' ? 'selected' : ''}>turma de fluxo</option>
                    </select>
                </div>
                <div>
                    <label class="block text-label-md font-bold text-on-surface mb-1">Modalidade</label>
                    <select id="cls-modalidade" class="w-full border border-border-subtle rounded-lg px-4 py-2 text-body-md focus:border-primary focus:ring-2 focus:ring-primary/10 outline-none transition-all">
                        <option value="Ensino Médio" ${cls.modalidade === 'Ensino Médio' ? 'selected' : ''}>Ensino Médio</option>
                        <option value="EJA" ${cls.modalidade === 'EJA' ? 'selected' : ''}>EJA</option>
                        <option value="Fluxo" ${cls.modalidade === 'Fluxo' ? 'selected' : ''}>Fluxo</option>
                        <option value="AEE" ${cls.modalidade === 'AEE' ? 'selected' : ''}>AEE</option>
                    </select>
                </div>
                <div class="flex items-center justify-end gap-3 pt-4 border-t border-border-subtle">
                    <button type="button" class="px-5 py-2.5 text-label-md font-bold text-text-secondary hover:bg-surface-container-low rounded-lg transition-colors" onclick="document.getElementById('siga-modal-class').remove()">Cancelar</button>
                    <button type="submit" class="px-6 py-2.5 bg-primary text-white rounded-lg font-bold shadow-lg shadow-primary/20 hover:brightness-90 transition-all active:scale-95">Salvar Alterações</button>
                </div>
            </form>
        </div>
    `;
    document.body.appendChild(modal);

    modal.querySelector('form').addEventListener('submit', (e) => {
        e.preventDefault();
        const turno = document.getElementById('cls-turno').value;
        const serie = document.getElementById('cls-serie').value;
        const modalidade = document.getElementById('cls-modalidade').value;

        const idx = classes.findIndex(c => c.code === classCode);
        if (idx !== -1) {
            classes[idx] = { ...classes[idx], turno, serie, modalidade };
            localStorage.setItem('siga_classes', JSON.stringify(classes));
            
            // Sync shift of enrolled students too
            const students = JSON.parse(localStorage.getItem('siga_students')) || [];
            let synced = false;
            students.forEach(s => {
                if (s.turma === classCode) {
                    s.turno = turno;
                    synced = true;
                }
            });
            if (synced) {
                localStorage.setItem('siga_students', JSON.stringify(students));
            }
        }

        modal.remove();
        showToast('Informações da turma atualizadas!');
        refreshTurmasFilters();
        renderClasses();
    });
};

window.deleteClass = function(classCode) {
    const students = JSON.parse(localStorage.getItem('siga_students')) || [];
    const count = countStudentsInClass(students, classCode);

    let warningText = `Tem certeza que deseja excluir a Turma ${classCode}?`;
    if (count > 0) {
        warningText += `\n\nATENÇÃO: Existem ${count} aluno(s) matriculado(s) nesta turma! Se você excluir, eles ficarão sem turma atribuída.`;
    }

    if (confirm(warningText)) {
        const classes = getClasses();
        const filtered = classes.filter(c => c.code !== classCode);
        localStorage.setItem('siga_classes', JSON.stringify(filtered));
        showToast('Turma excluída com sucesso!');
        refreshTurmasFilters();
        renderClasses();
    }
};

window.downloadClassesList = function() {
    const classes = getClasses();
    const students = JSON.parse(localStorage.getItem('siga_students')) || [];

    let content = `SIGA EDUCA - RELATÓRIO DE TURMAS (ANO LETIVO 2026)\n`;
    content += `Total de Turmas: ${classes.length}\n`;
    content += `======================================================================\n`;
    content += `Código | Série                           | Turno   | Alunos | Status\n`;
    content += `======================================================================\n`;
    
    classes.forEach(c => {
        const count = countStudentsInClass(students, c.code);
        const code = c.code.padEnd(6);
        const serie = c.serie.padEnd(31).substring(0, 31);
        const turno = c.turno.padEnd(7);
        const countStr = count.toString().padStart(6).padEnd(6);
        const status = c.status.padEnd(8);
        content += `${code} | ${serie} | ${turno} | ${countStr} | ${status}\n`;
    });
    content += `======================================================================\n`;
    content += `Gerado em: ${new Date().toLocaleDateString('pt-BR')} - SIGA EDUCA\n`;

    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `relatorio_turmas_2026.txt`;
    link.click();
    showToast('Download do relatório iniciado!');
};

window.printClassesList = function() {
    const classes = getClasses();
    const students = JSON.parse(localStorage.getItem('siga_students')) || [];

    let content = `SIGA EDUCA - RELATÓRIO DE TURMAS (ANO LETIVO 2026)\r\n`;
    content += `Total de Turmas: ${classes.length}\r\n`;
    content += `======================================================================\r\n`;
    content += `Código | Série                           | Turno   | Alunos | Status\r\n`;
    content += `======================================================================\r\n`;
    
    classes.forEach(c => {
        const count = countStudentsInClass(students, c.code);
        const code = c.code.padEnd(6);
        const serie = c.serie.padEnd(31).substring(0, 31);
        const turno = c.turno.padEnd(7);
        const countStr = count.toString().padStart(6).padEnd(6);
        const status = c.status.padEnd(8);
        content += `${code} | ${serie} | ${turno} | ${countStr} | ${status}\r\n`;
    });
    content += `======================================================================\r\n`;
    content += `Gerado em: ${new Date().toLocaleDateString('pt-BR')} - SIGA EDUCA\r\n`;

    const printWindow = window.open('', '_blank');
    printWindow.document.write(`
        <html>
            <head>
                <title>Relatório de Turmas - SIGA EDUCA</title>
                <style>
                    body {
                        font-family: monospace;
                        white-space: pre;
                        padding: 40px;
                        font-size: 14px;
                        line-height: 1.5;
                        color: #121c2a;
                    }
                </style>
            </head>
            <body onload="window.print(); window.close();">
${content}
            </body>
        </html>
    `);
    printWindow.document.close();
    showToast('Relatório enviado para impressão!');
};

function initTurmaDetalhePage() {
    const urlParams = new URLSearchParams(window.location.search);
    const classCode = urlParams.get('code');
    if (!classCode) {
        window.location.href = 'turmas.html';
        return;
    }

    const classes = getClasses();
    const classObj = classes.find(c => c.code === classCode);
    if (!classObj) {
        alert('Turma não encontrada!');
        window.location.href = 'turmas.html';
        return;
    }

    document.getElementById('detail-class-title').textContent = `Turma: ${classObj.code}`;
    document.getElementById('detail-class-subtitle').textContent = `Série: ${classObj.serie} | Turno: ${classObj.turno}`;
    document.getElementById('detail-modalidade').textContent = classObj.modalidade;
    document.getElementById('detail-ano-letivo').textContent = `Ano Letivo: ${classObj.anoLetivo}`;

    renderTurmaDetalhe(classCode);
}

function renderTurmaDetalhe(classCode) {
    const tbody = document.getElementById('class-students-tbody');
    const emptyState = document.getElementById('class-students-empty');
    if (!tbody) return;

    const students = JSON.parse(localStorage.getItem('siga_students')) || [];
    const classStudents = students.filter(s => studentBelongsToClass(s, classCode));

    document.getElementById('detail-student-count').textContent = classStudents.length;

    if (classStudents.length === 0) {
        tbody.innerHTML = '';
        if (emptyState) emptyState.classList.remove('hidden');
        return;
    }

    if (emptyState) emptyState.classList.add('hidden');

    let html = '';
    classStudents.forEach(s => {
        let freqColor = "bg-primary-container";
        let freqTextColor = "text-primary";
        const freqVal = parseInt(s.frequencia) || 0;
        if (freqVal < 75) {
            freqColor = "bg-error";
            freqTextColor = "text-error";
        } else if (freqVal < 85) {
            freqColor = "bg-tertiary";
            freqTextColor = "text-tertiary";
        }

        let statusStyle = "bg-primary-light/10 text-primary border-primary-light/20";
        if (s.status === "Em Risco") {
            statusStyle = "bg-error-container text-error border-error/10";
        } else if (s.status === "Inativo") {
            statusStyle = "bg-surface-container text-text-secondary border-border-subtle";
        }

        html += `
            <tr class="hover:bg-surface-container-low/30 transition-colors group">
                <td class="px-6 py-4">
                    <div class="flex items-center gap-3">
                        <img class="w-10 h-10 rounded-full object-cover" src="${s.avatar || 'https://lh3.googleusercontent.com/aida-public/AB6AXuAhzY2LZSyYxqZi_oWjCX2mFBmaor9RlDiJoUDmH6MwNdRW44bTnj77C1BI3cQXh1grtsMG_AC9ScEaGNQQioiHt35xfvD9N9N0wR0fyOvt7Rx6ec2RmCEbMgok0IPbpdqI-8jtHQALDoU0lyT4G0sWqHdyYFWuMW-MK5b5DEvSHKBKEaSuVoe5_Idvml35sAkenPq0z8KZ6-aAe07Jh1nzpEug-0F7CvMkGjxtGCmxKXT3DntmgwgBqbw4Hd5yu5ehjeDKPcSbwCE'}" alt="${s.nome}">
                        <div>
                            <p class="font-semibold text-body-md text-on-surface">${s.nome}</p>
                            <p class="text-label-sm text-text-secondary">${s.email}</p>
                        </div>
                    </div>
                </td>
                <td class="px-6 py-4 text-body-md text-on-surface">${s.idade} anos</td>
                <td class="px-6 py-4">
                    <div class="flex items-center gap-2">
                        <div class="flex-1 w-24 bg-surface-container rounded-full h-1.5">
                            <div class="${freqColor} h-1.5 rounded-full" style="width: ${freqVal}%"></div>
                        </div>
                        <span class="text-label-sm font-bold ${freqTextColor}">${freqVal}%</span>
                    </div>
                </td>
                <td class="px-6 py-4">
                    <span class="px-3 py-1 ${statusStyle} text-[11px] font-bold rounded-full border uppercase tracking-tighter">${s.status}</span>
                </td>
                <td class="px-6 py-4 text-right">
                    <a class="inline-flex items-center justify-center p-2 text-text-secondary hover:text-primary hover:bg-primary-light/10 rounded-lg transition-all" href="fichadoaluno.html?id=${s.id}">
                        <span class="material-symbols-outlined text-[20px]">visibility</span>
                    </a>
                </td>
            </tr>
        `;
    });

    tbody.innerHTML = html;
}

window.downloadClassList = function() {
    const urlParams = new URLSearchParams(window.location.search);
    const classCode = urlParams.get('code');
    if (!classCode) return;

    const classes = getClasses();
    const classObj = classes.find(c => c.code === classCode);
    if (!classObj) return;

    const students = JSON.parse(localStorage.getItem('siga_students')) || [];
    const classStudents = students.filter(s => studentBelongsToClass(s, classCode));

    let content = `SIGA EDUCA - LISTA DE ALUNOS\n`;
    content += `Turma: ${classObj.code} - ${classObj.serie}\n`;
    content += `Turno: ${classObj.turno} | Ano Letivo: ${classObj.anoLetivo}\n`;
    content += `Total de Alunos: ${classStudents.length}\n`;
    content += `======================================================================\n`;
    content += `Num | Nome Completo                     | Idade | Freq | Status\n`;
    content += `======================================================================\n`;
    
    classStudents.forEach((s, idx) => {
        const num = (idx + 1).toString().padEnd(3);
        const nome = s.nome.padEnd(30).substring(0, 30);
        const idade = (s.idade + " anos").padEnd(6);
        const freq = (s.frequencia + "%").padEnd(5);
        const status = s.status.padEnd(9);
        content += `${num} | ${nome} | ${idade} | ${freq} | ${status}\n`;
    });
    content += `======================================================================\n`;
    content += `Gerado em: ${new Date().toLocaleDateString('pt-BR')} - SIGA EDUCA\n`;

    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `lista_turma_${classCode}.txt`;
    link.click();
    showToast('Download da lista iniciado!');
};

window.printClassList = function() {
    const urlParams = new URLSearchParams(window.location.search);
    const classCode = urlParams.get('code');
    if (!classCode) return;

    const classes = getClasses();
    const classObj = classes.find(c => c.code === classCode);
    if (!classObj) return;

    const students = JSON.parse(localStorage.getItem('siga_students')) || [];
    const classStudents = students.filter(s => studentBelongsToClass(s, classCode));

    let content = `SIGA EDUCA - LISTA DE ALUNOS\r\n`;
    content += `Turma: ${classObj.code} - ${classObj.serie}\r\n`;
    content += `Turno: ${classObj.turno} | Ano Letivo: ${classObj.anoLetivo}\r\n`;
    content += `Total de Alunos: ${classStudents.length}\r\n`;
    content += `======================================================================\r\n`;
    content += `Num | Nome Completo                     | Idade | Freq | Status\r\n`;
    content += `======================================================================\r\n`;
    
    classStudents.forEach((s, idx) => {
        const num = (idx + 1).toString().padEnd(3);
        const nome = s.nome.padEnd(30).substring(0, 30);
        const idade = (s.idade + " anos").padEnd(6);
        const freq = (s.frequencia + "%").padEnd(5);
        const status = s.status.padEnd(9);
        content += `${num} | ${nome} | ${idade} | ${freq} | ${status}\r\n`;
    });
    content += `======================================================================\r\n`;
    content += `Gerado em: ${new Date().toLocaleDateString('pt-BR')} - SIGA EDUCA\r\n`;

    const printWindow = window.open('', '_blank');
    printWindow.document.write(`
        <html>
            <head>
                <title>Lista de Alunos - Turma ${classCode}</title>
                <style>
                    body {
                        font-family: monospace;
                        white-space: pre;
                        padding: 40px;
                        font-size: 14px;
                        line-height: 1.5;
                        color: #121c2a;
                    }
                </style>
            </head>
            <body onload="window.print(); window.close();">
${content}
            </body>
        </html>
    `);
    printWindow.document.close();
    showToast('Lista enviada para impressão!');
};

// Global Exports
window.openAvatarOptions = openAvatarOptions;
window.triggerFileInput = triggerFileInput;
window.handleAvatarFile = handleAvatarFile;
window.openCameraStream = openCameraStream;
window.closeCameraStream = closeCameraStream;
window.captureSnapshot = captureSnapshot;
window.updateStudentAvatar = updateStudentAvatar;
window.openChangeClassModal = openChangeClassModal;
window.openHistoryDetailModal = openHistoryDetailModal;
window.initTurmasPage = initTurmasPage;
window.initTurmaDetalhePage = initTurmaDetalhePage;
window.renderClasses = renderClasses;
window.downloadModeloTurmasCsv = downloadModeloTurmasCsv;
window.importTurmasFromCsv = importTurmasFromCsv;
window.renderTurmaDetalhe = renderTurmaDetalhe;

// ==========================================
// 11. CALENDAR DAYS DATABASE LAYER
// ==========================================
function getCalendarDays() {
    let days = JSON.parse(localStorage.getItem('siga_calendar_days'));
    
    // Auto-reset if containing legacy entries or missing July 2026
    const hasJuly2026 = days && days['2026-07-01'] !== undefined;
    const isClean2026 = days && Object.keys(days).length > 0 && Object.keys(days)[0].startsWith('2026') && hasJuly2026;
    
    if (!days || !isClean2026) {
        days = {};
        const year = 2026;
        
        // Seed May 2026 (Clean slate, weekends are non-letivo, weekdays are letivo)
        let month = 5;
        let numDays = 31;
        for (let d = 1; d <= numDays; d++) {
            const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
            const date = new Date(year, month - 1, d);
            const dayOfWeek = date.getDay(); // 0 = Sunday, 6 = Saturday
            
            if (dayOfWeek === 0) {
                days[dateStr] = { type: 'domingo', label: 'Domingo (Não Letivo)' };
            } else if (dayOfWeek === 6) {
                days[dateStr] = { type: 'sabado_nao_letivo', label: 'Sábado (Não Letivo)' };
            } else {
                days[dateStr] = { type: 'letivo', label: 'Dia Letivo' };
            }
        }
        
        // Seed July 2026 (School Holidays - all non-letivo!)
        month = 7;
        numDays = 31;
        for (let d = 1; d <= numDays; d++) {
            const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
            const date = new Date(year, month - 1, d);
            const dayOfWeek = date.getDay(); // 0 = Sunday, 6 = Saturday
            
            if (dayOfWeek === 0) {
                days[dateStr] = { type: 'domingo', label: 'Domingo (Férias Escolares)' };
            } else if (dayOfWeek === 6) {
                days[dateStr] = { type: 'sabado_nao_letivo', label: 'Sábado (Férias Escolares)' };
            } else {
                days[dateStr] = { type: 'feriado_recesso', label: 'Férias Escolares' };
            }
        }
        
        localStorage.setItem('siga_calendar_days', JSON.stringify(days));
    }
    return days;
}

function saveCalendarDays(days) {
    localStorage.setItem('siga_calendar_days', JSON.stringify(days));
}

window.getCalendarDays = getCalendarDays;
window.saveCalendarDays = saveCalendarDays;