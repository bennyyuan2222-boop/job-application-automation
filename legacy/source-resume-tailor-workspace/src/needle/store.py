import sqlite3
from pathlib import Path
from typing import Any, Dict, Optional

from .config import METADATA_DB_PATH

SCHEMA = """
CREATE TABLE IF NOT EXISTS assessment_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  lead_uid TEXT,
  selected_variant TEXT NOT NULL,
  fit_score REAL NOT NULL,
  fit_band TEXT NOT NULL,
  recommended_action TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_assessment_runs_lead_uid
  ON assessment_runs(lead_uid, created_at DESC);
"""


def connect(db_path: Optional[Path] = None) -> sqlite3.Connection:
    path = db_path or METADATA_DB_PATH
    path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(path)
    conn.row_factory = sqlite3.Row
    return conn


def init_db() -> None:
    conn = connect()
    with conn:
        conn.executescript(SCHEMA)
    conn.close()


def save_assessment(lead_uid: str, selected_variant: str, fit_score: float, fit_band: str, recommended_action: str, payload_json: str) -> int:
    conn = connect()
    with conn:
        cur = conn.execute(
            """
            INSERT INTO assessment_runs (
              lead_uid, selected_variant, fit_score, fit_band, recommended_action, payload_json
            ) VALUES (?, ?, ?, ?, ?, ?)
            """,
            (lead_uid, selected_variant, fit_score, fit_band, recommended_action, payload_json),
        )
        row_id = cur.lastrowid
    conn.close()
    return int(row_id)
