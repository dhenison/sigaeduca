/**
 * SIGA EDUCA — Google Drive (GIS token + Drive API v3)
 * Escopo: drive.file (arquivos/pastas criados pelo app)
 */
(function () {
  'use strict';

  var SCOPE = 'https://www.googleapis.com/auth/drive.file';
  var DRIVE_API = 'https://www.googleapis.com/drive/v3';
  var UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3/files';
  var TOKEN_KEY = 'siga_google_drive_token';
  var ROOT_FOLDER = 'SIGAEDUCA';
  var PED_FOLDER = 'SOLICITAÇÕES PEDAGÓGICAS';

  var tokenClient = null;
  var statusListeners = [];

  function getClientId() {
    var cfg = window.SIGA_SUPABASE_CONFIG || window.SIGA_CONFIG || {};
    return String(cfg.googleClientId || window.SIGA_GOOGLE_CLIENT_ID || '').trim();
  }

  function loadToken() {
    try {
      var raw = sessionStorage.getItem(TOKEN_KEY);
      if (!raw) return null;
      var data = JSON.parse(raw);
      if (!data || !data.access_token) return null;
      if (data.expires_at && Date.now() > data.expires_at - 60000) {
        sessionStorage.removeItem(TOKEN_KEY);
        return null;
      }
      return data;
    } catch (e) {
      return null;
    }
  }

  function saveToken(tokenResponse) {
    if (!tokenResponse || !tokenResponse.access_token) return null;
    var expiresIn = Number(tokenResponse.expires_in || 3600);
    var data = {
      access_token: tokenResponse.access_token,
      expires_at: Date.now() + expiresIn * 1000,
      scope: tokenResponse.scope || SCOPE
    };
    try { sessionStorage.setItem(TOKEN_KEY, JSON.stringify(data)); } catch (e) { /* noop */ }
    notifyStatus();
    return data;
  }

  function clearToken() {
    try { sessionStorage.removeItem(TOKEN_KEY); } catch (e) { /* noop */ }
    notifyStatus();
  }

  function isConnected() {
    return !!loadToken();
  }

  function getAccessToken() {
    var t = loadToken();
    return t ? t.access_token : '';
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

  function waitForGis(timeoutMs) {
    timeoutMs = timeoutMs || 10000;
    return new Promise(function (resolve, reject) {
      if (window.google && google.accounts && google.accounts.oauth2) {
        resolve();
        return;
      }
      var start = Date.now();
      var timer = setInterval(function () {
        if (window.google && google.accounts && google.accounts.oauth2) {
          clearInterval(timer);
          resolve();
        } else if (Date.now() - start > timeoutMs) {
          clearInterval(timer);
          reject(new Error('Google Identity Services não carregou.'));
        }
      }, 100);
    });
  }

  function ensureTokenClient() {
    var clientId = getClientId();
    if (!clientId) {
      return Promise.reject(new Error(
        'Configure googleClientId em js/siga-config.js (OAuth Client ID do Google Cloud).'
      ));
    }
    return waitForGis().then(function () {
      if (!tokenClient) {
        tokenClient = google.accounts.oauth2.initTokenClient({
          client_id: clientId,
          scope: SCOPE,
          callback: function () { /* replaced per request */ }
        });
      }
      return tokenClient;
    });
  }

  function requestAccessToken(prompt) {
    return ensureTokenClient().then(function (client) {
      return new Promise(function (resolve, reject) {
        client.callback = function (resp) {
          if (resp && resp.error) {
            reject(new Error(resp.error_description || resp.error || 'Autorização negada'));
            return;
          }
          if (!resp || !resp.access_token) {
            reject(new Error('Não foi possível obter o token do Google.'));
            return;
          }
          resolve(saveToken(resp));
        };
        var opts = {};
        if (prompt) opts.prompt = prompt;
        else if (!isConnected()) opts.prompt = 'consent';
        client.requestAccessToken(opts);
      });
    });
  }

  function connect() {
    return requestAccessToken(isConnected() ? '' : 'consent');
  }

  function disconnect() {
    var token = getAccessToken();
    if (token && window.google && google.accounts && google.accounts.oauth2) {
      try { google.accounts.oauth2.revoke(token, function () {}); } catch (e) { /* noop */ }
    }
    clearToken();
    return Promise.resolve();
  }

  function ensureAccessToken() {
    if (isConnected()) return Promise.resolve(getAccessToken());
    return connect().then(function () { return getAccessToken(); });
  }

  function escapeDriveQuery(value) {
    return String(value || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  }

  function driveFetch(url, options) {
    options = options || {};
    return ensureAccessToken().then(function (token) {
      var headers = Object.assign({}, options.headers || {}, {
        Authorization: 'Bearer ' + token
      });
      return fetch(url, Object.assign({}, options, { headers: headers })).then(function (res) {
        if (res.status === 401) {
          clearToken();
          return Promise.reject(new Error('Sessão Google expirada. Conecte o Drive novamente.'));
        }
        return res;
      });
    });
  }

  function findChildFolder(parentId, name) {
    var q = "mimeType = 'application/vnd.google-apps.folder' and name = '" +
      escapeDriveQuery(name) + "' and trashed = false";
    if (parentId) {
      q += " and '" + parentId + "' in parents";
    } else {
      q += " and 'root' in parents";
    }
    var url = DRIVE_API + '/files?q=' + encodeURIComponent(q) +
      '&fields=files(id,name)&pageSize=10&spaces=drive';
    return driveFetch(url).then(function (res) {
      return res.json().then(function (body) {
        if (!res.ok) {
          throw new Error((body && body.error && body.error.message) || 'Erro ao buscar pasta no Drive');
        }
        var files = (body && body.files) || [];
        return files.length ? files[0] : null;
      });
    });
  }

  function createFolder(parentId, name) {
    var meta = {
      name: name,
      mimeType: 'application/vnd.google-apps.folder'
    };
    if (parentId) meta.parents = [parentId];
    return driveFetch(DRIVE_API + '/files?fields=id,name', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(meta)
    }).then(function (res) {
      return res.json().then(function (body) {
        if (!res.ok) {
          throw new Error((body && body.error && body.error.message) || 'Erro ao criar pasta no Drive');
        }
        return body;
      });
    });
  }

  function ensureChildFolder(parentId, name) {
    return findChildFolder(parentId, name).then(function (found) {
      if (found) return found;
      return createFolder(parentId, name);
    });
  }

  /** SIGAEDUCA / SOLICITAÇÕES PEDAGÓGICAS / {tipo} */
  function ensureSolicitacaoFolderPath(tipo) {
    var tipoNome = String(tipo || 'Geral').trim() || 'Geral';
    return ensureChildFolder(null, ROOT_FOLDER).then(function (root) {
      return ensureChildFolder(root.id, PED_FOLDER).then(function (ped) {
        return ensureChildFolder(ped.id, tipoNome).then(function (tipoFolder) {
          return {
            folderId: tipoFolder.id,
            folderPath: ROOT_FOLDER + ' / ' + PED_FOLDER + ' / ' + tipoNome,
            rootId: root.id,
            pedId: ped.id
          };
        });
      });
    });
  }

  function uploadBlob(folderId, blob, fileName, mimeType, onProgress) {
    var meta = {
      name: fileName || 'arquivo',
      parents: folderId ? [folderId] : undefined
    };
    var boundary = 'siga_boundary_' + Date.now();
    var delimiter = '--' + boundary + '\r\n';
    var closeDelim = '\r\n--' + boundary + '--';
    var metaPart = delimiter +
      'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
      JSON.stringify(meta) + '\r\n';
    var fileHeader = delimiter +
      'Content-Type: ' + (mimeType || 'application/octet-stream') + '\r\n\r\n';

    return blob.arrayBuffer().then(function (buffer) {
      var metaBytes = new TextEncoder().encode(metaPart + fileHeader);
      var closeBytes = new TextEncoder().encode(closeDelim);
      var body = new Uint8Array(metaBytes.length + buffer.byteLength + closeBytes.length);
      body.set(metaBytes, 0);
      body.set(new Uint8Array(buffer), metaBytes.length);
      body.set(closeBytes, metaBytes.length + buffer.byteLength);

      if (typeof onProgress === 'function') onProgress(10);

      var url = UPLOAD_API + '?uploadType=multipart&fields=id,name,webViewLink,parents';
      return ensureAccessToken().then(function (token) {
        return new Promise(function (resolve, reject) {
          var xhr = new XMLHttpRequest();
          xhr.open('POST', url);
          xhr.setRequestHeader('Authorization', 'Bearer ' + token);
          xhr.setRequestHeader('Content-Type', 'multipart/related; boundary=' + boundary);
          xhr.upload.onprogress = function (e) {
            if (e.lengthComputable && typeof onProgress === 'function') {
              onProgress(10 + Math.round((e.loaded / e.total) * 85));
            }
          };
          xhr.onload = function () {
            var bodyJson = null;
            try { bodyJson = JSON.parse(xhr.responseText || '{}'); } catch (e) { bodyJson = {}; }
            if (xhr.status >= 200 && xhr.status < 300) {
              if (typeof onProgress === 'function') onProgress(100);
              resolve(bodyJson);
            } else if (xhr.status === 401) {
              clearToken();
              reject(new Error('Sessão Google expirada. Conecte o Drive novamente.'));
            } else {
              reject(new Error(
                (bodyJson && bodyJson.error && bodyJson.error.message) ||
                'Falha no upload para o Google Drive'
              ));
            }
          };
          xhr.onerror = function () {
            reject(new Error('Erro de rede ao enviar para o Google Drive'));
          };
          xhr.send(body);
        });
      });
    });
  }

  /**
   * Cria pastas e envia o arquivo.
   * @returns {Promise<{fileId, webViewLink, folderId, folderPath, uploadedAt}>}
   */
  function uploadSolicitacaoFile(tipo, blob, fileName, mimeType, onProgress) {
    if (typeof onProgress === 'function') onProgress(2, 'Preparando pastas no Drive…');
    return ensureSolicitacaoFolderPath(tipo).then(function (pathInfo) {
      if (typeof onProgress === 'function') onProgress(8, 'Enviando para o Drive…');
      return uploadBlob(
        pathInfo.folderId,
        blob,
        fileName,
        mimeType,
        function (pct) {
          if (typeof onProgress === 'function') {
            onProgress(8 + Math.round(pct * 0.9), 'Enviando para o Drive… ' + Math.round(pct) + '%');
          }
        }
      ).then(function (file) {
        return {
          fileId: file.id,
          webViewLink: file.webViewLink ||
            ('https://drive.google.com/file/d/' + file.id + '/view'),
          folderId: pathInfo.folderId,
          folderPath: pathInfo.folderPath,
          uploadedAt: new Date().toISOString()
        };
      });
    });
  }

  function openInDrive(webViewLinkOrFileId) {
    var link = String(webViewLinkOrFileId || '');
    if (!link) return false;
    if (link.indexOf('http') !== 0) {
      link = 'https://drive.google.com/file/d/' + link + '/view';
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

  window.SigaGoogleDrive = {
    getClientId: getClientId,
    isConfigured: function () { return !!getClientId(); },
    isConnected: isConnected,
    connect: connect,
    disconnect: disconnect,
    onStatusChange: onStatusChange,
    notifyStatus: notifyStatus,
    ensureSolicitacaoFolderPath: ensureSolicitacaoFolderPath,
    uploadSolicitacaoFile: uploadSolicitacaoFile,
    openInDrive: openInDrive,
    openFolder: openFolder,
    ROOT_FOLDER: ROOT_FOLDER,
    PED_FOLDER: PED_FOLDER
  };
})();
