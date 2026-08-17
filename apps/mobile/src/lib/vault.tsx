import {
  changePassphrase,
  createVault,
  defaultSettings,
  unlockVault,
  WrongPassphraseError,
  type Settings,
  type UnlockedVault,
} from "@betapouch/core";
import * as LocalAuthentication from "expo-local-authentication";
import * as SecureStore from "expo-secure-store";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { AppState, type AppStateStatus } from "react-native";
import { getCrypto } from "./crypto";
import { loadSettings, loadVaultHeader, saveSettings, saveVaultHeader } from "./db";

/**
 * Vault lifecycle on device.
 *
 * The passphrase remains the root of trust. Biometric unlock is a convenience
 * layer on top: with it enabled, the passphrase is held in the platform
 * keystore (Keychain / Android Keystore) behind a biometric prompt, marked
 * device-only so it never rides along in an iCloud or Google backup. Turning
 * it off deletes that copy. The passphrase itself is never stored anywhere
 * else, and there is no recovery path — by design.
 */

const BIOMETRIC_KEY = "betapouch.vault.passphrase";

export type VaultStatus = "loading" | "uninitialised" | "locked" | "unlocked";

interface VaultContextValue {
  status: VaultStatus;
  vault: UnlockedVault | null;
  settings: Settings;
  biometricAvailable: boolean;
  biometricEnabled: boolean;
  create(passphrase: string): Promise<void>;
  unlock(passphrase: string): Promise<void>;
  unlockWithBiometrics(): Promise<void>;
  setBiometricUnlock(enabled: boolean, passphrase?: string): Promise<void>;
  lock(): void;
  updateSettings(next: Partial<Settings>): Promise<void>;
  changeVaultPassphrase(current: string, next: string): Promise<void>;
}

const VaultContext = createContext<VaultContextValue | null>(null);

export function VaultProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<VaultStatus>("loading");
  const [vault, setVault] = useState<UnlockedVault | null>(null);
  const [settings, setSettings] = useState<Settings>(defaultSettings);
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [biometricEnabled, setBiometricEnabled] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [header, hasHardware, enrolled, stored] = await Promise.all([
        loadVaultHeader(),
        LocalAuthentication.hasHardwareAsync(),
        LocalAuthentication.isEnrolledAsync(),
        SecureStore.getItemAsync(BIOMETRIC_KEY).catch(() => null),
      ]);
      if (cancelled) return;
      setBiometricAvailable(hasHardware && enrolled);
      setBiometricEnabled(stored !== null);
      setStatus(header ? "locked" : "uninitialised");
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const lock = useCallback(() => {
    setVault(null);
    setStatus((current) => (current === "unlocked" ? "locked" : current));
  }, []);

  const afterUnlock = useCallback(async (opened: UnlockedVault) => {
    const stored = await loadSettings(opened);
    const effective = stored ?? defaultSettings();
    if (!stored) await saveSettings(opened, effective);
    setSettings(effective);
    setVault(opened);
    setStatus("unlocked");
  }, []);

  const create = useCallback(
    async (passphrase: string) => {
      const created = await createVault(passphrase, { crypto: getCrypto() });
      await saveVaultHeader(created.header);
      await afterUnlock(created);
    },
    [afterUnlock],
  );

  const unlock = useCallback(
    async (passphrase: string) => {
      const header = await loadVaultHeader();
      if (!header) throw new Error("No vault on this device yet.");
      const opened = await unlockVault(header, passphrase, { crypto: getCrypto() });
      await afterUnlock(opened);
    },
    [afterUnlock],
  );

  const unlockWithBiometrics = useCallback(async () => {
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: "Unlock BetaPouch",
      // No passcode fallback: the passphrase field is right there, and a
      // device PIN is not equivalent to the vault passphrase.
      disableDeviceFallback: true,
      cancelLabel: "Use passphrase",
    });
    if (!result.success) throw new Error("Biometric unlock was cancelled.");

    const passphrase = await SecureStore.getItemAsync(BIOMETRIC_KEY, {
      requireAuthentication: true,
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    });
    if (!passphrase) throw new Error("No saved passphrase — enter it once to re-enable this.");
    await unlock(passphrase);
  }, [unlock]);

  const setBiometricUnlock = useCallback(
    async (enabled: boolean, passphrase?: string) => {
      if (!enabled) {
        await SecureStore.deleteItemAsync(BIOMETRIC_KEY);
        setBiometricEnabled(false);
        return;
      }
      if (!passphrase) throw new Error("Enter your passphrase to enable biometric unlock.");
      // Verify before storing: never persist a passphrase that does not open
      // the vault, or unlock silently breaks later with no way to diagnose it.
      const header = await loadVaultHeader();
      if (!header) throw new Error("No vault to protect yet.");
      await unlockVault(header, passphrase, { crypto: getCrypto() });

      await SecureStore.setItemAsync(BIOMETRIC_KEY, passphrase, {
        requireAuthentication: true,
        keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
      });
      setBiometricEnabled(true);
    },
    [],
  );

  const updateSettings = useCallback(
    async (next: Partial<Settings>) => {
      if (!vault) throw new Error("The vault is locked.");
      const merged = { ...settings, ...next };
      await saveSettings(vault, merged);
      setSettings(merged);
    },
    [settings, vault],
  );

  const changeVaultPassphrase = useCallback(
    async (current: string, next: string) => {
      if (!vault) throw new Error("The vault is locked.");
      const header = await changePassphrase(vault, current, next);
      await saveVaultHeader(header);
      setVault({ ...vault, header });
      // A stored copy of the old passphrase would keep opening nothing.
      if (biometricEnabled) {
        await SecureStore.setItemAsync(BIOMETRIC_KEY, next, {
          requireAuthentication: true,
          keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
        });
      }
    },
    [biometricEnabled, vault],
  );

  /* ------------------------------------------------------------ auto-lock */

  const backgroundedAt = useRef<number | null>(null);
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (next: AppStateStatus) => {
      if (next === "background" || next === "inactive") {
        backgroundedAt.current = Date.now();
        // The app switcher screenshots the screen on background; locking
        // immediately keeps amounts out of that snapshot.
        if (settings.lockOnHide) lock();
        return;
      }
      if (next === "active" && backgroundedAt.current !== null) {
        const away = Date.now() - backgroundedAt.current;
        backgroundedAt.current = null;
        if (settings.autoLockMinutes > 0 && away >= settings.autoLockMinutes * 60_000) lock();
      }
    });
    return () => subscription.remove();
  }, [lock, settings.autoLockMinutes, settings.lockOnHide]);

  const value = useMemo<VaultContextValue>(
    () => ({
      status,
      vault,
      settings,
      biometricAvailable,
      biometricEnabled,
      create,
      unlock,
      unlockWithBiometrics,
      setBiometricUnlock,
      lock,
      updateSettings,
      changeVaultPassphrase,
    }),
    [
      biometricAvailable,
      biometricEnabled,
      changeVaultPassphrase,
      create,
      lock,
      setBiometricUnlock,
      settings,
      status,
      unlock,
      unlockWithBiometrics,
      updateSettings,
      vault,
    ],
  );

  return <VaultContext.Provider value={value}>{children}</VaultContext.Provider>;
}

export function useVault(): VaultContextValue {
  const context = useContext(VaultContext);
  if (!context) throw new Error("useVault must be used inside a VaultProvider.");
  return context;
}

export { WrongPassphraseError };
