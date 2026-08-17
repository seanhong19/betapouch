import { createRequire } from "node:module";
import { copyFileSync, mkdirSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";
const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
/**
 * Vendor every OCR asset into the build.
 *
 * tesseract.js defaults to pulling its worker, its wasm core and its language
 * data from a public CDN at runtime. For this app that would mean the browser
 * announcing "someone is scanning a receipt" to a third party every time — so
 * we copy all of it into our own origin and pin the paths. It also means OCR
 * keeps working with the network switched off.
 */
function vendorOcrAssets() {
    const targets = () => {
        const workerSrc = require.resolve("tesseract.js/dist/worker.min.js");
        const coreDir = dirname(require.resolve("tesseract.js-core/package.json"));
        const langFile = join(dirname(require.resolve("@tesseract.js-data/eng/package.json")), "4.0.0", "eng.traineddata.gz");
        return { workerSrc, coreDir, langFile };
    };
    const copyInto = (publicDir) => {
        const { workerSrc, coreDir, langFile } = targets();
        mkdirSync(join(publicDir, "ocr/core"), { recursive: true });
        mkdirSync(join(publicDir, "ocr/lang"), { recursive: true });
        copyFileSync(workerSrc, join(publicDir, "ocr/worker.min.js"));
        for (const entry of readdirSync(coreDir)) {
            // Only the LSTM builds. The legacy-engine variants are ~16MB we never
            // load, since recognition runs in LSTM-only mode.
            if (!/\.(wasm|js)$/.test(entry))
                continue;
            if (entry !== "index.js" && !entry.includes("lstm"))
                continue;
            copyFileSync(join(coreDir, entry), join(publicDir, "ocr/core", entry));
        }
        copyFileSync(langFile, join(publicDir, "ocr/lang/eng.traineddata.gz"));
    };
    return {
        name: "betapouch:vendor-ocr-assets",
        buildStart() {
            // Written into public/ so both `vite dev` and `vite build` serve them.
            copyInto(resolve(here, "public"));
        },
    };
}
export default defineConfig({
    plugins: [
        react(),
        vendorOcrAssets(),
        VitePWA({
            registerType: "prompt",
            includeAssets: ["favicon.svg", "icon-192.png", "icon-512.png"],
            manifest: {
                name: "BetaPouch",
                short_name: "BetaPouch",
                description: "Private, offline-first expense and receipt tracking. Your data stays on your device.",
                theme_color: "#1a1a19",
                background_color: "#fcfcfb",
                display: "standalone",
                orientation: "portrait",
                start_url: "/",
                scope: "/",
                icons: [
                    { src: "icon-192.png", sizes: "192x192", type: "image/png", purpose: "any maskable" },
                    { src: "icon-512.png", sizes: "512x512", type: "image/png", purpose: "any maskable" },
                ],
            },
            workbox: {
                // The app shell is precached so a cold start works offline. The OCR
                // engine (~25MB of wasm and language data) is not — precaching it
                // would make the very first visit download all of it before the app
                // was usable. It is cached on first use instead, after which OCR also
                // works offline. Both rules are same-origin; there is no third-party
                // caching here because there are no third parties.
                globPatterns: ["**/*.{js,css,html,svg,png,webmanifest}"],
                globIgnores: ["**/ocr/**"],
                navigateFallback: "index.html",
                runtimeCaching: [
                    {
                        urlPattern: ({ url }) => url.origin === self.location.origin && url.pathname.startsWith("/ocr/"),
                        handler: "CacheFirst",
                        options: {
                            cacheName: "betapouch-ocr-engine",
                            expiration: { maxEntries: 12, maxAgeSeconds: 60 * 60 * 24 * 180 },
                            cacheableResponse: { statuses: [0, 200] },
                        },
                    },
                ],
            },
        }),
    ],
    resolve: {
        alias: {
            "@betapouch/core": resolve(here, "../../packages/core/src/index.ts"),
            "@": resolve(here, "src"),
        },
    },
    server: {
        port: 5173,
        // Loopback only: the dev server holds a real vault, and binding to 0.0.0.0
        // would put it on the local network.
        host: "127.0.0.1",
    },
    build: {
        target: "es2022",
        sourcemap: false,
        rollupOptions: {
            output: {
                manualChunks: {
                    react: ["react", "react-dom"],
                    ocr: ["tesseract.js"],
                    db: ["dexie"],
                },
            },
        },
    },
    test: {
        globals: true,
        environment: "jsdom",
        setupFiles: ["./src/test-setup.ts"],
        include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    },
});
