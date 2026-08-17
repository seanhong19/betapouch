# Deployment

The web app is a static bundle. There is nothing to run server-side, because
there is no server side.

```bash
pnpm install
pnpm build          # -> apps/web/dist
```

Serve `apps/web/dist`. Two hard requirements:

1. **https.** WebCrypto is unavailable in an insecure context, so the app will
   refuse to start over plain http. (`http://localhost` counts as secure for
   local development.)
2. **The security headers.** Most of the CSP is in the page's `<meta>` tag, but
   `frame-ancestors`, `X-Frame-Options` and `Strict-Transport-Security` are
   ignored there and must be real headers.

## nginx

Copy `apps/web/deploy/headers.conf` into your server block.

```nginx
server {
    listen 443 ssl http2;
    server_name betapouch.example;
    root /var/www/betapouch;

    include /etc/nginx/snippets/betapouch-headers.conf;   # headers.conf

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

## Caddy

```
betapouch.example {
    root * /var/www/betapouch
    encode gzip zstd
    try_files {path} /index.html
    file_server

    header {
        Content-Security-Policy "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; font-src 'self'; worker-src 'self' blob:; child-src 'self' blob:; manifest-src 'self'; connect-src 'self' blob: data: https: http://localhost:* http://127.0.0.1:*; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'"
        X-Frame-Options "DENY"
        X-Content-Type-Options "nosniff"
        Referrer-Policy "no-referrer"
        Permissions-Policy "camera=(self), geolocation=(), microphone=(), payment=(), usb=()"
        Strict-Transport-Security "max-age=31536000; includeSubDomains"
        Cross-Origin-Opener-Policy "same-origin"
        Cross-Origin-Resource-Policy "same-origin"
    }

    @immutable path /assets/* /ocr/*
    header @immutable Cache-Control "public, max-age=31536000, immutable"
    header /index.html Cache-Control "no-cache"
    header /sw.js Cache-Control "no-cache"
}
```

## Netlify / Cloudflare Pages

Create `apps/web/public/_headers`:

```
/*
  Content-Security-Policy: default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; font-src 'self'; worker-src 'self' blob:; child-src 'self' blob:; manifest-src 'self'; connect-src 'self' blob: data: https: http://localhost:* http://127.0.0.1:*; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'
  X-Frame-Options: DENY
  X-Content-Type-Options: nosniff
  Referrer-Policy: no-referrer
  Permissions-Policy: camera=(self), geolocation=(), microphone=()
  Strict-Transport-Security: max-age=31536000; includeSubDomains

/assets/*
  Cache-Control: public, max-age=31536000, immutable

/ocr/*
  Cache-Control: public, max-age=31536000, immutable
```

Build command `pnpm build`, publish directory `apps/web/dist`.

## A note on `connect-src`

The CSP allows `https:` broadly. That is not laziness — BYOK means the user picks
the endpoint, and it cannot be enumerated at build time. It is still narrowed so
that plaintext HTTP reaches loopback only, and the app's own endpoint policy
refuses anything else at runtime.

If you are deploying for a fixed setup (say, only a local Ollama), tighten it:

```
connect-src 'self' blob: data: http://localhost:11434;
```

## Self-hosting for one person

You do not need a domain. The app runs from any static server on your LAN, or
straight off disk via a local server:

```bash
pnpm --filter @betapouch/web preview   # http://127.0.0.1:4173
```

Bear in mind that browser storage is per-origin: moving the app to a different
host means a fresh, empty vault. Export an encrypted backup first.

## Storage durability

The app asks for persistent storage on unlock. Without that grant, a browser
under storage pressure may evict IndexedDB — and there is no server copy to
restore from. Take encrypted backups. This matters more than usual precisely
because the design has nowhere else to keep your data.

## Mobile

```bash
cd apps/mobile
npx expo run:ios          # or: npx expo run:android
```

**Expo Go will not work.** The app needs a native crypto module; see
[ARCHITECTURE.md](ARCHITECTURE.md#mobile-needs-a-development-build). For store
builds use EAS or a local release build. `app.json` already blocks the location
and microphone permissions and declares the camera and photo-library usage
strings.
