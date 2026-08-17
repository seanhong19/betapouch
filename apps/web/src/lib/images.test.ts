import { describe, expect, it } from "vitest";
import { bytesToBase64Data, filesFromDataTransfer, ImageRejectedError, prepareImage } from "./images";

/**
 * jsdom has no canvas, so the re-encode path cannot run here; these cover the
 * gatekeeping that happens before it — which is the part with security
 * consequences.
 */

function fileOf(bytes: number, type: string, name = "receipt.jpg"): File {
  return new File([new Uint8Array(bytes)], name, { type });
}

describe("prepareImage validation", () => {
  it("rejects an oversized file before decoding it", async () => {
    await expect(prepareImage(fileOf(26 * 1024 * 1024, "image/jpeg"))).rejects.toBeInstanceOf(
      ImageRejectedError,
    );
  });

  it("rejects an empty file", async () => {
    await expect(prepareImage(fileOf(0, "image/jpeg"))).rejects.toBeInstanceOf(ImageRejectedError);
  });

  it("rejects a type that is not an image or PDF, whatever the extension says", async () => {
    await expect(
      prepareImage(fileOf(100, "text/html", "totally-a-receipt.jpg")),
    ).rejects.toBeInstanceOf(ImageRejectedError);
    await expect(
      prepareImage(fileOf(100, "application/x-msdownload", "receipt.png")),
    ).rejects.toBeInstanceOf(ImageRejectedError);
  });

  it("accepts a PDF without trying to re-encode it", async () => {
    const prepared = await prepareImage(fileOf(64, "application/pdf", "invoice.pdf"));
    expect(prepared.attachment.mimeType).toBe("application/pdf");
    expect(prepared.attachment.byteSize).toBe(64);
    expect(prepared.attachment.sha256).toMatch(/^[0-9a-f]{64}$/);
    URL.revokeObjectURL(prepared.previewUrl);
  });

  it("strips path separators from the stored filename", async () => {
    const prepared = await prepareImage(fileOf(16, "application/pdf", "../../etc/passwd.pdf"));
    expect(prepared.attachment.filename).not.toContain("/");
    expect(prepared.attachment.filename?.startsWith(".")).toBe(false);
    URL.revokeObjectURL(prepared.previewUrl);
  });
});

describe("bytesToBase64Data", () => {
  it("matches the platform encoder", () => {
    const bytes = new Uint8Array([0, 1, 2, 250, 251, 252, 253, 254, 255]);
    expect(bytesToBase64Data(bytes)).toBe(btoa(String.fromCharCode(...bytes)));
  });

  it("handles a payload larger than one chunk without blowing the stack", () => {
    const bytes = new Uint8Array(200_000).map((_, i) => i % 256);
    expect(bytesToBase64Data(bytes).length).toBeGreaterThan(200_000);
  });
});

describe("filesFromDataTransfer", () => {
  it("returns nothing for a null transfer", () => {
    expect(filesFromDataTransfer(null)).toEqual([]);
  });

  it("keeps only accepted types", () => {
    const transfer = {
      items: [],
      files: [fileOf(10, "image/png"), fileOf(10, "text/plain", "notes.txt")],
    } as unknown as DataTransfer;
    const files = filesFromDataTransfer(transfer);
    expect(files).toHaveLength(1);
    expect(files[0]?.type).toBe("image/png");
  });
});
