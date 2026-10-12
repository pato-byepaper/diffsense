# Security Policy

## Supported versions

Security fixes are applied to the latest release on the `main` branch.

## Reporting a vulnerability

Please do not open a public issue for security problems.

Email **pato@byepaper.studio** with:

- A description of the issue and its impact
- Steps to reproduce (a minimal repository or diff is ideal)
- The version or commit you tested

You will get an acknowledgement within 72 hours and a status update within 7 days. Once a fix is released, you will be credited in the release notes unless you prefer otherwise.

## In scope

- Secrets that are not redacted before being displayed, exported or sent to Gemini
- The local web server being reachable or controllable from other origins or hosts
- Command or option injection through refs, file names or API parameters
- Cross-site scripting in the web UI through diff content or model output

## Out of scope

- Secrets the scanner does not detect (please open a normal issue or pull request with a new rule)
- Issues that require an attacker to already control your machine or your `.env` file
