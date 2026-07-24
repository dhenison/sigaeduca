# app/models.py

from datetime import date, datetime

from flask_sqlalchemy import SQLAlchemy
from sqlalchemy import inspect, text
from werkzeug.security import check_password_hash, generate_password_hash

db = SQLAlchemy()

# Categorias do cadastro facial (portaria)
PERSON_KIND_SERVIDOR = "servidor"
PERSON_KIND_ALUNO = "aluno"
STAFF_ROLES = ("professor", "gestao", "portaria")


class User(db.Model):
    __tablename__ = "users"
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False)
    password_hash = db.Column(db.String(128), nullable=False)
    name = db.Column(db.String(120), nullable=True)
    registration = db.Column(db.String(50), nullable=True)  # matrícula / INEP / código
    role = db.Column(db.String(80), nullable=True)  # admin | funcionario (auth)
    schedule = db.Column(db.String(120), nullable=True)  # turno / horário
    address = db.Column(db.String(200), nullable=True)
    pass_type = db.Column(db.String(50), nullable=True)
    face_encoding = db.Column(db.Text, nullable=True)
    photo_url = db.Column(db.String(200), nullable=True)
    # Organização: servidores vs alunos
    person_kind = db.Column(db.String(20), nullable=True)  # servidor | aluno
    staff_role = db.Column(db.String(40), nullable=True)  # professor | gestao | portaria
    class_code = db.Column(db.String(80), nullable=True)  # turma do aluno

    pontos = db.relationship("Ponto", backref="user", lazy=True)

    def set_password(self, pw):
        self.password_hash = generate_password_hash(pw)

    def check_password(self, pw):
        return check_password_hash(self.password_hash, pw)


class Ponto(db.Model):
    __tablename__ = "pontos"
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    timestamp = db.Column(db.DateTime, default=datetime.utcnow)
    tipo = db.Column(db.String(10), nullable=False)  # 'ENTRADA' ou 'SAÍDA'
    station_id = db.Column(db.String(40), nullable=True)
    sync_status = db.Column(db.String(20), nullable=False, default="pending")
    sync_attempts = db.Column(db.Integer, nullable=False, default=0)
    synced_at = db.Column(db.DateTime, nullable=True)
    sync_error = db.Column(db.Text, nullable=True)
    external_mark_id = db.Column(db.String(64), nullable=True)
    timing_status = db.Column(db.String(30), nullable=True)


class ClassSchedule(db.Model):
    __tablename__ = "class_schedules"
    id = db.Column(db.Integer, primary_key=True)
    class_code = db.Column(db.String(80), unique=True, nullable=False, index=True)
    entry_time = db.Column(db.String(5), nullable=False)
    late_after = db.Column(db.String(5), nullable=False)
    exit_time = db.Column(db.String(5), nullable=False)
    created_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)
    updated_at = db.Column(
        db.DateTime,
        nullable=False,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
    )


class ShiftSchedule(db.Model):
    __tablename__ = "shift_schedules"
    id = db.Column(db.Integer, primary_key=True)
    shift_code = db.Column(db.String(20), unique=True, nullable=False, index=True)
    entry_time = db.Column(db.String(5), nullable=False)
    late_after = db.Column(db.String(5), nullable=False)
    exit_time = db.Column(db.String(5), nullable=False)
    updated_at = db.Column(
        db.DateTime,
        nullable=False,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
    )


class ClassScheduleOverride(db.Model):
    __tablename__ = "class_schedule_overrides"
    id = db.Column(db.Integer, primary_key=True)
    class_code = db.Column(db.String(80), nullable=False, index=True)
    day_date = db.Column(db.Date, nullable=False, index=True)
    entry_time = db.Column(db.String(5), nullable=False)
    late_after = db.Column(db.String(5), nullable=False)
    exit_time = db.Column(db.String(5), nullable=False)
    updated_at = db.Column(
        db.DateTime,
        nullable=False,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
    )

    __table_args__ = (
        db.UniqueConstraint(
            "class_code", "day_date", name="uq_class_schedule_override_day"
        ),
    )


class ClassShiftMap(db.Model):
    __tablename__ = "class_shift_maps"
    id = db.Column(db.Integer, primary_key=True)
    class_code = db.Column(db.String(80), unique=True, nullable=False, index=True)
    shift_code = db.Column(db.String(20), nullable=False, index=True)
    shift_label = db.Column(db.String(40), nullable=True)
    updated_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)


class ClassRelease(db.Model):
    __tablename__ = "class_releases"
    id = db.Column(db.Integer, primary_key=True)
    class_code = db.Column(db.String(80), nullable=False, index=True)
    day_date = db.Column(db.Date, nullable=False, default=date.today, index=True)
    released_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)
    released_count = db.Column(db.Integer, nullable=False, default=0)
    reason = db.Column(db.String(200), nullable=True)

    __table_args__ = (
        db.UniqueConstraint("class_code", "day_date", name="uq_class_release_day"),
    )


def _add_missing_columns(table: str, alterations: list[tuple[str, str]]) -> None:
    engine = db.engine
    inspector = inspect(engine)
    if table not in inspector.get_table_names():
        return
    existing = {col["name"] for col in inspector.get_columns(table)}
    with engine.begin() as conn:
        for name, ddl in alterations:
            if name not in existing:
                conn.execute(text(ddl))


def ensure_ponto_sync_columns() -> None:
    """Garante colunas de sync em bancos SQLite já existentes."""
    _add_missing_columns(
        "pontos",
        [
            ("station_id", "ALTER TABLE pontos ADD COLUMN station_id VARCHAR(40)"),
            (
                "sync_status",
                "ALTER TABLE pontos ADD COLUMN sync_status VARCHAR(20) DEFAULT 'pending'",
            ),
            (
                "sync_attempts",
                "ALTER TABLE pontos ADD COLUMN sync_attempts INTEGER DEFAULT 0",
            ),
            ("synced_at", "ALTER TABLE pontos ADD COLUMN synced_at DATETIME"),
            ("sync_error", "ALTER TABLE pontos ADD COLUMN sync_error TEXT"),
            (
                "external_mark_id",
                "ALTER TABLE pontos ADD COLUMN external_mark_id VARCHAR(64)",
            ),
            (
                "timing_status",
                "ALTER TABLE pontos ADD COLUMN timing_status VARCHAR(30)",
            ),
        ],
    )
    engine = db.engine
    inspector = inspect(engine)
    if "pontos" not in inspector.get_table_names():
        return
    with engine.begin() as conn:
        conn.execute(
            text(
                "UPDATE pontos SET sync_status = 'pending' "
                "WHERE sync_status IS NULL OR sync_status = ''"
            )
        )
        conn.execute(
            text("UPDATE pontos SET sync_attempts = 0 WHERE sync_attempts IS NULL")
        )


def ensure_user_org_columns() -> None:
    """Garante colunas de organização (servidor/aluno/turma)."""
    _add_missing_columns(
        "users",
        [
            ("person_kind", "ALTER TABLE users ADD COLUMN person_kind VARCHAR(20)"),
            ("staff_role", "ALTER TABLE users ADD COLUMN staff_role VARCHAR(40)"),
            ("class_code", "ALTER TABLE users ADD COLUMN class_code VARCHAR(80)"),
        ],
    )
