---
name: code-writer
description: >
  Delegate boilerplate / pattern-matched code generation to Claude Haiku via
  haiku-shunt. Use for tests, config stubs, type stubs, or files that closely
  mirror an existing reference. Prefer writing with --target so the generated
  code never enters the frontier model context. Do NOT use for novel architecture,
  security-critical logic, or subtle debugging fixes.
---

# code-writer

Generate boilerplate with Haiku. The frontier model only supplies the spec and a reference file.

## Command

```bash
haiku-shunt code-write --spec "WHAT TO GENERATE" --reference path/to/similar.file --target path/to/output.file
```

## Rules

1. `--reference` is **required** — Haiku must match existing project patterns.
2. Prefer `--target` so code is written straight to disk. When `--target` is set, the CLI prints nothing to stdout (by design).
3. After writing, verify with targeted reads / tests — do not dump the whole new file into context unless needed.
4. Split very large generations into smaller specs.

## Example

```bash
haiku-shunt code-write \
  --spec "Write unit tests for UserService matching the style of the reference" \
  --reference tests/OrderService.test.ts \
  --target tests/UserService.test.ts
```
