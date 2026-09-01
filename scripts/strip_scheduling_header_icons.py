"""Remove decorative Lucide icons from scheduling section headers without breaking JSX."""
import re
from pathlib import Path

root = Path(__file__).resolve().parents[1] / "frontend" / "app" / "agents" / "scheduling"

# Only unwrap gap-2 blocks that contain one of the decorative icons + h2/h3.
HEADER_WITH_ICON = re.compile(
    r'<div className="flex items-center gap-2">\s*'
    r'<(?:Zap|ShieldCheck|Filter|Clock|Building|TrendingDown|Thermometer)[^>]*/>\s*'
    r'(<h[23][^>]*>[\s\S]*?</h[23]>)\s*'
    r'</div>',
    re.MULTILINE,
)

for path in sorted(root.rglob("*.tsx")):
    text = path.read_text(encoding="utf-8")
    new_text = HEADER_WITH_ICON.sub(r"\1", text)
    if new_text != text:
        path.write_text(new_text, encoding="utf-8")
        print("updated", path.name)
