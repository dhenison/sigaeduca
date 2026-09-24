/**
 * Histórico Escolar do Ensino Médio — modelo da secretaria (EGAP).
 * O formulário segue o arquivo oficial e todos os campos em branco são editáveis.
 */
(function () {
  'use strict';

  var TIPO = 'Histórico Escolar do Ensino Médio';

  var FORMACAO = [
    {
      area: 'LINGUAGENS E SUAS TECNOLOGIAS',
      itens: [
        ['arte', 'ARTE'],
        ['edfis', 'EDUCAÇÃO FÍSICA'],
        ['ingles', 'LÍNGUA INGLESA'],
        ['portugues', 'LÍNGUA PORTUGUESA E SUAS LITERATURAS']
      ]
    },
    { area: 'MATEMÁTICA E TEC', itens: [['matematica', 'MATEMÁTICA']] },
    {
      area: 'CIÊNCIAS DA NATUREZA E SUAS TECNOLOGIAS',
      itens: [
        ['quimica', 'QUÍMICA'],
        ['fisica', 'FÍSICA'],
        ['biologia', 'BIOLOGIA']
      ]
    },
    {
      area: 'CIÊNCIAS HUMANAS E SUAS TECNOLOGIAS',
      itens: [
        ['historia', 'HISTÓRIA'],
        ['geografia', 'GEOGRAFIA'],
        ['filosofia', 'FILOSOFIA'],
        ['sociologia', 'SOCIOLOGIA']
      ]
    }
  ];

  var APROF = [
    {
      sigla: 'I – LGG',
      area: 'LINGUAGENS E SUAS TECNOLOGIAS',
      itens: [
        ['lgg1', 'APROFUNDAMENTO DE LINGUAGENS E SUAS TECNOLOGIAS'],
        ['lgg2', 'PRODUÇÃO TEXTUAL'],
        ['lgg3', 'APROFUNDAMENTO DE ÁREAS DE MATEMÁTICA E SUAS TECNOLOGIAS'],
        ['lgg4', 'EDUCAÇÃO AMBIENTAL, SUSTENTABILIDADE E CLIMA']
      ]
    },
    {
      sigla: 'II – MAT',
      area: 'MATEMÁTICA E SUAS TECNOLOGIAS',
      itens: [
        ['mat1', 'APROFUNDAMENTO DE ÁREAS DE MATEMÁTICA E SUAS TECNOLOGIAS'],
        ['mat2', 'APROFUNDAMENTO DE LINGUAGENS E SUAS TECNOLOGIAS'],
        ['mat3', 'EDUCAÇÃO AMBIENTAL, SUSTENTABILIDADE E CLIMA']
      ]
    },
    {
      sigla: 'III – CHSA',
      area: 'CIÊNCIAS HUMANAS E SOCIAIS APLICADAS',
      itens: [
        ['chsa1', 'APROFUNDAMENTO DA AREA DE CIENCIAS HUMANAS E SOCIAIS APLICADAS'],
        ['chsa2', 'SOCIEDADE, CULTURA E TECNOLOGIA'],
        ['chsa3', 'APROFUNDAMENTO DE ÁREA LINGUAGENS E SUAS TECNOLOGIAS'],
        ['chsa4', 'EDUCAÇÃO AMBIENTAL, SUSTENTABILIDADE E CLIMA']
      ]
    },
    {
      sigla: 'IV – CHT',
      area: 'CIÊNCIAS DA NATUREZA E SUAS TECNOLOGIAS',
      itens: [
        ['cht1', 'APROFUNDAMENTO DA AREA DE CIENCIAS DA NATUREZA E SUAS TECNOLOGIAS'],
        ['cht2', 'SOCIEDADE, CULTURA E TECNOLOGIA'],
        ['cht3', 'APROFUNDAMENTO DE ÁREA LINGUAGENS E SUAS TECNOLOGIAS'],
        ['cht4', 'EDUCAÇÃO AMBIENTAL, SUSTENTABILIDADE E CLIMA']
      ]
    }
  ];

  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function triplo(source, key) {
    var row = source && source[key];
    if (!Array.isArray(row)) return ['', '', ''];
    return [row[0] || '', row[1] || '', row[2] || ''];
  }

  function vazio() {
    var notas = {};
    FORMACAO.forEach(function (bloco) {
      bloco.itens.forEach(function (item) { notas[item[0]] = ['', '', '']; });
    });
    APROF.forEach(function (bloco) {
      bloco.itens.forEach(function (item) { notas[item[0]] = ['', '', '']; });
    });
    return {
      aluno: '',
      documentos: '',
      pai: '',
      rg: '',
      mae: '',
      cpf: '',
      nascimento: '',
      naturalidade: 'TUCUMÃ',
      uf: 'PA',
      notas: notas,
      frequencia: ['', '', ''],
      carga: ['', '', ''],
      resultado: ['', '', ''],
      series: [
        { ano: '', escola: '', cidade: '' },
        { ano: '', escola: '', cidade: '' },
        { ano: '', escola: '', cidade: '' }
      ],
      dependencia: '',
      observacoes: '',
      localData: ''
    };
  }

  function mesclar(data) {
    var base = vazio();
    var src = data || {};
    Object.keys(base).forEach(function (key) {
      if (key === 'notas' || key === 'series' || key === 'frequencia' || key === 'carga' || key === 'resultado') return;
      if (src[key] != null && String(src[key]).length) base[key] = src[key];
    });
    Object.keys(base.notas).forEach(function (key) {
      base.notas[key] = triplo(src.notas, key);
    });
    base.frequencia = triplo({ f: src.frequencia }, 'f');
    base.carga = triplo({ f: src.carga }, 'f');
    base.resultado = triplo({ f: src.resultado }, 'f');
    for (var i = 0; i < 3; i++) {
      var serie = (src.series && src.series[i]) || {};
      base.series[i] = {
        ano: serie.ano || '',
        escola: serie.escola || '',
        cidade: serie.cidade || ''
      };
    }
    return base;
  }

  function dataHojeBr() {
    var d = new Date();
    var p = function (n) { return String(n).padStart(2, '0'); };
    return p(d.getDate()) + '/' + p(d.getMonth() + 1) + '/' + d.getFullYear();
  }

  function campo(key, value, placeholder) {
    return '<input class="h-in" data-h="' + esc(key) + '" value="' + esc(value) + '"' +
      (placeholder ? ' placeholder="' + esc(placeholder) + '"' : '') + ' type="text"/>';
  }

  function notasEdit(key, valores) {
    return [0, 1, 2].map(function (i) {
      return '<td class="h-nota">' + campo('nota:' + key + ':' + i, valores[i], '*') + '</td>';
    }).join('');
  }

    function linhaResumo(rotulo, key, valores) {
    return '<tr><td class="h-label" colspan="3">' + rotulo + '</td>' +
      [0, 1, 2].map(function (i) {
        return '<td class="h-nota">' + campo(key + ':' + i, valores[i], '') + '</td>';
      }).join('') + '</tr>';
  }

  function renderEditor(container, data) {
    if (!container) return;
    var h = mesclar(data);
    if (!h.localData) h.localData = 'TUCUMÃ/PA ' + dataHojeBr();

    var fgRows = [];
    var fgCount = 0;
    FORMACAO.forEach(function (bloco) { fgCount += bloco.itens.length; });
    var fgIndex = 0;
    FORMACAO.forEach(function (bloco) {
      bloco.itens.forEach(function (item, idx) {
        var cells = '';
        if (fgIndex === 0) {
          cells += '<td class="h-vert" rowspan="' + fgCount + '">FORMAÇÃO GERAL BÁSICA</td>';
        }
        if (idx === 0) {
          cells += '<td class="h-area" rowspan="' + bloco.itens.length + '">' + esc(bloco.area) + '</td>';
        }
        cells += '<td class="h-disc">' + esc(item[1]) + '</td>' + notasEdit(item[0], h.notas[item[0]]);
        fgRows.push('<tr>' + cells + '</tr>');
        fgIndex += 1;
      });
    });

    var apRows = [];
    APROF.forEach(function (bloco) {
      bloco.itens.forEach(function (item, idx) {
        var cells = '';
        if (idx === 0) {
          cells += '<td class="h-area" rowspan="' + bloco.itens.length + '"><b>' + esc(bloco.sigla) + '</b><br>' + esc(bloco.area) + '</td>';
        }
        cells += '<td class="h-disc" colspan="2">' + esc(item[1]) + '</td>' + notasEdit(item[0], h.notas[item[0]]);
        apRows.push('<tr>' + cells + '</tr>');
      });
    });

    var seriesRows = ['1ª', '2ª', '3ª'].map(function (rotulo, i) {
      var serie = h.series[i];
      return '<tr><td class="h-center">' + rotulo + '</td>' +
        '<td>' + campo('serie-ano:' + i, serie.ano, 'Ano') + '</td>' +
        '<td colspan="2">' + campo('serie-escola:' + i, serie.escola, 'Estabelecimento de ensino') + '</td>' +
        '<td>' + campo('serie-cidade:' + i, serie.cidade, 'Cidade / UF') + '</td></tr>';
    }).join('');

    container.innerHTML =
      '<style>.h-sheet{font-size:11px;color:#111;background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:12px}.h-head{display:flex;align-items:center;justify-content:space-between;gap:8px;text-align:center}.h-head img{width:64px;height:64px;object-fit:contain}.h-head div{flex:1;line-height:1.25}.h-escola,.h-matriz{text-align:center;font-weight:700;margin-top:4px}.h-table{width:100%;border-collapse:collapse;margin-top:6px}.h-table td,.h-table th{border:1px solid #111;padding:2px 4px;vertical-align:middle}.h-table th{text-align:center;font-size:10px}.h-in{width:100%;border:0;background:transparent;font:inherit;padding:2px;outline:none}.h-in:focus{background:#f4f8f5}.h-k,.h-label,.h-sec{font-weight:700;white-space:nowrap}.h-sec{text-align:center}.h-vert{width:22px;writing-mode:vertical-rl;transform:rotate(180deg);text-align:center;font-weight:700;font-size:10px}.h-area{width:120px;font-size:10px;font-weight:700;text-align:center}.h-nota{width:72px}.h-nota .h-in{text-align:center}.h-legenda{font-size:10px;margin:8px 0 0}.h-bloco{border:1px solid #111;border-top:0;padding:4px}.h-assina{display:flex;justify-content:space-between;align-items:flex-end;margin-top:12px}.h-linha{display:block;width:220px;border-top:1px solid #111;margin-bottom:2px}</style>' +
      '<p class="text-[11px] text-text-secondary mb-2">Preencha o histórico. Os campos com * recebem a nota de cada série. O que ficar em branco sai em branco na impressão.</p>' +
      '<div class="h-sheet">' +
      '<div class="h-head">' +
      '<img alt="Brasão do Pará" src="assets/historico/image2.png"/>' +
      '<div><strong>GOVERNO DO ESTADO DO PARÁ</strong><br>SECRETARIA ESPECIAL DE ESTADO DE PROMOÇÃO SOCIAL<br>SECRETARIA DE ESTADO DE EDUCAÇÃO<br><b>HISTÓRICO ESCOLAR DO ENSINO MÉDIO</b></div>' +
      '<img alt="Logo da Escola Estadual Prof. Geraldo Ângelo Pereira" src="assets/historico/image1.jpeg"/>' +
      '</div>' +
      '<div class="h-escola">ESCOLA ESTADUAL PROF GERALDO ÂNGELO PEREIRA<br>CIDADE: TUCUMÃ &nbsp; UF: PARÁ &nbsp; E-mail: escola.2300@escola.seduc.pa.gov.br</div>' +
      '<div class="h-matriz">MATRIZ CURRICULAR RESOLUÇÃO N° 595 DE 23 DE DEZEMBRO DE 2025</div>' +
      '<table class="h-table"><tbody>' +
      '<tr><td class="h-k">ALUNO:</td><td colspan="3">' + campo('aluno', h.aluno, 'Nome do aluno') + '</td><td class="h-k">DOCUMENTOS DO ALUNO:</td><td colspan="2">' + campo('documentos', h.documentos, '') + '</td></tr>' +
      '<tr><td class="h-k">PAI:</td><td colspan="3">' + campo('pai', h.pai, '') + '</td><td class="h-k">RG:</td><td colspan="2">' + campo('rg', h.rg, '') + '</td></tr>' +
      '<tr><td class="h-k">MÃE:</td><td colspan="3">' + campo('mae', h.mae, '') + '</td><td class="h-k">CPF:</td><td colspan="2">' + campo('cpf', h.cpf, '') + '</td></tr>' +
      '<tr><td class="h-k" colspan="2">DATA DE NASCIMENTO:</td><td>' + campo('nascimento', h.nascimento, 'dd/mm/aaaa') + '</td><td class="h-k">NATURALIDADE:</td><td>' + campo('naturalidade', h.naturalidade, '') + '</td><td class="h-k">UF:</td><td>' + campo('uf', h.uf, '') + '</td></tr>' +
      '</tbody></table>' +
      '<table class="h-table h-grid"><thead><tr><th colspan="3">COMPONENTES CURRICULARES</th><th colspan="3">SÉRIES</th></tr>' +
      '<tr><th colspan="3"></th><th>1ª</th><th>2ª</th><th>3ª</th></tr></thead><tbody>' +
      fgRows.join('') +
      '<tr><td class="h-sec" colspan="3">APROFUNDAMENTOS CURRICULARES</td><td></td><td></td><td></td></tr>' +
      apRows.join('') +
      linhaResumo('FREQÜÊNCIA ANUAL %', 'frequencia', h.frequencia) +
      linhaResumo('CARGA HORÁRIA ANUAL', 'carga', h.carga) +
      linhaResumo('RESULTADO FINAL', 'resultado', h.resultado) +
      '</tbody></table>' +
      '<table class="h-table"><thead><tr><th>SÉRIES</th><th>ANO</th><th colspan="2">ESTABELECIMENTO DE ENSINO</th><th>CIDADE / UF</th></tr></thead><tbody>' +
      seriesRows +
      '</tbody></table>' +
      '<div class="h-bloco"><b>DEPENDÊNCIA DE ESTUDOS:</b><br>' + campo('dependencia', h.dependencia, '') + '</div>' +
      '<div class="h-bloco"><b>OBSERVAÇÕES:</b><br>' + campo('observacoes', h.observacoes, '') + '</div>' +
      '<p class="h-legenda">NOTA DE APROVAÇÃO IGUAL OU SUPERIOR A 5,0<br>LEGENDA: APV: APROVADO. REP: REPROVADO. RPF: REPROVADO POR FALTA. APD: APROVADO COM DEPENDÊNCIA. EM AND.: EM ANDAMENTO. APR: ALUNO APROVADO CONFORME RESOLUÇÃO 20/2021 do CEE/PA. APC: APROVADO PELO CONSELHO DE CLASSE.</p>' +
      '<div class="h-assina"><div><span class="h-linha"></span>DIRETOR(A)</div><div>' + campo('localData', h.localData, 'TUCUMÃ/PA dd/mm/aaaa') + '</div></div>' +
      '</div>';
  }

  function ler(container, key) {
    var el = container.querySelector('[data-h="' + key + '"]');
    return el ? String(el.value || '').trim() : '';
  }

  function collect(container) {
    var h = vazio();
    if (!container) return h;
    ['aluno', 'documentos', 'pai', 'rg', 'mae', 'cpf', 'nascimento', 'naturalidade', 'uf', 'dependencia', 'observacoes', 'localData'].forEach(function (key) {
      h[key] = ler(container, key);
    });
    Object.keys(h.notas).forEach(function (key) {
      h.notas[key] = [0, 1, 2].map(function (i) { return ler(container, 'nota:' + key + ':' + i); });
    });
    h.frequencia = [0, 1, 2].map(function (i) { return ler(container, 'frequencia:' + i); });
    h.carga = [0, 1, 2].map(function (i) { return ler(container, 'carga:' + i); });
    h.resultado = [0, 1, 2].map(function (i) { return ler(container, 'resultado:' + i); });
    h.series = [0, 1, 2].map(function (i) {
      return {
        ano: ler(container, 'serie-ano:' + i),
        escola: ler(container, 'serie-escola:' + i),
        cidade: ler(container, 'serie-cidade:' + i)
      };
    });
    return h;
  }

  function celula(valor) {
    return '<td class="hn">' + esc(valor) + '</td>';
  }

  function buildPrintHtml(doc) {
    var h = mesclar(doc && doc.historico);
    function linhaDisc(nome, key, extra) {
      var vals = h.notas[key] || ['', '', ''];
      return '<tr>' + (extra || '') + '<td class="hd">' + esc(nome) + '</td>' +
        vals.map(celula).join('') + '</tr>';
    }
    var fg = '';
    var fgCount = 0;
    FORMACAO.forEach(function (b) { fgCount += b.itens.length; });
    var started = false;
    FORMACAO.forEach(function (bloco) {
      bloco.itens.forEach(function (item, idx) {
        var extra = '';
        if (!started) {
          extra += '<td class="hv" rowspan="' + fgCount + '">FORMAÇÃO GERAL BÁSICA</td>';
          started = true;
        }
        if (idx === 0) extra += '<td class="ha" rowspan="' + bloco.itens.length + '">' + esc(bloco.area) + '</td>';
        fg += linhaDisc(item[1], item[0], extra);
      });
    });
    var ap = '';
    APROF.forEach(function (bloco) {
      bloco.itens.forEach(function (item, idx) {
        var extra = idx === 0
          ? '<td class="ha" rowspan="' + bloco.itens.length + '"><b>' + esc(bloco.sigla) + '</b><br>' + esc(bloco.area) + '</td>'
          : '';
        var vals = h.notas[item[0]] || ['', '', ''];
        ap += '<tr>' + extra + '<td class="hd" colspan="2">' + esc(item[1]) + '</td>' + vals.map(celula).join('') + '</tr>';
      });
    });
    function resumo(rotulo, lista) {
      return '<tr><td class="hl" colspan="3">' + rotulo + '</td>' + (lista || ['', '', '']).map(celula).join('') + '</tr>';
    }
    var series = ['1ª', '2ª', '3ª'].map(function (rotulo, i) {
      var s = h.series[i];
      return '<tr><td>' + rotulo + '</td><td>' + esc(s.ano) + '</td><td colspan="2">' + esc(s.escola) + '</td><td>' + esc(s.cidade) + '</td></tr>';
    }).join('');
    var logo = new URL('assets/historico/image1.jpeg', window.location.href).href;
    var brasao = new URL('assets/historico/image2.png', window.location.href).href;
    var css =
      '@page{size:A4 portrait;margin:6mm}' +
      'html,body{margin:0;padding:0;background:#fff;color:#111;font-family:Arial,Helvetica,sans-serif}' +
      'body{-webkit-print-color-adjust:exact;print-color-adjust:exact}' +
      '.sheet{width:198mm;margin:0 auto;font-size:7.5pt;line-height:1.15}' +
      '.head{display:flex;align-items:center;justify-content:space-between;gap:8px;text-align:center}' +
      '.head img{width:58px;height:58px;object-fit:contain}' +
      '.head div{flex:1;font-size:8pt}' +
      '.escola,.matriz{text-align:center;font-weight:700;margin-top:2px}' +
      'table{width:100%;border-collapse:collapse;margin-top:3px}' +
      'td,th{border:1px solid #111;padding:1px 3px;vertical-align:middle}' +
      'th{font-size:7pt;text-align:center}' +
      '.hv{width:18px;writing-mode:vertical-rl;transform:rotate(180deg);text-align:center;font-weight:700;font-size:6.5pt}' +
      '.ha{width:92px;font-size:6.2pt;font-weight:700;text-align:center}' +
      '.hd{font-size:6.5pt}.hn{width:42px;text-align:center;font-size:7pt;height:12px}' +
      '.hl{font-weight:700;font-size:7pt}.k{font-weight:700;white-space:nowrap;width:1%}' +
      '.leg{font-size:6.2pt;margin:4px 0 0}.bloco{min-height:16px;border:1px solid #111;border-top:0;padding:2px 4px}' +
      '.assina{display:flex;justify-content:space-between;align-items:flex-end;margin-top:10px;font-size:8pt}' +
      '.linha{display:block;width:220px;border-top:1px solid #111;margin-bottom:2px}';
    var body =
      '<div class="sheet"><div class="head"><img src="' + brasao + '" alt=""><div>' +
      '<strong>GOVERNO DO ESTADO DO PARÁ</strong><br>SECRETARIA ESPECIAL DE ESTADO DE PROMOÇÃO SOCIAL<br>' +
      'SECRETARIA DE ESTADO DE EDUCAÇÃO<br><b>HISTÓRICO ESCOLAR DO ENSINO MÉDIO</b></div>' +
      '<img src="' + logo + '" alt=""></div>' +
      '<div class="escola">ESCOLA ESTADUAL PROF GERALDO ÂNGELO PEREIRA<br>CIDADE: TUCUMÃ &nbsp; UF: PARÁ &nbsp; E-mail: escola.2300@escola.seduc.pa.gov.br</div>' +
      '<div class="matriz">MATRIZ CURRICULAR RESOLUÇÃO N° 595 DE 23 DE DEZEMBRO DE 2025</div>' +
      '<table><tr><td class="k">ALUNO:</td><td colspan="3">' + esc(h.aluno) + '</td><td class="k">DOCUMENTOS DO ALUNO:</td><td>' + esc(h.documentos) + '</td></tr>' +
      '<tr><td class="k">PAI:</td><td colspan="3">' + esc(h.pai) + '</td><td class="k">RG:</td><td>' + esc(h.rg) + '</td></tr>' +
      '<tr><td class="k">MÃE:</td><td colspan="3">' + esc(h.mae) + '</td><td class="k">CPF:</td><td>' + esc(h.cpf) + '</td></tr>' +
      '<tr><td class="k" colspan="2">DATA DE NASCIMENTO:</td><td>' + esc(h.nascimento) + '</td><td class="k">NATURALIDADE:</td><td>' + esc(h.naturalidade) + '</td><td class="k">UF: ' + esc(h.uf) + '</td></tr></table>' +
      '<table><thead><tr><th colspan="3">COMPONENTES CURRICULARES</th><th colspan="3">SÉRIES</th></tr>' +
      '<tr><th colspan="3"></th><th>1ª</th><th>2ª</th><th>3ª</th></tr></thead><tbody>' +
      fg + '<tr><td class="hl" colspan="3">APROFUNDAMENTOS CURRICULARES</td><td></td><td></td><td></td></tr>' + ap + resumo('FREQÜÊNCIA ANUAL %', h.frequencia) + resumo('CARGA HORÁRIA ANUAL', h.carga) + resumo('RESULTADO FINAL', h.resultado) +
      '</tbody></table>' +
      '<table><thead><tr><th>SÉRIES</th><th>ANO</th><th colspan="2">ESTABELECIMENTO DE ENSINO</th><th>CIDADE / UF</th></tr></thead><tbody>' + series + '</tbody></table>' +
      '<div class="bloco"><b>DEPENDÊNCIA DE ESTUDOS:</b> ' + esc(h.dependencia) + '</div>' +
      '<div class="bloco"><b>OBSERVAÇÕES:</b> ' + esc(h.observacoes) + '</div>' +
      '<p class="leg">NOTA DE APROVAÇÃO IGUAL OU SUPERIOR A 5,0<br>LEGENDA: APV: APROVADO. REP: REPROVADO. RPF: REPROVADO POR FALTA. APD: APROVADO COM DEPENDÊNCIA. EM AND.: EM ANDAMENTO.<br>APR: ALUNO APROVADO CONFORME RESOLUÇÃO 20/2021 do CEE/PA. APC: APROVADO PELO CONSELHO DE CLASSE.</p>' +
      '<div class="assina"><div><span class="linha"></span>DIRETOR(A)</div><div>' + esc(h.localData) + '</div></div></div>';
    return '<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><title>Histórico Escolar</title><style>' + css + '</style></head><body>' + body + '</body></html>';
  }

  window.HISTORICO_ESCOLAR_TIPO = TIPO;
  window.renderHistoricoEscolarEditor = renderEditor;
  window.collectHistoricoEscolar = collect;
  window.buildHistoricoEscolarPrintHtml = buildPrintHtml;
})();
