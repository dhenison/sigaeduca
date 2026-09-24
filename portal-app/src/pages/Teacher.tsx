import {useEffect, useRef, useState, type ReactNode} from 'react';
import {IonApp, IonContent, IonLabel, IonModal, IonPage, IonRefresher, IonRefresherContent, IonSkeletonText, IonTabBar, IonTabButton, IonToast} from '@ionic/react';
import {Brand, Empty, Icon, Credit, type IconName} from '../components/UI';
import {Calendar, Notices, Schedule} from './Academic';
import {studentInitials} from '../services/siga';
import {
  blankMark,
  compressAvatar,
  consolidateRoll,
  isFacialLocked,
  leaveTeacherPortal,
  loadClassRoll,
  loadTeacherPortal,
  saveTeacherAvatar,
  saveTeacherProfile,
  type ClassRoll,
  type MarkStatus,
  type PhaseName,
  type TeacherSnapshot,
} from '../services/teacher';

const titles: Record<string, string> = {
  home: 'Início',
  calendar: 'Calendário',
  attendance: 'Frequência',
  notices: 'Informes',
  schedule: 'Horário de Aula',
  olympics: 'Topo do Saber',
  profile: 'Perfil',
  more: 'Mais',
  settings: 'Configurações',
  about: 'Sobre',
};
const tabs: {route: string; icon: IconName; label: string}[] = [
  {route: 'home', icon: 'home', label: 'Início'},
  {route: 'calendar', icon: 'calendar', label: 'Calendário'},
  {route: 'attendance', icon: 'attendance', label: 'Frequência'},
  {route: 'notices', icon: 'notices', label: 'Informes'},
  {route: 'more', icon: 'more', label: 'Mais'},
];
const features: {route: string; title: string; icon: IconName; color: string; description: string}[] = [
  {route: 'calendar', title: 'Calendário', icon: 'calendar', color: 'blue', description: 'Veja os dias letivos e os eventos da escola.'},
  {route: 'attendance', title: 'Frequência', icon: 'attendance', color: 'green', description: 'Faça a chamada de entrada e de saída da turma.'},
  {route: 'schedule', title: 'Horário de Aula', icon: 'schedule', color: 'red', description: 'Abra a grade de horários no Drive.'},
  {route: 'olympics', title: 'Topo do Saber', icon: 'olympics', color: 'orange', description: 'Acompanhe as olimpíadas e os projetos da escola.'},
];

function todayIso() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

export default function TeacherApp() {
  const [data, setData] = useState<TeacherSnapshot | null>(null);
  const [ready, setReady] = useState(false);
  const [route, setRoute] = useState(() => location.hash.slice(2) || 'home');
  const [toast, setToast] = useState('');
  const [sheet, setSheet] = useState<{title: string; body: ReactNode} | null>(null);
  const [read, setRead] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem('siga_portal_notice_read') || '[]'); } catch { return []; }
  });
  const [photo, setPhoto] = useState('');
  const [theme, setTheme] = useState(() => localStorage.getItem('siga-theme') || 'light');
  const [offline, setOffline] = useState(!navigator.onLine);

  async function reload() {
    const next = await loadTeacherPortal();
    setData(next);
    setReady(true);
  }
  useEffect(() => { reload(); }, []);
  useEffect(() => { if (data?.teacher.avatarUrl) setPhoto(data.teacher.avatarUrl); }, [data]);
  useEffect(() => {
    const fn = () => setRoute(location.hash.slice(2) || 'home');
    window.addEventListener('hashchange', fn);
    return () => window.removeEventListener('hashchange', fn);
  }, []);
  useEffect(() => {
    if (ready && !data) location.replace('/login.html');
  }, [ready, data]);
  useEffect(() => {
    const media = matchMedia('(prefers-color-scheme: dark)');
    const update = () => document.documentElement.classList.toggle('dark', theme === 'dark' || (theme === 'system' && media.matches));
    update();
    media.addEventListener('change', update);
    localStorage.setItem('siga-theme', theme);
    return () => media.removeEventListener('change', update);
  }, [theme]);
  useEffect(() => {
    const on = () => setOffline(!navigator.onLine);
    window.addEventListener('online', on);
    window.addEventListener('offline', on);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', on); };
  }, []);

  function go(next: string) {
    location.hash = '/' + next;
    setRoute(next);
  }
  function markRead(id: string) {
    setRead((prev) => {
      const next = prev.includes(id) ? prev : [...prev, id];
      localStorage.setItem('siga_portal_notice_read', JSON.stringify(next));
      return next;
    });
  }
  async function logout() {
    await leaveTeacherPortal();
    location.replace('/login.html');
  }

  if (!ready || !data) return <IonApp><IonSkeletonText animated style={{width: '100%', height: '100vh'}} /></IonApp>;
  const selected = tabs.some((tab) => tab.route === route) ? route : 'more';
  let content: ReactNode;
  switch (route) {
    case 'home': content = <TeacherHome data={data} photo={photo} go={go} />; break;
    case 'calendar': content = <Calendar detail={(title, body) => setSheet({title, body})} events={data.events} />; break;
    case 'attendance': content = <TeacherAttendance data={data} notify={setToast} />; break;
    case 'notices': content = <Notices read={read} onRead={markRead} items={data.notices} />; break;
    case 'schedule': content = <Schedule />; break;
    case 'olympics': content = <Olympics data={data} />; break;
    case 'profile': content = <TeacherProfile data={data} photo={photo} onPhoto={setPhoto} notify={setToast} />; break;
    case 'settings': content = <section className="surface padded"><h2>Aparência</h2><p>Escolha o tema do aplicativo.</p><div className="theme-options">{[['light', 'Claro'], ['dark', 'Escuro'], ['system', 'Sistema']].map(([value, label]) => <label key={value}><input type="radio" name="theme" checked={theme === value} onChange={() => setTheme(value)} />{label}</label>)}</div></section>; break;
    case 'about': content = <section className="surface padded"><Brand label="Portal do Professor" /><h2>A chamada da turma em um só lugar.</h2><p>Portal do Professor · SIGA EDUCA</p><p>Versão 1.0</p><Credit /></section>; break;
    default: content = <TeacherMore go={go} logout={logout} />;
  }
  return <IonApp><div className="app-viewport"><IonPage>
    <header className="app-header">{route === 'home' ? <><button aria-label="Abrir menu" onClick={() => go('more')}><Icon name="menu" /></button><Brand label="Portal do Professor" /><button className="profile-button" aria-label="Meu perfil" onClick={() => go('profile')}>{photo ? <img src={photo} alt="" /> : <Icon name="profile" />}</button></> : <><button aria-label="Voltar ao início" onClick={() => go('home')}><Icon name="back" /></button><h1>{titles[route] || 'Mais'}</h1><button className="profile-button" aria-label="Meu perfil" onClick={() => go('profile')}>{photo ? <img src={photo} alt="" /> : <Icon name="profile" />}</button></>}</header>
    {offline && <div className="offline">Sem conexão · A chamada precisa de internet para ser salva</div>}
    <IonContent><IonRefresher slot="fixed" onIonRefresh={(event) => { reload().finally(() => { setToast('Portal atualizado'); event.detail.complete(); }); }}><IonRefresherContent pullingText="Puxe para atualizar" /></IonRefresher>
      <main key={route} className={'page ' + (route === 'home' ? 'home-page' : '')}>{content}</main>
    </IonContent>
    <IonTabBar selectedTab={selected}>{tabs.map((tab) => <IonTabButton key={tab.route} tab={tab.route} selected={selected === tab.route} onClick={() => go(tab.route)}><Icon name={tab.icon} /><IonLabel>{tab.label}</IonLabel></IonTabButton>)}</IonTabBar>
  </IonPage></div><IonModal isOpen={!!sheet} onDidDismiss={() => setSheet(null)} initialBreakpoint={0.8} breakpoints={[0, 0.8, 1]}><div className="sheet"><header><h2>{sheet?.title}</h2><button aria-label="Fechar" onClick={() => setSheet(null)}><Icon name="close" /></button></header>{sheet?.body}</div></IonModal><IonToast isOpen={!!toast} message={toast} duration={2400} onDidDismiss={() => setToast('')} /></IonApp>;
}

function TeacherHome({data, photo, go}: {data: TeacherSnapshot; photo: string; go: (route: string) => void}) {
  const {teacher} = data;
  return <>
    <button className="student-card surface" onClick={() => go('profile')}>
      <div className="avatar">{photo ? <img src={photo} alt="" /> : studentInitials(teacher.name)}</div>
      <div className="student-info"><span>Olá,</span><h2>{teacher.name}</h2><p><Icon name="people" />{teacher.role}</p>{teacher.school && <p><Icon name="school" />{teacher.school}</p>}</div>
      <Icon name="next" />
    </button>
    <div className="quote"><span>“</span><em>A entrada e a saída da turma ficam registradas para toda a escola.</em><small>SIGA EDUCA</small></div>
    <div className="features">{features.map((feature) => <button key={feature.route} className="feature surface" onClick={() => go(feature.route)}><div className={`icon-box ${feature.color}`}><Icon name={feature.icon} /></div><Icon name="next" className="feature-arrow" /><h3>{feature.title}</h3><p>{feature.description}</p></button>)}</div>
    <button className="inform-banner" onClick={() => go('notices')}><div className="icon-box purple"><Icon name="notices" /></div><div><h3>Informes</h3><p>{data.notices[0]?.title || 'Comunicados publicados para a escola.'}</p></div><Icon name="next" /></button>
  </>;
}

function TeacherMore({go, logout}: {go: (route: string) => void; logout: () => void}) {
  const items: [string, string][] = [['schedule', 'Horário de Aula'], ['olympics', 'Topo do Saber'], ['profile', 'Perfil'], ['settings', 'Configurações'], ['about', 'Sobre']];
  return <section className="surface narrow">{items.map(([route, title]) => <button className="list-row" key={route} onClick={() => go(route)}><b>{title}</b><Icon name="next" /></button>)}<button className="list-row danger" onClick={logout}><b>Sair</b><Icon name="logout" /></button></section>;
}

function TeacherProfile({data, photo, onPhoto, notify}: {data: TeacherSnapshot; photo: string; onPhoto: (value: string) => void; notify: (message: string) => void}) {
  const {teacher} = data;
  const camera = useRef<HTMLInputElement>(null);
  const gallery = useRef<HTMLInputElement>(null);
  const [saving, setSaving] = useState(false);
  async function onFile(file?: File) {
    if (!file) return;
    setSaving(true);
    try {
      const dataUrl = await compressAvatar(file);
      await saveTeacherAvatar(teacher, dataUrl);
      onPhoto(dataUrl);
      notify('Foto salva. Ela também aparece no seu usuário do sistema.');
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Não foi possível salvar a foto.');
    } finally {
      setSaving(false);
    }
  }
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(teacher);
  const roles = ['Professor(a)', 'Coordenador', 'Secretario(a) Escolar', 'Vice-diretor Pedagógico', 'Vice-diretor Administrativo', 'Diretor'];
  function field(key: keyof typeof form, label: string, placeholder = '') {
    return <label className="profile-edit"><span>{label}</span><input value={form[key]} placeholder={placeholder} onChange={(event) => setForm({...form, [key]: event.target.value})} /></label>;
  }
  async function save() {
    setSaving(true);
    try {
      await saveTeacherProfile(teacher, form);
      notify('Cadastro salvo. A alteração também aparece no sistema web.');
      setEditing(false);
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Não foi possível salvar.');
    } finally {
      setSaving(false);
    }
  }
  const details: [string, string][] = [
    ['E-mail institucional', teacher.email],
    ['Função', form.role],
    ['Matrícula sem vínculo', form.employeeId],
    ['Disciplina principal', form.subject],
    ['Telefone', form.phone],
    ['Instagram', form.instagram],
    ['X', form.x],
    ['Facebook', form.facebook],
    ['Currículo Lattes', form.lattes],
    ['Bio', form.bio],
    ['Escola', teacher.school],
  ];
  return <section className="surface padded narrow profile">
    <div className="avatar">{photo ? <img src={photo} alt="" /> : studentInitials(form.name || teacher.name)}</div>
    <h2>{form.name || teacher.name}</h2>
    <p>{form.role || 'Professor'}</p>
    <div className="photo-actions">
      <button type="button" disabled={saving} onClick={() => camera.current?.click()}>Tirar foto</button>
      <button type="button" disabled={saving} onClick={() => gallery.current?.click()}>Enviar foto</button>
    </div>
    <input className="file-input" ref={camera} type="file" accept="image/*" capture="user" onChange={(event) => { onFile(event.target.files?.[0]); event.target.value = ''; }} />
    <input className="file-input" ref={gallery} type="file" accept="image/*" onChange={(event) => { onFile(event.target.files?.[0]); event.target.value = ''; }} />
    {editing ? <div className="profile-form">
      {field('name', 'Nome completo')}
      <label className="profile-edit"><span>Função</span><select value={form.role} onChange={(event) => setForm({...form, role: event.target.value})}>{roles.map((role) => <option key={role}>{role}</option>)}</select></label>
      {field('employeeId', 'Matrícula sem vínculo')}
      {field('subject', 'Disciplina principal', 'Ex: Matemática')}
      {field('phone', 'Telefone', '(91) 98888-7777')}
      {field('instagram', 'Instagram')}
      {field('x', 'X')}
      {field('facebook', 'Facebook')}
      {field('lattes', 'Currículo Lattes', 'https://lattes.cnpq.br/...')}
      <label className="profile-edit"><span>Bio</span><textarea rows={4} value={form.bio} onChange={(event) => setForm({...form, bio: event.target.value})} /></label>
      <div className="profile-field"><small>E-mail institucional</small><b>{teacher.email}</b></div>
      <div className="profile-field"><small>Senha</small><b>Definida na importação. Não pode ser alterada aqui.</b></div>
      <div className="photo-actions">
        <button type="button" disabled={saving} onClick={() => { setForm(teacher); setEditing(false); }}>Cancelar</button>
        <button type="button" className="save" disabled={saving} onClick={save}>{saving ? 'Salvando…' : 'Salvar'}</button>
      </div>
    </div> : <>
      {details.filter(([, value]) => value).map(([label, value]) => <div className="profile-field" key={label}><small>{label}</small><b>{value}</b></div>)}
      <div className="profile-field"><small>Senha</small><b>Definida na importação. Não pode ser alterada aqui.</b></div>
      <div className="photo-actions"><button type="button" onClick={() => { setForm(teacher); setEditing(true); }}>Editar dados</button></div>
    </>}
  </section>;
}

function Olympics({data}: {data: TeacherSnapshot}) {
  if (!data.olympics.length) return <Empty title="Nenhuma olimpíada publicada neste aparelho." description="O Topo do Saber aparece aqui quando a escola registrar os projetos." />;
  return <section className="surface">{data.olympics.map((item) => <article className="list-row" key={item.id}><div><b>{item.title}</b>{item.detail && <p>{item.detail}</p>}</div></article>)}</section>;
}

function TeacherAttendance({data, notify}: {data: TeacherSnapshot; notify: (message: string) => void}) {
  const [day, setDay] = useState(todayIso);
  const [turno, setTurno] = useState('');
  const [turma, setTurma] = useState('');
  const [roll, setRoll] = useState<ClassRoll | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [openPhase, setOpenPhase] = useState<PhaseName | null>(null);
  const turnos = [...new Set(data.classes.map((item) => item.turno).filter(Boolean))];
  const classes = data.classes.filter((item) => !turno || item.turno === turno);

  useEffect(() => {
    if (!turma || !data.teacher.schoolId) {
      setRoll(null);
      return;
    }
    let on = true;
    setLoading(true);
    loadClassRoll(data.teacher.schoolId, turma, day).then((next) => { if (on) setRoll(next); }).catch(() => { if (on) notify('Não foi possível carregar a chamada.'); }).finally(() => { if (on) setLoading(false); });
    return () => { on = false; };
  }, [turma, day, data.teacher.schoolId]);

  useEffect(() => { setOpenPhase(null); }, [turma, day]);

  function chooseTurno(value: string) {
    setTurno(value);
    setTurma('');
    setRoll(null);
  }
  function setMark(phase: PhaseName, studentId: string, status: MarkStatus) {
    setRoll((current) => {
      if (!current) return current;
      const locked = phase === 'entrada' ? current.entradaConsolidada : current.saidaConsolidada;
      const mark = current[phase][studentId] || blankMark();
      if (locked || isFacialLocked(mark)) return current;
      return {...current, [phase]: {...current[phase], [studentId]: {...mark, status, hasMark: true, justification: status === 'FJ' ? mark.justification : ''}}};
    });
  }
  function setReason(phase: PhaseName, studentId: string, justification: string) {
    setRoll((current) => {
      if (!current) return current;
      const mark = current[phase][studentId] || blankMark();
      return {...current, [phase]: {...current[phase], [studentId]: {...mark, justification, status: 'FJ', hasMark: true}}};
    });
  }
  async function consolidate(phase: PhaseName) {
    if (!roll || !data.teacher.schoolId || !turma) return;
    setSaving(true);
    try {
      const next = await consolidateRoll(data.teacher.schoolId, turma, day, phase, roll, data.teacher.name);
      setRoll(next);
      setOpenPhase(null);
      notify(phase === 'entrada' ? 'Entrada consolidada. A saída já pode ser feita.' : 'Saída consolidada. A chamada foi realizada.');
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Não foi possível salvar a chamada.');
    } finally {
      setSaving(false);
    }
  }

  return <div className="narrow">
    <label className="date-filter surface"><span>Dia</span><input type="date" value={day} onChange={(event) => setDay(event.target.value)} /></label>
    <label className="date-filter surface"><span>Turno</span><select value={turno} onChange={(event) => chooseTurno(event.target.value)}><option value="">Selecione</option>{turnos.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
    <label className="date-filter surface"><span>Turma</span><select value={turma} onChange={(event) => setTurma(event.target.value)}><option value="">Selecione</option>{classes.map((item) => <option key={item.code} value={item.code}>{item.code}{item.serie ? ` — ${item.serie}` : ''}</option>)}</select></label>
    {!data.teacher.schoolId && <Empty title="Escola não vinculada a este acesso." description="Entre novamente com o e-mail institucional para carregar a escola." />}
    {data.teacher.schoolId && !turma && <Empty title="Escolha o dia, o turno e a turma." description="A chamada de entrada abre primeiro. A saída aparece depois da consolidação." />}
    {loading && <p className="muted">Carregando a turma...</p>}
    {roll && !loading && <>
      <RollCard title="Chamada de entrada" phase="entrada" open={openPhase === 'entrada'} onToggle={() => setOpenPhase((current) => current === 'entrada' ? null : 'entrada')} roll={roll} saving={saving} onMark={setMark} onReason={setReason} onConsolidate={() => consolidate('entrada')} />
      {roll.entradaConsolidada && <RollCard title="Chamada de saída" phase="saida" open={openPhase === 'saida'} onToggle={() => setOpenPhase((current) => current === 'saida' ? null : 'saida')} roll={roll} saving={saving} onMark={setMark} onReason={setReason} onConsolidate={() => consolidate('saida')} />}
      {roll.entradaConsolidada && roll.saidaConsolidada && <p className="call-done">A chamada de entrada e de saída foi realizada.</p>}
    </>}
  </div>;
}

function RollCard({title, phase, open, onToggle, roll, saving, onMark, onReason, onConsolidate}: {
  title: string;
  phase: PhaseName;
  open: boolean;
  onToggle: () => void;
  roll: ClassRoll;
  saving: boolean;
  onMark: (phase: PhaseName, studentId: string, status: MarkStatus) => void;
  onReason: (phase: PhaseName, studentId: string, justification: string) => void;
  onConsolidate: () => void;
}) {
  const [zoom, setZoom] = useState<{nome: string; url: string} | null>(null);
  const locked = phase === 'entrada' ? roll.entradaConsolidada : roll.saidaConsolidada;
  const records = roll[phase];
  const marks: [MarkStatus, string][] = [['P', 'Presença'], ['F', 'Falta'], ['FJ', 'Falta justificada']];
  return <section className="roll-slot">
    <button type="button" className={`call-toggle ${locked ? 'done' : 'pending'}`} aria-expanded={locked ? false : open} onClick={() => { if (!locked) onToggle(); }}>
      <span>{locked ? `${title} realizada` : `Realizar ${title.toLowerCase()}`}</span>
      <span aria-hidden="true">{locked ? 'OK' : open ? '▴' : '▾'}</span>
    </button>
    {!locked && open && <div className="surface roll-card">
    <p className="muted">Marque presença, falta ou falta justificada e consolide para salvar.</p>
    {!roll.students.length && <Empty title="Nenhum aluno ativo nesta turma." />}
    {roll.students.map((student) => {
      const mark = records[student.id] || blankMark();
      const frozen = locked || isFacialLocked(mark);
      return <article className="roll-student" key={student.id}>
        <div className="roll-line">
          <button type="button" className="roll-avatar" aria-label={student.avatarUrl ? `Ampliar foto de ${student.nome}` : `Foto de ${student.nome}`} disabled={!student.avatarUrl} onClick={() => student.avatarUrl && setZoom({nome: student.nome, url: student.avatarUrl})}>
            {student.avatarUrl ? <img src={student.avatarUrl} alt="" /> : studentInitials(student.nome)}
          </button>
          <b>{student.nome}</b>
          <div className="roll-options">{marks.map(([status, label]) => <label key={status} title={label}><input type="radio" name={`${phase}-${student.id}`} checked={mark.hasMark ? mark.status === status : status === 'P'} disabled={frozen} onChange={() => onMark(phase, student.id, status)} /><span className="roll-short">{status}</span><span className="roll-long">{label}</span></label>)}</div>
        </div>
        {isFacialLocked(mark) && <small>Reconhecimento facial</small>}
        {mark.status === 'FJ' && !frozen && <input className="roll-reason" placeholder="Motivo da falta justificada" value={mark.justification} onChange={(event) => onReason(phase, student.id, event.target.value)} />}
        {mark.status === 'FJ' && frozen && mark.justification && <p>{mark.justification}</p>}
      </article>;
    })}
    <button className="primary" disabled={saving || !roll.students.length} onClick={onConsolidate}>{saving ? 'Salvando...' : phase === 'entrada' ? 'Consolidar Entrada' : 'Consolidar Saída'}</button>
    </div>}
    {zoom && <button type="button" className="photo-zoom" aria-label="Fechar foto" onClick={() => setZoom(null)}><img src={zoom.url} alt={zoom.nome} /></button>}
  </section>;
}
