import {
  CATEGORIES,
  CATEGORY_LABELS,
  mergeDrafts,
  minorToDecimalString,
  parseAmountToMinor,
  suggestCategory,
  type Category,
  type ExpenseDraft,
} from "@betapouch/core";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import { useCallback, useRef, useState } from "react";
import { Image, Pressable, ScrollView, Text, View } from "react-native";
import { CurrencyPicker } from "../components/CurrencyPicker";
import { Button, Card, Field, Heading, Muted, Notice } from "../components/ui";
import { activeProviderConfig, extractWithAi, resolveProvider } from "../lib/ai";
import { useExpenses } from "../lib/expenses";
import { bytesToBase64, ImageRejectedError, prepareImage, type PreparedImage } from "../lib/images";
import { useVault } from "../lib/vault";
import { useTheme } from "../theme";

type Mode = "choose" | "camera" | "form";

/**
 * Capture on device: camera, photo library, or a file. There is no on-device
 * OCR here (see docs/ARCHITECTURE.md), so the default flow is a photo plus a
 * quick manual amount — which is genuinely fast — and a vision model is an
 * opt-in accelerator rather than a dependency.
 */
export function CaptureScreen({ onDone }: { onDone: () => void }) {
  const theme = useTheme();
  const { vault, settings } = useVault();
  const { saveExpense, attachToExpense } = useExpenses();

  const [mode, setMode] = useState<Mode>("choose");
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView | null>(null);

  const [image, setImage] = useState<PreparedImage | null>(null);
  const [draft, setDraft] = useState<ExpenseDraft>({ currency: settings.baseCurrency });
  const [merchant, setMerchant] = useState("");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState<Category>("other");
  const [notes, setNotes] = useState("");

  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const aiConfig = activeProviderConfig(settings);

  const ingest = useCallback(
    async (uri: string) => {
      setError(null);
      setBusy(true);
      try {
        const prepared = await prepareImage(uri, { stripMetadata: settings.stripImageMetadata });
        setImage(prepared);
        setMode("form");
        if (settings.stripImageMetadata) {
          setNotice("Location data was removed from this photo before it was stored.");
        }
      } catch (caught) {
        setError(
          caught instanceof ImageRejectedError ? caught.message : "That image could not be read.",
        );
      } finally {
        setBusy(false);
      }
    },
    [settings.stripImageMetadata],
  );

  async function shoot() {
    const photo = await cameraRef.current?.takePictureAsync({ quality: 0.9, exif: false });
    if (photo?.uri) {
      setMode("choose");
      await ingest(photo.uri);
    }
  }

  async function pickFromLibrary() {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 1,
      // Never ask for EXIF: what we don't request, we can't accidentally keep.
      exif: false,
    });
    if (!result.canceled && result.assets[0]) await ingest(result.assets[0].uri);
  }

  async function pickFile() {
    const result = await DocumentPicker.getDocumentAsync({
      type: ["image/*"],
      copyToCacheDirectory: true,
    });
    if (!result.canceled && result.assets?.[0]) await ingest(result.assets[0].uri);
  }

  async function askAi() {
    if (!vault || !image || !aiConfig) return;
    setBusy(true);
    setError(null);
    try {
      const resolved = await resolveProvider(vault, settings);
      if (!resolved) throw new Error("No AI provider is configured.");
      if (!resolved.config.allowImageUpload) {
        throw new Error(
          "This provider is not allowed to receive images. Turn that on in Settings if you want it to read the photo.",
        );
      }

      const outcome = await extractWithAi(resolved, {
        text: "",
        image: { mimeType: image.attachment.mimeType, dataB64: bytesToBase64(image.bytes) },
      });

      // Merge rather than replace, so a model that read nothing useful cannot
      // blank what is already on the form.
      const merged = mergeDrafts({ ...draft, merchant, category }, outcome.draft);
      setDraft(merged);
      if (merged.merchant) setMerchant(merged.merchant);
      if (merged.amountMinor != null) {
        setAmount(minorToDecimalString(merged.amountMinor, merged.currency ?? "USD"));
      }
      if (merged.category) setCategory(merged.category);
      setNotice(`Read by ${resolved.destination ?? "a model on this device"}. Check the amount.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "That provider could not be reached.");
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    const currency = draft.currency ?? settings.baseCurrency;
    const amountMinor = parseAmountToMinor(amount, currency);
    if (amountMinor === null || amountMinor === 0) {
      setError("Enter the amount you paid, for example 12.50.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const saved = await saveExpense({
        ...draft,
        merchant: merchant.trim(),
        amountMinor,
        currency,
        category,
        notes: notes.trim(),
        source: image ? "camera" : "manual",
        reviewed: true,
      });
      if (image) await attachToExpense(saved.id, image.attachment, image.bytes);
      reset();
      onDone();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The expense could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    setImage(null);
    setDraft({ currency: settings.baseCurrency });
    setMerchant("");
    setAmount("");
    setCategory("other");
    setNotes("");
    setNotice(null);
    setError(null);
    setMode("choose");
  }

  if (mode === "camera") {
    if (!permission?.granted) {
      return (
        <View style={{ flex: 1, padding: 20, gap: 16, justifyContent: "center", backgroundColor: theme.plane }}>
          <Heading>Camera access</Heading>
          <Text style={{ color: theme.textSecondary, fontSize: 14 }}>
            BetaPouch needs the camera to photograph receipts. Photos are encrypted on this device
            and are never uploaded.
          </Text>
          <Button label="Allow camera" variant="primary" onPress={() => void requestPermission()} />
          <Button label="Back" onPress={() => setMode("choose")} />
        </View>
      );
    }
    return (
      <View style={{ flex: 1, backgroundColor: "#000" }}>
        <CameraView ref={cameraRef} style={{ flex: 1 }} facing="back" />
        <View style={{ flexDirection: "row", gap: 12, padding: 16, backgroundColor: theme.surface }}>
          <Button label="Cancel" onPress={() => setMode("choose")} style={{ flex: 1 }} />
          <Button label="Take photo" variant="primary" onPress={() => void shoot()} style={{ flex: 2 }} />
        </View>
      </View>
    );
  }

  if (mode === "form") {
    return (
      <ScrollView
        contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 40 }}
        style={{ backgroundColor: theme.plane }}
        keyboardShouldPersistTaps="handled"
      >
        <Heading>Check the details</Heading>

        {image && (
          <Image
            source={{ uri: image.previewUri }}
            style={{ width: "100%", height: 200, borderRadius: 14 }}
            resizeMode="contain"
            accessibilityLabel="The receipt you captured"
          />
        )}

        {notice && <Notice>{notice}</Notice>}
        {error && <Notice tone="error">{error}</Notice>}

        {aiConfig && image && (
          <Button
            label={`✦ Read it with ${aiConfig.label || aiConfig.kind}`}
            onPress={() => void askAi()}
            disabled={busy}
          />
        )}

        <Card style={{ gap: 14 }}>
          <Field
            label="Merchant"
            value={merchant}
            onChangeText={(value) => {
              setMerchant(value);
              const guess = suggestCategory(value);
              if (guess) setCategory(guess);
            }}
            placeholder="Where did you spend?"
          />
          <View style={{ flexDirection: "row", gap: 12 }}>
            <View style={{ flex: 2 }}>
              <Field
                label="Amount"
                value={amount}
                onChangeText={setAmount}
                placeholder="0.00"
                keyboardType="decimal-pad"
              />
            </View>
            <View style={{ flex: 1 }}>
              <CurrencyPicker
                label="Currency"
                value={draft.currency ?? settings.baseCurrency}
                locale={settings.locale}
                onChange={(code) => setDraft((current) => ({ ...current, currency: code }))}
              />
            </View>
          </View>

          <View style={{ gap: 6 }}>
            <Text style={{ color: theme.textSecondary, fontSize: 12, fontWeight: "500" }}>
              Category
            </Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {CATEGORIES.map((value) => {
                const selected = value === category;
                return (
                  <Pressable
                    key={value}
                    accessibilityRole="radio"
                    accessibilityState={{ selected }}
                    onPress={() => setCategory(value)}
                    style={{
                      paddingHorizontal: 12,
                      paddingVertical: 8,
                      borderRadius: 999,
                      borderWidth: 1,
                      borderColor: selected ? theme.series1 : theme.hairline,
                      backgroundColor: selected ? theme.plane : "transparent",
                    }}
                  >
                    <Text
                      style={{
                        color: selected ? theme.textPrimary : theme.textSecondary,
                        fontSize: 12,
                      }}
                    >
                      {CATEGORY_LABELS[value]}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          <Field label="Notes" value={notes} onChangeText={setNotes} multiline />
        </Card>

        <View style={{ flexDirection: "row", gap: 12 }}>
          <Button
            label={busy ? "Saving…" : "Save expense"}
            variant="primary"
            onPress={() => void save()}
            disabled={busy}
            style={{ flex: 2 }}
          />
          <Button label="Cancel" onPress={reset} style={{ flex: 1 }} />
        </View>
      </ScrollView>
    );
  }

  return (
    <ScrollView
      contentContainerStyle={{ padding: 16, gap: 16 }}
      style={{ backgroundColor: theme.plane }}
    >
      <Heading>Add an expense</Heading>
      {error && <Notice tone="error">{error}</Notice>}

      <Button label="⃝  Photograph a receipt" variant="primary" onPress={() => setMode("camera")} />
      <Button label="▤  Choose from photos" onPress={() => void pickFromLibrary()} />
      <Button label="⇪  Pick a file" onPress={() => void pickFile()} />
      <Button
        label="✎  Type it in"
        onPress={() => {
          setImage(null);
          setMode("form");
        }}
      />

      <Muted>
        {settings.stripImageMetadata
          ? "Location data is stripped from every photo before it is stored. "
          : ""}
        Nothing is uploaded unless you explicitly ask a provider to read a receipt.
      </Muted>
    </ScrollView>
  );
}
