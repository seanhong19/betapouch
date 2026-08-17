import { assessPassphrase, MIN_PASSPHRASE_LENGTH } from "@betapouch/core";
import { useMemo, useState, type FormEvent } from "react";
import { useVault } from "../lib/vault";

/**
 * Create-or-unlock. This is also where the app makes its central promise
 * concrete: the passphrase is the only key, and there is no reset link,
 * because there is nobody holding a copy to reset it with.
 */
export function LockScreen() {
  const { status, create, unlock, lockoutRemainingMs, failedAttempts } = useVault();
  const creating = status === "uninitialised";

  const [passphrase, setPassphrase] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const strength = useMemo(() => assessPassphrase(passphrase), [passphrase]);
  const lockedOut = lockoutRemainingMs > 0;

  const canSubmit = creating
    ? strength.ok && passphrase === confirmation && acknowledged && !busy
    : passphrase.length > 0 && !busy && !lockedOut;

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!canSubmit) return;
    setError(null);
    setBusy(true);
    try {
      if (creating) await create(passphrase);
      else await unlock(passphrase);
      setPassphrase("");
      setConfirmation("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex h-full w-full max-w-md flex-col justify-center px-6 py-10">
      <header className="mb-8">
        <h1 className="m-0 text-3xl font-semibold tracking-tight">BetaPouch</h1>
        <p className="mt-2 text-sm" style={{ color: "var(--text-secondary)" }}>
          {creating
            ? "Your expenses are encrypted on this device with a passphrase only you know."
            : "Enter your passphrase to unlock this device's vault."}
        </p>
      </header>

      <form onSubmit={onSubmit} className="card flex flex-col gap-4 p-5">
        <div>
          <label className="label" htmlFor="passphrase">
            Passphrase
          </label>
          <input
            id="passphrase"
            className="field"
            type="password"
            autoComplete={creating ? "new-password" : "current-password"}
            autoFocus
            value={passphrase}
            onChange={(event) => setPassphrase(event.target.value)}
            disabled={busy || lockedOut}
            aria-describedby={creating ? "passphrase-help" : undefined}
          />
          {creating && (
            <div id="passphrase-help" className="mt-2">
              <StrengthMeter score={strength.score} />
              <p className="mt-1.5 text-xs" style={{ color: "var(--text-muted)" }}>
                {strength.problems[0] ??
                  `At least ${MIN_PASSPHRASE_LENGTH} characters. A few unrelated words beats a short complicated one.`}
              </p>
            </div>
          )}
        </div>

        {creating && (
          <>
            <div>
              <label className="label" htmlFor="confirmation">
                Confirm passphrase
              </label>
              <input
                id="confirmation"
                className="field"
                type="password"
                autoComplete="new-password"
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
                disabled={busy}
              />
              {confirmation.length > 0 && confirmation !== passphrase && (
                <p className="mt-1.5 text-xs" style={{ color: "var(--status-critical)" }}>
                  The two entries do not match.
                </p>
              )}
            </div>

            <label
              className="flex cursor-pointer items-start gap-2.5 rounded-lg p-3 text-xs"
              style={{ background: "var(--plane)", color: "var(--text-secondary)" }}
            >
              <input
                type="checkbox"
                checked={acknowledged}
                onChange={(event) => setAcknowledged(event.target.checked)}
                className="mt-0.5"
              />
              <span>
                I understand that <strong>this passphrase cannot be recovered</strong>. It never
                leaves this device, so if I forget it, the data is unreadable — including to the
                people who wrote this app.
              </span>
            </label>
          </>
        )}

        {error && (
          <p
            role="alert"
            className="rounded-lg px-3 py-2 text-sm"
            style={{ background: "var(--plane)", color: "var(--status-critical)" }}
          >
            {error}
          </p>
        )}

        {lockedOut && (
          <p role="status" className="text-sm" style={{ color: "var(--status-serious)" }}>
            Too many attempts. Try again in {Math.ceil(lockoutRemainingMs / 1000)}s.
          </p>
        )}
        {!lockedOut && failedAttempts > 0 && !creating && (
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>
            {failedAttempts} failed {failedAttempts === 1 ? "attempt" : "attempts"}.
          </p>
        )}

        <button type="submit" className="btn btn-primary" disabled={!canSubmit}>
          {busy ? "Working…" : creating ? "Create my vault" : "Unlock"}
        </button>

        {creating && (
          <p className="m-0 text-xs" style={{ color: "var(--text-muted)" }}>
            Deriving your key takes a second or two on purpose — the same delay is what makes
            guessing your passphrase expensive for anyone else.
          </p>
        )}
      </form>

      <ul
        className="mt-6 flex list-none flex-col gap-1.5 p-0 text-xs"
        style={{ color: "var(--text-muted)" }}
      >
        <li>No account, no sign-up, no server.</li>
        <li>Receipts are read on this device; OCR works offline.</li>
        <li>AI features are off until you add your own key or local model.</li>
      </ul>
    </div>
  );
}

function StrengthMeter({ score }: { score: number }) {
  // The fill carries severity; the unfilled track is a lighter step of the
  // same ramp so the whole bar reads as one scale.
  const colors = [
    "var(--status-critical)",
    "var(--status-critical)",
    "var(--status-serious)",
    "var(--status-warning)",
    "var(--status-good)",
  ];
  const labels = ["Too weak", "Weak", "Fair", "Good", "Strong"];
  return (
    <div className="flex items-center gap-2">
      <div
        className="h-1.5 flex-1 overflow-hidden rounded-full"
        style={{ background: "var(--gridline)" }}
      >
        <div
          className="h-full rounded-full transition-all"
          style={{
            width: `${((score + 1) / 5) * 100}%`,
            background: colors[score] ?? colors[0],
          }}
        />
      </div>
      <span className="text-xs" style={{ color: "var(--text-secondary)" }}>
        {labels[score]}
      </span>
    </div>
  );
}
