/**
 * SIGA EDUCA — config Supabase (anon/publishable — seguro no frontend)
 * Para override local de desenvolvimento, use js/siga-config.local.js (gitignored).
 *
 * googleClientId: OAuth Client ID (tipo Aplicativo da Web) no Google Cloud Console.
 * Origens JS autorizadas: https://sigaeduca.com e http://localhost
 */
window.SIGA_SUPABASE_CONFIG = {
  url: 'https://digjzihjboflcuftmokj.supabase.co',
  anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRpZ2p6aWhqYm9mbGN1ZnRtb2tqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM2MTg5NDgsImV4cCI6MjA5OTE5NDk0OH0.5QwxirNiFNq7aVCbpgRjNFzlUZk5CyvWY1FPKwCOa1Q',
  projectId: 'digjzihjboflcuftmokj',
  googleClientId: '864626041450-f0df1rpfqucb2e0v5drs1v7ooo7n3oi4.apps.googleusercontent.com',
  // Drive institucional (Meu Drive): Edge Function + OAuth da conta dona de SIGAEDUCA
  // Secrets: GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET,
  // GOOGLE_OAUTH_REFRESH_TOKEN, GOOGLE_DRIVE_ROOT_FOLDER_ID
  driveInstitutional: true
};
