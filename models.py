"""
Pydantic models for validating EHR report JSON (matches frontend schema).

Used to validate LLM output before sending to the frontend.
"""

from __future__ import annotations

from typing import Optional
from pydantic import BaseModel, ConfigDict, model_validator


class InputGroup(BaseModel):
    """A multi-value input field (e.g., 'Measured: int_box mm')."""
    model_config = ConfigDict(extra="allow")

    type: str = "group"
    rawKey: str = ""
    pattern: list[dict] = []
    values: list[str] = []


class SubsectionEntry(BaseModel):
    model_config = ConfigDict(extra="allow")

    attrs: dict[str, bool] = {}
    inputs: list[InputGroup] = []


class SectionEntry(BaseModel):
    model_config = ConfigDict(extra="allow")

    attrs: dict[str, bool] = {}
    inputs: list[InputGroup] = []
    subsections: dict[str, SubsectionEntry] = {}


class DiseaseEntry(BaseModel):
    model_config = ConfigDict(extra="allow")

    sublocations: list[str] = []
    sections: dict[str, SectionEntry] = {}
    comments: str = ""
    startFrame: Optional[int] = None
    endFrame: Optional[int] = None
    segmentationFrame: Optional[int] = None


class LocationEntry(BaseModel):
    model_config = ConfigDict(extra="allow")

    diseases: dict[str, DiseaseEntry] = {}


VALID_LOCATIONS = {"Esophagus", "GE Junction", "Stomach", "Duodenum"}


class EHRReport(BaseModel):
    """Top-level report structure. Keys are location names."""
    model_config = ConfigDict(extra="allow")

    report: dict[str, LocationEntry] = {}
    overallRemarks: str = ""

    @model_validator(mode="after")
    def validate_locations(self) -> "EHRReport":
        invalid = [k for k in self.report if k not in VALID_LOCATIONS]
        for k in invalid:
            del self.report[k]
        return self


def validate_llm_response(data: dict, schema: dict | None = None) -> EHRReport | None:
    """
    Validate and parse LLM response into an EHRReport.

    Args:
        data: Raw dict from JSON-parsed LLM response
        schema: Optional EHR schema (for disease name validation)

    Returns:
        Validated EHRReport or None if parsing fails
    """
    try:
        # Handle case where LLM returns report directly (without wrapper)
        if "report" not in data and any(k in VALID_LOCATIONS for k in data):
            data = {"report": data}

        parsed = EHRReport.model_validate(data)

        # Validate disease names against schema if provided
        if schema and "diseases" in schema:
            valid_diseases = set(schema["diseases"].keys())
            for loc_name, loc_entry in list(parsed.report.items()):
                for disease_name in list(loc_entry.diseases.keys()):
                    if disease_name not in valid_diseases:
                        del loc_entry.diseases[disease_name]
                # Remove empty locations
                if not loc_entry.diseases:
                    del parsed.report[loc_name]

        return parsed

    except Exception:
        return None
