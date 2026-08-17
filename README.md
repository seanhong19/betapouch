# BetaPouch

Track your expenses by photographing receipts. Everything stays on your device,
encrypted with a passphrase only you know. No account, no server, no telemetry.

There is no BetaPouch company holding your spending history, because there is
nowhere for it to be held.

---

## What it does

- **Photograph a receipt** with the device camera, or **drop / paste / pick** an
  image or PDF.
- **Reads receipts on-device.** The web app runs OCR locally with a bundled
  engine — no upload, works offline — and parses merchant, date, total, tax, tip
  and line items with a plain heuristic parser.
- **Ask an AI, optionally, on your terms.** Bring your own API key, point it at a
  local model, or bridge to an agent CLI you already run. Off by default.
- **Type it in.** The manual form is a first-class path, not a fallback.
- **Your currency, not USD.** The base currency is detected from your device
  locale on first run, and the picker is searchable by country name — type
  "Malaysia" rather than knowing it is MYR. Zero-decimal currencies (JPY, KRW,
  VND) and three-decimal ones (KWD, BHD) are handled correctly.
- **See where the money went** — a dashboard with a headline total, period
  comparison, spending over time, and ranked breakdowns by category and merchant.
- **Full history** filtered by date, category, and free text.
- **Export** to CSV or JSON, or take an encrypted backup you can safely keep in
  cloud storage.

## Quick start

```bash
pnpm install
pnpm dev          # web app at http://127.0.0.1:5173
```

Open it, choose a passphrase, and start adding expenses. That is the whole setup.

```bash
pnpm dev:mobile   # Expo dev server for iOS/Android
pnpm bridge       # optional: agent bridge for Claude Code / Codex
pnpm check        # typecheck + tests across the workspace
```

> **Mobile needs a development build**, not Expo Go — it uses a native crypto
> module, because doing the cryptography properly requires one. See
> [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md#mobile-needs-a-development-build).

## Repository layout

```
packages/core      Domain logic shared by both apps — models, vault, receipt
                   parser, AI adapters, analytics. Carries the test suite.
apps/web           Vite + React PWA. Encrypted IndexedDB, on-device OCR.
apps/mobile        Expo app. Encrypted SQLite, camera, biometric unlock.
tools/agent-bridge Loopback sidecar that runs a local agent CLI.
docs/              Architecture, security model, privacy, deployment.
```

Both apps consume `@betapouch/core` as TypeScript source, so the logic that
decides what a receipt says and how money is stored cannot drift between
platforms or slip out from under the tests.

## The privacy design, in short

| | |
|---|---|
| **Where your data lives** | This device only. There is no sync, no backend, no account. |
| **At rest** | AES-256-GCM. Every record is sealed individually; nothing readable is written to disk. |
| **Your key** | Derived from your passphrase with PBKDF2-SHA256 at 600,000 iterations. Held in memory only while unlocked. |
| **Recovery** | None. Nobody holds a copy to reset it with — that is the point, and the app says so before you commit to a passphrase. |
| **Photos** | Re-encoded on import, which strips EXIF — including the GPS tag recording where the photo was taken. |
| **Network** | The app makes no requests of its own. The only outbound traffic is to an AI provider you configure. |
| **AI** | Off until you turn it on. Receipt text is redacted before sending; images only go if you explicitly allow it. |
| **Telemetry** | None. No analytics, no crash reporting, no CDN. |

Read [docs/SECURITY.md](docs/SECURITY.md) for the threat model, including a
plain list of what this design does **not** protect you against.

## Using AI (optional)

Everything above works with no AI at all. If you want it, four routes:

| Route | Data leaves the device? | Needs |
|---|---|---|
| **Ollama** on your machine | No | A local model |
| **Agent bridge** → Claude Code / Codex | No (loopback) | `pnpm bridge` and a CLI you already have |
| **Anthropic** | Yes, to Anthropic | Your API key |
| **OpenAI-compatible** (OpenAI, OpenRouter, LM Studio, vLLM…) | Depends on the endpoint | Your API key |

Keys are stored in the encrypted vault, never in browser storage. Before a
request goes out, receipt text is stripped of card numbers, emails, phone
numbers, IBANs and URLs, and the app tells you what it removed and where it
sent it. The assistant is given an aggregate summary of your spending, never
the raw ledger — and there is a panel showing you the exact text that gets sent.

See [docs/AI-PROVIDERS.md](docs/AI-PROVIDERS.md) for setup.

## Deployment

The web app is static files. Serve `apps/web/dist` over **https** — WebCrypto is
unavailable in an insecure context, so it will not start otherwise. Copy the
security headers from `apps/web/deploy/headers.conf`; three of them cannot be
expressed in a `<meta>` tag. Details in [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

## Status and known gaps

This is a working v0.1 built in one pass. Honest about what is not done:

- **Mobile has no on-device OCR.** The web app does; mobile would need a native
  ML Kit text-recognition module. Today mobile uses photo + quick manual entry,
  or a vision model if you configure one.
- **PDFs are stored, not read.** No PDF text extraction yet.
- **No currency conversion**, deliberately — FX rates mean a network call keyed
  to your spending. Each currency is totalled separately, the dashboard leads
  with your base currency, and the rest are disclosed rather than hidden.
- **Attachments are not in the encrypted backup**, only records. Images stay in
  the device store.
- **No multi-device sync.** Adding it without a server is possible but is a
  design problem in its own right.
- **Not audited.** The cryptography uses standard primitives in a standard
  construction, but no third party has reviewed it.

## Licence

MIT. See [LICENSE](LICENSE).
