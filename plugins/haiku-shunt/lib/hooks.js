import { existsSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { countLines, getConfig } from "./anthropic.js";

/**
 * Build a deny/allow response compatible with Claude Code PreToolUse and Cursor preToolUse.
 */
export function allowResponse() {
  return {
    permission: "allow",
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "allow",
    },
  };
}

export function denyResponse(reason) {
  return {
    permission: "deny",
    user_message: reason,
    agent_message: reason,
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: reason,
    },
  };
}

function getToolInput(event) {
  return event?.tool_input || event?.toolInput || event?.input || {};
}

function getToolName(event) {
  return event?.tool_name || event?.toolName || event?.tool || "";
}

function getShellCommand(event) {
  const input = getToolInput(event);
  return input.command || event?.command || "";
}

/**
 * Decide whether a Read-like tool call should be blocked.
 * @returns {{ allow: boolean, reason?: string, lines?: number }}
 */
export function decideFileRead(event, options = {}) {
  const minLines = options.minLines ?? getConfig().minLines;
  const input = getToolInput(event);
  const filePath = input.file_path || input.path || event?.file_path || "";

  const offset = input.offset;
  const limit = input.limit;
  const hasOffset = offset !== undefined && offset !== null && offset !== "";
  const hasLimit = limit !== undefined && limit !== null && limit !== "";

  if (hasOffset || hasLimit) {
    return { allow: true };
  }

  // Cursor beforeReadFile may include content; count lines from content if no path access needed
  if (!filePath) {
    if (typeof event?.content === "string") {
      const lines =
        (event.content.match(/\n/g) || []).length || (event.content ? 1 : 0);
      if (lines > minLines) {
        return {
          allow: false,
          lines,
          reason: bulkReaderReason(lines, minLines),
        };
      }
    }
    return { allow: true };
  }

  const resolved = resolve(filePath);
  if (!existsSync(resolved) || !statSync(resolved).isFile()) {
    return { allow: true };
  }

  const lines = countLines(resolved);
  if (lines <= minLines) {
    return { allow: true, lines };
  }

  return {
    allow: false,
    lines,
    reason: bulkReaderReason(lines, minLines),
  };
}

function bulkReaderReason(lines, minLines) {
  return (
    `File is ${lines} lines (threshold: ${minLines}). ` +
    `Use the bulk-reader skill / \`haiku-shunt bulk-read\` to delegate this read to Claude Haiku ` +
    `instead of reading it directly into context. ` +
    `If you need exact content for editing, re-read with an offset/limit for just the section you need.`
  );
}

/**
 * Decide whether a Bash/Shell read of a large file should be blocked.
 */
export function decideBashRead(event, options = {}) {
  const minLines = options.minLines ?? getConfig().minLines;
  const command = getShellCommand(event);
  if (!command) return { allow: true };

  // Targeted reads via pipe or redirection — allow
  if (/[|>]/.test(command)) {
    return { allow: true };
  }

  const match = command.match(/^\s*(cat|head|tail|less|more)\s+(.+)$/s);
  if (!match) return { allow: true };

  const cmdName = match[1];
  const args = match[2].trim().split(/\s+/);
  const candidates = [];
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    // Skip flags; also skip the numeric arg that follows -n / -c for head/tail
    if (arg.startsWith("-")) {
      if (/^-[ncN]$/.test(arg) && args[i + 1] && /^\d+$/.test(args[i + 1])) {
        i++;
      }
      continue;
    }
    if (/^\d+$/.test(arg) && (cmdName === "head" || cmdName === "tail")) {
      continue;
    }
    candidates.push(arg.replace(/^['"]|['"]$/g, ""));
  }

  // Prefer the last path-like argument (handles: head -n 5 ./file)
  const filePath = candidates.length ? candidates[candidates.length - 1] : "";

  if (!filePath) return { allow: true };

  const resolved = resolve(filePath);
  if (!existsSync(resolved) || !statSync(resolved).isFile()) {
    return { allow: true };
  }

  const lines = countLines(resolved);
  if (lines <= minLines) {
    return { allow: true, lines };
  }

  return {
    allow: false,
    lines,
    reason:
      `File is ${lines} lines (threshold: ${minLines}). ` +
      `Use the bulk-reader skill / \`haiku-shunt bulk-read\` instead of ${match[1]} on this large file.`,
  };
}

/**
 * Route an incoming hook event to the right decision.
 * Supports Claude Code PreToolUse and Cursor preToolUse / beforeReadFile / beforeShellExecution.
 */
export function handleHookEvent(event) {
  const toolName = getToolName(event);
  const eventName = event?.hook_event_name || event?.hookEventName || "";

  // Cursor beforeReadFile
  if (
    eventName === "beforeReadFile" ||
    (event?.file_path && event?.content !== undefined && !toolName)
  ) {
    const decision = decideFileRead(event);
    return decision.allow ? allowResponse() : denyResponse(decision.reason);
  }

  // Cursor beforeShellExecution
  if (eventName === "beforeShellExecution" || (event?.command && !toolName)) {
    const decision = decideBashRead({
      tool_input: { command: event.command || getShellCommand(event) },
    });
    return decision.allow ? allowResponse() : denyResponse(decision.reason);
  }

  const normalized = String(toolName).toLowerCase();
  if (normalized === "read" || normalized.endsWith(":read")) {
    const decision = decideFileRead(event);
    return decision.allow ? allowResponse() : denyResponse(decision.reason);
  }

  if (
    normalized === "bash" ||
    normalized === "shell" ||
    normalized.endsWith(":bash") ||
    normalized.endsWith(":shell")
  ) {
    const decision = decideBashRead(event);
    return decision.allow ? allowResponse() : denyResponse(decision.reason);
  }

  return allowResponse();
}

export async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString("utf8").trim();
  if (!raw) return {};
  return JSON.parse(raw);
}

export function writeHookResponse(response) {
  process.stdout.write(JSON.stringify(response) + "\n");
}
