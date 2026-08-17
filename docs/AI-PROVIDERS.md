# Connecting an AI provider

**None of this is required.** Receipt scanning, the parser, the dashboard, the
history and export all work with no provider configured and no network. Add one
only if you want a model to read trickier receipts or answer questions about
your spending.

Settings → **AI (optional)** → *Add a provider*.

---

## Choosing a route

| Route | Data leaves your device? | Cost | Reads images? |
|---|---|---|---|
| **Ollama** (local) | **No** | Free, your hardware | Yes, with a vision model |
| **Agent bridge** → Claude Code / Codex | **No** (loopback) | Your existing subscription | No — text only |
| **Anthropic** | Yes | Your API key | Yes |
| **OpenAI-compatible** | Depends on endpoint | Your API key | Usually |

If privacy is the reason you are using this app, prefer the first two.

---

## Ollama (nothing leaves the device)

```bash
ollama pull llama3.2-vision
ollama serve
```

| Field | Value |
|---|---|
| Provider | Ollama |
| Endpoint | `http://localhost:11434` |
| Model | `llama3.2-vision` |
| API key | not needed |

The app allows plaintext HTTP here because the destination is loopback — the
request never leaves the machine. The same URL pointing at a remote host is
refused.

If Ollama runs on another machine on your network, put it behind https and use
the OpenAI-compatible adapter against `/v1`; the app will not send your receipts
over plaintext to a remote host.

---

## Agent bridge (use a CLI you already have)

If you already run Claude Code or Codex, you do not need an API key at all.

```bash
pnpm bridge
```

It prints a token. Copy it into Settings.

| Field | Value |
|---|---|
| Provider | Agent bridge |
| Endpoint | `http://127.0.0.1:4747` |
| Model | `claude` (or `codex`, `ollama`) |
| Bridge token | the printed token |

To keep the token stable across restarts:

```bash
BETAPOUCH_BRIDGE_TOKEN="$(openssl rand -base64 32)" pnpm bridge
```

Options: `--port`, `--agent`, `--timeout` (seconds), `--allow-origin`.

**The bridge is text-only by design.** Handing a local CLI an image would mean
writing your receipt to disk outside the vault, so it works from OCR text. That
means it pairs with the web app, which does OCR locally; on mobile use a vision
provider or type the amount.

### What the bridge will and will not do

It can run local commands, so it is deliberately narrow:

- binds `127.0.0.1` only
- requires the bearer token, compared in constant time
- agents come from a **fixed allowlist in the source**; a request picks one by
  name and can never supply a command or a flag
- `spawn()` with an argv array and `shell: false` — nothing in a prompt is ever
  parsed by a shell
- prompts go in over stdin, so they never appear in `ps` output
- the child gets `PATH` and `HOME` and nothing else — it does not inherit the
  API keys in your shell
- capped bodies and outputs, hard timeouts, and prompts are never logged

To drive a different agent, add an entry to `AGENTS` in
`tools/agent-bridge/server.mjs`. That it is a code change rather than a request
field is the security property, not an inconvenience.

---

## Anthropic

| Field | Value |
|---|---|
| Provider | Anthropic |
| Endpoint | `https://api.anthropic.com` |
| Model | `claude-sonnet-5` |
| API key | your key from console.anthropic.com |

The request goes straight from your browser to Anthropic using the
`anthropic-dangerous-direct-browser-access` header. That header exists because
browser-origin calls expose the key to the page — which is the trade this app is
built around: the key stays on your device instead of living on a relay server
you would have to trust. Use a key scoped to this purpose and rotate it if you
share the device.

---

## OpenAI-compatible

Works with OpenAI, OpenRouter, Groq, Together, LM Studio, llama.cpp's server and
vLLM — they all speak the same chat-completions shape.

| Field | Value |
|---|---|
| Endpoint | `https://api.openai.com/v1` (or your own) |
| Model | e.g. `gpt-4o-mini` |
| API key | provider's key, or blank for a local server |

---

## The two switches that matter

**Redact personal details before sending** (on by default). Strips card numbers
(Luhn-checked, so order numbers are not mangled), emails, phone numbers, IBANs,
URLs and long digit runs from receipt text. After each request the app tells you
what it removed and which host it went to.

**Allow sending the receipt image** (off by default). Needed for a vision model
to read a photo. Understand what it means: **an image cannot be redacted.** The
photo goes exactly as taken — every line on the receipt, and anything else in
frame.

## What the assistant is told

The chat assistant is given an **aggregate summary** — totals by category, top
merchants, monthly totals, and the last handful of records — never your full
ledger. The "Exactly what gets sent" panel at the bottom of the Ask screen shows
you the literal text. Conversations are held in memory only and are gone when
you lock or close the app.

## How a model's answer is handled

Receipt text is attacker-controllable in the general case — anyone can hand you a
printed "receipt" that says *ignore previous instructions*. It is fenced and
labelled as data in the prompt, but the control that actually matters is on the
way back: the reply is parsed as JSON, validated against a strict schema, and
never executed. An invented category is rejected. A hallucinated far-future date
is dropped. Chat replies are rendered as plain text, never as markup.
