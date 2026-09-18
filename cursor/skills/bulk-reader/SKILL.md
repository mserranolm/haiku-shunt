---
name: bulk-reader
description: >
  Delegate large-file or multi-file reading to Claude Haiku via haiku-shunt.
  Use when a Read/Bash of a large file was blocked, or when answering a question
  that would require loading many lines into the frontier model context.
  Do NOT use for debugging, architecture decisions, or when you need exact
  content to edit (use targeted Read with offset/limit instead).
---

# bulk-reader

When hooks block a large file read, call the CLI instead of retrying a full Read.

## Command

```bash
haiku-shunt bulk-read --question "YOUR QUESTION" --paths path/to/file1 path/to/file2
```

## Rules

1. Put the user's question (or the analysis you need) in `--question`.
2. Pass one or more file paths in `--paths`.
3. Use the returned bullets in your reply. Do **not** re-read the full files afterward unless you need a specific section to edit (then use Read with offset/limit).
4. Every call is one-shot — follow-ups re-send paths to Haiku, which is fine; they still stay out of the frontier context.

## Example

```bash
haiku-shunt bulk-read --question "Which methods talk to the database?" --paths src/Service.ts src/Repo.ts
```
