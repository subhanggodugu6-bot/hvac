"""Replace scheduling table empty rows with TableEmptyState."""
import re
from pathlib import Path

root = Path(__file__).resolve().parents[1] / "frontend" / "app" / "agents" / "scheduling"

PATTERN = re.compile(
    r'<tr><td colSpan=\{(\d+)\} className="text-slate-500 text-center py-4">NO DATA</td></tr>',
)

for path in sorted(root.rglob("*.tsx")):
    text = path.read_text(encoding="utf-8")
    if "TableEmptyState" not in text and not PATTERN.search(text):
        continue
    orig = text
    if "TableEmptyState" not in text:
        text = text.replace(
            "import { OpportunityWorkspace }",
            "import { TableEmptyState } from '@/components/hvac/TableEmptyState';\nimport { OpportunityWorkspace }",
            1,
        )
    text = PATTERN.sub(
        r'<TableEmptyState colSpan={\1} detail="No rows returned for this view." />',
        text,
    )
    if text != orig:
        path.write_text(text, encoding="utf-8")
        print("updated", path.name)
