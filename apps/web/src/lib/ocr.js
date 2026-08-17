import { createWorker } from "tesseract.js";
/**
 * On-device OCR.
 *
 * Every path is pinned to our own origin — worker, wasm core and language
 * data are all vendored at build time (see vite.config.ts). tesseract.js will
 * otherwise fetch them from a CDN, which would broadcast "a receipt is being
 * scanned right now" to a third party. With these pinned, OCR works offline
 * and the CSP can keep `connect-src` free of any extra host.
 */
/**
 * Exported so a test can assert they are all same-origin. tesseract.js keeps a
 * CDN URL as its built-in default, which survives into the bundle as an inert
 * string; the guarantee is that we always pass these three explicitly, so that
 * default is never reached.
 */
export const OCR_PATHS = {
    workerPath: "/ocr/worker.min.js",
    corePath: "/ocr/core",
    langPath: "/ocr/lang",
};
let workerPromise = null;
async function getWorker(language, onProgress) {
    if (!workerPromise) {
        workerPromise = createWorker(language, 1, {
            ...OCR_PATHS,
            // The language file is bundled uncompressed-on-disk as .gz; tesseract
            // handles the gzip itself.
            gzip: true,
            logger: (message) => {
                if (message.status === "recognizing text")
                    onProgress?.(message.progress);
            },
        }).catch((error) => {
            // A failed init must not poison every later attempt.
            workerPromise = null;
            throw error;
        });
    }
    return workerPromise;
}
export async function recogniseText(source, options = {}) {
    const worker = await getWorker(options.language ?? "eng", options.onProgress);
    const { data } = await worker.recognize(source);
    return {
        text: data.text ?? "",
        confidence: Math.max(0, Math.min(1, (data.confidence ?? 0) / 100)),
    };
}
/** Release the worker (and its ~30MB of wasm heap) when leaving capture. */
export async function releaseOcr() {
    const pending = workerPromise;
    workerPromise = null;
    if (!pending)
        return;
    try {
        const worker = await pending;
        await worker.terminate();
    }
    catch {
        /* already gone */
    }
}
export function isOcrSupported() {
    return typeof WebAssembly === "object" && typeof Worker === "function";
}
