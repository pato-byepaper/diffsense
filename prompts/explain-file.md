Explain the changes to a single file inside a larger change set.

Repository: {{REPO_NAME}}
Branch: {{BRANCH}}
File: {{FILE_PATH}}

Other files in the same change set (for context only, their content is not included):
{{FILE_LIST}}

Use exactly this structure:

## {{FILE_PATH}}

### Purpose of the change
One to three sentences.

### Line by line
Walk through each hunk in order. For each hunk cite the line range, say what was there before (if removed lines exist), what is there now, and why it likely changed. Merge trivial hunks (imports, formatting) into one bullet.

### Effects outside this file
Callers, imports, types, configuration or behavior elsewhere that this change likely affects, based on exported names and the file list above. Label inferences as inferred.

### Concerns
Concrete bugs, edge cases or risks visible in this file, each with a citation. Write "None found" if there are none.

{{DIFF_LEGEND}}

{{DIFF}}
