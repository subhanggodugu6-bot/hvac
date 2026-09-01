from pathlib import Path

root = Path(__file__).resolve().parents[1] / "frontend"
dirs = [
    root / "app" / "agents" / "plant-control",
    root / "app" / "agents" / "scheduling",
    root / "components" / "scheduling",
]

replacements = [
    ("text-xs text-slate-400 font-mono", "text-xs text-slate-600 font-mono font-medium"),
    ("text-[11px] text-slate-400 font-mono", "text-[11px] text-slate-600 font-mono"),
    ("text-xs font-mono text-slate-400", "text-xs font-mono text-slate-600"),
    ("text-[10px] text-slate-400", "text-[10px] text-slate-600"),
    ("text-slate-400 font-mono", "text-slate-600 font-mono"),
    ("text-slate-400 font-sans", "text-slate-600 font-sans"),
    ('<span className="text-slate-400">', '<span className="text-slate-600">'),
    ("text-slate-400 block", "text-slate-600 block"),
    ("text-slate-400 flex", "text-slate-600 flex"),
    ("text-emerald-400 font-semibold", "text-emerald-700 font-semibold"),
    ("text-emerald-400 font-bold", "text-emerald-700 font-bold"),
    ("font-bold text-emerald-400", "font-bold text-emerald-700"),
    ("text-cyan-400 font-medium", "text-cyan-800 font-medium"),
    ("text-cyan-400 font-bold", "text-cyan-800 font-bold"),
    ("font-bold text-cyan-400", "font-bold text-cyan-800"),
    ("text-purple-400", "text-purple-700"),
    (
        "bg-emerald-500/10 border border-emerald-500/30 text-emerald-400",
        "pill-live",
    ),
]

for d in dirs:
    if not d.exists():
        continue
    for path in d.rglob("*.tsx"):
        text = path.read_text(encoding="utf-8")
        orig = text
        for old, new in replacements:
            text = text.replace(old, new)
        if text != orig:
            path.write_text(text, encoding="utf-8")
            print("updated", path.relative_to(root))
