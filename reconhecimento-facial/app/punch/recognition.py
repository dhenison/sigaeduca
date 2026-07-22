"""Reconhecimento facial otimizado para batida de ponto."""

from __future__ import annotations

import json
import time
from dataclasses import dataclass
from io import BytesIO
from typing import Any

import face_recognition
import numpy as np
from PIL import Image

from app.models import User

# Cache curto dos encodings cadastrados (evita reparsear JSON a cada batida).
_CACHE_TTL_SECONDS = 30.0
_known_cache: dict[str, Any] = {
    "loaded_at": 0.0,
    "user_ids": [],
    "names": [],
    "usernames": [],
    "encodings": None,
}

# Limite de lado maior da imagem: ~400px exige aproximação e ainda detecta bem de perto.
DEFAULT_MAX_SIDE = 400
DEFAULT_TOLERANCE = 0.57
DEFAULT_UPSAMPLE = 1


@dataclass(frozen=True)
class MatchResult:
    user_id: int
    name: str
    username: str
    distance: float


def invalidate_known_faces_cache() -> None:
    """Limpa o cache após cadastro/atualização biométrica."""
    _known_cache["loaded_at"] = 0.0
    _known_cache["encodings"] = None
    _known_cache["user_ids"] = []
    _known_cache["names"] = []
    _known_cache["usernames"] = []


def load_image_from_bytes(data: bytes, max_side: int = DEFAULT_MAX_SIDE) -> np.ndarray:
    """Decodifica bytes de imagem e redimensiona para acelerar o HOG."""
    with Image.open(BytesIO(data)) as image:
        image = image.convert("RGB")
        width, height = image.size
        longest = max(width, height)
        if longest > max_side:
            scale = max_side / float(longest)
            image = image.resize(
                (max(1, int(width * scale)), max(1, int(height * scale))),
                Image.Resampling.BILINEAR,
            )
        return np.asarray(image)


def extract_face_encoding(
    rgb_image: np.ndarray,
    *,
    num_jitters: int = 0,
    upsample: int = DEFAULT_UPSAMPLE,
) -> np.ndarray | None:
    """Extrai um encoding com parâmetros pensados para velocidade."""
    locations = face_recognition.face_locations(
        rgb_image,
        number_of_times_to_upsample=max(0, int(upsample)),
        model="hog",
    )
    if not locations:
        return None

    encodings = face_recognition.face_encodings(
        rgb_image,
        known_face_locations=locations,
        num_jitters=num_jitters,
        model="small",
    )
    if not encodings:
        return None
    return encodings[0]


def encode_face_from_bytes(
    data: bytes,
    *,
    max_side: int = DEFAULT_MAX_SIDE,
    num_jitters: int = 0,
    upsample: int = DEFAULT_UPSAMPLE,
) -> np.ndarray | None:
    """Atalho: bytes de imagem → encoding facial."""
    rgb_image = load_image_from_bytes(data, max_side=max_side)
    return extract_face_encoding(
        rgb_image,
        num_jitters=num_jitters,
        upsample=upsample,
    )


def assess_face_framing(
    data: bytes,
    *,
    max_side: int = 320,
    upsample: int = 1,
) -> dict[str, Any]:
    """Avalia posição/tamanho do rosto para orientar o cadastro biométrico."""
    rgb_image = load_image_from_bytes(data, max_side=max_side)
    height, width = rgb_image.shape[:2]
    locations = face_recognition.face_locations(
        rgb_image,
        number_of_times_to_upsample=max(0, int(upsample)),
        model="hog",
    )

    if not locations:
        return {
            "faces": 0,
            "ready": False,
            "score": 0,
            "hint": "Nenhum rosto detectado. Entre no quadro e olhe para a câmera.",
            "checks": {
                "detected": False,
                "single": False,
                "centered": False,
                "size_ok": False,
            },
            "box": None,
            "image": {"width": width, "height": height},
        }

    if len(locations) > 1:
        return {
            "faces": len(locations),
            "ready": False,
            "score": 15,
            "hint": "Mais de um rosto na imagem. Deixe só uma pessoa no quadro.",
            "checks": {
                "detected": True,
                "single": False,
                "centered": False,
                "size_ok": False,
            },
            "box": None,
            "image": {"width": width, "height": height},
        }

    top, right, bottom, left = locations[0]
    face_w = max(1, right - left)
    face_h = max(1, bottom - top)
    cx = (left + right) / 2.0
    cy = (top + bottom) / 2.0
    width_ratio = face_w / float(width)
    height_ratio = face_h / float(height)
    offset_x = abs(cx - width / 2.0) / float(width)
    offset_y = abs(cy - height / 2.0) / float(height)

    size_ok = 0.28 <= width_ratio <= 0.58 and 0.34 <= height_ratio <= 0.72
    centered = offset_x <= 0.12 and offset_y <= 0.14

    score = 35
    if centered:
        score += 35
    if size_ok:
        score += 30
    # Bônus por proximidade do “tamanho ideal” (~42% da largura).
    score -= int(min(20, abs(width_ratio - 0.42) * 100))
    score = max(0, min(100, score))

    if not centered and not size_ok:
        if width_ratio < 0.28:
            hint = "Aproxime o rosto e centralize no oval."
        elif width_ratio > 0.58:
            hint = "Afaste um pouco e centralize no oval."
        elif cx < width / 2.0:
            hint = "Mova o rosto um pouco para a direita."
        else:
            hint = "Mova o rosto um pouco para a esquerda."
    elif not centered:
        if offset_x > offset_y:
            hint = (
                "Centralize horizontalmente: mova para a "
                + ("direita." if cx < width / 2.0 else "esquerda.")
            )
        else:
            hint = (
                "Centralize verticalmente: "
                + ("suba um pouco o queixo." if cy > height / 2.0 else "desça um pouco a cabeça.")
            )
    elif not size_ok:
        if width_ratio < 0.28:
            hint = "Aproxime-se: o rosto ainda está pequeno para o cadastro."
        else:
            hint = "Afaste-se um pouco: o rosto está preenchendo demais o quadro."
    else:
        hint = "Posição ideal. Mantenha e tire a foto."

    ready = bool(centered and size_ok)
    return {
        "faces": 1,
        "ready": ready,
        "score": score,
        "hint": hint,
        "checks": {
            "detected": True,
            "single": True,
            "centered": centered,
            "size_ok": size_ok,
        },
        "metrics": {
            "width_ratio": round(width_ratio, 3),
            "height_ratio": round(height_ratio, 3),
            "offset_x": round(offset_x, 3),
            "offset_y": round(offset_y, 3),
        },
        "box": {
            "top": top / height,
            "right": right / width,
            "bottom": bottom / height,
            "left": left / width,
        },
        "image": {"width": width, "height": height},
    }


def _load_known_faces(force: bool = False) -> tuple[list[int], list[str], list[str], np.ndarray | None]:
    now = time.monotonic()
    encodings = _known_cache["encodings"]
    if (
        not force
        and encodings is not None
        and (now - float(_known_cache["loaded_at"])) < _CACHE_TTL_SECONDS
    ):
        return (
            _known_cache["user_ids"],
            _known_cache["names"],
            _known_cache["usernames"],
            encodings,
        )

    users = (
        User.query.filter(User.face_encoding.isnot(None))
        .filter(User.face_encoding != "")
        .all()
    )

    user_ids: list[int] = []
    names: list[str] = []
    usernames: list[str] = []
    vectors: list[np.ndarray] = []

    for user in users:
        try:
            vector = np.asarray(json.loads(user.face_encoding), dtype=np.float64)
        except (TypeError, ValueError, json.JSONDecodeError):
            continue
        if vector.ndim != 1 or vector.size == 0:
            continue
        user_ids.append(user.id)
        names.append(user.name or user.username)
        usernames.append(user.username)
        vectors.append(vector)

    matrix = np.vstack(vectors) if vectors else None
    _known_cache.update(
        {
            "loaded_at": now,
            "user_ids": user_ids,
            "names": names,
            "usernames": usernames,
            "encodings": matrix,
        }
    )
    return user_ids, names, usernames, matrix


def find_best_match(
    unknown_encoding: np.ndarray,
    tolerance: float = DEFAULT_TOLERANCE,
) -> MatchResult | None:
    """Retorna o usuário com menor distância abaixo da tolerância."""
    user_ids, names, usernames, known = _load_known_faces()
    if known is None or len(user_ids) == 0:
        return None

    distances = face_recognition.face_distance(known, unknown_encoding)
    best_index = int(np.argmin(distances))
    best_distance = float(distances[best_index])
    if best_distance > tolerance:
        return None

    return MatchResult(
        user_id=user_ids[best_index],
        name=names[best_index],
        username=usernames[best_index],
        distance=best_distance,
    )
