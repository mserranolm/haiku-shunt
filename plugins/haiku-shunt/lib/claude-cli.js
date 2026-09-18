import { spawn } from "node:child_process";

/**
 * Backend that runs `claude -p` (Claude Code in print mode) instead of the
 * Messages API. Uses whatever login Claude Code already has (claude.ai
 * subscription or API key), so nothing has to be exported in the shell.
 *
 * `--system-prompt` replaces Claude Code's own system prompt: the call pays
 * only for the files and the question, not for the agent preamble.
 */
export function buildClaudeArgs({ system, model }) {
  const args = [
    "-p",
    "--output-format",
    "json",
    "--model",
    model,
    // One answer, no tools, no MCP servers, no settings or CLAUDE.md, no
    // session on disk: the prompt is the files plus the question, so the
    // token count means what it says (~400 tokens of preamble instead of
    // ~4,500 with CLAUDE.md, ~25,000 with the tool catalogue). Not `--bare`:
    // it skips the keychain and the CLI answers "Not logged in".
    "--tools",
    "",
    "--setting-sources",
    "",
    "--strict-mcp-config",
    "--max-turns",
    "1",
    "--no-session-persistence",
  ];
  if (system) args.push("--system-prompt", system);
  return args;
}

/**
 * Parse the JSON `claude -p --output-format json` prints on stdout.
 * Returns { text, usage, model }.
 */
export function parseClaudeOutput(stdout, fallbackModel) {
  let body;
  try {
    body = JSON.parse(stdout);
  } catch {
    throw new Error(
      `claude -p returned something that is not JSON: ${stdout.slice(0, 200)}`,
    );
  }
  if (body.is_error || body.subtype === "error") {
    throw new Error(`claude -p failed: ${body.result || body.subtype}`);
  }
  const usage = body.usage || {};
  return {
    text: String(body.result || "").trim(),
    usage,
    model: body.model || Object.keys(body.modelUsage || {})[0] || fallbackModel,
  };
}

export function callClaudeCli({
  system,
  user,
  model,
  timeoutMs,
  bin = process.env.HAIKU_SHUNT_CLAUDE_BIN || "claude",
}) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(bin, buildClaudeArgs({ system, model }), {
      stdio: ["pipe", "pipe", "pipe"],
      env: process.env,
    });

    let stdout = "";
    let stderr = "";
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill("SIGKILL");
      reject(new Error(`claude -p timed out after ${timeoutMs} ms`));
    }, timeoutMs);

    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));
    child.on("error", (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(
        err.code === "ENOENT"
          ? new Error(
              `'${bin}' not found on PATH. Install Claude Code or set HAIKU_SHUNT_CLAUDE_BIN.`,
            )
          : err,
      );
    });
    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (code !== 0) {
        reject(
          new Error(
            `claude -p exited with ${code}: ${stderr.trim() || stdout.slice(0, 200)}`,
          ),
        );
        return;
      }
      try {
        resolvePromise(parseClaudeOutput(stdout, model));
      } catch (err) {
        reject(err);
      }
    });

    child.stdin.on("error", () => {});
    child.stdin.end(user);
  });
}
