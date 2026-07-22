(() => {
  const cfg = window.PUNCH_CONFIG || {};
  const csrfToken = cfg.csrfToken || "";
  const punchUrl = cfg.punchUrl || "/punch";
  const recentUrl = cfg.recentUrl || "/punch/recent";
  const MAX_SIDE = cfg.maxSide || 320;
  const SCAN_GAP_MS = cfg.scanGapMs || 450;
  const COOLDOWN_MS = cfg.cooldownMs || 1500;
  const STATION_ID = (cfg.stationId || "").trim();
  const STORAGE_KEY = STATION_ID
    ? `siga_push2_camera_${STATION_ID}`
    : "siga_push2_camera";

  const video = document.getElementById("webcam");
  const cameraSelect = document.getElementById("cameraSelect");
  const helperText = document.getElementById("helperText");
  const cameraStatus = document.getElementById("cameraStatus");
  const scanMeta = document.getElementById("scanMeta");
  const container = document.getElementById("camera-container");
  const overlay = document.getElementById("overlay-panel");
  const clockEl = document.getElementById("clock");
  const dateEl = document.getElementById("date");
  const retryBtn = document.getElementById("retryCamera");
  const fullscreenBtn = document.getElementById("fullscreenBtn");
  const fullscreenIcon = document.getElementById("fullscreenIcon");
  const fullscreenLabel = document.getElementById("fullscreenLabel");

  let stream = null;
  let busy = false;
  let autoScanEnabled = false;
  let cooldownUntil = 0;
  let scanTimer = null;
  let hideTimer = null;
  let currentDeviceId = localStorage.getItem(STORAGE_KEY) || "";

  function setHelper(text) {
    helperText.textContent = text;
  }

  function cooldownRemaining() {
    return Math.max(0, cooldownUntil - Date.now());
  }

  function updateClock() {
    const now = new Date();
    clockEl.textContent = now.toLocaleTimeString("pt-BR", { hour12: false });
    dateEl.textContent = now
      .toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" })
      .toUpperCase();
  }

  function explainCameraError(err) {
    const name = err && err.name ? err.name : "";
    const msg = (err && err.message) || String(err || "");
    if (!window.isSecureContext && location.protocol === "file:") {
      return "Abra via http://127.0.0.1:5000/punch2 (não use file://).";
    }
    if (name === "NotAllowedError" || name === "PermissionDeniedError") {
      return "Permissão da câmera negada. Clique no cadeado da barra de endereço e permita.";
    }
    if (name === "NotFoundError" || name === "DevicesNotFoundError") {
      return "Nenhuma câmera foi encontrada neste computador.";
    }
    if (name === "NotReadableError" || name === "TrackStartError") {
      return "Câmera em uso por outro app/aba. Feche /punch ou o admin e tente de novo.";
    }
    if (name === "OverconstrainedError") {
      return "Câmera salva inválida. Limpando seleção e tentando outra…";
    }
    if (name === "SecurityError") {
      return "Navegador bloqueou a câmera nesta origem. Use http://127.0.0.1:5000/punch2";
    }
    return `Falha ao abrir câmera: ${name || msg || "erro desconhecido"}`;
  }

  function stopStream() {
    if (!stream) return;
    stream.getTracks().forEach((t) => {
      try {
        t.stop();
      } catch (_) {}
    });
    stream = null;
    if (video) video.srcObject = null;
  }

  function stationSlot() {
    const n = parseInt(STATION_ID, 10);
    return Number.isFinite(n) && n > 0 ? n - 1 : 0;
  }

  /** Câmera embutida do notebook/PC — não usar nas estações. */
  function isBuiltinCamera(label) {
    const l = String(label || "").toLowerCase();
    return /integrated|built[\s-]?in|facetime|ir camera|infrared|internal|interno|notebook|laptop|hd camera|camera hd|webcam hd user|user facing/.test(
      l
    );
  }

  function isUsbCamera(label) {
    const l = String(label || "").toLowerCase();
    if (!l) return false;
    if (isBuiltinCamera(l)) return false;
    if (/usb|logitech|life.?cam|microsoft.?life|c920|c270|c310|hd.?pro|webcam/.test(l)) {
      return true;
    }
    // Sem "integrated": trata como externa/USB (comum em webcams plugadas).
    return true;
  }

  async function requestStream(constraints) {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error("Este navegador não suporta getUserMedia.");
    }
    return navigator.mediaDevices.getUserMedia(constraints);
  }

  async function listVideoInputs() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
      return { all: [], usb: [] };
    }
    const devices = await navigator.mediaDevices.enumerateDevices();
    const all = devices.filter((d) => d.kind === "videoinput");
    const usb = all.filter((d) => isUsbCamera(d.label));
    return { all, usb };
  }

  /** Garante labels (Chrome só mostra nomes após permissão). */
  async function ensureCameraPermission() {
    const { all } = await listVideoInputs();
    const needsProbe = !all.length || all.every((d) => !d.label);
    if (!needsProbe) return;
    let probe = null;
    try {
      probe = await requestStream({ audio: false, video: true });
    } catch (_) {
      /* populateCameras / startCamera tratam o erro */
    } finally {
      if (probe) probe.getTracks().forEach((t) => t.stop());
    }
  }

  function pickDeviceForStation(usbCams, allCams) {
    const pool = usbCams.length ? usbCams : allCams;
    if (!pool.length) return "";

    if (currentDeviceId && pool.some((c) => c.deviceId === currentDeviceId)) {
      return currentDeviceId;
    }
    // Estação 1 → 1ª USB, Estação 2 → 2ª USB (evita as duas abas na mesma câmera).
    const idx = stationSlot() % pool.length;
    return pool[idx].deviceId;
  }

  async function bindStream(mediaStream) {
    stream = mediaStream;
    video.srcObject = stream;
    video.muted = true;
    video.setAttribute("playsinline", "true");
    await video.play().catch(() => {});

    const track = stream.getVideoTracks()[0];
    const label = (track && track.label) || "";
    if (track && track.getSettings) {
      const settings = track.getSettings();
      if (settings.deviceId) {
        currentDeviceId = settings.deviceId;
        localStorage.setItem(STORAGE_KEY, currentDeviceId);
      }
    }
    cameraStatus.textContent = label
      ? `LIVE · ${label.slice(0, 36)}`
      : "LIVE FEED · ATIVO";
    scanMeta.textContent = "AGUARDANDO ROSTO";
    setHelper("Aproxime o rosto para reconhecer automaticamente");
    if (retryBtn) retryBtn.classList.add("hidden");
    return stream;
  }

  async function openExactCamera(deviceId) {
    return requestStream({
      audio: false,
      video: {
        deviceId: { exact: deviceId },
        width: { ideal: 1280 },
        height: { ideal: 720 },
      },
    });
  }

  async function startCamera(preferredDeviceId) {
    stopStream();
    await ensureCameraPermission();
    const { all, usb } = await listVideoInputs();
    const pool = usb.length ? usb : all;

    if (!pool.length) {
      throw new Error("Nenhuma webcam USB encontrada. Conecte as câmeras nas portas USB.");
    }

    const ordered = [];
    const preferred =
      preferredDeviceId || pickDeviceForStation(usb, all);
    if (preferred) ordered.push(preferred);
    pool.forEach((cam) => {
      if (!ordered.includes(cam.deviceId)) ordered.push(cam.deviceId);
    });

    let lastError = null;
    for (const deviceId of ordered) {
      try {
        const media = await openExactCamera(deviceId);
        return await bindStream(media);
      } catch (err) {
        lastError = err;
        if (err && err.name === "OverconstrainedError") {
          if (deviceId === localStorage.getItem(STORAGE_KEY)) {
            localStorage.removeItem(STORAGE_KEY);
          }
        }
        // NotReadableError = câmera já em uso na outra estação → tenta a próxima USB.
      }
    }

    throw lastError || new Error("Não foi possível abrir uma webcam USB.");
  }

  function showOverlay(data) {
    const user = data.user || {};
    const tipo = (data.tipo || "ENTRADA").toUpperCase();
    const isEntrada = tipo === "ENTRADA";
    const firstName = (user.name || "usuário").split(" ")[0];

    document.getElementById("student-name").textContent = user.name || "Reconhecido";
    document.getElementById("student-meta").textContent =
      user.schedule || "Cadastro biométrico";
    document.getElementById("student-registration").textContent =
      user.registration || user.username || "—";

    const photo = document.getElementById("student-photo");
    const fallback = document.getElementById("student-photo-fallback");
    if (user.photo_url) {
      photo.src = user.photo_url;
      photo.classList.remove("hidden");
      fallback.classList.add("hidden");
    } else {
      photo.classList.add("hidden");
      fallback.classList.remove("hidden");
    }

    const statusCard = document.getElementById("status-card");
    const statusIcon = document.getElementById("status-icon");
    const statusTitle = document.getElementById("status-title");
    const statusSubtitle = document.getElementById("status-subtitle");
    const statusFooter = document.getElementById("status-footer");
    const statusChip = document.getElementById("status-chip");
    const logTime = document.getElementById("log-time");
    const confidence = document.getElementById("status-confidence");

    if (isEntrada) {
      statusCard.className =
        "col-span-12 md:col-span-7 rounded-3xl p-10 flex flex-col justify-center shadow-[0px_8px_48px_rgba(0,0,0,0.4)] pointer-events-auto bg-primary";
      statusIcon.textContent = "check_circle";
      statusTitle.textContent = "ENTRADA CONFIRMADA";
      statusSubtitle.textContent = `Seja bem-vindo, ${firstName}!`;
      statusFooter.textContent = data.message || "Boa aula!";
      statusChip.className =
        "px-3 py-1 bg-primary/10 text-primary text-xs rounded-full font-bold";
      statusChip.textContent = "ENTRADA";
    } else {
      statusCard.className =
        "col-span-12 md:col-span-7 rounded-3xl p-10 flex flex-col justify-center shadow-[0px_8px_48px_rgba(0,0,0,0.4)] pointer-events-auto bg-secondary";
      statusIcon.textContent = "logout";
      statusTitle.textContent = "SAÍDA CONFIRMADA";
      statusSubtitle.textContent = `Até logo, ${firstName}!`;
      statusFooter.textContent = data.message || "Presença do dia confirmada";
      statusChip.className =
        "px-3 py-1 bg-secondary/10 text-secondary text-xs rounded-full font-bold";
      statusChip.textContent = "SAÍDA";
    }

    const syncStatus = (data.sync_status || "").toLowerCase();
    if (syncStatus === "pending") {
      statusFooter.textContent =
        (statusFooter.textContent || "") + " · Enviando à Frequência online…";
    } else if (syncStatus === "synced") {
      statusFooter.textContent =
        (statusFooter.textContent || "") + " · Já na Frequência online";
    } else if (syncStatus === "skipped" && data.sync_error) {
      statusFooter.textContent =
        (statusFooter.textContent || "") + ` · Sync: ${data.sync_error}`;
    } else if (syncStatus === "error") {
      statusFooter.textContent =
        (statusFooter.textContent || "") + " · Sync pendente (retry automático)";
    }

    logTime.textContent = clockEl.textContent;
    confidence.textContent =
      data.confidence != null
        ? `Confiança ${(data.confidence * 100).toFixed(0)}% · distância ${Number(
            data.distance || 0
          ).toFixed(3)}`
        : "";

    container.classList.add("scale-75", "md:-translate-x-48", "opacity-50");
    overlay.classList.remove("opacity-0", "translate-y-10");
    overlay.classList.add("opacity-100", "translate-y-0");
    setHelper(data.message || "Ponto registrado");
    scanMeta.textContent = "PONTO REGISTRADO";

    if (hideTimer) clearTimeout(hideTimer);
    hideTimer = setTimeout(hideOverlay, Math.max(1100, COOLDOWN_MS - 300));
  }

  function hideOverlay() {
    container.classList.remove("scale-75", "md:-translate-x-48", "opacity-50");
    overlay.classList.add("opacity-0", "translate-y-10");
    overlay.classList.remove("opacity-100", "translate-y-0");
    scanMeta.textContent = "AGUARDANDO ROSTO";
    setHelper("Aproxime o rosto para reconhecer automaticamente");
  }

  function shortDeviceTag(deviceId) {
    const id = String(deviceId || "");
    if (id.length < 8) return id || "?";
    return id.slice(0, 4) + "…" + id.slice(-4);
  }

  async function populateCameras() {
    await ensureCameraPermission();
    const { all, usb } = await listVideoInputs();
    const cams = usb.length ? usb : all;
    cameraSelect.innerHTML = "";
    if (!cams.length) {
      cameraSelect.innerHTML = "<option>Nenhuma webcam USB</option>";
      cameraSelect.disabled = true;
      return;
    }
    // Mesma marca/modelo: o rótulo do Windows fica igual — numeramos USB 1, USB 2…
    cams.forEach((cam, index) => {
      const opt = document.createElement("option");
      opt.value = cam.deviceId;
      const raw = (cam.label || "Webcam").trim();
      const n = index + 1;
      if (isBuiltinCamera(raw)) {
        opt.textContent = `Interna · ${raw}`;
      } else {
        opt.textContent = `USB ${n} · ${raw} · ${shortDeviceTag(cam.deviceId)}`;
      }
      cameraSelect.appendChild(opt);
    });
    const chosen = pickDeviceForStation(usb, all);
    if (chosen) {
      currentDeviceId = chosen;
      cameraSelect.value = chosen;
    }
    cameraSelect.disabled = false;

    const selectedIdx = cams.findIndex((c) => c.deviceId === currentDeviceId);
    if (selectedIdx >= 0 && STATION_ID) {
      setHelper(
        `Estação ${STATION_ID}: use USB ${selectedIdx + 1} nesta tela` +
          (cams.length > 1
            ? ` (a outra estação deve usar outra USB — modelos iguais são normais)`
            : "")
      );
    }
  }

  function captureBlob() {
    const sourceWidth = video.videoWidth || 640;
    const sourceHeight = video.videoHeight || 480;
    const longest = Math.max(sourceWidth, sourceHeight);
    const scale = longest > MAX_SIDE ? MAX_SIDE / longest : 1;
    const width = Math.max(1, Math.round(sourceWidth * scale));
    const height = Math.max(1, Math.round(sourceHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    ctx.translate(width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, 0, 0, width, height);
    return new Promise((resolve, reject) => {
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error("Falha ao capturar"))),
        "image/jpeg",
        0.8
      );
    });
  }

  async function refreshDbStatus() {
    try {
      const res = await fetch(recentUrl);
      const data = await res.json();
      if (!data.success) return;
      document.getElementById("databaseStatus").textContent = String(
        data.registered_faces || 0
      );
      document.getElementById("serverStatus").textContent = "ONLINE / SYNCED";
    } catch (_) {
      document.getElementById("serverStatus").textContent = "OFFLINE";
    }
  }

  async function recognizeOnce() {
    if (busy || cooldownRemaining() > 0) return;
    if (!video.videoWidth) return;
    busy = true;
    try {
      const blob = await captureBlob();
      const formData = new FormData();
      formData.append("csrf_token", csrfToken);
      formData.append("image", blob, "capture.jpg");
      if (STATION_ID) formData.append("station_id", STATION_ID);
      const response = await fetch(punchUrl, {
        method: "POST",
        body: formData,
        headers: {
          "X-CSRFToken": csrfToken,
          ...(STATION_ID ? { "X-Station-Id": STATION_ID } : {}),
        },
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok || !data.success) {
        const msg = data.message || "";
        if (response.status === 409 || data.duplicate) {
          setHelper(msg || "Já registrado há pouco nesta rede.");
          scanMeta.textContent = "DUPLICADO";
          return;
        }
        if (/nenhum rosto/i.test(msg)) {
          setHelper("Aproxime o rosto da câmera…");
          scanMeta.textContent = "SEM ROSTO";
        } else if (/não reconhecido|nao reconhecido/i.test(msg)) {
          setHelper("Rosto detectado, mas não cadastrado.");
          scanMeta.textContent = "DESCONHECIDO";
        } else {
          setHelper(msg || "Falha no reconhecimento");
        }
        return;
      }

      cooldownUntil = Date.now() + COOLDOWN_MS;
      showOverlay(data);
      refreshDbStatus();
    } catch (_) {
      setHelper("Falha de comunicação com o servidor");
      document.getElementById("serverStatus").textContent = "ERRO";
    } finally {
      busy = false;
    }
  }

  function scheduleNext(delay) {
    if (!autoScanEnabled) return;
    if (scanTimer) clearTimeout(scanTimer);
    scanTimer = setTimeout(runTick, delay);
  }

  async function runTick() {
    if (!autoScanEnabled) return;
    const remaining = cooldownRemaining();
    if (remaining > 0) {
      setHelper(`Próxima batida em ${Math.ceil(remaining / 1000)}s`);
      scheduleNext(Math.min(remaining, 250));
      return;
    }
    if (!busy) await recognizeOnce();
    scheduleNext(SCAN_GAP_MS);
  }

  function startAutoScan() {
    autoScanEnabled = true;
    scheduleNext(300);
  }

  function stopAutoScan() {
    autoScanEnabled = false;
    if (scanTimer) clearTimeout(scanTimer);
    scanTimer = null;
  }

  async function bootstrapCamera() {
    cameraStatus.textContent = "ABRINDO WEBCAM USB…";
    setHelper(
      STATION_ID
        ? `Estação ${STATION_ID}: selecionando webcam USB…`
        : "Solicitando permissão e listando webcams USB…"
    );
    try {
      await ensureCameraPermission();
      await populateCameras();
      await startCamera(currentDeviceId || undefined);
      await populateCameras();
      await refreshDbStatus();
      startAutoScan();
    } catch (err) {
      console.error("Câmera:", err);
      stopAutoScan();
      stopStream();
      cameraStatus.textContent = "WEBCAM INDISPONÍVEL";
      scanMeta.textContent = "SEM CÂMERA";
      setHelper(explainCameraError(err));
      if (retryBtn) retryBtn.classList.remove("hidden");
    }
  }

  cameraSelect.addEventListener("change", async () => {
    currentDeviceId = cameraSelect.value;
    localStorage.setItem(STORAGE_KEY, currentDeviceId);
    stopAutoScan();
    try {
      await startCamera(currentDeviceId);
      await populateCameras();
      startAutoScan();
    } catch (err) {
      setHelper(
        explainCameraError(err) +
          " Se a outra estação já usa esta USB, escolha outra no seletor."
      );
      if (retryBtn) retryBtn.classList.remove("hidden");
    }
  });

  if (retryBtn) {
    retryBtn.addEventListener("click", () => {
      localStorage.removeItem(STORAGE_KEY);
      currentDeviceId = "";
      bootstrapCamera();
    });
  }

  function isFullscreen() {
    return Boolean(
      document.fullscreenElement ||
        document.webkitFullscreenElement ||
        document.msFullscreenElement
    );
  }

  function syncFullscreenButton() {
    const on = isFullscreen();
    if (fullscreenIcon) {
      fullscreenIcon.textContent = on ? "fullscreen_exit" : "fullscreen";
    }
    if (fullscreenLabel) {
      fullscreenLabel.textContent = on ? "Sair da tela cheia" : "Tela cheia";
    }
    if (fullscreenBtn) {
      fullscreenBtn.title = on ? "Sair da tela cheia (Esc)" : "Tela cheia (F11)";
    }
  }

  async function toggleFullscreen() {
    try {
      if (isFullscreen()) {
        if (document.exitFullscreen) await document.exitFullscreen();
        else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
        else if (document.msExitFullscreen) document.msExitFullscreen();
      } else {
        const root = document.documentElement;
        if (root.requestFullscreen) await root.requestFullscreen();
        else if (root.webkitRequestFullscreen) root.webkitRequestFullscreen();
        else if (root.msRequestFullscreen) root.msRequestFullscreen();
      }
    } catch (_) {
      setHelper("Não foi possível alternar a tela cheia neste navegador.");
    }
    syncFullscreenButton();
  }

  if (fullscreenBtn) {
    fullscreenBtn.addEventListener("click", () => {
      toggleFullscreen();
    });
  }
  document.addEventListener("fullscreenchange", syncFullscreenButton);
  document.addEventListener("webkitfullscreenchange", syncFullscreenButton);
  syncFullscreenButton();

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) stopAutoScan();
    else if (stream) startAutoScan();
  });

  updateClock();
  setInterval(updateClock, 1000);
  bootstrapCamera();
})();
