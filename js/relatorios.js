// SIGA EDUCA — Relatórios Gerenciais + Frequência Consolidada
(function () {
    'use strict';

    var MESES = [
        'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
        'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
    ];

    var lastFreqReport = null;

    function pad2(n) {
        return String(n).padStart(2, '0');
    }

    function toIso(d) {
        return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
    }

    function parseIso(iso) {
        var p = String(iso || '').slice(0, 10).split('-');
        return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
    }

    function formatBr(iso) {
        if (!iso) return '—';
        var p = String(iso).slice(0, 10).split('-');
        if (p.length < 3) return iso;
        return p[2] + '/' + p[1] + '/' + p[0];
    }

    function formatBrShort(iso) {
        var p = String(iso).slice(0, 10).split('-');
        return p[2] + '/' + p[1];
    }

    function escapeHtml(str) {
        return String(str == null ? '' : str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function getClassesSafe() {
        try {
            if (typeof getClasses === 'function') return getClasses() || [];
            return JSON.parse(localStorage.getItem('siga_classes') || '[]') || [];
        } catch (e) {
            return [];
        }
    }

    function getStudentsSafe() {
        try {
            return JSON.parse(localStorage.getItem('siga_students') || '[]') || [];
        } catch (e) {
            return [];
        }
    }

    function getCalendarSafe() {
        try {
            if (typeof getCalendarDays === 'function') return getCalendarDays() || {};
            return JSON.parse(localStorage.getItem('siga_calendar_days') || '{}') || {};
        } catch (e) {
            return {};
        }
    }

    function isDiaLetivo(iso) {
        var cal = getCalendarSafe();
        var info = cal[iso];
        if (info && info.type) {
            return info.type === 'letivo' || info.type === 'sabado_letivo';
        }
        var d = parseIso(iso);
        if (isNaN(d.getTime())) return false;
        var dow = d.getDay();
        return dow !== 0 && dow !== 6;
    }

    function eachDay(startIso, endIso, fn) {
        var cur = parseIso(startIso);
        var end = parseIso(endIso);
        if (isNaN(cur.getTime()) || isNaN(end.getTime())) return;
        while (cur <= end) {
            fn(toIso(cur));
            cur.setDate(cur.getDate() + 1);
        }
    }

    function listDiasLetivos(startIso, endIso) {
        var days = [];
        eachDay(startIso, endIso, function (iso) {
            if (isDiaLetivo(iso)) days.push(iso);
        });
        return days;
    }

    function resolvePeriodRange() {
        var tipo = (document.getElementById('freq-tipo-periodo') || {}).value || 'dia';
        var anoAtual = new Date().getFullYear();

        if (tipo === 'dia' || tipo === 'semana') {
            var dataEl = document.getElementById('freq-data');
            var iso = (dataEl && dataEl.value) || toIso(new Date());
            if (tipo === 'dia') {
                return { tipo: tipo, start: iso, end: iso, label: 'Data ' + formatBr(iso) };
            }
            var d = parseIso(iso);
            var dow = d.getDay();
            var mondayOffset = dow === 0 ? -6 : 1 - dow;
            var mon = new Date(d);
            mon.setDate(d.getDate() + mondayOffset);
            var sun = new Date(mon);
            sun.setDate(mon.getDate() + 6);
            return {
                tipo: tipo,
                start: toIso(mon),
                end: toIso(sun),
                label: 'Semana ' + formatBr(toIso(mon)) + ' a ' + formatBr(toIso(sun))
            };
        }

        if (tipo === 'mes') {
            var mesEl = document.getElementById('freq-mes');
            var ym = (mesEl && mesEl.value) || (anoAtual + '-' + pad2(new Date().getMonth() + 1));
            var parts = ym.split('-');
            var y = Number(parts[0]);
            var m = Number(parts[1]);
            var start = y + '-' + pad2(m) + '-01';
            var last = new Date(y, m, 0).getDate();
            var end = y + '-' + pad2(m) + '-' + pad2(last);
            return {
                tipo: tipo,
                start: start,
                end: end,
                label: (MESES[m - 1] || ym) + ' / ' + y
            };
        }

        // bimestre
        var bim = Number((document.getElementById('freq-bimestre') || {}).value || 1);
        var ranges = {
            1: { start: anoAtual + '-02-01', end: anoAtual + '-04-30', label: '1º Bimestre (Fev–Abr/' + anoAtual + ')' },
            2: { start: anoAtual + '-05-01', end: anoAtual + '-07-31', label: '2º Bimestre (Mai–Jul/' + anoAtual + ')' },
            3: { start: anoAtual + '-08-01', end: anoAtual + '-10-31', label: '3º Bimestre (Ago–Out/' + anoAtual + ')' },
            4: { start: anoAtual + '-11-01', end: anoAtual + '-12-31', label: '4º Bimestre (Nov–Dez/' + anoAtual + ')' }
        };
        var r = ranges[bim] || ranges[1];
        return { tipo: 'bimestre', start: r.start, end: r.end, label: r.label };
    }

    /** Mesmas regras da tela de Frequência (entrada + saída). */
    function consolidarStatusDia(entStatus, saiStatus) {
        var ent = entStatus || 'P';
        var sai = saiStatus || 'P';
        if (ent === 'P' && sai === 'P') return 'P';
        if (ent === 'F' && sai === 'F') return 'F';
        if (ent === 'P' && sai === 'FJ') return 'P';
        if (ent === 'FJ' && sai === 'FJ') return 'FJ';
        if (ent === 'FJ' && sai === 'P') return 'P';
        if (ent === 'P' && sai === 'F') return 'F'; // evasão
        if (ent === 'F' && sai === 'P') return 'F';
        return 'F';
    }

    function getAttendanceRecord(dateIso, classCode) {
        try {
            var raw = localStorage.getItem('siga_attendance_' + dateIso + '_' + classCode);
            return raw ? JSON.parse(raw) : null;
        } catch (e) {
            return null;
        }
    }

    function saveAttendanceRecord(dateIso, classCode, record) {
        if (!dateIso || !classCode || !record) return;
        try {
            localStorage.setItem('siga_attendance_' + dateIso + '_' + classCode, JSON.stringify(record));
        } catch (e) { /* ignore */ }
    }

    /** Marca válida: consolidação individual (facial/locked) OU chamada da turma consolidada. */
    function markReadyForReport(phaseRec, studentId) {
        if (!phaseRec) return null;
        var sid = String(studentId);
        var rec = (phaseRec.records && (phaseRec.records[sid] || phaseRec.records[studentId])) || null;
        if (rec && (rec.locked || rec._hasMark)) return rec;
        if (phaseRec.consolidado) {
            return rec || { status: 'F', locked: true, source: 'manual' };
        }
        return null;
    }

    function statusAlunoNoDia(studentId, dateIso, classCode) {
        var pack = getAttendanceRecord(dateIso, classCode);
        if (!pack) return null;
        var ent = markReadyForReport(pack.entrada, studentId);
        var sai = markReadyForReport(pack.saida, studentId);
        // Precisa entrada + saída consolidadas do aluno (igual Frequência / portal)
        if (!ent || !sai) return null;
        return consolidarStatusDia(ent.status, sai.status);
    }

    /**
     * Carrega marcas do Supabase (inclui facial) para o período — staff autenticado.
     */
    function hydrateAttendanceForReport(turmaCode, dias, alunos) {
        var cloud = window.SigaFrequenciaCloud;
        if (!cloud || typeof cloud.loadDay !== 'function' || !dias.length) {
            return Promise.resolve({ ok: false, hydrated: 0 });
        }
        var hydrated = 0;
        // Paralelo com limite simples (evita saturar a API)
        var queue = dias.slice();
        var workers = Math.min(4, queue.length);

        function next() {
            if (!queue.length) return Promise.resolve();
            var iso = queue.shift();
            return cloud
                .loadDay(turmaCode, iso, alunos)
                .then(function (res) {
                    if (res && res.ok && res.record) {
                        saveAttendanceRecord(iso, turmaCode, res.record);
                        hydrated++;
                    }
                })
                .catch(function () { /* segue */ })
                .then(next);
        }

        var jobs = [];
        for (var i = 0; i < workers; i++) jobs.push(next());
        return Promise.all(jobs).then(function () {
            return { ok: true, hydrated: hydrated };
        });
    }

    function studentsOfTurma(classCode) {
        return getStudentsSafe()
            .filter(function (s) {
                if ((s.status || 'Ativo') === 'Inativo') return false;
                return String(s.turma || '') === String(classCode);
            })
            .sort(function (a, b) {
                return String(a.nome || '').localeCompare(String(b.nome || ''), 'pt-BR');
            });
    }

    function fillPeriodoSelect() {
        var sel = document.getElementById('relatorio-periodo');
        if (!sel) return;
        var now = new Date();
        var mes = MESES[now.getMonth()];
        var ano = now.getFullYear();
        sel.innerHTML =
            '<option value="mes">Este mês (' + mes + ' ' + ano + ')</option>' +
            '<option value="semestre">Último semestre</option>' +
            '<option value="ano" selected>Ano letivo ' + ano + '</option>' +
            '<option value="personalizado">Personalizado</option>';
    }

    function setActiveCategory(cat) {
        document.querySelectorAll('.rel-cat-btn').forEach(function (btn) {
            var active = btn.getAttribute('data-categoria') === cat;
            btn.className = active
                ? 'rel-cat-btn px-3 py-1.5 bg-primary-light/20 text-primary border border-primary-light/30 rounded-full text-label-md font-bold'
                : 'rel-cat-btn px-3 py-1.5 bg-surface-container-low text-text-secondary rounded-full text-label-md hover:bg-surface-container-high transition-colors';
        });
        var visible = 0;
        document.querySelectorAll('#relatorios-grid .report-card').forEach(function (card) {
            var match = cat === 'todos' || card.getAttribute('data-categoria') === cat;
            card.classList.toggle('hidden', !match);
            if (match) visible++;
        });
        var empty = document.getElementById('relatorios-empty');
        if (empty) empty.hidden = visible > 0;
    }

    function setActiveFormato(fmt) {
        document.querySelectorAll('.rel-fmt-btn').forEach(function (btn) {
            var active = btn.getAttribute('data-formato') === fmt;
            btn.className = active
                ? 'rel-fmt-btn flex-1 py-1 px-3 bg-white shadow-sm rounded text-label-md font-bold text-on-surface'
                : 'rel-fmt-btn flex-1 py-1 px-3 text-text-secondary text-label-md';
        });
    }

    function showHub() {
        var hub = document.getElementById('relatorios-hub');
        var view = document.getElementById('relatorio-freq-view');
        var transport = document.getElementById('relatorio-transporte-view');
        if (hub) hub.classList.remove('hidden');
        if (view) view.classList.add('hidden');
        if (transport) transport.classList.add('hidden');
    }

    function showFreqView() {
        var hub = document.getElementById('relatorios-hub');
        var view = document.getElementById('relatorio-freq-view');
        var transport = document.getElementById('relatorio-transporte-view');
        if (hub) hub.classList.add('hidden');
        if (view) view.classList.remove('hidden');
        if (transport) transport.classList.add('hidden');
        populateFreqFilters();
        syncPeriodFields();
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    function populateFreqFilters() {
        var classes = getClassesSafe().filter(function (c) {
            return (c.status || 'Ativa') !== 'Inativa';
        });
        var turnoSel = document.getElementById('freq-turno');
        var turmaSel = document.getElementById('freq-turma');
        if (!turnoSel || !turmaSel) return;

        var prevTurno = turnoSel.value;
        var prevTurma = turmaSel.value;
        var turnos = [];
        classes.forEach(function (c) {
            if (c.turno && turnos.indexOf(c.turno) < 0) turnos.push(c.turno);
        });
        turnos.sort(function (a, b) { return String(a).localeCompare(String(b), 'pt-BR'); });

        turnoSel.innerHTML = '<option value="">Todos os turnos</option>';
        turnos.forEach(function (t) {
            turnoSel.innerHTML += '<option value="' + escapeHtml(t) + '">' + escapeHtml(t) + '</option>';
        });
        if ([].some.call(turnoSel.options, function (o) { return o.value === prevTurno; })) {
            turnoSel.value = prevTurno;
        }

        function refillTurmas() {
            var t = turnoSel.value;
            var list = classes.filter(function (c) { return !t || c.turno === t; });
            turmaSel.innerHTML = '<option value="">Selecione a turma...</option>';
            list.forEach(function (c) {
                var label = (c.code || '') + (c.serie ? ' — ' + c.serie : '') + (c.turno ? ' · ' + c.turno : '');
                turmaSel.innerHTML += '<option value="' + escapeHtml(c.code) + '">' + escapeHtml(label) + '</option>';
            });
            if ([].some.call(turmaSel.options, function (o) { return o.value === prevTurma; })) {
                turmaSel.value = prevTurma;
            }
        }

        turnoSel.onchange = refillTurmas;
        refillTurmas();

        var today = toIso(new Date());
        var dataEl = document.getElementById('freq-data');
        var mesEl = document.getElementById('freq-mes');
        if (dataEl && !dataEl.value) dataEl.value = today;
        if (mesEl && !mesEl.value) mesEl.value = today.slice(0, 7);
    }

    function syncPeriodFields() {
        var tipo = (document.getElementById('freq-tipo-periodo') || {}).value || 'dia';
        var campoData = document.getElementById('freq-campo-data');
        var campoMes = document.getElementById('freq-campo-mes');
        var campoBim = document.getElementById('freq-campo-bimestre');
        if (campoData) campoData.classList.toggle('hidden', tipo === 'mes' || tipo === 'bimestre');
        if (campoMes) campoMes.classList.toggle('hidden', tipo !== 'mes');
        if (campoBim) campoBim.classList.toggle('hidden', tipo !== 'bimestre');
    }

    function computeFreqRows(turmaCode, dias, alunos) {
        return alunos.map(function (aluno) {
            var marks = {};
            var presentes = 0;
            var faltas = 0;
            var semRegistro = 0;
            dias.forEach(function (iso) {
                var st = statusAlunoNoDia(String(aluno.id), iso, turmaCode);
                if (st === 'P' || st === 'FJ') {
                    marks[iso] = st;
                    presentes++;
                } else if (st === 'F') {
                    marks[iso] = 'F';
                    faltas++;
                } else {
                    marks[iso] = '—';
                    semRegistro++;
                    // Não conta "sem registro" como falta — só F explícita
                }
            });
            var denom = dias.length || 1;
            return {
                id: aluno.id,
                nome: aluno.nome || 'Aluno',
                marks: marks,
                presentes: presentes,
                faltas: faltas,
                semRegistro: semRegistro,
                pctFreq: Math.round((presentes / denom) * 1000) / 10,
                pctFalta: Math.round((faltas / denom) * 1000) / 10
            };
        });
    }

    function buildReport() {
        var turmaCode = (document.getElementById('freq-turma') || {}).value;
        if (!turmaCode) {
            if (typeof showToast === 'function') showToast('Selecione uma turma.', 'error');
            return;
        }
        var range = resolvePeriodRange();
        var dias = listDiasLetivos(range.start, range.end);
        var alunos = studentsOfTurma(turmaCode);
        var classes = getClassesSafe();
        var cls = classes.find(function (c) { return c.code === turmaCode; });
        var turmaLabel = cls
            ? (cls.code + (cls.serie ? ' — ' + cls.serie : '') + (cls.turno ? ' · ' + cls.turno : ''))
            : turmaCode;

        if (!dias.length) {
            if (typeof showToast === 'function') {
                showToast('Não há dias letivos no período selecionado (verifique o Calendário Letivo).', 'error');
            }
        }

        var gerarBtn = document.getElementById('btn-gerar-freq');
        if (gerarBtn) {
            gerarBtn.disabled = true;
            gerarBtn.textContent = 'Carregando batidas…';
        }

        function finish(rows) {
            lastFreqReport = {
                turmaCode: turmaCode,
                turmaLabel: turmaLabel,
                range: range,
                dias: dias,
                rows: rows
            };
            renderFreqTable(lastFreqReport);
            var emptyState = document.getElementById('freq-empty-state');
            var resultado = document.getElementById('freq-resultado');
            if (emptyState) emptyState.classList.add('hidden');
            if (resultado) resultado.classList.remove('hidden');
            if (typeof showToast === 'function') {
                showToast('Relatório gerado: ' + dias.length + ' dia(s) letivo(s).');
            }
            if (gerarBtn) {
                gerarBtn.disabled = false;
                gerarBtn.textContent = 'Gerar relatório';
            }
        }

        var prep =
            window.SigaSchoolData && typeof window.SigaSchoolData.hydrateStudents === 'function'
                ? window.SigaSchoolData.hydrateStudents()
                : Promise.resolve({ ok: true });

        Promise.resolve(prep)
            .catch(function () { return { ok: false }; })
            .then(function () {
                alunos = studentsOfTurma(turmaCode);
                return hydrateAttendanceForReport(turmaCode, dias, alunos);
            })
            .catch(function () { return { ok: false }; })
            .then(function () {
                finish(computeFreqRows(turmaCode, dias, alunos));
            });
    }

    function cellClass(mark) {
        if (mark === 'P') return 'text-primary font-bold';
        if (mark === 'F') return 'text-error font-bold';
        if (mark === 'FJ') return 'text-amber-700 font-bold';
        return 'text-text-secondary';
    }

    function renderFreqTable(report) {
        var thead = document.getElementById('freq-thead');
        var tbody = document.getElementById('freq-tbody');
        if (!thead || !tbody) return;

        document.getElementById('freq-meta-turma').textContent = report.turmaLabel;
        document.getElementById('freq-meta-periodo').textContent = report.range.label;
        document.getElementById('freq-meta-dias').textContent = report.dias.length + ' dias letivos';

        var head =
            '<tr>' +
            '<th class="px-3 py-3 text-left text-[11px] font-bold uppercase text-text-secondary sticky left-0 bg-surface-container-low min-w-[200px] z-20">Aluno</th>' +
            report.dias.map(function (iso) {
                return '<th class="px-1.5 py-3 text-center text-[10px] font-bold text-text-secondary whitespace-nowrap" title="' +
                    escapeHtml(formatBr(iso)) + '">' + escapeHtml(formatBrShort(iso)) + '</th>';
            }).join('') +
            '<th class="px-3 py-3 text-center text-[11px] font-bold uppercase text-primary whitespace-nowrap bg-primary/5">% Freq.</th>' +
            '<th class="px-3 py-3 text-center text-[11px] font-bold uppercase text-error whitespace-nowrap bg-error/5">% Faltas</th>' +
            '</tr>';
        thead.innerHTML = head;

        if (!report.rows.length) {
            tbody.innerHTML =
                '<tr><td colspan="' + (report.dias.length + 3) +
                '" class="px-4 py-10 text-center text-text-secondary">Nenhum aluno matriculado nesta turma.</td></tr>';
            return;
        }

        tbody.innerHTML = report.rows.map(function (row, idx) {
            var bg = idx % 2 ? 'bg-surface-container-low/40' : 'bg-white';
            return (
                '<tr class="' + bg + '">' +
                '<td class="px-3 py-2.5 font-semibold text-on-surface sticky left-0 ' + bg + ' z-10 whitespace-nowrap">' +
                escapeHtml(row.nome) + '</td>' +
                report.dias.map(function (iso) {
                    var m = row.marks[iso] || '—';
                    return '<td class="px-1.5 py-2.5 text-center text-xs ' + cellClass(m) + '">' + escapeHtml(m) + '</td>';
                }).join('') +
                '<td class="px-3 py-2.5 text-center font-bold text-primary bg-primary/5">' + row.pctFreq.toFixed(1).replace('.', ',') + '%</td>' +
                '<td class="px-3 py-2.5 text-center font-bold text-error bg-error/5">' + row.pctFalta.toFixed(1).replace('.', ',') + '%</td>' +
                '</tr>'
            );
        }).join('');
    }

    function exportFreqExcel() {
        if (!lastFreqReport) {
            if (typeof showToast === 'function') showToast('Gere o relatório antes de exportar.', 'error');
            return;
        }
        var report = lastFreqReport;
        var header = ['Aluno'].concat(report.dias.map(formatBr)).concat(['% Frequência', '% Faltas']);
        var aoa = [header];
        report.rows.forEach(function (row) {
            aoa.push(
                [row.nome]
                    .concat(report.dias.map(function (iso) { return row.marks[iso] || '—'; }))
                    .concat([row.pctFreq + '%', row.pctFalta + '%'])
            );
        });
        aoa.push([]);
        aoa.push(['Turma', report.turmaLabel]);
        aoa.push(['Período', report.range.label]);
        aoa.push(['Dias letivos', report.dias.length]);

        function downloadCsvFallback() {
            var csv = aoa.map(function (r) {
                return r.map(function (cell) {
                    var v = String(cell == null ? '' : cell);
                    if (/[;"\n]/.test(v)) return '"' + v.replace(/"/g, '""') + '"';
                    return v;
                }).join(';');
            }).join('\n');
            var blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
            var a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = 'frequencia_consolidada_' + report.turmaCode + '.csv';
            a.click();
            URL.revokeObjectURL(a.href);
        }

        if (typeof loadSheetJsLib === 'function') {
            loadSheetJsLib().then(function (XLSX) {
                var ws = XLSX.utils.aoa_to_sheet(aoa);
                var wb = XLSX.utils.book_new();
                XLSX.utils.book_append_sheet(wb, ws, 'Frequência');
                XLSX.writeFile(wb, 'frequencia_consolidada_' + report.turmaCode + '.xlsx');
                if (typeof showToast === 'function') showToast('Excel exportado com sucesso.');
            }).catch(function () {
                downloadCsvFallback();
                if (typeof showToast === 'function') showToast('Excel indisponível — CSV gerado.');
            });
        } else {
            downloadCsvFallback();
            if (typeof showToast === 'function') showToast('Arquivo CSV gerado para Excel.');
        }
    }

    function exportFreqPdf() {
        if (!lastFreqReport) {
            if (typeof showToast === 'function') showToast('Gere o relatório antes de exportar.', 'error');
            return;
        }
        var report = lastFreqReport;
        var schoolName = localStorage.getItem('siga_school_name') || 'Escola Estadual Dr. Romildo Veloso e Silva';
        var headDays = report.dias.map(function (iso) {
            return '<th>' + escapeHtml(formatBrShort(iso)) + '</th>';
        }).join('');
        var bodyRows = report.rows.map(function (row) {
            return '<tr><td class="nome">' + escapeHtml(row.nome) + '</td>' +
                report.dias.map(function (iso) {
                    return '<td class="c">' + escapeHtml(row.marks[iso] || '—') + '</td>';
                }).join('') +
                '<td class="c">' + row.pctFreq.toFixed(1).replace('.', ',') + '%</td>' +
                '<td class="c">' + row.pctFalta.toFixed(1).replace('.', ',') + '%</td></tr>';
        }).join('');

        var html =
            '<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"/><title>Frequência Consolidada</title>' +
            '<style>' +
            '@page{size:A4 landscape;margin:12mm}' +
            'body{font-family:Arial,sans-serif;color:#122;font-size:10px}' +
            'h1{font-size:16px;margin:0 0 4px}' +
            '.meta{margin-bottom:10px;color:#444}' +
            'table{border-collapse:collapse;width:100%}' +
            'th,td{border:1px solid #ccc;padding:3px 4px}' +
            'th{background:#eef4ff;font-size:9px}' +
            'td.nome{text-align:left;white-space:nowrap;font-weight:600}' +
            'td.c{text-align:center}' +
            '.foot{margin-top:8px;font-size:9px;color:#666}' +
            '</style></head><body>' +
            '<h1>Frequência Consolidada</h1>' +
            '<div class="meta"><b>' + escapeHtml(schoolName) + '</b><br>' +
            'Turma: <b>' + escapeHtml(report.turmaLabel) + '</b> · ' +
            escapeHtml(report.range.label) + ' · ' +
            '<b>' + report.dias.length + '</b> dias letivos</div>' +
            '<table><thead><tr><th>Aluno</th>' + headDays +
            '<th>% Freq.</th><th>% Faltas</th></tr></thead><tbody>' +
            (bodyRows || '<tr><td colspan="' + (report.dias.length + 3) + '">Sem alunos</td></tr>') +
            '</tbody></table>' +
            '<div class="foot">P = presença · F = falta · FJ = falta justificada (presença) · — = sem registro · ' +
            'Inclui batidas faciais individuais. % Faltas = apenas F. Base: dias letivos do Calendário.</div>' +
            '<script>window.onload=function(){window.print();}</script>' +
            '</body></html>';

        var w = window.open('', '_blank');
        if (!w) {
            if (typeof showToast === 'function') showToast('Permita pop-ups para imprimir o PDF.', 'error');
            return;
        }
        w.document.open();
        w.document.write(html);
        w.document.close();
    }

    function activeSchoolId() {
        try {
            var session = JSON.parse(localStorage.getItem('siga_session') || 'null') || {};
            return localStorage.getItem('siga_active_school') || session.schoolId || '';
        } catch (e) {
            return '';
        }
    }

    function setDailyExportLoading(loading, activeButton) {
        ['btn-export-dia-excel', 'btn-export-dia-pdf'].forEach(function (id) {
            var button = document.getElementById(id);
            if (!button) return;
            if (!button.dataset.originalHtml) button.dataset.originalHtml = button.innerHTML;
            button.disabled = loading;
            button.classList.toggle('opacity-60', loading);
            button.classList.toggle('cursor-wait', loading);
            button.innerHTML = loading && button === activeButton
                ? '<span class="material-symbols-outlined text-[18px] animate-spin">progress_activity</span>Carregando...'
                : button.dataset.originalHtml;
        });
    }

    function loadAllDayAttendance() {
        var dateEl = document.getElementById('freq-data');
        var dateIso = dateEl && dateEl.value;
        var schoolId = activeSchoolId();
        var sb = window.SigaSupabase && typeof window.SigaSupabase.getClient === 'function'
            ? window.SigaSupabase.getClient()
            : null;

        if (!dateIso) return Promise.reject(new Error('Selecione a data da frequência.'));
        if (!schoolId) return Promise.reject(new Error('Escola ativa não identificada.'));
        if (!sb) return Promise.reject(new Error('Não foi possível conectar ao banco de dados.'));

        var prep = window.SigaSchoolData && typeof window.SigaSchoolData.hydrateStudents === 'function'
            ? window.SigaSchoolData.hydrateStudents()
            : Promise.resolve({ ok: true });

        return Promise.resolve(prep).then(function () {
            return sb.from('attendance_calls')
                .select('id,class_code,entrada_consolidada,saida_consolidada')
                .eq('school_id', schoolId)
                .eq('day_date', dateIso)
                .or('entrada_consolidada.eq.true,saida_consolidada.eq.true');
        }).then(function (result) {
            if (result.error) throw result.error;
            var calls = result.data || [];
            if (!calls.length) throw new Error('Nenhuma turma possui chamada concluída nesta data.');
            return sb.from('attendance_marks')
                .select('call_id,student_id,phase,status,locked,source,marked_at')
                .in('call_id', calls.map(function (call) { return call.id; }))
                .then(function (marksResult) {
                    if (marksResult.error) throw marksResult.error;
                    return { calls: calls, marks: marksResult.data || [] };
                });
        }).then(function (data) {
            var classes = getClassesSafe();
            var marksByCallStudent = {};
            data.marks.forEach(function (mark) {
                var key = String(mark.call_id) + '|' + String(mark.student_id);
                if (!marksByCallStudent[key]) marksByCallStudent[key] = {};
                marksByCallStudent[key][mark.phase] = mark.status;
            });

            var rows = [];
            data.calls.forEach(function (call) {
                var cls = classes.find(function (item) {
                    return String(item.code || '') === String(call.class_code || '');
                });
                var turmaLabel = cls
                    ? (cls.code + (cls.serie ? ' — ' + cls.serie : '') + (cls.turno ? ' · ' + cls.turno : ''))
                    : call.class_code;

                studentsOfTurma(call.class_code).forEach(function (student) {
                    var marks = marksByCallStudent[String(call.id) + '|' + String(student.id)] || {};
                    var entrada = marks.entrada || (call.entrada_consolidada ? 'F' : '—');
                    var saida = marks.saida || (call.saida_consolidada ? 'F' : '—');
                    rows.push({
                        turma: turmaLabel,
                        turmaCode: call.class_code,
                        aluno: student.nome || 'Aluno sem nome',
                        entrada: entrada,
                        saida: saida,
                        frequencia: entrada !== '—' && saida !== '—'
                            ? consolidarStatusDia(entrada, saida)
                            : 'Pendente'
                    });
                });
            });

            rows.sort(function (a, b) {
                return String(a.turma).localeCompare(String(b.turma), 'pt-BR') ||
                    String(a.aluno).localeCompare(String(b.aluno), 'pt-BR');
            });
            return {
                dateIso: dateIso,
                rows: rows,
                classCount: new Set(data.calls.map(function (call) { return String(call.class_code); })).size
            };
        });
    }

    function dailyExportError(error) {
        var message = error && error.message ? error.message : 'Não foi possível gerar o relatório.';
        if (typeof showToast === 'function') showToast(message, 'error');
    }

    function exportAllDayExcel(event) {
        var button = event && event.currentTarget;
        setDailyExportLoading(true, button);
        loadAllDayAttendance().then(function (report) {
            var aoa = [['Turma', 'Aluno', 'Entrada', 'Saída', 'Frequência']];
            report.rows.forEach(function (row) {
                aoa.push([row.turma, row.aluno, row.entrada, row.saida, row.frequencia]);
            });

            function downloadCsvFallback() {
                var csv = aoa.map(function (line) {
                    return line.map(function (cell) {
                        var value = String(cell == null ? '' : cell);
                        return /[;"\n]/.test(value) ? '"' + value.replace(/"/g, '""') + '"' : value;
                    }).join(';');
                }).join('\n');
                var blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
                var link = document.createElement('a');
                link.href = URL.createObjectURL(blob);
                link.download = 'frequencia_todas_turmas_' + report.dateIso + '.csv';
                link.click();
                URL.revokeObjectURL(link.href);
            }

            if (typeof loadSheetJsLib !== 'function') {
                downloadCsvFallback();
                if (typeof showToast === 'function') showToast('Arquivo CSV gerado para Excel.');
                return;
            }
            return loadSheetJsLib().then(function (XLSX) {
                var ws = XLSX.utils.aoa_to_sheet(aoa);
                ws['!cols'] = [{ wch: 28 }, { wch: 42 }, { wch: 12 }, { wch: 12 }, { wch: 14 }];
                var wb = XLSX.utils.book_new();
                XLSX.utils.book_append_sheet(wb, ws, 'Frequência do dia');
                XLSX.writeFile(wb, 'frequencia_todas_turmas_' + report.dateIso + '.xlsx');
                if (typeof showToast === 'function') showToast('Frequência de todas as turmas exportada.');
            }).catch(function () {
                downloadCsvFallback();
                if (typeof showToast === 'function') showToast('Excel indisponível — CSV gerado.');
            });
        }).catch(dailyExportError).finally(function () {
            setDailyExportLoading(false);
        });
    }

    function exportAllDayPdf(event) {
        var button = event && event.currentTarget;
        setDailyExportLoading(true, button);
        loadAllDayAttendance().then(function (report) {
            var schoolName = localStorage.getItem('siga_school_name') ||
                'Escola Estadual Prof. Geraldo Angelo Palmeira';
            var rowsByClass = {};
            report.rows.forEach(function (row) {
                if (!rowsByClass[row.turma]) rowsByClass[row.turma] = [];
                rowsByClass[row.turma].push(row);
            });
            var classReports = Object.keys(rowsByClass).map(function (className) {
                var classRows = rowsByClass[className];
                var bodyRows = classRows.map(function (row) {
                    var rowClass = row.frequencia === 'F' ? 'absent' :
                        (row.frequencia === 'P' || row.frequencia === 'FJ' ? 'present' : 'pending');
                    return '<tr class="' + rowClass + '"><td class="student">' +
                        escapeHtml(row.aluno) + '</td><td>' + escapeHtml(row.entrada) + '</td><td>' +
                        escapeHtml(row.saida) + '</td><td><b>' + escapeHtml(row.frequencia) + '</b></td></tr>';
                }).join('');
                return '<section class="class-report"><h1>Frequência diária</h1>' +
                    '<div class="meta"><b>' + escapeHtml(schoolName) + '</b><br>Data: <b>' +
                    escapeHtml(formatBr(report.dateIso)) + '</b> · Turma: <b>' +
                    escapeHtml(className) + '</b> · Alunos: <b>' + classRows.length + '</b></div>' +
                    '<table><thead><tr><th>Aluno</th><th>Entrada</th><th>Saída</th>' +
                    '<th>Frequência</th></tr></thead><tbody>' + bodyRows + '</tbody></table>' +
                    '<div class="foot">P = presença · F = falta · FJ = falta justificada · ' +
                    'Pendente = uma das fases ainda não foi concluída.</div></section>';
            }).join('');
            var html = '<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8">' +
                '<title>Frequência de todas as turmas</title><style>' +
                '@page{size:A4 portrait;margin:12mm}body{font-family:Arial,sans-serif;color:#122;font-size:9px;' +
                '-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}' +
                'h1{font-size:16px;margin:0 0 4px}.meta{color:#444;margin-bottom:10px}' +
                '.class-report:not(:first-child){break-before:page;page-break-before:always}' +
                'table{width:100%;border-collapse:collapse}thead{display:table-header-group}' +
                'th,td{border:1px solid #bbb;padding:4px;text-align:center}th{background:#e9f4ed}' +
                'td.student{text-align:left}tr{break-inside:avoid;page-break-inside:avoid}' +
                'tr.present td{background-color:#e8f5e9!important;-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}' +
                'tr.absent td{background-color:#fde8e7!important;-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}' +
                'tr.pending td{background-color:#f5f5f5!important;-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}' +
                '.foot{margin-top:8px;color:#666}' +
                '</style></head><body>' + classReports +
                '<script>window.onload=function(){window.print();}</script></body></html>';
            var printWindow = window.open('', '_blank');
            if (!printWindow) throw new Error('Permita pop-ups para imprimir o PDF.');
            printWindow.document.open();
            printWindow.document.write(html);
            printWindow.document.close();
        }).catch(dailyExportError).finally(function () {
            setDailyExportLoading(false);
        });
    }

    function showTransportView() {
        var hub = document.getElementById('relatorios-hub');
        var freq = document.getElementById('relatorio-freq-view');
        var view = document.getElementById('relatorio-transporte-view');
        if (hub) hub.classList.add('hidden');
        if (freq) freq.classList.add('hidden');
        if (view) view.classList.remove('hidden');
        loadTransportReport();
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    function loadTransportReport() {
        var tbody = document.getElementById('transporte-tbody');
        var api = window.SigaSupabase;
        var schoolId = activeSchoolId();
        if (!tbody) return;
        tbody.innerHTML = '<tr><td colspan="7" class="px-4 py-8 text-center text-text-secondary">Carregando cadastros…</td></tr>';
        if (!api || typeof api.getClient !== 'function' || !schoolId) {
            tbody.innerHTML = '<tr><td colspan="7" class="px-4 py-8 text-center text-error">Entre novamente na escola para consultar o relatório.</td></tr>';
            return;
        }
        var turno = (document.getElementById('transporte-turno') || {}).value || '';
        var query = api.getClient().from('student_transport_registrations')
            .select('student_name,class_code,shift,uses_transport,responsible_name,address,neighborhood,updated_at')
            .eq('school_id', schoolId)
            .order('student_name', { ascending: true });
        query.then(function (res) {
            if (res.error) {
                tbody.innerHTML = '<tr><td colspan="7" class="px-4 py-8 text-center text-error">' + escapeHtml(res.error.message) + '</td></tr>';
                return;
            }
            var rows = res.data || [];
            if (turno) {
                rows = rows.filter(function (row) {
                    return String(row.shift || '').toLocaleLowerCase('pt-BR') === turno.toLocaleLowerCase('pt-BR');
                });
            }
            var sim = rows.filter(function (row) { return row.uses_transport; }).length;
            var totalEl = document.getElementById('transporte-total');
            var simEl = document.getElementById('transporte-sim');
            var naoEl = document.getElementById('transporte-nao');
            if (totalEl) totalEl.textContent = rows.length;
            if (simEl) simEl.textContent = sim;
            if (naoEl) naoEl.textContent = rows.length - sim;
            if (!rows.length) {
                tbody.innerHTML = '<tr><td colspan="7" class="px-4 py-10 text-center text-text-secondary">Nenhum aluno respondeu neste turno.</td></tr>';
                return;
            }
            tbody.innerHTML = rows.map(function (row) {
                var yes = !!row.uses_transport;
                return '<tr class="border-t border-border-subtle">' +
                    '<td class="px-4 py-3 font-semibold whitespace-nowrap">' + escapeHtml(row.student_name || '—') + '</td>' +
                    '<td class="px-4 py-3 whitespace-nowrap">' + escapeHtml(row.class_code || '—') + '</td>' +
                    '<td class="px-4 py-3">' + escapeHtml(row.shift || '—') + '</td>' +
                    '<td class="px-4 py-3"><span class="px-2 py-1 rounded-full text-xs font-bold ' +
                    (yes ? 'bg-primary/10 text-primary' : 'bg-surface-container-high text-text-secondary') + '">' +
                    (yes ? 'Sim' : 'Não') + '</span></td>' +
                    '<td class="px-4 py-3">' + escapeHtml(yes ? row.responsible_name || '—' : '—') + '</td>' +
                    '<td class="px-4 py-3 min-w-[220px]">' + escapeHtml(yes ? row.address || '—' : '—') + '</td>' +
                    '<td class="px-4 py-3">' + escapeHtml(yes ? row.neighborhood || '—' : '—') + '</td></tr>';
            }).join('');
        }).catch(function () {
            tbody.innerHTML = '<tr><td colspan="7" class="px-4 py-8 text-center text-error">Não foi possível carregar o relatório.</td></tr>';
        });
    }

    function bindHubUi() {
        document.querySelectorAll('.rel-cat-btn').forEach(function (btn) {
            btn.addEventListener('click', function () {
                setActiveCategory(btn.getAttribute('data-categoria') || 'todos');
            });
        });
        document.querySelectorAll('.rel-fmt-btn').forEach(function (btn) {
            btn.addEventListener('click', function () {
                setActiveFormato(btn.getAttribute('data-formato') || 'pdf');
            });
        });
        document.querySelectorAll('#relatorios-hub .group').forEach(function (card) {
            card.addEventListener('mouseenter', function () { card.style.transform = 'translateY(-4px)'; });
            card.addEventListener('mouseleave', function () { card.style.transform = 'translateY(0)'; });
        });

        function toastEmBreve() {
            if (typeof showToast === 'function') showToast('Esta tela ainda será configurada. Em breve.');
        }
        var btnNovo = document.getElementById('btn-novo-relatorio');
        var btnHist = document.getElementById('btn-historico-relatorio');
        if (btnNovo) btnNovo.addEventListener('click', toastEmBreve);
        if (btnHist) btnHist.addEventListener('click', toastEmBreve);

        var cardFreq = document.getElementById('card-freq-consolidada');
        if (cardFreq) cardFreq.addEventListener('click', showFreqView);
        var cardTransport = document.getElementById('card-transporte-escolar');
        if (cardTransport) cardTransport.addEventListener('click', showTransportView);
        var backTransport = document.getElementById('btn-voltar-transporte');
        if (backTransport) backTransport.addEventListener('click', showHub);
        var loadTransport = document.getElementById('btn-carregar-transporte');
        if (loadTransport) loadTransport.addEventListener('click', loadTransportReport);
        var turnoTransport = document.getElementById('transporte-turno');
        if (turnoTransport) turnoTransport.addEventListener('change', loadTransportReport);
    }

    function bindFreqUi() {
        var back = document.getElementById('btn-voltar-relatorios');
        if (back) back.addEventListener('click', showHub);

        var tipo = document.getElementById('freq-tipo-periodo');
        if (tipo) tipo.addEventListener('change', syncPeriodFields);

        var gerar = document.getElementById('btn-gerar-freq');
        if (gerar) gerar.addEventListener('click', buildReport);

        var excel = document.getElementById('btn-export-freq-excel');
        var pdf = document.getElementById('btn-export-freq-pdf');
        if (excel) excel.addEventListener('click', exportFreqExcel);
        if (pdf) pdf.addEventListener('click', exportFreqPdf);

        var dailyExcel = document.getElementById('btn-export-dia-excel');
        var dailyPdf = document.getElementById('btn-export-dia-pdf');
        if (dailyExcel) dailyExcel.addEventListener('click', exportAllDayExcel);
        if (dailyPdf) dailyPdf.addEventListener('click', exportAllDayPdf);
    }

    window.initRelatoriosPage = function () {
        fillPeriodoSelect();
        setActiveCategory('todos');
        setActiveFormato('pdf');
        bindHubUi();
        bindFreqUi();
    };

    window.openFrequenciaConsolidada = showFreqView;
})();
