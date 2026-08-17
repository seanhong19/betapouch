import { jsx as _jsx } from "react/jsx-runtime";
import { changePassphrase, createVault, defaultSettings, unlockVault, WrongPassphraseError, } from "@betapouch/core";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, } from "react";
import { loadSettings, loadVaultHeader, requestPersistentStorage, saveSettings, saveVaultHeader, } from "./db";
const VaultContext = createContext(null);
/**
 * Rate limiting on unlock. It cannot stop an attacker with a copy of the
 * database — they would attack the ciphertext offline, which is what the
 * 600k-iteration KDF is for — but it does stop someone tapping guesses into
 * an unattended, already-installed app.
 */
const LOCKOUT_AFTER = 5;
const LOCKOUT_STEP_MS = 15_000;
const MAX_LOCKOUT_MS = 5 * 60_000;
function lockoutFor(attempts) {
    if (attempts < LOCKOUT_AFTER)
        return 0;
    return Math.min(MAX_LOCKOUT_MS, LOCKOUT_STEP_MS * 2 ** (attempts - LOCKOUT_AFTER));
}
export function VaultProvider({ children }) {
    const [status, setStatus] = useState("loading");
    const [vault, setVault] = useState(null);
    const [settings, setSettings] = useState(defaultSettings);
    const [failedAttempts, setFailedAttempts] = useState(0);
    const [lockedUntil, setLockedUntil] = useState(0);
    const [now, setNow] = useState(() => Date.now());
    useEffect(() => {
        let cancelled = false;
        void loadVaultHeader().then((header) => {
            if (!cancelled)
                setStatus(header ? "locked" : "uninitialised");
        });
        return () => {
            cancelled = true;
        };
    }, []);
    // Drives the visible countdown while a lockout is in effect.
    useEffect(() => {
        if (lockedUntil <= Date.now())
            return;
        const id = setInterval(() => setNow(Date.now()), 500);
        return () => clearInterval(id);
    }, [lockedUntil]);
    const lock = useCallback(() => {
        setVault(null);
        setStatus((current) => (current === "unlocked" ? "locked" : current));
    }, []);
    const afterUnlock = useCallback(async (opened) => {
        const stored = await loadSettings(opened);
        const effective = stored ?? defaultSettings();
        if (!stored)
            await saveSettings(opened, effective);
        setSettings(effective);
        setVault(opened);
        setStatus("unlocked");
        setFailedAttempts(0);
        setLockedUntil(0);
        // Best-effort: keeps the browser from evicting the only copy of the data.
        void requestPersistentStorage();
    }, []);
    const create = useCallback(async (passphrase) => {
        const created = await createVault(passphrase);
        await saveVaultHeader(created.header);
        await afterUnlock(created);
    }, [afterUnlock]);
    const unlock = useCallback(async (passphrase) => {
        if (Date.now() < lockedUntil) {
            throw new Error("Too many attempts. Wait for the timer before trying again.");
        }
        const header = await loadVaultHeader();
        if (!header)
            throw new Error("No vault on this device yet.");
        try {
            const opened = await unlockVault(header, passphrase);
            await afterUnlock(opened);
        }
        catch (error) {
            if (error instanceof WrongPassphraseError) {
                const attempts = failedAttempts + 1;
                setFailedAttempts(attempts);
                const wait = lockoutFor(attempts);
                if (wait > 0)
                    setLockedUntil(Date.now() + wait);
            }
            throw error;
        }
    }, [afterUnlock, failedAttempts, lockedUntil]);
    const updateSettings = useCallback(async (next) => {
        if (!vault)
            throw new Error("The vault is locked.");
        const merged = { ...settings, ...next };
        await saveSettings(vault, merged);
        setSettings(merged);
    }, [settings, vault]);
    const changeVaultPassphrase = useCallback(async (current, next) => {
        if (!vault)
            throw new Error("The vault is locked.");
        const header = await changePassphrase(vault, current, next);
        await saveVaultHeader(header);
        setVault({ ...vault, header });
    }, [vault]);
    /* ------------------------------------------------------------ auto-lock */
    const lastActivity = useRef(Date.now());
    useEffect(() => {
        if (status !== "unlocked")
            return;
        const mark = () => {
            lastActivity.current = Date.now();
        };
        const events = ["pointerdown", "keydown", "wheel", "touchstart", "focus"];
        for (const event of events)
            window.addEventListener(event, mark, { passive: true });
        return () => {
            for (const event of events)
                window.removeEventListener(event, mark);
        };
    }, [status]);
    useEffect(() => {
        if (status !== "unlocked" || settings.autoLockMinutes <= 0)
            return;
        const timeoutMs = settings.autoLockMinutes * 60_000;
        const id = setInterval(() => {
            if (Date.now() - lastActivity.current >= timeoutMs)
                lock();
        }, 5_000);
        return () => clearInterval(id);
    }, [lock, settings.autoLockMinutes, status]);
    useEffect(() => {
        if (status !== "unlocked" || !settings.lockOnHide)
            return;
        const onVisibility = () => {
            // Backgrounding the tab is the moment the device is most likely to be
            // handed to someone else or left on a desk.
            if (document.visibilityState === "hidden")
                lock();
        };
        document.addEventListener("visibilitychange", onVisibility);
        return () => document.removeEventListener("visibilitychange", onVisibility);
    }, [lock, settings.lockOnHide, status]);
    const value = useMemo(() => ({
        status,
        vault,
        settings,
        failedAttempts,
        lockoutRemainingMs: Math.max(0, lockedUntil - now),
        create,
        unlock,
        lock,
        updateSettings,
        changeVaultPassphrase,
    }), [
        changeVaultPassphrase,
        create,
        failedAttempts,
        lock,
        lockedUntil,
        now,
        settings,
        status,
        unlock,
        updateSettings,
        vault,
    ]);
    return _jsx(VaultContext.Provider, { value: value, children: children });
}
export function useVault() {
    const context = useContext(VaultContext);
    if (!context)
        throw new Error("useVault must be used inside a VaultProvider.");
    return context;
}
/** Narrowed hook for screens that only render when unlocked. */
export function useUnlockedVault() {
    const { vault } = useVault();
    if (!vault)
        throw new Error("The vault is locked.");
    return vault;
}
