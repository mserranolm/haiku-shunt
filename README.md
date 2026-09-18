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
haiku-shunt doctor
```

No API key needed: delegation runs through `claude -p` with the login Claude Code already has (claude.ai subscription or key). See [Backends](#backends).

Then:

- **Cursor:** `Developer: Reload Window` → **Customize → Plugins** → confirm `haiku-shunt`
- **Claude Code:** also run the marketplace commands in Option B (recommended)

### Option B — Claude Code plugin (2 commands)

```bash
claude plugin marketplace add mserranolm/haiku-shunt
claude plugin install haiku-shunt@haiku-shunt
```

Works out of the box with your Claude Code login. Export `ANTHROPIC_API_KEY` only if you want the Messages API instead.

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

## Backends

| Backend  | How                                                        | Needs                                     |
| -------- | ---------------------------------------------------------- | ----------------------------------------- |
| `claude` | Spawns `claude -p --model haiku` with the files on stdin   | Claude Code on `PATH`, logged in          |
| `api`    | `POST /v1/messages`                                        | `ANTHROPIC_API_KEY`                       |

Default: `api` if `ANTHROPIC_API_KEY` is set, otherwise `claude`. Force one with `HAIKU_SHUNT_BACKEND`.

The `claude` backend runs with `--tools ""`, `--setting-sources ""`, `--strict-mcp-config`, `--max-turns 1` and `--no-session-persistence`, and replaces the system prompt: the call carries the files and the question plus ~400 tokens of preamble, nothing from your `CLAUDE.md`, hooks or MCP servers. It works from inside a Claude Code session (nested `-p` is fine) and counts against your subscription, not a separate bill. `--bare` is deliberately not used: it skips the keychain and the CLI answers "Not logged in".

## Config

| Variable                 | Default                     | Purpose                                    |
| ------------------------ | --------------------------- | ------------------------------------------ |
| `HAIKU_SHUNT_BACKEND`    | `api` if key set, else `claude` | `api` or `claude`                      |
| `ANTHROPIC_API_KEY`      | —                           | Messages API key (`api` backend)           |
| `HAIKU_SHUNT_CLAUDE_BIN` | `claude`                    | Binary for the `claude` backend            |
| `HAIKU_SHUNT_MODEL`      | `claude-haiku-4-5`          | Worker model (`haiku` also works with `claude`) |
| `HAIKU_SHUNT_MIN_LINES`  | `350`                       | Hook threshold                             |
| `HAIKU_SHUNT_TIMEOUT_MS` | `120000`                    | Timeout for either backend                 |

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
haiku-shunt doctor
```

Sin API key: usa el login de Claude Code (`claude -p`). Exporta `ANTHROPIC_API_KEY` solo si prefieres la Messages API.

- Cursor: recarga la ventana → Plugins
- Claude Code: `claude plugin marketplace add mserranolm/haiku-shunt` && `claude plugin install haiku-shunt@haiku-shunt`

---

## Credits

Architecture inspired by Dimitri Mazmanov / Spotify Engineering and the [`shunt`](https://github.com/spotify/portal-ai-plugins) plugin (Apache-2.0). See [NOTICE](./NOTICE).

## License

Apache-2.0
