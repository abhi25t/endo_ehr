"""
EHR Schema Builder — Generates canonical EHR schema JSON from CSV.

Usage:
    python schema_builder.py EGD_Heirarchial_Menu-20260214.csv

Outputs:
    - EHR schema JSON (for LLM context)
"""

import csv
import json
import sys
import io
from collections import OrderedDict


# ── Sublocation constants (must match src/js/05-constants.js) ──

SUBLOCATIONS = {
    "Esophagus": ["Cricopharynx", "Upper", "Middle", "Lower", "Whole esophagus", "Anastomosis"],
    "GE Junction": ["Z-line", "Hiatal hernia", "Diaphragmatic pinch"],
    "Stomach": {
        "Antrum": ["Lesser Curvature", "Greater Curvature", "Posterior Wall", "Anterior Wall", "Entire"],
        "Incisura": ["Lesser Curvature", "Posterior Wall", "Anterior Wall", "Entire"],
        "Lower Body": ["Lesser Curvature", "Greater Curvature", "Posterior Wall", "Anterior Wall", "Entire"],
        "Middle Upper Body": ["Lesser Curvature", "Greater Curvature", "Posterior Wall", "Anterior Wall", "Entire"],
        "Fundus": ["Lesser Curvature", "Greater Curvature", "Posterior Wall", "Anterior Wall", "Entire"],
        "_standalone": ["Whole Stomach", "Whole Body", "Cardia", "Prepyloric region", "Pylorus", "Anastomosis"],
    },
    "Duodenum": {
        "D1 Bulb": ["Anterior wall", "Posterior wall", "Superior wall", "Inferior wall", "Entire"],
        "D2": ["Ampullary region", "Medial wall", "Lateral wall", "Inferior wall", "Superior wall", "Entire"],
        "_standalone": ["D1-D2 junction", "D3", "D4", "Anastomosis", "Major papilla", "Minor papilla"],
    },
}

LOCATION_COLS = ["Esophagus", "GE Junction", "Stomach", "Duodenum"]


def _is_x(val: str) -> bool:
    """Check if a CSV cell marks a location as applicable."""
    return bool(val) and "x" in val.lower()


def _extract_attributes(row: dict) -> list[str]:
    """Extract non-empty attribute values from Attribute1..Attribute12."""
    attrs = []
    for i in range(1, 13):
        val = (row.get(f"Attribute{i}") or "").strip()
        if val:
            attrs.append(val)
    return attrs


def build_schema(csv_text: str) -> dict:
    """
    Parse CSV text and produce a canonical EHR schema for the LLM.

    Returns:
        {
            "locations": ["Esophagus", ...],
            "sublocations": { ... },
            "diseases": {
                "DiseaseName": {
                    "locations": ["Stomach", ...],
                    "default_sublocation": "...",
                    "sections": {
                        "SectionName": {
                            "multi": false,
                            "attributes": ["attr1", ...],
                            "subsections": {
                                "SubsectionName": {
                                    "multi": false,
                                    "attributes": ["attr1", ...],
                                    "conditional": "..."  // optional
                                }
                            }
                        }
                    }
                }
            }
        }
    """
    reader = csv.DictReader(io.StringIO(csv_text))

    diseases = OrderedDict()

    for row in reader:
        diagnosis = (row.get("Diagnosis") or "").strip()
        if not diagnosis:
            continue

        # Initialize disease entry
        if diagnosis not in diseases:
            diseases[diagnosis] = {
                "locations": [],
                "default_sublocation": (row.get("Default_Sub_Location") or "").strip(),
                "sections": OrderedDict(),
            }

        d = diseases[diagnosis]

        # Accumulate locations (dedup)
        for loc in LOCATION_COLS:
            if _is_x(row.get(loc, "")) and loc not in d["locations"]:
                d["locations"].append(loc)

        # Update default_sublocation if this row has one and disease doesn't yet
        if not d["default_sublocation"]:
            ds = (row.get("Default_Sub_Location") or "").strip()
            if ds:
                d["default_sublocation"] = ds

        section_name = (row.get("Section") or "").strip()
        if not section_name:
            continue

        subsection_name = (row.get("Subsection") or "").strip()
        multi_raw = (row.get("Multi_Attribute") or "").strip().lower()
        is_multi = "x" in multi_raw or "yes" in multi_raw or "multi" in multi_raw
        conditional = (row.get("Conditional_on") or "").strip()
        attrs = _extract_attributes(row)

        # Build section entry
        if section_name not in d["sections"]:
            d["sections"][section_name] = {
                "multi": False,
                "attributes": [],
                "subsections": OrderedDict(),
            }

        sec = d["sections"][section_name]

        if not subsection_name:
            # Section-level row
            if is_multi:
                sec["multi"] = True
            for a in attrs:
                if a not in sec["attributes"]:
                    sec["attributes"].append(a)
        else:
            # Subsection-level row
            if subsection_name not in sec["subsections"]:
                sec["subsections"][subsection_name] = {
                    "multi": False,
                    "attributes": [],
                }
            sub = sec["subsections"][subsection_name]
            if is_multi:
                sub["multi"] = True
            for a in attrs:
                if a not in sub["attributes"]:
                    sub["attributes"].append(a)
            if conditional:
                sub["conditional"] = conditional

    # Clean up empty fields
    for dname, ddef in diseases.items():
        for sname, sdef in list(ddef["sections"].items()):
            if not sdef["attributes"]:
                del sdef["attributes"]
            for subname, subdef in list(sdef["subsections"].items()):
                if not subdef["attributes"]:
                    del subdef["attributes"]
            if not sdef["subsections"]:
                del sdef["subsections"]

    return {
        "locations": LOCATION_COLS,
        "sublocations": SUBLOCATIONS,
        "diseases": diseases,
    }


# ── CLI ──

def main():
    if len(sys.argv) < 2:
        print("Usage: python schema_builder.py <CSV_FILE>", file=sys.stderr)
        sys.exit(1)

    csv_path = sys.argv[1]
    with open(csv_path, "r", encoding="utf-8") as f:
        csv_text = f.read()

    schema = build_schema(csv_text)

    # Print schema
    print("=" * 60)
    print("EHR SCHEMA")
    print("=" * 60)
    print(json.dumps(schema, indent=2, ensure_ascii=False))

    # Print stats
    print("\n" + "=" * 60)
    print("STATS")
    print("=" * 60)
    print(f"  Diseases: {len(schema['diseases'])}")
    total_sections = sum(
        len(d["sections"]) for d in schema["diseases"].values()
    )
    print(f"  Total sections: {total_sections}")
    schema_json = json.dumps(schema, separators=(",", ":"), ensure_ascii=False)
    print(f"  Schema JSON size: {len(schema_json):,} bytes")


if __name__ == "__main__":
    main()
