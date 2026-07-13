// SIGA EDUCA — Shell responsivo (drawer mobile + sidebar desktop)
(function () {
    'use strict';

    function isDesktop() {
        return window.matchMedia('(min-width: 1024px)').matches;
    }

    function openDrawer() {
        document.body.classList.add('drawer-open');
        var btn = document.getElementById('btn-mobile-nav');
        if (btn) {
            btn.setAttribute('aria-expanded', 'true');
            var icon = btn.querySelector('.material-symbols-outlined');
            if (icon) icon.textContent = 'close';
        }
        var sidebar = document.getElementById('sidebar');
        if (sidebar) {
            var focusable = sidebar.querySelector('a, button');
            if (focusable) setTimeout(function () { focusable.focus(); }, 50);
        }
    }

    function closeDrawer() {
        document.body.classList.remove('drawer-open');
        var btn = document.getElementById('btn-mobile-nav');
        if (btn) {
            btn.setAttribute('aria-expanded', 'false');
            var icon = btn.querySelector('.material-symbols-outlined');
            if (icon) icon.textContent = 'menu';
        }
    }

    function toggleDrawer() {
        if (document.body.classList.contains('drawer-open')) closeDrawer();
        else openDrawer();
    }

    window.toggleSidebarCollapse = function () {
        if (!isDesktop()) return;
        document.body.classList.toggle('sidebar-collapsed');
        var collapsed = document.body.classList.contains('sidebar-collapsed');
        localStorage.setItem('sidebar-collapsed', collapsed ? 'true' : 'false');
        var icon = document.getElementById('sidebar-collapse-icon');
        if (icon) icon.textContent = collapsed ? 'chevron_right' : 'chevron_left';
    };

    window.toggleNavGroup = function (button) {
        var group = button && button.closest ? button.closest('.nav-dropdown') : null;
        if (!group) return;
        var shouldOpen = !group.classList.contains('open');
        document.querySelectorAll('.nav-dropdown').forEach(function (g) {
            if (g !== group) {
                g.classList.remove('open');
                var btn = g.querySelector('.nav-dropdown-toggle');
                if (btn) btn.setAttribute('aria-expanded', 'false');
            }
        });
        group.classList.toggle('open', shouldOpen);
        button.setAttribute('aria-expanded', shouldOpen ? 'true' : 'false');
    };

    window.openMobileNav = openDrawer;
    window.closeMobileNav = closeDrawer;
    window.toggleMobileNav = toggleDrawer;

    function ensureOverlay() {
        var overlay = document.getElementById('nav-drawer-overlay');
        if (overlay) return overlay;
        overlay = document.createElement('div');
        overlay.id = 'nav-drawer-overlay';
        overlay.setAttribute('aria-hidden', 'true');
        document.body.appendChild(overlay);
        return overlay;
    }

    function ensureHamburger() {
        var existing = document.getElementById('btn-mobile-nav');
        if (existing) return existing;

        var header = document.querySelector('main > header, header.siga-app-header, aside#sidebar ~ main header, main header');
        if (!header) return null;

        // Build left cluster: hamburger + titles
        var titles = header.querySelector(':scope > div.flex.flex-col, :scope > .siga-header-titles');
        var left = header.querySelector('.siga-header-left');
        if (!left) {
            left = document.createElement('div');
            left.className = 'siga-header-left';
            if (titles) {
                titles.classList.add('siga-header-titles');
                header.insertBefore(left, titles);
                left.appendChild(titles);
            } else {
                header.insertBefore(left, header.firstChild);
            }
        }

        var btn = document.createElement('button');
        btn.type = 'button';
        btn.id = 'btn-mobile-nav';
        btn.setAttribute('aria-label', 'Abrir menu');
        btn.setAttribute('aria-expanded', 'false');
        btn.setAttribute('aria-controls', 'sidebar');
        btn.innerHTML = '<span class="material-symbols-outlined">menu</span>';
        left.insertBefore(btn, left.firstChild);
        return btn;
    }

    function enhanceHeader() {
        var header = document.querySelector('main > header, header.siga-app-header');
        if (!header) return;
        header.classList.add('siga-app-header');

        var actions = header.querySelector(':scope > .flex.items-center.gap-4, :scope > .siga-header-actions');
        if (actions) actions.classList.add('siga-header-actions');
    }

    function enhanceSidebar() {
        var sidebar = document.getElementById('sidebar');
        if (!sidebar) return;
        sidebar.classList.add('siga-drawer');
        // Remove Tailwind hide-on-mobile so CSS drawer can control visibility
        sidebar.classList.remove('hidden');
        // Ensure flex layout classes present
        if (!/\bflex\b/.test(sidebar.className)) sidebar.classList.add('flex');
        if (!/\bflex-col\b/.test(sidebar.className)) sidebar.classList.add('flex-col');
        // Strip legacy lg-only flex utility if present alone without base flex
        sidebar.className = sidebar.className
            .replace(/\blg:flex\b/g, 'flex')
            .replace(/\s+/g, ' ')
            .trim();
    }

    function markActiveNav() {
        var path = (window.location.pathname || '').split('/').pop() || '';
        if (!path) return;
        document.querySelectorAll('aside#sidebar a.nav-item[href]').forEach(function (a) {
            var href = (a.getAttribute('href') || '').split('/').pop();
            if (href && href === path) {
                a.classList.add('bg-primary-light/20', 'text-primary', 'font-semibold');
                var group = a.closest('.nav-dropdown');
                if (group) {
                    group.classList.add('open');
                    var toggle = group.querySelector('.nav-dropdown-toggle');
                    if (toggle) toggle.setAttribute('aria-expanded', 'true');
                }
            }
        });
    }

    function bindEvents() {
        var btn = document.getElementById('btn-mobile-nav');
        if (btn && !btn.dataset.bound) {
            btn.dataset.bound = '1';
            btn.addEventListener('click', function (e) {
                e.preventDefault();
                toggleDrawer();
            });
        }

        var overlay = document.getElementById('nav-drawer-overlay');
        if (overlay && !overlay.dataset.bound) {
            overlay.dataset.bound = '1';
            overlay.addEventListener('click', closeDrawer);
        }

        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape') closeDrawer();
        });

        // Close drawer when navigating
        document.querySelectorAll('aside#sidebar a[href]').forEach(function (a) {
            if (a.dataset.drawerCloseBound) return;
            a.dataset.drawerCloseBound = '1';
            a.addEventListener('click', function () {
                if (!isDesktop()) closeDrawer();
            });
        });

        // Prevent # links from jumping
        document.querySelectorAll('a[href="#"]').forEach(function (el) {
            if (el.dataset.hashBound) return;
            el.dataset.hashBound = '1';
            el.addEventListener('click', function (e) { e.preventDefault(); });
        });

        window.addEventListener('resize', function () {
            if (isDesktop()) closeDrawer();
        });
    }

    function restoreCollapseState() {
        if (!isDesktop()) return;
        if (localStorage.getItem('sidebar-collapsed') === 'true') {
            document.body.classList.add('sidebar-collapsed');
            var icon = document.getElementById('sidebar-collapse-icon');
            if (icon) icon.textContent = 'chevron_right';
        }
    }

    window.initSigaShell = function () {
        var sidebar = document.getElementById('sidebar');
        if (!sidebar) return; // páginas sem shell
        ensureOverlay();
        enhanceSidebar();
        enhanceHeader();
        ensureHamburger();
        restoreCollapseState();
        markActiveNav();
        bindEvents();
    };
})();
