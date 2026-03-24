from __future__ import annotations

from typing import Iterable, List

FORBIDDEN_PATTERNS = [
    "managed a team of",
    "led company-wide",
    "owned p&l",
]


def find_truth_risks(texts: Iterable[str]) -> List[str]:
    risks: List[str] = []
    for text in texts:
        lower = text.lower()
        for pattern in FORBIDDEN_PATTERNS:
            if pattern in lower:
                risks.append(f"Forbidden unsupported pattern detected: {pattern}")
    return risks
