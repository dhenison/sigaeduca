import {createClient, type SupabaseClient} from '@supabase/supabase-js';
import {clearSession} from './siga';
import type {Notice, SchoolEvent} from './siga';

const SUPABASE_URL = 'https://digjzihjboflcuftmokj.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRpZ2p6aWhqYm9mbGN1ZnRtb2tqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM2MTg5NDgsImV4cCI6MjA5OTE5NDk0OH0.5QwxirNiFNq7aVCbpgRjNFzlUZk5CyvWY1FPKwCOa1Q';
const YEAR = '2026';

export type Audience = 'aluno' | 'professor' | 'staff' | 'none';
export type MarkStatus = 'P' | 'F' | 'FJ';
export type PhaseName = 'entrada' | 'saida';

export interface TeacherProfile {
  id: string;
  staffId: string;
  name: string;
  email: string;
  role: string;
  school: string;
  schoolId: string;
  avatarUrl: string;
  employeeId: string;
  subject: string;
  phone: string;
  instagram: string;
  x: string;
  facebook: string;
  lattes: string;
  bio: string;
}
export interface ClassOption {
  code: string;
  serie: string;
  turno: string;
}
export interface RollStudent {
  id: string;
  nome: string;
  avatarUrl: string;
}
export interface RollMark {
  status: MarkStatus;
  justification: string;
  locked: boolean;
  source: string;
  markedAt: string | null;
  hasMark: boolean;
}
export interface ClassRoll {
  callId: string | null;
  students: RollStudent[];
  entrada: Record<string, RollMark>;
  saida: Record<string, RollMark>;
  entradaConsolidada: boolean;
  saidaConsolidada: boolean;
}
export interface TeacherSnapshot {
  teacher: TeacherProfile;
  events: SchoolEvent[];
  notices: Notice[];
  classes: ClassOption[];
  olympics: {id: string; title: string; detail: string}[];
}

interface StaffSession {
  tipo?: string;
  id?: string;
  nome?: string;
  email?: string;
  role?: string;
  schoolId?: string | null;
  sistemaAdmin?: boolean;
}

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

export function readStaffSession(): StaffSession | null {
  const session = readJson<StaffSession | null>('siga_session', null);
  if (!session || !session.id) return null;
  return session;
}

export function portalAudience(): Audience {
  const session = readStaffSession();
  if (!session) return 'none';
  if (session.tipo === 'aluno') return 'aluno';
  if (session.sistemaAdmin || session.tipo === 'sistema') return 'staff';
  const role = String(session.role || localStorage.getItem('siga_profile_role') || '');
  if (/professor/i.test(role)) return 'professor';
  return session.tipo === 'servidor' ? 'staff' : 'none';
}

function schoolIdOf(session: StaffSession) {
  return String(session.schoolId || localStorage.getItem('siga_active_school') || '');
}

export function blankMark(): RollMark {
  return {status: 'P', justification: '', locked: false, source: 'manual', markedAt: null, hasMark: false};
}

export function isFacialLocked(mark?: RollMark | null) {
  return !!(mark && mark.locked && mark.source === 'facial');
}

export function lockPhase(studentIds: string[], records: Record<string, RollMark>) {
  const next: Record<string, RollMark> = {...records};
  studentIds.forEach((id) => {
    const rec = next[id] || blankMark();
    if (isFacialLocked(rec)) {
      next[id] = rec;
      return;
    }
    next[id] = {
      ...rec,
      status: rec.status || 'P',
      justification: rec.status === 'FJ' ? rec.justification : '',
      locked: true,
      source: 'manual',
      hasMark: true,
      markedAt: rec.markedAt || new Date().toISOString(),
    };
  });
  return next;
}

export function copyEntradaToSaida(studentIds: string[], entrada: Record<string, RollMark>, saida: Record<string, RollMark>) {
  const next = {...saida};
  studentIds.forEach((id) => {
    const current = next[id];
    if (current && (current.locked || current.hasMark)) return;
    const ent = entrada[id] || blankMark();
    next[id] = {
      status: ent.status,
      justification: ent.status === 'FJ' ? ent.justification : '',
      locked: false,
      source: 'manual',
      markedAt: null,
      hasMark: true,
    };
  });
  return next;
}

export function missingJustification(studentIds: string[], records: Record<string, RollMark>) {
  return studentIds.filter((id) => {
    const rec = records[id];
    return rec && rec.status === 'FJ' && !isFacialLocked(rec) && !rec.justification.trim();
  });
}

export function evasionStudents(students: RollStudent[], entrada: Record<string, RollMark>, saida: Record<string, RollMark>) {
  return students.filter((student) => entrada[student.id]?.status === 'P' && saida[student.id]?.status === 'F');
}

function mapMark(row?: {status?: string; justification?: string | null; locked?: boolean; source?: string | null; marked_at?: string | null}): RollMark {
  const status: MarkStatus = row?.status === 'F' || row?.status === 'FJ' ? row.status : 'P';
  return {
    status,
    justification: row?.justification || '',
    locked: !!row?.locked,
    source: row?.source || 'manual',
    markedAt: row?.marked_at || null,
    hasMark: true,
  };
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
      category: 'Agenda EGAP',
      description: days[iso]?.label || '',
    }));
}

export async function loadTeacherPortal(): Promise<TeacherSnapshot | null> {
  const session = readStaffSession();
  if (!session || portalAudience() !== 'professor') return null;
  const schoolId = schoolIdOf(session);
  const record = await loadTeacherRecord(session.email || '', schoolId);
  const teacher: TeacherProfile = {
    id: String(session.id),
    staffId: record.staffId,
    name: record.name || session.nome || 'Professor',
    email: session.email || '',
    role: record.role || session.role || 'Professor(a)',
    school: localStorage.getItem('siga_school_name') || '',
    schoolId,
    avatarUrl: record.avatarUrl || await loadTeacherAvatar(session.email || '', schoolId),
    employeeId: record.employeeId,
    subject: record.subject,
    phone: record.phone,
    instagram: record.instagram,
    x: record.x,
    facebook: record.facebook,
    lattes: record.lattes,
    bio: record.bio,
  };
  const classes = await loadClasses(schoolId);
  const events = await loadEvents(schoolId);
  const notices = await loadNotices(schoolId);
  const olympics = readJson<Array<Record<string, string>>>('siga_olimpiadas', []).map((item, index) => ({
    id: String(item.id || index),
    title: item.nome || item.titulo || item.title || 'Olimpíada',
    detail: item.descricao || item.status || item.area || '',
  }));
  return {teacher, events, notices, classes, olympics};
}

async function loadClasses(schoolId: string): Promise<ClassOption[]> {
  const local = readJson<Array<Record<string, string>>>('siga_classes', [])
    .filter((item) => !item.status || item.status === 'Ativo')
    .map((item) => ({code: item.code || '', serie: item.serie || '', turno: item.turno || 'Manhã'}))
    .filter((item) => item.code);
  if (!schoolId) return local;
  const res = await sb().from('classes').select('code,serie,turno,status,year_label').eq('school_id', schoolId).eq('status', 'Ativo');
  if (res.error || !res.data?.length) return local;
  const rows = res.data.filter((row) => row.year_label === YEAR);
  const source = rows.length ? rows : res.data;
  return source
    .map((row) => ({code: String(row.code || ''), serie: String(row.serie || ''), turno: String(row.turno || 'Manhã')}))
    .filter((row) => row.code)
    .sort((a, b) => a.code.localeCompare(b.code, 'pt-BR'));
}

async function loadAgendaEvents(schoolId: string): Promise<SchoolEvent[]> {
  const local = readJson<Array<Record<string, unknown>>>('siga_agenda_events', []).map((row) => {
    const date = String(row.date || row.event_date || '').slice(0, 10);
    if (!date) return null;
    return {
      id: String(row.id || date),
      title: String(row.title || 'Atividade'),
      date,
      time: '',
      category: String(row.type || row.event_type || 'Evento escolar'),
      description: String(row.desc || row.description || ''),
    };
  }).filter((row): row is SchoolEvent => !!row);
  if (!schoolId) return local;
  const res = await sb().from('agenda_events').select('id, title, event_type, event_date, description').eq('school_id', schoolId);
  if (res.error || !res.data?.length) return local;
  return res.data.map((row) => ({
    id: String(row.id),
    title: row.title || 'Atividade',
    date: String(row.event_date || '').slice(0, 10),
    time: '',
    category: row.event_type || 'Evento escolar',
    description: row.description || '',
  })).filter((row) => row.date);
}

async function loadEvents(schoolId: string): Promise<SchoolEvent[]> {
  const local = readJson<Record<string, {type?: string; label?: string}>>('siga_calendar_days', {});
  let days = local;
  if (schoolId) {
    const res = await sb().from('calendar_days').select('day_date, day_type, label').eq('school_id', schoolId);
    if (!res.error && res.data) {
      days = {...local};
      res.data.forEach((row) => {
        const iso = String(row.day_date || '').slice(0, 10);
        if (iso) days[iso] = {type: row.day_type || '', label: row.label || ''};
      });
    }
  }
  const agenda = await loadAgendaEvents(schoolId);
  return [...agenda, ...calendarEvents(days)].sort((a, b) => a.date.localeCompare(b.date));
}

async function loadNotices(schoolId: string): Promise<Notice[]> {
  if (!schoolId) return [];
  const res = await sb().from('portal_informativos').select('local_id,title,body_text,image_data,layout,published_at,expires_at,status,destinatario').eq('school_id', schoolId).eq('status', 'publicado').in('destinatario', ['professores', 'ambos']).order('published_at', {ascending: false}).limit(50);
  if (res.error || !res.data) return [];
  const now = Date.now();
  return res.data.filter((item) => !item.expires_at || new Date(String(item.expires_at)).getTime() > now).map((item) => ({
    id: String(item.local_id || item.title),
    title: item.title || 'Aviso',
    date: String(item.published_at || '').slice(0, 10) || new Date().toISOString().slice(0, 10),
    content: item.body_text || '',
    image: item.image_data || '',
    layout: item.layout || 'texto_imagem',
  }));
}

export async function loadClassRoll(schoolId: string, classCode: string, day: string): Promise<ClassRoll> {
  const students = await loadStudents(schoolId, classCode);
  const entrada: Record<string, RollMark> = {};
  const saida: Record<string, RollMark> = {};
  students.forEach((student) => {
    entrada[student.id] = blankMark();
    saida[student.id] = blankMark();
  });
  const empty: ClassRoll = {callId: null, students, entrada, saida, entradaConsolidada: false, saidaConsolidada: false};
  if (!schoolId || !classCode) return empty;
  const callRes = await sb().from('attendance_calls').select('id,entrada_consolidada,saida_consolidada').eq('school_id', schoolId).eq('class_code', classCode).eq('day_date', day).maybeSingle();
  if (callRes.error || !callRes.data?.id) return empty;
  const marks = await sb().from('attendance_marks').select('student_id,phase,status,justification,locked,source,marked_at').eq('call_id', callRes.data.id);
  (marks.data || []).forEach((row) => {
    const id = String(row.student_id);
    const mark = mapMark(row);
    if (row.phase === 'saida') saida[id] = mark;
    else entrada[id] = mark;
  });
  return {
    callId: callRes.data.id,
    students,
    entrada,
    saida,
    entradaConsolidada: !!callRes.data.entrada_consolidada,
    saidaConsolidada: !!callRes.data.saida_consolidada,
  };
}

async function loadStudents(schoolId: string, classCode: string): Promise<RollStudent[]> {
  const local = readJson<Array<Record<string, string>>>('siga_students', [])
    .filter((student) => String(student.turma || '') === classCode && (!student.status || student.status === 'Ativo'))
    .map((student) => ({id: String(student.id), nome: student.nome || 'Aluno', avatarUrl: String(student.avatar || student.foto || student.avatar_url || '')}));
  if (!schoolId) return local.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  const res = await sb().from('students').select('id,full_name,status,avatar_url').eq('school_id', schoolId).eq('class_code', classCode).order('full_name');
  if (res.error || !res.data?.length) return local.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  return res.data
    .filter((student) => !student.status || student.status === 'Ativo')
    .map((student) => ({id: String(student.id), nome: student.full_name || 'Aluno', avatarUrl: String(student.avatar_url || '')}));
}

function mirrorLocal(classCode: string, day: string, roll: ClassRoll) {
  const pack = (records: Record<string, RollMark>) => {
    const out: Record<string, Record<string, unknown>> = {};
    Object.keys(records).forEach((id) => {
      const rec = records[id];
      out[id] = {
        status: rec.status,
        justification: rec.justification,
        locked: rec.locked,
        source: rec.source,
        marked_at: rec.markedAt,
        _hasMark: rec.hasMark,
      };
    });
    return out;
  };
  localStorage.setItem('siga_attendance_' + day + '_' + classCode, JSON.stringify({
    entrada: {consolidado: roll.entradaConsolidada, records: pack(roll.entrada)},
    saida: {consolidado: roll.saidaConsolidada, records: pack(roll.saida)},
  }));
}

export async function consolidateRoll(schoolId: string, classCode: string, day: string, phase: PhaseName, roll: ClassRoll, teacherName: string) {
  const ids = roll.students.map((student) => student.id);
  const current = phase === 'entrada' ? roll.entrada : roll.saida;
  const missing = missingJustification(ids, current);
  if (missing.length) throw new Error('Informe o motivo da falta justificada antes de consolidar.');
  const locked = lockPhase(ids, current);
  const entrada = phase === 'entrada' ? locked : roll.entrada;
  const saida = phase === 'entrada' ? copyEntradaToSaida(ids, locked, roll.saida) : locked;
  const next: ClassRoll = {
    ...roll,
    entrada,
    saida,
    entradaConsolidada: phase === 'entrada' ? true : roll.entradaConsolidada,
    saidaConsolidada: phase === 'saida' ? true : roll.saidaConsolidada,
  };
  const call = await ensureCall(schoolId, classCode, day, next);
  next.callId = call;
  const rows = [...marksToRows(schoolId, call, 'entrada', next.entrada, ids), ...marksToRows(schoolId, call, 'saida', next.saida, ids)];
  for (let i = 0; i < rows.length; i += 80) {
    const res = await sb().from('attendance_marks').upsert(rows.slice(i, i + 80), {onConflict: 'call_id,student_id,phase'});
    if (res.error) throw new Error(res.error.message);
  }
  mirrorLocal(classCode, day, next);
  if (phase === 'saida') await registerEvasion(schoolId, classCode, day, next, teacherName);
  return next;
}

function marksToRows(schoolId: string, callId: string, phase: PhaseName, records: Record<string, RollMark>, ids: string[]) {
  return ids.filter((id) => records[id]?.hasMark || records[id]?.locked).map((id) => {
    const rec = records[id];
    return {
      school_id: schoolId,
      call_id: callId,
      student_id: id,
      phase,
      status: rec.status,
      justification: rec.status === 'FJ' ? rec.justification : null,
      marked_at: rec.markedAt || new Date().toISOString(),
      locked: !!rec.locked,
      source: rec.source || 'manual',
    };
  });
}

async function ensureCall(schoolId: string, classCode: string, day: string, roll: ClassRoll) {
  if (roll.callId) {
    const patch = roll.entradaConsolidada
      ? {entrada_consolidada: true, entrada_consolidada_at: new Date().toISOString(), saida_consolidada: roll.saidaConsolidada, saida_consolidada_at: roll.saidaConsolidada ? new Date().toISOString() : null}
      : {saida_consolidada: true, saida_consolidada_at: new Date().toISOString()};
    const updated = await sb().from('attendance_calls').update(patch).eq('id', roll.callId);
    if (updated.error) throw new Error(updated.error.message);
    return roll.callId;
  }
  const created = await sb().from('attendance_calls').upsert({
    school_id: schoolId,
    class_code: classCode,
    day_date: day,
    entrada_consolidada: roll.entradaConsolidada,
    saida_consolidada: roll.saidaConsolidada,
    entrada_consolidada_at: roll.entradaConsolidada ? new Date().toISOString() : null,
    saida_consolidada_at: roll.saidaConsolidada ? new Date().toISOString() : null,
  }, {onConflict: 'school_id,class_code,day_date'}).select('id').maybeSingle();
  if (created.error || !created.data?.id) throw new Error(created.error?.message || 'Não foi possível abrir a chamada.');
  return created.data.id as string;
}

async function registerEvasion(schoolId: string, classCode: string, day: string, roll: ClassRoll, teacherName: string) {
  const found = evasionStudents(roll.students, roll.entrada, roll.saida);
  if (!found.length) return;
  const hora = new Date().toLocaleTimeString('pt-BR', {hour: '2-digit', minute: '2-digit'});
  const label = day.split('-').reverse().join('/');
  const occurrences = readJson<Array<Record<string, string>>>('siga_occurrences', []);
  for (const student of found) {
    const already = occurrences.some((item) => (item.type === 'Evasão' || item.tipo === 'Evasão') && (item.date === day || item.data === day) && item.turma === classCode && (item.student === student.nome || item.alunoId === student.id));
    if (!already) {
      occurrences.unshift({
        id: 'occ_evasao_' + student.id + '_' + day,
        student: student.nome,
        aluno: student.nome,
        alunoId: student.id,
        type: 'Evasão',
        tipo: 'Evasão',
        date: day,
        data: day,
        hora,
        turma: classCode,
        prof: 'Sistema (Automático)',
        status: 'Em Análise',
        desc: 'Evasão escolar detectada automaticamente na chamada de ' + label + ' (turma ' + classCode + '): presença confirmada na entrada e falta na saída.',
        origem: 'automatica',
      });
    }
    if (!schoolId || !/^[0-9a-f-]{36}$/i.test(student.id)) continue;
    const existing = await sb().from('occurrences').select('id').eq('school_id', schoolId).eq('student_id', student.id).eq('occurrence_date', day).eq('occurrence_type', 'Evasão').limit(1);
    if (existing.data && existing.data.length) continue;
    await sb().from('occurrences').insert({
      school_id: schoolId,
      student_id: student.id,
      student_name: student.nome,
      class_code: classCode,
      occurrence_type: 'Evasão',
      status: 'Em Análise',
      description: 'Evasão escolar detectada automaticamente na chamada de ' + label + ' (turma ' + classCode + '): presença confirmada na entrada e falta na saída.',
      occurrence_date: day,
      occurrence_time: hora,
      registered_by_name: teacherName || 'Sistema (Automático)',
      source: 'frequencia',
      attendance_call_id: roll.callId,
    });
  }
  localStorage.setItem('siga_occurrences', JSON.stringify(occurrences));
}

export async function leaveTeacherPortal() {
  clearSession();
  await sb().auth.signOut().catch(() => undefined);
}

function avatarKey(email: string) {
  return 'siga_profile_avatar__email:' + email.toLowerCase();
}

async function loadTeacherRecord(email: string, schoolId: string) {
  const empty = {staffId: '', name: '', role: '', avatarUrl: '', employeeId: '', subject: '', phone: '', instagram: '', x: '', facebook: '', lattes: '', bio: ''};
  if (!email) return empty;
  let query = sb().from('school_staff').select('id,full_name,role,avatar_url,employee_id,subject,phone,social,lattes_url,bio').eq('email', email.toLowerCase());
  if (schoolId) query = query.eq('school_id', schoolId);
  const res = await query.limit(1).maybeSingle();
  const row = res.data;
  if (res.error || !row) return empty;
  const social = (row.social && typeof row.social === 'object') ? row.social as Record<string, string> : {};
  return {
    staffId: String(row.id || ''),
    name: String(row.full_name || ''),
    role: String(row.role || ''),
    avatarUrl: String(row.avatar_url || ''),
    employeeId: String(row.employee_id || ''),
    subject: String(row.subject || ''),
    phone: String(row.phone || ''),
    instagram: String(social.instagram || ''),
    x: String(social.x || ''),
    facebook: String(social.facebook || ''),
    lattes: String(row.lattes_url || ''),
    bio: String(row.bio || ''),
  };
}

export async function saveTeacherProfile(teacher: TeacherProfile, patch: Omit<TeacherProfile, 'id' | 'staffId' | 'email' | 'school' | 'schoolId' | 'avatarUrl'>) {
  const res = await sb().rpc('staff_update_own_profile', {
    p_full_name: patch.name,
    p_role: patch.role,
    p_employee_id: patch.employeeId,
    p_subject: patch.subject,
    p_phone: patch.phone,
    p_instagram: patch.instagram,
    p_x: patch.x,
    p_facebook: patch.facebook,
    p_lattes: patch.lattes,
    p_bio: patch.bio,
  });
  if (res.error) throw new Error(res.error.message);
  const data = res.data as {ok?: boolean; message?: string} | null;
  if (!data || data.ok === false) throw new Error(data?.message || 'Não foi possível salvar o cadastro.');
  const session = readStaffSession();
  if (session) {
    localStorage.setItem('siga_session', JSON.stringify({...session, nome: patch.name, role: patch.role}));
  }
  const users = readJson<Array<Record<string, unknown>>>('siga_users', []);
  localStorage.setItem('siga_users', JSON.stringify(users.map((user) => String(user.email || '').toLowerCase() === teacher.email.toLowerCase() ? {
    ...user,
    nome: patch.name,
    cargo: patch.role,
    funcao: patch.role,
    matriculaSemVinculo: patch.employeeId,
    disciplinaPrincipal: patch.subject,
    telefone: patch.phone,
    lattes: patch.lattes,
    bio: patch.bio,
    redes: {instagram: patch.instagram, x: patch.x, facebook: patch.facebook},
  } : user)));
}

async function loadTeacherAvatar(email: string, schoolId: string) {
  const local = email ? localStorage.getItem(avatarKey(email)) || '' : '';
  if (!email) return local;
  let query = sb().from('school_staff').select('avatar_url').eq('email', email.toLowerCase());
  if (schoolId) query = query.eq('school_id', schoolId);
  const res = await query.maybeSingle();
  return String(res.data?.avatar_url || local || '');
}

export function compressAvatar(file: Blob) {
  return new Promise<string>((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, 512 / Math.max(image.naturalWidth || 1, image.naturalHeight || 1));
      const width = Math.max(1, Math.round((image.naturalWidth || 1) * scale));
      const height = Math.max(1, Math.round((image.naturalHeight || 1) * scale));
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Não foi possível processar a foto.'));
        return;
      }
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(image, 0, 0, width, height);
      let quality = 0.72;
      let dataUrl = canvas.toDataURL('image/jpeg', quality);
      while (dataUrl.length > 180000 && quality > 0.45) {
        quality -= 0.08;
        dataUrl = canvas.toDataURL('image/jpeg', quality);
      }
      if (dataUrl.length > 180000) reject(new Error('A foto ficou muito pesada. Tente outra imagem.'));
      else resolve(dataUrl);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Não foi possível ler a foto.'));
    };
    image.src = url;
  });
}

export async function saveTeacherAvatar(teacher: TeacherProfile, dataUrl: string) {
  const email = teacher.email.toLowerCase();
  if (!email) throw new Error('E-mail do professor não encontrado.');
  localStorage.removeItem('siga_profile_avatar');
  localStorage.setItem(avatarKey(email), dataUrl);
  const users = readJson<Array<Record<string, string>>>('siga_users', []);
  localStorage.setItem('siga_users', JSON.stringify(users.map((user) => String(user.email || '').toLowerCase() === email ? {...user, avatar: dataUrl} : user)));
  if (!teacher.schoolId) throw new Error('Escola não vinculada. Entre novamente para salvar a foto.');
  const staff = await sb().from('school_staff').update({avatar_url: dataUrl}).eq('school_id', teacher.schoolId).eq('email', email).select('id');
  if (staff.error) throw new Error(staff.error.message);
  if (!staff.data?.length) throw new Error('Não encontrei seu cadastro de professor nesta escola.');
  if (/^[0-9a-f-]{36}$/i.test(teacher.id)) {
    await sb().from('profiles').update({avatar_url: dataUrl}).eq('id', teacher.id);
  }
}
