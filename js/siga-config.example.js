/**
 * SIGA EDUCA — modelo de config Supabase (seguro para versionar)
 * Copie para js/siga-config.local.js e preencha com seus valores.
 * Nunca commit o arquivo .local.js
 *
 * googleClientId: OAuth Client ID (Aplicativo da Web) — Google Cloud Console
 * Origens JS: https://sigaeduca.com , http://localhost
 */
window.SIGA_SUPABASE_CONFIG = {
  url: 'https://YOUR_PROJECT_REF.supabase.co',
  anonKey: 'your_anon_or_publishable_key',
  projectId: 'YOUR_PROJECT_REF',
  googleClientId: 'YOUR_GOOGLE_OAUTH_WEB_CLIENT_ID.apps.googleusercontent.com',
  // Drive institucional via Edge Function drive-upload-file:
  // secrets GOOGLE_SERVICE_ACCOUNT_JSON + GOOGLE_DRIVE_ROOT_FOLDER_ID
  driveInstitutional: true
};
