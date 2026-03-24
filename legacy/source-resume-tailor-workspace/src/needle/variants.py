from pathlib import Path
from typing import List

from .config import BASE_RESUMES_DIR
from .models import ResumeVariant


def load_variants() -> List[ResumeVariant]:
    variants = []
    if not BASE_RESUMES_DIR.exists():
        return variants
    for path in sorted(BASE_RESUMES_DIR.glob("*.md")):
        if path.name.lower() == "readme.md":
            continue
        variant_id = path.stem
        label = variant_id.replace("_", " ").replace("-", " ").title()
        keywords = [variant_id.lower(), label.lower()]
        variants.append(ResumeVariant(variant_id=variant_id, label=label, path=str(path), keywords=keywords))
    return variants
