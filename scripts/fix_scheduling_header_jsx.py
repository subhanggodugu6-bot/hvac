"""Fix broken section headers after icon-strip pass (orphan </div> after bare h3)."""
import re
from pathlib import Path

root = Path(__file__).resolve().parents[1] / "frontend" / "app" / "agents" / "scheduling"

# h3 is direct child of header row (no gap-2 wrapper) but still has orphan closing div.
BARE_H3_HEADER = re.compile(
    r'(<div className="(?:flex items-center justify-between border-b border-slate-200 pb-3|'
    r'flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-4 border-b border-slate-200 mb-4|'
    r'p-5 border-b border-slate-200 flex items-center justify-between)">\s*)'
    r'(<h3 className="text-sm font-semibold text-slate-900 tracking-tight">[\s\S]*?</h3>)\s*'
    r'</div>\s*'
    r'(<(?:span|div))',
    re.MULTILINE,
)


def fix_file(path: Path) -> bool:
    text = path.read_text(encoding="utf-8")
    new_text = BARE_H3_HEADER.sub(r"\1\2\n            \3", text)
    if new_text != text:
        path.write_text(new_text, encoding="utf-8")
        return True
    return False


for path in sorted(root.rglob("*.tsx")):
    if fix_file(path):
        print("fixed", path.name)
