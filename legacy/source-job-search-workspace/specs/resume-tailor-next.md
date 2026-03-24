# Next Sub-Agent Plan: Resume Tailor

## Goal
Turn a selected lead plus Benny's base resume into a tailored resume package that is sharper, role-aligned, and easy to inspect before use.

## Inputs
- selected lead from `data/leads/leads.jsonl`
- base resume from `resumes/base/`
- optional project stories / experience fragments
- later: similarity/matching layer for bullet selection

## Outputs
- tailored resume draft in `resumes/tailored/`
- tailoring notes in `artifacts/application-packets/` or `logs/`
- gap list: what information is still missing from Benny

## Responsibilities
- identify most relevant experience bullets
- rewrite summary and selected bullets toward the target role
- preserve truthfulness
- avoid overfitting or keyword stuffing
- produce a human-readable rationale for changes

## Future technical enhancements
- embeddings / vector search over resume bullets and work-story snippets
- reusable accomplishment library
- job-description parser and requirement extractor
- scorecard showing match strength by requirement

## Main guardrail
Never invent experience, metrics, tools, or accomplishments.
