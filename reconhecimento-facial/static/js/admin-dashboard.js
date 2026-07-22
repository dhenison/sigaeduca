(() => {
  const cfg = window.ADMIN_CONFIG || {};
  const csrfToken = cfg.csrfToken || "";
  const dashboardUrl = cfg.dashboardUrl || "/admin/api/dashboard";
  const enrollUrl = cfg.enrollUrl || "/admin/api/enroll";
  const guideUrl = cfg.guideUrl || "/admin/api/enroll/guide";
  const syncQueueUrl = cfg.syncQueueUrl || "/admin/api/sync/queue";
  const syncRunUrl = cfg.syncRunUrl || "/admin/api/sync/run";
  const syncRetryUrl = cfg.syncRetryUrl || "/admin/api/sync/retry-errors";
  const deleteTemplate = cfg.deleteUserUrl || "/admin/api/users/0";

  const modal = document.getElementById("enrollmentModal");
  const form = document.getElementById("enrollmentForm");
  const successBox = document.getElementById("enrollmentSuccess");
  const video = document.getElementById("enrollmentVideo");
  const preview = document.getElementById("capturedPreview");
  const guideCanvas = document.getElementById("enrollmentGuideCanvas");
  const oval = document.getElementById("enrollmentOval");
  const cameraSelect = document.getElementById("enrollmentCameraSelect");
  const statusEl = document.getElementById("enrollmentStatus");
  const captureBtn = document.getElementById("captureFace");
  const retryBtn = document.getElementById("retryFace");
  const saveBtn = document.getElementById("saveEnrollment");
  const toast = document.getElementById("toast");
  const scoreValue = document.getElementById("guideScoreValue");
  const scoreBar = document.getElementById("guideScoreBar");
  const readyBadge = document.getElementById("guideReadyBadge");
  const checklist = document.getElementById("guideChecklist");

  let stream = null;
  let capturedBlob = null;
  let latestUsers = [];
  let latestRecent = [];
  let guideActive = false;
  let guideBusy = false;
  let guideTimer = null;
  let readyStreak = 0;
  let poseReady = false;
  const READY_STREAK_NEEDED = 3;

  function showToast(message) {
    toast.textContent = message;
    toast.classList.remove("translate-y-20", "opacity-0");
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => {
      toast.classList.add("translate-y-20", "opacity-0");
    }, 2800);
  }

  function openModal() {
    modal.classList.remove("hidden");
    modal.classList.add("flex");
    form.classList.remove("hidden");
    successBox.classList.add("hidden");
    form.reset();
    syncPersonKindFields();
    resetCapture();
    startEnrollmentCamera();
  }

  function closeModal() {
    modal.classList.add("hidden");
    modal.classList.remove("flex");
    stopGuide();
    stopCamera();
  }

  function stopCamera() {
    if (stream) {
      stream.getTracks().forEach((t) => t.stop());
      stream = null;
    }
  }

  function stopGuide() {
    guideActive = false;
    if (guideTimer) {
      clearTimeout(guideTimer);
      guideTimer = null;
    }
    clearGuideCanvas();
  }

  function clearGuideCanvas() {
    if (!guideCanvas) return;
    const ctx = guideCanvas.getContext("2d");
    ctx.clearRect(0, 0, guideCanvas.width, guideCanvas.height);
  }

  function resetChecklist() {
    if (!checklist) return;
    checklist.querySelectorAll("[data-check]").forEach((li) => {
      li.classList.remove("is-ok");
      const dot = li.querySelector(".guide-dot");
      if (dot) dot.textContent = "○";
    });
  }

  function updateChecklist(checks) {
    if (!checklist || !checks) return;
    checklist.querySelectorAll("[data-check]").forEach((li) => {
      const key = li.getAttribute("data-check");
      const ok = Boolean(checks[key]);
      li.classList.toggle("is-ok", ok);
      const dot = li.querySelector(".guide-dot");
      if (dot) dot.textContent = ok ? "●" : "○";
    });
  }

  function setGuideVisual({ score = 0, ready = false, hint = "", box = null }) {
    scoreValue.textContent = String(Math.round(score));
    scoreBar.style.width = `${Math.max(0, Math.min(100, score))}%`;
    scoreBar.classList.toggle("bg-primary", ready);
    scoreBar.classList.toggle("bg-amber-400", !ready && score >= 40);
    scoreBar.classList.toggle("bg-red-400", !ready && score < 40);

    oval.classList.remove("is-ready", "is-warn", "is-bad");
    if (ready) oval.classList.add("is-ready");
    else if (score >= 40) oval.classList.add("is-warn");
    else oval.classList.add("is-bad");

    readyBadge.classList.toggle("hidden", !ready);
    if (hint) statusEl.textContent = hint;
    drawFaceBox(box, ready);
  }

  function drawFaceBox(box, ready) {
    if (!guideCanvas || !video) return;
    const rect = video.getBoundingClientRect();
    const width = Math.max(1, Math.round(rect.width));
    const height = Math.max(1, Math.round(rect.height));
    if (guideCanvas.width !== width || guideCanvas.height !== height) {
      guideCanvas.width = width;
      guideCanvas.height = height;
    }
    const ctx = guideCanvas.getContext("2d");
    ctx.clearRect(0, 0, width, height);
    if (!box) return;

    const x = box.left * width;
    const y = box.top * height;
    const w = (box.right - box.left) * width;
    const h = (box.bottom - box.top) * height;
    ctx.strokeStyle = ready ? "#2eaf62" : "#f59e0b";
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    ctx.strokeRect(x, y, w, h);
    ctx.setLineDash([]);
  }

  function resetCapture() {
    capturedBlob = null;
    poseReady = false;
    readyStreak = 0;
    preview.classList.add("hidden");
    video.classList.remove("hidden");
    guideCanvas?.classList.remove("hidden");
    oval?.classList.remove("hidden");
    saveBtn.disabled = true;
    captureBtn.disabled = true;
    retryBtn.classList.add("hidden");
    resetChecklist();
    setGuideVisual({
      score: 0,
      ready: false,
      hint: "Preparando câmera e assistente de enquadramento...",
    });
  }

  async function populateCameras() {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const cams = devices.filter((d) => d.kind === "videoinput");
    cameraSelect.innerHTML = "";
    cams.forEach((cam, i) => {
      const opt = document.createElement("option");
      opt.value = cam.deviceId;
      opt.textContent = cam.label || `Câmera ${i + 1}`;
      cameraSelect.appendChild(opt);
    });
    cameraSelect.disabled = !cams.length;
  }

  function frameBlob(quality = 0.7) {
    const sourceWidth = video.videoWidth || 640;
    const sourceHeight = video.videoHeight || 480;
    const canvas = document.createElement("canvas");
    canvas.width = sourceWidth;
    canvas.height = sourceHeight;
    const ctx = canvas.getContext("2d");
    // Espelha igual ao preview CSS, para o guia bater com o que a pessoa vê.
    ctx.translate(sourceWidth, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, 0, 0, sourceWidth, sourceHeight);
    return new Promise((resolve, reject) => {
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error("Falha ao capturar"))),
        "image/jpeg",
        quality
      );
    });
  }

  async function analyzeGuideFrame() {
    if (!guideActive || guideBusy || capturedBlob || !video.videoWidth) return;
    guideBusy = true;
    try {
      const blob = await frameBlob(0.62);
      const formData = new FormData();
      formData.append("csrf_token", csrfToken);
      formData.append("image", blob, "guide.jpg");
      const res = await fetch(guideUrl, {
        method: "POST",
        body: formData,
        headers: { "X-CSRFToken": csrfToken },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        setGuideVisual({
          score: 0,
          ready: false,
          hint: data.message || "Não foi possível analisar o quadro.",
        });
        captureBtn.disabled = true;
        poseReady = false;
        readyStreak = 0;
        return;
      }

      updateChecklist(data.checks || {});
      const readyNow = Boolean(data.ready);
      readyStreak = readyNow ? readyStreak + 1 : 0;
      poseReady = readyStreak >= READY_STREAK_NEEDED;
      setGuideVisual({
        score: data.score || 0,
        ready: poseReady,
        hint: poseReady
          ? "Posição ideal confirmada. Pode tirar a foto."
          : data.hint || "Ajuste o rosto no oval.",
        box: data.box,
      });
      captureBtn.disabled = !poseReady;
    } catch (_) {
      statusEl.textContent = "Assistente temporariamente indisponível.";
    } finally {
      guideBusy = false;
    }
  }

  function scheduleGuide() {
    if (!guideActive) return;
    if (guideTimer) clearTimeout(guideTimer);
    guideTimer = setTimeout(async () => {
      await analyzeGuideFrame();
      scheduleGuide();
    }, 450);
  }

  function startGuide() {
    stopGuide();
    guideActive = true;
    readyStreak = 0;
    poseReady = false;
    scheduleGuide();
  }

  async function startEnrollmentCamera() {
    try {
      stopGuide();
      stopCamera();
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false,
      });
      video.srcObject = stream;
      await video.play();
      await populateCameras();
      statusEl.textContent = "Centralize o rosto no oval. O sistema vai indicar a melhor posição.";
      startGuide();
    } catch (_) {
      statusEl.textContent = "Não foi possível acessar a câmera.";
      captureBtn.disabled = true;
    }
  }

  cameraSelect.addEventListener("change", async () => {
    try {
      stopGuide();
      stopCamera();
      stream = await navigator.mediaDevices.getUserMedia({
        video: { deviceId: { exact: cameraSelect.value } },
        audio: false,
      });
      video.srcObject = stream;
      await video.play();
      startGuide();
    } catch (_) {
      statusEl.textContent = "Falha ao trocar de câmera.";
    }
  });

  async function capturePhoto() {
    if (!poseReady) {
      showToast("Aguarde a posição ideal (oval verde).");
      return;
    }
    try {
      stopGuide();
      const blob = await frameBlob(0.9);
      capturedBlob = blob;
      preview.src = URL.createObjectURL(blob);
      preview.classList.remove("hidden");
      video.classList.add("hidden");
      guideCanvas?.classList.add("hidden");
      oval?.classList.add("hidden");
      readyBadge.classList.add("hidden");
      saveBtn.disabled = false;
      captureBtn.disabled = true;
      retryBtn.classList.remove("hidden");
      statusEl.textContent = "Foto na posição ideal. Revise e salve o cadastro.";
    } catch (_) {
      statusEl.textContent = "Falha ao capturar a foto.";
      startGuide();
    }
  }

  function personCard(u) {
    const photo = u.photo_url
      ? `<img src="${u.photo_url}" alt="" class="w-11 h-11 rounded-full object-cover border border-border-subtle">`
      : `<div class="w-11 h-11 rounded-full bg-surface-container flex items-center justify-center text-primary"><span class="material-symbols-outlined">person</span></div>`;
    const faceBadge = u.has_face
      ? '<span class="text-[10px] font-bold uppercase text-primary bg-primary-light/20 px-2 py-1 rounded-full">Biometria OK</span>'
      : '<span class="text-[10px] font-bold uppercase text-error bg-error-container px-2 py-1 rounded-full">Sem face</span>';
    const kindLabel =
      u.person_kind === "aluno"
        ? `Aluno · ${u.class_code || "sem turma"}`
        : u.person_kind === "servidor"
          ? `Servidor · ${
              u.staff_role === "gestao"
                ? "Gestão"
                : u.staff_role === "portaria"
                  ? "Portaria"
                  : u.staff_role === "professor"
                    ? "Professor"
                    : "—"
            }`
          : u.schedule || "—";
    return `<div class="flex items-center justify-between gap-3 p-3 rounded-xl border border-border-subtle hover:bg-surface-container-lowest">
      <div class="flex items-center gap-3 min-w-0">
        ${photo}
        <div class="min-w-0">
          <p class="font-semibold truncate">${u.name}</p>
          <p class="text-xs text-text-secondary truncate">${u.registration || u.username} · ${kindLabel}${u.schedule ? " · " + u.schedule : ""}</p>
        </div>
      </div>
      <div class="flex items-center gap-2 shrink-0">
        ${faceBadge}
        <button type="button" data-delete="${u.id}" class="p-2 rounded-full hover:bg-error-container text-error" title="Remover">
          <span class="material-symbols-outlined text-lg">delete</span>
        </button>
      </div>
    </div>`;
  }

  function renderUsers(filterText = "") {
    const q = filterText.trim().toLowerCase();
    const kindFilter = document.getElementById("listFilterKind")?.value || "all";
    const list = document.getElementById("studentList");
    const filtered = latestUsers.filter((u) => {
      if (kindFilter !== "all" && (u.person_kind || "") !== kindFilter) return false;
      if (!q) return true;
      return (
        (u.name || "").toLowerCase().includes(q) ||
        (u.registration || "").toLowerCase().includes(q) ||
        (u.username || "").toLowerCase().includes(q) ||
        (u.class_code || "").toLowerCase().includes(q) ||
        (u.staff_role || "").toLowerCase().includes(q)
      );
    });
    if (!filtered.length) {
      list.innerHTML =
        '<p class="text-sm text-text-secondary py-6 text-center">Nenhum cadastro encontrado.</p>';
      return;
    }

    const staffLabels = {
      professor: "Professores",
      gestao: "Gestão",
      portaria: "Portaria",
    };
    const servers = filtered.filter((u) => u.person_kind === "servidor");
    const students = filtered.filter((u) => u.person_kind === "aluno");
    const others = filtered.filter(
      (u) => u.person_kind !== "servidor" && u.person_kind !== "aluno"
    );

    let html = "";
    if (servers.length && kindFilter !== "aluno") {
      html += `<div><h4 class="text-xs font-bold uppercase tracking-wider text-primary mb-2">Usuários (servidores)</h4>`;
      for (const role of ["professor", "gestao", "portaria"]) {
        const group = servers.filter((u) => u.staff_role === role);
        if (!group.length) continue;
        html += `<p class="text-[11px] font-semibold text-text-secondary mt-3 mb-1">${staffLabels[role]}</p>`;
        html += `<div class="space-y-2">${group.map(personCard).join("")}</div>`;
      }
      const untyped = servers.filter((u) => !staffLabels[u.staff_role]);
      if (untyped.length) {
        html += `<p class="text-[11px] font-semibold text-text-secondary mt-3 mb-1">Outros servidores</p>`;
        html += `<div class="space-y-2">${untyped.map(personCard).join("")}</div>`;
      }
      html += `</div>`;
    }

    if (students.length && kindFilter !== "servidor") {
      html += `<div class="mt-2"><h4 class="text-xs font-bold uppercase tracking-wider text-secondary mb-2">Alunos por turma</h4>`;
      const byClass = {};
      students.forEach((u) => {
        const key = u.class_code || "Sem turma";
        if (!byClass[key]) byClass[key] = [];
        byClass[key].push(u);
      });
      Object.keys(byClass)
        .sort((a, b) => a.localeCompare(b, "pt-BR"))
        .forEach((cls) => {
          html += `<p class="text-[11px] font-semibold text-text-secondary mt-3 mb-1">${cls}</p>`;
          html += `<div class="space-y-2">${byClass[cls].map(personCard).join("")}</div>`;
        });
      html += `</div>`;
    }

    if (others.length && kindFilter === "all") {
      html += `<div class="mt-2"><h4 class="text-xs font-bold uppercase tracking-wider text-text-secondary mb-2">Sem categoria</h4>`;
      html += `<div class="space-y-2">${others.map(personCard).join("")}</div></div>`;
    }

    list.innerHTML = html;
  }

  function syncPersonKindFields() {
    const kind = document.getElementById("personKind")?.value || "";
    const staffWrap = document.getElementById("staffRoleWrap");
    const classWrap = document.getElementById("classCodeWrap");
    const lookupWrap = document.getElementById("sigaLookupWrap");
    const regLabel = document.getElementById("registrationLabel");
    const regInput = document.getElementById("studentRegistration");
    const nameInput = document.getElementById("studentName");
    const classInput = document.getElementById("studentClass");
    const classSelect = document.getElementById("sigaClassSelect");
    const studentPick = document.getElementById("sigaStudentPick");
    const statusEl = document.getElementById("sigaLookupStatus");
    if (!staffWrap || !classWrap) return;
    staffWrap.classList.toggle("hidden", kind !== "servidor");
    classWrap.classList.toggle("hidden", kind !== "aluno");
    if (lookupWrap) lookupWrap.classList.toggle("hidden", kind !== "aluno");
    if (kind === "aluno") {
      regLabel.textContent = "Matrícula (INEP)";
      regInput.required = true;
      regInput.readOnly = true;
      regInput.placeholder = "Preenchida ao selecionar o aluno";
      if (classInput) classInput.readOnly = true;
      if (nameInput) {
        nameInput.readOnly = true;
        nameInput.placeholder = "Preenchido ao selecionar o aluno";
      }
      nameInput.value = "";
      regInput.value = "";
      if (classInput) classInput.value = "";
      if (statusEl) statusEl.textContent = "";
      if (studentPick) {
        studentPick.innerHTML = '<option value="">Selecione a turma primeiro…</option>';
        studentPick.disabled = true;
      }
      loadSigaClasses();
    } else if (kind === "servidor") {
      regLabel.textContent = "Código / matrícula funcional";
      regInput.required = false;
      regInput.readOnly = false;
      regInput.placeholder = "Opcional";
      if (classInput) classInput.readOnly = false;
      if (nameInput) {
        nameInput.readOnly = false;
        nameInput.placeholder = "";
      }
      if (classSelect) classSelect.innerHTML = '<option value="">—</option>';
      if (studentPick) {
        studentPick.innerHTML = "";
        studentPick.disabled = true;
      }
    } else {
      regLabel.textContent = "Matrícula / código";
      regInput.required = false;
      regInput.readOnly = false;
      if (nameInput) nameInput.readOnly = false;
    }
  }

  let cachedSigaStudents = [];

  async function loadSigaClasses() {
    const classSelect = document.getElementById("sigaClassSelect");
    const statusEl = document.getElementById("sigaLookupStatus");
    const url = cfg.sigaClassesUrl || "/admin/api/siga/classes";
    if (!classSelect) return;
    classSelect.innerHTML = '<option value="">Carregando turmas…</option>';
    classSelect.disabled = true;
    try {
      const res = await fetch(url, { headers: { "X-CSRFToken": csrfToken } });
      const data = await res.json();
      if (!data.success && !(data.classes || []).length) {
        classSelect.innerHTML = '<option value="">Sem turmas disponíveis</option>';
        if (statusEl) {
          statusEl.textContent =
            data.message || "Não foi possível carregar as turmas do SIGA.";
        }
        return;
      }
      const classes = data.classes || [];
      classSelect.innerHTML =
        '<option value="">Selecione a turma…</option>' +
        classes
          .map((c) => {
            const code = c.code || "";
            const serie = c.serie ? ` · ${c.serie}` : "";
            const turno = c.turno ? ` · ${c.turno}` : "";
            return `<option value="${code}">${code}${serie}${turno}</option>`;
          })
          .join("");
      classSelect.disabled = false;
      if (statusEl) {
        statusEl.textContent = classes.length
          ? `${classes.length} turma(s) do SIGA — selecione para listar os alunos.`
          : "Nenhuma turma ativa encontrada.";
      }
    } catch (_) {
      classSelect.innerHTML = '<option value="">Erro ao carregar turmas</option>';
      if (statusEl) statusEl.textContent = "Erro de comunicação ao listar turmas.";
    }
  }

  async function loadSigaStudentsByClass(classCode) {
    const statusEl = document.getElementById("sigaLookupStatus");
    const pick = document.getElementById("sigaStudentPick");
    const url = cfg.sigaStudentsUrl || "/admin/api/siga/students";
    cachedSigaStudents = [];
    if (pick) {
      pick.disabled = true;
      pick.innerHTML = '<option value="">Carregando alunos…</option>';
    }
    document.getElementById("studentName").value = "";
    document.getElementById("studentRegistration").value = "";
    document.getElementById("studentClass").value = classCode || "";
    if (!classCode) {
      if (pick) {
        pick.innerHTML = '<option value="">Selecione a turma primeiro…</option>';
      }
      if (statusEl) statusEl.textContent = "Selecione a turma para listar os alunos.";
      return;
    }
    if (statusEl) statusEl.textContent = `Buscando alunos da turma ${classCode}…`;
    try {
      const res = await fetch(
        `${url}?class_code=${encodeURIComponent(classCode)}`,
        { headers: { "X-CSRFToken": csrfToken } }
      );
      const data = await res.json();
      if (!data.configured) {
        if (statusEl) {
          statusEl.textContent =
            data.message || "Configure o Supabase no .env do reconhecimento facial.";
        }
        if (pick) pick.innerHTML = '<option value="">Supabase não configurado</option>';
        return;
      }
      if (!data.success) {
        if (statusEl) statusEl.textContent = data.message || "Falha na busca.";
        if (pick) pick.innerHTML = '<option value="">Falha ao listar alunos</option>';
        return;
      }
      const students = data.students || [];
      cachedSigaStudents = students;
      if (!students.length) {
        if (pick) pick.innerHTML = '<option value="">Nenhum aluno nesta turma</option>';
        if (statusEl) {
          statusEl.textContent =
            "Nenhum aluno ativo nesta turma no SIGA online.";
        }
        return;
      }
      if (pick) {
        pick.innerHTML =
          '<option value="">Selecione o aluno…</option>' +
          students
            .map(
              (s) =>
                `<option value="${s.codigo_inep}">${s.full_name} · INEP ${s.codigo_inep}${s.has_local_face ? " · face OK" : ""}</option>`
            )
            .join("");
        pick.disabled = false;
      }
      if (statusEl) {
        statusEl.textContent = `${students.length} aluno(s) na turma ${classCode} — selecione e capture a foto.`;
      }
    } catch (_) {
      if (statusEl) statusEl.textContent = "Erro de comunicação com o servidor.";
      if (pick) pick.innerHTML = '<option value="">Erro ao listar alunos</option>';
    }
  }

  function applySigaStudent(s) {
    document.getElementById("studentName").value = s.full_name || "";
    document.getElementById("studentRegistration").value = s.codigo_inep || "";
    document.getElementById("studentClass").value = s.class_code || "";
    document.getElementById("studentName").readOnly = true;
    document.getElementById("studentRegistration").readOnly = true;
    const statusEl = document.getElementById("sigaLookupStatus");
    if (statusEl) {
      statusEl.textContent = s.has_local_face
        ? "Aluno selecionado (já tem face local — a foto será atualizada no local e na ficha do SIGA)."
        : "Aluno selecionado. Capture a foto para salvar localmente e na ficha individual do SIGA.";
    }
  }

  function renderLog() {
    const body = document.getElementById("liveLogBody");
    if (!latestRecent.length) {
      body.innerHTML =
        '<tr><td colspan="4" class="px-6 py-8 text-center text-sm text-text-secondary">Nenhum reconhecimento ainda.</td></tr>';
      return;
    }
    body.innerHTML = latestRecent
      .map((item) => {
        const user = item.user || {};
        const photo = user.photo_url
          ? `<img class="w-10 h-10 rounded-full object-cover border border-border-subtle" src="${user.photo_url}" alt="">`
          : `<div class="w-10 h-10 rounded-full bg-surface-container flex items-center justify-center"><span class="material-symbols-outlined text-text-secondary">person</span></div>`;
        const isEntrada = item.tipo === "ENTRADA";
        return `<tr class="hover:bg-surface-container-lowest">
          <td class="px-6 py-4">
            <div class="flex items-center gap-3">
              ${photo}
              <div>
                <p class="font-semibold">${user.name || "—"}</p>
                <p class="text-xs text-text-secondary">${user.schedule || user.registration || ""}</p>
              </div>
            </div>
          </td>
          <td class="px-6 py-4 text-sm">${item.timestamp || "—"}</td>
          <td class="px-6 py-4">
            <span class="flex items-center gap-1.5 ${isEntrada ? "text-primary" : "text-secondary"}">
              <span class="material-symbols-outlined text-sm">${isEntrada ? "login" : "logout"}</span>
              <span class="text-xs font-medium">${item.tipo}</span>
            </span>
          </td>
          <td class="px-6 py-4">
            <span class="px-3 py-1 bg-primary-light/20 text-primary rounded-full text-[12px] font-bold">Verificado</span>
          </td>
        </tr>`;
      })
      .join("");
  }

  async function refreshDashboard() {
    const res = await fetch(dashboardUrl, {
      headers: { "X-CSRFToken": csrfToken },
    });
    const data = await res.json();
    if (!data.success) throw new Error("Falha ao carregar dashboard");
    const stats = data.stats || {};
    document.getElementById("recognizedCount").textContent = stats.recognized_today || 0;
    document.getElementById("failedCount").textContent = stats.saidas_today || 0;
    document.getElementById("registeredCount").textContent = stats.registered_faces || 0;
    document.getElementById("entradasToday").textContent = stats.entradas_today || 0;
    document.getElementById("saidasToday").textContent = stats.saidas_today || 0;
    latestUsers = data.users || [];
    latestRecent = data.recent || [];
    renderUsers(document.getElementById("searchUsers").value);
    renderLog();
  }

  function renderSyncQueue(payload) {
    const hint = document.getElementById("syncConfigHint");
    const list = document.getElementById("syncQueueList");
    if (!hint || !list) return;
    const stats = payload.stats || {};
    document.getElementById("syncPendingCount").textContent = stats.pending || 0;
    document.getElementById("syncSyncedCount").textContent = stats.synced || 0;
    document.getElementById("syncErrorCount").textContent = stats.error || 0;
    document.getElementById("syncSkippedCount").textContent = stats.skipped || 0;
    hint.textContent = payload.configured
      ? "Supabase configurado. ENTRADA/SAÍDA de alunos sobem sozinhas para a Frequência online (com retry automático)."
      : "Configure SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY e SUPABASE_SCHOOL_ID no .env.";
    hint.classList.toggle("text-error", !payload.configured);
    hint.classList.toggle("text-tertiary", Boolean(payload.configured));

    const items = payload.items || [];
    if (!items.length) {
      list.innerHTML =
        '<p class="text-sm text-text-secondary py-4 text-center">Nenhuma batida pendente ou com erro.</p>';
      return;
    }
    list.innerHTML = items
      .map((item) => {
        const user = item.user || {};
        const statusColor =
          item.sync_status === "error"
            ? "text-error"
            : item.sync_status === "skipped"
              ? "text-tertiary"
              : "text-amber-700";
        return `<div class="flex items-start justify-between gap-3 p-3 rounded-xl border border-border-subtle">
          <div class="min-w-0">
            <p class="font-semibold truncate">${user.name || "—"} · ${item.tipo || ""}</p>
            <p class="text-xs text-text-secondary">${item.timestamp || ""} · matrícula ${user.registration || "—"} · ${item.station_id || "sem estação"}</p>
            ${item.sync_error ? `<p class="text-xs text-error mt-1">${item.sync_error}</p>` : ""}
          </div>
          <span class="text-[10px] font-bold uppercase shrink-0 ${statusColor}">${item.sync_status}</span>
        </div>`;
      })
      .join("");
  }

  async function refreshSyncQueue() {
    const res = await fetch(syncQueueUrl, {
      headers: { "X-CSRFToken": csrfToken },
    });
    const data = await res.json();
    if (!data.success) throw new Error("Falha ao carregar esteira");
    renderSyncQueue(data);
  }

  document.getElementById("runSyncQueue")?.addEventListener("click", async () => {
    const btn = document.getElementById("runSyncQueue");
    btn.disabled = true;
    try {
      const res = await fetch(syncRunUrl, {
        method: "POST",
        headers: { "X-CSRFToken": csrfToken },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        showToast(data.message || "Falha ao sincronizar.");
        return;
      }
      showToast(
        `Esteira: ${data.synced || 0} enviados, ${data.skipped || 0} ignorados, ${data.errors || 0} erros.`
      );
      await refreshSyncQueue();
    } catch (_) {
      showToast("Erro de comunicação ao sincronizar.");
    } finally {
      btn.disabled = false;
    }
  });

  document.getElementById("retrySyncErrors")?.addEventListener("click", async () => {
    try {
      const res = await fetch(syncRetryUrl, {
        method: "POST",
        headers: { "X-CSRFToken": csrfToken },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        showToast(data.message || "Falha ao reenfileirar.");
        return;
      }
      showToast(`${data.retried || 0} item(ns) reenfileirado(s).`);
      await refreshSyncQueue();
    } catch (_) {
      showToast("Erro ao reenfileirar.");
    }
  });

  document.getElementById("studentList").addEventListener("click", async (event) => {
    const btn = event.target.closest("[data-delete]");
    if (!btn) return;
    const id = btn.getAttribute("data-delete");
    if (!confirm("Remover este cadastro?")) return;
    const url = deleteTemplate.replace(/0(?!.*\d)/, id).replace("/0", `/${id}`);
    const res = await fetch(`/admin/api/users/${id}`, {
      method: "DELETE",
      headers: { "X-CSRFToken": csrfToken },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.success) {
      showToast(data.message || "Não foi possível remover.");
      return;
    }
    showToast("Cadastro removido.");
    refreshDashboard();
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!capturedBlob) {
      showToast("Capture a foto antes de salvar.");
      return;
    }
    const personKind = document.getElementById("personKind").value;
    const staffRole = document.getElementById("staffRole").value;
    const classCode = document.getElementById("studentClass").value.trim();
    const registration = document.getElementById("studentRegistration").value.trim();
    if (!personKind) {
      showToast("Selecione Usuário (servidor) ou Aluno.");
      return;
    }
    if (personKind === "aluno" && !registration) {
      showToast("Selecione o aluno da turma no SIGA.");
      return;
    }
    if (personKind === "aluno" && !classCode) {
      showToast("Selecione a turma do aluno.");
      return;
    }
    if (personKind === "servidor" && !staffRole) {
      showToast("Selecione a função do servidor.");
      return;
    }
    saveBtn.disabled = true;
    statusEl.textContent = "Enviando e mapeando o rosto...";
    const formData = new FormData();
    formData.append("csrf_token", csrfToken);
    formData.append("name", document.getElementById("studentName").value.trim());
    formData.append("registration", registration);
    formData.append("person_kind", personKind);
    formData.append("staff_role", staffRole);
    formData.append("class_code", classCode);
    formData.append("schedule", document.getElementById("studentShift").value);
    formData.append("image", capturedBlob, "enrollment.jpg");

    try {
      const res = await fetch(enrollUrl, {
        method: "POST",
        body: formData,
        headers: { "X-CSRFToken": csrfToken },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        statusEl.textContent = data.message || "Falha no cadastro.";
        saveBtn.disabled = false;
        showToast(data.message || "Falha no cadastro.");
        return;
      }
      stopGuide();
      stopCamera();
      form.classList.add("hidden");
      successBox.classList.remove("hidden");
      document.getElementById("enrollmentSuccessName").textContent =
        data.user?.name || document.getElementById("studentName").value;
      showToast(
        data.avatar_synced
          ? "Cadastro facial concluído (local + foto de perfil no SIGA)."
          : data.warning || "Cadastro facial concluído."
      );
      refreshDashboard();
    } catch (_) {
      statusEl.textContent = "Erro de comunicação com o servidor.";
      saveBtn.disabled = false;
    }
  });

  document.getElementById("exportCsv").addEventListener("click", () => {
    const rows = [["nome", "matricula", "horario", "tipo"]];
    latestRecent.forEach((item) => {
      rows.push([
        item.user?.name || "",
        item.user?.registration || "",
        item.timestamp || "",
        item.tipo || "",
      ]);
    });
    const csv = rows.map((r) => r.map((c) => `"${String(c).replaceAll('"', '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "reconhecimentos.csv";
    a.click();
    URL.revokeObjectURL(url);
  });

  document.getElementById("newEnrollment").addEventListener("click", openModal);
  document.getElementById("newEnrollmentInline").addEventListener("click", openModal);
  document.getElementById("closeEnrollment").addEventListener("click", closeModal);
  document.getElementById("cancelEnrollment").addEventListener("click", closeModal);
  document.getElementById("finishEnrollment").addEventListener("click", closeModal);
  captureBtn.addEventListener("click", capturePhoto);
  retryBtn.addEventListener("click", () => {
    preview.classList.add("hidden");
    video.classList.remove("hidden");
    guideCanvas?.classList.remove("hidden");
    oval?.classList.remove("hidden");
    capturedBlob = null;
    saveBtn.disabled = true;
    retryBtn.classList.add("hidden");
    resetChecklist();
    statusEl.textContent = "Centralize o rosto no oval novamente.";
    startGuide();
  });
  document.getElementById("searchUsers").addEventListener("input", (e) => {
    renderUsers(e.target.value);
  });
  document.getElementById("listFilterKind")?.addEventListener("change", () => {
    renderUsers(document.getElementById("searchUsers").value);
  });
  document.getElementById("personKind")?.addEventListener("change", syncPersonKindFields);
  document.getElementById("sigaClassSelect")?.addEventListener("change", (e) => {
    loadSigaStudentsByClass(e.target.value.trim());
  });
  document.getElementById("sigaStudentPick")?.addEventListener("change", (e) => {
    const selected = cachedSigaStudents.find((s) => s.codigo_inep === e.target.value);
    if (selected) applySigaStudent(selected);
  });
  syncPersonKindFields();

  refreshDashboard().catch(() => showToast("Falha ao carregar o painel."));
  refreshSyncQueue().catch(() => {});
  setInterval(() => {
    refreshDashboard().catch(() => {});
    refreshSyncQueue().catch(() => {});
  }, 8000);
})();
