import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { mergeDrafts, parseReceiptText, resolveCategory, } from "@betapouch/core";
import { useCallback, useEffect, useRef, useState } from "react";
import { CameraCapture } from "../components/CameraCapture";
import { ExpenseForm } from "../components/ExpenseForm";
import { activeProviderConfig, extractWithAi, resolveProvider } from "../lib/ai";
import { useExpenses } from "../lib/expenses";
import { bytesToBase64Data, filesFromDataTransfer, ImageRejectedError, prepareImage, } from "../lib/images";
import { isOcrSupported, recogniseText, releaseOcr } from "../lib/ocr";
import { useVault } from "../lib/vault";
/**
 * Capture: camera, file/drag/paste, or straight to the form.
 *
 * The pipeline is deliberately ordered so the private path runs first —
 * on-device OCR and the offline parser produce a usable draft before any
 * question of sending data anywhere arises. AI enrichment is a second,
 * optional pass on top of a draft the user already has.
 */
export function CaptureScreen({ onDone }) {
    const { vault, settings } = useVault();
    const { saveExpense, attachToExpense, categoryMemory, rememberCategory } = useExpenses();
    const [mode, setMode] = useState("choose");
    const [stage, setStage] = useState("idle");
    const [progress, setProgress] = useState(0);
    const [image, setImage] = useState(null);
    const [draft, setDraft] = useState(null);
    const [confidence, setConfidence] = useState(null);
    const [ocrText, setOcrText] = useState("");
    const [notice, setNotice] = useState(null);
    const [error, setError] = useState(null);
    const [dragging, setDragging] = useState(false);
    const [saving, setSaving] = useState(false);
    const abortRef = useRef(null);
    const fileInputRef = useRef(null);
    const aiConfig = activeProviderConfig(settings);
    // Release the OCR worker's wasm heap and any preview URL on the way out.
    useEffect(() => () => {
        abortRef.current?.abort();
        void releaseOcr();
    }, []);
    useEffect(() => {
        const url = image?.previewUrl;
        return () => {
            if (url)
                URL.revokeObjectURL(url);
        };
    }, [image?.previewUrl]);
    const ingest = useCallback(async (file) => {
        setError(null);
        setNotice(null);
        try {
            const prepared = await prepareImage(file, { stripMetadata: settings.stripImageMetadata });
            setImage(prepared);
            setMode("review");
            const isPdf = prepared.attachment.mimeType === "application/pdf";
            if (!settings.ocrEnabled || isPdf || !isOcrSupported()) {
                setDraft({ source: isPdf ? "upload" : "camera", currency: settings.baseCurrency });
                setNotice(isPdf
                    ? "PDFs are stored as-is. Fill the details in below, or ask the assistant."
                    : "On-device reading is off. Fill the details in below.");
                return;
            }
            setStage("reading");
            setProgress(0);
            const result = await recogniseText(new Blob([prepared.bytes], { type: prepared.attachment.mimeType }), { language: settings.ocrLanguage, onProgress: setProgress });
            setOcrText(result.text);
            const parsed = parseReceiptText(result.text, { defaultCurrency: settings.baseCurrency });
            const merchant = parsed.merchant ?? "";
            setDraft({
                merchant,
                occurredAt: parsed.occurredAt ?? undefined,
                amountMinor: parsed.totalMinor,
                currency: parsed.currency ?? settings.baseCurrency,
                taxMinor: parsed.taxMinor,
                tipMinor: parsed.tipMinor,
                category: resolveCategory(categoryMemory, merchant, result.text),
                paymentMethod: parsed.paymentHint,
                source: "ocr",
                ocrText: result.text,
                extractionConfidence: parsed.confidence,
                reviewed: false,
            });
            setConfidence(parsed.confidence);
            if (parsed.totalMinor === null) {
                setNotice("The total was not readable. Enter it below — the image is saved either way.");
            }
        }
        catch (caught) {
            setError(caught instanceof ImageRejectedError
                ? caught.message
                : "That file could not be read. Try another photo, or enter the expense by hand.");
            setMode("choose");
        }
        finally {
            setStage("idle");
        }
    }, [categoryMemory, settings.baseCurrency, settings.ocrEnabled, settings.ocrLanguage, settings.stripImageMetadata]);
    /** Second pass: hand the OCR text (and optionally the image) to a model. */
    const enrichWithAi = useCallback(async () => {
        if (!vault || !aiConfig)
            return;
        setError(null);
        setStage("asking");
        const controller = new AbortController();
        abortRef.current = controller;
        try {
            const resolved = await resolveProvider(vault, settings);
            if (!resolved)
                throw new Error("No AI provider is configured.");
            const outcome = await extractWithAi(resolved, {
                text: ocrText,
                image: image && image.attachment.mimeType !== "application/pdf"
                    ? { mimeType: image.attachment.mimeType, dataB64: bytesToBase64Data(image.bytes) }
                    : undefined,
            }, controller.signal);
            const removed = Object.entries(outcome.redacted);
            setNotice(removed.length
                ? `Sent to ${resolved.destination ?? "this device"} with ${removed.map(([k, n]) => `${n} ${k}`).join(", ")} redacted.`
                : `Sent to ${resolved.destination ?? "this device"}.`);
            // Merge rather than replace: the model must never blank a value the
            // on-device parser already got right.
            setDraft((current) => ({
                ...mergeDrafts(current ?? {}, outcome.draft),
                ocrText: ocrText || current?.ocrText || null,
            }));
            setConfidence(outcome.draft.extractionConfidence ?? null);
        }
        catch (caught) {
            setError(caught instanceof Error ? caught.message : "The provider could not be reached.");
        }
        finally {
            setStage("idle");
            abortRef.current = null;
        }
    }, [aiConfig, image, ocrText, settings, vault]);
    const onSave = useCallback(async (finalDraft) => {
        setSaving(true);
        try {
            const saved = await saveExpense(finalDraft);
            if (image)
                await attachToExpense(saved.id, image.attachment, image.bytes);
            if (finalDraft.merchant && finalDraft.category) {
                await rememberCategory(finalDraft.merchant, finalDraft.category);
            }
            reset();
            onDone();
        }
        catch (caught) {
            setError(caught instanceof Error ? caught.message : "The expense could not be saved.");
        }
        finally {
            setSaving(false);
        }
    }, [attachToExpense, image, onDone, rememberCategory, saveExpense]);
    function reset() {
        if (image?.previewUrl)
            URL.revokeObjectURL(image.previewUrl);
        setImage(null);
        setDraft(null);
        setConfidence(null);
        setOcrText("");
        setNotice(null);
        setError(null);
        setMode("choose");
    }
    /* Paste support: a screenshot of a receipt is a very common input. */
    useEffect(() => {
        if (mode !== "choose")
            return;
        const onPaste = (event) => {
            const files = filesFromDataTransfer(event.clipboardData);
            if (files[0])
                void ingest(files[0]);
        };
        window.addEventListener("paste", onPaste);
        return () => window.removeEventListener("paste", onPaste);
    }, [ingest, mode]);
    if (mode === "camera") {
        return (_jsxs("div", { className: "flex flex-col gap-4", children: [_jsx("h1", { className: "m-0 text-xl font-semibold tracking-tight", children: "Photograph a receipt" }), _jsx(CameraCapture, { onCapture: (file) => void ingest(file), onCancel: () => setMode("choose") })] }));
    }
    if (mode === "review" && draft) {
        return (_jsxs("div", { className: "flex flex-col gap-4", children: [_jsxs("header", { className: "flex items-center justify-between gap-3", children: [_jsx("h1", { className: "m-0 text-xl font-semibold tracking-tight", children: "Check the details" }), _jsx("button", { type: "button", className: "btn py-1.5", onClick: reset, children: "Start over" })] }), image && image.attachment.mimeType !== "application/pdf" && (_jsx("img", { src: image.previewUrl, alt: "The receipt you captured", className: "card max-h-64 w-full object-contain p-2" })), stage === "reading" && (_jsx(ProgressNote, { label: "Reading the receipt on this device", ratio: progress })), stage === "asking" && (_jsx(ProgressNote, { label: `Asking ${aiConfig?.label || aiConfig?.kind || "the model"}` })), notice && (_jsx("p", { className: "card m-0 p-3 text-xs", style: { color: "var(--text-secondary)" }, children: notice })), error && (_jsx("p", { role: "alert", className: "card m-0 p-3 text-sm", style: { color: "var(--status-critical)" }, children: error })), aiConfig && ocrText && (_jsxs("button", { type: "button", className: "btn", onClick: () => void enrichWithAi(), disabled: stage !== "idle", children: ["\u2726 Improve with ", aiConfig.label || aiConfig.kind] })), _jsx(ExpenseForm, { draft: draft, confidence: confidence, busy: saving || stage !== "idle", onSubmit: onSave, onCancel: reset }), ocrText && (_jsxs("details", { className: "card p-4", children: [_jsx("summary", { className: "cursor-pointer text-sm font-medium", children: "What was read from the image" }), _jsx("pre", { className: "mt-3 max-h-56 overflow-auto whitespace-pre-wrap text-xs", style: { color: "var(--text-secondary)" }, children: ocrText })] }))] }));
    }
    return (_jsxs("div", { className: "flex flex-col gap-4", children: [_jsx("h1", { className: "m-0 text-xl font-semibold tracking-tight", children: "Add an expense" }), error && (_jsx("p", { role: "alert", className: "card m-0 p-3 text-sm", style: { color: "var(--status-critical)" }, children: error })), _jsxs("div", { onDragOver: (event) => {
                    event.preventDefault();
                    setDragging(true);
                }, onDragLeave: () => setDragging(false), onDrop: (event) => {
                    event.preventDefault();
                    setDragging(false);
                    const files = filesFromDataTransfer(event.dataTransfer);
                    if (files[0])
                        void ingest(files[0]);
                    else
                        setError("Drop a JPEG, PNG, WebP, HEIC or PDF.");
                }, className: "card flex flex-col items-center gap-3 p-8 text-center transition-colors", style: {
                    borderStyle: "dashed",
                    borderColor: dragging ? "var(--series-1)" : "var(--hairline)",
                    background: dragging ? "var(--plane)" : "var(--surface-1)",
                }, children: [_jsx("div", { className: "text-3xl", "aria-hidden": "true", children: "\u21EA" }), _jsx("p", { className: "m-0 text-sm", style: { color: "var(--text-secondary)" }, children: "Drag a receipt here, paste a screenshot, or choose a file." }), _jsx("input", { ref: fileInputRef, type: "file", accept: "image/*,application/pdf", className: "hidden", onChange: (event) => {
                            const file = event.target.files?.[0];
                            if (file)
                                void ingest(file);
                            event.target.value = "";
                        } }), _jsx("button", { type: "button", className: "btn", onClick: () => fileInputRef.current?.click(), children: "Choose a file" })] }), _jsxs("div", { className: "grid grid-cols-1 gap-3 sm:grid-cols-2", children: [_jsx("button", { type: "button", className: "btn btn-primary", onClick: () => setMode("camera"), children: "\u20DD Use the camera" }), _jsx("button", { type: "button", className: "btn", onClick: () => {
                            setDraft({ source: "manual", currency: settings.baseCurrency });
                            setConfidence(null);
                            setMode("review");
                        }, children: "\u270E Type it in" })] }), _jsxs("p", { className: "m-0 text-xs", style: { color: "var(--text-muted)" }, children: [settings.ocrEnabled
                        ? "Receipts are read on this device. Nothing is uploaded unless you ask an AI provider to help."
                        : "On-device reading is off — turn it on in Settings to auto-fill from photos.", settings.stripImageMetadata && " Location data is stripped from every image you add."] })] }));
}
function ProgressNote({ label, ratio }) {
    return (_jsxs("div", { className: "card p-3", children: [_jsxs("div", { className: "mb-2 flex items-center justify-between text-xs", style: { color: "var(--text-secondary)" }, children: [_jsxs("span", { children: [label, "\u2026"] }), ratio !== undefined && _jsxs("span", { className: "tabular", children: [Math.round(ratio * 100), "%"] })] }), _jsx("div", { className: "h-1.5 overflow-hidden rounded-full", style: { background: "var(--gridline)" }, children: _jsx("div", { className: "h-full rounded-full transition-all", style: {
                        width: ratio === undefined ? "100%" : `${Math.max(4, ratio * 100)}%`,
                        background: "var(--series-1)",
                        opacity: ratio === undefined ? 0.5 : 1,
                    } }) })] }));
}
