import fs from "fs";
import PptxGenJS from "pptxgenjs";
import JSZip from "jszip";

const pres = new PptxGenJS();
pres.defineLayout({ name: "WIDE", width: 13.333, height: 7.5 });
pres.layout = "WIDE";
pres.title = "Frequência no SIGA EDUCA";
pres.author = "SIGA EDUCA";
pres.subject = "Apresentação para professores sobre a chamada no sistema web e nos aplicativos";

const C = {
  navy: "00236F",
  navyDeep: "001845",
  ink: "0F172A",
  muted: "475569",
  paper: "F4F6FA",
  white: "FFFFFF",
  line: "E2E8F0",
  green: "0E7A45",
  greenSoft: "E8F6EE",
  red: "B42318",
  redSoft: "FDECEC",
  amber: "B45309",
  amberSoft: "FEF4E6",
  gold: "E8C872",
  soft: "64748B",
};

function footer(slide, n) {
  slide.addText("SIGA EDUCA  ·  Frequência", {
    x: 0.5, y: 7.08, w: 6, h: 0.22,
    fontFace: "Calibri", fontSize: 11, color: C.soft, margin: 0,
  });
  slide.addText(String(n).padStart(2, "0"), {
    x: 11.3, y: 7.08, w: 1.5, h: 0.22,
    fontFace: "Calibri", fontSize: 11, color: C.soft, align: "right", margin: 0,
  });
}

function title(slide, text) {
  slide.addText(text, {
    x: 0.5, y: 0.36, w: 12.3, h: 0.52,
    fontFace: "Georgia", fontSize: 32, color: C.navy, margin: 0, bold: false,
  });
}

function card(slide, x, y, w, h, fill = C.white) {
  slide.addShape(pres.shapes.ROUNDED_RECTANGLE, {
    x, y, w, h,
    fill: { color: fill },
    line: { color: C.line, width: 1 },
    rectRadius: 0.1,
  });
}

function circle(slide, x, y, size, fill, label, fontSize = 18) {
  slide.addShape(pres.shapes.OVAL, {
    x, y, w: size, h: size, fill: { color: fill },
  });
  slide.addText(label, {
    x, y, w: size, h: size,
    fontFace: "Calibri", fontSize, color: C.white, align: "center", valign: "middle", margin: 0, bold: true,
  });
}

// ---------------------------------------------------------------------------
// 1. Capa
// ---------------------------------------------------------------------------
{
  const s = pres.addSlide();
  s.background = { color: C.navy };
  s.addShape(pres.shapes.RECTANGLE, {
    x: 0, y: 0, w: 0.16, h: 7.5, fill: { color: C.gold },
  });
  s.addText("SIGA EDUCA", {
    x: 0.7, y: 1.45, w: 7, h: 0.32,
    fontFace: "Calibri", fontSize: 14, color: C.gold, margin: 0, bold: true, charSpacing: 2.4,
  });
  s.addText("Frequência", {
    x: 0.7, y: 1.9, w: 8, h: 0.95,
    fontFace: "Georgia", fontSize: 60, color: C.white, margin: 0,
  });
  s.addText("A chamada da turma, no computador\ne no celular do aluno.", {
    x: 0.7, y: 3.05, w: 7.4, h: 1.05,
    fontFace: "Calibri", fontSize: 22, color: "D6E2F5", margin: 0,
  });

  const pills = [
    ["Sistema web", 0.7, 2.15],
    ["Aplicativo do professor", 3.05, 3.2],
    ["Aplicativo do aluno", 6.45, 2.95],
  ];
  pills.forEach(([label, x, w]) => {
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, {
      x, y: 4.55, w, h: 0.46,
      fill: { color: "123A86" }, rectRadius: 0.23,
    });
    s.addText(label, {
      x, y: 4.55, w, h: 0.46,
      fontFace: "Calibri", fontSize: 13, color: C.white, align: "center", valign: "middle", margin: 0,
    });
  });

  s.addText("Para os professores", {
    x: 0.7, y: 6.55, w: 5, h: 0.3,
    fontFace: "Calibri", fontSize: 14, color: "8FA6C9", margin: 0,
  });

  const marks = [
    ["P", C.green, 10.15, 1.7],
    ["F", C.red, 10.15, 3.15],
    ["FJ", C.amber, 10.15, 4.6],
  ];
  marks.forEach(([label, fill, x, y]) => {
    s.addShape(pres.shapes.OVAL, { x, y, w: 1.35, h: 1.35, fill: { color: fill } });
    s.addText(label, {
      x, y, w: 1.35, h: 1.35,
      fontFace: "Georgia", fontSize: label.length > 1 ? 28 : 36, color: C.white,
      align: "center", valign: "middle", margin: 0,
    });
  });
  s.addNotes("Abra dizendo que a lista de papel e a tela são a mesma chamada. O que o professor consolida é o que o aluno vê no celular.");
}

// ---------------------------------------------------------------------------
// 2. Três lugares
// ---------------------------------------------------------------------------
{
  const s = pres.addSlide();
  s.background = { color: C.paper };
  s.addShape(pres.shapes.RECTANGLE, { x: 0, y: 0, w: 0.12, h: 7.5, fill: { color: C.navy } });
  title(s, "Três lugares, uma chamada");
  s.addText("No computador ou no celular do professor, é a chamada daquela turma, naquele dia. O aluno acompanha o resultado.", {
    x: 0.5, y: 0.98, w: 12.2, h: 0.48,
    fontFace: "Calibri", fontSize: 16, color: C.muted, margin: 0,
  });

  const cols = [
    {
      kicker: "01",
      tone: C.navy,
      title: "Sistema web",
      who: "Computador da escola",
      lines: [
        "Chamada de entrada, de saída e o dia consolidado, lado a lado.",
        "Painel do dia: vermelho, amarelo ou verde em cada turma.",
        "Média do mês e destaque para quem está abaixo de 75%.",
      ],
    },
    {
      kicker: "02",
      tone: C.green,
      title: "Aplicativo do professor",
      who: "Celular, na sala",
      lines: [
        "Aba Frequência: a mesma chamada, sem ir até o computador.",
        "Primeiro a entrada. A saída só abre depois.",
        "Precisa de internet para salvar.",
      ],
    },
    {
      kicker: "03",
      tone: C.amber,
      title: "Aplicativo do aluno",
      who: "Celular do estudante",
      lines: [
        "Percentual do ano, presenças, faltas e justificadas.",
        "No dia escolhido: entrada, saída e o resultado.",
        "Se a saída não fechou, o aluno vê que o dia ainda está aberto.",
      ],
    },
  ];
  cols.forEach((col, i) => {
    const x = 0.5 + i * 4.2;
    card(s, x, 1.68, 4.0, 5.05);
    circle(s, x + 0.28, 1.96, 0.52, col.tone, col.kicker, 14);
    s.addText(col.title, {
      x: x + 0.28, y: 2.64, w: 3.44, h: 0.7,
      fontFace: "Georgia", fontSize: 22, color: C.ink, margin: 0,
    });
    s.addText(col.who, {
      x: x + 0.28, y: 3.36, w: 3.44, h: 0.32,
      fontFace: "Calibri", fontSize: 14, color: col.tone, margin: 0, bold: true,
    });
    col.lines.forEach((line, li) => {
      s.addText(line, {
        x: x + 0.28, y: 3.86 + li * 0.85, w: 3.44, h: 0.78,
        fontFace: "Calibri", fontSize: 15, color: C.ink, margin: 0,
      });
    });
  });
  footer(s, 2);
  s.addNotes("Reforce: não são duas chamadas. O que foi salvo no celular aparece no computador, e o contrário também.");
}

// ---------------------------------------------------------------------------
// 3. Marcas
// ---------------------------------------------------------------------------
{
  const s = pres.addSlide();
  s.background = { color: C.paper };
  s.addShape(pres.shapes.RECTANGLE, { x: 0, y: 0, w: 0.12, h: 7.5, fill: { color: C.navy } });
  title(s, "Três marcas em cada aluno");
  s.addText("Na entrada e de novo na saída. O dia do aluno sai dessas duas marcas.", {
    x: 0.5, y: 0.98, w: 12, h: 0.36,
    fontFace: "Calibri", fontSize: 16, color: C.muted, margin: 0,
  });

  const marks = [
    { letter: "P", name: "Presença", fill: C.green, soft: C.greenSoft, text: "O aluno está na aula. Se você não marcar ninguém, a consolidação grava presença." },
    { letter: "F", name: "Falta", fill: C.red, soft: C.redSoft, text: "O aluno não está. Presença na entrada e falta na saída contam como falta no dia." },
    { letter: "FJ", name: "Falta justificada", fill: C.amber, soft: C.amberSoft, text: "Falta com motivo escrito. Sem o motivo, a chamada não consolida." },
  ];
  marks.forEach((m, i) => {
    const x = 0.5 + i * 4.2;
    card(s, x, 1.55, 4.0, 3.72);
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, {
      x: x + 0.28, y: 1.86, w: 1.15, h: 1.15,
      fill: { color: m.fill }, rectRadius: 0.12,
    });
    s.addText(m.letter, {
      x: x + 0.28, y: 1.86, w: 1.15, h: 1.15,
      fontFace: "Georgia", fontSize: m.letter.length > 1 ? 28 : 36, color: C.white,
      align: "center", valign: "middle", margin: 0,
    });
    s.addText(m.name, {
      x: x + 0.28, y: 3.2, w: 3.44, h: 0.42,
      fontFace: "Georgia", fontSize: 22, color: C.ink, margin: 0,
    });
    s.addText(m.text, {
      x: x + 0.28, y: 3.72, w: 3.44, h: 1.4,
      fontFace: "Calibri", fontSize: 16, color: C.ink, margin: 0,
    });
  });

  card(s, 0.5, 5.55, 12.3, 1.28, C.navy);
  s.addText("Antes de consolidar", {
    x: 0.78, y: 5.72, w: 11.7, h: 0.28,
    fontFace: "Calibri", fontSize: 13, color: C.gold, margin: 0, bold: true,
  });
  s.addText("Quem ficar sem marca entra como presença. Falta justificada sem o motivo escrito não salva.", {
    x: 0.78, y: 6.08, w: 11.7, h: 0.5,
    fontFace: "Calibri", fontSize: 18, color: C.white, margin: 0,
  });
  footer(s, 3);
  s.addNotes("Pare neste slide. O erro mais comum é consolidar sem revisar: o sistema entende silêncio como presença. E FJ sem texto volta com erro.");
}

// ---------------------------------------------------------------------------
// 4. O dia
// ---------------------------------------------------------------------------
{
  const s = pres.addSlide();
  s.background = { color: C.paper };
  s.addShape(pres.shapes.RECTANGLE, { x: 0, y: 0, w: 0.12, h: 7.5, fill: { color: C.navy } });
  title(s, "O dia em três passos");
  s.addText("Consolidar é salvar e fechar aquela etapa.", {
    x: 0.5, y: 0.98, w: 12, h: 0.34,
    fontFace: "Calibri", fontSize: 16, color: C.muted, margin: 0,
  });

  const steps = [
    { n: "1", name: "Entrada", body: "No começo da aula, marque a turma e toque em Consolidar Entrada." },
    { n: "2", name: "Saída", body: "Só abre depois da entrada. Começa igual à entrada: mude só quem saiu diferente." },
    { n: "3", name: "Dia consolidado", body: "Mostra presentes e ausentes do dia. Se houve evasão, o aviso aparece aqui." },
  ];
  steps.forEach((step, i) => {
    const x = 0.5 + i * 4.2;
    card(s, x, 1.55, 4.0, 3.42);
    s.addText(step.n, {
      x: x + 0.28, y: 1.78, w: 3.4, h: 0.7,
      fontFace: "Georgia", fontSize: 36, color: C.navy, margin: 0,
    });
    s.addText(step.name, {
      x: x + 0.28, y: 2.55, w: 3.44, h: 0.42,
      fontFace: "Georgia", fontSize: 22, color: C.ink, margin: 0,
    });
    s.addText(step.body, {
      x: x + 0.28, y: 3.15, w: 3.44, h: 1.55,
      fontFace: "Calibri", fontSize: 16, color: C.ink, margin: 0,
    });
  });

  card(s, 0.5, 5.22, 12.3, 1.6);
  s.addText("A saída copia a entrada", {
    x: 0.78, y: 5.42, w: 11.7, h: 0.34,
    fontFace: "Georgia", fontSize: 18, color: C.navy, margin: 0,
  });
  s.addText("Você não marca a turma inteira de novo. A saída já vem com as marcas da entrada. Ajuste quem foi embora, quem chegou depois ou quem tem justificativa, e consolide.", {
    x: 0.78, y: 5.86, w: 11.7, h: 0.72,
    fontFace: "Calibri", fontSize: 16, color: C.ink, margin: 0,
  });
  footer(s, 4);
  s.addNotes("Mostre a ordem com a mão: entrada, saída, resultado. A saída não existe enquanto a entrada não foi consolidada, salvo o caso do reconhecimento facial no computador.");
}

// ---------------------------------------------------------------------------
// 5. Sistema web
// ---------------------------------------------------------------------------
{
  const s = pres.addSlide();
  s.background = { color: C.paper };
  s.addShape(pres.shapes.RECTANGLE, { x: 0, y: 0, w: 0.12, h: 7.5, fill: { color: C.navy } });
  title(s, "No computador");
  s.addText("Menu Frequência  ·  Controle de Frequência. Escolha turno, turma e o dia.", {
    x: 0.5, y: 0.96, w: 12.2, h: 0.34,
    fontFace: "Calibri", fontSize: 16, color: C.muted, margin: 0,
  });

  const cols = [
    { t: "Chamada de Entrada", d: "Marque P, F ou FJ e consolide. Quem já bateu o ponto no reconhecimento facial permanece fechado." },
    { t: "Chamada de Saída", d: "A turma libera depois da entrada. Quem já entrou pelo facial pode ter a saída registrada na hora." },
    { t: "Dia Consolidado", d: "Presentes finais, ausentes finais e o aviso, se a chamada gerou evasão." },
  ];
  cols.forEach((col, i) => {
    const x = 0.5 + i * 4.2;
    card(s, x, 1.46, 4.0, 2.22);
    s.addText(col.t, {
      x: x + 0.24, y: 1.64, w: 3.52, h: 0.38,
      fontFace: "Georgia", fontSize: 16, color: C.navy, margin: 0,
    });
    s.addText(col.d, {
      x: x + 0.24, y: 2.08, w: 3.52, h: 1.4,
      fontFace: "Calibri", fontSize: 14, color: C.ink, margin: 0,
    });
  });

  card(s, 0.5, 3.92, 6.15, 2.9);
  s.addText("Painel das turmas", {
    x: 0.74, y: 4.08, w: 5.6, h: 0.34,
    fontFace: "Georgia", fontSize: 18, color: C.ink, margin: 0,
  });
  const lights = [
    [C.red, "Vermelho", "Nenhuma chamada neste dia."],
    [C.amber, "Amarelo", "Entrada feita. Falta a saída."],
    [C.green, "Verde", "Dia consolidado."],
  ];
  lights.forEach((row, i) => {
    const y = 4.56 + i * 0.68;
    s.addShape(pres.shapes.OVAL, { x: 0.78, y: y + 0.06, w: 0.28, h: 0.28, fill: { color: row[0] } });
    s.addText(row[1], {
      x: 1.2, y, w: 1.7, h: 0.4,
      fontFace: "Calibri", fontSize: 15, color: C.ink, margin: 0, bold: true, valign: "middle",
    });
    s.addText(row[2], {
      x: 2.95, y, w: 3.4, h: 0.4,
      fontFace: "Calibri", fontSize: 15, color: C.muted, margin: 0, valign: "middle",
    });
  });

  card(s, 6.85, 3.92, 5.95, 2.9);
  s.addText("No rodapé da tela", {
    x: 7.1, y: 4.08, w: 5.45, h: 0.34,
    fontFace: "Georgia", fontSize: 18, color: C.ink, margin: 0,
  });
  const kpis = [
    ["Média de presença", "Do mês, da turma que está aberta."],
    ["Faltas críticas", "Alunos com frequência abaixo de 75%."],
    ["Justificativas", "Faltas justificadas no período."],
  ];
  kpis.forEach((row, i) => {
    const y = 4.54 + i * 0.7;
    s.addText(row[0], {
      x: 7.1, y, w: 5.45, h: 0.28,
      fontFace: "Calibri", fontSize: 15, color: C.navy, margin: 0, bold: true,
    });
    s.addText(row[1], {
      x: 7.1, y: y + 0.26, w: 5.45, h: 0.26,
      fontFace: "Calibri", fontSize: 14, color: C.muted, margin: 0,
    });
  });
  footer(s, 5);
  s.addNotes("Domingo, feriado e recesso não abrem chamada no computador: a tela avisa que a data não é letiva. O painel serve para a coordenação ver, de longe, qual turma ainda não fechou o dia.");
}

// ---------------------------------------------------------------------------
// 6. App do professor
// ---------------------------------------------------------------------------
{
  const s = pres.addSlide();
  s.background = { color: C.paper };
  s.addShape(pres.shapes.RECTANGLE, { x: 0, y: 0, w: 0.12, h: 7.5, fill: { color: C.navy } });
  title(s, "No celular do professor");
  s.addText("Aba Frequência. A chamada de entrada abre primeiro.", {
    x: 0.5, y: 0.96, w: 12, h: 0.32,
    fontFace: "Calibri", fontSize: 16, color: C.muted, margin: 0,
  });

  const steps = [
    ["1", "Escolha o dia, o turno e a turma."],
    ["2", "Toque em Realizar chamada de entrada."],
    ["3", "Marque P, F ou FJ. Na justificada, escreva o motivo."],
    ["4", "Toque em Consolidar Entrada."],
    ["5", "A saída aparece. Ajuste e toque em Consolidar Saída."],
    ["6", "A tela confirma: a chamada de entrada e de saída foi realizada."],
  ];
  steps.forEach((step, i) => {
    const y = 1.46 + i * 0.86;
    circle(s, 0.55, y, 0.5, C.navy, step[0], 16);
    s.addText(step[1], {
      x: 1.22, y, w: 6.7, h: 0.5,
      fontFace: "Calibri", fontSize: 16, color: C.ink, margin: 0, valign: "middle",
    });
  });

  card(s, 8.15, 1.46, 4.65, 5.16);
  s.addText("Na sala", {
    x: 8.4, y: 1.68, w: 4.15, h: 0.36,
    fontFace: "Georgia", fontSize: 20, color: C.navy, margin: 0,
  });
  const tips = [
    ["Internet", "Sem conexão, a chamada não salva. A faixa avisa no topo."],
    ["Foto", "Toque na foto do aluno para ampliar, se houver cadastro."],
    ["Facial", "Quem já registrou na portaria aparece fechado. Essa marca não muda."],
    ["Depois", "Etapa consolidada fica como realizada. Não reabre no celular."],
  ];
  tips.forEach((tip, i) => {
    const y = 2.22 + i * 1.05;
    s.addText(tip[0], {
      x: 8.4, y, w: 4.15, h: 0.28,
      fontFace: "Calibri", fontSize: 14, color: C.green, margin: 0, bold: true,
    });
    s.addText(tip[1], {
      x: 8.4, y: y + 0.28, w: 4.15, h: 0.66,
      fontFace: "Calibri", fontSize: 14, color: C.ink, margin: 0,
    });
  });
  footer(s, 6);
  s.addNotes("Se a escola usa reconhecimento facial, o professor não discute com a batida da portaria. A presença facial fica travada. O restante da turma segue a chamada normal.");
}

// ---------------------------------------------------------------------------
// 7. Depois de consolidar
// ---------------------------------------------------------------------------
{
  const s = pres.addSlide();
  s.background = { color: C.paper };
  s.addShape(pres.shapes.RECTANGLE, { x: 0, y: 0, w: 0.12, h: 7.5, fill: { color: C.navy } });
  title(s, "Depois de consolidar");
  s.addText("A chamada deixa de ser rascunho. Estas quatro coisas passam a valer.", {
    x: 0.5, y: 0.96, w: 12, h: 0.32,
    fontFace: "Calibri", fontSize: 16, color: C.muted, margin: 0,
  });

  const items = [
    { n: "01", t: "A etapa fecha", d: "No celular, a entrada ou a saída aparece como realizada. No computador, a coluna fica consolidada." },
    { n: "02", t: "Corrigir é com o coordenador", d: "O desbloqueio fica no computador: Desbloquear Entrada ou Desbloquear Saída. Não volta sozinho no aplicativo." },
    { n: "03", t: "A saída nasce da entrada", d: "As marcas copiadas ainda podem ser ajustadas. Só a consolidação da saída grava o fim do dia." },
    { n: "04", t: "Evasão vira ocorrência", d: "Presença na entrada e falta na saída gera ocorrência de evasão, em análise, com a data e a turma." },
  ];
  items.forEach((item, i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const x = 0.5 + col * 6.4;
    const y = 1.48 + row * 2.62;
    card(s, x, y, 6.2, 2.46);
    s.addText(item.n, {
      x: x + 0.26, y: y + 0.2, w: 1.1, h: 0.36,
      fontFace: "Calibri", fontSize: 14, color: C.navy, margin: 0, bold: true,
    });
    s.addText(item.t, {
      x: x + 0.26, y: y + 0.56, w: 5.65, h: 0.36,
      fontFace: "Georgia", fontSize: 20, color: C.ink, margin: 0,
    });
    s.addText(item.d, {
      x: x + 0.26, y: y + 1.08, w: 5.65, h: 1.1,
      fontFace: "Calibri", fontSize: 15, color: C.muted, margin: 0,
    });
  });
  footer(s, 7);
  s.addNotes("Evasão aqui não é um julgamento. É o registro automático: estava na entrada e não estava na saída. A ocorrência nasce em análise para a escola tratar.");
}

// ---------------------------------------------------------------------------
// 8. App do aluno
// ---------------------------------------------------------------------------
{
  const s = pres.addSlide();
  s.background = { color: C.paper };
  s.addShape(pres.shapes.RECTANGLE, { x: 0, y: 0, w: 0.12, h: 7.5, fill: { color: C.navy } });
  title(s, "O que o aluno vê");
  s.addText("Aba Frequência. O ano em percentual e, no dia escolhido, entrada, saída e o resultado.", {
    x: 0.5, y: 0.96, w: 12.2, h: 0.32,
    fontFace: "Calibri", fontSize: 16, color: C.muted, margin: 0,
  });

  card(s, 0.5, 1.46, 5.35, 5.35);
  s.addText("Ano letivo", {
    x: 0.76, y: 1.66, w: 4.8, h: 0.28,
    fontFace: "Calibri", fontSize: 13, color: C.soft, margin: 0,
  });
  s.addShape(pres.shapes.OVAL, {
    x: 0.78, y: 2.08, w: 1.35, h: 1.35, fill: { color: C.greenSoft },
    line: { color: C.green, width: 3 },
  });
  s.addText("%", {
    x: 0.78, y: 2.08, w: 1.35, h: 1.35,
    fontFace: "Georgia", fontSize: 28, color: C.green, align: "center", valign: "middle", margin: 0,
  });
  s.addText("Percentual de presenças do ano.", {
    x: 2.3, y: 2.22, w: 3.2, h: 0.7,
    fontFace: "Calibri", fontSize: 16, color: C.ink, margin: 0, valign: "middle",
  });

  const stats = [
    ["Presenças", C.green],
    ["Faltas", C.red],
    ["Justificadas", C.amber],
  ];
  stats.forEach((st, i) => {
    const x = 0.78 + i * 1.6;
    s.addText(st[0], {
      x, y: 3.6, w: 1.5, h: 0.4,
      fontFace: "Calibri", fontSize: 13, color: st[1], margin: 0, bold: true,
    });
  });

  s.addText("No dia escolhido", {
    x: 0.78, y: 4.2, w: 4.7, h: 0.3,
    fontFace: "Georgia", fontSize: 16, color: C.navy, margin: 0,
  });
  const phases = [
    ["Entrada", "Presente, Falta ou Justificada"],
    ["Saída", "A segunda marca do mesmo dia"],
    ["Dia consolidado", "O resultado que entra na conta"],
  ];
  phases.forEach((ph, i) => {
    const y = 4.62 + i * 0.62;
    s.addText(ph[0], {
      x: 0.78, y, w: 2.15, h: 0.48,
      fontFace: "Calibri", fontSize: 14, color: C.ink, margin: 0, bold: true, valign: "middle",
    });
    s.addText(ph[1], {
      x: 2.95, y, w: 2.6, h: 0.48,
      fontFace: "Calibri", fontSize: 13, color: C.muted, margin: 0, valign: "middle",
    });
  });

  const msgs = [
    { t: "Entrada ainda não feita", d: "“A chamada de entrada ainda não foi realizada.”" },
    { t: "Só a entrada", d: "“A entrada foi realizada. A saída ainda não foi feita.”" },
    { t: "Dia fechado", d: "“A chamada de entrada e de saída foi realizada.”" },
  ];
  msgs.forEach((m, i) => {
    const y = 1.46 + i * 1.82;
    card(s, 6.05, y, 6.75, 1.66);
    s.addText(m.t, {
      x: 6.3, y: y + 0.18, w: 6.25, h: 0.32,
      fontFace: "Georgia", fontSize: 18, color: C.navy, margin: 0,
    });
    s.addText(m.d, {
      x: 6.3, y: y + 0.58, w: 6.25, h: 0.62,
      fontFace: "Calibri", fontSize: 15, color: C.ink, margin: 0,
    });
  });
  footer(s, 8);
  s.addNotes("Este é o slide para a família. Se o professor só consolida a entrada, o aluno e o responsável veem que a saída ficou pendente. O histórico também abre mês a mês.");
}

// ---------------------------------------------------------------------------
// 9. Como o dia é contado
// ---------------------------------------------------------------------------
{
  const s = pres.addSlide();
  s.background = { color: C.paper };
  s.addShape(pres.shapes.RECTANGLE, { x: 0, y: 0, w: 0.12, h: 7.5, fill: { color: C.navy } });
  title(s, "Como o dia é contado");
  s.addText("Quando entrada e saída já estão consolidadas.", {
    x: 0.5, y: 0.96, w: 12, h: 0.3,
    fontFace: "Calibri", fontSize: 16, color: C.muted, margin: 0,
  });

  const head = {
    fill: { color: C.navy }, color: C.white, bold: true, align: "left", valign: "middle",
    fontFace: "Calibri", fontSize: 14, margin: [8, 10, 8, 14],
  };
  function cell(text, fill, color = C.ink, bold = false) {
    return {
      text,
      options: {
        fill: { color: fill }, color, bold, align: "left", valign: "middle",
        fontFace: "Calibri", fontSize: 15, margin: [6, 10, 6, 14],
      },
    };
  }
  const rows = [
    [
      { text: "Entrada", options: head },
      { text: "Saída", options: head },
      { text: "O dia conta como", options: head },
    ],
    [cell("Presença", C.white, C.green, true), cell("Presença", C.white, C.green, true), cell("Presente", C.white)],
    [cell("Falta", "F8FAFC", C.red, true), cell("Falta", "F8FAFC", C.red, true), cell("Falta", "F8FAFC")],
    [cell("Justificada", C.white, C.amber, true), cell("Justificada", C.white, C.amber, true), cell("Falta justificada", C.white)],
    [cell("Presença", "FDECEC", C.green, true), cell("Falta", "FDECEC", C.red, true), cell("Falta, e gera ocorrência de evasão", "FDECEC", C.ink, true)],
    [cell("Presença", C.white, C.green, true), cell("Justificada", C.white, C.amber, true), cell("Presente", C.white)],
    [cell("Justificada", "F8FAFC", C.amber, true), cell("Presença", "F8FAFC", C.green, true), cell("Presente", "F8FAFC")],
    [cell("Falta", C.white, C.red, true), cell("Presença", C.white, C.green, true), cell("Falta", C.white)],
  ];
  s.addTable(rows, {
    x: 0.5, y: 1.42, w: 12.3, h: 5.15,
    colW: [3.1, 3.1, 6.1],
    rowH: [0.48, 0.58, 0.58, 0.58, 0.64, 0.58, 0.58, 0.58],
    border: [
      { pt: 0, color: C.paper },
      { pt: 0, color: C.paper },
      { pt: 0, color: C.paper },
      { pt: 0, color: C.paper },
    ],
    valign: "middle",
  });
  footer(s, 9);
  s.addNotes("A linha em vermelho claro é a que a coordenação mais pergunta. Estava na entrada e faltou na saída: falta no dia e ocorrência de evasão. Falta na entrada não vira evasão, mesmo que a saída esteja como presença.");
}

// ---------------------------------------------------------------------------
// 10. Na prática
// ---------------------------------------------------------------------------
{
  const s = pres.addSlide();
  s.background = { color: C.paper };
  s.addShape(pres.shapes.RECTANGLE, { x: 0, y: 0, w: 0.12, h: 7.5, fill: { color: C.navy } });
  title(s, "Na sala de aula");

  card(s, 0.5, 1.2, 6.2, 5.55);
  s.addText("O caminho", {
    x: 0.78, y: 1.4, w: 5.6, h: 0.38,
    fontFace: "Georgia", fontSize: 22, color: C.navy, margin: 0,
  });
  const path = [
    "Abra o computador ou o aplicativo do professor.",
    "Escolha o dia, o turno e a turma.",
    "Faça a entrada e consolide.",
    "No fim da aula, ajuste a saída e consolide.",
    "Confira o dia consolidado.",
    "O aluno já pode abrir a Frequência no celular.",
  ];
  path.forEach((line, i) => {
    const y = 2.0 + i * 0.72;
    circle(s, 0.82, y, 0.4, C.navy, String(i + 1), 13);
    s.addText(line, {
      x: 1.4, y, w: 4.95, h: 0.4,
      fontFace: "Calibri", fontSize: 15, color: C.ink, margin: 0, valign: "middle",
    });
  });

  card(s, 6.9, 1.2, 5.9, 5.55, "FFFBF5");
  s.addText("Antes de consolidar", {
    x: 7.16, y: 1.4, w: 5.4, h: 0.38,
    fontFace: "Georgia", fontSize: 22, color: C.amber, margin: 0,
  });
  const checks = [
    ["Revise os ausentes", "Silêncio vira presença."],
    ["Escreva o motivo", "FJ sem texto não salva."],
    ["Olhe a saída", "Ela copiou a entrada. Mude quem saiu."],
    ["Confira a internet", "No celular, sem rede não grava."],
    ["Dia não letivo", "No computador, feriado e recesso bloqueiam a chamada."],
  ];
  checks.forEach((line, i) => {
    const y = 2.02 + i * 0.86;
    s.addText(line[0], {
      x: 7.16, y, w: 5.35, h: 0.3,
      fontFace: "Calibri", fontSize: 16, color: C.ink, margin: 0, bold: true,
    });
    s.addText(line[1], {
      x: 7.16, y: y + 0.3, w: 5.35, h: 0.32,
      fontFace: "Calibri", fontSize: 14, color: C.muted, margin: 0,
    });
  });
  footer(s, 10);
  s.addNotes("Feche a explicação caminhando estes seis passos em voz alta. Depois leia a coluna da direita como checklist, não como punição.");
}

// ---------------------------------------------------------------------------
// 11. Fecho
// ---------------------------------------------------------------------------
{
  const s = pres.addSlide();
  s.background = { color: C.navy };
  s.addShape(pres.shapes.RECTANGLE, { x: 0, y: 0, w: 0.16, h: 7.5, fill: { color: C.gold } });
  s.addText("SIGA EDUCA", {
    x: 0.7, y: 1.35, w: 8, h: 0.3,
    fontFace: "Calibri", fontSize: 14, color: C.gold, margin: 0, bold: true, charSpacing: 2.4,
  });
  s.addText("O aluno vê\no que você consolidou.", {
    x: 0.7, y: 1.85, w: 10, h: 1.7,
    fontFace: "Georgia", fontSize: 40, color: C.white, margin: 0,
  });

  const ends = [
    ["Computador", "A turma do dia, com entrada, saída e o painel."],
    ["Seu celular", "A mesma chamada, na sala, com internet."],
    ["Celular do aluno", "O resultado, assim que as duas etapas fecham."],
  ];
  ends.forEach((row, i) => {
    const x = 0.7 + i * 4.05;
    s.addText(row[0], {
      x, y: 4.35, w: 3.8, h: 0.36,
      fontFace: "Georgia", fontSize: 18, color: C.gold, margin: 0,
    });
    s.addText(row[1], {
      x, y: 4.78, w: 3.8, h: 0.8,
      fontFace: "Calibri", fontSize: 15, color: "D6E2F5", margin: 0,
    });
  });
  s.addText("Frequência  ·  para os professores", {
    x: 0.7, y: 6.55, w: 8, h: 0.28,
    fontFace: "Calibri", fontSize: 14, color: "8FA6C9", margin: 0,
  });
  s.addNotes("Encerre sem abrir dúvida técnica. Se perguntarem correção, volte ao slide do coordenador. Se perguntarem o aluno, volte ao slide do aplicativo do aluno.");
}

const outPath = "C:/Users/USER/Documents/Siga Educa/docs/Frequencia para professores.pptx";
await pres.writeFile({ fileName: outPath });

// pptxgenjs lists one slide master per slide in Content_Types, but only writes slideMaster1.
const zip = await JSZip.loadAsync(fs.readFileSync(outPath));
const ctName = "[Content_Types].xml";
const ct = await zip.file(ctName).async("string");
const fixed = ct.replace(/<Override PartName="\/ppt\/slideMasters\/slideMaster(?!1\.xml)[^"]+"[^>]*\/>/g, "");
zip.file(ctName, fixed);
fs.writeFileSync(outPath, await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" }));
console.log("ok");
