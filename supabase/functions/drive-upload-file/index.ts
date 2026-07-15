/**
 * SIGA EDUCA — Upload institucional para Google Drive
 * Secrets:
 *   GOOGLE_SERVICE_ACCOUNT_JSON  — JSON completo da conta de serviço
 *   GOOGLE_DRIVE_ROOT_FOLDER_ID  — ID da pasta SIGAEDUCA
 *
 * Body JSON:
 * {
 *   module: "secretaria" | "solicitacoes",
 *   tipo: string,
 *   solicitanteNome?: string,  // obrigatório em solicitacoes
 *   fileName: string,
 *   mimeType?: string,
 *   contentBase64: string
 * }
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { SignJWT, importPKCS8 } from "https://esm.sh/jose@5.9.6";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive";
const DRIVE_API = "https://www.googleapis.com/drive/v3";
const UPLOAD_API = "https://www.googleapis.com/upload/drive/v3/files";

const FOLDER_SECRETARIA = "Documentos Secretaria";
const FOLDER_SOLICITACOES = "SOLICITAÇÕES PEDAGÓGICAS";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader.startsWith("Bearer ")) {
      return json({ error: "Não autenticado." }, 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const supabaseAnon = Deno.env.get("SUPABASE_ANON_KEY") || "";
    const sb = createClient(supabaseUrl, supabaseAnon, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await sb.auth.getUser();
    if (userErr || !userData?.user) {
      return json({ error: "Sessão inválida. Faça login novamente." }, 401);
    }

    const saJsonRaw = Deno.env.get("GOOGLE_SERVICE_ACCOUNT_JSON") || "";
    const rootFolderId = (Deno.env.get("GOOGLE_DRIVE_ROOT_FOLDER_ID") || "").trim();
    if (!saJsonRaw || !rootFolderId) {
      return json({
        error:
          "Drive institucional não configurado. Defina GOOGLE_SERVICE_ACCOUNT_JSON e GOOGLE_DRIVE_ROOT_FOLDER_ID.",
      }, 503);
    }

    let sa: Record<string, string>;
    try {
      // Aceita JSON colado “limpo” ou com aspas extras no secret
      const trimmed = saJsonRaw.trim().replace(/^\uFEFF/, "");
      sa = JSON.parse(trimmed);
    } catch {
      return json({
        error:
          "GOOGLE_SERVICE_ACCOUNT_JSON inválido. Cole o arquivo .json completo da conta siga-drive@siga-educa-drive.iam.gserviceaccount.com (não o e-mail sozinho).",
      }, 500);
    }

    const saEmail = String(sa.client_email || "").trim();
    if (!saEmail || !sa.private_key) {
      return json({
        error:
          "GOOGLE_SERVICE_ACCOUNT_JSON incompleto (faltam client_email/private_key). Use o JSON da conta siga-drive@siga-educa-drive.iam.gserviceaccount.com.",
      }, 500);
    }

    const expectedSa =
      (Deno.env.get("GOOGLE_SERVICE_ACCOUNT_EMAIL") ||
        "siga-drive@siga-educa-drive.iam.gserviceaccount.com").trim().toLowerCase();
    if (saEmail.toLowerCase() !== expectedSa) {
      console.warn(
        "[drive-upload-file] client_email diferente do esperado:",
        saEmail,
        "≠",
        expectedSa,
      );
    }

    const body = await req.json();
    const moduleName = String(body.module || "").trim();
    const tipo = String(body.tipo || "").trim() || "Geral";
    const solicitanteNome = String(body.solicitanteNome || "").trim() || "Sem nome";
    const fileName = sanitizeFileName(String(body.fileName || "arquivo.bin"));
    const mimeType = String(body.mimeType || "application/octet-stream");
    const contentBase64 = String(body.contentBase64 || "");

    if (!contentBase64) {
      return json({ error: "Arquivo vazio (contentBase64)." }, 400);
    }
    if (moduleName !== "secretaria" && moduleName !== "solicitacoes") {
      return json({ error: 'module deve ser "secretaria" ou "solicitacoes".' }, 400);
    }

    const accessToken = await getAccessToken(sa);
    const pathParts =
      moduleName === "secretaria"
        ? [FOLDER_SECRETARIA, tipo]
        : [FOLDER_SOLICITACOES, sanitizeFolderName(solicitanteNome), tipo];

    const folderId = await ensureFolderPath(accessToken, rootFolderId, pathParts);
    const folderPath = ["SIGAEDUCA", ...pathParts].join(" / ");

    const bytes = base64ToUint8Array(contentBase64);
    const uploaded = await uploadFile(
      accessToken,
      folderId,
      fileName,
      mimeType,
      bytes,
    );

    // Quem tem o link abre/imprime sem login Google pessoal (Drive institucional).
    await shareAnyoneWithLink(accessToken, uploaded.id);

    const webViewLink =
      uploaded.webViewLink ||
      `https://drive.google.com/file/d/${uploaded.id}/view?usp=sharing`;

    return json({
      ok: true,
      fileId: uploaded.id,
      webViewLink,
      folderId,
      folderPath,
      uploadedAt: new Date().toISOString(),
      uploadedBy: userData.user.email || userData.user.id,
      // Conta institucional do sistema (igual para todos os usuários do SIGA)
      serviceAccountEmail: saEmail,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[drive-upload-file]", message);
    return json({ error: message }, 500);
  }
});

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function sanitizeFolderName(name: string) {
  return String(name || "Sem nome")
    .replace(/[\\/:*?"<>|]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120) || "Sem nome";
}

function sanitizeFileName(name: string) {
  return String(name || "arquivo.bin")
    .replace(/[\\/:*?"<>|]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 180) || "arquivo.bin";
}

function escapeDriveQuery(value: string) {
  return String(value || "").replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

function base64ToUint8Array(b64: string) {
  const cleaned = b64.includes(",") ? b64.split(",").pop()! : b64;
  const bin = atob(cleaned);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function getAccessToken(sa: Record<string, string>) {
  const clientEmail = sa.client_email;
  let privateKey = sa.private_key;
  if (!clientEmail || !privateKey) {
    throw new Error("Service account sem client_email/private_key.");
  }
  privateKey = privateKey.replace(/\\n/g, "\n");
  const key = await importPKCS8(privateKey, "RS256");
  const now = Math.floor(Date.now() / 1000);
  const jwt = await new SignJWT({ scope: DRIVE_SCOPE })
    .setProtectedHeader({ alg: "RS256", typ: "JWT" })
    .setIssuer(clientEmail)
    .setSubject(clientEmail)
    .setAudience("https://oauth2.googleapis.com/token")
    .setIssuedAt(now)
    .setExpirationTime(now + 3600)
    .sign(key);

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });
  const tokenJson = await tokenRes.json();
  if (!tokenRes.ok || !tokenJson.access_token) {
    throw new Error(
      tokenJson.error_description ||
        tokenJson.error ||
        "Falha ao obter token Google",
    );
  }
  return tokenJson.access_token as string;
}

async function findChildFolder(
  token: string,
  parentId: string,
  name: string,
) {
  const q =
    `mimeType = 'application/vnd.google-apps.folder' and name = '${escapeDriveQuery(name)}' and '${parentId}' in parents and trashed = false`;
  const url =
    `${DRIVE_API}/files?q=${encodeURIComponent(q)}&fields=files(id,name)&pageSize=5&supportsAllDrives=true&includeItemsFromAllDrives=true`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const body = await res.json();
  if (!res.ok) {
    throw new Error(body?.error?.message || "Erro ao buscar pasta no Drive");
  }
  const files = body.files || [];
  return files[0] || null;
}

async function createFolder(token: string, parentId: string, name: string) {
  const res = await fetch(
    `${DRIVE_API}/files?fields=id,name&supportsAllDrives=true`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name,
        mimeType: "application/vnd.google-apps.folder",
        parents: [parentId],
      }),
    },
  );
  const body = await res.json();
  if (!res.ok) {
    throw new Error(body?.error?.message || "Erro ao criar pasta no Drive");
  }
  return body;
}

async function ensureFolderPath(
  token: string,
  rootId: string,
  parts: string[],
) {
  let parentId = rootId;
  for (const part of parts) {
    const name = sanitizeFolderName(part);
    let folder = await findChildFolder(token, parentId, name);
    if (!folder) folder = await createFolder(token, parentId, name);
    parentId = folder.id;
  }
  return parentId;
}

async function uploadFile(
  token: string,
  folderId: string,
  fileName: string,
  mimeType: string,
  bytes: Uint8Array,
) {
  const boundary = "siga_boundary_" + Date.now();
  const meta = JSON.stringify({
    name: fileName,
    parents: [folderId],
  });
  const encoder = new TextEncoder();
  const preamble = encoder.encode(
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n` +
      `--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`,
  );
  const close = encoder.encode(`\r\n--${boundary}--`);
  const body = new Uint8Array(preamble.length + bytes.length + close.length);
  body.set(preamble, 0);
  body.set(bytes, preamble.length);
  body.set(close, preamble.length + bytes.length);

  const res = await fetch(
    `${UPLOAD_API}?uploadType=multipart&fields=id,name,webViewLink,parents&supportsAllDrives=true`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": `multipart/related; boundary=${boundary}`,
      },
      body,
    },
  );
  const jsonBody = await res.json();
  if (!res.ok) {
    throw new Error(jsonBody?.error?.message || "Falha no upload para o Drive");
  }
  return jsonBody;
}

/** Qualquer pessoa com o link pode ver (sem conta Google). */
async function shareAnyoneWithLink(token: string, fileId: string) {
  const res = await fetch(
    `${DRIVE_API}/files/${encodeURIComponent(fileId)}/permissions?supportsAllDrives=true&sendNotificationEmail=false`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        type: "anyone",
        role: "reader",
        allowFileDiscovery: false,
      }),
    },
  );
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      body?.error?.message ||
        "Upload ok, mas falhou ao liberar link sem login Google.",
    );
  }
}
