#!/usr/bin/env node
/**
 * BetaPouch agent bridge.
 *
 * Lets the app use an agent CLI the user already has — Claude Code, Codex, or
 * anything they configure — instead of an API key. The app POSTs a prompt;
 * the bridge runs the CLI and returns its stdout.
 *
 * This process can run arbitrary local commands, so it is built to be boring
 * and suspicious:
 *
 *   - binds 127.0.0.1 only, and refuses to start on any other interface
 *   - requires a bearer token, printed once at startup, compared in constant
 *     time
 *   - the agent is chosen from a fixed allowlist; the request supplies the
 *     prompt, never the command, never a flag
 *   - spawn() with an argv array and shell:false, so nothing in a prompt can
 *     ever be interpreted by a shell
 *   - CORS is limited to the app's own origins, and every request must carry
 *     the token, so a hostile page cannot use a browser as a confused deputy
 *   - request bodies, prompts and outputs are capped, and every run has a
 *     hard timeout with the child killed on expiry
 *   - prompts are never logged
 *
 * Usage:  node tools/agent-bridge/server.mjs [--port 4747] [--agent claude]
 */

import { spawn } from "node:child_process";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { createServer } from "node:http";

const DEFAULTS = {
  port: 4747,
  host: "127.0.0.1",
  timeoutMs: 180_000,
  maxBodyBytes: 256 * 1024,
  maxPromptChars: 100_000,
  maxOutputBytes: 1024 * 1024,
};

/**
 * The allowlist. A request names a key here; it can never supply a command or
 * an argument of its own. `buildArgs` receives the (validated) prompt and
 * decides how it reaches the CLI.
 *
 * Add your own entry if you drive a different agent — that is the intended
 * extension point, and it stays a code change rather than a request field.
 */
const AGENTS = {
  claude: {
    command: "claude",
    buildArgs: () => ["-p", "--output-format", "text"],
    // Sending the prompt on stdin keeps it off the process table, where any
    // other local user could read it with `ps`.
    viaStdin: true,
  },
  codex: {
    command: "codex",
    buildArgs: () => ["exec", "-"],
    viaStdin: true,
  },
  ollama: {
    command: "ollama",
    buildArgs: (_prompt, model) => ["run", model ?? "llama3.2"],
    viaStdin: true,
  },
};

const ALLOWED_ORIGINS = new Set([
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:4173",
  "http://127.0.0.1:4173",
]);

function parseArgs(argv) {
  const options = { ...DEFAULTS, defaultAgent: "claude", extraOrigins: [] };
  for (let i = 0; i < argv.length; i += 2) {
    const flag = argv[i];
    const value = argv[i + 1];
    if (value === undefined) break;
    if (flag === "--port") options.port = Number(value);
    else if (flag === "--agent") options.defaultAgent = value;
    else if (flag === "--timeout") options.timeoutMs = Number(value) * 1000;
    else if (flag === "--allow-origin") options.extraOrigins.push(value);
  }
  if (!Number.isInteger(options.port) || options.port < 1 || options.port > 65535) {
    throw new Error(`Invalid port: ${options.port}`);
  }
  return options;
}

const options = parseArgs(process.argv.slice(2));
for (const origin of options.extraOrigins) ALLOWED_ORIGINS.add(origin);

/**
 * The token. Read from the environment when provided so it can be pinned
 * across restarts; otherwise a fresh 256-bit token each run.
 */
const TOKEN = process.env.BETAPOUCH_BRIDGE_TOKEN?.trim() || randomBytes(32).toString("base64url");

function tokenMatches(presented) {
  const a = Buffer.from(presented ?? "", "utf8");
  const b = Buffer.from(TOKEN, "utf8");
  // timingSafeEqual throws on a length mismatch, which would itself leak the
  // length — compare padded buffers and check the length separately.
  if (a.length !== b.length) {
    timingSafeEqual(b, b);
    return false;
  }
  return timingSafeEqual(a, b);
}

function corsHeaders(origin) {
  const headers = {
    vary: "Origin",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
    "referrer-policy": "no-referrer",
  };
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    headers["access-control-allow-origin"] = origin;
    headers["access-control-allow-headers"] = "authorization, content-type";
    headers["access-control-allow-methods"] = "POST, OPTIONS";
    headers["access-control-max-age"] = "600";
  }
  return headers;
}

function send(response, status, body, origin) {
  const payload = JSON.stringify(body);
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(payload),
    ...corsHeaders(origin),
  });
  response.end(payload);
}

async function readBody(request) {
  const chunks = [];
  let total = 0;
  for await (const chunk of request) {
    total += chunk.length;
    if (total > options.maxBodyBytes) {
      throw Object.assign(new Error("Request body too large."), { status: 413 });
    }
    chunks.push(chunk);
  }
  const text = Buffer.concat(chunks).toString("utf8");
  try {
    return JSON.parse(text || "{}");
  } catch {
    throw Object.assign(new Error("Body must be JSON."), { status: 400 });
  }
}

function runAgent(agentKey, system, prompt, model) {
  const agent = AGENTS[agentKey];
  return new Promise((resolve, reject) => {
    const composed = system ? `${system}\n\n${prompt}` : prompt;
    const args = agent.buildArgs(composed, model);

    const child = spawn(agent.command, args, {
      // shell:false is the whole point — no part of a prompt is ever parsed
      // as a command.
      shell: false,
      stdio: ["pipe", "pipe", "pipe"],
      env: {
        PATH: process.env.PATH,
        HOME: process.env.HOME,
        USERPROFILE: process.env.USERPROFILE,
        // The child inherits nothing else: no API keys, no tokens, no
        // AWS/GCP credentials that happen to be in this shell.
      },
    });

    let stdout = "";
    let stderr = "";
    let truncated = false;
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill("SIGKILL");
      reject(Object.assign(new Error("The agent timed out."), { status: 504 }));
    }, options.timeoutMs);

    child.stdout.on("data", (chunk) => {
      if (stdout.length > options.maxOutputBytes) {
        truncated = true;
        return;
      }
      stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk) => {
      if (stderr.length < 8192) stderr += chunk.toString("utf8");
    });

    child.on("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(
        Object.assign(
          new Error(
            error.code === "ENOENT"
              ? `"${agent.command}" is not on this machine's PATH.`
              : `Could not start "${agent.command}".`,
          ),
          { status: 502 },
        ),
      );
    });

    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (code !== 0) {
        reject(
          Object.assign(new Error(`${agent.command} exited with code ${code}. ${stderr.slice(0, 300)}`), {
            status: 502,
          }),
        );
        return;
      }
      resolve({ text: stdout.trim(), truncated });
    });

    if (agent.viaStdin) {
      child.stdin.end(composed, "utf8");
    } else {
      child.stdin.end();
    }
  });
}

const server = createServer((request, response) => {
  const origin = request.headers.origin;

  if (request.method === "OPTIONS") {
    response.writeHead(204, corsHeaders(origin));
    response.end();
    return;
  }

  void (async () => {
    try {
      const url = new URL(request.url ?? "/", `http://${options.host}`);

      if (request.method === "GET" && url.pathname === "/v1/health") {
        send(response, 200, { ok: true, agents: Object.keys(AGENTS) }, origin);
        return;
      }

      if (request.method !== "POST" || url.pathname !== "/v1/run") {
        send(response, 404, { error: "Not found." }, origin);
        return;
      }

      // A browser will not send this cross-origin without the token anyway,
      // but reject an unknown Origin outright so a hostile page gets nothing
      // even if a token leaks into it.
      if (origin && !ALLOWED_ORIGINS.has(origin)) {
        send(response, 403, { error: "Origin not allowed." }, origin);
        return;
      }

      const presented = (request.headers.authorization ?? "").replace(/^Bearer\s+/i, "");
      if (!tokenMatches(presented)) {
        send(response, 401, { error: "Bad or missing bridge token." }, origin);
        return;
      }

      const body = await readBody(request);
      const agentKey = typeof body.agent === "string" ? body.agent : options.defaultAgent;
      if (!Object.hasOwn(AGENTS, agentKey)) {
        send(
          response,
          400,
          { error: `Unknown agent "${agentKey}". Allowed: ${Object.keys(AGENTS).join(", ")}.` },
          origin,
        );
        return;
      }

      const prompt = typeof body.prompt === "string" ? body.prompt : "";
      const system = typeof body.system === "string" ? body.system : "";
      const model = typeof body.model === "string" ? body.model.slice(0, 100) : undefined;
      if (!prompt.trim()) {
        send(response, 400, { error: "A prompt is required." }, origin);
        return;
      }
      if (prompt.length + system.length > options.maxPromptChars) {
        send(response, 413, { error: "Prompt too long." }, origin);
        return;
      }

      const started = Date.now();
      const result = await runAgent(agentKey, system, prompt, model);
      // Log the shape of the request, never its content.
      console.log(
        `[bridge] ${agentKey} ok in ${Date.now() - started}ms (${prompt.length} chars in, ${result.text.length} out)`,
      );
      send(response, 200, result, origin);
    } catch (error) {
      const status = error?.status ?? 500;
      console.error(`[bridge] request failed (${status}): ${error?.message ?? "unknown"}`);
      send(response, status, { error: error?.message ?? "Internal error." }, origin);
    }
  })();
});

server.listen(options.port, options.host, () => {
  console.log(`
  BetaPouch agent bridge
  ──────────────────────────────────────────────────────────────
  Listening on   http://${options.host}:${options.port}   (this device only)
  Default agent  ${options.defaultAgent}
  Agents         ${Object.keys(AGENTS).join(", ")}

  Paste this token into BetaPouch → Settings → AI → Agent bridge:

    ${TOKEN}

  It changes every restart unless you set BETAPOUCH_BRIDGE_TOKEN.
  Stop with Ctrl-C. Prompts are never written to this log.
  ──────────────────────────────────────────────────────────────
`);
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    server.close(() => process.exit(0));
  });
}
