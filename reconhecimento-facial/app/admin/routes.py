# app/admin/routes.py

from datetime import datetime, timedelta

import json
import re
from pathlib import Path
from uuid import uuid4

from flask import (
    current_app,
    flash,
    jsonify,
    redirect,
    render_template,
    request,
    session,
    url_for,
)
from PIL import Image, UnidentifiedImageError

from app.admin import bp
from app.admin.auth import admin_login_required, is_safe_redirect_target
from app.models import Ponto, User, db
from app.punch.recognition import (
    assess_face_framing,
    encode_face_from_bytes,
    invalidate_known_faces_cache,
)

ALLOWED_EXTENSIONS = {"png", "jpg", "jpeg"}
ALLOWED_IMAGE_FORMATS = {"JPEG": ".jpg", "PNG": ".png"}


def allowed_file(filename):
    return (
        "." in filename
        and filename.rsplit(".", 1)[1].lower() in ALLOWED_EXTENSIONS
    )


def validated_image_extension(file_storage):
    """Confirma que o conteúdo enviado é uma imagem JPEG ou PNG válida."""
    try:
        image = Image.open(file_storage.stream)
        image.verify()
        extension = ALLOWED_IMAGE_FORMATS.get(image.format)
    except (UnidentifiedImageError, OSError, ValueError):
        extension = None
    finally:
        file_storage.stream.seek(0)

    return extension


def unique_upload_name(extension):
    return f"{uuid4().hex}{extension}"


@bp.route("/login", methods=["GET", "POST"])
def login():
    next_url = request.values.get("next", "")

    if request.method == "POST":
        username = request.form.get("username", "").strip()
        password = request.form.get("password", "")
        user = User.query.filter_by(username=username).first()

        if user is None or user.role != "admin" or not user.check_password(password):
            flash("Credenciais administrativas inválidas.", "error")
            return render_template("admin/login.html", next_url=next_url), 401

        session.clear()
        session["admin_user_id"] = user.id

        if next_url and is_safe_redirect_target(next_url):
            return redirect(next_url)
        return redirect(url_for("admin.dashboard"))

    return render_template("admin/login.html", next_url=next_url)


@bp.route("/")
@bp.route("/dashboard")
@admin_login_required
def dashboard():
    return render_template("admin/dashboard.html", active_nav="dashboard")


@bp.route("/turmas")
@admin_login_required
def turmas():
    """Acompanha turmas do SIGA + entradas/saídas do reconhecimento facial."""
    return render_template("admin/turmas.html", active_nav="turmas")


@bp.route("/logout", methods=["POST"])
@admin_login_required
def logout():
    session.clear()
    flash("Sessão administrativa encerrada.", "success")
    return redirect(url_for("admin.login"))


def _slug_username(value: str) -> str:
    cleaned = re.sub(r"[^a-zA-Z0-9._-]+", ".", (value or "").strip().lower())
    cleaned = cleaned.strip(".")
    return cleaned or f"user{uuid4().hex[:8]}"


def _unique_username(base: str) -> str:
    candidate = _slug_username(base)
    if User.query.filter_by(username=candidate).first() is None:
        return candidate
    for _ in range(20):
        trial = f"{candidate}.{uuid4().hex[:4]}"
        if User.query.filter_by(username=trial).first() is None:
            return trial
    return f"user{uuid4().hex}"


def _serialize_user(user: User) -> dict:
    return {
        "id": user.id,
        "username": user.username,
        "name": user.name or user.username,
        "registration": user.registration or "",
        "schedule": user.schedule or "",
        "role": user.role or "",
        "person_kind": user.person_kind or "",
        "staff_role": user.staff_role or "",
        "class_code": user.class_code or "",
        "photo_url": user.photo_url or "",
        "has_face": bool(user.face_encoding),
    }


def _serialize_ponto_admin(ponto: Ponto) -> dict:
    user = ponto.user
    return {
        "id": ponto.id,
        "tipo": ponto.tipo,
        "timestamp": ponto.timestamp.isoformat(sep=" ", timespec="seconds")
        if ponto.timestamp
        else "",
        "user": _serialize_user(user) if user else None,
    }


@bp.route("/api/dashboard")
@admin_login_required
def api_dashboard():
    today = datetime.utcnow().date()
    start = datetime.combine(today, datetime.min.time())
    end = start + timedelta(days=1)

    users = User.query.filter((User.role != "admin") | (User.role.is_(None))).all()
    users = sorted(users, key=lambda u: ((u.name or u.username or "").lower()))

    registered = sum(1 for u in users if u.face_encoding)
    pontos_hoje = Ponto.query.filter(
        Ponto.timestamp >= start,
        Ponto.timestamp < end,
    ).all()
    entradas = sum(1 for p in pontos_hoje if p.tipo == "ENTRADA")
    saidas = sum(1 for p in pontos_hoje if p.tipo == "SAÍDA")
    recent = (
        Ponto.query.order_by(Ponto.timestamp.desc(), Ponto.id.desc())
        .limit(20)
        .all()
    )

    return jsonify(
        {
            "success": True,
            "stats": {
                "recognized_today": len(pontos_hoje),
                "entradas_today": entradas,
                "saidas_today": saidas,
                "registered_faces": registered,
                "total_people": len(users),
            },
            "users": [_serialize_user(u) for u in users],
            "recent": [_serialize_ponto_admin(p) for p in recent],
        }
    )


@bp.route("/api/enroll/guide", methods=["POST"])
@admin_login_required
def api_enroll_guide():
    """Avalia em tempo quase real se o rosto está pronto para cadastro."""
    image = request.files.get("image") or request.files.get("file")
    if image is None or not image.filename:
        raw = request.get_data(cache=False)
        if not raw:
            return jsonify(success=False, message="Nenhuma imagem recebida."), 400
        image_bytes = raw
    else:
        image_bytes = image.read()
        if not image_bytes:
            return jsonify(success=False, message="Nenhuma imagem recebida."), 400

    try:
        assessment = assess_face_framing(image_bytes, max_side=320, upsample=1)
    except (OSError, ValueError):
        return (
            jsonify(success=False, message="Não foi possível analisar o quadro."),
            400,
        )

    return jsonify(success=True, **assessment)


@bp.route("/api/siga/students", methods=["GET"])
@admin_login_required
def api_siga_students():
    """Lista alunos já cadastrados no SIGA (Supabase) para vincular a foto facial."""
    from app.sync.supabase_attendance import client_from_app

    client = client_from_app()
    if not client.configured():
        return jsonify(
            success=False,
            configured=False,
            message="Configure SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY e SUPABASE_SCHOOL_ID.",
            students=[],
        ), 200

    q = (request.args.get("q") or "").strip()
    class_code = (request.args.get("class_code") or "").strip()
    try:
        students = client.list_students(class_code=class_code, q=q, limit=80)
    except Exception as exc:  # noqa: BLE001
        return jsonify(success=False, configured=True, message=str(exc), students=[]), 502

    # Marca quem já tem face local (mesmo INEP).
    local_regs = {
        (u.registration or "").strip()
        for u in User.query.filter(User.registration.isnot(None)).all()
        if (u.registration or "").strip() and u.face_encoding
    }
    payload = []
    for s in students:
        inep = (s.get("codigo_inep") or "").strip()
        payload.append(
            {
                "id": s.get("id"),
                "full_name": s.get("full_name") or "",
                "class_code": s.get("class_code") or "",
                "codigo_inep": inep,
                "status": s.get("status") or "",
                "has_local_face": inep in local_regs,
            }
        )
    return jsonify(success=True, configured=True, students=payload)


@bp.route("/api/siga/classes", methods=["GET"])
@admin_login_required
def api_siga_classes():
    """Turmas ativas do SIGA + resumo de faces locais e batidas de hoje."""
    from app.sync.supabase_attendance import client_from_app

    client = client_from_app()
    year = (request.args.get("year") or "2026").strip()
    source = "supabase"
    classes: list = []
    warn = ""

    if client.configured():
        try:
            classes = client.list_classes(year_label=year, limit=300)
        except Exception as exc:  # noqa: BLE001
            warn = str(exc)
            classes = []
            source = "cache"
    else:
        source = "cache"
        warn = (
            "SUPABASE_SERVICE_ROLE_KEY ainda não está no .env. "
            "Exibindo turmas em cache do SIGA. Cole a service_role para sincronizar ao vivo."
        )

    if not classes:
        cache_path = Path(current_app.root_path) / "instance" / "siga_classes_cache.json"
        if cache_path.is_file():
            try:
                cached = json.loads(cache_path.read_text(encoding="utf-8"))
                classes = cached.get("classes") or []
                source = "cache"
            except (OSError, json.JSONDecodeError):
                classes = []

    if not classes and not client.configured():
        return jsonify(
            success=False,
            configured=False,
            message=warn
            or "Configure SUPABASE_SERVICE_ROLE_KEY no .env (Supabase → Settings → API).",
            classes=[],
            source=source,
        ), 200

    if not classes and warn:
        return jsonify(
            success=False,
            configured=True,
            message=warn,
            classes=[],
            source=source,
        ), 502

    today = datetime.utcnow().date()
    day_start = datetime.combine(today, datetime.min.time())
    day_end = day_start + timedelta(days=1)

    local_by_class: dict[str, list[User]] = {}
    for u in User.query.filter(User.face_encoding.isnot(None)).filter(User.face_encoding != "").all():
        code = (u.class_code or "").strip()
        if not code:
            continue
        local_by_class.setdefault(code, []).append(u)

    pontos_hoje = (
        Ponto.query.filter(Ponto.timestamp >= day_start, Ponto.timestamp < day_end)
        .order_by(Ponto.timestamp.desc())
        .all()
    )
    last_by_user: dict[int, Ponto] = {}
    entradas: set[int] = set()
    saidas: set[int] = set()
    for p in pontos_hoje:
        if p.user_id not in last_by_user:
            last_by_user[p.user_id] = p
        tipo = (p.tipo or "").upper()
        if tipo.startswith("SA"):
            saidas.add(p.user_id)
        else:
            entradas.add(p.user_id)

    payload = []
    for c in classes:
        code = (c.get("code") or "").strip()
        locals_u = local_by_class.get(code, [])
        local_ids = {u.id for u in locals_u}
        faces = len(locals_u)
        ent = len(local_ids & entradas)
        sai = len(local_ids & saidas)
        payload.append(
            {
                "id": c.get("id"),
                "code": code,
                "serie": c.get("serie") or "",
                "turno": c.get("turno") or "",
                "year_label": c.get("year_label") or year,
                "capacity": c.get("capacity") or 0,
                "faces_local": faces,
                "entradas_hoje": ent,
                "saidas_hoje": sai,
                "presentes_agora": sum(
                    1
                    for uid in local_ids
                    if uid in last_by_user
                    and not (last_by_user[uid].tipo or "").upper().startswith("SA")
                ),
            }
        )

    return jsonify(
        success=True,
        configured=client.configured(),
        source=source,
        warning=warn,
        day=today.isoformat(),
        school_id=current_app.config.get("SUPABASE_SCHOOL_ID") or "",
        classes=payload,
    )


@bp.route("/api/turmas/<path:class_code>/hoje", methods=["GET"])
@admin_login_required
def api_turma_hoje(class_code: str):
    """Alunos da turma (SIGA) + status facial/entrada/saída do dia."""
    from app.sync.supabase_attendance import client_from_app

    code = (class_code or "").strip()
    if not code:
        return jsonify(success=False, message="Informe o código da turma."), 400

    client = client_from_app()
    students: list = []
    source = "supabase"
    warning = ""

    if client.configured():
        try:
            students = client.list_students(class_code=code, limit=200)
        except Exception as exc:  # noqa: BLE001
            warning = str(exc)
            students = []
            source = "local"
    else:
        source = "local"
        warning = (
            "Sem SERVICE_ROLE no .env: mostrando só alunos com face local nesta turma. "
            "Cole a chave para ver a lista completa do SIGA."
        )

    today = datetime.utcnow().date()
    day_start = datetime.combine(today, datetime.min.time())
    day_end = day_start + timedelta(days=1)

    local_by_inep: dict[str, User] = {}
    local_in_class: list[User] = []
    for u in User.query.filter(User.registration.isnot(None)).all():
        reg = (u.registration or "").strip()
        if reg:
            local_by_inep[reg] = u
        if (u.class_code or "").strip() == code and u.face_encoding:
            local_in_class.append(u)

    if not students:
        # Fallback: faces locais desta turma
        students = [
            {
                "id": f"local-{u.id}",
                "full_name": u.name or u.username,
                "codigo_inep": (u.registration or "").strip(),
                "status": "Ativo",
            }
            for u in local_in_class
        ]
        source = "local"

    pontos = (
        Ponto.query.filter(Ponto.timestamp >= day_start, Ponto.timestamp < day_end)
        .order_by(Ponto.timestamp.asc())
        .all()
    )
    punches_by_user: dict[int, list[Ponto]] = {}
    for p in pontos:
        punches_by_user.setdefault(p.user_id, []).append(p)

    rows = []
    for s in students:
        inep = (s.get("codigo_inep") or "").strip()
        local = local_by_inep.get(inep)
        entrada_at = None
        saida_at = None
        last_tipo = None
        if local:
            for p in punches_by_user.get(local.id, []):
                tipo = (p.tipo or "").upper()
                ts = p.timestamp.isoformat(sep=" ", timespec="seconds") if p.timestamp else ""
                if tipo.startswith("SA"):
                    saida_at = ts
                    last_tipo = "SAÍDA"
                else:
                    entrada_at = ts
                    last_tipo = "ENTRADA"
        rows.append(
            {
                "id": s.get("id"),
                "full_name": s.get("full_name") or "",
                "codigo_inep": inep,
                "has_local_face": bool(local and local.face_encoding),
                "local_user_id": local.id if local else None,
                "entrada_at": entrada_at,
                "saida_at": saida_at,
                "last_tipo": last_tipo,
                "status_hoje": (
                    "saida"
                    if saida_at
                    else "entrada"
                    if entrada_at
                    else "sem_batida"
                ),
            }
        )

    return jsonify(
        success=True,
        configured=client.configured(),
        source=source,
        warning=warning,
        class_code=code,
        day=today.isoformat(),
        students=rows,
    )


@bp.route("/api/enroll", methods=["POST"])
@admin_login_required
def api_enroll():
    """Salva foto + encoding facial. Aluno deve já existir no SIGA (INEP)."""
    name = (request.form.get("name") or "").strip()
    registration = (request.form.get("registration") or "").strip()
    schedule = (request.form.get("schedule") or request.form.get("shift") or "").strip()
    class_code = (request.form.get("class_code") or request.form.get("class_name") or "").strip()
    person_kind = (request.form.get("person_kind") or "").strip().lower()
    staff_role = (request.form.get("staff_role") or "").strip().lower()
    password = (request.form.get("password") or "").strip() or uuid4().hex[:10]
    image = request.files.get("image") or request.files.get("file")

    if person_kind not in {"servidor", "aluno"}:
        return jsonify(success=False, message="Selecione Usuário (servidor) ou Aluno."), 400

    # Aluno: dados oficiais vêm do SIGA; aqui só vinculamos a face.
    if person_kind == "aluno":
        if not registration:
            return jsonify(
                success=False,
                message="Informe a matrícula INEP do aluno já cadastrado no SIGA.",
            ), 400
        from app.sync.supabase_attendance import client_from_app

        client = client_from_app()
        if client.configured():
            try:
                student = client.find_student(registration, name)
            except LookupError as exc:
                return jsonify(success=False, message=str(exc)), 400
            if student is None:
                return jsonify(
                    success=False,
                    message=(
                        f"Aluno com INEP '{registration}' não encontrado no SIGA. "
                        "Cadastre o aluno no sistema antes de salvar a foto facial."
                    ),
                ), 404
            name = (student.get("full_name") or name).strip()
            class_code = (student.get("class_code") or class_code).strip()
            registration = (student.get("codigo_inep") or registration).strip()
        if not name:
            return jsonify(success=False, message="Informe o nome completo."), 400
        if not class_code:
            return jsonify(
                success=False,
                message="Aluno sem turma no SIGA; atualize a turma antes do cadastro facial.",
            ), 400
        staff_role = None
    else:
        if not name:
            return jsonify(success=False, message="Informe o nome completo."), 400
        if staff_role not in {"professor", "gestao", "portaria"}:
            return jsonify(
                success=False,
                message="Para servidor, selecione Professor, Gestão ou Portaria.",
            ), 400
        class_code = None

    if image is None or not image.filename:
        return jsonify(success=False, message="Envie a foto do rosto."), 400

    extension = validated_image_extension(image)
    if extension is None:
        return jsonify(success=False, message="A foto precisa ser JPEG ou PNG."), 400

    image_bytes = image.read()
    encoding = encode_face_from_bytes(image_bytes, max_side=640, num_jitters=1)
    if encoding is None:
        return (
            jsonify(
                success=False,
                message="Nenhum rosto detectado. Refaça a foto com boa iluminação.",
            ),
            400,
        )

    schedule_label = schedule or None
    filename = unique_upload_name(extension)
    filepath = Path(current_app.config["UPLOAD_FOLDER"]) / filename
    filepath.write_bytes(image_bytes)
    photo_url = url_for("static", filename="uploads/" + filename)
    encoding_json = json.dumps(encoding.tolist())

    # Se já existe face local com o mesmo INEP, só atualiza a foto/encoding.
    existing = None
    if registration:
        existing = User.query.filter_by(registration=registration).first()

    if existing is not None and existing.role != "admin":
        existing.name = name
        existing.person_kind = person_kind
        existing.staff_role = staff_role
        existing.class_code = class_code
        existing.schedule = schedule_label
        existing.face_encoding = encoding_json
        existing.photo_url = photo_url
        db.session.commit()
        invalidate_known_faces_cache()
        return jsonify(
            {
                "success": True,
                "message": "Foto facial atualizada (aluno já vinculado).",
                "updated": True,
                "user": _serialize_user(existing),
            }
        )

    username_seed = registration or f"{person_kind}-{name}"
    username = _unique_username(username_seed)
    user = User(
        username=username,
        name=name,
        registration=registration or None,
        role="funcionario",
        schedule=schedule_label,
        person_kind=person_kind,
        staff_role=staff_role,
        class_code=class_code,
        face_encoding=encoding_json,
        photo_url=photo_url,
    )
    user.set_password(password)
    db.session.add(user)
    db.session.commit()
    invalidate_known_faces_cache()

    return jsonify(
        {
            "success": True,
            "message": "Foto facial salva. O aluno já existente no SIGA poderá ser reconhecido.",
            "updated": False,
            "user": _serialize_user(user),
        }
    )


@bp.route("/api/users/<int:user_id>", methods=["DELETE"])
@admin_login_required
def api_delete_user(user_id):
    user = db.session.get(User, user_id)
    if user is None:
        return jsonify(success=False, message="Usuário não encontrado."), 404
    if user.role == "admin":
        return jsonify(success=False, message="Não é permitido remover administradores."), 400

    Ponto.query.filter_by(user_id=user.id).delete()
    db.session.delete(user)
    db.session.commit()
    invalidate_known_faces_cache()
    return jsonify(success=True, message="Cadastro removido.")


@bp.route("/api/sync/queue", methods=["GET"])
@admin_login_required
def api_sync_queue():
    from app.sync.supabase_attendance import list_queue_items, queue_stats

    configured = bool(
        current_app.config.get("SUPABASE_URL")
        and current_app.config.get("SUPABASE_SERVICE_ROLE_KEY")
        and current_app.config.get("SUPABASE_SCHOOL_ID")
    )
    return jsonify(
        {
            "success": True,
            "configured": configured,
            "stats": queue_stats(),
            "items": list_queue_items(40),
        }
    )


@bp.route("/api/sync/run", methods=["POST"])
@admin_login_required
def api_sync_run():
    from app.sync.supabase_attendance import queue_stats, run_sync_batch

    limit = min(int(request.form.get("limit") or request.args.get("limit") or 100), 500)
    result = run_sync_batch(limit=limit)
    return jsonify(
        {
            "success": True,
            "processed": result.processed,
            "synced": result.synced,
            "skipped": result.skipped,
            "errors": result.errors,
            "messages": result.messages[:20],
            "stats": queue_stats(),
        }
    )


@bp.route("/api/sync/retry-errors", methods=["POST"])
@admin_login_required
def api_sync_retry_errors():
    from app.sync.supabase_attendance import queue_stats, retry_errors

    count = retry_errors()
    return jsonify(success=True, retried=count, stats=queue_stats())


@bp.route("/users")
@admin_login_required
def list_users():
    return redirect(url_for("admin.dashboard"))
