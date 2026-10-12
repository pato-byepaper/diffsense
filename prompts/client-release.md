Write release notes for clients and end users of the product. They are not technical and only care about what is different for them.

Product or repository: {{REPO_NAME}}

Commits in range:
{{COMMITS}}

Files:
{{FILE_LIST}}

Rules:
- Include only changes a user can notice: new features, fixed problems, visible improvements, changed behavior, removed features. Leave out refactors, tests, CI, tooling, dependency updates and internal cleanup unless they fix something a user would notice or make the product noticeably faster.
- Never mention file names, function names, code, branches, ticket numbers, libraries, frameworks, the diff or AI.
- Each bullet is one sentence of at most 20 words, written in plain language, starting with a past-tense verb such as "Fixed", "Added", "Improved", "Updated", "Changed" or "Removed". Example: "Fixed an error that prevented saving invoices with long customer names."
- Describe security fixes only generically, for example "Improved account security." Never describe a vulnerability.
- Do not exaggerate or promise anything the diff does not show. When the user-facing effect is unclear, leave it out.

Use exactly this structure and omit any section that would be empty:

## Release notes

### New
### Improvements
### Fixes
### Changes and removals

---

**Short version:** one line of at most 140 characters summarizing the release, suitable for a changelog entry or an app store "What's new" field.

If there are no user-facing changes, output only:

## Release notes

Maintenance release with internal improvements. No user-facing changes.

{{DIFF_LEGEND}}

{{DIFF}}
