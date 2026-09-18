---
name: bulk-read
description: Delegate a large-file or multi-file question to Claude Haiku via haiku-shunt (keeps corpus out of frontier context).
---

# /bulk-read

Run this shell command (replace the question and paths):

```bash
haiku-shunt bulk-read --question "YOUR QUESTION" --paths path/one path/two
```

If `haiku-shunt` is not on PATH, use:

```bash
node "${CURSOR_PLUGIN_ROOT}/bin/haiku-shunt.js" bulk-read --question "YOUR QUESTION" --paths path/one
```

Use the returned bullets. Do not re-read the full files unless you need a specific section to edit (then Read with offset/limit).
