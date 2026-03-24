from __future__ import annotations

import json
import sqlite3
from pathlib import Path
from typing import List, Optional

from .config import load_lead_registry_config
from .models import LeadRecord, LeadObservation, ParsedJob


class LeadRegistryAdapter:
    def __init__(self, workspace: Path):
        self.workspace = workspace
        cfg = load_lead_registry_config(workspace).get("lead_registry", {})
        self.db_path = Path(cfg["path"])

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(str(self.db_path))
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA busy_timeout = 3000")
        return conn

    @staticmethod
    def _loads(value, default):
        if not value:
            return default
        try:
            return json.loads(value)
        except Exception:
            return default

    def get_lead(self, lead_uid: str) -> Optional[LeadRecord]:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT * FROM leads WHERE lead_uid = ?",
                (lead_uid,),
            ).fetchone()
            if not row:
                return None
            return LeadRecord(
                lead_uid=row["lead_uid"],
                title=row["canonical_title"] or "",
                company=row["canonical_company"] or "",
                location=row["canonical_location"],
                url=row["canonical_url"],
                summary=row["canonical_summary"],
                seniority_hint=row["seniority_hint"],
                role_family_hint=row["role_family_hint"],
                work_mode_hint=row["work_mode_hint"],
                remote=bool(row["remote"]) if row["remote"] is not None else None,
                hybrid=bool(row["hybrid"]) if row["hybrid"] is not None else None,
                current_decision=row["current_decision"],
                review_status=row["review_status"],
                application_status=row["application_status"],
                scores=self._loads(row["scores_json"], {}),
                signals=self._loads(row["signals_json"], []),
                risks=self._loads(row["risks_json"], []),
                metadata=self._loads(row["metadata_json"], {}),
                observation_count=row["observation_count"] or 0,
                source_count=row["source_count"] or 0,
            )

    def get_latest_observations(self, lead_uid: str, limit: int = 3) -> List[LeadObservation]:
        with self._connect() as conn:
            rows = conn.execute(
                "SELECT * FROM lead_observations WHERE lead_uid = ? ORDER BY created_at DESC LIMIT ?",
                (lead_uid, limit),
            ).fetchall()
        return [
            LeadObservation(
                observation_id=row["observation_id"],
                lead_uid=row["lead_uid"],
                source=row["source"],
                source_job_id=row["source_job_id"],
                summary=row["summary"],
                raw_json=self._loads(row["raw_json"], {}),
                canonical_snapshot=self._loads(row["canonical_snapshot_json"], {}),
                searched_at=row["searched_at"],
            )
            for row in rows
        ]

    def parse_lead(self, lead_uid: str) -> ParsedJob:
        lead = self.get_lead(lead_uid)
        if not lead:
            raise ValueError(f"Lead not found: {lead_uid}")
        observations = self.get_latest_observations(lead_uid, limit=3)
        summary = (lead.summary or "").strip()
        if not summary:
            for obs in observations:
                if obs.summary:
                    summary = obs.summary.strip()
                    break
                text = obs.raw_json.get("description") or obs.raw_json.get("summary")
                if text:
                    summary = str(text).strip()
                    break
        work_mode = lead.work_mode_hint
        if not work_mode:
            if lead.remote:
                work_mode = "remote"
            elif lead.hybrid:
                work_mode = "hybrid"
        responsibilities = self._extract_responsibilities(summary)
        required_skills = self._extract_skills(summary)
        return ParsedJob(
            job_ref_type="lead_uid",
            job_ref_id=lead.lead_uid,
            title=lead.title,
            company=lead.company,
            location=lead.location,
            summary=summary,
            seniority=lead.seniority_hint,
            role_family=lead.role_family_hint,
            work_mode=work_mode,
            required_skills=required_skills,
            preferred_skills=[],
            responsibilities=responsibilities,
            raw_signals=lead.signals,
            raw_risks=lead.risks,
            upstream_scores=lead.scores,
        )

    @staticmethod
    def _extract_responsibilities(summary: str) -> List[str]:
        lines = [line.strip(" -*•\t") for line in summary.splitlines()]
        candidates = [line for line in lines if len(line.split()) >= 5]
        return candidates[:8]

    @staticmethod
    def _extract_skills(summary: str) -> List[str]:
        known = [
            "python", "sql", "aws", "postgresql", "tableau", "power bi", "excel",
            "snowflake", "dbt", "airflow", "pandas", "machine learning", "ai",
            "product", "stakeholder management", "finance", "analytics",
        ]
        lower = summary.lower()
        found = []
        for skill in known:
            if skill in lower:
                found.append(skill)
        return found
