from dataclasses import dataclass, field, asdict
from typing import Any, Dict, List, Optional


@dataclass
class LeadRecord:
    lead_uid: str
    title: str
    company: str
    location: str
    url: str
    summary: str
    date_posted: Optional[str] = None
    employment_type: Optional[str] = None
    remote: Optional[bool] = None
    hybrid: Optional[bool] = None
    role_family_hint: Optional[str] = None
    seniority_hint: Optional[str] = None
    current_decision: Optional[str] = None
    review_status: Optional[str] = None
    application_status: Optional[str] = None
    scores: Dict[str, Any] = field(default_factory=dict)
    signals: List[Any] = field(default_factory=list)
    risks: List[Any] = field(default_factory=list)
    metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass
class ResumeVariant:
    variant_id: str
    label: str
    path: str
    keywords: List[str] = field(default_factory=list)


@dataclass
class AssessmentResult:
    job_ref: Dict[str, str]
    selected_variant: str
    fit_score: float
    fit_band: str
    top_reasons: List[str]
    risk_flags: List[str]
    unsupported_requirements: List[str]
    recommended_action: str
    summary_path: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)
