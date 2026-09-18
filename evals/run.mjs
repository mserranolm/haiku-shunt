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
} from "../plugins/haiku-shunt/lib/anthropic.js";

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

rmSync(fixtures, { recursive: true, force: true });

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
