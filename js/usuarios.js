// SIGA EDUCA — Gestão de Usuários (cadastro completo)
(function () {
    'use strict';

    var USERS_KEY = 'siga_users';
    var DOMAIN_SERVIDOR = '@escola.seduc.pa.gov.br';

    var FUNCOES = [
        'Diretor',
        'Vice-diretor Administrativo',
        'Vice-diretor Pedagógico',
        'Coordenador',
        'Secretario(a) Escolar',
        'Professor(a)'
    ];

    var editingId = null;
    var pendingPhoto = '';
    var photoTouched = false;
    var cameraStream = null;
    var filterFn = '';
    /** Avatar: boa resolução, leve para gravar no banco (JPEG ~512px) */
    var AVATAR_MAX_SIDE = 512;
    var AVATAR_JPEG_QUALITY = 0.72;
    var AVATAR_MAX_DATA_URL = 180000; // ~180 KB em texto (base64)

    function toast(msg, type) {
        if (typeof showToast === 'function') showToast(msg, type || 'success');
        else alert(msg);
    }

    function digits(v) {
        return String(v || '').replace(/\D/g, '');
    }

    function normEmail(v) {
        return String(v || '').trim().toLowerCase();
    }

    function uid() {
        return 'usr_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
    }

    function initials(name) {
        var parts = String(name || 'U').trim().split(/\s+/).filter(Boolean);
        if (!parts.length) return 'U';
        if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
        return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }

    function formatPhone(el) {
        var d = digits(el.value).slice(0, 11);
        var out = d;
        if (d.length > 6) {
            out = '(' + d.slice(0, 2) + ') ' + d.slice(2, 7) + '-' + d.slice(7);
        } else if (d.length > 2) {
            out = '(' + d.slice(0, 2) + ') ' + d.slice(2);
        } else if (d.length) {
            out = '(' + d;
        }
        el.value = out;
    }

    function getUsers() {
        try {
            var list = JSON.parse(localStorage.getItem(USERS_KEY) || '[]');
            return Array.isArray(list) ? list : [];
        } catch (e) {
            return [];
        }
    }

    function saveUsers(list) {
        localStorage.setItem(USERS_KEY, JSON.stringify(list || []));
    }

    function roleBadgeClass(role) {
        if (/Professor/i.test(role || '')) return 'bg-secondary/10 text-secondary';
        if (/Diretor|Vice|Coordenador|Secretario/i.test(role || '')) return 'bg-primary-light/10 text-primary';
        return 'bg-tertiary/10 text-tertiary';
    }

    function ensureModal() {
        if (document.getElementById('user-modal') && document.getElementById('user-senha')) return;
        if (document.getElementById('user-modal') && !document.getElementById('user-senha')) {
            document.getElementById('user-modal').remove();
        }
        if (document.getElementById('user-modal')) return;
        var wrap = document.createElement('div');
        wrap.innerHTML = [
            '<div id="user-modal" class="fixed inset-0 z-[80] hidden">',
            '  <div class="absolute inset-0 bg-black/40 backdrop-blur-sm" data-user-close></div>',
            '  <div class="relative z-10 min-h-full flex items-start justify-center p-4 sm:p-8">',
            '    <div class="w-full max-w-3xl bg-white rounded-2xl border border-border-subtle shadow-xl overflow-hidden my-4">',
            '      <div class="px-6 py-4 border-b border-border-subtle flex items-center justify-between bg-surface-container-low/40">',
            '        <div>',
            '          <h3 id="user-modal-title" class="font-headline-sm text-on-surface">Novo Usuário</h3>',
            '          <p class="text-label-sm text-text-secondary">Cadastro de colaborador da escola</p>',
            '        </div>',
            '        <button type="button" class="w-10 h-10 rounded-full hover:bg-surface-container flex items-center justify-center" data-user-close>',
            '          <span class="material-symbols-outlined">close</span>',
            '        </button>',
            '      </div>',
            '      <form id="user-form" class="p-6 space-y-6 max-h-[75vh] overflow-y-auto">',
            '        <div class="flex flex-col sm:flex-row gap-6 items-start">',
            '          <div class="flex flex-col items-center gap-3 w-full sm:w-auto">',
            '            <div class="relative">',
            '              <img id="user-photo-preview" alt="Foto" class="w-28 h-28 rounded-full object-cover border-4 border-primary-light/20 bg-surface-container hidden"/>',
            '              <div id="user-photo-initials" class="w-28 h-28 rounded-full bg-primary-container text-white font-bold text-2xl flex items-center justify-center">U</div>',
            '            </div>',
            '            <input id="user-photo-file" type="file" accept="image/jpeg,image/png,image/webp" class="hidden"/>',
            '            <div class="flex flex-wrap gap-2 justify-center">',
            '              <button type="button" id="user-photo-upload" class="px-3 py-2 rounded-lg border border-border-subtle text-label-md font-bold hover:bg-surface-container-low flex items-center gap-1">',
            '                <span class="material-symbols-outlined text-[18px]">upload</span> Upload',
            '              </button>',
            '              <button type="button" id="user-photo-camera" class="px-3 py-2 rounded-lg border border-border-subtle text-label-md font-bold hover:bg-surface-container-low flex items-center gap-1">',
            '                <span class="material-symbols-outlined text-[18px]">photo_camera</span> Câmera',
            '              </button>',
            '              <button type="button" id="user-photo-clear" class="px-3 py-2 rounded-lg border border-border-subtle text-label-md font-bold text-error hover:bg-error/5">Remover</button>',
            '            </div>',
            '            <p class="text-[11px] text-text-secondary text-center max-w-[220px]">A foto é otimizada automaticamente (boa qualidade, arquivo leve) e salva no cadastro do usuário.</p>',
            '            <div id="user-camera-box" class="hidden w-full space-y-2">',
            '              <video id="user-camera-video" class="w-full max-w-[240px] mx-auto rounded-xl bg-black aspect-square object-cover" autoplay playsinline></video>',
            '              <div class="flex gap-2 justify-center">',
            '                <button type="button" id="user-camera-capture" class="px-4 py-2 rounded-lg bg-primary text-white text-label-md font-bold">Capturar</button>',
            '                <button type="button" id="user-camera-cancel" class="px-4 py-2 rounded-lg border border-border-subtle text-label-md font-bold">Cancelar</button>',
            '              </div>',
            '              <canvas id="user-camera-canvas" class="hidden"></canvas>',
            '            </div>',
            '          </div>',
            '          <div class="flex-1 grid grid-cols-1 md:grid-cols-2 gap-4 w-full">',
            '            <div class="md:col-span-2 flex flex-col gap-1.5">',
            '              <label class="text-label-md font-bold" for="user-nome">Nome Completo *</label>',
            '              <input id="user-nome" required class="px-4 py-2.5 rounded-lg border border-border-subtle text-body-md outline-none focus:ring-2 focus:ring-primary/15 focus:border-primary" placeholder="Nome completo do colaborador"/>',
            '            </div>',
            '            <div class="flex flex-col gap-1.5">',
            '              <label class="text-label-md font-bold" for="user-funcao">Função *</label>',
            '              <select id="user-funcao" required class="px-4 py-2.5 rounded-lg border border-border-subtle text-body-md outline-none focus:ring-2 focus:ring-primary/15 focus:border-primary bg-white"></select>',
            '            </div>',
            '            <div class="flex flex-col gap-1.5">',
            '              <label class="text-label-md font-bold" for="user-matricula">Matrícula sem vínculo *</label>',
            '              <input id="user-matricula" required class="px-4 py-2.5 rounded-lg border border-border-subtle text-body-md outline-none focus:ring-2 focus:ring-primary/15 focus:border-primary" placeholder="Ex: 123456"/>',
            '            </div>',
            '            <div class="flex flex-col gap-1.5">',
            '              <label class="text-label-md font-bold" for="user-email">E-mail institucional *</label>',
            '              <input id="user-email" type="email" required class="px-4 py-2.5 rounded-lg border border-border-subtle text-body-md outline-none focus:ring-2 focus:ring-primary/15 focus:border-primary" placeholder="nome' + DOMAIN_SERVIDOR + '"/>',
            '            </div>',
            '            <div class="flex flex-col gap-1.5">',
            '              <label class="text-label-md font-bold" for="user-disciplina">Disciplina Principal</label>',
            '              <input id="user-disciplina" class="px-4 py-2.5 rounded-lg border border-border-subtle text-body-md outline-none focus:ring-2 focus:ring-primary/15 focus:border-primary" placeholder="Ex: Matemática"/>',
            '            </div>',
            '            <div class="flex flex-col gap-1.5 md:col-span-2">',
            '              <label class="text-label-md font-bold" for="user-telefone">Telefone (DDD + número)</label>',
            '              <input id="user-telefone" class="px-4 py-2.5 rounded-lg border border-border-subtle text-body-md outline-none focus:ring-2 focus:ring-primary/15 focus:border-primary" placeholder="(91) 98888-7777" maxlength="16"/>',
            '            </div>',
            '            <div class="flex flex-col gap-1.5" id="user-senha-wrap">',
            '              <label class="text-label-md font-bold" for="user-senha"><span id="user-senha-label">Senha de acesso *</span></label>',
            '              <input id="user-senha" type="password" autocomplete="new-password" class="px-4 py-2.5 rounded-lg border border-border-subtle text-body-md outline-none focus:ring-2 focus:ring-primary/15 focus:border-primary" placeholder="Mínimo 6 caracteres"/>',
            '              <p id="user-senha-hint" class="text-label-sm text-text-secondary">O colaborador usará esta senha no login com o e-mail institucional.</p>',
            '            </div>',
            '            <div class="flex flex-col gap-1.5" id="user-senha2-wrap">',
            '              <label class="text-label-md font-bold" for="user-senha2"><span id="user-senha2-label">Confirmar senha *</span></label>',
            '              <input id="user-senha2" type="password" autocomplete="new-password" class="px-4 py-2.5 rounded-lg border border-border-subtle text-body-md outline-none focus:ring-2 focus:ring-primary/15 focus:border-primary" placeholder="Repita a senha"/>',
            '            </div>',
            '          </div>',
            '        </div>',
            '        <div>',
            '          <p class="text-label-md font-bold mb-3">Redes Sociais</p>',
            '          <div class="grid grid-cols-1 md:grid-cols-3 gap-4">',
            '            <div class="flex flex-col gap-1.5">',
            '              <label class="text-label-sm text-text-secondary" for="user-instagram">Instagram</label>',
            '              <input id="user-instagram" class="px-4 py-2.5 rounded-lg border border-border-subtle text-body-md outline-none focus:ring-2 focus:ring-primary/15 focus:border-primary" placeholder="@usuario ou URL"/>',
            '            </div>',
            '            <div class="flex flex-col gap-1.5">',
            '              <label class="text-label-sm text-text-secondary" for="user-x">X</label>',
            '              <input id="user-x" class="px-4 py-2.5 rounded-lg border border-border-subtle text-body-md outline-none focus:ring-2 focus:ring-primary/15 focus:border-primary" placeholder="@usuario ou URL"/>',
            '            </div>',
            '            <div class="flex flex-col gap-1.5">',
            '              <label class="text-label-sm text-text-secondary" for="user-facebook">Facebook</label>',
            '              <input id="user-facebook" class="px-4 py-2.5 rounded-lg border border-border-subtle text-body-md outline-none focus:ring-2 focus:ring-primary/15 focus:border-primary" placeholder="URL ou perfil"/>',
            '            </div>',
            '          </div>',
            '        </div>',
            '        <div class="flex flex-col gap-1.5">',
            '          <label class="text-label-md font-bold" for="user-lattes">Currículo Lattes (link)</label>',
            '          <input id="user-lattes" type="url" class="px-4 py-2.5 rounded-lg border border-border-subtle text-body-md outline-none focus:ring-2 focus:ring-primary/15 focus:border-primary" placeholder="https://lattes.cnpq.br/..."/>',
            '        </div>',
            '        <div class="flex flex-col gap-1.5">',
            '          <label class="text-label-md font-bold" for="user-bio">Bio — mensagem para quem visita o perfil</label>',
            '          <textarea id="user-bio" rows="4" class="px-4 py-2.5 rounded-lg border border-border-subtle text-body-md outline-none focus:ring-2 focus:ring-primary/15 focus:border-primary resize-y" placeholder="Escreva uma mensagem de apresentação..."></textarea>',
            '        </div>',
            '        <div class="flex flex-col sm:flex-row justify-end gap-3 pt-2 border-t border-border-subtle">',
            '          <button type="button" data-user-close class="px-5 py-2.5 rounded-lg border border-border-subtle font-bold text-label-md hover:bg-surface-container-low">Cancelar</button>',
            '          <button type="submit" class="px-5 py-2.5 rounded-lg bg-primary text-white font-bold text-label-md hover:brightness-95 shadow-sm">Salvar Usuário</button>',
            '        </div>',
            '      </form>',
            '    </div>',
            '  </div>',
            '</div>'
        ].join('');
        document.body.appendChild(wrap.firstElementChild);

        var sel = document.getElementById('user-funcao');
        FUNCOES.forEach(function (f) {
            var opt = document.createElement('option');
            opt.value = f;
            opt.textContent = f;
            sel.appendChild(opt);
        });

        document.querySelectorAll('[data-user-close]').forEach(function (el) {
            el.addEventListener('click', closeModal);
        });
        document.getElementById('user-form').addEventListener('submit', onSubmit);
        document.getElementById('user-telefone').addEventListener('input', function () {
            formatPhone(this);
        });
        document.getElementById('user-photo-upload').addEventListener('click', function () {
            document.getElementById('user-photo-file').click();
        });
        document.getElementById('user-photo-file').addEventListener('change', onFilePick);
        document.getElementById('user-photo-camera').addEventListener('click', startCamera);
        document.getElementById('user-camera-capture').addEventListener('click', capturePhoto);
        document.getElementById('user-camera-cancel').addEventListener('click', stopCamera);
        document.getElementById('user-photo-clear').addEventListener('click', clearPhoto);
        document.getElementById('user-nome').addEventListener('input', function () {
            if (!pendingPhoto) {
                document.getElementById('user-photo-initials').textContent = initials(this.value);
            }
        });
    }

    function setPhotoPreview(dataUrl, markTouched) {
        if (markTouched) photoTouched = true;
        pendingPhoto = dataUrl || '';
        var img = document.getElementById('user-photo-preview');
        var ini = document.getElementById('user-photo-initials');
        if (pendingPhoto) {
            img.src = pendingPhoto;
            img.classList.remove('hidden');
            ini.classList.add('hidden');
        } else {
            img.classList.add('hidden');
            img.removeAttribute('src');
            ini.classList.remove('hidden');
            ini.textContent = initials(document.getElementById('user-nome').value);
        }
    }

    /** Redimensiona e comprime para JPEG leve (adequado a gravar em avatar_url no banco) */
    function compressToAvatar(source, onDone, onError) {
        function fail(msg) {
            if (typeof onError === 'function') onError(msg || 'Não foi possível processar a foto.');
            else toast(msg || 'Não foi possível processar a foto.', 'error');
        }

        function drawAndEncode(imgW, imgH, drawFn) {
            var scale = Math.min(1, AVATAR_MAX_SIDE / Math.max(imgW, imgH));
            var w = Math.max(1, Math.round(imgW * scale));
            var h = Math.max(1, Math.round(imgH * scale));
            var canvas = document.createElement('canvas');
            canvas.width = w;
            canvas.height = h;
            var ctx = canvas.getContext('2d');
            if (!ctx) {
                fail('Canvas indisponível neste navegador.');
                return;
            }
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, w, h);
            drawFn(ctx, w, h);

            var quality = AVATAR_JPEG_QUALITY;
            var dataUrl = canvas.toDataURL('image/jpeg', quality);
            // Se ainda grande, reduz qualidade gradualmente
            while (dataUrl.length > AVATAR_MAX_DATA_URL && quality > 0.45) {
                quality -= 0.08;
                dataUrl = canvas.toDataURL('image/jpeg', quality);
            }
            if (dataUrl.length > AVATAR_MAX_DATA_URL) {
                fail('A foto ficou muito pesada mesmo após otimizar. Tente outra imagem.');
                return;
            }
            onDone(dataUrl);
        }

        if (!source) {
            fail('Nenhuma imagem selecionada.');
            return;
        }

        if (source instanceof HTMLVideoElement) {
            if (!source.videoWidth) {
                fail('Aguarde a câmera iniciar.');
                return;
            }
            drawAndEncode(source.videoWidth, source.videoHeight, function (ctx, w, h) {
                ctx.drawImage(source, 0, 0, w, h);
            });
            return;
        }

        var url = '';
        var revoke = false;
        if (typeof source === 'string') {
            url = source;
        } else if (source instanceof Blob) {
            url = URL.createObjectURL(source);
            revoke = true;
        } else {
            fail('Formato de imagem não suportado.');
            return;
        }

        var img = new Image();
        img.onload = function () {
            try {
                drawAndEncode(img.naturalWidth || img.width, img.naturalHeight || img.height, function (ctx, w, h) {
                    ctx.drawImage(img, 0, 0, w, h);
                });
            } finally {
                if (revoke) URL.revokeObjectURL(url);
            }
        };
        img.onerror = function () {
            if (revoke) URL.revokeObjectURL(url);
            fail('Não foi possível ler a imagem.');
        };
        img.src = url;
    }

    function clearPhoto() {
        stopCamera();
        setPhotoPreview('', true);
        var file = document.getElementById('user-photo-file');
        if (file) file.value = '';
    }

    function onFilePick(e) {
        var file = e.target.files && e.target.files[0];
        if (!file) return;
        if (!/^image\/(jpeg|png|jpg|webp)$/i.test(file.type)) {
            toast('Use JPG, PNG ou WEBP.', 'error');
            return;
        }
        if (file.size > 8 * 1024 * 1024) {
            toast('Arquivo original muito grande (máx. 8MB). Escolha outra foto.', 'error');
            return;
        }
        compressToAvatar(file, function (dataUrl) {
            setPhotoPreview(dataUrl, true);
            stopCamera();
            toast('Foto otimizada e pronta para salvar.');
        });
    }

    function startCamera() {
        var box = document.getElementById('user-camera-box');
        var video = document.getElementById('user-camera-video');
        if (typeof requestCameraStream !== 'function') {
            toast('Módulo de câmera indisponível.', 'error');
            return;
        }
        stopCamera();
        requestCameraStream()
            .then(function (stream) {
                cameraStream = stream;
                if (video) {
                    video.setAttribute('playsinline', 'true');
                    video.setAttribute('autoplay', 'true');
                    video.muted = true;
                    video.srcObject = stream;
                    var playPromise = video.play();
                    if (playPromise && typeof playPromise.catch === 'function') {
                        playPromise.catch(function () { /* ignore */ });
                    }
                }
                if (box) box.classList.remove('hidden');
            })
            .catch(function (err) {
                toast((typeof cameraErrorMessage === 'function' ? cameraErrorMessage(err) : null) ||
                    'Não foi possível acessar a câmera.', 'error');
            });
    }

    function stopCamera() {
        var box = document.getElementById('user-camera-box');
        var video = document.getElementById('user-camera-video');
        if (cameraStream) {
            cameraStream.getTracks().forEach(function (t) { t.stop(); });
            cameraStream = null;
        }
        if (video) video.srcObject = null;
        if (box) box.classList.add('hidden');
    }

    function capturePhoto() {
        var video = document.getElementById('user-camera-video');
        if (!video || !video.videoWidth) {
            toast('Aguarde a câmera iniciar.', 'error');
            return;
        }
        compressToAvatar(video, function (dataUrl) {
            setPhotoPreview(dataUrl, true);
            stopCamera();
            toast('Foto capturada e otimizada!');
        });
    }

    function openModal(user) {
        ensureModal();
        editingId = user ? user.id : null;
        document.getElementById('user-modal-title').textContent = user ? 'Editar Usuário' : 'Novo Usuário';
        document.getElementById('user-nome').value = user ? (user.nome || '') : '';
        document.getElementById('user-funcao').value = user && FUNCOES.indexOf(user.cargo || user.funcao || '') >= 0
            ? (user.cargo || user.funcao)
            : FUNCOES[0];
        document.getElementById('user-matricula').value = user ? (user.matriculaSemVinculo || user.matricula || '') : '';
        document.getElementById('user-email').value = user ? (user.email || '') : '';
        document.getElementById('user-disciplina').value = user ? (user.disciplinaPrincipal || '') : '';
        document.getElementById('user-telefone').value = user ? (user.telefone || '') : '';
        document.getElementById('user-instagram').value = user && user.redes ? (user.redes.instagram || '') : '';
        document.getElementById('user-x').value = user && user.redes ? (user.redes.x || '') : '';
        document.getElementById('user-facebook').value = user && user.redes ? (user.redes.facebook || '') : '';
        document.getElementById('user-lattes').value = user ? (user.lattes || '') : '';
        document.getElementById('user-bio').value = user ? (user.bio || '') : '';
        setPhotoPreview(user ? (user.avatar || '') : '', false);
        photoTouched = false;

        var senha = document.getElementById('user-senha');
        var senha2 = document.getElementById('user-senha2');
        var senhaLabel = document.getElementById('user-senha-label');
        var senha2Label = document.getElementById('user-senha2-label');
        var senhaHint = document.getElementById('user-senha-hint');
        if (senha) senha.value = '';
        if (senha2) senha2.value = '';
        if (user) {
            if (senha) senha.required = false;
            if (senha2) senha2.required = false;
            if (senhaLabel) senhaLabel.textContent = 'Nova senha (opcional)';
            if (senha2Label) senha2Label.textContent = 'Confirmar nova senha';
            if (senhaHint) {
                senhaHint.textContent = user.senha
                    ? 'Deixe em branco para manter a senha atual. Preencha só se quiser trocar.'
                    : 'Este usuário ainda não tem senha. Defina uma agora para liberar o login.';
            }
            if (senha && !user.senha) senha.required = true;
            if (senha2 && !user.senha) senha2.required = true;
        } else {
            if (senha) senha.required = true;
            if (senha2) senha2.required = true;
            if (senhaLabel) senhaLabel.textContent = 'Senha de acesso *';
            if (senha2Label) senha2Label.textContent = 'Confirmar senha *';
            if (senhaHint) {
                senhaHint.textContent = 'O colaborador usará esta senha no login com o e-mail institucional.';
            }
        }

        document.getElementById('user-modal').classList.remove('hidden');
        document.body.style.overflow = 'hidden';
    }

    function closeModal() {
        stopCamera();
        var modal = document.getElementById('user-modal');
        if (modal) modal.classList.add('hidden');
        document.body.style.overflow = '';
        editingId = null;
        pendingPhoto = '';
        photoTouched = false;
    }

    function applyAvatarToSystem(user) {
        if (!user) return;
        try {
            var session = JSON.parse(localStorage.getItem('siga_session') || 'null');
            var email = session && session.email ? normEmail(session.email) : '';
            if (email && email === normEmail(user.email)) {
                if (typeof writeStoredProfileAvatar === 'function') {
                    writeStoredProfileAvatar(session, user.avatar || '');
                } else {
                    try { localStorage.removeItem('siga_profile_avatar'); } catch (e0) { /* ignore */ }
                }
                if (user.nome) localStorage.setItem('siga_profile_name', user.nome);
                if (user.cargo) localStorage.setItem('siga_profile_role', user.cargo);
                if (user.bio != null) localStorage.setItem('siga_profile_bio', user.bio || '');
                if (user.telefone != null) localStorage.setItem('siga_profile_phone', user.telefone || '');
                if (user.email) localStorage.setItem('siga_profile_email', user.email);
                if (typeof syncProfile === 'function') syncProfile();
            }
        } catch (e) { /* ignore */ }
    }

    function onSubmit(e) {
        e.preventDefault();
        var nome = document.getElementById('user-nome').value.trim();
        var funcao = document.getElementById('user-funcao').value;
        var matricula = document.getElementById('user-matricula').value.trim();
        var email = normEmail(document.getElementById('user-email').value);
        var disciplina = document.getElementById('user-disciplina').value.trim();
        var telefone = document.getElementById('user-telefone').value.trim();
        var instagram = document.getElementById('user-instagram').value.trim();
        var x = document.getElementById('user-x').value.trim();
        var facebook = document.getElementById('user-facebook').value.trim();
        var lattes = document.getElementById('user-lattes').value.trim();
        var bio = document.getElementById('user-bio').value.trim();
        var senha = String((document.getElementById('user-senha') || {}).value || '');
        var senha2 = String((document.getElementById('user-senha2') || {}).value || '');

        if (!nome || !funcao || !matricula || !email) {
            toast('Preencha os campos obrigatórios.', 'error');
            return;
        }
        if (!email.endsWith(DOMAIN_SERVIDOR)) {
            toast('Use e-mail institucional (@escola.seduc.pa.gov.br).', 'error');
            return;
        }
        if (lattes && !/^https?:\/\//i.test(lattes)) {
            toast('Informe um link válido do Currículo Lattes (http/https).', 'error');
            return;
        }

        var list = getUsers();
        var prev = editingId
            ? (list.find(function (u) { return String(u.id) === String(editingId); }) || {})
            : {};
        var precisaSenhaAgora = !editingId || !prev.senha;

        if (precisaSenhaAgora || senha || senha2) {
            if (senha.length < 6) {
                toast('A senha deve ter pelo menos 6 caracteres.', 'error');
                return;
            }
            if (senha !== senha2) {
                toast('As senhas não coincidem.', 'error');
                return;
            }
        }

        var dupEmail = list.find(function (u) {
            return normEmail(u.email) === email && String(u.id) !== String(editingId || '');
        });
        if (dupEmail) {
            toast('Já existe um usuário com este e-mail.', 'error');
            return;
        }
        var dupMat = list.find(function (u) {
            return String(u.matriculaSemVinculo || u.matricula || '') === matricula &&
                String(u.id) !== String(editingId || '');
        });
        if (dupMat) {
            toast('Já existe um usuário com esta matrícula.', 'error');
            return;
        }

        function persist(hashedSenha) {
            var payload = {
                id: editingId || uid(),
                nome: nome,
                cargo: funcao,
                funcao: funcao,
                matriculaSemVinculo: matricula,
                email: email,
                disciplinaPrincipal: disciplina,
                telefone: telefone,
                redes: { instagram: instagram, x: x, facebook: facebook },
                lattes: lattes,
                bio: bio,
                avatar: photoTouched ? (pendingPhoto || '') : (pendingPhoto || prev.avatar || ''),
                status: prev.status || 'Ativo',
                lastAccess: editingId ? (prev.lastAccess || '—') : 'Nunca',
                precisaDefinirSenha: false,
                updatedAt: new Date().toISOString()
            };

            if (hashedSenha) {
                payload.senha = hashedSenha;
                payload.precisaDefinirSenha = false;
            } else if (editingId) {
                payload.senha = prev.senha || '';
                payload.precisaDefinirSenha = !payload.senha;
            } else {
                payload.senha = '';
                payload.precisaDefinirSenha = true;
            }

            if (editingId) {
                payload.cpf = prev.cpf || '';
                payload.dataNascimento = prev.dataNascimento || '';
                list = list.map(function (u) {
                    return String(u.id) === String(editingId) ? Object.assign({}, prev, payload) : u;
                });
            } else {
                payload.createdAt = new Date().toISOString();
                list.push(payload);
            }

            saveUsers(list);
            applyAvatarToSystem(payload);

            function finishLocalOnly(extraMsg) {
                closeModal();
                render();
                toast(extraMsg || (editingId
                    ? (hashedSenha ? 'Usuário e senha atualizados (somente local).' : 'Usuário atualizado (somente local).')
                    : 'Usuário cadastrado localmente. Não gravou no banco.'));
            }

            var staffApi = window.SigaStaffData;
            if (!staffApi || typeof staffApi.upsertStaff !== 'function') {
                finishLocalOnly('Usuário salvo só no navegador (módulo cloud indisponível).');
                return;
            }

            toast('Gravando usuário no banco…');
            staffApi.upsertStaff(payload, {
                plainPassword: senha || null
            }).then(function (cloud) {
                closeModal();
                render();
                if (cloud && cloud.ok) {
                    var authOk = !cloud.auth || cloud.auth.skipped || cloud.auth.ok !== false;
                    toast(
                        authOk
                            ? (editingId ? 'Usuário atualizado no banco!' : 'Usuário cadastrado no banco com acesso de login!')
                            : ((cloud.message || 'Salvo no banco.') + ' Confira o Auth no Supabase se o login falhar.')
                    );
                } else {
                    toast(
                        'Salvo localmente. Banco: ' + ((cloud && cloud.message) || 'falha (escola ativa + login Supabase).'),
                        'error'
                    );
                }
            }).catch(function () {
                finishLocalOnly('Salvo localmente. Falha ao falar com o banco.');
            });
        }

        if (senha) {
            var sec = window.SigaSecurity;
            if (sec && typeof sec.hashPassword === 'function') {
                sec.hashPassword(senha).then(function (hashed) {
                    persist(hashed);
                }).catch(function () {
                    toast('Não foi possível proteger a senha. Tente novamente.', 'error');
                });
                return;
            }
            // Fallback sem SigaSecurity (não ideal)
            persist(senha);
            return;
        }

        persist(null);
    }

    function removeUser(id) {
        if (!confirm('Excluir este usuário?')) return;
        var list = getUsers().filter(function (u) { return String(u.id) !== String(id); });
        saveUsers(list);
        render();

        var staffApi = window.SigaStaffData;
        var isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(id || ''));
        if (staffApi && isUuid && typeof staffApi.deleteStaff === 'function') {
            staffApi.deleteStaff(id).then(function (res) {
                if (res && res.ok) toast('Usuário removido do banco.', 'error');
                else toast('Removido localmente. Banco: ' + ((res && res.message) || 'não sincronizado'), 'error');
            });
        } else {
            toast('Usuário removido.', 'error');
        }
    }

    function filteredUsers() {
        var q = (filterFn || '').toLowerCase().trim();
        return getUsers().filter(function (u) {
            if (!q) return true;
            var blob = [u.nome, u.email, u.cargo, u.funcao, u.matriculaSemVinculo, u.disciplinaPrincipal]
                .join(' ').toLowerCase();
            return blob.indexOf(q) >= 0;
        });
    }

    function countBy(pred) {
        return getUsers().filter(pred).length;
    }

    function renderStats() {
        var total = getUsers().length;
        var professors = countBy(function (u) { return /Professor/i.test(u.cargo || u.funcao || ''); });
        var admin = countBy(function (u) {
            return /Diretor|Vice|Coordenador|Secretario|Administrador/i.test(u.cargo || u.funcao || '');
        });
        var elTotal = document.getElementById('stat-users-total');
        var elProf = document.getElementById('stat-users-prof');
        var elAdmin = document.getElementById('stat-users-admin');
        var elActive = document.getElementById('stat-users-active');
        if (elTotal) elTotal.textContent = String(total);
        if (elProf) elProf.textContent = String(professors);
        if (elAdmin) elAdmin.textContent = String(admin);
        if (elActive) elActive.textContent = String(countBy(function (u) { return (u.status || 'Ativo') === 'Ativo'; }));
        var pager = document.getElementById('users-pager-label');
        if (pager) {
            var shown = filteredUsers().length;
            pager.innerHTML = 'Exibindo <span class="font-bold text-on-surface">' + shown +
                '</span> de <span class="font-bold text-on-surface">' + total + '</span> usuários';
        }
    }

    function renderTable() {
        var body = document.getElementById('user-table-body');
        if (!body) return;
        var users = filteredUsers();
        if (!users.length) {
            body.innerHTML = '<tr><td colspan="6" class="px-6 py-12 text-center text-text-secondary">Nenhum usuário cadastrado. Clique em <strong>Novo Usuário</strong> para começar.</td></tr>';
            return;
        }
        body.innerHTML = users.map(function (u) {
            var role = u.cargo || u.funcao || '—';
            var avatarHtml = u.avatar
                ? '<img src="' + u.avatar + '" alt="" class="w-10 h-10 rounded-full border border-border-subtle object-cover"/>'
                : '<div class="w-10 h-10 rounded-full bg-primary-container text-white font-bold text-xs flex items-center justify-center">' +
                    initials(u.nome) + '</div>';
            return [
                '<tr class="user-table-row transition-colors group">',
                '  <td class="px-6 py-4"><div class="flex items-center gap-3">',
                avatarHtml,
                '    <div><p class="font-bold text-on-surface">' + escapeHtml(u.nome || '—') + '</p>',
                '    <p class="text-label-sm text-text-secondary">Mat. ' + escapeHtml(u.matriculaSemVinculo || '—') + '</p></div>',
                '  </div></td>',
                '  <td class="px-6 py-4 text-text-secondary">' + escapeHtml(u.email || '—') + '</td>',
                '  <td class="px-6 py-4"><span class="px-2 py-1 rounded-full text-label-sm font-bold ' + roleBadgeClass(role) + '">' + escapeHtml(role) + '</span></td>',
                '  <td class="px-6 py-4 text-text-secondary">' + escapeHtml(u.lastAccess || '—') + '</td>',
                '  <td class="px-6 py-4"><div class="flex items-center gap-2">',
                '    <span class="w-2 h-2 rounded-full bg-primary"></span>',
                '    <span class="text-body-md text-on-surface font-semibold">' + escapeHtml(u.status || 'Ativo') + '</span>',
                '  </div></td>',
                '  <td class="px-6 py-4 text-right">',
                '    <button type="button" class="p-2 hover:bg-surface-container-high rounded-full text-text-secondary hover:text-primary" data-edit="' + escapeAttr(u.id) + '"><span class="material-symbols-outlined">edit</span></button>',
                '    <button type="button" class="p-2 hover:bg-surface-container-high rounded-full text-text-secondary hover:text-error" data-del="' + escapeAttr(u.id) + '"><span class="material-symbols-outlined">delete</span></button>',
                '  </td>',
                '</tr>'
            ].join('');
        }).join('');

        body.querySelectorAll('[data-edit]').forEach(function (btn) {
            btn.addEventListener('click', function () {
                var id = btn.getAttribute('data-edit');
                var user = getUsers().find(function (u) { return String(u.id) === String(id); });
                if (user) openModal(user);
            });
        });
        body.querySelectorAll('[data-del]').forEach(function (btn) {
            btn.addEventListener('click', function () {
                removeUser(btn.getAttribute('data-del'));
            });
        });
    }

    function escapeHtml(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function escapeAttr(s) {
        return escapeHtml(s).replace(/'/g, '&#39;');
    }

    function sleep(ms) {
        return new Promise(function (resolve) { setTimeout(resolve, ms); });
    }

    function normalizeHeader(h) {
        return String(h || '')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, ' ')
            .trim();
    }

    function pickCol(headers, candidates) {
        for (var i = 0; i < headers.length; i++) {
            var h = normalizeHeader(headers[i]);
            for (var c = 0; c < candidates.length; c++) {
                if (h === candidates[c] || h.indexOf(candidates[c]) >= 0) return i;
            }
        }
        return -1;
    }

    function parseProfessorSheetRows(matrix) {
        if (!matrix || !matrix.length) return [];
        var headers = (matrix[0] || []).map(function (h) { return h == null ? '' : String(h); });
        var idxNome = pickCol(headers, ['professor', 'nome']);
        var idxEmail = pickCol(headers, ['e mail institucional', 'email institucional', 'e mail', 'email']);
        var idxSenha = pickCol(headers, ['senha padrao', 'senha']);
        var idxMat = pickCol(headers, ['matricula', 'matricula']);
        if (idxNome < 0 || idxEmail < 0) {
            throw new Error('Planilha precisa das colunas Professor e E-mail Institucional.');
        }
        var out = [];
        for (var r = 1; r < matrix.length; r++) {
            var row = matrix[r] || [];
            var nome = String(row[idxNome] == null ? '' : row[idxNome]).trim();
            var email = normEmail(row[idxEmail]);
            var senha = String(idxSenha >= 0 && row[idxSenha] != null ? row[idxSenha] : '').trim();
            var matricula = String(idxMat >= 0 && row[idxMat] != null ? row[idxMat] : '').trim();
            if (!matricula && senha) matricula = senha;
            if (!nome && !email) continue;
            if (!nome || !email || !senha || !matricula) continue;
            if (senha.length < 6) continue;
            out.push({ nome: nome, email: email, senha: senha, matricula: matricula });
        }
        return out;
    }

    function readSpreadsheetFile(file) {
        return new Promise(function (resolve, reject) {
            var reader = new FileReader();
            var name = String(file.name || '').toLowerCase();
            reader.onerror = function () { reject(new Error('Falha ao ler o arquivo.')); };
            reader.onload = function (ev) {
                try {
                    if (name.endsWith('.csv')) {
                        var text = String(ev.target.result || '');
                        var lines = text.split(/\r?\n/).filter(function (l) { return l.trim(); });
                        var matrix = lines.map(function (line) {
                            // CSV simples (vírgula ou ponto-e-vírgula)
                            var sep = line.indexOf(';') >= 0 ? ';' : ',';
                            return line.split(sep).map(function (c) {
                                return c.replace(/^"|"$/g, '').trim();
                            });
                        });
                        resolve(matrix);
                        return;
                    }
                    if (!window.XLSX) {
                        reject(new Error('Biblioteca XLSX não carregou. Recarregue a página.'));
                        return;
                    }
                    var data = new Uint8Array(ev.target.result);
                    var wb = window.XLSX.read(data, { type: 'array' });
                    var sheet = wb.Sheets[wb.SheetNames[0]];
                    var matrix = window.XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
                    resolve(matrix);
                } catch (err) {
                    reject(err);
                }
            };
            if (name.endsWith('.csv')) reader.readAsText(file, 'UTF-8');
            else reader.readAsArrayBuffer(file);
        });
    }

    function importProfessoresFromRows(rows) {
        var staffApi = window.SigaStaffData;
        var sec = window.SigaSecurity;
        if (!staffApi || typeof staffApi.upsertStaff !== 'function') {
            toast('Módulo cloud indisponível. Entre na escola pelo Painel Admin.', 'error');
            return Promise.resolve();
        }
        if (!sec || typeof sec.hashPassword !== 'function') {
            toast('Módulo de segurança indisponível.', 'error');
            return Promise.resolve();
        }

        var ready = staffApi.cloudReady ? staffApi.cloudReady() : { ok: true };
        if (ready && ready.ok === false) {
            toast(ready.message || 'Escola ativa necessária para importar.', 'error');
            return Promise.resolve();
        }

        var ok = 0;
        var fail = 0;
        var skip = 0;
        var errors = [];
        var existing = getUsers();

        toast('Importando ' + rows.length + ' professor(es)… não feche a página.');

        return rows.reduce(function (chain, row, idx) {
            return chain.then(function () {
                var already = existing.some(function (u) {
                    return normEmail(u.email) === row.email;
                });
                if (already) {
                    skip += 1;
                    return sleep(50);
                }

                return sec.hashPassword(row.senha).then(function (hashed) {
                    var payload = {
                        id: uid(),
                        nome: row.nome.toUpperCase(),
                        cargo: 'Professor(a)',
                        funcao: 'Professor(a)',
                        matriculaSemVinculo: row.matricula,
                        email: row.email,
                        disciplinaPrincipal: '',
                        telefone: '',
                        redes: {},
                        lattes: '',
                        bio: '',
                        avatar: '',
                        status: 'Ativo',
                        lastAccess: 'Nunca',
                        senha: hashed,
                        precisaDefinirSenha: false,
                        createdAt: new Date().toISOString(),
                        updatedAt: new Date().toISOString()
                    };

                    return staffApi.upsertStaff(payload, { plainPassword: row.senha }).then(function (cloud) {
                        if (cloud && cloud.ok) {
                            ok += 1;
                            existing.push(Object.assign({}, payload, cloud.data || {}));
                            saveUsers(existing);
                        } else {
                            fail += 1;
                            errors.push(row.email + ': ' + ((cloud && cloud.message) || 'falha'));
                        }
                    });
                }).catch(function (err) {
                    fail += 1;
                    errors.push(row.email + ': ' + ((err && err.message) || 'erro'));
                }).then(function () {
                    if ((idx + 1) % 5 === 0 || idx === rows.length - 1) {
                        toast('Progresso: ' + (idx + 1) + '/' + rows.length + ' (ok ' + ok + ', falha ' + fail + ', skip ' + skip + ')');
                    }
                    return sleep(350);
                });
            });
        }, Promise.resolve()).then(function () {
            render();
            var msg = 'Importação concluída: ' + ok + ' criados, ' + skip + ' já existiam, ' + fail + ' falhas.';
            if (errors.length) {
                console.warn('[SIGA] import professores:', errors);
                msg += ' Veja o console (F12) para detalhes.';
            }
            toast(msg, fail ? 'error' : 'success');
        });
    }

    function handleImportProfessoresFile(file) {
        if (!file) return;
        readSpreadsheetFile(file).then(function (matrix) {
            var rows = parseProfessorSheetRows(matrix);
            if (!rows.length) {
                toast('Nenhuma linha válida. Use: Professor | E-mail Institucional | Senha padrão.', 'error');
                return;
            }
            if (!confirm('Importar ' + rows.length + ' professor(es) como Usuário → Professor(a)?\n\nSerão criados no banco + Auth com a senha da planilha.\nDemais dados ficam para o professor completar no Meu Perfil.')) {
                return;
            }
            return importProfessoresFromRows(rows);
        }).catch(function (err) {
            toast((err && err.message) || 'Falha ao ler a planilha.', 'error');
        });
    }

    function render() {
        renderStats();
        renderTable();
    }

    function init() {
        if (!/usuarios\.html/i.test(window.location.pathname + window.location.href)) return;
        ensureModal();
        render();

        var btnNew = document.getElementById('btn-novo-usuario');
        if (btnNew) btnNew.addEventListener('click', function () { openModal(null); });

        var btnImport = document.getElementById('btn-importar-professores');
        var inputImport = document.getElementById('input-importar-professores');
        if (btnImport && inputImport) {
            btnImport.addEventListener('click', function () { inputImport.click(); });
            inputImport.addEventListener('change', function () {
                var file = inputImport.files && inputImport.files[0];
                inputImport.value = '';
                handleImportProfessoresFile(file);
            });
        }

        var search = document.getElementById('users-search');
        if (search) {
            search.addEventListener('input', function () {
                filterFn = search.value;
                render();
            });
        }

        var filterBtn = document.getElementById('btn-filtrar-usuarios');
        if (filterBtn) {
            filterBtn.addEventListener('click', function () {
                var q = prompt('Filtrar por nome, e-mail, função ou matrícula:', filterFn || '');
                if (q === null) return;
                filterFn = q;
                if (search) search.value = q;
                render();
            });
        }

        if (window.SigaStaffData && typeof window.SigaStaffData.hydrateStaff === 'function') {
            window.SigaStaffData.hydrateStaff().then(function (res) {
                if (res && res.ok && !res.skipped) render();
                else if (res && res.message && !res.skipped) console.warn('[SIGA] usuários:', res.message);
            });
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    window.initUsuariosPage = init;
    window.openNovoUsuarioModal = function () { ensureModal(); openModal(null); };
})();
