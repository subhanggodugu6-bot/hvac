"""Remap dark-theme Tailwind classes to readable light-theme equivalents."""
from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1] / "frontend"

SKIP = {
    "components/layout/Sidebar.tsx",
    "components/layout/Header.tsx",
    "components/scheduling/EngineeringLimitsModal.tsx",
}

# Order matters: longer / more specific patterns first.
REPLACEMENTS: list[tuple[str, str]] = [
    ("border-white/[0.12]", "border-slate-200"),
    ("border-white/[0.08]", "border-slate-200"),
    ("border-white/[0.07]", "border-slate-200"),
    ("border-white/[0.06]", "border-slate-200"),
    ("border-white/[0.04]", "border-slate-200"),
    ("border-white/10", "border-slate-200"),
    ("border-white/5", "border-slate-200"),
    ("bg-white/[0.025]", "bg-slate-50"),
    ("bg-slate-950/80", "bg-slate-100"),
    ("bg-slate-950/70", "bg-slate-100"),
    ("bg-slate-950/60", "bg-slate-100"),
    ("bg-slate-950/40", "bg-slate-100"),
    ("bg-slate-900/70", "bg-slate-50"),
    ("bg-slate-900/60", "bg-slate-50"),
    ("bg-slate-800/80", "bg-slate-200"),
    ("bg-slate-800/40", "bg-slate-100"),
    ("hover:bg-slate-800/40", "hover:bg-slate-100"),
    ("bg-slate-800 ", "bg-slate-200 "),
    ("bg-slate-800\"", "bg-slate-200\""),
    ("bg-[#090B12]", "bg-slate-50"),
    ("bg-[#070b14]", "bg-slate-50"),
    ("bg-[#0c1220]", "bg-white"),
    ("text-slate-100", "text-slate-900"),
    ("text-slate-200", "text-slate-800"),
    ("text-emerald-300", "text-emerald-800"),
    ("text-rose-300", "text-rose-800"),
    ("text-amber-200", "text-amber-800"),
    ("text-cyan-300", "text-cyan-800"),
    ("text-sky-300", "text-sky-800"),
    ("text-violet-300", "text-violet-700"),
    ("text-slate-300", "text-slate-700"),
    # text-white last — only when not already part of btn-primary etc.
]

TEXT_WHITE_RE = re.compile(
    r'\btext-white\b(?!\s*/)'  # avoid text-white/80 opacity forms if any
)


def rel(path: Path) -> str:
    return path.relative_to(ROOT).as_posix()


def patch_file(path: Path) -> bool:
    if rel(path) in SKIP:
        return False
    original = path.read_text(encoding="utf-8")
    updated = original
    for old, new in REPLACEMENTS:
        updated = updated.replace(old, new)
    # Remap bare text-white except on colored buttons/badges.
    lines = updated.splitlines(keepends=True)
    out: list[str] = []
    changed = False
    for line in lines:
        if "text-white" in line and not any(
            tok in line
            for tok in (
                "btn-primary",
                "btn-danger",
                "chip-filter-on",
                "bh-nav-active",
                "bg-violet",
                "bg-purple",
                "bg-pink",
                "bg-sky-6",
                "bg-emerald-6",
                "text-white/",
            )
        ):
            new_line = TEXT_WHITE_RE.sub("text-slate-900", line)
            if new_line != line:
                changed = True
                line = new_line
        out.append(line)
    updated = "".join(out)
    if updated != original:
        path.write_text(updated, encoding="utf-8")
        return True
    return False


def main() -> None:
    touched: list[str] = []
    for path in sorted(ROOT.rglob("*.tsx")):
        if patch_file(path):
            touched.append(rel(path))
    print(f"updated {len(touched)} files")
    for name in touched[:40]:
        print(f"  {name}")
    if len(touched) > 40:
        print(f"  ... and {len(touched) - 40} more")


if __name__ == "__main__":
    main()
