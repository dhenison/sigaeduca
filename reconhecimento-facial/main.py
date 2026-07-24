import os
import site
from pathlib import Path
from typing import Any

from flask import Flask
from flask_wtf.csrf import CSRFProtect

from app.admin.routes import bp as admin_bp
from app.models import db, ensure_ponto_sync_columns, ensure_user_org_columns

csrf = CSRFProtect()


def create_app(test_config: dict[str, Any] | None = None) -> Flask:
    """Cria e configura a aplicação Flask.

    ``test_config`` permite substituir configurações sem acessar banco ou
    diretórios reais durante testes automatizados.
    """
    # Carrega .env local se existir (não sobrescreve env já definidas).
    # PUNCH_DEDUP_SECONDS lê o arquivo de novo no reload (permite ajustar testes).
    env_file = Path(__file__).resolve().parent / ".env"
    env_file_vals: dict[str, str] = {}
    try:
        from dotenv import dotenv_values, load_dotenv

        load_dotenv(env_file)
        env_file_vals = {
            k: v for k, v in (dotenv_values(env_file) or {}).items() if v is not None
        }
    except ImportError:
        pass

    app = Flask(
        __name__,
        static_folder="static",
        template_folder="templates",
    )

    basedir = Path(__file__).resolve().parent
    instance_dir = basedir / "instance"
    instance_dir.mkdir(exist_ok=True)

    app_env = os.environ.get("APP_ENV", "development").lower()
    secret_key = os.environ.get("SECRET_KEY")
    if app_env == "production" and not secret_key:
        raise RuntimeError("SECRET_KEY é obrigatória em produção.")

    punch_dedup = int(
        env_file_vals.get("PUNCH_DEDUP_SECONDS")
        or os.environ.get("PUNCH_DEDUP_SECONDS")
        or "10"
    )

    supabase_url = (
        env_file_vals.get("SUPABASE_URL")
        or os.environ.get("SUPABASE_URL")
        or ""
    ).rstrip("/")
    supabase_key = (
        env_file_vals.get("SUPABASE_SERVICE_ROLE_KEY")
        or os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
        or ""
    ).strip()
    supabase_school = (
        env_file_vals.get("SUPABASE_SCHOOL_ID")
        or os.environ.get("SUPABASE_SCHOOL_ID")
        or ""
    ).strip()

    # Garante que paste no .env vale mesmo se o processo já tinha var vazia.
    if supabase_url:
        os.environ["SUPABASE_URL"] = supabase_url
    if supabase_key:
        os.environ["SUPABASE_SERVICE_ROLE_KEY"] = supabase_key
    if supabase_school:
        os.environ["SUPABASE_SCHOOL_ID"] = supabase_school

    app.config.from_mapping(
        SECRET_KEY=secret_key or "development-only-change-me",
        SQLALCHEMY_DATABASE_URI=os.environ.get(
            "DATABASE_URL",
            f"sqlite:///{instance_dir / 'ponto.db'}",
        ),
        SQLALCHEMY_TRACK_MODIFICATIONS=False,
        UPLOAD_FOLDER=str(basedir / "static" / "uploads"),
        MAX_CONTENT_LENGTH=5 * 1024 * 1024,
        SESSION_COOKIE_HTTPONLY=True,
        SESSION_COOKIE_SAMESITE="Lax",
        SESSION_COOKIE_SECURE=app_env == "production",
        WTF_CSRF_TIME_LIMIT=3600,
        # Reconhecimento: ~400px exige aproximação; upsample=1 melhora faces menores.
        FACE_MAX_SIDE=int(os.environ.get("FACE_MAX_SIDE", "400")),
        FACE_MATCH_TOLERANCE=float(os.environ.get("FACE_MATCH_TOLERANCE", "0.57")),
        FACE_UPSAMPLE=int(os.environ.get("FACE_UPSAMPLE", "1")),
        # Anti-duplicação entre estações/webcams no PC central (segundos).
        PUNCH_DEDUP_SECONDS=punch_dedup,
        PORT=int(env_file_vals.get("PORT") or os.environ.get("PORT") or "5001"),
        SUPABASE_URL=supabase_url,
        SUPABASE_SERVICE_ROLE_KEY=supabase_key,
        SUPABASE_SCHOOL_ID=supabase_school,
        SYNC_WORKER_INTERVAL=int(
            env_file_vals.get("SYNC_WORKER_INTERVAL")
            or os.environ.get("SYNC_WORKER_INTERVAL")
            or "45"
        ),
        TIMEZONE=env_file_vals.get("TIMEZONE")
        or os.environ.get("TIMEZONE")
        or "America/Sao_Paulo",
    )

    if test_config:
        app.config.update(test_config)

    Path(app.config["UPLOAD_FOLDER"]).mkdir(parents=True, exist_ok=True)

    model_path = Path(site.getsitepackages()[0]) / "face_recognition_models"
    os.environ.setdefault("FACE_RECOGNITION_MODEL_LOCATION", str(model_path))

    db.init_app(app)
    csrf.init_app(app)
    app.register_blueprint(admin_bp)

    from app.punch import bp as punch_bp

    app.register_blueprint(punch_bp)

    with app.app_context():
        db.create_all()
        ensure_ponto_sync_columns()
        ensure_user_org_columns()

    # Worker de sync automático (pending/error → Frequência), independente do admin.
    if not app.config.get("TESTING"):
        from app.sync.worker import start_attendance_sync_worker

        start_attendance_sync_worker(
            app, interval_seconds=int(app.config.get("SYNC_WORKER_INTERVAL") or 45)
        )

    return app


app = create_app()


if __name__ == "__main__":
    port = int(os.environ.get("PORT") or app.config.get("PORT") or 5001)
    debug = os.environ.get("FLASK_DEBUG", "0") == "1"
    app.run(host="0.0.0.0", port=port, debug=debug)
