const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

function harness() {
  const storage = new Map();
  const localStorage = {getItem: k => storage.get(k) ?? null, setItem: (k, v) => storage.set(k, v), key: i => [...storage.keys()][i], get length() {return storage.size;}};
  const writes = [];
  const marks = [];
  const call = {id: 'call', entrada_consolidada: false, saida_consolidada: false};
  const students = ['P', 'F', 'FJ'].map(status => ({id: status, full_name: status, status: 'Ativo'}));
  const client = {from(table) {
    const query = {
      select() {return query;}, eq() {return query;},
      order: async () => ({data: students}),
      maybeSingle: async () => ({data: call}),
      update(patch) {Object.assign(call, patch); return query;},
      upsert(rows) {
        if (table === 'attendance_calls') {Object.assign(call, rows); return query;}
        writes.push(...rows);
        for (const row of rows) {
          const i = marks.findIndex(m => m.student_id === row.student_id && m.phase === row.phase);
          if (i < 0) marks.push(row); else marks[i] = row;
        }
        return Promise.resolve({error: null});
      },
      then(resolve) {return Promise.resolve({data: table === 'attendance_marks' ? marks : null, error: null}).then(resolve);},
    };
    return query;
  }};
  function load(name, extra = '') {
    const source = fs.readFileSync(path.join(__dirname, '../src/services', name + '.ts'), 'utf8') + extra;
    const js = ts.transpileModule(source, {compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022}}).outputText;
    const exports = {};
    vm.runInNewContext(js, {exports, require: id => id === '@supabase/supabase-js' ? {createClient: () => client} : {}, localStorage, console, Date});
    return exports;
  }
  return {teacher: load('teacher'), student: load('siga', '\nexport {localAttendance};'), localStorage, writes, marks, call};
}

test('entrada não grava saída; rascunhos sobrevivem à recarga; saída salva separadamente', async () => {
  const h = harness();
  const t = h.teacher;
  const ids = ['P', 'F', 'FJ'];
  let roll = {callId: null, students: ids.map(id => ({id, nome: id})), entrada: {}, saida: {}, entradaConsolidada: false, saidaConsolidada: false};
  for (const id of ids) {
    roll.entrada[id] = {...t.blankMark(), status: id, justification: id === 'FJ' ? 'Atestado' : ''};
    roll.saida[id] = t.blankMark();
  }
  roll = await t.consolidateRoll('school', 'class', '2026-09-28', 'entrada', roll, 'Professor');
  assert.equal(h.writes.length, 3);
  assert.ok(h.writes.every(row => row.phase === 'entrada'));
  assert.equal(roll.saidaConsolidada, false);
  for (const id of ids) {
    assert.equal(roll.saida[id].hasMark, false);
    const day = h.student.localAttendance('class', id, 2026)['2026-09-28'];
    assert.equal(day.entrada.status, id);
    assert.equal(day.saida, null);
  }
  roll = await t.loadClassRoll('school', 'class', '2026-09-28');
  assert.equal(roll.saida.F.status, 'F');
  assert.equal(roll.saida.FJ.justification, 'Atestado');
  assert.equal(roll.saida.F.hasMark, false);
  h.writes.length = 0;
  roll = await t.consolidateRoll('school', 'class', '2026-09-28', 'saida', roll, 'Professor');
  assert.equal(h.writes.length, 3);
  assert.ok(h.writes.every(row => row.phase === 'saida' && row.locked));
  assert.equal(roll.saidaConsolidada, true);
  assert.equal(h.student.localAttendance('class', 'P', 2026)['2026-09-28'].saida.status, 'P');
});

test('cópia preserva saída facial e marcação já feita', () => {
  const {teacher: t} = harness();
  const facial = {...t.blankMark(), status: 'F', locked: true, source: 'facial', hasMark: true, markedAt: '2026-09-28T15:00:00Z'};
  const manual = {...t.blankMark(), status: 'F', hasMark: true};
  const result = t.copyEntradaToSaida(['a', 'b'], {}, {a: facial, b: manual});
  assert.equal(result.a, facial);
  assert.equal(result.b, manual);
});
