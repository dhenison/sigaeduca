# -*- coding: utf-8 -*-
"""Swap duplicated Tailwind configs for js/siga-theme.js (Academic Core)."""
from __future__ import annotations

import os
import re
from pathlib import Path

ROOT = Path(r"C:\Users\USER\Documents\Siga Educa")


def skip_path(p: Path) -> bool:
    parts = set(p.parts)
    return "node_modules" in parts or ".git" in parts or "tmp" in parts


def theme_src_for(html: Path) -> str:
    rel = html.relative_to(ROOT).as_posix()
    if rel.startswith("reconhecimento-facial/"):
        depth = len(html.parent.relative_to(ROOT / "reconhecimento-facial").parts)
        return "../" * depth + "static/js/siga-theme.js"
    rel_js = os.path.relpath(ROOT / "js" / "siga-theme.js", html.parent)
    return Path(rel_js).as_posix()


def replace_tailwind_config(html: Path, text: str) -> str:
    if "siga-theme.js" in text:
        return text
    src_attr = theme_src_for(html)
    tag = f'<script src="{src_attr}"></script>'

    pattern = re.compile(
        r'<script id="tailwind-config">[\s\S]*?</script>',
        re.IGNORECASE,
    )
    if pattern.search(text):
        text = pattern.sub(tag, text, count=1)
        text = pattern.sub("", text)
        return text

    idx = text.find("tailwind.config")
    if idx < 0:
        if "cdn.tailwindcss.com" in text:
            text = re.sub(
                r'(<script src="https://cdn\.tailwindcss\.com[^"]*"></script>)',
                r"\1\n" + tag,
                text,
                count=1,
            )
        return text

    open_script = text.rfind("<script", 0, idx)
    close_script = text.find("</script>", idx)
    if open_script >= 0 and close_script > idx:
        block = text[open_script : close_script + 9]
        if "tailwind.config" in block:
            text = text[:open_script] + tag + text[close_script + 9 :]
    return text


def polish_html(text: str) -> str:
    text = text.replace("Space Grotesk", "Inter")
    text = text.replace("JetBrains Mono", "Inter")
    text = text.replace("--sidebar-width: 260px", "--sidebar-width: 240px")
    text = text.replace("w-[260px]", "w-[240px]")
    text = text.replace("left-[260px]", "left-[240px]")
    text = text.replace("ml-[260px]", "ml-[240px]")
    text = text.replace("background-color: #F7FAF8", "background-color: #F8FAFC")
    text = text.replace("background-color: #f7faf8", "background-color: #F8FAFC")
    text = text.replace("color: #121C2A", "color: #0b1c30")
    text = text.replace("color: #121c2a", "color: #0b1c30")
    text = text.replace("stroke=\"#2EAF62\"", "stroke=\"#1E3A8A\"")
    text = text.replace("stroke=\"#2eaf62\"", "stroke=\"#1E3A8A\"")
    text = text.replace("bg-[#E8F5E9]", "bg-primary-fixed")
    text = text.replace("border-[#2EAF62]", "border-primary-container")
    text = text.replace("text-[#1B5E20]", "text-primary")
    text = text.replace("data-accent=\"#006d37\"", "data-accent=\"#1e3a8a\"")
    text = text.replace("bg-[#006d37]", "bg-[#1e3a8a]")
    text = text.replace('title="Verde"', 'title="Azul institucional"')
    return text


def read_html(p: Path) -> str:
    return p.read_bytes().decode("utf-8")


def write_html(p: Path, text: str) -> None:
    p.write_bytes(text.encode("utf-8"))


def main() -> None:
    html_files = [p for p in ROOT.rglob("*.html") if not skip_path(p)]
    n = 0
    for p in html_files:
        original = read_html(p)
        text = original
        if "cdn.tailwindcss.com" in text or "tailwind.config" in text:
            text = replace_tailwind_config(p, text)
        text = polish_html(text)
        if text != original:
            write_html(p, text)
            n += 1
            print(p.relative_to(ROOT).as_posix())
    print("updated", n, "html files")


if __name__ == "__main__":
    main()
