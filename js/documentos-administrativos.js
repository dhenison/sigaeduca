/**
 * SIGA EDUCA — Documentos Administrativos (Gestão Escolar)
 * Acesso: Diretor, Vice-diretor Administrativo, Vice-diretor Pedagógico (+ admin sistema)
 * Tipos cadastrados; atribuições/formulários serão adicionados depois.
 */
(function (global) {
    'use strict';

    var DOC_TYPES = [
        { id: 'requerimento_padrao', label: 'Requerimento Padrão', icon: 'request_page' },
        { id: 'oficio', label: 'Ofício', icon: 'mail' },
        { id: 'memorando', label: 'Memorando', icon: 'sticky_note_2' },
        { id: 'ata_conselho', label: 'ATA Conselho', icon: 'groups' },
        { id: 'ata_administrativa', label: 'ATA Administrativa', icon: 'assignment' },
        { id: 'ata_conselho_escolar', label: 'ATA de Conselho Escolar', icon: 'diversity_3' },
        { id: 'paf', label: 'PAF', icon: 'account_balance_wallet' },
        { id: 'termo_autorizacao', label: 'Termo de Autorização', icon: 'verified_user' },
        { id: 'freq_guardas', label: 'Frequência Guardas', icon: 'security' },
        { id: 'freq_semed', label: 'Frequência SEMED', icon: 'domain' },
        { id: 'freq_professores', label: 'Frequência Professores', icon: 'school' },
        { id: 'folha_ponto', label: 'Folha de Ponto', icon: 'timer' }
    ];

    function toast(msg, type) {
        if (typeof showToast === 'function') showToast(msg, type || 'success');
        else alert(msg);
    }

    function sessionRole() {
        try {
            var s = JSON.parse(localStorage.getItem('siga_session') || 'null');
            if (!s) return '';
            if (s.sistemaAdmin || s.tipo === 'sistema') return 'Administrador do Sistema';
            return String(s.role || s.cargo || '');
        } catch (e) {
            return '';
        }
    }

    /** Diretor, Vice-diretor Administrativo, Vice-diretor Pedagógico (+ admin sistema) */
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
        var role = sessionRole();
        if (isGestorEscolar(role)) return true;
        toast('Acesso restrito a gestores escolares (Diretor e Vice-diretores).', 'error');
        setTimeout(function () {
            window.location.href = 'painelprincipal.html';
        }, 600);
        return false;
    }

    function escapeHtml(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function renderTypes() {
        var host = document.getElementById('adm-doc-types');
        if (!host) return;
        host.innerHTML = DOC_TYPES.map(function (t) {
            return [
                '<article class="bg-white border border-border-subtle rounded-2xl p-5 custom-shadow flex flex-col gap-3 hover:border-primary/40 transition-colors" data-doc-type="', escapeHtml(t.id), '">',
                '<div class="w-11 h-11 rounded-xl bg-primary/10 text-primary flex items-center justify-center">',
                '<span class="material-symbols-outlined text-[24px]">', escapeHtml(t.icon), '</span>',
                '</div>',
                '<div class="flex-1">',
                '<h3 class="font-headline-sm text-on-surface">', escapeHtml(t.label), '</h3>',
                '<p class="text-label-sm text-text-secondary mt-1">Documento administrativo — atribuições em breve.</p>',
                '</div>',
                '<button type="button" class="mt-auto w-full py-2.5 rounded-xl border border-border-subtle text-label-md font-semibold text-text-secondary cursor-not-allowed opacity-70" disabled>',
                'Em configuração',
                '</button>',
                '</article>'
            ].join('');
        }).join('');
    }

    function init() {
        if (!/documentosadministrativos/i.test(location.pathname + location.href)) return;
        if (!ensureAccess()) return;
        renderTypes();
        var countEl = document.getElementById('adm-doc-types-count');
        if (countEl) countEl.textContent = String(DOC_TYPES.length);
    }

    global.SigaDocumentosAdministrativos = {
        DOC_TYPES: DOC_TYPES,
        isGestorEscolar: isGestorEscolar,
        init: init
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})(typeof window !== 'undefined' ? window : this);
