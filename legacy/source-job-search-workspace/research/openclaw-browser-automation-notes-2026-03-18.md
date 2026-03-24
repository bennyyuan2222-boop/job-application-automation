# OpenClaw browser automation notes

_Date: 2026-03-18_
_Status: research note_

## Why this matters

The future operations agent for the job-search system will likely need browser automation for:
- opening job portals
- filling application forms
- uploading the selected resume
- pausing for human review before final submit
- resuming partially completed application sessions

## Core OpenClaw browser model

OpenClaw exposes browser automation through the `browser` tool and matching CLI/control APIs.

Capabilities documented in the local docs include:
- start/stop/status
- open/focus/close tabs
- snapshot/screenshot
- navigate
- click/type/drag/select via `act`
- PDF
- upload and dialog hooks
- console/network/error inspection
- cookies/storage controls

The core control pattern is:
1. take a `snapshot`
2. get refs for elements
3. use `act` with those refs to click/type/select
4. re-snapshot after navigation or UI changes

Important documented rule:
- refs are **not stable across navigations**; after page changes, re-run snapshot and use fresh refs.

## Profiles

OpenClaw has three especially relevant browser modes.

### 1) `openclaw`
Managed, isolated browser profile.

Best when:
- no personal login state is required yet
- you want a safe dedicated automation lane
- you want the least risky default for generic browsing

Tradeoff:
- does not reuse Benny’s normal signed-in browser state

### 2) `user`
Existing Chrome session via Chrome DevTools MCP.

Best when:
- existing logged-in state matters
- Benny is at the machine and can approve the Chrome attach prompt
- the portal should use the real signed-in browser session

Tradeoffs:
- higher-risk because it acts in the real browser session
- requires Chrome 144+, remote debugging enabled, and an attach approval
- some features are limited compared with the managed profile (docs note PDF/download interception caveats)

### 3) `chrome-relay`
Chrome extension relay / toolbar-button attach flow.

Best when:
- Benny explicitly wants the extension flow
- you want to attach to a specific already-open tab

Tradeoffs:
- user must click the extension icon on the tab
- no attached tab means no automation target

## Best mode for the future operations agent

For job application portals, the best long-term approach is likely **hybrid**:

### Primary recommendation
Use **`profile="user"`** or a remote node-host equivalent when:
- the site requires Benny’s real logged-in browser state
- the goal is to inspect the real portal before submit
- the automation must work inside an already-authenticated session

### Secondary recommendation
Use **`profile="openclaw"`** when:
- researching jobs
- navigating public pages
- doing anonymous or low-risk flows
- testing automation logic before applying it to signed-in portals

### Use `chrome-relay` only when the extension/attach-tab workflow is explicitly desired.

## Hosted app / remote-control implications

Because Benny wants a hosted system usable from different computers, the browser architecture matters.

The docs describe three viable shapes:

### A) Local control
Gateway and browser live on the same machine.

Good for:
- simplest local setups

### B) Node browser proxy (recommended for split-host setups)
Run a **node host** on the machine that actually has the browser, and let the Gateway proxy browser tool calls there.

Good for:
- a hosted or remote Gateway controlling a browser that lives on Benny’s home machine or another trusted machine
- future operations-agent architecture where the app is hosted but browser automation still runs near the real browser session

### C) Remote CDP
Point a profile at a remote CDP endpoint, including hosted providers like Browserless or Browserbase.

Good for:
- isolated cloud browsers
- testing and scraping

Less ideal for:
- real application portals where Benny’s personal session or trust in the visible browser state matters

## Playwright dependency

The docs are explicit that many useful features require Playwright.

Features that may require Playwright include:
- navigate
- `act`
- AI snapshot / role snapshot
- element screenshots
- PDF
- many extension-relay operations

If Playwright is not installed in the Gateway build, these routes return a clear 501-style error.

## Login guidance

The docs recommend:
- **manual login** in the host browser
- do not hand credentials to the model
- use the isolated browser by default unless real logged-in state matters

This is particularly relevant for job portals because automated login flows often trigger anti-bot defenses.

## Uploads / dialogs / downloads

The docs note:
- `upload` and `dialog` are **arming** calls that should happen before the click that triggers the chooser/dialog
- download and upload paths are constrained to OpenClaw temp roots
- file inputs can be set directly through upload hooks

This is relevant for resume upload steps in applications.

## Snapshot strategy for form automation

Documented/recommended pattern:
- use `snapshot` to obtain element refs
- prefer interactive/compact snapshots for actionable UIs
- re-snapshot after each navigation or large DOM change
- keep actions ref-based rather than relying on CSS selectors

Practical implication for job portals:
- automation should be modeled as a loop of inspect → act → verify → re-inspect
- not as a one-shot brittle selector script

## Security / privacy notes

Documented security model:
- browser control is loopback-only by default
- access flows through Gateway auth or node pairing
- remote CDP endpoints are sensitive and should be treated like secrets
- keep the Gateway and node hosts private (loopback or tailnet/private network)

For application portals, the main caution is that `profile="user"` or other attached real-browser modes can operate inside signed-in sessions.

## Current host smoke test (Clawbot Mac mini)

What I verified today:
- OpenClaw browser support is enabled in config
- profiles present: `openclaw`, `user`, `chrome-relay`
- Google Chrome was installed and is now detected at `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`
- full `playwright` package is now resolvable by the OpenClaw runtime
- after restarting the gateway, the managed `openclaw` browser successfully launched
- managed-browser tab control works (`open` / `tabs`)
- snapshots work against the managed browser
- click automation works when driven from an interactive role snapshot (`ref=e...`)
- `chrome-relay` endpoint exists but still had **0 attached tabs** during the test

What is still not ready:
- `profile="user"` attach is not yet prepared because Chrome was not running in existing-session attach mode during the test
- `chrome-relay` is not yet attached to any tab

Interpretation:
- this host is now **ready for managed-browser OpenClaw automation** using the `openclaw` profile
- signed-in browser/session automation is still a separate setup step (`user` or `chrome-relay`) when Benny wants to automate inside a real logged-in browser session

## Practical recommendation for the future operations agent

### Best near-term plan
1. Keep the hosted app as the control plane.
2. Run browser automation on a trusted machine with a real browser available.
3. Prefer a node-host/browser-proxy design over trying to make the hosted app itself own the browser.
4. Use `openclaw` profile for public-site automation and testing.
5. Use `user` profile for real signed-in portal review/fill flows where Benny’s browser state matters.
6. Keep final submit manual in the real external portal.

### Minimum readiness checklist before building the operations agent around this
- supported Chromium browser installed or explicitly configured
- Playwright available in the runtime
- decision on `openclaw` vs `user` vs `chrome-relay` for each workflow
- node host/browser proxy plan if the browser lives on a different machine from the Gateway
- upload flow tested with a sample resume file
- pause/resume + human-review handoff modeled explicitly in the application state machine

## Bottom line

OpenClaw browser automation is a real, usable foundation for the future operations agent.

The strongest fit is **not** “agent clicks random selectors in a cloud browser.”
The strongest fit is:
- hosted control plane
- SQL-backed application state
- browser automation running on a trusted machine
- snapshot/act loop for deterministic interaction
- manual human final submit in the real portal