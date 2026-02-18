"""
EHR Schema Builder — Generates canonical EHR schema JSON + ASR phrase set from CSV.

Usage:
    python schema_builder.py EGD_Heirarchial_Menu-20260214.csv

Outputs:
    - EHR schema JSON (for LLM context)
    - Phrase hints list (for Google Cloud Speech-to-Text adaptation)
"""

import csv
import json
import re
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


# ── Common English words to EXCLUDE from phrase hints ──
# These are words that ASR already handles well. We only want medical jargon
# that ASR might misrecognize without hints.

COMMON_WORDS = {
    # Articles, conjunctions, prepositions
    "a", "an", "the", "and", "or", "but", "not", "if", "as", "so",
    "of", "in", "on", "at", "to", "for", "from", "with", "by", "per",
    "after", "before", "during", "within", "between", "into", "over",
    "less", "than", "more", "greater", "about", "up", "down", "out",
    # Common verbs
    "is", "are", "was", "were", "has", "have", "had", "been", "be",
    "taken", "done", "seen", "performed", "achieved", "required", "needed",
    "attempted", "planned", "recommended", "suspected", "confirmed", "known",
    "measured", "specify", "describe", "select", "assess", "assessed",
    "indicated", "removed", "placed", "used", "noted", "observed",
    "obtained", "sent", "taken", "given", "applied", "deferred",
    "avoided", "considered", "feasible", "applicable", "visualized",
    # Basic yes/no/presence
    "yes", "no", "none", "other", "present", "absent", "unknown",
    "normal", "positive", "negative", "true", "false",
    # Quantity/size descriptors
    "single", "multiple", "few", "numerous", "many", "several",
    "small", "medium", "large", "giant", "tiny", "massive",
    "entire", "whole", "total", "only", "all", "both", "each",
    # Severity/quality
    "mild", "moderate", "severe", "minimal", "significant", "marked",
    "good", "poor", "fair", "adequate", "inadequate",
    "partial", "complete", "incomplete", "failed", "success", "successful",
    "active", "inactive", "acute", "chronic",
    # Distribution
    "localised", "localized", "focal", "patchy", "diffuse",
    "generalized", "generalised", "scattered", "widespread",
    "flat", "raised", "slightly", "deeply", "elevated", "depressed",
    # Shape/quality (common English)
    "clean", "smooth", "round", "irregular", "rough", "clear",
    "soft", "hard", "firm", "thin", "thick", "narrow", "wide",
    "long", "short", "deep", "shallow",
    "well", "defined", "ill", "new", "old", "fresh",
    "dark", "light", "white", "black", "red", "blue", "brown", "yellow",
    "pale", "bright", "dull",
    # Directional
    "left", "right", "upper", "lower", "anterior", "posterior",
    "lateral", "medial", "superior", "inferior",
    "proximal", "distal", "central", "peripheral",
    # General categories (common English)
    "type", "grade", "stage", "size", "number", "count", "total",
    "appearance", "morphology", "pattern", "features", "status",
    "location", "surface", "color", "view", "site", "area", "region",
    "body", "wall", "border", "edge", "base", "margin", "tip",
    # Clinical process terms (common English)
    "biopsy", "therapy", "treatment", "intervention", "procedure",
    "diagnosis", "impression", "plan", "follow", "referral",
    "result", "outcome", "response", "effect", "cause",
    "risk", "complication", "complications", "bleeding", "blood",
    "lesion", "mass", "tissue", "fluid", "debris",
    # Units
    "mm", "cm", "ml", "sec", "min", "bits",
    # Negation phrases
    "not", "non", "no",
}


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


def extract_phrase_hints(schema: dict) -> list[str]:
    """
    Extract medical jargon phrases from the schema for Google ASR adaptation.

    Google ASR PhraseSet limit: 500 phrases. We prioritize:
    1. Disease names (most important — unique medical terms)
    2. Short medical terms from attributes (1-4 words)
    3. Sublocation anatomical terms
    4. Section/subsection names that are medical terms

    Filters out: common English, long descriptive sentences, input patterns,
    numbers, ranges, and near-duplicates.
    """
    # Separate by priority tier
    tier1_diseases = set()  # Disease names — always include
    tier2_terms = set()     # Short medical attribute values
    tier3_anatomy = set()   # Sublocation anatomical terms
    tier4_sections = set()  # Section/subsection names

    # Disease names
    for dname in schema["diseases"]:
        tier1_diseases.add(dname)

    # Section names, subsection names, attribute values
    for dname, ddef in schema["diseases"].items():
        for sname, sdef in ddef.get("sections", {}).items():
            tier4_sections.add(sname)
            for attr in sdef.get("attributes", []):
                _collect_medical_terms(tier2_terms, attr)
            for subname, subdef in sdef.get("subsections", {}).items():
                tier4_sections.add(subname)
                for attr in subdef.get("attributes", []):
                    _collect_medical_terms(tier2_terms, attr)

    # Sublocation terms
    for loc, sublocs in schema["sublocations"].items():
        if isinstance(sublocs, list):
            for s in sublocs:
                tier3_anatomy.add(s)
        elif isinstance(sublocs, dict):
            for region, options in sublocs.items():
                if region != "_standalone":
                    tier3_anatomy.add(region)
                if isinstance(options, list):
                    for opt in options:
                        tier3_anatomy.add(opt)

    # Apply filters to each tier
    result = set()
    for phrase in tier1_diseases:
        if _is_useful_hint(phrase):
            result.add(phrase)
    for phrase in tier3_anatomy:
        if _is_useful_hint(phrase):
            result.add(phrase)
    for phrase in tier2_terms:
        if _is_useful_hint(phrase):
            result.add(phrase)
    for phrase in tier4_sections:
        if _is_useful_hint(phrase):
            result.add(phrase)

    # Case-insensitive dedup (keep first encountered version)
    seen_lower = {}
    for h in sorted(result):
        low = h.lower()
        if low not in seen_lower:
            seen_lower[low] = h

    # Return all valid hints sorted. The ASR bridge splits into
    # multiple PhraseSets of 500 each (Google API limit per set).
    return sorted(seen_lower.values())


def _collect_medical_terms(terms: set, attr: str):
    """Extract useful phrase hints from an attribute value."""
    attr = attr.strip()
    if not attr:
        return
    # Skip pure input box patterns
    if re.match(r"^(int_box|float_box|alphanum_box)(\s|$)", attr, re.I):
        return
    if re.search(r"\b(int_box|float_box|alphanum_box)\b", attr, re.I):
        # Has input box mixed with text — extract the text part only
        text_part = re.sub(r"\b(int_box|float_box|alphanum_box)\b", "", attr).strip()
        text_part = re.sub(r"\s+", " ", text_part).strip(" :,")
        if text_part and len(text_part) > 2:
            terms.add(text_part)
        return
    # Skip Range(...)
    if re.match(r"^Range\(", attr, re.I):
        return
    terms.add(attr)


def _is_useful_hint(phrase: str) -> bool:
    """Check if a phrase is worth including as an ASR hint.

    We want terms that ASR might misrecognize — medical jargon, Latin/Greek
    terms, proper nouns, abbreviations. NOT phrases composed entirely of
    common English words (ASR handles those fine).
    """
    phrase = phrase.strip()
    if not phrase or len(phrase) < 3:
        return False
    # Skip pure numbers and size ranges
    if re.match(r"^[<>≤≥]?\s*\d", phrase):
        return False
    # Skip very long phrases (>50 chars)
    if len(phrase) > 50:
        return False
    # Skip phrases with too many words (>4)
    word_count = len(phrase.split())
    if word_count > 4:
        return False
    # Must contain at least one medical/uncommon word
    return _has_medical_word(phrase)


def _has_medical_word(phrase: str) -> bool:
    """Check if a phrase contains at least one word ASR would struggle with."""
    cleaned = re.sub(r"\([^)]*\)", "", phrase)
    cleaned = re.sub(r"[<>≤≥/–—:,.'\"()]", " ", cleaned)
    words = [w.strip().lower() for w in cleaned.split() if w.strip()]
    if not words:
        return False
    for w in words:
        if len(w) <= 2:
            continue
        if w in COMMON_WORDS:
            continue
        # If the word is not common English, it's likely medical jargon
        return True
    return False


# ── CLI ──

def main():
    if len(sys.argv) < 2:
        print("Usage: python schema_builder.py <CSV_FILE>", file=sys.stderr)
        sys.exit(1)

    csv_path = sys.argv[1]
    with open(csv_path, "r", encoding="utf-8") as f:
        csv_text = f.read()

    schema = build_schema(csv_text)
    phrase_hints = extract_phrase_hints(schema)

    # Print schema
    print("=" * 60)
    print("EHR SCHEMA")
    print("=" * 60)
    print(json.dumps(schema, indent=2, ensure_ascii=False))

    # Print phrase hints
    print("\n" + "=" * 60)
    print(f"PHRASE HINTS ({len(phrase_hints)} phrases)")
    print("=" * 60)
    print(json.dumps(phrase_hints, indent=2, ensure_ascii=False))

    # Print stats
    print("\n" + "=" * 60)
    print("STATS")
    print("=" * 60)
    print(f"  Diseases: {len(schema['diseases'])}")
    total_sections = sum(
        len(d["sections"]) for d in schema["diseases"].values()
    )
    print(f"  Total sections: {total_sections}")
    print(f"  Phrase hints: {len(phrase_hints)}")
    schema_json = json.dumps(schema, separators=(",", ":"), ensure_ascii=False)
    print(f"  Schema JSON size: {len(schema_json):,} bytes")


if __name__ == "__main__":
    main()
