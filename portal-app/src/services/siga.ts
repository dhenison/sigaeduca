import {createClient, type SupabaseClient} from '@supabase/supabase-js';

const SUPABASE_URL = 'https://digjzihjboflcuftmokj.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRpZ2p6aWhqYm9mbGN1ZnRtb2tqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM2MTg5NDgsImV4cCI6MjA5OTE5NDk0OH0.5QwxirNiFNq7aVCbpgRjNFzlUZk5CyvWY1FPKwCOa1Q';

export interface Student {
  id: string;
  name: string;
  email: string;
  grade: string;
  className: string;
  shift: string;
  school: string;
  avatarUrl?: string;
  status: string;
  schoolId: string;
}
export interface SchoolEvent {
  id: string;
  title: string;
  date: string;
  time: string;
  category: string;
  description: string;
}
export interface Notice {
  id: string;
  title: string;
  date: string;
  content: string;
}
export interface MonthStat {
  label: string;
  key: string;
  value: number;
  present: number;
  absent: number;
  justified: number;
  total: number;
}
export interface AttendancePhase {
  code: string | null;
  label: string;
  time: string | null;
}
export interface AttendanceDayView {
  date: string;
  entrada: AttendancePhase;
  saida: AttendancePhase;
  consolidado: AttendancePhase;
}
export interface AttendanceSummary {
  percentage: number;
  present: number;
  absent: number;
  justified: number;
  total: number;
  history: MonthStat[];
  days: AttendanceDayView[];
}
export interface ReportItem {
  bimestre: number;
  ano: number;
  published: boolean;
  id?: string;
  fileName?: string;
}
export interface OccurrenceItem {
  id: string;
  tipo: string;
  data: string;
  descricao: string;
  status: string;
}
export interface PortalSnapshot {
  student: Student;
  events: SchoolEvent[];
  notices: Notice[];
  attendance: AttendanceSummary;
  reports: ReportItem[];
  occurrences: OccurrenceItem[];
  agenda: SchoolEvent[];
  quote: {text: string; author: string};
}

interface Session {
  tipo?: string;
  id?: string;
  nome?: string;
  email?: string;
  schoolId?: string | null;
  portalToken?: string;
}
interface Mark {
  status?: string;
  locked?: boolean;
  marked_at?: string | null;
  justification?: string | null;
}
interface DayMarks {
  entrada?: Mark | null;
  saida?: Mark | null;
}

const QUOTES = [
  {text: 'A dedicação de hoje constrói o sucesso de amanhã.', author: 'SIGA EDUCA'},
  {text: 'Disciplina hoje, conquistas amanhã.', author: 'SIGA EDUCA'},
  {text: 'Cada aula é um passo a mais rumo ao seu futuro.', author: 'SIGA EDUCA'},
  {text: 'A constância vence o que a pressa não alcança.', author: 'SIGA EDUCA'},
  {text: 'Estude com foco e aja com disciplina.', author: 'SIGA EDUCA'},
];

let client: SupabaseClient | null = null;
function sb() {
  if (!client) client = createClient(SUPABASE_URL, SUPABASE_ANON);
  return client;
}

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function readSession(): Session | null {
  const session = readJson<Session | null>('siga_session', null);
  if (!session || session.tipo !== 'aluno' || !session.id) return null;
  return session;
}

export function clearSession() {
  localStorage.removeItem('siga_session');
  localStorage.removeItem('siga_portal_aluno_id');
}

function initialsSource(name: string) {
  return name;
}

export function studentInitials(name: string) {
  const parts = initialsSource(name).trim().split(/\s+/).filter(Boolean);
  const a = parts[0]?.[0] || 'A';
  const b = parts.length > 1 ? parts[parts.length - 1][0] : '';
  return (a + b).toUpperCase();
}

function quoteOfDay() {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 0);
  const day = Math.floor((now.getTime() - start.getTime()) / 86400000);
  return QUOTES[day % QUOTES.length];
}

function isLetivo(type: string) {
  return type === 'letivo' || type === 'evento' || type === 'sabado' || type.startsWith('inicio_');
}

function clock(value?: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleTimeString('pt-BR', {hour: '2-digit', minute: '2-digit'});
}

function phaseView(status?: string | null, markedAt?: string | null): AttendancePhase {
  const time = clock(markedAt);
  if (status === 'P') return {code: 'P', label: 'Presença', time};
  if (status === 'F') return {code: 'F', label: 'Falta', time};
  if (status === 'FJ') return {code: 'FJ', label: 'Falta justificada', time};
  return {code: null, label: 'Sem registro', time: null};
}

function consolidatedView(ent?: string | null, sai?: string | null): AttendancePhase {
  if (!ent || !sai) return {code: null, label: 'Pendente', time: null};
  if (ent === 'P' && sai === 'P') return {code: 'P', label: 'Presença', time: null};
  if (ent === 'FJ' && (sai === 'P' || sai === 'FJ')) return {code: 'P', label: 'Presença', time: null};
  if (ent === 'P' && sai === 'FJ') return {code: 'P', label: 'Presença', time: null};
  if (ent === 'P' && sai === 'F') return {code: 'F', label: 'Falta', time: null};
  if (ent === 'F' || sai === 'F') return {code: 'F', label: 'Falta', time: null};
  return {code: 'F', label: 'Falta', time: null};
}

function dayStatus(day?: DayMarks | null) {
  if (!day) return null;
  return consolidatedView(day.entrada?.status, day.saida?.status).code;
}

function localStudent(id: string) {
  const list = readJson<Array<Record<string, string>>>('siga_students', []);
  return list.find((s) => String(s.id) === String(id)) || null;
}

async function loadProfile(session: Session): Promise<Student | null> {
  const local = localStudent(String(session.id));
  let row: Record<string, string | number | null> | null = null;
  if (/^[0-9a-f-]{36}$/i.test(String(session.id))) {
    const res = session.portalToken
      ? await sb().rpc('student_portal_profile', {p_student_id: session.id, p_token: session.portalToken})
      : {error: null, data: null};
    if (!res.error && res.data) row = res.data as Record<string, string | number | null>;
  }
  if (!row && !local) return null;
  const schoolId = String(row?.school_id || local?.schoolId || session.schoolId || '');
  let school = '';
  try {
    school = localStorage.getItem('siga_school_name') || '';
  } catch { /* ignore */ }
  if (schoolId) {
    const sch = await sb().from('schools').select('nome').eq('id', schoolId).maybeSingle();
    if (!sch.error && sch.data?.nome) school = String(sch.data.nome);
  }
  const status = String(row?.status || local?.status || 'Ativo');
  return {
    id: String(row?.id || local?.id || session.id),
    name: String(row?.nome || local?.nome || session.nome || 'Aluno'),
    email: String(row?.email || local?.email || session.email || ''),
    grade: String(row?.serie || local?.serie || ''),
    className: String(row?.turma || local?.turma || ''),
    shift: String(row?.turno || local?.turno || ''),
    school,
    avatarUrl: String(row?.avatar_url || local?.avatar || '') || undefined,
    status,
    schoolId,
  };
}

async function loadNotices(studentId: string): Promise<Notice[]> {
  if (!/^[0-9a-f-]{36}$/i.test(studentId)) return [];
  const token = readSession()?.portalToken || '';
  if (!token) return [];
  const res = await sb().rpc('student_portal_informativos', {p_student_id: studentId, p_token: token});
  const data = Array.isArray(res.data) ? res.data : [];
  return data.map((item: Record<string, string>) => ({
    id: String(item.id || item.title),
    title: item.title || 'Aviso',
    date: String(item.published_at || '').slice(0, 10) || new Date().toISOString().slice(0, 10),
    content: item.body_text || (item.image_data ? 'Informativo com imagem.' : ''),
  }));
}

async function loadCalendar(schoolId: string) {
  const local = readJson<Record<string, {type?: string; label?: string}>>('siga_calendar_days', {});
  if (!schoolId) return local;
  const res = await sb().from('calendar_days').select('day_date, day_type, label').eq('school_id', schoolId);
  if (res.error || !res.data) return local;
  const days = {...local};
  for (const row of res.data) {
    const iso = String(row.day_date || '').slice(0, 10);
    if (!iso) continue;
    days[iso] = {type: row.day_type || '', label: row.label || ''};
  }
  return days;
}

function mapAgendaRow(row: Record<string, unknown>, turma: string): SchoolEvent | null {
  const scope = String(row.scope || row.scope || 'geral');
  const codes = (row.class_codes || row.turmas || []) as string[];
  if (scope === 'turmas' && turma && !codes.map(String).includes(turma)) return null;
  const date = String(row.event_date || row.date || '').slice(0, 10);
  if (!date) return null;
  return {
    id: String(row.id),
    title: String(row.title || 'Atividade'),
    date,
    time: '',
    category: String(row.event_type || row.type || 'Evento escolar'),
    description: String(row.description || row.desc || ''),
  };
}

async function loadAgenda(schoolId: string, turma: string): Promise<SchoolEvent[]> {
  const local = readJson<Array<Record<string, unknown>>>('siga_agenda_events', [])
    .map((row) => mapAgendaRow(row, turma))
    .filter((row): row is SchoolEvent => !!row);
  if (!schoolId) return local;
  const res = await sb().from('agenda_events').select('id, title, event_type, event_date, description, scope, class_codes').eq('school_id', schoolId);
  if (res.error || !res.data?.length) return local;
  return res.data.map((row) => mapAgendaRow(row as Record<string, unknown>, turma)).filter((row): row is SchoolEvent => !!row);
}

function calendarEvents(days: Record<string, {type?: string; label?: string}>): SchoolEvent[] {
  return Object.keys(days)
    .filter((iso) => {
      const type = String(days[iso]?.type || '');
      return type === 'evento' || type === 'sabado' || type.includes('feriado') || type.startsWith('inicio_');
    })
    .map((iso) => ({
      id: 'cal-' + iso,
      title: days[iso]?.label || 'Dia do calendário',
      date: iso,
      time: '',
      category: 'Calendário',
      description: days[iso]?.label || '',
    }));
}

function localAttendance(turma: string, studentId: string, year: number) {
  const days: Record<string, DayMarks> = {};
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i) || '';
    if (!key.startsWith('siga_attendance_')) continue;
    const rest = key.slice('siga_attendance_'.length);
    const iso = rest.slice(0, 10);
    const code = rest.slice(11);
    if (!iso.startsWith(String(year))) continue;
    if (turma && code !== turma) continue;
    const rec = readJson<{entrada?: {records?: Record<string, Mark>}; saida?: {records?: Record<string, Mark>}} | null>(key, null);
    if (!rec) continue;
    days[iso] = {
      entrada: rec.entrada?.records?.[studentId] || null,
      saida: rec.saida?.records?.[studentId] || null,
    };
  }
  return days;
}

async function loadMarks(student: Student, year: number) {
  const local = localAttendance(student.className, student.id, year);
  if (!/^[0-9a-f-]{36}$/i.test(student.id)) return local;
  const token = readSession()?.portalToken || '';
  if (!token) return local;
  const res = await sb().rpc('student_portal_attendance_range', {
    p_student_id: student.id,
    p_from: `${year}-01-01`,
    p_to: `${year}-12-31`,
    p_token: token,
  });
  const cloud = (res.data && (res.data as {days?: Record<string, DayMarks>}).days) || {};
  return {...local, ...cloud};
}

function summarize(year: number, days: Record<string, {type?: string}>, marks: Record<string, DayMarks>): AttendanceSummary {
  const today = new Date().toISOString().slice(0, 10);
  const letivos = Object.keys(days).filter((iso) => iso.startsWith(String(year)) && iso <= today && isLetivo(String(days[iso]?.type || ''))).sort();
  const marked = Object.keys(marks).filter((iso) => iso.startsWith(String(year)) && iso <= today);
  const universe = [...new Set([...letivos, ...marked])].sort();
  const months = new Map<string, MonthStat>();
  let present = 0;
  let absent = 0;
  let justified = 0;
  for (const iso of universe) {
    const status = dayStatus(marks[iso]);
    if (status === 'P') present++;
    else if (status === 'F') absent++;
    else if (status === 'FJ') justified++;
    const key = iso.slice(0, 7);
    const label = new Date(iso + 'T12:00:00').toLocaleDateString('pt-BR', {month: 'long'});
    const row = months.get(key) || {label, key, value: 0, present: 0, absent: 0, justified: 0, total: 0};
    row.total++;
    if (status === 'P') row.present++;
    if (status === 'F') row.absent++;
    if (status === 'FJ') row.justified++;
    row.value = row.total ? Math.round((row.present / row.total) * 100) : 0;
    months.set(key, row);
  }
  const total = universe.length;
  const dayViews = Object.keys(marks)
    .filter((iso) => iso.startsWith(String(year)) && (marks[iso]?.entrada?.status || marks[iso]?.saida?.status))
    .sort((a, b) => b.localeCompare(a))
    .map((iso) => {
      const entrada = marks[iso]?.entrada?.status || null;
      const saida = marks[iso]?.saida?.status || null;
      return {
        date: iso,
        entrada: phaseView(entrada, marks[iso]?.entrada?.marked_at),
        saida: phaseView(saida, marks[iso]?.saida?.marked_at),
        consolidado: consolidatedView(entrada, saida),
      };
    });
  return {
    percentage: total ? Math.round((present / total) * 100) : 0,
    present,
    absent,
    justified,
    total,
    history: [...months.values()].sort((a, b) => b.key.localeCompare(a.key)),
    days: dayViews,
  };
}

async function loadReports(student: Student, year: number): Promise<ReportItem[]> {
  const statusMap = readJson<Record<string, {status?: string}>>('siga_boletim_status', {});
  const meta = readJson<Record<string, {alunoId?: string; turma?: string; ano?: number | string; bimestre?: number | string; fileName?: string}>>('siga_boletim_meta', {});
  const byBim = new Map<number, ReportItem>();
  for (let bim = 1; bim <= 4; bim++) {
    byBim.set(bim, {bimestre: bim, ano: year, published: false});
  }
  const consider = (id: string, rec: {alunoId?: string; turma?: string; ano?: number | string; bimestre?: number | string; fileName?: string; blob?: Blob}) => {
    if (String(rec.alunoId || '') !== String(student.id)) return;
    if (Number(rec.ano) !== year) return;
    const bim = Number(rec.bimestre);
    if (bim < 1 || bim > 4) return;
    const key = [rec.turma || student.className, rec.ano, rec.bimestre].join('|');
    const info = statusMap[key];
    const published = !info || info.status === 'Publicado';
    if (!published) return;
    byBim.set(bim, {bimestre: bim, ano: year, published: true, id, fileName: rec.fileName});
  };
  Object.keys(meta).forEach((id) => consider(id, meta[id]));
  try {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open('siga_boletins_db', 1);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    const rows = await new Promise<Array<{id: string; alunoId?: string; turma?: string; ano?: number; bimestre?: number; fileName?: string; blob?: Blob}>>((resolve, reject) => {
      const tx = db.transaction('pdfs', 'readonly');
      const req = tx.objectStore('pdfs').getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
    rows.forEach((row) => consider(row.id, row));
  } catch { /* sem boletins neste navegador */ }
  return [1, 2, 3, 4].map((bim) => byBim.get(bim)!);
}

export async function openReport(id: string) {
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open('siga_boletins_db', 1);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  const rec = await new Promise<{blob?: Blob; fileName?: string} | undefined>((resolve, reject) => {
    const tx = db.transaction('pdfs', 'readonly');
    const req = tx.objectStore('pdfs').get(id);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  if (!rec?.blob) return false;
  const url = URL.createObjectURL(new Blob([rec.blob], {type: 'application/pdf'}));
  window.open(url, '_blank');
  return true;
}

function loadOccurrences(student: Student): OccurrenceItem[] {
  const nome = student.name.trim().toLowerCase();
  return readJson<Array<Record<string, string>>>('siga_occurrences', [])
    .filter((row) => String(row.alunoId || row.student_id || '') === student.id || String(row.student || row.aluno || '').trim().toLowerCase() === nome)
    .map((row) => ({
      id: String(row.id || row.date || row.data),
      tipo: row.type || row.tipo || 'Ocorrência',
      data: String(row.date || row.data || '').slice(0, 10),
      descricao: row.desc || row.descricao || '',
      status: row.status || 'Em análise',
    }))
    .sort((a, b) => b.data.localeCompare(a.data));
}

export async function loadPortal(year = new Date().getFullYear()): Promise<PortalSnapshot | null> {
  const session = readSession();
  if (!session) return null;
  const student = await loadProfile(session);
  if (!student || student.status === 'Transferido') {
    clearSession();
    return null;
  }
  if (student.school) {
    try { localStorage.setItem('siga_school_name', student.school); } catch { /* ignore */ }
  }
  const schoolId = student.schoolId;
  const [notices, days, agenda, marks, reports] = await Promise.all([
    loadNotices(student.id),
    loadCalendar(schoolId),
    loadAgenda(schoolId, student.className),
    loadMarks(student, year),
    loadReports(student, 2026),
  ]);
  const events = [...agenda, ...calendarEvents(days)].sort((a, b) => a.date.localeCompare(b.date));
  return {
    student,
    events,
    notices,
    attendance: summarize(year, days, marks),
    reports,
    occurrences: loadOccurrences(student),
    agenda,
    quote: quoteOfDay(),
  };
}

export async function loadAttendanceYear(student: Student, year: number) {
  const [days, marks] = await Promise.all([loadCalendar(student.schoolId), loadMarks(student, year)]);
  return summarize(year, days, marks);
}
