/**
 * SIGA EDUCA — Google Drive institucional (Edge Function)
 * Upload via service account; metadados no SIGA; abrir arquivo no Drive.
 */
(function () {
  'use strict';

  var ROOT_LABEL = 'SIGAEDUCA';
  var FOLDER_SECRETARIA = 'Documentos Secretaria';
  var FOLDER_SOLICITACOES = 'SOLICITAÇÕES PEDAGÓGICAS';
  var statusListeners = [];

  function getSupabase() {
    if (window.SigaSupabase && typeof window.SigaSupabase.getClient === 'function') {
      try { return window.SigaSupabase.getClient(); } catch (e) { /* ignore */ }
    }
    return null;
  }

  function isConfigured() {
    // Edge Function + secrets no servidor; frontend só precisa do Supabase Auth
    return !!(window.SigaSupabase && window.SigaSupabase.isConfigured && window.SigaSupabase.isConfigured());
  }

  /** Institucional: não exige OAuth do usuário */
  function isConnected() {
    return isConfigured();
  }

  function onStatusChange(fn) {
    if (typeof fn === 'function') statusListeners.push(fn);
  }

  function notifyStatus() {
    var connected = isConnected();
    statusListeners.forEach(function (fn) {
      try { fn(connected); } catch (e) { /* noop */ }
    });
  }

  function blobToBase64(blob) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () {
        var result = String(reader.result || '');
        var b64 = result.indexOf(',') >= 0 ? result.split(',')[1] : result;
        resolve(b64);
      };
      reader.onerror = function () {
        reject(reader.error || new Error('Falha ao ler arquivo'));
      };
      reader.readAsDataURL(blob);
    });
  }

  function extractInvokeError(res) {
    var data = res && res.data;
    if (data && data.error) return String(data.error);
    var err = res && res.error;
    if (!err) return 'Falha na Edge Function drive-upload-file';
    var ctx = err.context;
    if (ctx && typeof ctx.json === 'function') {
      return ctx.json().then(function (body) {
        return (body && (body.error || body.message)) || err.message || 'Falha no Drive institucional';
      }).catch(function () {
        return err.message || 'Falha no Drive institucional';
      });
    }
    return Promise.resolve(err.message || 'Falha no Drive institucional');
  }

  function invokeUpload(payload, onProgress) {
    var sb = getSupabase();
    if (!sb || typeof sb.functions === 'undefined' || !sb.functions.invoke) {
      return Promise.reject(new Error('Supabase Functions indisponível. Faça login no SIGA.'));
    }
    if (typeof onProgress === 'function') onProgress(15, 'Enviando ao Drive da escola…');

    // Drive usa SEMPRE a Service Account do sistema (secret no servidor).
    // O usuário do SIGA só autentica a chamada — não precisa de JSON/Google pessoal.
    return sb.auth.getSession().then(function (sessRes) {
      var session = sessRes && sessRes.data && sessRes.data.session;
      if (!session || !session.access_token) {
        throw new Error(
          'Sessão Supabase ausente. Faça logout e login de novo no SIGA (e-mail/senha). O Drive institucional não usa conta Google pessoal.'
        );
      }
      if (typeof onProgress === 'function') onProgress(35, 'Gravando no Drive institucional…');
      return sb.functions.invoke('drive-upload-file', {
        body: payload,
        headers: { Authorization: 'Bearer ' + session.access_token }
      });
    }).then(function (res) {
      if (res.error || (res.data && res.data.error)) {
        return extractInvokeError(res).then(function (msg) {
          throw new Error(msg);
        });
      }
      var data = res.data || {};
      if (!data.ok && !data.fileId) {
        throw new Error(data.message || 'Upload ao Drive sem retorno válido.');
      }
      if (typeof onProgress === 'function') onProgress(100, 'Concluído');
      if (data.serviceAccountEmail) {
        try {
          console.info('[SIGA Drive] Conta institucional:', data.serviceAccountEmail);
        } catch (e) { /* ignore */ }
      }
      return {
        fileId: data.fileId,
        webViewLink: data.webViewLink ||
          ('https://drive.google.com/file/d/' + data.fileId + '/view?usp=sharing'),
        folderId: data.folderId || null,
        folderPath: data.folderPath || '',
        uploadedAt: data.uploadedAt || new Date().toISOString(),
        serviceAccountEmail: data.serviceAccountEmail || null
      };
    });
  }

  /**
   * Solicitações: SIGAEDUCA / SOLICITAÇÕES PEDAGÓGICAS / {usuário} / {tipo}
   */
  function uploadSolicitacaoFile(tipo, blob, fileName, mimeType, onProgress, solicitanteNome) {
    if (!blob) return Promise.reject(new Error('Arquivo inválido.'));
    var nome = solicitanteNome ||
      localStorage.getItem('siga_profile_name') ||
      (function () {
        try {
          var s = JSON.parse(localStorage.getItem('siga_session') || 'null');
          return (s && s.nome) || 'Usuário';
        } catch (e) {
          return 'Usuário';
        }
      })();

    if (typeof onProgress === 'function') onProgress(5, 'Preparando arquivo…');
    return blobToBase64(blob).then(function (b64) {
      return invokeUpload({
        module: 'solicitacoes',
        tipo: tipo || 'Geral',
        solicitanteNome: nome,
        fileName: fileName || 'arquivo.bin',
        mimeType: mimeType || blob.type || 'application/octet-stream',
        contentBase64: b64
      }, onProgress);
    });
  }

  /**
   * Secretaria: SIGAEDUCA / Documentos Secretaria / {tipo}
   */
  function uploadSecretariaFile(tipo, blob, fileName, mimeType, onProgress) {
    if (!blob) return Promise.reject(new Error('Arquivo inválido.'));
    if (typeof onProgress === 'function') onProgress(5, 'Preparando documento…');
    return blobToBase64(blob).then(function (b64) {
      return invokeUpload({
        module: 'secretaria',
        tipo: tipo || 'Documento',
        fileName: fileName || 'documento.html',
        mimeType: mimeType || blob.type || 'text/html',
        contentBase64: b64
      }, onProgress);
    });
  }

  function openInDrive(webViewLinkOrFileId) {
    var link = String(webViewLinkOrFileId || '');
    if (!link) return false;
    if (link.indexOf('http') !== 0) {
      // usp=sharing evita tela de login quando o arquivo já está "qualquer pessoa com o link"
      link = 'https://drive.google.com/file/d/' + link + '/view?usp=sharing';
    }
    window.open(link, '_blank', 'noopener,noreferrer');
    return true;
  }

  function openFolder(folderId) {
    if (!folderId) return false;
    window.open(
      'https://drive.google.com/drive/folders/' + folderId,
      '_blank',
      'noopener,noreferrer'
    );
    return true;
  }

  // Compat: connect/disconnect não são mais necessários (Drive institucional)
  function connect() {
    notifyStatus();
    return Promise.resolve({ ok: true, institutional: true });
  }

  function disconnect() {
    notifyStatus();
    return Promise.resolve();
  }

  window.SigaGoogleDrive = {
    isConfigured: isConfigured,
    isConnected: isConnected,
    isInstitutional: function () { return true; },
    connect: connect,
    disconnect: disconnect,
    onStatusChange: onStatusChange,
    notifyStatus: notifyStatus,
    uploadSolicitacaoFile: uploadSolicitacaoFile,
    uploadSecretariaFile: uploadSecretariaFile,
    openInDrive: openInDrive,
    openFolder: openFolder,
    ROOT_FOLDER: ROOT_LABEL,
    PED_FOLDER: FOLDER_SOLICITACOES,
    SEC_FOLDER: FOLDER_SECRETARIA
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', notifyStatus);
  } else {
    notifyStatus();
  }
})();
