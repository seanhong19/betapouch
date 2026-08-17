# Architecture

## The shape of it

```
                    ┌───────────────────────────┐
                    │      @betapouch/core      │
                    │  models · vault · parser  │
                    │  ai adapters · analytics  │
                    └─────────────┬─────────────┘
                                  │ TypeScript source
                 ┌────────────────┴────────────────┐
                 │                                 │
        ┌────────▼────────┐              ┌─────────▼────────┐
        │   apps/web      │              │  apps/mobile     │
        │  React + Vite   │              │  Expo / RN       │
        │  IndexedDB      │              │  SQLite          │
        │  local OCR      │              │  camera + Keychain│
        └────────┬────────┘              └─────────┬────────┘
                 │                                 │
                 └──────────────┬──────────────────┘
                                │ only if configured
                 ┌──────────────▼──────────────┐
                 │  AI provider (user's own)   │
                 │  Anthropic · OpenAI-compat  │
                 │  Ollama · agent bridge      │
                 └─────────────────────────────┘
```

There is no other box. No server, no queue, no sync service.

## Why a shared core

`@betapouch/core` holds everything that is not a screen: the zod models, the
vault, the receipt parser, the money arithmetic, the AI adapters and the
dashboard aggregations. Both apps import it **as TypeScript source**, not as a
built artefact — Vite aliases it, Metro is pointed at the workspace root.

The reason is drift. "What does this receipt say" and "how is money stored" are
exactly the questions you cannot afford to answer differently on two platforms,
and a compiled package invites a stale copy. Source-level sharing also means the
92 tests in core cover both apps' behaviour rather than only the web one's.

## Money never touches a float

Amounts are integer minor units (cents, pence, sen) everywhere — storage, maths,
transport. `0.1 + 0.2` problems simply cannot arise, because no decimal ever
exists except at the parse and format boundaries. `currencyExponent()` knows
about the zero-decimal currencies (JPY, KRW, VND…) and three-decimal ones (KWD,
BHD…), so JPY 1,250 is 1250 minor units, not 125000.

The parser handles both `1,234.56` and `1.234,56`, and treats a lone comma as a
decimal separator only when the group after it is short enough to be one —
`1,50` is one-fifty, `1,500` is fifteen hundred.

## The receipt pipeline

```
image ──▶ EXIF stripped, downscaled ──▶ on-device OCR ──▶ heuristic parser ──▶ draft
                                                                                 │
                                                          (optional, explicit)   │
                                                       ┌─────────────────────────┘
                                                       ▼
                                             redact ──▶ AI provider ──▶ validate ──▶ draft
                                                                                 │
                                                                                 ▼
                                                                    human confirms ──▶ record
```

The order is the point. The **private path runs first and produces a usable
result**: OCR and the parser are on-device, offline, free, and give you a filled
form before any question of sending data anywhere comes up. AI is a second pass
on a draft you already have — an accelerator, never a dependency.

A human always confirms. Saving the form is what marks a record `reviewed`;
until then it carries an "unchecked" flag and its extraction confidence.

### The parser

Plain heuristics, no model. It scans bottom-up for labelled totals (receipts put
the authoritative total near the end, and a "TOTAL SAVINGS" line earlier must not
win), pulls tax/tip/subtotal by label, reads dates in ISO, named-month and
numeric forms — disambiguating `03/04` when one component exceeds 12 and falling
back to a locale preference otherwise — and rejects impossible or far-future
dates as misreads.

Confidence is the share of wanted signals actually found, with a bonus when
`subtotal + tax + tip` reconciles against the total to within a cent or a
percent. That reconciliation is the single most useful correctness check
available without a model, and it is why a clean grocery receipt scores > 0.8
while a bare list of numbers scores under 0.7.

## Storage

Both platforms store the same thing: rows of sealed blobs.

| | Web | Mobile |
|---|---|---|
| Engine | IndexedDB (Dexie) | SQLite (expo-sqlite) |
| Records | sealed JSON | sealed JSON |
| Images | sealed bytes | sealed bytes |
| Keys/secrets | sealed | sealed |
| Vault header | plaintext (salt + wrapped key) | plaintext |

Nothing readable is written. That forfeits indexed queries, so records are
decrypted into memory on unlock and filtered there. At personal scale this is
imperceptible, and the property it buys — a stolen device yields ciphertext —
is worth far more than an index.

Rows that fail to decrypt are collected and **surfaced** as a warning rather than
silently skipped: a ledger quietly missing records is worse than one that admits
it.

## Mobile needs a development build

React Native has no `crypto.subtle`. The vault needs PBKDF2 and AES-GCM, and both
must be native — a pure-JS PBKDF2 at 600,000 iterations takes the better part of
a minute on a phone, which in practice means somebody lowers the iteration count
and destroys the property it exists for.

So mobile depends on `react-native-quick-crypto`, a native module. That means
`npx expo run:ios` / `run:android`, not Expo Go. It is a real cost and it is the
deliberate choice.

If the module is missing, the app **fails closed**: a startup gate runs an actual
encrypt/decrypt round trip and refuses to mount the UI if it does not pass. There
is no weaker fallback, because an app that silently degrades its encryption is
worse than one that will not start — the user cannot tell the difference.

## AI adapters

One interface, four implementations:

| Adapter | Notes |
|---|---|
| `anthropic` | Messages API, direct from the client with the user's key |
| `openai-compatible` | Covers OpenAI, OpenRouter, Groq, LM Studio, llama.cpp, vLLM |
| `ollama` | Local model; nothing leaves the device |
| `agent-bridge` | Loopback sidecar shelling out to Claude Code / Codex |

All four funnel through one `postJson` with the endpoint policy, timeout and
size cap, so those rules cannot be forgotten per-provider. Redaction is applied
in `prepareTextForProvider`, in one place, for the same reason.

The extraction prompt asks for amounts as **decimal strings, not numbers** — JSON
numbers invite float representation issues on the way back — and the app converts
to minor units itself.

## The dashboard

One hero figure per view, then stat tiles, then the time series, then two ranked
breakdowns, all reading from the same filtered set so the numbers always agree.

Two choices worth naming:

**Ranked breakdowns use one hue, not a colour per row.** There are thirteen
categories; the validated categorical palette holds eight. Colouring by identity
would mean inventing hues that fail colour-blind separation. The row label
carries identity and the bar carries only magnitude — which is what a one-hue
sequential encoding is for. Anything past the cap folds into an honest "Other"
row rather than vanishing from a chart claiming to be a breakdown.

**Empty time buckets are filled with zero.** A gap in a spending chart must read
as "spent nothing", not "no data" — and skipping the bucket makes the x-axis lie
about spacing.

**Currencies are never converted.** Live FX rates would mean a network request
keyed to your spending dates. Totals are grouped per currency, the base currency
leads, and the rest are listed alongside with an explicit note.

Which currency leads is `pickDisplayCurrency`, and it deliberately does *not*
rank by total: minor units from different currencies are not comparable
quantities, so "largest total" once made 3,960 EUR-cents beat 2,919 USD-cents.
It prefers the user's base currency, falling back to the one used most *often* —
a count being the only figure that means the same thing in every currency.

**Currency selection.** `COUNTRY_CURRENCY` maps ISO 3166 → ISO 4217; everything
else (localised currency names, symbols, country names) comes from `Intl` at
runtime, so the picker speaks the user's language without a shipped translation
table. Every lookup degrades to an English table and then to the bare code,
because `Intl.DisplayNames` is missing on some Hermes builds and a picker that
throws is worse than one that says "SGD". On first run the base currency is
inferred from the device locale — defaulting the whole world to USD makes the
app feel foreign to most of its users.

## Testing

92 tests in `packages/core`, 9 in `apps/web`. They concentrate on the places
where being wrong is expensive:

- money parsing round-trips, including zero-decimal currencies and the classic
  float trap
- vault round-trips, wrong-passphrase rejection, **tamper rejection**, and
  refusal to open a ciphertext moved to a different record id
- passphrase change preserving records while invalidating the old passphrase
- the receipt parser against realistic grocery and restaurant receipts
- redaction keeping prices while removing PII, and not mislabelling a non-Luhn
  number as a card
- endpoint policy: https required, loopback exempt, no credentials in URLs
- CSV formula-injection neutralisation
- schema rejection of invented categories and hallucinated dates

`pnpm check` runs the typecheck and the tests across the workspace.
