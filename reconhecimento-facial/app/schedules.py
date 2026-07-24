from __future__ import annotations

import unicodedata
from datetime import date, datetime, timedelta, timezone
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from flask import current_app

from app.models import ClassScheduleOverride, ClassShiftMap, ShiftSchedule

SHIFT_LABELS = {
    "manha": "Manhã",
    "tarde": "Tarde",
    "noite": "Noite",
}


def normalize_shift(value: str | None) -> str:
    raw = unicodedata.normalize("NFKD", (value or "").strip().lower())
    raw = "".join(char for char in raw if not unicodedata.combining(char))
    if raw in {"manha", "matutino", "matutina"} or "manha" in raw:
        return "manha"
    if raw in {"tarde", "vespertino", "vespertina"} or "tarde" in raw:
        return "tarde"
    if raw in {"noite", "noturno", "noturna"} or "noite" in raw:
        return "noite"
    return ""


def local_day_and_clock(timestamp: datetime | None = None) -> tuple[date, str]:
    tz_name = current_app.config.get("TIMEZONE") or "America/Sao_Paulo"
    try:
        local_timezone = ZoneInfo(tz_name)
    except ZoneInfoNotFoundError:
        # Windows sem o pacote tzdata: Brasília permanece em UTC-3 desde 2019.
        local_timezone = timezone(timedelta(hours=-3))
    if timestamp is None:
        local = datetime.now(local_timezone)
    else:
        local = timestamp.replace(tzinfo=timezone.utc).astimezone(local_timezone)
    return local.date(), local.strftime("%H:%M")


def serialize_schedule(schedule, *, source: str, shift_code: str = "") -> dict:
    return {
        "id": schedule.id,
        "source": source,
        "shift_code": shift_code or getattr(schedule, "shift_code", ""),
        "shift_label": SHIFT_LABELS.get(
            shift_code or getattr(schedule, "shift_code", ""), ""
        ),
        "class_code": getattr(schedule, "class_code", ""),
        "day_date": getattr(schedule, "day_date", None).isoformat()
        if getattr(schedule, "day_date", None)
        else "",
        "entry_time": schedule.entry_time,
        "late_after": schedule.late_after,
        "exit_time": schedule.exit_time,
        "updated_at": schedule.updated_at.isoformat(sep=" ", timespec="seconds")
        if schedule.updated_at
        else "",
    }


def effective_schedule(
    class_code: str,
    *,
    day_date: date | None = None,
    user_shift: str = "",
):
    day = day_date or local_day_and_clock()[0]
    code = (class_code or "").strip()
    if code:
        override = ClassScheduleOverride.query.filter_by(
            class_code=code, day_date=day
        ).first()
        if override is not None:
            mapping = ClassShiftMap.query.filter_by(class_code=code).first()
            return override, "exception", mapping.shift_code if mapping else ""

    mapping = ClassShiftMap.query.filter_by(class_code=code).first() if code else None
    shift_code = mapping.shift_code if mapping else normalize_shift(user_shift)
    if not shift_code:
        return None, "", ""
    schedule = ShiftSchedule.query.filter_by(shift_code=shift_code).first()
    return schedule, "shift" if schedule else "", shift_code


def timing_status(tipo: str, timestamp: datetime, schedule) -> str:
    if schedule is None or timestamp is None:
        return "sem_horario"
    _, clock = local_day_and_clock(timestamp)
    if (tipo or "").upper().startswith("SA"):
        return "saida_antecipada" if clock < schedule.exit_time else "saida_regular"
    return "atrasado" if clock > schedule.late_after else "no_horario"
