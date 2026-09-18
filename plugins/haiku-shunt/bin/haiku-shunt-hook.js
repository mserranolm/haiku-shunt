#!/usr/bin/env node
/**
 * Hook entrypoint for Claude Code PreToolUse and Cursor preToolUse /
 * beforeReadFile / beforeShellExecution. Reads JSON from stdin, writes JSON to stdout.
 */
import { readStdin, writeHookResponse, handleHookEvent } from "../lib/hooks.js";

try {
  const event = await readStdin();
  const response = handleHookEvent(event);
  writeHookResponse(response);
  process.exit(0);
} catch (err) {
  // Fail open — never brick the agent on hook errors
  console.error(`[haiku-shunt] hook error: ${err.message}`);
  writeHookResponse({
    permission: "allow",
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "allow",
    },
  });
  process.exit(0);
}
