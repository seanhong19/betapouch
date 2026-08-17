import { sha256Hex } from "@betapouch/core";
import { newId } from "@betapouch/core";
/**
 * Image intake.
 *
 * Two things happen to every imported image before it is stored:
 *
 * 1. It is re-encoded through a canvas. That drops EXIF wholesale — including
 *    the GPS tag that says exactly where you were when you bought lunch,
 *    which is the single most sensitive thing on a phone photo and travels
 *    invisibly with it.
 * 2. It is downscaled to a bound that OCR still reads well. A 12MP phone
 *    photo is ~4MB of storage for no accuracy gain.
 *
 * PDFs are stored as-is (there is no canvas path for them) and are excluded
 * from OCR; the user fills those in by hand or via the assistant.
 */
export const ACCEPTED_MIME = [
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/heic",
    "image/heif",
    "application/pdf",
];
export const MAX_INPUT_BYTES = 25 * 1024 * 1024;
const MAX_DIMENSION = 2000;
const JPEG_QUALITY = 0.86;
export class ImageRejectedError extends Error {
}
function assertAcceptable(file) {
    if (file.size > MAX_INPUT_BYTES) {
        throw new ImageRejectedError(`That file is ${(file.size / 1024 / 1024).toFixed(1)} MB. The limit is ${MAX_INPUT_BYTES / 1024 / 1024} MB.`);
    }
    if (file.size === 0)
        throw new ImageRejectedError("That file is empty.");
    // Trust the sniffed type over the extension; a file named .jpg is not
    // evidence of anything.
    if (!ACCEPTED_MIME.includes(file.type)) {
        throw new ImageRejectedError(`${file.type || "That file type"} is not supported. Use a JPEG, PNG, WebP, HEIC or PDF.`);
    }
}
/** Filenames are display-only here, but they still get sanitised before storage. */
function sanitiseFilename(name) {
    return name
        // Control characters can hide a second extension or wreck a log line.
        .replace(/[\u0000-\u001f\u007f]/g, "")
        .replace(/[/\\]/g, "_")
        .replace(/^\.+/, "")
        .slice(0, 255);
}
async function decode(file) {
    try {
        return await createImageBitmap(file);
    }
    catch {
        throw new ImageRejectedError("That image could not be decoded. HEIC files sometimes need to be exported as JPEG first.");
    }
}
export async function prepareImage(file, options = {}) {
    assertAcceptable(file);
    const stripMetadata = options.stripMetadata ?? true;
    let bytes;
    let mimeType = file.type;
    let width = null;
    let height = null;
    if (file.type === "application/pdf" || !stripMetadata) {
        bytes = new Uint8Array(await file.arrayBuffer());
    }
    else {
        const bitmap = await decode(file);
        const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
        width = Math.max(1, Math.round(bitmap.width * scale));
        height = Math.max(1, Math.round(bitmap.height * scale));
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext("2d", { alpha: false });
        if (!context)
            throw new ImageRejectedError("This browser could not process the image.");
        context.drawImage(bitmap, 0, 0, width, height);
        bitmap.close();
        const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY));
        if (!blob)
            throw new ImageRejectedError("This browser could not re-encode the image.");
        bytes = new Uint8Array(await blob.arrayBuffer());
        mimeType = "image/jpeg";
        // Drop the pixels from the canvas rather than leaving them addressable.
        canvas.width = 0;
        canvas.height = 0;
    }
    const attachment = {
        id: newId("att"),
        mimeType: mimeType,
        byteSize: bytes.byteLength,
        width,
        height,
        filename: file.name ? sanitiseFilename(file.name) : null,
        createdAt: new Date().toISOString(),
        sha256: await sha256Hex(bytes),
    };
    return {
        attachment,
        bytes,
        previewUrl: URL.createObjectURL(new Blob([bytes], { type: mimeType })),
    };
}
/** Turn stored bytes back into a URL for <img>. Caller revokes. */
export function bytesToObjectUrl(bytes, mimeType) {
    return URL.createObjectURL(new Blob([bytes], { type: mimeType }));
}
export function bytesToBase64Data(bytes) {
    let binary = "";
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
        binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
    }
    return btoa(binary);
}
/** Pull image files out of a paste or drop, ignoring everything else. */
export function filesFromDataTransfer(data) {
    if (!data)
        return [];
    const files = [];
    for (const item of Array.from(data.items ?? [])) {
        if (item.kind !== "file")
            continue;
        const file = item.getAsFile();
        if (file)
            files.push(file);
    }
    if (files.length === 0)
        files.push(...Array.from(data.files ?? []));
    return files.filter((f) => ACCEPTED_MIME.includes(f.type));
}
