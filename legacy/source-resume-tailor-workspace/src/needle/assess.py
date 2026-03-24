import json
import re
from collections import Counter
from typing import Dict, List, Tuple

from .models import AssessmentResult, LeadRecord, ResumeVariant
from .profile import load_achievements

KEYWORD_MAP = {
    "analytics": ["sql", "dashboard", "reporting", "analysis", "analytics", "bi", "data", "cohort", "retention", "churn"],
    "business_analyst": ["business analyst", "stakeholder", "requirements", "process", "cross-functional", "operations", "kpi", "workflow"],
    "product_strategy": ["product", "strategy", "roadmap", "go-to-market", "market", "growth", "pricing", "expansion"],
    "ai_ml": ["ai", "ml", "machine learning", "llm", "model", "artificial intelligence"],
}

RISK_TERMS = [
    "manage team",
    "people management",
    "kubernetes",
    "tableau admin",
    "phd",
    "visa sponsorship",
]

STOPWORDS = {
    "and", "the", "for", "with", "into", "from", "that", "this", "using", "used", "user", "users", "build", "built",
    "data", "analysis", "role", "team", "work", "experience", "support", "across", "through", "including", "their",
}


def _normalize(text: str) -> str:
    return re.sub(r"\s+", " ", (text or "").lower()).strip()


def _tokens(text: str) -> List[str]:
    return [t for t in re.findall(r"[a-zA-Z0-9\+\/#\.]+", _normalize(text)) if len(t) > 2 and t not in STOPWORDS]


def _achievement_match_summary(lead: LeadRecord) -> Tuple[Dict[str, int], List[str]]:
    jd_tokens = set(_tokens(" ".join([lead.title, lead.summary, lead.role_family_hint or "", lead.seniority_hint or ""])))
    achievements = load_achievements()
    lane_scores: Counter = Counter()
    matched = []
    for ach in achievements:
        ach_text = ach.get("canonical_text", "")
        ach_tokens = set(_tokens(ach_text + " " + " ".join(ach.get("tags", [])) + " " + " ".join(ach.get("domains", [])) + " " + " ".join(ach.get("technologies", []))))
        overlap = jd_tokens.intersection(ach_tokens)
        if len(overlap) >= 2:
            matched.append(ach_text)
            for lane in ach.get("usable_in", []):
                lane_scores[lane] += len(overlap)
    return dict(lane_scores), matched[:5]


def choose_variant(lead: LeadRecord, variants: List[ResumeVariant]) -> Tuple[str, List[str], float]:
    haystack = _normalize(" ".join([lead.title, lead.summary, lead.role_family_hint or "", lead.seniority_hint or ""]))
    heuristic_scores = []
    for variant in variants:
        keywords = KEYWORD_MAP.get(variant.variant_id, variant.keywords)
        score = sum(1 for kw in keywords if kw in haystack)
        heuristic_scores.append((score, variant.variant_id))
    heuristic_scores.sort(reverse=True)

    evidence_scores, matched_achievements = _achievement_match_summary(lead)
    best_evidence_variant = None
    best_evidence_score = 0
    if evidence_scores:
        best_evidence_variant, best_evidence_score = max(evidence_scores.items(), key=lambda kv: kv[1])

    reasons = []
    if best_evidence_variant:
        top_variant = best_evidence_variant
        reasons.append(f"Selected {top_variant} variant from canonical achievement overlap")
        if matched_achievements:
            reasons.append(f"Matched evidence: {matched_achievements[0]}")
        fit = min(0.58 + 0.025 * best_evidence_score, 0.9)
        return top_variant, reasons, fit

    if not heuristic_scores:
        return "general", ["No base resume variants found; using fallback general lane"], 0.45

    top_score, top_variant = heuristic_scores[0]
    reasons.append(f"Selected {top_variant} variant from JD/title keyword overlap")
    fit = min(0.55 + 0.06 * top_score, 0.92)
    return top_variant, reasons, fit


def detect_unsupported(lead: LeadRecord) -> List[str]:
    text = _normalize(lead.summary)
    found = []
    for term in RISK_TERMS:
        if term in text:
            found.append(term)
    return found


def fit_band(score: float, unsupported_count: int) -> str:
    if unsupported_count >= 3 and score < 0.68:
        return "caution"
    if score >= 0.82:
        return "use_base"
    if score >= 0.68:
        return "light_tailor"
    if score >= 0.50:
        return "full_tailor"
    return "caution"


def assess_lead(lead: LeadRecord, variants: List[ResumeVariant]) -> AssessmentResult:
    selected_variant, reasons, score = choose_variant(lead, variants)
    unsupported = detect_unsupported(lead)
    upstream_score = lead.scores.get("fit_score") if isinstance(lead.scores, dict) else None
    if isinstance(upstream_score, (int, float)):
        score = max(0.0, min(1.0, score * 0.95 + (float(upstream_score) / 100.0) * 0.05))
        reasons.append(f"Applied small upstream prior from lead registry fit_score={upstream_score}")
    risks = list(lead.risks) if isinstance(lead.risks, list) else []
    risks.extend([f"unsupported:{item}" for item in unsupported])
    band = fit_band(score, len(unsupported))
    action = {
        "use_base": "use_base",
        "light_tailor": "light_tailor",
        "full_tailor": "full_tailor",
        "caution": "caution_report",
    }[band]
    top_reasons = reasons + ([f"Upstream role family hint: {lead.role_family_hint}"] if lead.role_family_hint else [])
    return AssessmentResult(
        job_ref={"type": "lead_uid", "id": lead.lead_uid},
        selected_variant=selected_variant,
        fit_score=round(score, 3),
        fit_band=band,
        top_reasons=top_reasons,
        risk_flags=risks,
        unsupported_requirements=unsupported,
        recommended_action=action,
        summary_path=None,
    )


def result_to_json(result: AssessmentResult) -> str:
    return json.dumps(result.to_dict(), indent=2, sort_keys=True)
