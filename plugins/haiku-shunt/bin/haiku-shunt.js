#!/usr/bin/env node
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { bulkRead, codeWrite } from "../lib/anthropic.js";
import { runInstall, runDoctor } from "../lib/install.js";

function printHelp() {
  console.log(`haiku-shunt — shunt I/O-heavy agent work to Claude Haiku

Easy install (Claude Code + Cursor plugins):
  curl -fsSL https://raw.githubusercontent.com/mserranolm/haiku-shunt/main/install.sh | bash

  # or from a clone / npm:
  haiku-shunt install          # both
  haiku-shunt install --claude
  haiku-shunt install --cursor

Claude Code marketplace (also):
  claude plugin marketplace add mserranolm/haiku-shunt
  claude plugin install haiku-shunt@haiku-shunt

Usage:
  haiku-shunt doctor
  haiku-shunt bulk-read --question "..." --paths <file> [file...]
  haiku-shunt code-write --spec "..." --reference <file> [--target <file>]
  haiku-shunt help

Environment:
  ANTHROPIC_API_KEY          required for bulk-read / code-write
  HAIKU_SHUNT_MODEL          default: claude-haiku-4-5
  HAIKU_SHUNT_MIN_LINES      default: 350
  HAIKU_SHUNT_TIMEOUT_MS     default: 120000
`);
}

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (
      a === "--question" ||
      a === "--spec" ||
      a === "--reference" ||
      a === "--target"
    ) {
      args[a.slice(2)] = argv[++i];
    } else if (a === "--paths") {
      args.paths = [];
      while (argv[i + 1] && !argv[i + 1].startsWith("--")) {
        args.paths.push(argv[++i]);
      }
    } else if (a === "--claude") {
      args.claude = true;
    } else if (a === "--cursor") {
      args.cursor = true;
    } else if (a === "--all") {
      args.all = true;
    } else if (a === "--hooks-fallback") {
      args.hooksFallback = true;
    } else if (a.startsWith("-")) {
      throw new Error(`Unknown flag: ${a}`);
    } else {
      args._.push(a);
    }
  }
  return args;
}

function logUsage(label, usage, model) {
  if (!usage) return;
  const inTok = usage.input_tokens ?? usage.inputTokens ?? "?";
  const outTok = usage.output_tokens ?? usage.outputTokens ?? "?";
  console.error(
    `[haiku-shunt] ${label} model=${model} input=${inTok} output=${outTok}`,
  );
}

async function main() {
  const argv = process.argv.slice(2);
  if (
    argv.length === 0 ||
    argv[0] === "help" ||
    argv[0] === "--help" ||
    argv[0] === "-h"
  ) {
    printHelp();
    return;
  }

  const cmd = argv[0];
  const args = parseArgs(argv.slice(1));

  if (cmd === "install") {
    const all = args.all || (!args.claude && !args.cursor);
    const results = runInstall({
      claude: all || Boolean(args.claude),
      cursor: all || Boolean(args.cursor),
      hooksFallback: Boolean(args.hooksFallback),
    });
    console.log("Installed haiku-shunt:\n");
    for (const [k, v] of Object.entries(results)) {
      if (k === "notes") continue;
      console.log(`  ${k}: ${typeof v === "object" ? JSON.stringify(v) : v}`);
    }
    if (results.notes?.length) {
      console.log("\nNext steps:");
      for (const n of results.notes) console.log(`  • ${n}`);
    }
    console.log(
      "\nThen: export ANTHROPIC_API_KEY=sk-... && haiku-shunt doctor",
    );
    console.log("Ensure ~/.local/bin is on your PATH.");
    return;
  }

  if (cmd === "doctor") {
    const { ok, checks } = runDoctor();
    for (const c of checks) {
      console.log(`${c.ok ? "OK  " : "FAIL"}  ${c.name}: ${c.detail}`);
    }
    process.exit(ok ? 0 : 1);
  }

  if (cmd === "bulk-read") {
    const result = await bulkRead({
      question: args.question,
      paths: args.paths,
    });
    logUsage("bulk-read", result.usage, result.model);
    process.stdout.write(result.text + "\n");
    return;
  }

  if (cmd === "code-write") {
    const result = await codeWrite({
      spec: args.spec,
      reference: args.reference,
      target: args.target,
    });
    logUsage("code-write", result.usage, result.model);
    if (args.target) {
      const target = resolve(args.target);
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(
        target,
        result.text.endsWith("\n") ? result.text : result.text + "\n",
        "utf8",
      );
      console.error(
        `[haiku-shunt] wrote ${target} (${result.text.split("\n").length} lines)`,
      );
      return;
    }
    process.stdout.write(result.text + "\n");
    return;
  }

  console.error(`Unknown command: ${cmd}`);
  printHelp();
  process.exit(1);
}

main().catch((err) => {
  console.error(`[haiku-shunt] ${err.message}`);
  process.exit(1);
});
