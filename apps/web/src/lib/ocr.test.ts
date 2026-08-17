import { describe, expect, it } from "vitest";
import { OCR_PATHS } from "./ocr";

/**
 * tesseract.js defaults to fetching its worker, wasm core and language data
 * from a public CDN — which would tell a third party that a receipt is being
 * scanned, every time. The vendored copies only help if we actually point at
 * them, so that is asserted here rather than assumed.
 */
describe("OCR asset paths", () => {
  it("pins every asset to our own origin", () => {
    for (const [name, path] of Object.entries(OCR_PATHS)) {
      expect(path, `${name} must be a same-origin absolute path`).toMatch(/^\/ocr\//);
      expect(path).not.toMatch(/^https?:/);
      expect(path).not.toContain("//");
    }
  });

  it("covers all three assets tesseract can fetch", () => {
    expect(Object.keys(OCR_PATHS).sort()).toEqual(["corePath", "langPath", "workerPath"]);
  });
});
