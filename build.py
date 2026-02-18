#!/usr/bin/env python3
"""
Build script for Endo_EHR.
Reads src/Endo_EHR.html (dev version with <script src> tags),
inlines all local JS files, and writes the distributable Endo_EHR.html.
"""

import re
import sys
from pathlib import Path

SRC_DIR = Path(__file__).parent / "src"
SRC_HTML = SRC_DIR / "Endo_EHR.html"
OUT_HTML = Path(__file__).parent / "Endo_EHR.html"

# Pattern to match local script tags like <script src="js/01-debug.js"></script>
SCRIPT_TAG_RE = re.compile(
    r'<script\s+src="(js/[^"]+\.js)"\s*>\s*</script>'
)


def build():
    if not SRC_HTML.exists():
        print(f"Error: {SRC_HTML} not found", file=sys.stderr)
        sys.exit(1)

    html = SRC_HTML.read_text(encoding="utf-8")
    js_parts = []
    files_inlined = []

    # Find all local script tags and collect their contents
    for match in SCRIPT_TAG_RE.finditer(html):
        js_path = SRC_DIR / match.group(1)
        if not js_path.exists():
            print(f"Error: {js_path} not found", file=sys.stderr)
            sys.exit(1)
        js_parts.append(js_path.read_text(encoding="utf-8"))
        files_inlined.append(match.group(1))

    if not js_parts:
        print("Error: No local <script src> tags found in source HTML", file=sys.stderr)
        sys.exit(1)

    # Replace all local script tags with a single inline <script> block
    # Strategy: remove all local script tags, then insert combined script
    # before </body>

    # Remove all local script tags
    output = SCRIPT_TAG_RE.sub("", html)

    # Remove blank lines left behind from removed script tags
    output = re.sub(r'\n{3,}', '\n\n', output)

    # Combine all JS into one block
    combined_js = "\n".join(js_parts)

    # Insert before </body>
    output = output.replace("</body>", f"<script>\n{combined_js}\n</script>\n</body>")

    OUT_HTML.write_text(output, encoding="utf-8")

    print(f"Built {OUT_HTML}")
    print(f"  Inlined {len(files_inlined)} JS files:")
    for f in files_inlined:
        print(f"    - {f}")
    print(f"  Output size: {len(output):,} bytes")


if __name__ == "__main__":
    build()
