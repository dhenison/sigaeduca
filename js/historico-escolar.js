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

  var TIPOS = {antiga: 'Histórico Matriz Antiga', nova: 'Histórico Nova Matriz'};
  var ANTIGA = [
    {area: 'BASE NACIONAL COMUM', itens: [
      ['arte','2399　 ARTES'], ['biologia','2034　 BIOLOGIA'], ['edfis','1008　 EDUCAÇÃO FÍSICA'],
      ['filosofia','2043　 FILOSOFIA'], ['fisica','2036　 FÍSICA'], ['geografia','2003　 GEOGRAFIA'],
      ['historia','2002　 HISTÓRIA'], ['portugues','2001　 LÍNGUA PORTUGUESA'],
      ['matematica','2006　 MATEMÁTICA'], ['quimica','2035　 QUÍMICA'], ['sociologia','2038　 SOCIOLOGIA']]},
    {area: 'PARTE DIVERSIFICADA', itens: [['espanhol','2135　 ESPANHOL'], ['amazonicos','2135　 ESTUDOS AMAZÔNICOS'], ['ingles','2012　 INGLÊS']]},
    {area: 'FORMAÇÃO PARA O MUNDO DO TRABALHO FMT ITINERÂNCIA', itens: [
      ['portugues2','2485　 LÍNGUA PORTUGUESA II'], ['ambiental','2746 - EDUCAÇÃO AMBIENTAL, SUSTENTABILIDADE E CLIMA'],
      ['humanas','2750 - CIÊNCIAS HUMANAS E SOCIAIS APLICADAS'], ['eletiva','2748 - ELETIVA'], ['projeto','2726 - PROJETO DE VIDA']]}
  ];
  var DEP_KEYS = ['componente','ch','nota','frequencia','escola','cidade','ano'];
  function esc(v) {return String(v == null ? '' : v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
  function modelo(tipo, data) {
    if (tipo === TIPOS.antiga) return 'antiga';
    if (tipo === TIPOS.nova || tipo === TIPO) return 'nova';
    return data && data.modelo === 'antiga' ? 'antiga' : 'nova';
  }
  function triplo(v) {return [0,1,2].map(function(i) {return Array.isArray(v) && v[i] != null ? String(v[i]) : '';});}
  function normalizar(data, tipo) {
    var src = data || {};
    var h = {modelo: modelo(tipo, src), notas: {}, series: [], dependencias: []};
    ['aluno','documentos','pai','rg','mae','cpf','nascimento','dependencia','observacoes','localData'].forEach(function(k) {h[k] = src[k] == null ? '' : String(src[k]);});
    h.naturalidade = src.naturalidade == null ? 'TUCUMÃ' : String(src.naturalidade);
    h.uf = src.uf == null ? 'PA' : String(src.uf);
    FORMACAO.concat(APROF, ANTIGA).forEach(function(b) {b.itens.forEach(function(item) {h.notas[item[0]] = triplo(src.notas && src.notas[item[0]]);});});
    ['frequencia','carga','resultado'].forEach(function(k) {h[k] = triplo(src[k]);});
    for (var i=0;i<3;i++) {
      var s = src.series && src.series[i] || {};
      h.series.push({ano:s.ano || '', escola:s.escola || '', cidade:s.cidade || ''});
      var rows = [];
      for (var j=0;j<3;j++) {
        var row = {}, old = src.dependencias && src.dependencias[i] && src.dependencias[i][j] || {};
        DEP_KEYS.forEach(function(k) {row[k] = old[k] == null ? '' : String(old[k]);});
        rows.push(row);
      }
      h.dependencias.push(rows);
    }
    return h;
  }
  function asset(name) {return new URL('assets/historico/'+name, window.location.href).href;}
  function styles() {return `
    .he-sheet,.he-sheet *{box-sizing:border-box}
    .he-sheet{position:relative;isolation:isolate;width:190mm;min-height:274mm;margin:0 auto;border:0.7mm solid #111;color:#111;background:white;font-family:Arial,Helvetica,sans-serif;font-size:8pt;line-height:1.15;display:flex;flex-direction:column}
    .he-watermark{position:absolute;z-index:-1;left:10%;top:51mm;width:80%;height:183mm;object-fit:fill;pointer-events:none}
    .he-head{height:29mm;display:flex;align-items:center;justify-content:space-between;text-align:center;padding:1mm 5mm;border-bottom:0.6mm solid #111}
    .he-head img{width:20mm;height:23mm;object-fit:contain}.he-head div{flex:1;font-size:8pt;line-height:1.8}.he-head strong{display:block;font-size:11pt;margin-top:2mm;line-height:1.15}
    .he-school{text-align:center;border-bottom:0.4mm solid #111;padding:1mm 0;font-size:10pt}.he-school small{display:flex;justify-content:space-evenly;font-size:7.5pt;margin-top:1mm}
    .he-resolution{text-align:center;font-size:8pt;border-bottom:0.4mm solid #111;padding:.5mm}
    .he-table{width:100%;border-collapse:collapse;table-layout:fixed;margin:0;background:transparent}.he-table td,.he-table th{border:.3mm solid #111;padding:.35mm .6mm;vertical-align:middle;overflow-wrap:anywhere;height:4.1mm}.he-table tr>*:first-child{border-left:0}.he-table tr>*:last-child{border-right:0}
    .he-table th{background:#d9d9d9;font-weight:bold;text-align:center}.he-ident td{height:4.7mm}.he-ident .he-field{display:flex;align-items:center;gap:1mm}.he-ident label{white-space:nowrap;flex-shrink:0}.he-value{white-space:pre-wrap;overflow-wrap:anywhere;min-width:0;flex:1}
    .he-area{text-align:center;font-weight:bold;font-size:6.3pt}.he-group{text-align:center;font-size:6.5pt}.he-subject{font-size:7pt}.he-ap .he-subject{font-size:6.3pt}.he-grade{text-align:center;font-size:8pt}
    .he-summary{text-align:right}.he-section{text-align:center;font-weight:bold;background:#d9d9d9}.he-grid thead th{height:4.3mm}.he-grid thead th:first-child{font-size:9pt}.he-series{text-align:center;font-size:7.5pt}.he-deps{text-align:center;font-size:6.5pt}.he-deps th{height:8mm;font-weight:normal}.he-deps td{height:4mm}
    .he-notes{border-top:.3mm solid #111;min-height:11.5mm;background:repeating-linear-gradient(transparent 0,transparent 3.7mm,#111 3.7mm,#111 3.9mm);font-size:7.5pt;line-height:3.9mm;padding:0 .6mm}.he-notes b{display:block;height:3.9mm}.he-notes .he-value{display:block;min-height:7.8mm}.he-approval{text-align:center;font-size:7pt;border-top:.5mm solid #111;padding:1mm}
    .he-footer{flex:1;display:flex;flex-direction:column;justify-content:space-between;min-height:32mm}.he-legend{font-size:6.8pt;line-height:1.5;padding:3mm 0 0}.he-signatures{display:flex;align-items:flex-end;justify-content:space-around;text-align:center;font-size:7.5pt;padding:6mm 3mm 3mm;gap:4mm}.he-signature{width:45%;border-top:.25mm solid #111;padding-top:1mm}.he-date{width:42%;font-weight:bold}
    .he-input{display:block;width:100%;min-width:0;border:0;border-radius:0;background:rgba(255,255,255,.3);color:inherit;font:inherit;line-height:inherit;padding:0;margin:0;outline-offset:1px}.he-input:focus{outline:2px solid #16734b;background:#fff}.he-grade .he-input,.he-series .he-input,.he-deps .he-input{text-align:center}.he-input::placeholder{color:#666}textarea.he-input{resize:vertical;min-height:7.8mm;line-height:3.9mm}
    .he-nova .he-footer{min-height:27mm}.he-nova .he-signatures{padding-top:4mm}.he-ident tr:first-child td:last-child .he-field{flex-wrap:wrap}.he-ident tr:first-child td:last-child .he-value:not(:empty){flex-basis:100%}.he-scroll{max-width:100%;overflow-x:auto;padding:8px 0}.he-help{font-size:12px;margin:0 0 8px}.he-model-title{font-size:16px;margin:0 0 8px}
    @media print{.he-sheet{-webkit-print-color-adjust:exact;print-color-adjust:exact;break-inside:avoid}.he-input{background:transparent}}
  `;}
  function sheet(h, edit) {
    function field(k,v,placeholder,multi) {
      if (!edit) return '<span class="he-value">'+esc(v)+'</span>';
      var attrs = ' class="he-input" data-h="'+esc(k)+'" aria-label="'+esc(k.replace(/:/g,' '))+'"';
      if (multi) return '<textarea'+attrs+' rows="2">'+esc(v)+'</textarea>';
      return '<input'+attrs+' type="text" value="'+esc(v)+'"'+(placeholder?' placeholder="'+esc(placeholder)+'"':'')+'>';
    }
    function grades(k) {return h.notas[k].map(function(v,i) {return '<td class="he-grade">'+field('nota:'+k+':'+i,v,'*')+'</td>';}).join('');}
    function summary(label,k) {return '<tr><td colspan="3" class="he-summary">'+label+'</td>'+h[k].map(function(v,i) {return '<td class="he-grade">'+field(k+':'+i,v)+'</td>';}).join('')+'</tr>';}
    function ident(label,k,span) {return '<td colspan="'+span+'"><div class="he-field"><label>'+label+'</label>'+field(k,h[k])+'</div></td>';}
    var antiga = h.modelo === 'antiga', rows = '';
    if (antiga) {
      ANTIGA.forEach(function(b) {b.itens.forEach(function(item,i) {
        rows += '<tr>'+(i===0?'<td class="he-area" rowspan="'+b.itens.length+'">'+esc(b.area)+'</td>':'')+'<td colspan="2" class="he-subject">'+esc(item[1])+'</td>'+grades(item[0])+'</tr>';
      });});
    } else {
      var first=true;
      FORMACAO.forEach(function(b) {b.itens.forEach(function(item,i) {
        rows += '<tr>'+(first?'<td class="he-area" rowspan="12">FORMAÇÃO GERAL BÁSICA</td>':'')+(i===0?'<td class="he-group" rowspan="'+b.itens.length+'">'+esc(b.area)+'</td>':'')+'<td class="he-subject">'+esc(item[1])+'</td>'+grades(item[0])+'</tr>';
        first=false;
      });});
      rows += '<tr><td colspan="3" class="he-section">APROFUNDAMENTOS CURRICULARES</td><td></td><td></td><td></td></tr>';
      APROF.forEach(function(b) {b.itens.forEach(function(item,i) {
        rows += '<tr class="he-ap">'+(i===0?'<td class="he-area" rowspan="'+b.itens.length+'">'+esc(b.sigla)+'<br>'+esc(b.area)+'</td>':'')+'<td colspan="2" class="he-subject">'+esc(item[1])+'</td>'+grades(item[0])+'</tr>';
      });});
    }
    var series = h.series.map(function(s,i) {return '<tr><td>'+(i+1)+'ª</td><td>'+field('serie-ano:'+i,s.ano)+'</td><td>'+field('serie-escola:'+i,s.escola)+'</td><td>'+field('serie-cidade:'+i,s.cidade)+'</td></tr>';}).join('');
    var deps = '';
    if (antiga) {
      deps = '<table class="he-table he-deps"><colgroup><col style="width:10%"><col style="width:27%"><col style="width:5%"><col style="width:10%"><col style="width:9%"><col style="width:14%"><col style="width:14%"><col style="width:11%"></colgroup><thead><tr><td colspan="8"><b>DEPENDÊNCIA DE ESTUDOS</b></td></tr><tr><th>SÉRIE</th><th>COMPONENTES<br>CURRICULARES</th><th>CH</th><th>NOTA<br>RESULTADO</th><th>FREQ.<br>ANUAL</th><th>ESCOLA</th><th>CIDADE/UF</th><th>ANO</th></tr></thead><tbody>';
      h.dependencias.forEach(function(group,i) {group.forEach(function(row,j) {deps += '<tr>'+(j===0?'<td rowspan="3">'+(i+1)+'ª</td>':'')+DEP_KEYS.map(function(k) {return '<td>'+field('dep:'+i+':'+j+':'+k,row[k])+'</td>';}).join('')+'</tr>';});});
      deps += '</tbody></table>';
    } else {
      deps = '<div class="he-notes"><b>DEPENDÊNCIA DE ESTUDOS:</b>'+field('dependencia',h.dependencia,'',true)+'</div><div class="he-notes"><b>OBSERVAÇÕES:</b>'+field('observacoes',h.observacoes,'',true)+'</div>';
    }
    return '<article class="he-sheet he-'+h.modelo+'"><img class="he-watermark" src="'+asset('image3.jpeg')+'" alt="">'+
      '<header class="he-head"><img src="'+asset('image1.jpeg')+'" alt="Logo EGAP"><div>GOVERNO DO ESTADO DO PARÁ<br>SECRETARIA ESPECIAL DE ESTADO DE PROMOÇÃO SOCIAL<br>SECRETARIA DE ESTADO DE EDUCAÇÃO<strong>HISTÓRICO ESCOLAR DO ENSINO MÉDIO</strong></div><img src="'+asset('image2.png')+'" alt="Brasão do Pará"></header>'+
      '<div class="he-school">ESCOLA ESTADUAL PROF GERALDO ÂNGELO PEREIRA<small><span>CIDADE: <b>TUCUMÃ</b></span><span>UF: <b>PARÁ</b></span><span>E-mail: <b>escola2300@escola.seduc.pa.gov.br</b></span></small></div>'+
      '<div class="he-resolution">MATRIZ CURRICULAR RESOLUÇÃO N° 595 DE 23 DE DEZEMBRO DE 2025</div>'+
      '<table class="he-table he-ident"><colgroup>'+Array(12).fill('<col>').join('')+'</colgroup><tbody><tr>'+ident('ALUNO:','aluno',9)+ident('DOCUMENTOS DO ALUNO:','documentos',3)+'</tr><tr>'+ident('PAI:','pai',9)+ident('RG:','rg',3)+'</tr><tr>'+ident('MÃE:','mae',9)+ident('CPF:','cpf',3)+'</tr><tr>'+ident('DATA DE NASCIMENTO:','nascimento',4)+ident('NATURALIDADE:','naturalidade',6)+ident('UF:','uf',2)+'</tr></tbody></table>'+
      '<table class="he-table he-grid"><colgroup><col style="width:10%"><col style="width:13%"><col style="width:38%"><col style="width:13%"><col style="width:13%"><col style="width:13%"></colgroup><thead><tr><th colspan="3" rowspan="2">COMPONENTES CURRICULARES</th><th colspan="3">SÉRIES</th></tr><tr><th>1ª</th><th>2ª</th><th>3ª</th></tr></thead><tbody>'+rows+summary('FREQUÊNCIA ANUAL %','frequencia')+summary('CARGA HORÁRIA ANUAL','carga')+summary('RESULTADO FINAL','resultado')+'</tbody></table>'+
      '<table class="he-table he-series"><colgroup><col style="width:10%"><col style="width:13%"><col style="width:38%"><col style="width:39%"></colgroup><thead><tr><th>SÉRIES</th><th>ANO</th><th>ESTABELECIMENTO DE ENSINO</th><th>CIDADE / UF</th></tr></thead><tbody>'+series+'</tbody></table>'+deps+
      '<div class="he-approval">NOTA DE APROVAÇÃO IGUAL OU SUPERIOR A 5,0</div><footer class="he-footer"><div class="he-legend"><b>LEGENDA:</b><br><b>APV:</b> <u>APROVADO.</u> <b>REP:</b> <u>REPROVADO.</u> <b>RPF:</b> <u>REPROVADO POR FALTA.</u> <b>APD:</b> <u>APROVADO COM DEPENDÊNCIA.</u> <b>EM AND.:</b> <u>EM ANDAMENTO.</u><br><b>APR:</b> <u>ALUNO APROVADO CONFORME RESOLUÇÃO 20/2021 do CEE/PA.</u> <b>APC:</b> <u>APROVADO PELO CONSELHO DE CLASSE.</u></div><div class="he-signatures"><div class="he-signature">DIRETOR(A)</div><div class="he-date">'+field('localData',h.localData)+'</div></div></footer></article>';
  }
  function renderEditor(container, data, tipo) {
    if (!container) return;
    var h = normalizar(data, tipo);
    if (!data && !h.localData) h.localData = 'TUCUMÃ/PA '+new Date().toLocaleDateString('pt-BR');
    // Guarde os campos de ambas as matrizes ao alternar o modelo.
    container._historicoData = h;
    container.dataset.historicoModelo = h.modelo;
    container.innerHTML = '<style>'+styles()+'</style><h3 class="he-model-title">'+TIPOS[h.modelo]+'</h3><p class="he-help">Preencha as notas e os demais campos. Campos vazios permanecem em branco na impressão.</p><div class="he-scroll">'+sheet(h,true)+'</div>';
  }
  function collect(container) {
    var h = normalizar(container && container._historicoData);
    if (!container) return h;
    container.querySelectorAll('[data-h]').forEach(function(el) {
      var parts = el.dataset.h.split(':'), value = el.value.trim(), key = parts[0];
      if (key === 'nota') h.notas[parts[1]][Number(parts[2])] = value;
      else if (key === 'dep') h.dependencias[Number(parts[1])][Number(parts[2])][parts[3]] = value;
      else if (key.indexOf('serie-') === 0) h.series[Number(parts[1])][key.slice(6)] = value;
      else if (parts.length === 2) h[key][Number(parts[1])] = value;
      else h[key] = value;
    });
    return h;
  }
  function buildPrintHtml(doc) {
    var h = normalizar(doc && doc.historico, doc && doc.tipo);
    return '<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><title>'+esc(TIPOS[h.modelo])+'</title><style>@page{size:A4 portrait;margin:10mm}html,body{margin:0;padding:0;background:white}'+styles()+'</style></head><body>'+sheet(h,false)+'</body></html>';
  }
  window.HISTORICO_ESCOLAR_TIPO = TIPO;
  window.HISTORICO_ESCOLAR_TIPOS = TIPOS;
  window.historicoEscolarModelo = modelo;
  window.isHistoricoEscolarTipo = function(tipo) {return tipo === TIPO || tipo === TIPOS.antiga || tipo === TIPOS.nova;};
  window.renderHistoricoEscolarEditor = renderEditor;
  window.collectHistoricoEscolar = collect;
  window.buildHistoricoEscolarPrintHtml = buildPrintHtml;
})();