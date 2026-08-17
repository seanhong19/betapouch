import { newId, sha256Hex, type Attachment } from "@betapouch/core";
import { File, Paths } from "expo-file-system";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import { getCrypto } from "./crypto";

/**
 * Image intake on device.
 *
 * Every image is put through expo-image-manipulator before it is stored. That
 * is not only a resize: the manipulator re-encodes the pixels, which drops
 * EXIF — and on a phone the EXIF block carries the GPS coordinates of wherever
 * the photo was taken. Storing that alongside "lunch, $18" would quietly build
 * a location history nobody asked for.
 */

export const MAX_INPUT_BYTES = 25 * 1024 * 1024;
const MAX_DIMENSION = 2000;

export class ImageRejectedError extends Error {}

export interface PreparedImage {
  attachment: Attachment;
  bytes: Uint8Array;
  /** A file:// URI for preview, inside the app's own cache. */
  previewUri: string;
}

export async function prepareImage(
  uri: string,
  options: { stripMetadata?: boolean } = {},
): Promise<PreparedImage> {
  const source = new File(uri);
  if (!source.exists) throw new ImageRejectedError("That file no longer exists.");
  if (source.size > MAX_INPUT_BYTES) {
    throw new ImageRejectedError(
      `That image is ${(source.size / 1024 / 1024).toFixed(1)} MB. The limit is ${MAX_INPUT_BYTES / 1024 / 1024} MB.`,
    );
  }

  if (options.stripMetadata === false) {
    const bytes = await source.bytes();
    return {
      attachment: await describe(bytes, "image/jpeg", null, null),
      bytes,
      previewUri: uri,
    };
  }

  const context = ImageManipulator.manipulate(uri);
  context.resize({ width: MAX_DIMENSION });
  const rendered = await context.renderAsync();
  const result = await rendered.saveAsync({ compress: 0.86, format: SaveFormat.JPEG });

  const output = new File(result.uri);
  const bytes = await output.bytes();
  if (bytes.byteLength === 0) throw new ImageRejectedError("That image could not be processed.");

  return {
    attachment: await describe(bytes, "image/jpeg", result.width, result.height),
    bytes,
    previewUri: result.uri,
  };
}

async function describe(
  bytes: Uint8Array,
  mimeType: Attachment["mimeType"],
  width: number | null,
  height: number | null,
): Promise<Attachment> {
  return {
    id: newId("att"),
    mimeType,
    byteSize: bytes.byteLength,
    width,
    height,
    filename: null,
    createdAt: new Date().toISOString(),
    sha256: await sha256Hex(bytes, getCrypto()),
  };
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return globalThis.btoa(binary);
}

/**
 * Writes decrypted bytes to a cache file so <Image> can display them, and
 * deletes it as soon as the caller is done. The plaintext must not outlive
 * the view that needs it — a decrypted receipt left in the cache directory
 * defeats the point of having encrypted it.
 */
export async function withTemporaryImage(
  bytes: Uint8Array,
  run: (uri: string) => Promise<void> | void,
): Promise<void> {
  const file = new File(Paths.cache, `bp-${newId("tmp")}.jpg`);
  file.create({ overwrite: true });
  file.write(bytes);
  try {
    await run(file.uri);
  } finally {
    file.delete();
  }
}
