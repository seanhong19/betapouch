import { assessPassphrase, MIN_PASSPHRASE_LENGTH } from "@betapouch/core";
import { useEffect, useMemo, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from "react-native";
import { Button, Card, Field, Heading, Muted, Notice } from "../components/ui";
import { useVault } from "../lib/vault";
import { useTheme } from "../theme";

export function LockScreen() {
  const theme = useTheme();
  const {
    status,
    create,
    unlock,
    unlockWithBiometrics,
    biometricAvailable,
    biometricEnabled,
  } = useVault();
  const creating = status === "uninitialised";

  const [passphrase, setPassphrase] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const strength = useMemo(() => assessPassphrase(passphrase), [passphrase]);

  // Offer the biometric prompt straight away when it is set up — that is the
  // whole point of enabling it.
  useEffect(() => {
    if (!creating && biometricEnabled && biometricAvailable) {
      void unlockWithBiometrics().catch(() => undefined);
    }
  }, [biometricAvailable, biometricEnabled, creating, unlockWithBiometrics]);

  const canSubmit = creating
    ? strength.ok && passphrase === confirmation && acknowledged && !busy
    : passphrase.length > 0 && !busy;

  async function submit() {
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
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={{ flex: 1, backgroundColor: theme.plane }}
    >
      <ScrollView contentContainerStyle={{ padding: 20, gap: 20, justifyContent: "center", flexGrow: 1 }}>
        <View style={{ gap: 8 }}>
          <Heading>BetaPouch</Heading>
          <Text style={{ color: theme.textSecondary, fontSize: 14 }}>
            {creating
              ? "Your expenses are encrypted on this phone with a passphrase only you know."
              : "Enter your passphrase to unlock this device's vault."}
          </Text>
        </View>

        <Card style={{ gap: 16 }}>
          <Field
            label="Passphrase"
            value={passphrase}
            onChangeText={setPassphrase}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            textContentType={creating ? "newPassword" : "password"}
            editable={!busy}
            hint={
              creating
                ? strength.problems[0] ??
                  `At least ${MIN_PASSPHRASE_LENGTH} characters. A few unrelated words beats a short complicated one.`
                : undefined
            }
          />

          {creating && (
            <>
              <StrengthMeter score={strength.score} />
              <Field
                label="Confirm passphrase"
                value={confirmation}
                onChangeText={setConfirmation}
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
                editable={!busy}
                hint={
                  confirmation.length > 0 && confirmation !== passphrase
                    ? "The two entries do not match."
                    : undefined
                }
              />

              <Pressable
                accessibilityRole="checkbox"
                accessibilityState={{ checked: acknowledged }}
                onPress={() => setAcknowledged((value) => !value)}
                style={{
                  flexDirection: "row",
                  gap: 10,
                  padding: 12,
                  borderRadius: 10,
                  backgroundColor: theme.plane,
                }}
              >
                <Text style={{ color: theme.textPrimary, fontSize: 16 }}>
                  {acknowledged ? "☑" : "☐"}
                </Text>
                <Text style={{ color: theme.textSecondary, flex: 1, fontSize: 12 }}>
                  I understand that this passphrase cannot be recovered. It never leaves this
                  device, so if I forget it the data is unreadable — including to the people who
                  wrote this app.
                </Text>
              </Pressable>
            </>
          )}

          {error && <Notice tone="error">{error}</Notice>}

          <Button
            label={busy ? "Working…" : creating ? "Create my vault" : "Unlock"}
            variant="primary"
            onPress={() => void submit()}
            disabled={!canSubmit}
          />

          {!creating && biometricEnabled && biometricAvailable && (
            <Button label="Unlock with biometrics" onPress={() => void unlockWithBiometrics()} />
          )}
        </Card>

        <View style={{ gap: 4 }}>
          <Muted>No account, no sign-up, no server.</Muted>
          <Muted>Receipt photos are encrypted before they touch storage.</Muted>
          <Muted>AI features stay off until you add your own key or local model.</Muted>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function StrengthMeter({ score }: { score: number }) {
  const theme = useTheme();
  const colors = [theme.critical, theme.critical, theme.serious, theme.warning, theme.good];
  const labels = ["Too weak", "Weak", "Fair", "Good", "Strong"];
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
      <View style={{ flex: 1, height: 6, borderRadius: 3, backgroundColor: theme.gridline }}>
        <View
          style={{
            width: `${((score + 1) / 5) * 100}%`,
            height: 6,
            borderRadius: 3,
            backgroundColor: colors[score] ?? colors[0],
          }}
        />
      </View>
      <Text style={{ color: theme.textSecondary, fontSize: 12 }}>{labels[score]}</Text>
    </View>
  );
}
