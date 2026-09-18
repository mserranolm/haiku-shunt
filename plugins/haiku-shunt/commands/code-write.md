---
name: code-write
description: Delegate boilerplate code generation to Claude Haiku; write straight to disk so the frontier model never sees the output.
---

# /code-write

```bash
haiku-shunt code-write \
  --spec "WHAT TO GENERATE" \
  --reference path/to/similar.file \
  --target path/to/output.file
```

`--reference` is required. Prefer `--target` so generated code never enters context.
