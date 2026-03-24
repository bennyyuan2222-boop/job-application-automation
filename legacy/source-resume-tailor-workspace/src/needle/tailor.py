import json
from pathlib import Path
from typing import Any, Dict, List, Tuple

from .config import PROFILE_DIR
from .jd_keywords import extract_keywords
from .manifests import get_manifest
from .models import AssessmentResult, LeadRecord
from .profile import load_achievements, load_projects, load_roles


def _achievement_index() -> Dict[str, Dict[str, Any]]:
    return {a['id']: a for a in load_achievements()}


def _role_index() -> Dict[str, Dict[str, Any]]:
    return {r['id']: r for r in load_roles()}


def _project_index() -> Dict[str, Dict[str, Any]]:
    return {p['id']: p for p in load_projects()}


def _density_targets() -> Dict[str, Any]:
    path = PROFILE_DIR / 'resume_density_baseline.json'
    return json.loads(path.read_text(encoding='utf-8')).get('target', {})


def _normalize(text: str) -> str:
    return (text or '').lower()


def _tokenize(text: str) -> List[str]:
    cleaned = _normalize(text).replace('/', ' ').replace(',', ' ').replace('(', ' ').replace(')', ' ')
    return [t.strip('.:;') for t in cleaned.split() if len(t.strip('.:;')) >= 4]


def _achievement_text(achievement: Dict[str, Any]) -> str:
    return ' '.join([
        achievement.get('canonical_text', ''),
        ' '.join(achievement.get('tags', [])),
        ' '.join(achievement.get('domains', [])),
        ' '.join(achievement.get('technologies', [])),
    ]).lower()


def _parse_end_value(date_range: str) -> int:
    if not date_range:
        return 0
    end = date_range.split(' to ')[-1].strip().lower()
    if end == 'present':
        return 999999
    try:
        year, month = end.split('-', 1)
        return int(year) * 100 + int(month)
    except Exception:
        return 0


def _keyword_support_score(keyword: str, achievements: List[Dict[str, Any]]) -> int:
    kw_tokens = [t for t in _tokenize(keyword) if t not in {'users', 'teams'}]
    best = 0
    for ach in achievements:
        text = _achievement_text(ach)
        score = 0
        if keyword.lower() in text:
            score += 3
        score += sum(1 for t in kw_tokens if t in text)
        best = max(best, score)
    return best


def _supported_jd_keywords(lead: LeadRecord, achievements: List[Dict[str, Any]], limit: int = 5) -> List[str]:
    jd_text = ' '.join([lead.title, lead.summary, lead.role_family_hint or '', lead.seniority_hint or '']).lower()
    generic_blacklist = {
        'business', 'leader', 'research', 'partner', 'program', 'system', 'systems', 'teams', 'team', 'projects', 'project', 'users'
    }
    preferred_terms = [
        'requirements', 'workflow', 'planning', 'stakeholders', 'reporting', 'testing', 'integration', 'analytics', 'documentation', 'support'
    ]

    supported: List[str] = []
    for term in preferred_terms:
        if term in jd_text and _keyword_support_score(term, achievements) >= 1 and term not in supported:
            supported.append(term)
        if len(supported) >= limit:
            return supported[:limit]

    candidates = extract_keywords(jd_text, limit=12)
    for cand in candidates:
        if cand in generic_blacklist:
            continue
        if _keyword_support_score(cand, achievements) >= 2 and cand not in supported:
            supported.append(cand)
        if len(supported) >= limit:
            return supported[:limit]

    # supplement with supported JD tokens if phrase candidates are too sparse
    token_candidates = []
    for token in _tokenize(jd_text):
        if token in generic_blacklist:
            continue
        if token not in token_candidates:
            token_candidates.append(token)
    for token in token_candidates:
        if _keyword_support_score(token, achievements) >= 1 and token not in supported:
            supported.append(token)
        if len(supported) >= limit:
            break
    return supported[:limit]


def _score_achievement_for_lead(achievement: Dict[str, Any], lead: LeadRecord, selected_variant: str, supported_keywords: List[str]) -> int:
    text = _achievement_text(achievement)
    jd = ' '.join([lead.title, lead.summary, lead.role_family_hint or '', lead.seniority_hint or '']).lower()
    score = 0
    for token in set(_tokenize(jd)):
        if token in text:
            score += 1
    for kw in supported_keywords:
        if kw.lower() in text:
            score += 3
    if selected_variant in achievement.get('usable_in', []):
        score += 4
    if achievement.get('evidence_strength') == 'verified':
        score += 2
    elif achievement.get('evidence_strength') == 'supported':
        score += 1
    return score


def _build_summary(variant_summary: str, supported_keywords: List[str]) -> str:
    if not supported_keywords:
        return variant_summary
    top = ', '.join(supported_keywords[:3])
    base = variant_summary.rstrip('.')
    return f"{base} with emphasis on {top}."


def _is_leadership_role(role: Dict[str, Any]) -> bool:
    title = _normalize(role.get('title', ''))
    company = _normalize(role.get('company', ''))
    return 'head of career' in title or 'community' in title or 'cssa' in company or role.get('role_type') == 'leadership'


def _select_group_ids(
    groups: Dict[str, List[Tuple[int, Dict[str, Any]]]],
    group_meta: Dict[str, Dict[str, Any]],
    count: int,
    sort_mode: str = 'score',
) -> List[str]:
    ranked = []
    for group_id, items in groups.items():
        group_score = sum(score for score, _ in items[:3])
        ranked.append((group_score, group_id))
    if sort_mode == 'date_desc':
        ranked.sort(key=lambda item: (_parse_end_value(group_meta.get(item[1], {}).get('date_range', '')), item[0]), reverse=True)
    else:
        ranked.sort(reverse=True)
    return [group_id for _, group_id in ranked[:count]]


def _materialize_section(group_id: str, items: List[Tuple[int, Dict[str, Any]]], group_meta: Dict[str, Dict[str, Any]], bullet_target: Dict[str, int], kind: str) -> Dict[str, Any]:
    cap = min(len(items), bullet_target.get('target', bullet_target.get('max', len(items))))
    floor = min(len(items), bullet_target.get('min', cap))
    count = max(floor, cap)
    bullets = []
    for _, ach in items[:count]:
        bullets.append(
            {
                'achievement_id': ach.get('id'),
                'text': ach.get('canonical_text'),
                'evidence_strength': ach.get('evidence_strength'),
            }
        )
    meta = group_meta.get(group_id, {})
    if kind == 'project':
        return {
            'project_id': group_id,
            'name': meta.get('name'),
            'bullets': bullets,
        }
    return {
        'role_id': group_id,
        'title': meta.get('title'),
        'company': meta.get('company'),
        'date_range': meta.get('date_range'),
        'bullets': bullets,
    }


def _estimate_density(draft: Dict[str, Any]) -> Dict[str, int]:
    total_bullets = 0
    estimated_lines = 0
    for section in draft.get('experience_sections', []) + draft.get('leadership_sections', []):
        total_bullets += len(section.get('bullets', []))
        estimated_lines += 2
        for bullet in section.get('bullets', []):
            estimated_lines += max(1, len((bullet.get('text') or '')) // 95 + 1)
    for section in draft.get('project_sections', []):
        total_bullets += len(section.get('bullets', []))
        estimated_lines += 1
        for bullet in section.get('bullets', []):
            estimated_lines += max(1, len((bullet.get('text') or '')) // 95 + 1)
    return {'total_bullets': total_bullets, 'estimated_lines': estimated_lines}


def build_tailored_draft(lead: LeadRecord, assessment: AssessmentResult) -> Dict[str, Any]:
    manifest = get_manifest(assessment.selected_variant)
    if manifest is None:
        raise ValueError(f"No manifest for variant {assessment.selected_variant}")

    density = _density_targets()
    achievements = load_achievements()
    roles_by_id = _role_index()
    projects_by_id = _project_index()
    supported_keywords = _supported_jd_keywords(lead, achievements, limit=5)

    scored_achievements: List[Tuple[int, Dict[str, Any]]] = []
    for ach in achievements:
        score = _score_achievement_for_lead(ach, lead, assessment.selected_variant, supported_keywords)
        scored_achievements.append((score, ach))
    scored_achievements.sort(key=lambda item: item[0], reverse=True)

    role_groups: Dict[str, List[Tuple[int, Dict[str, Any]]]] = {}
    project_groups: Dict[str, List[Tuple[int, Dict[str, Any]]]] = {}
    role_meta: Dict[str, Dict[str, Any]] = {}
    project_meta: Dict[str, Dict[str, Any]] = {}

    for score, ach in scored_achievements:
        if ach.get('role_id'):
            role_id = ach['role_id']
            role_groups.setdefault(role_id, []).append((score, ach))
            role = roles_by_id.get(role_id, {})
            role_meta[role_id] = {
                'title': role.get('title'),
                'company': role.get('company'),
                'date_range': f"{role.get('start')} to {role.get('end')}",
            }
        elif ach.get('project_id'):
            project_id = ach['project_id']
            project_groups.setdefault(project_id, []).append((score, ach))
            project = projects_by_id.get(project_id, {})
            project_meta[project_id] = {'name': project.get('name')}

    work_role_groups = {gid: items for gid, items in role_groups.items() if not _is_leadership_role(roles_by_id.get(gid, {}))}
    leadership_role_groups = {gid: items for gid, items in role_groups.items() if _is_leadership_role(roles_by_id.get(gid, {}))}

    selected_work_roles = _select_group_ids(
        work_role_groups,
        role_meta,
        count=density.get('experience_roles', 2),
        sort_mode='date_desc',
    )
    selected_leadership_roles = _select_group_ids(
        leadership_role_groups,
        role_meta,
        count=density.get('leadership_sections', 1),
        sort_mode='date_desc',
    )
    selected_projects = _select_group_ids(
        project_groups,
        project_meta,
        count=density.get('projects', 2),
        sort_mode='score',
    )

    experience_sections = [
        _materialize_section(
            role_id,
            work_role_groups[role_id],
            role_meta,
            density.get('experience_bullets_per_role', {'min': 4, 'target': 4, 'max': 5}),
            kind='role',
        )
        for role_id in selected_work_roles
    ]
    leadership_sections = [
        _materialize_section(
            role_id,
            leadership_role_groups[role_id],
            role_meta,
            density.get('leadership_bullets_per_section', {'min': 4, 'target': 4, 'max': 4}),
            kind='role',
        )
        for role_id in selected_leadership_roles
    ]
    project_sections = [
        _materialize_section(
            project_id,
            project_groups[project_id],
            project_meta,
            density.get('project_bullets_per_project', {'min': 3, 'target': 3, 'max': 4}),
            kind='project',
        )
        for project_id in selected_projects
    ]

    source_achievement_ids: List[str] = []
    for section in experience_sections + leadership_sections + project_sections:
        for bullet in section.get('bullets', []):
            source_achievement_ids.append(bullet.get('achievement_id'))

    rationale = [
        f"Used section density targets from Benny's original resume silhouette instead of shrinking type.",
        f"Selected {len(experience_sections)} experience roles, {len(project_sections)} projects, and {len(leadership_sections)} leadership sections.",
        f"Supported JD keywords incorporated through truthful selection: {', '.join(supported_keywords[:5])}.",
    ]

    draft = {
        'job_ref': assessment.job_ref,
        'selected_variant': assessment.selected_variant,
        'summary': _build_summary(manifest.get('summary', ''), supported_keywords),
        'fit_score': assessment.fit_score,
        'fit_band': assessment.fit_band,
        'recommended_action': assessment.recommended_action,
        'jd_keywords': supported_keywords,
        'experience_sections': experience_sections,
        'project_sections': project_sections,
        'leadership_sections': leadership_sections,
        'rationale': rationale,
        'risk_flags': assessment.risk_flags,
        'unsupported_requirements': assessment.unsupported_requirements,
        'source_achievement_ids': source_achievement_ids,
    }
    draft['density_estimate'] = _estimate_density(draft)
    return draft


def render_markdown(draft: Dict[str, Any]) -> str:
    lines = []
    lines.append(f"# Tailored Resume Draft — {draft['selected_variant']}")
    lines.append('')
    lines.append('## Summary')
    lines.append(draft.get('summary') or '')
    lines.append('')
    lines.append('## JD Keywords')
    for kw in draft.get('jd_keywords', []):
        lines.append(f'- {kw}')
    lines.append('')
    lines.append('## Experience')
    for section in draft.get('experience_sections', []):
        title = section.get('title') or ''
        company = section.get('company') or ''
        date_range = section.get('date_range') or ''
        lines.append(f"### {title} — {company}")
        lines.append(date_range)
        for bullet in section.get('bullets', []):
            lines.append(f"- {bullet['text']}")
        lines.append('')
    if draft.get('project_sections'):
        lines.append('## Projects')
        for section in draft.get('project_sections', []):
            lines.append(f"### {section.get('name')}")
            for bullet in section.get('bullets', []):
                lines.append(f"- {bullet['text']}")
            lines.append('')
    if draft.get('leadership_sections'):
        lines.append('## Leadership')
        for section in draft.get('leadership_sections', []):
            title = section.get('title') or ''
            company = section.get('company') or ''
            date_range = section.get('date_range') or ''
            lines.append(f"### {title} — {company}")
            lines.append(date_range)
            for bullet in section.get('bullets', []):
                lines.append(f"- {bullet['text']}")
            lines.append('')
    lines.append('## Density Estimate')
    density = draft.get('density_estimate', {})
    lines.append(f"- total_bullets: {density.get('total_bullets')}")
    lines.append(f"- estimated_lines: {density.get('estimated_lines')}")
    lines.append('')
    lines.append('## Rationale')
    for item in draft.get('rationale', []):
        lines.append(f'- {item}')
    return '\n'.join(lines).strip() + '\n'
