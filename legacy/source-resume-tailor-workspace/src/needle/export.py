import html
import json
import os
import subprocess
from pathlib import Path
from typing import Any, Dict, List

from integrations.lead_registry import get_lead
from .config import JOBS_DIR, WORKSPACE_ROOT, PROFILE_DIR


def _load_json(path: Path) -> Dict[str, Any]:
    return json.loads(path.read_text(encoding='utf-8'))


def _html_page(title: str, body: str) -> str:
    return f"""<!doctype html>
<html>
<head>
<meta charset=\"utf-8\">
<title>{html.escape(title)}</title>
<style>
@page {{ size: Letter; margin: 0.42in 0.5in; }}
body {{ font-family: 'Times New Roman', Times, serif; color:#111; line-height:1.16; font-size:10.3pt; }}
h1,h2,h3,p {{ margin:0; }}
.header {{ text-align:center; margin-bottom: 7px; }}
.name {{ font-size:15pt; font-weight:700; letter-spacing:0.1px; }}
.contact {{ font-size:9.4pt; margin-top:2px; }}
.section-title {{ font-size:10pt; font-weight:700; margin-top:9px; padding-bottom:2px; border-bottom:1px solid #000; text-transform:uppercase; letter-spacing:0.4px; }}
.entry {{ margin-top:4px; }}
.entry-head {{ display:flex; justify-content:space-between; align-items:flex-start; gap:12px; }}
.entry-title {{ font-weight:700; font-size:10.4pt; }}
.entry-meta {{ font-size:10pt; }}
.entry-date {{ font-size:10pt; white-space:nowrap; }}
ul {{ margin: 2px 0 0 14px; padding: 0; }}
li {{ margin: 0 0 1px 0; }}
.compact p {{ margin-top:1px; }}
.skills-line {{ margin-top:4px; font-size:10pt; }}
.small {{ color:#555; font-size:9pt; }}
.keyword-line {{ margin-top:4px; font-size:9.2pt; color:#333; }}
.jd h1 {{ font-size:16pt; margin-bottom:6px; }}
.jd h2 {{ font-size:11pt; margin:10px 0 4px 0; border-bottom:1px solid #000; }}
.jd p {{ white-space: pre-wrap; line-height:1.28; font-size:10pt; }}
</style>
</head>
<body>
{body}
</body>
</html>"""


def _profile_basics() -> Dict[str, Any]:
    return _load_json(PROFILE_DIR / 'basics.json')


def _profile_skills() -> Dict[str, Any]:
    return _load_json(PROFILE_DIR / 'skills.json').get('skills', {})


def _resume_html(draft: Dict[str, Any], lead_title: str, lead_company: str) -> str:
    basics = _profile_basics()
    skills = _profile_skills()

    work_experience_sections = draft.get('experience_sections', [])
    leadership_sections = draft.get('leadership_sections', [])
    project_sections = draft.get('project_sections', [])

    parts: List[str] = []
    parts.append("<div class='header'>")
    parts.append(f"<div class='name'>{html.escape(basics.get('name', ''))}</div>")
    contact_bits = [basics.get('phone', ''), basics.get('email', ''), basics.get('availability', '')]
    parts.append(f"<div class='contact'>{html.escape(' | '.join([x for x in contact_bits if x]))}</div>")
    parts.append("</div>")

    parts.append("<div class='section-title'>Education</div>")
    for edu in basics.get('education', []):
        parts.append("<div class='entry compact'>")
        parts.append("<div class='entry-head'>")
        parts.append(f"<div><div class='entry-title'>{html.escape(edu.get('institution', ''))}</div></div>")
        parts.append(f"<div class='entry-date'>{html.escape(edu.get('date', ''))}</div>")
        parts.append("</div>")
        for detail in edu.get('details', []):
            parts.append(f"<p class='entry-meta'>{html.escape(detail)}</p>")
        parts.append("</div>")

    parts.append("<div class='section-title'>Skills</div>")
    parts.append(f"<div class='skills-line'>{html.escape(', '.join(skills.get('primary', [])))}</div>")
    parts.append(f"<div class='skills-line'>Languages: {html.escape(', '.join(skills.get('languages', [])))}</div>")

    parts.append("<div class='section-title'>Experience</div>")
    for section in work_experience_sections:
        parts.append(_render_resume_section(section, max_bullets=len(section.get('bullets', []))))

    parts.append("<div class='section-title'>Projects</div>")
    for section in project_sections:
        parts.append(_render_project_section(section, max_bullets=len(section.get('bullets', []))))

    parts.append("<div class='section-title'>Leadership</div>")
    for section in leadership_sections:
        parts.append(_render_resume_section(section, max_bullets=len(section.get('bullets', []))))

    parts.append(f"<div class='small' style='margin-top:6px;'>Tailored for: {html.escape(lead_title)} — {html.escape(lead_company)}</div>")
    return _html_page('Tailored Resume', ''.join(parts))


def _render_resume_section(section: Dict[str, Any], max_bullets: int = 4) -> str:
    out: List[str] = []
    out.append("<div class='entry'>")
    out.append("<div class='entry-head'>")
    left = f"<div><div class='entry-title'>{html.escape(section.get('title') or '')}</div><div class='entry-meta'>{html.escape(section.get('company') or '')}</div></div>"
    out.append(left)
    out.append(f"<div class='entry-date'>{html.escape(section.get('date_range') or '')}</div>")
    out.append("</div><ul>")
    for bullet in section.get('bullets', [])[:max_bullets]:
        out.append(f"<li>{html.escape(bullet.get('text') or '')}</li>")
    out.append("</ul></div>")
    return ''.join(out)


def _render_project_section(section: Dict[str, Any], max_bullets: int = 3) -> str:
    out: List[str] = []
    out.append("<div class='entry'>")
    out.append("<div class='entry-head'>")
    out.append(f"<div><div class='entry-title'>{html.escape(section.get('name') or '')}</div></div>")
    out.append("<div class='entry-date'></div>")
    out.append("</div><ul>")
    for bullet in section.get('bullets', [])[:max_bullets]:
        out.append(f"<li>{html.escape(bullet.get('text') or '')}</li>")
    out.append("</ul></div>")
    return ''.join(out)


def _jd_html(lead) -> str:
    parts: List[str] = []
    parts.append("<div class='jd'>")
    parts.append(f"<h1>{html.escape(lead.title)}</h1>")
    parts.append(f"<div>{html.escape(lead.company)} — {html.escape(lead.location)}</div>")
    if lead.url:
        parts.append(f"<div class='small'>{html.escape(lead.url)}</div>")
    parts.append("<h2>Job Description</h2>")
    body = html.escape(lead.summary or '').replace('\n', '<br>')
    parts.append(f"<p>{body}</p>")
    parts.append("</div>")
    return _html_page(f"JD - {lead.title}", ''.join(parts))


def export_lead_pdfs(lead_uid: str) -> Dict[str, str]:
    lead = get_lead(lead_uid)
    draft_json_path = JOBS_DIR / 'assessed' / f'{lead_uid}.tailored.json'
    if not draft_json_path.exists():
        raise FileNotFoundError(f'Tailored draft not found for {lead_uid}. Run tailor-lead first.')
    draft = json.loads(draft_json_path.read_text(encoding='utf-8'))

    export_dir = WORKSPACE_ROOT / 'exports' / 'pdf'
    export_dir.mkdir(parents=True, exist_ok=True)
    tmp_dir = WORKSPACE_ROOT / 'data' / 'jobs' / 'tmp_html'
    tmp_dir.mkdir(parents=True, exist_ok=True)

    resume_html_path = tmp_dir / f'{lead_uid}.resume.html'
    jd_html_path = tmp_dir / f'{lead_uid}.jd.html'
    resume_pdf_path = export_dir / f'{lead_uid}.tailored.resume.pdf'
    jd_pdf_path = export_dir / f'{lead_uid}.jd.pdf'

    resume_html_path.write_text(_resume_html(draft, lead.title, lead.company), encoding='utf-8')
    jd_html_path.write_text(_jd_html(lead), encoding='utf-8')

    env = os.environ.copy()
    node_path = subprocess.run(['npm', 'root', '-g'], capture_output=True, text=True, check=True).stdout.strip()
    env['NODE_PATH'] = node_path
    env['PLAYWRIGHT_BROWSERS_PATH'] = str(Path.home() / 'Library' / 'Caches' / 'ms-playwright')

    script_path = WORKSPACE_ROOT / 'scripts' / 'render_pdf.js'
    subprocess.run(['node', str(script_path), str(resume_html_path), str(resume_pdf_path)], check=True, env=env)
    subprocess.run(['node', str(script_path), str(jd_html_path), str(jd_pdf_path)], check=True, env=env)

    return {
        'resume_pdf': str(resume_pdf_path),
        'jd_pdf': str(jd_pdf_path),
    }
