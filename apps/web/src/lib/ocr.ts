import { createWorker, type Worker } from "tesseract.js";

/**
 * On-device OCR.
 *
 * Every path is pinned to our own origin — worker, wasm core and language
 * data are all vendored at build time (see vite.config.ts). tesseract.js will
 * otherwise fetch them from a CDN, which would broadcast "a receipt is being
 * scanned right now" to a third party. With these pinned, OCR works offline
 * and the CSP can keep `connect-src` free of any extra host.
 */

const WORKER_PATH = "/ocr/worker.min.js";
const CORE_PATH = "/ocr/core";
const LANG_PATH = "/ocr/lang";

export interface OcrResult {
  text: string;
  /** Tesseract's own 0..100 confidence, normalised to 0..1. */
  confidence: number;
}

let workerPromise: Promise<Worker> | null = null;

async function getWorker(language: string, onProgress?: (ratio: number) => void): Promise<Worker> {
  if (!workerPromise) {
    workerPromise = createWorker(language, 1, {
      workerPath: WORKER_PATH,
      corePath: CORE_PATH,
      langPath: LANG_PATH,
      // The language file is bundled uncompressed-on-disk as .gz; tesseract
      // handles the gzip itself.
      gzip: true,
      logger: (message: { status: string; progress: number }) => {
        if (message.status === "recognizing text") onProgress?.(message.progress);
      },
    }).catch((error: unknown) => {
      // A failed init must not poison every later attempt.
      workerPromise = null;
      throw error;
    });
  }
  return workerPromise;
}

export async function recogniseText(
  source: Blob | string,
  options: { language?: string; onProgress?: (ratio: number) => void } = {},
): Promise<OcrResult> {
  const worker = await getWorker(options.language ?? "eng", options.onProgress);
  const { data } = await worker.recognize(source);
  return {
    text: data.text ?? "",
    confidence: Math.max(0, Math.min(1, (data.confidence ?? 0) / 100)),
  };
}

/** Release the worker (and its ~30MB of wasm heap) when leaving capture. */
export async function releaseOcr(): Promise<void> {
  const pending = workerPromise;
  workerPromise = null;
  if (!pending) return;
  try {
    const worker = await pending;
    await worker.terminate();
  } catch {
    /* already gone */
  }
}

export function isOcrSupported(): boolean {
  return typeof WebAssembly === "object" && typeof Worker === "function";
}
