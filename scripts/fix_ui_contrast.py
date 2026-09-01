"""Bulk contrast fixes for light-theme HVAC UI surfaces."""
from pathlib import Path

root = Path(__file__).resolve().parents[1] / "frontend"

EXCLUDE = {
    "components/layout/Sidebar.tsx",
    "components/scheduling/EngineeringLimitsModal.tsx",
}

REPLACEMENTS = [
    ("text-xs text-slate-400 font-mono", "text-xs text-slate-600 font-mono font-medium"),
    ("text-[11px] text-slate-400 font-mono", "text-[11px] text-slate-600 font-mono"),
    ("text-xs font-mono text-slate-400", "text-xs font-mono text-slate-600"),
    ("text-[10px] text-slate-400", "text-[10px] text-slate-600"),
    ("text-slate-400 font-mono", "text-slate-600 font-mono"),
    ("text-slate-400 font-sans", "text-slate-600 font-sans"),
    ('<span className="text-slate-400">', '<span className="text-slate-600">'),
    ("text-slate-400 block", "text-slate-600 block"),
    ("text-slate-400 flex", "text-slate-600 flex"),
    ("text-slate-400 space-y", "text-slate-600 space-y"),
    ("text-slate-400 truncate", "text-slate-600 truncate"),
    ("text-slate-400 max-w", "text-slate-600 max-w"),
    ("text-slate-400 leading", "text-slate-600 leading"),
    ("text-slate-400 mt", "text-slate-600 mt"),
    ("text-slate-400 mb", "text-slate-600 mb"),
    ("text-slate-400 py", "text-slate-600 py"),
    ("text-slate-400 text-left", "text-slate-600 text-left"),
    ("text-slate-400 text-right", "text-slate-600 text-right"),
    ("text-slate-400 text-center", "text-slate-600 text-center"),
    ("text-slate-400 uppercase", "text-slate-600 uppercase"),
    ("text-slate-400 hover", "text-slate-600 hover"),
    ("text-slate-400\">", "text-slate-600\">"),
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
    ("text-amber-300", "text-amber-800"),
    ("bg-slate-200 text-slate-400", "pill-muted"),
    ("divide-y divide-white/[0.04]", "divide-y divide-slate-100"),
    ("bg-[#0d1524]", "bg-slate-100"),
    ("space-y-6 pb-12", "page-shell"),
    ('className="space-y-6 pb-12"', 'className="page-shell"'),
    ("border-slate-200 text-slate-400", "border-slate-200 text-slate-600"),
    ("bg-slate-200 border-slate-200 text-slate-400", "pill-muted border border-slate-200"),
    ("text-slate-400 text-xs", "text-slate-600 text-xs"),
    ("text-slate-400 text-[11px]", "text-slate-600 text-[11px]"),
    ("text-slate-400 font-semibold", "text-slate-600 font-semibold"),
    ("w-4 h-4 text-slate-400", "w-4 h-4 text-slate-500"),
    (": 'text-slate-400'", ": 'text-slate-600'"),
    ("? 'text-slate-400 line-through'", "? 'text-slate-500 line-through'"),
    ("text-amber-400", "text-amber-800"),
    ("text-rose-400", "text-rose-700"),
    ("bg-amber-500/10 border-amber-500/30 text-amber-800", "bg-amber-50 border border-amber-200 text-amber-800"),
    ("bg-rose-500/10 border-rose-500/30 text-rose-700", "pill-fail"),
    ("bg-rose-500/10 border border-rose-500/30 text-rose-700", "pill-fail"),
    ('overflow-x-auto">', 'overflow-x-auto eng-scroll">'),
]

for path in sorted(root.rglob("*.tsx")):
    rel = path.relative_to(root).as_posix()
    if rel in EXCLUDE:
        continue
    text = path.read_text(encoding="utf-8")
    orig = text
    for old, new in REPLACEMENTS:
        text = text.replace(old, new)
    if text != orig:
        path.write_text(text, encoding="utf-8")
        print("updated", rel)
