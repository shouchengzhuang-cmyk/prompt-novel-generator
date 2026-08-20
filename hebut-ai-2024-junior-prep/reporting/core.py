"""Compatibility facade for validation and report rendering."""

from .render import build_markdown_report
from .validation import AuditResult, load_contracts, load_manifest, validate_manifest

__all__ = [
    "AuditResult",
    "build_markdown_report",
    "load_contracts",
    "load_manifest",
    "validate_manifest",
]
