import {
  mkdirSync,
  writeFileSync,
  readFileSync,
  existsSync,
  symlinkSync,
  unlinkSync,
  lstatSync,
  rmSync,
  cpSync,
  chmodSync,
} from "node:fs";
import { spawnSync } from "node:child_process";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveBackend } from "./anthropic.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
/** Plugin root: plugins/haiku-shunt */
export const PLUGIN_ROOT = resolve(__dirname, "..");
/** Git clone / package root */
export const REPO_ROOT = resolve(PLUGIN_ROOT, "..", "..");

const MARKER = "haiku-shunt";

function ensureDir(p) {
  mkdirSync(p, { recursive: true });
}

function readJson(path, fallback = {}) {
  if (!existsSync(path)) return structuredClone(fallback);
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return structuredClone(fallback);
  }
}

function writeJson(path, data) {
  ensureDir(dirname(path));
  writeFileSync(path, JSON.stringify(data, null, 2) + "\n", "utf8");
}

function replaceLinkOrCopy(target, source) {
  if (existsSync(target)) {
    try {
      const st = lstatSync(target);
      if (st.isSymbolicLink() || st.isFile()) unlinkSync(target);
      else rmSync(target, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
  try {
    symlinkSync(source, target);
  } catch {
    cpSync(source, target, { recursive: true });
  }
}

function hookCommand() {
  return `node ${join(PLUGIN_ROOT, "bin", "haiku-shunt-hook.js")}`;
}

/** Symlink CLI into ~/.local/bin */
export function installCliBin() {
  const binDir = join(homedir(), ".local", "bin");
  ensureDir(binDir);
  const target = join(binDir, "haiku-shunt");
  const source = join(PLUGIN_ROOT, "bin", "haiku-shunt.js");
  chmodSync(source, 0o755);
  chmodSync(join(PLUGIN_ROOT, "bin", "haiku-shunt-hook.js"), 0o755);
  replaceLinkOrCopy(target, source);
  // If symlink of .js without shebang exec fails on some systems, write wrapper
  if (!existsSync(target)) {
    writeFileSync(target, `#!/usr/bin/env bash\nexec node "${source}" "$@"\n`, {
      mode: 0o755,
    });
  } else {
    try {
      // Prefer a small wrapper so `haiku-shunt` always runs via node
      unlinkSync(target);
    } catch {
      /* ignore */
    }
    writeFileSync(target, `#!/usr/bin/env bash\nexec node "${source}" "$@"\n`, {
      mode: 0o755,
    });
  }
  return target;
}

/**
 * Install as a Cursor local plugin (Customize → Plugins).
 * Path: ~/.cursor/plugins/local/haiku-shunt
 */
export function installCursorPlugin() {
  const localRoot = join(homedir(), ".cursor", "plugins", "local");
  ensureDir(localRoot);
  const target = join(localRoot, "haiku-shunt");
  replaceLinkOrCopy(target, PLUGIN_ROOT);
  return target;
}

/**
 * Fallback: also wire ~/.cursor/hooks.json if the user prefers hooks without plugins UI.
 * Primary path for Cursor is installCursorPlugin().
 */
export function installCursorHooksFallback() {
  const cursorDir = join(homedir(), ".cursor");
  const hooksDir = join(cursorDir, "hooks");
  ensureDir(hooksDir);

  const hookScript = join(hooksDir, "haiku-shunt-hook.js");
  writeFileSync(
    hookScript,
    `#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
const hook = ${JSON.stringify(join(PLUGIN_ROOT, "bin", "haiku-shunt-hook.js"))};
const r = spawnSync(process.execPath, [hook], { stdio: 'inherit', env: process.env });
process.exit(r.status ?? 1);
`,
    { mode: 0o755 },
  );

  const relativeCmd = "./hooks/haiku-shunt-hook.js";
  const hooksPath = join(cursorDir, "hooks.json");
  const hooksConfig = readJson(hooksPath, { version: 1, hooks: {} });
  hooksConfig.version = 1;
  hooksConfig.hooks = hooksConfig.hooks || {};

  for (const key of ["preToolUse", "beforeReadFile", "beforeShellExecution"]) {
    const list = hooksConfig.hooks[key] || [];
    hooksConfig.hooks[key] = list.filter(
      (h) => !(typeof h.command === "string" && h.command.includes(MARKER)),
    );
  }

  hooksConfig.hooks.preToolUse = hooksConfig.hooks.preToolUse || [];
  hooksConfig.hooks.preToolUse.push(
    { command: relativeCmd, matcher: "Read", timeout: 10 },
    { command: relativeCmd, matcher: "Shell", timeout: 10 },
  );
  hooksConfig.hooks.beforeReadFile = hooksConfig.hooks.beforeReadFile || [];
  hooksConfig.hooks.beforeReadFile.push({
    command: relativeCmd,
    matcher: "Read",
    timeout: 10,
  });
  hooksConfig.hooks.beforeShellExecution =
    hooksConfig.hooks.beforeShellExecution || [];
  hooksConfig.hooks.beforeShellExecution.push({
    command: relativeCmd,
    timeout: 10,
  });

  writeJson(hooksPath, hooksConfig);
  return hooksPath;
}

/** Merge hooks into ~/.claude/settings.json (also used by Cursor Third-Party Imports). */
export function installClaudeHooks() {
  const settingsPath = join(homedir(), ".claude", "settings.json");
  const settings = readJson(settingsPath, {});
  settings.hooks = settings.hooks || {};
  settings.hooks.PreToolUse = settings.hooks.PreToolUse || [];

  settings.hooks.PreToolUse = settings.hooks.PreToolUse.filter(
    (entry) =>
      !JSON.stringify(entry).includes(MARKER) &&
      !JSON.stringify(entry).includes("haiku-shunt-hook"),
  );

  const cmd = hookCommand();
  settings.hooks.PreToolUse.push(
    {
      matcher: "Read",
      hooks: [{ type: "command", command: cmd, timeout: 10 }],
    },
    {
      matcher: "Bash",
      hooks: [{ type: "command", command: cmd, timeout: 10 }],
    },
    {
      matcher: "Shell",
      hooks: [{ type: "command", command: cmd, timeout: 10 }],
    },
  );

  settings.env = settings.env || {};
  if (!settings.env.HAIKU_SHUNT_MIN_LINES) {
    settings.env.HAIKU_SHUNT_MIN_LINES = "350";
  }

  writeJson(settingsPath, settings);
  return settingsPath;
}

export function installClaudeSkills() {
  const dstRoot = join(homedir(), ".claude", "skills");
  ensureDir(dstRoot);
  for (const name of ["bulk-reader", "code-writer"]) {
    const from = join(PLUGIN_ROOT, "skills", name);
    const to = join(dstRoot, name);
    if (existsSync(from)) {
      ensureDir(to);
      cpSync(from, to, { recursive: true });
    }
  }
  return dstRoot;
}

/**
 * Print Claude Code marketplace instructions (official plugin path).
 * Also registers user-level hooks as a zero-friction fallback.
 */
export function installClaudePluginHints() {
  return {
    marketplace: "claude plugin marketplace add mserranolm/haiku-shunt",
    install: "claude plugin install haiku-shunt@haiku-shunt",
  };
}

export function runInstall({
  claude = true,
  cursor = true,
  hooksFallback = false,
} = {}) {
  const results = {
    notes: [],
  };
  results.bin = installCliBin();

  if (claude) {
    results.claudeSettings = installClaudeHooks();
    results.claudeSkills = installClaudeSkills();
    results.claudePlugin = installClaudePluginHints();
    results.notes.push(
      "Claude Code plugin (recommended): claude plugin marketplace add mserranolm/haiku-shunt && claude plugin install haiku-shunt@haiku-shunt",
    );
    results.notes.push(
      "User-level Claude hooks were also registered so it works even before the marketplace plugin loads.",
    );
  }

  if (cursor) {
    results.cursorPlugin = installCursorPlugin();
    results.notes.push(
      "Cursor plugin installed to ~/.cursor/plugins/local/haiku-shunt — reload the window (Developer: Reload Window), then check Customize → Plugins.",
    );
    if (hooksFallback) {
      results.cursorHooks = installCursorHooksFallback();
    }
  }

  return results;
}

export function runDoctor() {
  const checks = [];
  const apiKey = process.env.ANTHROPIC_API_KEY;
  let backend;
  try {
    backend = resolveBackend(process.env.HAIKU_SHUNT_BACKEND, apiKey);
  } catch (err) {
    checks.push({ name: "backend", ok: false, detail: err.message });
  }
  if (backend === "api") {
    checks.push({
      name: "backend",
      ok: true,
      detail: "api (ANTHROPIC_API_KEY set)",
    });
  } else if (backend === "claude") {
    const bin = process.env.HAIKU_SHUNT_CLAUDE_BIN || "claude";
    const probe = spawnSync(bin, ["--version"], { encoding: "utf8" });
    const found = probe.status === 0;
    checks.push({
      name: "backend",
      ok: found,
      detail: found
        ? `claude -p (${probe.stdout.trim()}) — uses the Claude Code login`
        : `claude -p: '${bin}' not found on PATH; install Claude Code, set HAIKU_SHUNT_CLAUDE_BIN, or export ANTHROPIC_API_KEY`,
    });
  }

  const bin = join(homedir(), ".local", "bin", "haiku-shunt");
  checks.push({
    name: "CLI (~/.local/bin/haiku-shunt)",
    ok: existsSync(bin),
    detail: existsSync(bin) ? bin : "not installed — run: haiku-shunt install",
  });

  const cursorPlugin = join(
    homedir(),
    ".cursor",
    "plugins",
    "local",
    "haiku-shunt",
  );
  checks.push({
    name: "Cursor local plugin",
    ok: existsSync(cursorPlugin),
    detail: existsSync(cursorPlugin)
      ? cursorPlugin
      : "missing — run: haiku-shunt install --cursor",
  });

  const claudeSettings = join(homedir(), ".claude", "settings.json");
  let claudeHooks = false;
  if (existsSync(claudeSettings)) {
    claudeHooks = readFileSync(claudeSettings, "utf8").includes(
      "haiku-shunt-hook",
    );
  }
  checks.push({
    name: "Claude Code hooks (user settings)",
    ok: claudeHooks,
    detail: claudeHooks
      ? claudeSettings
      : "not registered — run: haiku-shunt install --claude (or install the Claude marketplace plugin)",
  });

  checks.push({
    name: "Node.js >= 18",
    ok: Number(process.versions.node.split(".")[0]) >= 18,
    detail: process.versions.node,
  });

  return { ok: checks.every((c) => c.ok), checks };
}
