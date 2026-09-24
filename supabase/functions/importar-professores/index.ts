import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

type Row = { nome?: string; email?: string; senha?: string; matricula?: string };

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function normEmail(v: unknown) {
  return String(v || "").trim().toLowerCase();
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ ok: false, message: "Método inválido." }, 405);

  const url = Deno.env.get("SUPABASE_URL") || "";
  const anon = Deno.env.get("SUPABASE_ANON_KEY") || "";
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const authHeader = req.headers.get("Authorization") || "";
  if (!url || !anon || !service || !authHeader) {
    return json({ ok: false, message: "Sessão inválida." }, 401);
  }

  const userClient = createClient(url, anon, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  const user = userData?.user;
  if (userErr || !user) return json({ ok: false, message: "Sessão inválida." }, 401);

  const admin = createClient(url, service, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: profile } = await admin
    .from("profiles")
    .select("is_system_admin")
    .eq("id", user.id)
    .maybeSingle();

  const { data: mems } = await admin
    .from("school_memberships")
    .select("school_id")
    .eq("user_id", user.id)
    .eq("is_active", true);

  const schoolIds = new Set((mems || []).map((m) => m.school_id).filter(Boolean));
  const isAdmin = profile?.is_system_admin === true;
  if (!isAdmin && schoolIds.size === 0) {
    return json({ ok: false, message: "Sem permissão para importar professores." }, 403);
  }

  const body = await req.json().catch(() => ({}));
  const rows = Array.isArray(body?.rows) ? (body.rows as Row[]).slice(0, 200) : [];
  let linked = 0;
  let fail = 0;
  const errors: string[] = [];

  for (const row of rows) {
    const email = normEmail(row.email);
    const senha = String(row.senha || "");
    const nome = String(row.nome || "").trim();
    if (!email.endsWith("@escola.seduc.pa.gov.br") || senha.length < 6 || !nome) {
      fail += 1;
      errors.push(email || "(sem e-mail)" + ": linha inválida");
      continue;
    }

    const { data: staffList, error: staffErr } = await admin
      .from("school_staff")
      .select("id, school_id, user_id, full_name, role, email, employee_id")
      .eq("email", email);
    if (staffErr) {
      fail += 1;
      errors.push(email + ": " + staffErr.message);
      continue;
    }
    const staff = (staffList || []).find((s) => isAdmin || schoolIds.has(s.school_id));
    if (!staff) {
      fail += 1;
      errors.push(email + ": não está no cadastro desta escola");
      continue;
    }

    let userId = staff.user_id || null;
    if (!userId) {
      const { data: createdUser, error: createErr } = await admin.auth.admin.createUser({
        email,
        password: senha,
        email_confirm: true,
        user_metadata: { full_name: nome },
      });
      if (createErr) {
        const msg = String(createErr.message || "");
        if (!/already|registered|exists/i.test(msg)) {
          fail += 1;
          errors.push(email + ": " + msg);
          continue;
        }
        const { data: listed, error: listErr } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
        const found = (listed?.users || []).find((u) => normEmail(u.email) === email);
        if (listErr || !found) {
          fail += 1;
          errors.push(email + ": login já existe e não foi localizado");
          continue;
        }
        userId = found.id;
        await admin.auth.admin.updateUserById(userId, {
          password: senha,
          email_confirm: true,
          user_metadata: { full_name: nome },
        });
      } else {
        userId = createdUser.user?.id || null;
      }
    }

    if (!userId) {
      fail += 1;
      errors.push(email + ": sem login");
      continue;
    }

    const { error: upStaffErr } = await admin.from("school_staff").update({ user_id: userId }).eq("id", staff.id);
    if (upStaffErr) {
      fail += 1;
      errors.push(email + ": " + upStaffErr.message);
      continue;
    }

    await admin.from("profiles").upsert({
      id: userId,
      email,
      full_name: staff.full_name || nome,
      role: staff.role || "Professor(a)",
      school_id: staff.school_id,
      is_system_admin: false,
    }, { onConflict: "id" });

    const { data: existingMem } = await admin
      .from("school_memberships")
      .select("id")
      .eq("school_id", staff.school_id)
      .eq("user_id", userId)
      .maybeSingle();

    if (existingMem?.id) {
      await admin.from("school_memberships").update({
        role: "professor",
        is_active: true,
        staff_id: staff.id,
        status: "Ativo",
      }).eq("id", existingMem.id);
    } else {
      await admin.from("school_memberships").insert({
        school_id: staff.school_id,
        user_id: userId,
        role: "professor",
        is_active: true,
        staff_id: staff.id,
        status: "Ativo",
      });
    }

    linked += 1;

    await admin.from("staff_access_secrets").upsert({
      staff_id: staff.id,
      access_password: senha,
      updated_at: new Date().toISOString(),
    }, { onConflict: "staff_id" });
    if (staff.employee_id && staff.employee_id === senha) {
      await admin.from("school_staff").update({ employee_id: null }).eq("id", staff.id);
    }
  }

  return json({ ok: true, linked, fail, errors: errors.slice(0, 20) });
});
