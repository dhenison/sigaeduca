from __future__ import annotations

from datetime import datetime, timedelta, timezone

from flask import current_app, jsonify, redirect, render_template, request, url_for

from app.models import Ponto, User, db
from app.punch import bp
from app.punch.recognition import (
    DEFAULT_MAX_SIDE,
    DEFAULT_TOLERANCE,
    DEFAULT_UPSAMPLE,
    extract_face_encoding,
    find_best_match,
    load_image_from_bytes,
)


def _next_punch_type(user_id: int) -> str:
    last = (
        Ponto.query.filter_by(user_id=user_id)
        .order_by(Ponto.timestamp.desc(), Ponto.id.desc())
        .first()
    )
    if last is not None and last.tipo == "ENTRADA":
        return "SAÍDA"
    return "ENTRADA"


def _recent_punch(user_id: int, within_seconds: int) -> Ponto | None:
    """Última batida do usuário dentro da janela anti-duplicação (todas as estações)."""
    if within_seconds <= 0:
        return None
    cutoff = datetime.utcnow() - timedelta(seconds=within_seconds)
    return (
        Ponto.query.filter(Ponto.user_id == user_id, Ponto.timestamp >= cutoff)
        .order_by(Ponto.timestamp.desc(), Ponto.id.desc())
        .first()
    )


def _read_capture_bytes() -> bytes | None:
    """Aceita multipart (image/file) ou corpo binário JPEG/PNG."""
    uploaded = request.files.get("image") or request.files.get("file")
    if uploaded is not None:
        data = uploaded.read()
        if data:
            return data

    if request.content_type and request.content_type.startswith("image/"):
        data = request.get_data(cache=False)
        if data:
            return data

    return None


def _wants_dry_run() -> bool:
    raw = (request.form.get("dry_run") or request.args.get("dry_run") or "").strip().lower()
    return raw in {"1", "true", "yes", "on"}


def _normalize_station_id(raw: str | None) -> str | None:
    value = (raw or "").strip()
    if not value:
        return None
    if value.isdigit():
        return f"station-{value}"
    return value[:40]


def _station_from_request() -> str | None:
    return _normalize_station_id(
        request.form.get("station_id")
        or request.args.get("station")
        or request.headers.get("X-Station-Id")
    )


def _station_label_from_query() -> tuple[str | None, str]:
    raw = (request.args.get("station") or "").strip()
    station_id = _normalize_station_id(raw)
    if not station_id:
        return None, ""
    if raw.isdigit():
        return station_id, f"Estação {raw}"
    return station_id, station_id


@bp.route("/", methods=["GET"])
def home():
    """Hub inicial — use sempre via servidor Flask, nunca file://."""
    import os

    port = int(os.environ.get("PORT", "5000"))
    return render_template("index.html", port=port)


@bp.route("/punch", methods=["GET"])
def punch():
    """Compatibilidade: a tela clássica foi unificada no Push2."""
    station = request.args.get("station")
    if station:
        return redirect(url_for("punch.punch2", station=station))
    return redirect(url_for("punch.punch2"))


@bp.route("/punch2", methods=["GET"])
def punch2():
    """Monitor visual push2 com o mesmo reconhecimento do /punch."""
    station_id, station_label = _station_label_from_query()
    return render_template(
        "push2.html",
        station_id=station_id or "",
        station_label=station_label or "",
    )


@bp.route("/stations", methods=["GET"])
def stations():
    """Atalhos para abrir estações em monitores (PC central + clientes na LAN)."""
    dedup = int(current_app.config.get("PUNCH_DEDUP_SECONDS", 120))
    server_port = int(current_app.config.get("PORT") or 5001)
    return render_template(
        "stations.html",
        dedup_seconds=dedup,
        server_port=server_port,
    )


@bp.route("/punch", methods=["POST"])
def punch_submit():
    image_bytes = _read_capture_bytes()
    if not image_bytes:
        return (
            jsonify(
                success=False,
                message="Nenhuma imagem recebida. Capture novamente.",
            ),
            400,
        )

    max_side = int(current_app.config.get("FACE_MAX_SIDE", DEFAULT_MAX_SIDE))
    tolerance = float(current_app.config.get("FACE_MATCH_TOLERANCE", DEFAULT_TOLERANCE))
    upsample = int(current_app.config.get("FACE_UPSAMPLE", DEFAULT_UPSAMPLE))
    dedup_seconds = int(current_app.config.get("PUNCH_DEDUP_SECONDS", 120))
    dry_run = _wants_dry_run()
    station_id = _station_from_request()

    try:
        rgb_image = load_image_from_bytes(image_bytes, max_side=max_side)
        encoding = extract_face_encoding(rgb_image, upsample=upsample)
    except (OSError, ValueError):
        return (
            jsonify(
                success=False,
                message="Não foi possível processar a imagem capturada.",
            ),
            400,
        )

    if encoding is None:
        return (
            jsonify(
                success=False,
                message="Nenhum rosto detectado. Aproxime-se e tente de novo.",
            ),
            400,
        )

    match = find_best_match(encoding, tolerance=tolerance)
    if match is None:
        return (
            jsonify(
                success=False,
                message="Rosto não reconhecido. Verifique o cadastro biométrico.",
            ),
            404,
        )

    user = db.session.get(User, match.user_id)
    if user is None:
        return jsonify(success=False, message="Usuário não encontrado."), 404

    display_name = user.name or user.username
    recent = _recent_punch(user.id, dedup_seconds)
    if recent is not None and not dry_run:
        remaining = dedup_seconds
        if recent.timestamp is not None:
            elapsed = (datetime.utcnow() - recent.timestamp).total_seconds()
            remaining = max(1, int(dedup_seconds - elapsed))
        where = recent.station_id or "outra estação"
        return (
            jsonify(
                success=False,
                duplicate=True,
                matched=True,
                user={
                    "id": user.id,
                    "name": display_name,
                    "username": user.username,
                    "registration": user.registration or user.username,
                },
                last_tipo=recent.tipo,
                last_station_id=recent.station_id,
                retry_after_seconds=remaining,
                message=(
                    f"{display_name} já registrou {recent.tipo} há pouco "
                    f"({where}). Aguarde {remaining}s."
                ),
            ),
            409,
        )

    tipo = _next_punch_type(user.id)
    confidence = max(0.0, min(1.0, 1.0 - (match.distance / max(tolerance, 0.01))))
    payload = {
        "success": True,
        "matched": True,
        "dry_run": dry_run,
        "user": {
            "id": user.id,
            "name": display_name,
            "username": user.username,
            "registration": user.registration or user.username,
            "schedule": user.schedule or "",
            "photo_url": user.photo_url or "",
        },
        "tipo": tipo,
        "distance": round(match.distance, 4),
        "confidence": round(confidence, 4),
        "station_id": station_id,
    }

    if dry_run:
        payload["message"] = f"Rosto reconhecido: {display_name}."
        return jsonify(payload)

    ponto = Ponto(
        user_id=user.id,
        tipo=tipo,
        timestamp=datetime.now(timezone.utc).replace(tzinfo=None),
        station_id=station_id,
        sync_status="pending",
        sync_attempts=0,
        sync_error=None,
        external_mark_id=None,
        synced_at=None,
    )
    db.session.add(ponto)
    db.session.commit()

    # Sync automático → Frequência SIGA (só alunos; background).
    ok_sync, skip_reason = False, ""
    try:
        from app.sync.supabase_attendance import (
            schedule_sync_ponto,
            should_sync_user,
        )

        ok_sync, skip_reason = should_sync_user(user)
        if ok_sync:
            schedule_sync_ponto(current_app._get_current_object(), ponto.id)
        else:
            ponto.sync_status = "skipped"
            ponto.sync_error = skip_reason
            db.session.commit()
    except Exception:  # noqa: BLE001
        # Batida local já está salva; worker periódico tenta de novo.
        pass

    payload["message"] = f"{tipo} registrada para {display_name}."
    payload["timestamp"] = ponto.timestamp.isoformat(sep=" ", timespec="seconds")
    payload["ponto_id"] = ponto.id
    payload["sync_status"] = ponto.sync_status
    if ponto.sync_error:
        payload["sync_error"] = ponto.sync_error
    return jsonify(payload)


def _serialize_ponto(ponto: Ponto) -> dict:
    user = ponto.user
    return {
        "id": ponto.id,
        "tipo": ponto.tipo,
        "timestamp": ponto.timestamp.isoformat(sep=" ", timespec="seconds")
        if ponto.timestamp
        else "",
        "station_id": ponto.station_id or "",
        "sync_status": ponto.sync_status or "pending",
        "user": {
            "id": user.id if user else None,
            "name": (user.name or user.username) if user else "Desconhecido",
            "username": user.username if user else "",
            "registration": (user.registration or user.username) if user else "",
            "schedule": user.schedule if user else "",
            "photo_url": user.photo_url if user else "",
        },
    }


@bp.route("/punch/recent", methods=["GET"])
def punch_recent():
    limit = min(int(request.args.get("limit", 12)), 50)
    pontos = (
        Ponto.query.order_by(Ponto.timestamp.desc(), Ponto.id.desc())
        .limit(limit)
        .all()
    )
    registered = (
        User.query.filter(User.face_encoding.isnot(None))
        .filter(User.face_encoding != "")
        .count()
    )
    return jsonify(
        {
            "success": True,
            "registered_faces": registered,
            "items": [_serialize_ponto(p) for p in pontos],
        }
    )
