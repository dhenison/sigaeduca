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
  );
  const idx = (cands) => {
    for (let i = 0; i < headers.length; i++) {
      for (const c of cands) {
        if (headers[i] === c || headers[i].includes(c)) return i;
      }
    }
    return -1;
  };
  const iNome = idx(['nome', 'professor']);
  const iEmail = idx(['e mail institucional', 'email institucional', 'email', 'e mail']);
  const iSenha = idx(['senha']);
  const iMat = idx(['matricula', 'matricula']);
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

    // Staff row
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
      console.log('ERRO: não achou em school_staff (importe pela tela Usuários antes, ou cadastre o staff).');
      fail += 1;
      continue;
    }
    if (staff.user_id) {
      console.log('já vinculado');
      existed += 1;
      continue;
    }

    // Create Auth user (email_confirm: true = sem enviar e-mail)
    let userId = null;
    const { data: createdUser, error: createErr } = await sb.auth.admin.createUser({
      email: row.email,
      password: row.senha,
      email_confirm: true,
      user_metadata: { full_name: row.nome }
    });

    if (createErr) {
      const msg = String(createErr.message || '');
      if (/already|registered|exists/i.test(msg)) {
        // Lista usuários e acha pelo e-mail
        const { data: listed, error: listErr } = await sb.auth.admin.listUsers({ page: 1, perPage: 1000 });
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
        // Atualiza senha para a da planilha
        const { error: updErr } = await sb.auth.admin.updateUserById(userId, {
          password: row.senha,
          email_confirm: true,
          user_metadata: { full_name: row.nome }
        });
        if (updErr) {
          console.log('avisado: UID ok, senha não atualizou:', updErr.message);
        } else {
          console.log('Auth já existia — senha atualizada; ', { end: '' });
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

    if (!userId) {
      console.log('ERRO sem userId');
      fail += 1;
      continue;
    }

    // Link staff
    const { error: linkRpcErr } = await sb.rpc('link_staff_auth_user', {
      p_staff_id: staff.id,
      p_auth_user_id: userId
    });

    if (linkRpcErr) {
      const { error: upErr } = await sb
        .from('school_staff')
        .update({ user_id: userId })
        .eq('id', staff.id);
      if (upErr) {
        console.log('ERRO vínculo:', linkRpcErr.message, '/', upErr.message);
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
  console.log('\nConferido: Authentication → Users e Table Editor → school_staff (user_id).');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
