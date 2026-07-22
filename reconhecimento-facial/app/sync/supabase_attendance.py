"""Sincronização automática de batidas locais → Frequência no Supabase (SIGA EDUCA).

Alunos já existem no SIGA (`students`). Este módulo só grava presença (P)
em `attendance_marks` usando a matrícula local = `codigo_inep`.
"""

from __future__ import annotations

import base64
import json
import logging
import threading
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from io import BytesIO
from typing import Any

from flask import current_app
from PIL import Image

from app.models import Ponto, User, db

logger = logging.getLogger(__name__)

# Limites alinhados ao cadastro de foto do SIGA (ficha individual).
_AVATAR_MAX_SIDE = 512
_AVATAR_MAX_RAW_BYTES = 135_000


def make_avatar_data_url(image_bytes: bytes) -> str:
    """JPEG leve em data URL para gravar em `students.avatar_url`."""
    with Image.open(BytesIO(image_bytes)) as image:
        image = image.convert("RGB")
        width, height = image.size
        longest = max(width, height)
        if longest > _AVATAR_MAX_SIDE:
            scale = _AVATAR_MAX_SIDE / float(longest)
            image = image.resize(
                (max(1, int(width * scale)), max(1, int(height * scale))),
                Image.Resampling.LANCZOS,
            )
        quality = 72
        raw = b""
        while quality >= 45:
            buf = BytesIO()
            image.save(buf, format="JPEG", quality=quality, optimize=True)
            raw = buf.getvalue()
            if len(raw) <= _AVATAR_MAX_RAW_BYTES:
                break
            quality -= 8
        if not raw:
            raise ValueError("Não foi possível gerar a foto de perfil.")
    encoded = base64.b64encode(raw).decode("ascii")
    return f"data:image/jpeg;base64,{encoded}"


@dataclass
class SyncResult:
    processed: int = 0
    synced: int = 0
    skipped: int = 0
    errors: int = 0
    messages: list[str] | None = None

    def __post_init__(self) -> None:
        if self.messages is None:
            self.messages = []


class SupabaseAttendanceClient:
    def __init__(self, url: str, service_key: str, school_id: str) -> None:
        self.base = url.rstrip("/")
        self.service_key = service_key
        self.school_id = school_id

    def configured(self) -> bool:
        return bool(self.base and self.service_key and self.school_id)

    def _request(
        self,
        method: str,
        path: str,
        *,
        params: dict[str, str] | None = None,
        body: dict[str, Any] | list[dict[str, Any]] | None = None,
        prefer: str | None = None,
    ) -> Any:
        query = f"?{urllib.parse.urlencode(params)}" if params else ""
        url = f"{self.base}/rest/v1/{path.lstrip('/')}{query}"
        headers = {
            "apikey": self.service_key,
            "Authorization": f"Bearer {self.service_key}",
            "Content-Type": "application/json",
            "Accept": "application/json",
        }
        if prefer:
            headers["Prefer"] = prefer
        data = None if body is None else json.dumps(body).encode("utf-8")
        req = urllib.request.Request(url, data=data, headers=headers, method=method)
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                raw = resp.read().decode("utf-8")
                if not raw:
                    return None
                return json.loads(raw)
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode("utf-8", errors="replace")
            raise RuntimeError(f"Supabase HTTP {exc.code}: {detail}") from exc

    def find_student(self, registration: str, full_name: str = "") -> dict[str, Any] | None:
        """Busca aluno já cadastrado no SIGA (fonte da verdade)."""
        reg = (registration or "").strip()
        if reg:
            rows = self._request(
                "GET",
                "students",
                params={
                    "select": "id,full_name,class_code,codigo_inep,school_id,status",
                    "school_id": f"eq.{self.school_id}",
                    "codigo_inep": f"eq.{reg}",
                    "limit": "5",
                },
            )
            if isinstance(rows, list) and len(rows) == 1:
                return rows[0]
            if isinstance(rows, list) and len(rows) > 1:
                raise LookupError(
                    f"Matrícula/INEP '{reg}' ambígua no Supabase ({len(rows)} alunos)."
                )

        name = (full_name or "").strip()
        if not name:
            return None
        rows = self._request(
            "GET",
            "students",
            params={
                "select": "id,full_name,class_code,codigo_inep,school_id,status",
                "school_id": f"eq.{self.school_id}",
                "full_name": f"eq.{name}",
                "limit": "5",
            },
        )
        if isinstance(rows, list) and len(rows) == 1:
            return rows[0]
        if isinstance(rows, list) and len(rows) > 1:
            raise LookupError(
                f"Nome '{name}' ambíguo no Supabase ({len(rows)} alunos)."
            )
        return None

    def update_student_avatar(self, student_id: str, avatar_data_url: str) -> None:
        """Atualiza a foto de perfil (`avatar_url`) na ficha do aluno no SIGA."""
        sid = (student_id or "").strip()
        if not sid:
            raise ValueError("student_id obrigatório para atualizar avatar.")
        avatar = (avatar_data_url or "").strip()
        if not avatar.startswith("data:image/"):
            raise ValueError("avatar_url deve ser data URL de imagem.")
        self._request(
            "PATCH",
            "students",
            params={"id": f"eq.{sid}", "school_id": f"eq.{self.school_id}"},
            body={"avatar_url": avatar},
            prefer="return=minimal",
        )

    def list_students(self, *, class_code: str = "", q: str = "", limit: int = 80) -> list[dict[str, Any]]:
        params: dict[str, str] = {
            "select": "id,full_name,class_code,codigo_inep,school_id,status,avatar_url",
            "school_id": f"eq.{self.school_id}",
            "status": "eq.Ativo",
            "order": "full_name.asc",
            "limit": str(max(1, min(int(limit), 200))),
        }
        code = (class_code or "").strip()
        if code:
            params["class_code"] = f"eq.{code}"
        query = (q or "").strip()
        if query:
            # ilike em nome ou INEP
            params["or"] = f"(full_name.ilike.*{query}*,codigo_inep.ilike.*{query}*)"
        rows = self._request("GET", "students", params=params)
        return rows if isinstance(rows, list) else []

    def list_classes(self, *, year_label: str = "2026", limit: int = 200) -> list[dict[str, Any]]:
        """Turmas ativas da escola no SIGA (`public.classes`)."""
        params: dict[str, str] = {
            "select": "id,code,serie,turno,modalidade,status,year_label,capacity",
            "school_id": f"eq.{self.school_id}",
            "status": "eq.Ativo",
            "order": "code.asc",
            "limit": str(max(1, min(int(limit), 300))),
        }
        year = (year_label or "").strip()
        if year:
            params["year_label"] = f"eq.{year}"
        rows = self._request("GET", "classes", params=params)
        return rows if isinstance(rows, list) else []

    def ensure_attendance_call(self, class_code: str, day_date: str) -> str:
        code = (class_code or "").strip()
        if not code:
            raise ValueError("Aluno sem turma (class_code) no Supabase.")

        existing = self._request(
            "GET",
            "attendance_calls",
            params={
                "select": "id",
                "school_id": f"eq.{self.school_id}",
                "class_code": f"eq.{code}",
                "day_date": f"eq.{day_date}",
                "limit": "1",
            },
        )
        if isinstance(existing, list) and existing:
            return existing[0]["id"]

        created = self._request(
            "POST",
            "attendance_calls",
            params={"on_conflict": "school_id,class_code,day_date"},
            body={
                "school_id": self.school_id,
                "class_code": code,
                "day_date": day_date,
            },
            prefer="return=representation,resolution=merge-duplicates",
        )
        if isinstance(created, list) and created:
            return created[0]["id"]
        again = self._request(
            "GET",
            "attendance_calls",
            params={
                "select": "id",
                "school_id": f"eq.{self.school_id}",
                "class_code": f"eq.{code}",
                "day_date": f"eq.{day_date}",
                "limit": "1",
            },
        )
        if isinstance(again, list) and again:
            return again[0]["id"]
        raise RuntimeError("Não foi possível criar/obter attendance_calls.")

    def upsert_mark(
        self,
        *,
        call_id: str,
        student_id: str,
        phase: str,
        marked_at: str,
        locked: bool = True,
        source: str = "facial",
    ) -> str:
        """Grava presença e consolida individualmente (locked) na fase."""
        payload = {
            "school_id": self.school_id,
            "call_id": call_id,
            "student_id": student_id,
            "phase": phase,
            "status": "P",
            "marked_at": marked_at,
            "locked": bool(locked),
            "source": (source or "facial").strip() or "facial",
        }
        rows = self._request(
            "POST",
            "attendance_marks",
            params={"on_conflict": "call_id,student_id,phase"},
            body=payload,
            prefer="return=representation,resolution=merge-duplicates",
        )
        if isinstance(rows, list) and rows:
            return rows[0]["id"]

        existing = self._request(
            "GET",
            "attendance_marks",
            params={
                "select": "id,locked",
                "call_id": f"eq.{call_id}",
                "student_id": f"eq.{student_id}",
                "phase": f"eq.{phase}",
                "limit": "1",
            },
        )
        if isinstance(existing, list) and existing:
            mark_id = existing[0]["id"]
            self._request(
                "PATCH",
                "attendance_marks",
                params={"id": f"eq.{mark_id}"},
                body={
                    "status": "P",
                    "marked_at": marked_at,
                    "locked": True,
                    "source": payload["source"],
                },
                prefer="return=minimal",
            )
            return mark_id
        raise RuntimeError("Falha ao gravar attendance_marks.")


def _client_from_app() -> SupabaseAttendanceClient:
    return SupabaseAttendanceClient(
        url=str(current_app.config.get("SUPABASE_URL") or ""),
        service_key=str(current_app.config.get("SUPABASE_SERVICE_ROLE_KEY") or ""),
        school_id=str(current_app.config.get("SUPABASE_SCHOOL_ID") or ""),
    )


def client_from_app() -> SupabaseAttendanceClient:
    return _client_from_app()


def _phase_from_tipo(tipo: str) -> str:
    if (tipo or "").upper().startswith("SA"):
        return "saida"
    return "entrada"


def _iso_z(dt: datetime | None) -> str:
    if dt is None:
        dt = datetime.now(timezone.utc).replace(tzinfo=None)
    if dt.tzinfo is None:
        return dt.isoformat(timespec="seconds") + "Z"
    return dt.astimezone(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


def _day_date(dt: datetime | None) -> str:
    """Dia letivo no fuso do Brasil (Frequência do SIGA usa data local, não UTC)."""
    try:
        from zoneinfo import ZoneInfo

        tz = ZoneInfo("America/Belem")
    except Exception:  # noqa: BLE001
        tz = timezone(timedelta(hours=-3))

    if dt is None:
        local = datetime.now(tz)
    elif dt.tzinfo is None:
        # Batidas locais são gravadas em UTC “naive”.
        local = dt.replace(tzinfo=timezone.utc).astimezone(tz)
    else:
        local = dt.astimezone(tz)
    return local.date().isoformat()


def should_sync_user(user: User | None) -> tuple[bool, str]:
    """Só alunos com matrícula INEP sobem para Frequência."""
    if user is None:
        return False, "Batida sem usuário local."
    kind = (user.person_kind or "").strip().lower()
    if kind == "servidor":
        return False, "Servidor não entra na Frequência de alunos."
    if kind and kind != "aluno":
        return False, f"Tipo '{kind}' não sincroniza com Frequência."
    registration = (user.registration or "").strip()
    if not registration:
        return False, "Sem matrícula (INEP); vincule ao aluno já cadastrado no SIGA."
    # Sem person_kind: se tem matrícula, trata como aluno (cadastros antigos).
    return True, ""


def queue_stats() -> dict[str, int]:
    return {
        "pending": Ponto.query.filter_by(sync_status="pending").count(),
        "synced": Ponto.query.filter_by(sync_status="synced").count(),
        "error": Ponto.query.filter_by(sync_status="error").count(),
        "skipped": Ponto.query.filter_by(sync_status="skipped").count(),
    }


def list_queue_items(limit: int = 30) -> list[dict[str, Any]]:
    rows = (
        Ponto.query.filter(Ponto.sync_status.in_(("pending", "error", "skipped")))
        .order_by(Ponto.timestamp.desc(), Ponto.id.desc())
        .limit(limit)
        .all()
    )
    items: list[dict[str, Any]] = []
    for p in rows:
        user = p.user
        items.append(
            {
                "id": p.id,
                "tipo": p.tipo,
                "timestamp": p.timestamp.isoformat(sep=" ", timespec="seconds")
                if p.timestamp
                else "",
                "station_id": p.station_id or "",
                "sync_status": p.sync_status,
                "sync_error": p.sync_error or "",
                "sync_attempts": p.sync_attempts or 0,
                "user": {
                    "id": user.id if user else None,
                    "name": (user.name or user.username) if user else "",
                    "registration": (user.registration or "") if user else "",
                },
            }
        )
    return items


def retry_errors() -> int:
    updated = (
        Ponto.query.filter_by(sync_status="error")
        .update(
            {
                "sync_status": "pending",
                "sync_error": None,
            },
            synchronize_session=False,
        )
    )
    db.session.commit()
    return int(updated or 0)


def sync_ponto(ponto_id: int) -> SyncResult:
    """Sincroniza uma batida específica (uso pós-punch e worker)."""
    result = SyncResult(processed=1)
    client = _client_from_app()
    if not client.configured():
        result.messages.append(
            "Configure SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY e SUPABASE_SCHOOL_ID."
        )
        return result

    ponto = db.session.get(Ponto, ponto_id)
    if ponto is None:
        result.errors += 1
        result.messages.append(f"Ponto #{ponto_id} não encontrado.")
        return result

    if ponto.sync_status == "synced":
        result.synced += 1
        return result

    user: User | None = ponto.user
    ponto.sync_attempts = int(ponto.sync_attempts or 0) + 1

    ok, reason = should_sync_user(user)
    if not ok:
        ponto.sync_status = "skipped"
        ponto.sync_error = reason
        db.session.commit()
        result.skipped += 1
        result.messages.append(f"Ponto #{ponto.id}: {reason}")
        return result

    try:
        assert user is not None
        registration = (user.registration or "").strip()
        student = client.find_student(registration, user.name or "")
        if student is None:
            ponto.sync_status = "skipped"
            ponto.sync_error = (
                f"Aluno não encontrado no SIGA (matrícula/INEP '{registration}'). "
                "Cadastre a face com o mesmo INEP do aluno no sistema."
            )
            db.session.commit()
            result.skipped += 1
            result.messages.append(f"Ponto #{ponto.id}: {ponto.sync_error}")
            return result

        # Turma do SIGA é a fonte da verdade.
        class_code = (student.get("class_code") or user.class_code or "").strip()
        if class_code and (user.class_code or "").strip() != class_code:
            user.class_code = class_code
        day = _day_date(ponto.timestamp)
        call_id = client.ensure_attendance_call(class_code, day)
        phase = _phase_from_tipo(ponto.tipo)
        mark_id = client.upsert_mark(
            call_id=call_id,
            student_id=student["id"],
            phase=phase,
            marked_at=_iso_z(ponto.timestamp),
            locked=True,
            source="facial",
        )
        ponto.sync_status = "synced"
        ponto.synced_at = datetime.utcnow()
        ponto.sync_error = None
        ponto.external_mark_id = str(mark_id)
        db.session.commit()
        result.synced += 1
    except LookupError as exc:
        ponto.sync_status = "skipped"
        ponto.sync_error = str(exc)
        db.session.commit()
        result.skipped += 1
        result.messages.append(f"Ponto #{ponto.id}: {exc}")
    except Exception as exc:  # noqa: BLE001
        ponto.sync_status = "error"
        ponto.sync_error = str(exc)[:500]
        db.session.commit()
        result.errors += 1
        result.messages.append(f"Ponto #{ponto.id}: {exc}")

    return result


def run_sync_batch(limit: int = 100) -> SyncResult:
    result = SyncResult()
    client = _client_from_app()
    if not client.configured():
        result.messages.append(
            "Configure SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY e SUPABASE_SCHOOL_ID."
        )
        return result

    # Reprocessa pending e error (independência offline).
    pending = (
        Ponto.query.filter(Ponto.sync_status.in_(("pending", "error")))
        .order_by(Ponto.timestamp.asc(), Ponto.id.asc())
        .limit(limit)
        .all()
    )
    result.processed = len(pending)
    for ponto in pending:
        if ponto.sync_status == "error":
            ponto.sync_status = "pending"
            ponto.sync_error = None
            db.session.commit()
        item = sync_ponto(ponto.id)
        result.synced += item.synced
        result.skipped += item.skipped
        result.errors += item.errors
        result.messages.extend(item.messages or [])
    return result


def schedule_sync_ponto(app, ponto_id: int) -> None:
    """Dispara sync em thread (não atrasa a resposta do reconhecimento)."""

    def _run() -> None:
        try:
            with app.app_context():
                sync_ponto(ponto_id)
        except Exception:  # noqa: BLE001
            logger.exception("Falha no sync automático do ponto #%s", ponto_id)

    threading.Thread(
        target=_run,
        name=f"siga-sync-ponto-{ponto_id}",
        daemon=True,
    ).start()
