/**
 * SIGA EDUCA — Upload institucional para Google Drive (Meu Drive / OAuth escola)
 *
 * Secrets obrigatórios:
 *   GOOGLE_OAUTH_CLIENT_ID
 *   GOOGLE_OAUTH_CLIENT_SECRET
 *   GOOGLE_OAUTH_REFRESH_TOKEN   ← conta dona da pasta SIGAEDUCA (autorizar 1x)
 *   GOOGLE_DRIVE_ROOT_FOLDER_ID
 *
 * Não usar Conta de Serviço no Meu Drive (sem cota).
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

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

    const rootFolderIdRaw = (Deno.env.get("GOOGLE_DRIVE_ROOT_FOLDER_ID") || "").trim();
    const rootFolderId = normalizeFolderId(rootFolderIdRaw);
    if (!rootFolderId) {
      return json({
        error:
          "Defina GOOGLE_DRIVE_ROOT_FOLDER_ID (ID da pasta SIGAEDUCA na URL do Drive).",
      }, 503);
    }
    if (!isLikelyDriveId(rootFolderId)) {
      return json({
        error:
          `GOOGLE_DRIVE_ROOT_FOLDER_ID inválido ("${rootFolderIdRaw.slice(0, 40)}"). Cole só o ID depois de /folders/.`,
      }, 500);
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

    const auth = await resolveDriveAuth();
    await assertRootFolderAccessible(auth.accessToken, rootFolderId, auth.label);

    const pathParts =
      moduleName === "secretaria"
        ? [FOLDER_SECRETARIA, tipo]
        : [FOLDER_SOLICITACOES, sanitizeFolderName(solicitanteNome), tipo];

    let folderId: string;
    try {
      folderId = await ensureFolderPath(auth.accessToken, rootFolderId, pathParts);
    } catch (folderErr) {
      throw new Error(mapDriveQuotaError(folderErr, auth.label));
    }
    const folderPath = ["SIGAEDUCA", ...pathParts].join(" / ");

    const bytes = base64ToUint8Array(contentBase64);
    let uploaded;
    try {
      uploaded = await uploadFile(
        auth.accessToken,
        folderId,
        fileName,
        mimeType,
        bytes,
      );
    } catch (upErr) {
      throw new Error(mapDriveQuotaError(upErr, auth.label));
    }

    try {
      await shareAnyoneWithLink(auth.accessToken, uploaded.id);
    } catch (shareErr) {
      console.warn("[drive-upload-file] shareAnyoneWithLink:", shareErr);
    }

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
      driveAuthMode: auth.mode,
      driveAccount: auth.label,
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

/** OAuth da conta dona do Drive (Meu Drive). Conta de Serviço não é suportada neste fluxo. */
async function resolveDriveAuth(): Promise<{
  accessToken: string;
  mode: "oauth";
  label: string;
}> {
  const clientId = (Deno.env.get("GOOGLE_OAUTH_CLIENT_ID") || "").trim();
  const clientSecret = (Deno.env.get("GOOGLE_OAUTH_CLIENT_SECRET") || "").trim();
  const refreshToken = (Deno.env.get("GOOGLE_OAUTH_REFRESH_TOKEN") || "").trim();

  const missing: string[] = [];
  if (!clientId) missing.push("GOOGLE_OAUTH_CLIENT_ID");
  if (!clientSecret) missing.push("GOOGLE_OAUTH_CLIENT_SECRET");
  if (!refreshToken) missing.push("GOOGLE_OAUTH_REFRESH_TOKEN");

  if (missing.length) {
    throw new Error(
      "Drive do zero (Meu Drive): faltam secrets " +
        missing.join(", ") +
        ". Gere o refresh token no OAuth Playground com a conta dona da pasta SIGAEDUCA e cadastre os 4 secrets (veja docs/GOOGLE_DRIVE_INSTITUCIONAL.md).",
    );
  }

  const accessToken = await getTokenFromRefresh(
    clientId,
    clientSecret,
    refreshToken,
  );
  return {
    accessToken,
    mode: "oauth",
    label: "conta Google da escola (OAuth)",
  };
}

async function getTokenFromRefresh(
  clientId: string,
  clientSecret: string,
  refreshToken: string,
) {
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  const tokenJson = await tokenRes.json();
  if (!tokenRes.ok || !tokenJson.access_token) {
    throw new Error(
      tokenJson.error_description ||
        tokenJson.error ||
        "Falha ao renovar token OAuth do Drive. Gere de novo o GOOGLE_OAUTH_REFRESH_TOKEN com a conta dona da pasta SIGAEDUCA.",
    );
  }
  return tokenJson.access_token as string;
}

function normalizeFolderId(raw: string) {
  const s = String(raw || "").trim().replace(/^["']|["']$/g, "");
  if (!s) return "";
  const m = s.match(/\/folders\/([a-zA-Z0-9_-]+)/);
  if (m) return m[1];
  const m2 = s.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (m2) return m2[1];
  return s;
}

function isLikelyDriveId(id: string) {
  if (!id || id === "." || id === "root") return false;
  if (/^[a-zA-Z0-9_-]{10,}$/.test(id)) return true;
  return false;
}

async function assertRootFolderAccessible(
  token: string,
  folderId: string,
  accountLabel: string,
) {
  const url =
    `${DRIVE_API}/files/${encodeURIComponent(folderId)}` +
    `?fields=id,name,mimeType&supportsAllDrives=true`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      `Pasta SIGAEDUCA inacessível (ID ${folderId}) para ${accountLabel}. ` +
        `Confira GOOGLE_DRIVE_ROOT_FOLDER_ID e se a conta autorizada é a dona/editora da pasta. ` +
        `(Google: ${body?.error?.message || res.status})`,
    );
  }
  if (body.mimeType && body.mimeType !== "application/vnd.google-apps.folder") {
    throw new Error(
      `GOOGLE_DRIVE_ROOT_FOLDER_ID não é uma pasta (é "${body.name || folderId}").`,
    );
  }
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

function mapDriveQuotaError(err: unknown, _accountLabel: string) {
  const message = err instanceof Error ? err.message : String(err);
  const lower = message.toLowerCase();
  if (
    lower.includes("storage quota") ||
    lower.includes("service accounts do not have storage")
  ) {
    return (
      "Erro de cota de Conta de Serviço. Este fluxo usa só OAuth da conta dona de SIGAEDUCA. " +
      "Cadastre GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET e GOOGLE_OAUTH_REFRESH_TOKEN " +
      "(docs/GOOGLE_DRIVE_INSTITUCIONAL.md). Detalhe: " + message
    );
  }
  return message;
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
