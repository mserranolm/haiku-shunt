#!/usr/bin/env node
/**
 * Offline evals for hook routing — no API key required.
 */
import { writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  decideFileRead,
  decideBashRead,
  handleHookEvent,
} from "../plugins/haiku-shunt/lib/hooks.js";
import {
  stripMarkdownFences,
  countLines,
  resolveBackend,
} from "../plugins/haiku-shunt/lib/anthropic.js";
import {
  buildClaudeArgs,
  parseClaudeOutput,
  callClaudeCli,
} from "../plugins/haiku-shunt/lib/claude-cli.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixtures = join(__dirname, "fixtures");
mkdirSync(fixtures, { recursive: true });

function makeFile(name, lines) {
  const path = join(fixtures, name);
  writeFileSync(
    path,
    Array.from({ length: lines }, (_, i) => `line ${i + 1}`).join("\n") + "\n",
  );
  return path;
}

const small = makeFile("small.txt", 10);
const large = makeFile("large.txt", 400);

let passed = 0;
let failed = 0;

function assert(name, cond, detail = "") {
  if (cond) {
    passed++;
    console.log(`PASS  ${name}`);
  } else {
    failed++;
    console.error(`FAIL  ${name}${detail ? " — " + detail : ""}`);
  }
}

// File read decisions
{
  const d = decideFileRead(
    { tool_name: "Read", tool_input: { file_path: large } },
    { minLines: 350 },
  );
  assert("blocks large full read", !d.allow && d.lines === 400);
}
{
  const d = decideFileRead(
    { tool_name: "Read", tool_input: { file_path: small } },
    { minLines: 350 },
  );
  assert("allows small file", d.allow);
}
{
  const d = decideFileRead(
    {
      tool_name: "Read",
      tool_input: { file_path: large, offset: 1, limit: 20 },
    },
    { minLines: 350 },
  );
  assert("allows targeted read with offset/limit", d.allow);
}
{
  const d = decideFileRead(
    { tool_name: "Read", tool_input: { file_path: "/no/such/file" } },
    { minLines: 350 },
  );
  assert("allows missing file (let Read fail)", d.allow);
}

// Bash decisions
{
  const d = decideBashRead(
    { tool_input: { command: `cat ${large}` } },
    { minLines: 350 },
  );
  assert("blocks cat on large file", !d.allow);
}
{
  const d = decideBashRead(
    { tool_input: { command: `cat ${large} | grep foo` } },
    { minLines: 350 },
  );
  assert("allows piped cat", d.allow);
}
{
  const d = decideBashRead(
    { tool_input: { command: `head -n 5 ${large}` } },
    { minLines: 350 },
  );
  // head without pipe still reads into context if output dumped — we block large files
  assert("blocks head on large file", !d.allow);
}
{
  const d = decideBashRead(
    { tool_input: { command: "git status" } },
    { minLines: 350 },
  );
  assert("allows non-read bash", d.allow);
}
{
  const d = decideBashRead(
    { tool_input: { command: `cat ${small}` } },
    { minLines: 350 },
  );
  assert("allows cat on small file", d.allow);
}

// handleHookEvent shapes
{
  const r = handleHookEvent({
    tool_name: "Read",
    tool_input: { file_path: large },
  });
  assert(
    "deny response has Claude + Cursor fields",
    r.permission === "deny" &&
      r.hookSpecificOutput?.permissionDecision === "deny" &&
      typeof r.agent_message === "string",
  );
}
{
  const r = handleHookEvent({
    tool_name: "Shell",
    tool_input: { command: `cat ${large}` },
  });
  assert("Shell matcher blocks large cat", r.permission === "deny");
}
{
  const r = handleHookEvent({
    hook_event_name: "beforeReadFile",
    file_path: large,
    content: "x\n".repeat(400),
  });
  assert("beforeReadFile blocks large content", r.permission === "deny");
}

// helpers
assert("countLines matches newlines", countLines(large) === 400);
assert(
  "stripMarkdownFences",
  stripMarkdownFences("```ts\nconst x = 1\n```") === "const x = 1",
);

// backend selection
assert("backend: api when key present", resolveBackend("", "sk-x") === "api");
assert("backend: claude when no key", resolveBackend("", "") === "claude");
assert(
  "backend: explicit claude wins over key",
  resolveBackend("claude", "sk-x") === "claude",
);
assert("backend: explicit api", resolveBackend("API", "") === "api");
{
  let threw = false;
  try {
    resolveBackend("gpt", "");
  } catch {
    threw = true;
  }
  assert("backend: rejects unknown value", threw);
}

// claude -p backend, without running claude
{
  const args = buildClaudeArgs({ system: "S", model: "haiku" });
  assert(
    "claude args: print + json + model + no tools + system prompt",
    args[0] === "-p" &&
      args.includes("--output-format") &&
      args.includes("json") &&
      args[args.indexOf("--model") + 1] === "haiku" &&
      args[args.indexOf("--tools") + 1] === "" &&
      args[args.indexOf("--system-prompt") + 1] === "S" &&
      !args.includes("--bare"),
  );
}
{
  const r = parseClaudeOutput(
    JSON.stringify({
      result: "  - one\n- two  ",
      usage: { input_tokens: 3, cache_read_input_tokens: 5, output_tokens: 7 },
      modelUsage: { "claude-haiku-4-5-20251001": {} },
    }),
    "haiku",
  );
  assert(
    "claude output: text trimmed, usage and model kept",
    r.text === "- one\n- two" &&
      r.usage.output_tokens === 7 &&
      r.model === "claude-haiku-4-5-20251001",
  );
}
{
  let msg = "";
  try {
    parseClaudeOutput(
      JSON.stringify({ is_error: true, result: "Not logged in · Please run /login" }),
      "haiku",
    );
  } catch (e) {
    msg = e.message;
  }
  assert("claude output: is_error becomes an Error", msg.includes("Not logged in"));
}
{
  let msg = "";
  try {
    parseClaudeOutput("not json", "haiku");
  } catch (e) {
    msg = e.message;
  }
  assert("claude output: non-JSON becomes an Error", msg.includes("not JSON"));
}
{
  // A fake `claude` that echoes stdin back inside the JSON envelope.
  const fake = join(fixtures, "fake-claude.mjs");
  writeFileSync(
    fake,
    `#!/usr/bin/env node
let input = "";
process.stdin.on("data", (d) => (input += d));
process.stdin.on("end", () => {
  const sys = process.argv[process.argv.indexOf("--system-prompt") + 1];
  process.stdout.write(JSON.stringify({
    result: "sys=" + sys + " user=" + input,
    usage: { input_tokens: input.length, output_tokens: 1 },
  }));
});
`,
  );
  const r2 = await callClaudeCli({
    system: "S",
    user: "U",
    model: "haiku",
    timeoutMs: 5000,
    bin: join(fixtures, "no-such-binary"),
  }).catch((e) => ({ error: e }));
  assert(
    "claude cli: missing binary names HAIKU_SHUNT_CLAUDE_BIN",
    r2.error?.message.includes("HAIKU_SHUNT_CLAUDE_BIN"),
  );
  // Happy path through a shell wrapper so the fake gets its script argument.
  const wrapper = join(fixtures, "fake-claude");
  writeFileSync(wrapper, `#!/bin/sh\nexec "${process.execPath}" "${fake}" "$@"\n`);
  const { chmodSync } = await import("node:fs");
  chmodSync(wrapper, 0o755);
  const r3 = await callClaudeCli({
    system: "S",
    user: "U",
    model: "haiku",
    timeoutMs: 5000,
    bin: wrapper,
  });
  assert(
    "claude cli: system prompt on argv, user on stdin, JSON parsed",
    r3.text === "sys=S user=U" && r3.usage.input_tokens === 1,
  );
}

rmSync(fixtures, { recursive: true, force: true });

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
