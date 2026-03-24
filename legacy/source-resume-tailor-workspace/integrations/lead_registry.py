import json
import sqlite3
from pathlib import Path
from typing import Any, Dict, Optional

from src.needle.config import LEAD_REGISTRY_CONFIG
from src.needle.models import LeadRecord
from src.needle.simpleio import read_simple_yaml


def load_config() -> Dict[str, Any]:
    return read_simple_yaml(LEAD_REGISTRY_CONFIG)


def _db_path() -> Path:
    cfg = load_config()
    path = cfg.get("lead_registry", {}).get("path")
    if not path:
        raise RuntimeError("lead_registry.path missing from config")
    return Path(path)


def connect() -> sqlite3.Connection:
    conn = sqlite3.connect(_db_path())
    conn.row_factory = sqlite3.Row
    return conn


def _json_load(value: Optional[str], default):
    if not value:
        return default
    try:
        return json.loads(value)
    except Exception:
        return default


def get_lead(lead_uid: str) -> LeadRecord:
    conn = connect()
    try:
        row = conn.execute(
            """
            SELECT
              lead_uid,
              canonical_title,
              canonical_company,
              canonical_location,
              canonical_url,
              canonical_summary,
              canonical_date_posted,
              employment_type,
              remote,
              hybrid,
              role_family_hint,
              seniority_hint,
              current_decision,
              review_status,
              application_status,
              scores_json,
              signals_json,
              risks_json,
              metadata_json
            FROM leads
            WHERE lead_uid = ?
            LIMIT 1
            """,
            (lead_uid,),
        ).fetchone()
        if row is None:
            raise KeyError(f"Lead not found: {lead_uid}")

        latest_obs = conn.execute(
            """
            SELECT summary, raw_json
            FROM lead_observations
            WHERE lead_uid = ?
            ORDER BY created_at DESC
            LIMIT 1
            """,
            (lead_uid,),
        ).fetchone()

        summary = row["canonical_summary"] or ""
        if not summary and latest_obs is not None:
            summary = latest_obs["summary"] or ""
        if not summary and latest_obs is not None and latest_obs["raw_json"]:
            raw_payload = _json_load(latest_obs["raw_json"], {})
            summary = raw_payload.get("summary") or raw_payload.get("description") or ""

        return LeadRecord(
            lead_uid=row["lead_uid"],
            title=row["canonical_title"] or "",
            company=row["canonical_company"] or "",
            location=row["canonical_location"] or "",
            url=row["canonical_url"] or "",
            summary=summary,
            date_posted=row["canonical_date_posted"],
            employment_type=row["employment_type"],
            remote=bool(row["remote"]) if row["remote"] is not None else None,
            hybrid=bool(row["hybrid"]) if row["hybrid"] is not None else None,
            role_family_hint=row["role_family_hint"],
            seniority_hint=row["seniority_hint"],
            current_decision=row["current_decision"],
            review_status=row["review_status"],
            application_status=row["application_status"],
            scores=_json_load(row["scores_json"], {}),
            signals=_json_load(row["signals_json"], []),
            risks=_json_load(row["risks_json"], []),
            metadata=_json_load(row["metadata_json"], {}),
        )
    finally:
        conn.close()
