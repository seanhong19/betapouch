import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { assessPassphrase, MIN_PASSPHRASE_LENGTH } from "@betapouch/core";
import { useMemo, useState } from "react";
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
    const [error, setError] = useState(null);
    const [busy, setBusy] = useState(false);
    const strength = useMemo(() => assessPassphrase(passphrase), [passphrase]);
    const lockedOut = lockoutRemainingMs > 0;
    const canSubmit = creating
        ? strength.ok && passphrase === confirmation && acknowledged && !busy
        : passphrase.length > 0 && !busy && !lockedOut;
    async function onSubmit(event) {
        event.preventDefault();
        if (!canSubmit)
            return;
        setError(null);
        setBusy(true);
        try {
            if (creating)
                await create(passphrase);
            else
                await unlock(passphrase);
            setPassphrase("");
            setConfirmation("");
        }
        catch (caught) {
            setError(caught instanceof Error ? caught.message : "Something went wrong.");
        }
        finally {
            setBusy(false);
        }
    }
    return (_jsxs("div", { className: "mx-auto flex h-full w-full max-w-md flex-col justify-center px-6 py-10", children: [_jsxs("header", { className: "mb-8", children: [_jsx("h1", { className: "m-0 text-3xl font-semibold tracking-tight", children: "BetaPouch" }), _jsx("p", { className: "mt-2 text-sm", style: { color: "var(--text-secondary)" }, children: creating
                            ? "Your expenses are encrypted on this device with a passphrase only you know."
                            : "Enter your passphrase to unlock this device's vault." })] }), _jsxs("form", { onSubmit: onSubmit, className: "card flex flex-col gap-4 p-5", children: [_jsxs("div", { children: [_jsx("label", { className: "label", htmlFor: "passphrase", children: "Passphrase" }), _jsx("input", { id: "passphrase", className: "field", type: "password", autoComplete: creating ? "new-password" : "current-password", autoFocus: true, value: passphrase, onChange: (event) => setPassphrase(event.target.value), disabled: busy || lockedOut, "aria-describedby": creating ? "passphrase-help" : undefined }), creating && (_jsxs("div", { id: "passphrase-help", className: "mt-2", children: [_jsx(StrengthMeter, { score: strength.score }), _jsx("p", { className: "mt-1.5 text-xs", style: { color: "var(--text-muted)" }, children: strength.problems[0] ??
                                            `At least ${MIN_PASSPHRASE_LENGTH} characters. A few unrelated words beats a short complicated one.` })] }))] }), creating && (_jsxs(_Fragment, { children: [_jsxs("div", { children: [_jsx("label", { className: "label", htmlFor: "confirmation", children: "Confirm passphrase" }), _jsx("input", { id: "confirmation", className: "field", type: "password", autoComplete: "new-password", value: confirmation, onChange: (event) => setConfirmation(event.target.value), disabled: busy }), confirmation.length > 0 && confirmation !== passphrase && (_jsx("p", { className: "mt-1.5 text-xs", style: { color: "var(--status-critical)" }, children: "The two entries do not match." }))] }), _jsxs("label", { className: "flex cursor-pointer items-start gap-2.5 rounded-lg p-3 text-xs", style: { background: "var(--plane)", color: "var(--text-secondary)" }, children: [_jsx("input", { type: "checkbox", checked: acknowledged, onChange: (event) => setAcknowledged(event.target.checked), className: "mt-0.5" }), _jsxs("span", { children: ["I understand that ", _jsx("strong", { children: "this passphrase cannot be recovered" }), ". It never leaves this device, so if I forget it, the data is unreadable \u2014 including to the people who wrote this app."] })] })] })), error && (_jsx("p", { role: "alert", className: "rounded-lg px-3 py-2 text-sm", style: { background: "var(--plane)", color: "var(--status-critical)" }, children: error })), lockedOut && (_jsxs("p", { role: "status", className: "text-sm", style: { color: "var(--status-serious)" }, children: ["Too many attempts. Try again in ", Math.ceil(lockoutRemainingMs / 1000), "s."] })), !lockedOut && failedAttempts > 0 && !creating && (_jsxs("p", { className: "text-xs", style: { color: "var(--text-muted)" }, children: [failedAttempts, " failed ", failedAttempts === 1 ? "attempt" : "attempts", "."] })), _jsx("button", { type: "submit", className: "btn btn-primary", disabled: !canSubmit, children: busy ? "Working…" : creating ? "Create my vault" : "Unlock" }), creating && (_jsx("p", { className: "m-0 text-xs", style: { color: "var(--text-muted)" }, children: "Deriving your key takes a second or two on purpose \u2014 the same delay is what makes guessing your passphrase expensive for anyone else." }))] }), _jsxs("ul", { className: "mt-6 flex list-none flex-col gap-1.5 p-0 text-xs", style: { color: "var(--text-muted)" }, children: [_jsx("li", { children: "No account, no sign-up, no server." }), _jsx("li", { children: "Receipts are read on this device; OCR works offline." }), _jsx("li", { children: "AI features are off until you add your own key or local model." })] })] }));
}
function StrengthMeter({ score }) {
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
    return (_jsxs("div", { className: "flex items-center gap-2", children: [_jsx("div", { className: "h-1.5 flex-1 overflow-hidden rounded-full", style: { background: "var(--gridline)" }, children: _jsx("div", { className: "h-full rounded-full transition-all", style: {
                        width: `${((score + 1) / 5) * 100}%`,
                        background: colors[score] ?? colors[0],
                    } }) }), _jsx("span", { className: "text-xs", style: { color: "var(--text-secondary)" }, children: labels[score] })] }));
}
