from typing import Any, Dict, List, Optional

from .config import PROFILE_DIR
from .simpleio import read_json

MANIFESTS_PATH = PROFILE_DIR / "base_resume_manifests.json"


def load_manifests() -> List[Dict[str, Any]]:
    return read_json(MANIFESTS_PATH).get("variants", [])


def get_manifest(variant_id: str) -> Optional[Dict[str, Any]]:
    for variant in load_manifests():
        if variant.get("variant_id") == variant_id:
            return variant
    return None
