// SIGA EDUCA — horários por turno (2º semestre de 2026)
(function () {
    'use strict';

    var SHIFTS = [
        { file: 'horario-matutino-2-semestre-2026.pdf', label: 'Matutino', icon: 'wb_sunny', tone: 'from-amber-50 to-orange-50 border-amber-200 text-amber-900' },
        { file: 'horario-vespertino-2-semestre-2026.pdf', label: 'Vespertino', icon: 'light_mode', tone: 'from-sky-50 to-blue-50 border-sky-200 text-sky-900' },
        { file: 'horario-noturno-2-semestre-2026.pdf', label: 'Noturno', icon: 'dark_mode', tone: 'from-indigo-50 to-slate-100 border-indigo-200 text-indigo-950' }
    ];

    function renderPage() {
        var main = document.querySelector('main');
        if (!main) return;
        main.innerHTML =
            '<header class="siga-app-header h-16 w-full flex items-center px-4 sm:px-6 lg:px-8 bg-background/50 backdrop-blur-md sticky top-0 z-40">' +
            '<div><h2 class="font-headline-md text-on-surface leading-tight">Horário de Aula</h2>' +
            '<span class="text-label-sm text-text-secondary">2º semestre de 2026</span></div></header>' +
            '<div class="p-5 sm:p-8 max-w-5xl mx-auto space-y-6">' +
            '<div><h2 class="text-2xl font-bold text-on-surface">Horários por turno</h2>' +
            '<p class="text-text-secondary mt-1">Clique no card para abrir o PDF do turno.</p></div>' +
            '<div class="grid grid-cols-1 md:grid-cols-3 gap-4">' +
            SHIFTS.map(function (shift) {
                return '<a href="horarios/' + shift.file + '" target="_blank" rel="noopener noreferrer" ' +
                    'class="flex items-center gap-4 p-5 rounded-2xl border bg-gradient-to-br no-underline shadow-sm hover:shadow-md transition-shadow ' + shift.tone + '">' +
                    '<span class="material-symbols-outlined text-4xl">' + shift.icon + '</span>' +
                    '<span class="flex-1 min-w-0"><b class="block text-lg">' + shift.label + '</b>' +
                    '<small class="block mt-1 opacity-80">2º semestre de 2026</small>' +
                    '<small class="block mt-1 font-semibold">Abrir PDF</small></span>' +
                    '<span class="material-symbols-outlined">picture_as_pdf</span></a>';
            }).join('') +
            '</div></div>';
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', renderPage);
    else renderPage();
})();
