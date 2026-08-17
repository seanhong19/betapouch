# Security model

This document says what BetaPouch protects, how, and — the part most security
pages skip — **what it does not protect you against**. A privacy claim you
cannot check is just marketing.

---

## 1. What is being protected

Your expense history is a detailed record of where you were, when, and what you
bought. It is more revealing than most people expect: a year of receipts maps
your commute, your health, your habits and your relationships. That is the asset.

## 2. The core decision: no server

BetaPouch has no backend. There is no account system, no sync service, and no
company database. This removes, in one stroke, the largest categories of risk in
a normal finance app — server breach, insider access, subpoena of a provider,
acquisition changing the privacy policy, and silent analytics.

It also means the security of your data rests almost entirely on **your device
and your passphrase**, which is the trade this app makes explicit rather than
hiding.

## 3. Encryption at rest

### The construction

```
passphrase
   └─ PBKDF2-HMAC-SHA256, 600,000 iterations, 128-bit random salt
        └─ KEK (AES-256)
             └─ wraps a random 256-bit DEK          (AES-GCM, random 96-bit IV)
                  └─ seals every record             (AES-GCM, fresh IV per write,
                                                     AAD = store name + record id)
```

**Why a wrapped key rather than encrypting with the passphrase directly.**
Changing your passphrase re-wraps one small key. Records are never touched, so
there is no window where half the database is under the old key and half under
the new one, and no multi-minute re-encryption that can be interrupted.

**Why AAD.** Each ciphertext is bound to the store and record id it lives at.
Copying an encrypted blob from one row to another makes decryption *fail* rather
than silently succeed — so an attacker with write access to the database cannot
shuffle records to, say, swap a €5 expense for a €5,000 one, or replace a
settings blob with an older one.

**Why no separate passphrase verifier.** GCM's authentication tag already tells
us whether the key was right. A stored verifier would be one more thing to
attack, and would leak a check that could be attempted offline more cheaply.

**Iteration count.** 600,000 is OWASP's 2024 floor for PBKDF2-SHA256. It costs
about a second on unlock — deliberately. That same second is what makes a
brute-force run over a stolen database expensive.

**Argon2id would be better.** PBKDF2 is memory-cheap, so a GPU attacks it far
more efficiently than a phone computes it. PBKDF2 is used because it is the only
KDF available natively in WebCrypto; adding Argon2id via WASM is the single
highest-value improvement to this design and is the top roadmap item.

### What is encrypted

Everything: expense records, receipt images, settings, API keys, and the
merchant→category memory. No column holds a readable merchant name, amount, or
date. Only the vault header is plaintext, and it contains a salt, an iteration
count and a wrapped key — none of which are secret.

The cost is that records cannot be queried by index. They are decrypted into
memory on unlock instead. For a personal ledger this is imperceptible, and it
buys the property that a stolen device yields ciphertext rather than a spending
profile.

## 4. Keys in memory

The DEK is a **non-extractable** `CryptoKey`. It is never serialised, never put
on `window`, and never written to storage. Locking drops the reference.

Auto-lock fires on idle (configurable) and when the app is hidden. On mobile,
hiding also happens the instant the app is backgrounded — which additionally
keeps your amounts out of the OS app-switcher snapshot.

API keys live in the encrypted store and are read out only for the duration of a
request. They are never held in component state, so a devtools dump or a crash
report would not carry them.

## 5. Network

The app makes **no requests of its own**. No CDN, no fonts, no analytics, no
update check. The OCR engine — worker, WASM and language data — is vendored into
the build precisely so that scanning a receipt does not announce itself to a
third party.

The only outbound traffic is to an AI provider you configure. Every such request
passes one policy gate:

- **https, or loopback.** Plaintext HTTP is permitted only to `localhost` /
  `127.0.0.0/8`, for a local Ollama or the agent bridge. Plaintext to a remote
  host is refused with an error, never silently downgraded.
- **No credentials in URLs**, no cookies (`credentials: "omit"`), no referrer.
- **Bounded**: hard timeout, capped response size.
- **Errors are summarised, not echoed.** Provider error bodies sometimes quote
  the request back — key included — so raw bodies are never surfaced or logged.

Before receipt text is sent, redaction strips card numbers (Luhn-checked so
order numbers survive), emails, phone numbers, IBANs, URLs and long digit runs.
The UI then reports what was removed and which host it went to.

**Images cannot be redacted.** A photo of a receipt is a photo of a receipt. So
image upload is a separate, per-provider, off-by-default switch.

## 6. Untrusted input

Three inputs are treated as hostile:

**Receipt text.** Anyone can hand you a printed "receipt" saying *ignore previous
instructions*. It is fenced in the prompt and labelled as data — but the control
that actually matters is that the model's reply is parsed as JSON, validated
against a strict schema, and never executed. An invented category is rejected; a
hallucinated far-future date is dropped.

**Model output.** Rendered as plain text. Never `dangerouslySetInnerHTML`, never
markup.

**Imported files.** Every record is validated individually; invalid ones are
skipped and reported rather than failing the whole import or being trusted.
Imported ids are re-minted, so a crafted file cannot overwrite an existing
record by claiming its id.

## 7. Some specific attacks that were designed against

**CSV formula injection.** A merchant name is attacker-influenced text off a
receipt. A spreadsheet treats a leading `=`, `+`, `-`, `@`, tab or CR as a
formula, so exporting one verbatim turns *"open my expenses in Excel"* into code
execution on your machine. Every exported cell that starts with one of those is
prefixed with an apostrophe.

**EXIF/GPS leakage.** Phone cameras write GPS coordinates into every photo.
Imported images are re-encoded (canvas on web, image-manipulator on mobile),
which drops the whole EXIF block. On mobile the picker is also asked not to
return EXIF in the first place. Android additionally blocks the location
permissions outright in the manifest.

**Shell injection via the agent bridge.** The bridge runs local commands, so:
requests choose an agent from a fixed allowlist and can never supply a command
or a flag; `spawn()` is called with an argv array and `shell: false`; prompts go
in over stdin, keeping them off the process table where another local user could
read them with `ps`; the child's environment is stripped to `PATH` and `HOME`,
so it does not inherit whatever API keys are in your shell.

**Confused-deputy against the bridge.** It binds loopback only, requires a
bearer token compared in constant time, and rejects unknown `Origin` headers —
so a hostile page in your browser cannot use it as a proxy to your machine.

**Unlock guessing.** Attempts back off exponentially after five failures. This is
honestly only a speed bump for someone tapping at an unattended unlocked device
— an attacker with the database attacks it offline, where the KDF is the real
defence.

**XSS.** Strict CSP with no `unsafe-inline` on scripts, no `eval`, `object-src
'none'`, `base-uri 'none'`, `form-action 'none'`. `'wasm-unsafe-eval'` is present
because the OCR engine needs it; it permits WebAssembly instantiation and
nothing more.

## 8. What this does NOT protect you against

Read this part.

- **A compromised device.** Malware, a keylogger, or a hostile browser extension
  with access to the page defeats all of this. Client-side encryption protects
  data at rest; it cannot protect a machine that is already owned.
- **A forgotten passphrase.** There is no recovery, no reset, no backdoor. The
  data is gone. This is stated before you create a vault, and it is not a bug.
- **A weak passphrase.** 600,000 PBKDF2 iterations buy time proportional to how
  unguessable the passphrase is. `Password123!` is cracked regardless. Use a
  passphrase of several unrelated words.
- **Someone watching you use it.** Shoulder-surfing, screen recording, a
  screenshot in a shared album.
- **What you choose to send to a provider.** Once receipt text reaches Anthropic
  or OpenAI, their policies govern it. Redaction reduces exposure; it does not
  eliminate it. If this matters to you, use Ollama or the agent bridge.
- **Exported files.** A CSV or JSON export is plaintext by design — it is meant
  to be opened elsewhere. Only the *backup* format is encrypted.
- **Traffic analysis.** A network observer sees *that* you contacted an AI
  provider and roughly how much data you sent.
- **Physical device forensics while unlocked.** If the vault is open, the
  plaintext is in memory. Auto-lock narrows this window; it does not close it.
- **A malicious build.** You are trusting whoever compiled and served the app.
  Build it yourself if that matters — it is a static bundle.
- **Rubber-hose attacks.** No technical measure helps here. There is no hidden
  volume or duress passphrase.

## 9. Deliberate non-features

- **No cloud sync.** Sync without a trusted server is a hard problem; a
  half-solved one would undermine the whole premise.
- **No password reset.** Would require an escrowed key.
- **No crash reporting.** Stack traces carry data.
- **No currency conversion.** Live FX rates mean a network request keyed to your
  spending dates. Currencies are grouped separately instead.
- **No "remember me".** The passphrase is asked for each session, except behind
  the platform keystore + biometrics on mobile.

## 10. Reporting a problem

Open an issue for non-sensitive matters. For a vulnerability, please report it
privately first and give a reasonable window before disclosure.

## 11. Roadmap, in priority order

1. **Argon2id** (WASM) replacing PBKDF2, with the vault header already carrying
   a KDF descriptor so existing vaults can migrate in place.
2. **On-device OCR for mobile** via a native text-recognition module.
3. **Encrypted attachments in backups.**
4. **Reproducible builds** with published hashes, so a served bundle can be
   checked against the source.
5. **A third-party review** of the vault implementation.
