import { readFileSync, existsSync, statSync } from "node:fs";
import { resolve } from "node:path";

export const DEFAULT_MODEL = "claude-haiku-4-5";
export const DEFAULT_MIN_LINES = 350;
export const DEFAULT_TIMEOUT_MS = 120_000;
export const DEFAULT_MAX_TOKENS_READ = 4096;
export const DEFAULT_MAX_TOKENS_WRITE = 8192;

export const BULK_READER_SYSTEM = `You are a precise code analyst. Read the provided files and answer the question concisely. Output structured bullets only. No greetings, no prose, no preambles, no closing summaries. Lead every bullet with the exact name, type, or line number. Use nested bullets for details. Skip anything the caller did not ask for.`;

export const CODE_WRITER_SYSTEM = `You generate code files based on a spec and reference files. Match the existing patterns, conventions, naming, and style exactly. Output only the code — no explanations, no markdown fences unless the target format itself requires them. If the spec is ambiguous, make reasonable choices that match the patterns in the reference code.`;

export function getConfig() {
  const minLines = Number.parseInt(process.env.HAIKU_SHUNT_MIN_LINES || "", 10);
  const timeoutMs = Number.parseInt(
    process.env.HAIKU_SHUNT_TIMEOUT_MS || "",
    10,
  );
  return {
    apiKey: process.env.ANTHROPIC_API_KEY || "",
    model: process.env.HAIKU_SHUNT_MODEL || DEFAULT_MODEL,
    minLines:
      Number.isFinite(minLines) && minLines > 0 ? minLines : DEFAULT_MIN_LINES,
    timeoutMs:
      Number.isFinite(timeoutMs) && timeoutMs > 0
        ? timeoutMs
        : DEFAULT_TIMEOUT_MS,
    apiUrl:
      process.env.ANTHROPIC_API_URL || "https://api.anthropic.com/v1/messages",
  };
}

export function countLines(filePath) {
  const text = readFileSync(filePath, "utf8");
  if (text.length === 0) return 0;
  // Match wc -l behavior: count newline characters
  const matches = text.match(/\n/g);
  return matches ? matches.length : text.length > 0 ? 1 : 0;
}

export function wrapFiles(paths) {
  const parts = [];
  for (const raw of paths) {
    const filePath = resolve(raw);
    if (!existsSync(filePath) || !statSync(filePath).isFile()) {
      throw new Error(`File not found: ${raw}`);
    }
    const content = readFileSync(filePath, "utf8");
    parts.push(`<file path="${filePath}">\n${content}\n</file>`);
  }
  return parts.join("\n\n");
}

export function stripMarkdownFences(text) {
  const trimmed = text.trim();
  const match = trimmed.match(/^```(?:[\w.+-]+)?\n([\s\S]*?)\n```$/);
  if (match) return match[1];
  return trimmed;
}

/**
 * Call Anthropic Messages API. Returns { text, usage }.
 */
export async function callHaiku({
  system,
  user,
  maxTokens = DEFAULT_MAX_TOKENS_READ,
}) {
  const { apiKey, model, timeoutMs, apiUrl } = getConfig();
  if (!apiKey) {
    throw new Error(
      "ANTHROPIC_API_KEY is not set. Export your Anthropic API key and retry.",
    );
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        temperature: 0.2,
        system,
        messages: [{ role: "user", content: user }],
      }),
      signal: controller.signal,
    });

    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg =
        body?.error?.message || JSON.stringify(body) || res.statusText;
      throw new Error(`Anthropic API ${res.status}: ${msg}`);
    }

    const text = (body.content || [])
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();

    return {
      text,
      usage: body.usage || {},
      model: body.model || model,
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function bulkRead({ question, paths }) {
  if (!question) throw new Error("--question is required");
  if (!paths?.length) throw new Error("--paths requires at least one file");

  const corpus = wrapFiles(paths);
  const user = `${corpus}\n\n<question>\n${question}\n</question>`;
  return callHaiku({
    system: BULK_READER_SYSTEM,
    user,
    maxTokens: DEFAULT_MAX_TOKENS_READ,
  });
}

export async function codeWrite({ spec, reference, target }) {
  if (!spec) throw new Error("--spec is required");
  if (!reference) throw new Error("--reference is required");

  const corpus = wrapFiles([reference]);
  const user = `${corpus}\n\n<spec>\n${spec}\n</spec>${
    target ? `\n\nWrite code suitable for target path: ${resolve(target)}` : ""
  }`;

  const result = await callHaiku({
    system: CODE_WRITER_SYSTEM,
    user,
    maxTokens: DEFAULT_MAX_TOKENS_WRITE,
  });

  result.text = stripMarkdownFences(result.text);
  return result;
}
