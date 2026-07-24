"""Limpa pontos faciais do dia informado (America/Belem ~ UTC-3)."""
from __future__ import annotations

import argparse
import sqlite3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_DB = ROOT / "instance" / "ponto.db"
DESKTOP_DB = Path.home() / "Desktop" / "reconhecimento_facial-main" / "instance" / "ponto.db"


def clear_day(db_path: Path, day: str) -> int:
    if not db_path.is_file():
        print(f"DB ausente: {db_path}")
        return 0
    con = sqlite3.connect(str(db_path))
    try:
        before = con.execute(
            """
            SELECT id, user_id, tipo, timestamp, sync_status
            FROM pontos
            WHERE date(timestamp) = ?
               OR date(datetime(timestamp, '-3 hours')) = ?
               OR substr(timestamp, 1, 10) = ?
            ORDER BY id
            """,
            (day, day, day),
        ).fetchall()
        print(f"[{db_path}] encontrados: {len(before)}")
        for row in before:
            print(" ", row)
        cur = con.execute(
            """
            DELETE FROM pontos
            WHERE date(timestamp) = ?
               OR date(datetime(timestamp, '-3 hours')) = ?
               OR substr(timestamp, 1, 10) = ?
            """,
            (day, day, day),
        )
        con.commit()
        print(f"[{db_path}] removidos: {cur.rowcount}")
        return cur.rowcount or 0
    finally:
        con.close()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--day", default="2026-07-24")
    args = parser.parse_args()
    total = 0
    total += clear_day(DEFAULT_DB, args.day)
    if DESKTOP_DB.is_file():
        total += clear_day(DESKTOP_DB, args.day)
    print(f"total removidos: {total}")


if __name__ == "__main__":
    main()
