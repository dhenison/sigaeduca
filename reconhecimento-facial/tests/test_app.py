from io import BytesIO

from PIL import Image
from sqlalchemy import inspect
from werkzeug.datastructures import FileStorage

from app.admin.routes import unique_upload_name, validated_image_extension
from app.models import User, db
from main import create_app


def create_admin(app, username="admin", password="senha-segura"):
    with app.app_context():
        user = User(username=username, role="admin")
        user.set_password(password)
        db.session.add(user)
        db.session.commit()


def login_admin(client, username="admin", password="senha-segura"):
    return client.post(
        "/admin/login",
        data={"username": username, "password": password},
        follow_redirects=False,
    )


def make_image_file(image_format="PNG"):
    stream = BytesIO()
    Image.new("RGB", (2, 2)).save(stream, format=image_format)
    stream.seek(0)
    return FileStorage(stream=stream, filename=f"teste.{image_format.lower()}")


def test_create_app_uses_testing_configuration(app, tmp_path):
    assert app.config["TESTING"] is True
    assert app.config["SQLALCHEMY_DATABASE_URI"] == "sqlite:///:memory:"
    assert app.config["UPLOAD_FOLDER"].startswith(str(tmp_path))


def test_security_defaults_are_configured(app):
    assert app.config["MAX_CONTENT_LENGTH"] == 5 * 1024 * 1024
    assert app.config["SESSION_COOKIE_HTTPONLY"] is True
    assert app.config["SESSION_COOKIE_SAMESITE"] == "Lax"
    assert app.config["SESSION_COOKIE_SECURE"] is False


def test_database_tables_are_created(app):
    with app.app_context():
        table_names = set(inspect(db.engine).get_table_names())

    assert {"users", "pontos"}.issubset(table_names)


def test_admin_user_list_requires_login(client):
    response = client.get("/admin/dashboard")

    assert response.status_code == 302
    assert "/admin/login" in response.headers["Location"]


def test_admin_login_rejects_invalid_credentials(client):
    response = login_admin(client, password="incorreta")

    assert response.status_code == 401
    assert b"Credenciais administrativas inv" in response.data


def test_admin_login_allows_admin_and_protected_route(app, client):
    create_admin(app)

    login_response = login_admin(client)
    dashboard_response = client.get("/admin/dashboard")

    assert login_response.status_code == 302
    assert "/admin/dashboard" in login_response.headers["Location"] or login_response.headers["Location"].endswith("/admin/")
    assert dashboard_response.status_code == 200
    assert b"Monitor da Portaria" in dashboard_response.data


def test_non_admin_user_cannot_access_admin_routes(app, client):
    with app.app_context():
        user = User(username="funcionario", role="funcionario")
        user.set_password("senha-segura")
        db.session.add(user)
        db.session.commit()

    response = login_admin(client, username="funcionario")

    assert response.status_code == 401


def test_admin_logout_clears_session(app, client):
    create_admin(app)
    login_admin(client)

    logout_response = client.post("/admin/logout")
    protected_response = client.get("/admin/dashboard")

    assert logout_response.status_code == 302
    assert logout_response.headers["Location"].endswith("/admin/login")
    assert protected_response.status_code == 302


def test_csrf_rejects_login_post_without_token(tmp_path):
    application = create_app(
        {
            "TESTING": True,
            "SECRET_KEY": "csrf-test-secret",
            "SQLALCHEMY_DATABASE_URI": "sqlite:///:memory:",
            "UPLOAD_FOLDER": str(tmp_path / "uploads-csrf"),
            "WTF_CSRF_ENABLED": True,
        }
    )

    response = application.test_client().post(
        "/admin/login",
        data={"username": "admin", "password": "senha"},
    )

    assert response.status_code == 400


def test_login_form_contains_csrf_token(tmp_path):
    application = create_app(
        {
            "TESTING": True,
            "SECRET_KEY": "csrf-form-secret",
            "SQLALCHEMY_DATABASE_URI": "sqlite:///:memory:",
            "UPLOAD_FOLDER": str(tmp_path / "uploads-form"),
            "WTF_CSRF_ENABLED": True,
        }
    )

    response = application.test_client().get("/admin/login")

    assert response.status_code == 200
    assert b'name="csrf_token"' in response.data


def test_validated_image_extension_accepts_real_png():
    assert validated_image_extension(make_image_file("PNG")) == ".png"


def test_validated_image_extension_rejects_fake_image():
    fake = FileStorage(stream=BytesIO(b"nao-e-imagem"), filename="foto.jpg")

    assert validated_image_extension(fake) is None


def test_unique_upload_name_prevents_overwrite():
    first = unique_upload_name(".jpg")
    second = unique_upload_name(".jpg")

    assert first != second
    assert first.endswith(".jpg")
    assert second.endswith(".jpg")


def test_punch_page_redirects_to_punch2(client):
    response = client.get("/punch")
    assert response.status_code in (301, 302)
    assert "/punch2" in response.headers["Location"]


def test_punch2_page_is_public_and_wired(client):
    response = client.get("/punch2")
    assert response.status_code == 200
    assert b"push2-punch.js" in response.data
    assert b"SIGA EDUCA" in response.data


def test_punch2_station_query_and_stations_page(client):
    station = client.get("/punch2?station=1")
    assert station.status_code == 200
    assert b"Estacao 1" in station.data or b"Esta" in station.data
    assert b"station-1" in station.data or b"stationId" in station.data

    page = client.get("/stations")
    assert page.status_code == 200
    assert b"station=1" in page.data
    assert b"station=2" in page.data


def test_punch_rejects_missing_image(client):
    response = client.post("/punch", data={})

    assert response.status_code == 400
    assert response.get_json()["success"] is False


def test_punch_dry_run_does_not_create_ponto(app, client, monkeypatch):
    import json

    import numpy as np

    from app.models import Ponto
    from app.punch import recognition
    from app.punch import routes as punch_routes

    encoding = np.arange(128, dtype=np.float64) / 128.0

    with app.app_context():
        user = User(
            username="sensor",
            name="Sensor Auto",
            role="funcionario",
            face_encoding=json.dumps(encoding.tolist()),
        )
        user.set_password("senha")
        db.session.add(user)
        db.session.commit()
        user_id = user.id

    recognition.invalidate_known_faces_cache()
    monkeypatch.setattr(
        punch_routes,
        "load_image_from_bytes",
        lambda data, max_side=400: np.zeros((40, 40, 3), dtype=np.uint8),
    )
    monkeypatch.setattr(
        punch_routes,
        "extract_face_encoding",
        lambda image, **kwargs: encoding.copy(),
    )

    response = client.post(
        "/punch",
        data={"image": (BytesIO(b"fake-jpeg"), "capture.jpg"), "dry_run": "1"},
    )

    assert response.status_code == 200
    body = response.get_json()
    assert body["success"] is True
    assert body["dry_run"] is True
    assert body["user"]["id"] == user_id

    with app.app_context():
        assert Ponto.query.filter_by(user_id=user_id).count() == 0


def test_punch_registers_entrada_and_saida(app, client, monkeypatch):
    import json

    import numpy as np

    from app.models import Ponto
    from app.punch import recognition
    from app.punch import routes as punch_routes

    encoding = np.arange(128, dtype=np.float64) / 128.0

    with app.app_context():
        user = User(
            username="funcionario",
            name="Funcionario Teste",
            role="funcionario",
            face_encoding=json.dumps(encoding.tolist()),
        )
        user.set_password("senha")
        db.session.add(user)
        db.session.commit()
        user_id = user.id

    recognition.invalidate_known_faces_cache()

    monkeypatch.setattr(
        punch_routes,
        "load_image_from_bytes",
        lambda data, max_side=400: np.zeros((40, 40, 3), dtype=np.uint8),
    )
    monkeypatch.setattr(
        punch_routes,
        "extract_face_encoding",
        lambda image, **kwargs: encoding.copy(),
    )

    first = client.post(
        "/punch",
        data={"image": (BytesIO(b"fake-jpeg-1"), "capture.jpg")},
    )
    second = client.post(
        "/punch",
        data={"image": (BytesIO(b"fake-jpeg-2"), "capture.jpg")},
    )

    assert first.status_code == 200
    assert first.get_json()["tipo"] == "ENTRADA"
    assert second.status_code == 200
    assert second.get_json()["tipo"] == "SAÍDA"

    with app.app_context():
        pontos = Ponto.query.filter_by(user_id=user_id).order_by(Ponto.id.asc()).all()
        assert [p.tipo for p in pontos] == ["ENTRADA", "SAÍDA"]


def test_punch_dedup_blocks_second_station(app, client, monkeypatch):
    import json

    import numpy as np

    from app.models import Ponto
    from app.punch import recognition
    from app.punch import routes as punch_routes

    encoding = np.arange(128, dtype=np.float64) / 128.0
    app.config["PUNCH_DEDUP_SECONDS"] = 120

    with app.app_context():
        user = User(
            username="aluno-dup",
            name="Aluno Dup",
            role="funcionario",
            face_encoding=json.dumps(encoding.tolist()),
        )
        user.set_password("senha")
        db.session.add(user)
        db.session.commit()
        user_id = user.id

    recognition.invalidate_known_faces_cache()
    monkeypatch.setattr(
        punch_routes,
        "load_image_from_bytes",
        lambda data, max_side=400: np.zeros((40, 40, 3), dtype=np.uint8),
    )
    monkeypatch.setattr(
        punch_routes,
        "extract_face_encoding",
        lambda image, **kwargs: encoding.copy(),
    )

    first = client.post(
        "/punch",
        data={"image": (BytesIO(b"cam1"), "a.jpg"), "station_id": "station-1"},
    )
    second = client.post(
        "/punch",
        data={"image": (BytesIO(b"cam2"), "b.jpg"), "station_id": "station-3"},
    )

    assert first.status_code == 200
    assert first.get_json()["tipo"] == "ENTRADA"
    assert second.status_code == 409
    assert second.get_json()["duplicate"] is True

    with app.app_context():
        assert Ponto.query.filter_by(user_id=user_id).count() == 1


def test_punch_unknown_face_returns_404(app, client, monkeypatch):
    import json

    import numpy as np

    from app.punch import recognition
    from app.punch import routes as punch_routes

    known = np.zeros(128, dtype=np.float64)
    unknown = np.ones(128, dtype=np.float64)

    with app.app_context():
        user = User(
            username="cadastrado",
            role="funcionario",
            face_encoding=json.dumps(known.tolist()),
        )
        user.set_password("senha")
        db.session.add(user)
        db.session.commit()

    recognition.invalidate_known_faces_cache()
    monkeypatch.setattr(
        punch_routes,
        "load_image_from_bytes",
        lambda data, max_side=400: np.zeros((40, 40, 3), dtype=np.uint8),
    )
    monkeypatch.setattr(
        punch_routes,
        "extract_face_encoding",
        lambda image, **kwargs: unknown,
    )

    response = client.post(
        "/punch",
        data={"image": (BytesIO(b"fake-jpeg"), "capture.jpg")},
    )

    assert response.status_code == 404
    assert "não reconhecido" in response.get_json()["message"].lower()
