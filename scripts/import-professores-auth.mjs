/**
 * SIGA EDUCA — cria logins Auth em massa (service role, sem e-mail)
 *
 * Uso (PowerShell), na pasta do projeto:
 *
 *   $env:SUPABASE_URL = "https://digjzihjboflcuftmokj.supabase.co"
 *   $env:SUPABASE_SERVICE_ROLE_KEY = "cole_a_service_role_aqui"
 *   node "scripts/import-professores-auth.mjs"
 *
 * Onde pegar a key: Supabase → Project Settings → API → service_role (secret)
 * NÃO commite a service_role. NÃO use no frontend.
 *
 * Lê: Gestão de Lotação/Professores - Matricula.xlsx
 * Colunas: Nome | E-mail Institucional | Matrícula | Senha | Função
 */
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import { createClient } from '@supabase/supabase-js';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const xlsxPath = path.join(root, 'Gestão de Lotação', 'Professores - Matricula.xlsx');

const url = process.env.SUPABASE_URL || 'https://digjzihjboflcuftmokj.supabase.co';
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!serviceKey) {
  console.error('Defina SUPABASE_SERVICE_ROLE_KEY (Settings → API → service_role).');
  process.exit(1);
}

const require = createRequire(import.meta.url);
let XLSX;
try {
  XLSX = require('xlsx');
} catch (e) {
  console.error('Instale a dependência: npm install xlsx @supabase/supabase-js');
  process.exit(1);
}

function normEmail(v) {
  return String(v || '').trim().toLowerCase();
}

function readRows() {
  if (!fs.existsSync(xlsxPath)) {
    throw new Error('Arquivo não encontrado: ' + xlsxPath);
  }
  const wb = XLSX.readFile(xlsxPath);
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
  if (!matrix.length) return [];
  const headers = (matrix[0] || []).map((h) =>
    String(h || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim()
  );
  console.log('Lendo:', xlsxPath);
  console.log('Cabeçalhos:', headers);
  const idx = (cands) => {
    for (let i = 0; i < headers.length; i++) {
      for (const c of cands) {
        if (headers[i] === c || headers[i].includes(c)) return i;
      }
    }
    return -1;
  };
  const iNome = idx(['nome', 'professor']);
  const iEmail = idx(['e mail institucional', 'email institucional', 'email', 'e mail', 'mail']);
  const iSenha = idx(['senha']);
  const iMat = idx(['matricula', 'matricula']);
  if (iNome < 0 || iEmail < 0 || iSenha < 0) {
    throw new Error('Colunas obrigatórias ausentes. Índices=' + JSON.stringify({ iNome, iEmail, iSenha, iMat }));
  }
  const out = [];
  for (let r = 1; r < matrix.length; r++) {
    const row = matrix[r] || [];
    const nome = String(row[iNome] || '').trim();
    const email = normEmail(row[iEmail]);
    const senha = String(row[iSenha] || '').trim();
    let matricula = String(iMat >= 0 ? row[iMat] || '' : '').trim();
    if (!matricula && senha) matricula = senha;
    if (!nome || !email || !senha) continue;
    out.push({ nome, email, senha, matricula });
  }
  return out;
}

async function membershipRoleFromStaffRole(role) {
  const roleMap = {
    diretor: 'diretor',
    'vice-diretor': 'gestor',
    coordenador: 'coordenador',
    secretario: 'secretario',
    secretaria: 'secretario',
    professor: 'professor'
  };
  const roleKey = String(role || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
  for (const [k, v] of Object.entries(roleMap)) {
    if (roleKey.startsWith(k)) return v;
  }
  return 'servidor';
}

/** Vínculo completo: staff.user_id + profiles + school_memberships (service_role). */
async function ensureMembershipAndProfile(sb, staffId, userId) {
  const { error: upStaffErr } = await sb
    .from('school_staff')
    .update({ user_id: userId })
    .eq('id', staffId);
  if (upStaffErr) throw new Error('staff: ' + upStaffErr.message);

  const { data: staffFull, error: staffReadErr } = await sb
    .from('school_staff')
    .select('id, school_id, email, full_name, role')
    .eq('id', staffId)
    .single();
  if (staffReadErr) throw new Error('staff read: ' + staffReadErr.message);

  const membershipRole = await membershipRoleFromStaffRole(staffFull.role);

  const { error: profErr } = await sb.from('profiles').upsert(
    {
      id: userId,
      email: staffFull.email,
      full_name: staffFull.full_name,
      role: staffFull.role,
      school_id: staffFull.school_id,
      is_system_admin: false
    },
    { onConflict: 'id' }
  );
  if (profErr) throw new Error('profile: ' + profErr.message);

  const { data: existingMem } = await sb
    .from('school_memberships')
    .select('id')
    .eq('school_id', staffFull.school_id)
    .eq('user_id', userId)
    .maybeSingle();

  if (existingMem && existingMem.id) {
    const { error: memUpErr } = await sb
      .from('school_memberships')
      .update({
        role: membershipRole,
        is_active: true,
        staff_id: staffFull.id,
        status: 'Ativo'
      })
      .eq('id', existingMem.id);
    if (memUpErr) throw new Error('membership update: ' + memUpErr.message);
  } else {
    const { error: memInsErr } = await sb.from('school_memberships').insert({
      school_id: staffFull.school_id,
      user_id: userId,
      role: membershipRole,
      is_active: true,
      staff_id: staffFull.id,
      status: 'Ativo'
    });
    if (memInsErr) throw new Error('membership insert: ' + memInsErr.message);
  }
}

async function main() {
  const sb = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });

  const rows = readRows();
  console.log('Linhas na planilha:', rows.length);

  let created = 0;
  let linked = 0;
  let existed = 0;
  let fail = 0;

  for (const row of rows) {
    process.stdout.write(`→ ${row.email} ... `);

    const { data: staff, error: staffErr } = await sb
      .from('school_staff')
      .select('id, user_id, school_id, full_name')
      .eq('email', row.email)
      .maybeSingle();

    if (staffErr) {
      console.log('ERRO staff:', staffErr.message);
      fail += 1;
      continue;
    }
    if (!staff) {
      console.log('ERRO: não achou em school_staff (importe pela tela Usuários antes).');
      fail += 1;
      continue;
    }

    let userId = staff.user_id || null;

    if (!userId) {
      const { data: createdUser, error: createErr } = await sb.auth.admin.createUser({
        email: row.email,
        password: row.senha,
        email_confirm: true,
        user_metadata: { full_name: row.nome }
      });

      if (createErr) {
        const msg = String(createErr.message || '');
        if (/already|registered|exists/i.test(msg)) {
          const { data: listed, error: listErr } = await sb.auth.admin.listUsers({
            page: 1,
            perPage: 1000
          });
          if (listErr) {
            console.log('ERRO listUsers:', listErr.message);
            fail += 1;
            continue;
          }
          const found = (listed.users || []).find((u) => normEmail(u.email) === row.email);
          if (!found) {
            console.log('ERRO: Auth diz que existe, mas não achei o UID');
            fail += 1;
            continue;
          }
          userId = found.id;
          const { error: updErr } = await sb.auth.admin.updateUserById(userId, {
            password: row.senha,
            email_confirm: true,
            user_metadata: { full_name: row.nome }
          });
          if (updErr) {
            console.log('avisado: UID ok, senha não atualizou:', updErr.message);
          } else {
            process.stdout.write('Auth já existia — senha atualizada; ');
          }
          existed += 1;
        } else {
          console.log('ERRO createUser:', msg);
          fail += 1;
          continue;
        }
      } else {
        userId = createdUser.user && createdUser.user.id;
        created += 1;
        process.stdout.write('Auth criado; ');
      }
    } else {
      existed += 1;
      process.stdout.write('Auth ok; ');
    }

    if (!userId) {
      console.log('ERRO sem userId');
      fail += 1;
      continue;
    }

    // link_staff_auth_user exige auth.uid(); com service_role usamos upsert direto.
    const { error: linkRpcErr } = await sb.rpc('link_staff_auth_user', {
      p_staff_id: staff.id,
      p_auth_user_id: userId
    });

    if (linkRpcErr) {
      try {
        await ensureMembershipAndProfile(sb, staff.id, userId);
      } catch (e) {
        console.log('ERRO vínculo:', linkRpcErr.message, '/', e.message || e);
        fail += 1;
        continue;
      }
    }

    linked += 1;
    console.log('vinculado');
  }

  console.log('\nResumo:');
  console.log('  Auth criados:', created);
  console.log('  Já existiam / atualizados:', existed);
  console.log('  Vinculados nesta execução:', linked);
  console.log('  Falhas:', fail);
  console.log('\nConferido: Authentication → Users, school_staff.user_id e school_memberships.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
