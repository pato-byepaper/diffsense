Write the internal pull request description for this change set. The audience is the engineers who will review, deploy and maintain this code. It must be complete and ready to paste into GitHub or GitLab as-is.

Repository: {{REPO_NAME}}
Branch: {{BRANCH}}
Compared against: {{BASE}}
Stats: {{STATS}}

Commits in range:
{{COMMITS}}

Files:
{{FILE_LIST}}

Local scanner findings (use them for the Security section, verify before repeating them):
{{LOCAL_FINDINGS}}

Use exactly these sections in this order. Keep every heading, even when a section is short.

# Title
Replace "Title" with the pull request title: imperative mood, at most 72 characters, prefixed with a conventional commit type (feat, fix, refactor, perf, docs, test, build, ci, chore) and an optional scope, for example "feat(billing): add proration preview endpoint".

## Summary
Three to five sentences: what this pull request does and why it matters. Lead with the user or system impact.

## Motivation and context
Why the change was needed, inferred from the code and commit messages. Label inferences as inferred. Write "Not determinable from the diff" if there is no signal.

## Changes
Grouped by area with a `###` subheading per area. Bullets describing each meaningful change with citations. Mention removed behavior explicitly.

## Architecture
At least one Mermaid diagram showing the components touched by this change and how they interact. Choose the type that fits:
- `flowchart TD` or `flowchart LR` for control flow and module dependencies
- `sequenceDiagram` for request lifecycles across services, APIs, queues or the UI
- `erDiagram` for database or schema changes (add this in addition to the main diagram when the schema changes)
- `stateDiagram-v2` for state machines or status transitions
Show only components touched or directly affected by the change. Mark new components by ending the label with " - new" and changed components with " - changed". Follow each diagram with two or three sentences explaining it.

## Files changed
| File | Status | +/- | Summary |
|------|--------|-----|---------|
One row per file in the file list, in the same order. Group lockfiles and generated files into a single row.

## Code analysis
### Design decisions and trade-offs
What approach was taken, what alternatives exist, and what this approach costs.
### Performance
Complexity changes, new queries, loops over unbounded data, network calls, caching, memory growth. Cite locations.
### Security
Authentication, authorization, input validation, secrets, data exposure. Write "No security-relevant changes found" only if that is true.
### Error handling and edge cases
How failures are handled, what happens with empty, null, very large, concurrent or duplicate inputs.
### Backward compatibility
Breaking changes to APIs, data formats, configuration, database schema, or public interfaces, and whether a migration path exists.

## Testing
### Automated
Tests added or changed in this diff, with what they cover. Write "No tests were added or changed." if none.
### Manual verification
Numbered steps a reviewer can follow, with concrete commands, URLs or inputs derived from the code.
### Gaps
Behavior introduced by this change that no test covers.

## Deployment notes
New environment variables, migrations, feature flags, required order of operations, infrastructure changes, and a rollback plan. Write "No special deployment steps." if none apply.

## Reviewer checklist
Five to ten `- [ ]` items specific to this change set, each pointing at something concrete to verify. No generic items like "code is clean".

{{DIFF_LEGEND}}

{{DIFF}}
