Explain this change set to an engineer who has not seen it before and needs to understand it well enough to review or maintain it.

Repository: {{REPO_NAME}}
Branch: {{BRANCH}}
Compared against: {{BASE}}
Stats: {{STATS}}

Commits in range:
{{COMMITS}}

Files:
{{FILE_LIST}}

Use exactly this structure:

## Summary
Two to four sentences: what changed and the most likely intent (label inferred intent as inferred).

## What changed, by area
Group related files into logical areas (feature, module, layer, tooling). For each area write a short paragraph: how it behaved before (if inferable from removed lines), how it behaves now, and the key locations with citations. Do not walk through files one by one unless there is only one area.

## Behavior changes
Bullet list of observable differences: API contracts, request/response shapes, UI, data written or read, configuration, environment variables, CLI flags, defaults, error messages, performance characteristics. Write "None observable (refactor only)" if that is the case.

## Data and control flow
Describe how a request, event or call travels through the changed code, naming the functions involved. If three or more components interact, add one Mermaid `flowchart` or `sequenceDiagram`.

## Where to look first
The three to five locations a reviewer should read most carefully, each with a citation and one sentence on why.

## Open questions
Things the diff does not answer that the author should clarify. Write "None" if there are none.

{{DIFF_LEGEND}}

{{DIFF}}
