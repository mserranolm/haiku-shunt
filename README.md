# haiku-shunt

**Shunt I/O-heavy agent work to [Claude Haiku](https://www.anthropic.com/claude/haiku)** so your frontier model (Claude Code / Cursor Agent) stops burning tokens on giant file dumps and boilerplate.

Inspired by [Spotify’s shunt / Portal architecture](https://engineering.atspotify.com/2026/09/portal-by-spotify-cut-my-claude-code-token-usage-by-90) (Apache-2.0). This is a clean-room reimplementation that uses the Anthropic API instead of Spotify Portal.

|         | Spotify `shunt`                 | **haiku-shunt**                       |
| ------- | ------------------------------- | ------------------------------------- |
| Worker  | Portal AiKA (e.g. Gemini Flash) | **Claude Haiku** (`claude-haiku-4-5`) |
| Agents  | Claude Code                     | **Claude Code + Cursor**              |
| Install | Portal marketplace + auth       | **One curl / plugin install**         |

---

## Install (pick one)

### Option A — one liner (Claude Code + Cursor)

```bash
curl -fsSL https://raw.githubusercontent.com/mserranolm/haiku-shunt/main/install.sh | bash
export ANTHROPIC_API_KEY=sk-...
haiku-shunt doctor
```

Then:

- **Cursor:** `Developer: Reload Window` → **Customize → Plugins** → confirm `haiku-shunt`
- **Claude Code:** also run the marketplace commands in Option B (recommended)

### Option B — Claude Code plugin (2 commands)

```bash
claude plugin marketplace add mserranolm/haiku-shunt
claude plugin install haiku-shunt@haiku-shunt
```

Requires `ANTHROPIC_API_KEY` in the environment (or Claude’s env settings).

### Option C — Cursor local plugin (from a clone)

```bash
git clone https://github.com/mserranolm/haiku-shunt.git
cd haiku-shunt
node plugins/haiku-shunt/bin/haiku-shunt.js install --cursor
# Reload Window → Customize → Plugins
```

The installer symlinks the plugin to `~/.cursor/plugins/local/haiku-shunt`.

### Option D — npm / PATH CLI only

```bash
git clone https://github.com/mserranolm/haiku-shunt.git ~/.haiku-shunt
node ~/.haiku-shunt/plugins/haiku-shunt/bin/haiku-shunt.js install --all
```

Ensure `~/.local/bin` is on your `PATH`.

---

## How it works

Three layers (same idea as Spotify):

1. **Hooks** — block full reads of files over **350 lines** (and `cat`/`head`/`tail`/`less`/`more` without a pipe). Targeted reads (`offset`/`limit`) and pipes pass through.
2. **CLI** — `bulk-read` / `code-write` send the corpus to **Haiku**; bullets/code come back (or land on disk).
3. **Skills / commands** — teach the agent when to call the CLI after a deny.

```bash
haiku-shunt bulk-read --question "What does this service do?" --paths src/a.ts src/b.ts

haiku-shunt code-write \
  --spec "Write tests for UserService" \
  --reference tests/OrderService.test.ts \
  --target tests/UserService.test.ts
```

With `--target`, generated code is written to disk and **not** printed — so the frontier model never ingests it.

---

## Config

| Variable                 | Default            | Purpose                 |
| ------------------------ | ------------------ | ----------------------- |
| `ANTHROPIC_API_KEY`      | —                  | Required for delegation |
| `HAIKU_SHUNT_MODEL`      | `claude-haiku-4-5` | Worker model            |
| `HAIKU_SHUNT_MIN_LINES`  | `350`              | Hook threshold          |
| `HAIKU_SHUNT_TIMEOUT_MS` | `120000`           | API timeout             |

---

## What not to delegate

- Debugging / subtle bugs
- Architecture decisions
- Safety-critical code
- Small files (overhead > savings)
- Edits that need exact lines in context → use Read with `offset`/`limit`

---

## Develop / test

```bash
npm test          # offline hook evals (no API key)
haiku-shunt doctor
```

---

## Español (resumen)

Plugin que **desvía lecturas grandes y boilerplate a Claude Haiku** para ahorrar tokens del modelo caro en **Claude Code y Cursor**.

```bash
curl -fsSL https://raw.githubusercontent.com/mserranolm/haiku-shunt/main/install.sh | bash
export ANTHROPIC_API_KEY=sk-...
```

- Cursor: recarga la ventana → Plugins
- Claude Code: `claude plugin marketplace add mserranolm/haiku-shunt` && `claude plugin install haiku-shunt@haiku-shunt`

---

## Credits

Architecture inspired by Dimitri Mazmanov / Spotify Engineering and the [`shunt`](https://github.com/spotify/portal-ai-plugins) plugin (Apache-2.0). See [NOTICE](./NOTICE).

## License

Apache-2.0
