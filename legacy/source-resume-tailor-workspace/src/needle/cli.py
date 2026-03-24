import argparse

from integrations.lead_registry import get_lead
from .assess import assess_lead, result_to_json
from .config import JOBS_DIR
from .export import export_lead_pdfs
from .simpleio import write_json
from .store import init_db, save_assessment
from .tailor import build_tailored_draft, render_markdown
from .variants import load_variants


def cmd_init_db(_args):
    init_db()
    print("Initialized metadata DB")


def cmd_assess_lead(args):
    init_db()
    lead = get_lead(args.lead_uid)
    variants = load_variants()
    result = assess_lead(lead, variants)
    payload = result_to_json(result)
    run_id = save_assessment(
        lead_uid=lead.lead_uid,
        selected_variant=result.selected_variant,
        fit_score=result.fit_score,
        fit_band=result.fit_band,
        recommended_action=result.recommended_action,
        payload_json=payload,
    )
    snapshot_path = JOBS_DIR / "assessed" / f"{lead.lead_uid}.json"
    write_json(snapshot_path, result.to_dict())
    print(payload)
    print(f"\nSaved assessment run #{run_id} to {snapshot_path}")


def cmd_tailor_lead(args):
    init_db()
    lead = get_lead(args.lead_uid)
    variants = load_variants()
    assessment = assess_lead(lead, variants)
    draft = build_tailored_draft(lead, assessment)
    json_path = JOBS_DIR / "assessed" / f"{lead.lead_uid}.tailored.json"
    md_path = JOBS_DIR / "assessed" / f"{lead.lead_uid}.tailored.md"
    write_json(json_path, draft)
    md_path.write_text(render_markdown(draft), encoding="utf-8")
    print(render_markdown(draft))
    print(f"\nSaved tailored draft JSON to {json_path}")
    print(f"Saved tailored draft Markdown to {md_path}")


def cmd_export_lead_pdf(args):
    paths = export_lead_pdfs(args.lead_uid)
    print(f"Resume PDF: {paths['resume_pdf']}")
    print(f"JD PDF: {paths['jd_pdf']}")


def build_parser():
    parser = argparse.ArgumentParser(prog="needle")
    sub = parser.add_subparsers(dest="command", required=True)

    p_init = sub.add_parser("init-db", help="Initialize local metadata DB")
    p_init.set_defaults(func=cmd_init_db)

    p_assess = sub.add_parser("assess-lead", help="Assess a lead-registry lead by lead_uid")
    p_assess.add_argument("lead_uid")
    p_assess.set_defaults(func=cmd_assess_lead)

    p_tailor = sub.add_parser("tailor-lead", help="Generate a first-pass tailored draft for a lead_uid")
    p_tailor.add_argument("lead_uid")
    p_tailor.set_defaults(func=cmd_tailor_lead)

    p_export = sub.add_parser("export-lead-pdf", help="Export tailored resume + JD PDFs for a lead_uid")
    p_export.add_argument("lead_uid")
    p_export.set_defaults(func=cmd_export_lead_pdf)
    return parser


def main():
    parser = build_parser()
    args = parser.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
