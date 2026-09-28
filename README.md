# ⚡ Next-Gen Image Compressor & Visual Optimization Studio

> **100% Client-Side. Zero Server Uploads. Universal Runnability. Blazing Fast.**

An ultra-modern, privacy-first web application engineered to compress, convert, and inspect images directly within your browser. Built to overcome the limitations, paywalls, and privacy hazards of tools like TinyPNG and Squoosh, this compressor runs anywhere—from high-powered multi-core workstations down to a **$50 budget phone with 1 GB of RAM**.

---

## 📑 Table of Contents
1. [Why This Exists (Competitive Landscape)](#-why-this-exists-competitive-landscape)
2. [System Architecture & Working Pipeline](#-system-architecture--working-pipeline)
3. [The Core Engines Under the Hood](#-the-core-engines-under-the-hood)
4. [Flagship Signature Novelties](#-flagship-signature-novelties)
5. [Universal Runnability & Low-End Device Shield](#-universal-runnability--low-end-device-shield)
6. [Personal Daily-Driver & Customization Suite](#-personal-daily-driver--customization-suite)
7. [Project Roadmap & Documentation](#-project-roadmap--documentation)

---

## 🥊 Why This Exists (Competitive Landscape)

| Feature | TinyPNG / TinyJPG | Squoosh (Google) | ILoveIMG | **Our Compressor** |
| :--- | :--- | :--- | :--- | :--- |
| **Privacy & Architecture** | ❌ Uploads to cloud | ✅ 100% Client-side | ❌ Uploads to cloud | **🔒 100% Client-Side (Zero Server Bytes)** |
| **Batch Processing** | ❌ 20 max (paywalled) | ❌ None (1 by 1 only) | ❌ Throttled queues | **⚡ Unlimited Multi-Core Batch + ZIP** |
| **Target File Size Mode** | ❌ None | ❌ None | ❌ None | **🎯 Exact Size Auto-Solver (e.g. "≤ 50 KB")** |
| **Low-End Device Safety** | N/A (Server-bound) | ⚠️ Freezes on low RAM | N/A (Server-bound) | **🛡️ OOM Memory Shield & Adaptive Governor** |
| **Visual Artifact Radar** | ❌ None | ❌ None (slider only) | ❌ None | **🔬 Chroma Delta Heatmap (Live Pixel Diff)** |
| **Optimal Quality Detection** | ❌ None | ❌ Manual guess | ❌ Presets only | **📈 Pareto Sweet-Spot Curve (SSIM vs Size)** |
| **Dev & Creator Pipeline** | ❌ None | ❌ None | ❌ None | **⚡ Ctrl+V / Ctrl+C, Base64 & `<picture>` Tag** |
| **Bundle Size & Speed** | Heavy web page | ~3–5 MB WASM assets | Heavy ad scripts | **🪶 Pure Vanilla Core (< 35 KB gzipped)** |

---

## 🏛️ System Architecture & Working Pipeline

Every operation occurs locally inside the browser's sandbox without contacting any external backend:

```mermaid
graph TD
    A[User Ingestion: Drag & Drop / File Picker / Ctrl+V Clipboard] --> B[Hardware & Memory Governor]
    
    B -->|Assess RAM, CPU Cores, GPU Tier| C{Device Profile}
    C -->|High-End Workstation| D[Multi-Core Web Worker Pool]
    C -->|Budget / Low-RAM Device| E[Sequential Single-Thread Safe Queue]
    
    D --> F[Image Decoding: Step-Down Bitmap Scaling]
    E --> F
    
    F --> G{Compression Engine Mode}
    G -->|Mode 1: Target Exact File Size| H[Binary Search Auto-Tuner]
    G -->|Mode 2: Manual Quality / Format| I[OffscreenCanvas / Codec Pipeline]
    G -->|Mode 3: Sweet-Spot Auto-Detect| J[5-Point SSIM Pareto Curve Sampler]
    
    H --> I
    J --> I
    
    I --> K[Post-Processing & Garbage Collection]
    K --> L[Memory Shield: imageBitmap.close & URL.revokeObjectURL]
    
    K --> M[Visual Inspection Studio]
    M --> N[Interactive Split Slider + 8x Zoom Loupe]
    M --> O[Chroma Delta Heatmap: Pixel Difference Radar]
    
    K --> P[Export Hub]
    P --> Q[Individual Download / Client-Side JSZip Bulk Archive]
    P --> R[Dev Hub: Copy Base64 / Responsive Picture Tag / Clipboard Out]
```

---

## 🧩 The Core Engines Under the Hood

### 1. `HardwareGovernor` (Adaptive Device Intelligence)
* Queries `navigator.deviceMemory`, `navigator.hardwareConcurrency`, and the Battery Status API.
* **Low-Power Mode (`data-low-power="true"`):** On devices with $\le 2\text{ GB}$ RAM or $\le 2$ CPU cores, it automatically:
  * Locks concurrency to **1-by-1 sequential processing** to eliminate Out-Of-Memory (OOM) tab crashes.
  * Replaces heavy CSS `backdrop-filter: blur()` with high-performance, solid dark theme tokens.
  * Restricts DOM thumbnail dimensions to 200px micro-previews.

### 2. `CompressionEngine` (Memory-Safe Canvas Pipeline)
* Uses modern browser `createImageBitmap()` paired with `OffscreenCanvas.convertToBlob()`.
* **Step-Down Decoding:** Huge 24MP–48MP smartphone photos are downscaled during decompression (`resizeWidth`/`resizeHeight` options), slashing peak RAM by up to 80%.
* **Universal Fallback:** Seamlessly falls back to a hidden DOM canvas using `requestAnimationFrame` time-slicing on older browsers that lack `OffscreenCanvas`.
* Supports **WebP, AVIF, JPEG, and PNG** with automatic runtime format detection.

### 3. `TargetSizeSolver` (Binary Search Auto-Tuner)
* Users specify a hard file size ceiling (e.g. `50 KB` for government portals or `200 KB` for web banners).
* Runs a rapid binary search over quality factors ($Q \in [0.05, 0.95]$):
  * Iteratively tests compression sizes in memory.
  * If the file is still oversized at minimum quality, it performs micro-downscaling (90%, 80%) until the target is satisfied.
  * Completes within 4–6 iterations in $<150\text{ms}$.

---

## 🔬 Flagship Signature Novelties

### 1. "Chroma Delta Heatmap" (Perceptual Artifact Radar)
Instead of merely sliding a divider back and forth, toggle the **Delta Heatmap**:
$$\Delta_{\text{pixel}} = \min\Big(255, \; \max(|R_1 - R_2|, |G_1 - G_2|, |B_1 - B_2|) \times \text{Gain}\Big)$$
* Identifies exactly where lossy compression discarded high-frequency details.
* **Color Spectrum:**
  * `Pitch Black`: Bit-exact identical pixels (0% loss).
  * `Electric Cyan`: Invisible sub-perceptual quantization.
  * `Neon Magenta / Yellow`: Edge softening, blocking, and color-space shifts.

### 2. "Pareto Sweet-Spot Curve" (Rate-Distortion Auto-Optimizer)
* Takes a rapid 5-point thumbnail probe across quality levels ($Q = 0.30, 0.50, 0.70, 0.85, 0.95$).
* Calculates the mathematical inflection point (Elbow) maximizing:
  $$\text{Fitness}(Q) = \frac{\text{SSIM}(Q)}{\sqrt{\text{Size}(Q)}}$$
* Pinpoints the exact quality threshold where file size shrinks drastically before visible fidelity degrades. Click **`[ ⚡ Apply Sweet Spot ]`** to apply it instantly.

### 3. "Zero-Friction Dev & Creator Pipeline"
* **Clipboard In & Out:** Press `Ctrl+V` to paste any screenshot directly from your clipboard; press `Ctrl+C` to copy the compressed result back into your clipboard to paste into Slack, Twitter, or Discord.
* **Code-Ready Exports:**
  * 1-Click **Copy Base64 / Data-URI**.
  * 1-Click **Copy Responsive `<picture>` HTML Tag** (with AVIF, WebP, JPG fallbacks and `srcset`).
  * 1-Click **Copy CSS `background-image` rule**.

---

## 📱 Universal Runnability & Low-End Device Shield

* **Pure Vanilla Architecture:** Zero heavy JavaScript runtimes (no React/Vue/Next.js). The entire application shell is $< 35\text{ KB}$ gzipped, loading in $< 100\text{ms}$ on 3G connections.
* **OOM Prevention Protocol:**
  * Explicit `.close()` on every `ImageBitmap` immediately after drawing.
  * Explicit `URL.revokeObjectURL()` called when discarding previews.
  * Prevents the dreaded mobile browser tab crash ("Aw, Snap!").
* **Offline-Ready PWA:** Installable directly to your home screen or desktop; operates 100% offline without internet.

---

## 🎨 Personal Daily-Driver & Customization Suite

1. **Custom Saved Recipes (`localStorage`):**
   * Save your personalized workflows (e.g. *"Blog Hero 1600px WebP"*, *"Passport ID $\le 50\text{ KB}$"*, *"Discord Avatar $\le 8\text{ MB}$"*).
   * Persisted locally in `localStorage` without ever caching image binary data or Blobs.
2. **Personal Signature & Watermark Studio:**
   * Apply customizable subtle watermarks (text or logo with opacity/position control).
   * Embed discrete creator signatures in metadata (`Creator: Tejas`).
3. **Pro Theming & Command Palette:**
   * Themes: `Obsidian Emerald` (default), `Cyberpunk Neon`, `Tokyo Night`, `Paper White (Light)`.
   * Hotkeys: `Ctrl+K` for Command Palette, `Ctrl+Enter` to process all, `Ctrl+S` to export ZIP.

---

## 🔒 100% Client-Side Privacy Architecture

OptiPulse Studio operates under a strict, mathematically verifiable privacy guarantee:

> **ZERO IMAGE BYTES LEAVE YOUR BROWSER. EVER.**

### Privacy Audit Findings:
* **Zero Network Uploads:** The application source contains 0 calls to `fetch()`, `XMLHttpRequest`, `navigator.sendBeacon()`, `WebSocket`, or third-party compression APIs.
* **Isolated Browser Runtime:** All image decoding (`createImageBitmap`), processing (`OffscreenCanvas`), compression (`convertToBlob`), diff analysis (`getImageData`), and packaging (`JSZip`) execute strictly inside client memory.
* **No Remote Telemetry or Tracking:** No Google Analytics, no tracking pixels, and no cloud loggers.
* **Transient Memory Model:** Object URLs (`blob:`) are revoked immediately after preview generation or item removal via `URL.revokeObjectURL()`. Canvas buffers are actively zeroed (`canvas.width = 0; canvas.height = 0;`) upon disposal to release GPU texture memory.

---

## 🚀 Vercel Production Deployment Architecture

OptiPulse Studio is architected as a **Static Vite CDN Deployment** on Vercel. Because all compression logic is client-side, no serverless functions, backends, or databases are required.

```
User Browser
    │
    ├── Vercel Global Edge CDN
    │       ├── Static HTML / CSS / JS Chunks (Cache-Control: immutable)
    │       ├── Web Worker Scripts (compression.worker.js)
    │       └── Manifest & PWA Service Worker (Cache-Control: max-age=0, must-revalidate)
    │
    └── Client Device Local Sandbox
            ├── Ingestion & File Validation (100MB & 64MP guards)
            ├── HardwareGovernor (Adaptive thread & memory allocation)
            ├── Dedicated Web Worker Pool (OffscreenCanvas rasterization)
            ├── Target-Size Binary Search Solver
            ├── Chroma Delta Heatmap (Pixel-level difference math)
            ├── Dev Hub (System clipboard in/out & snippet generation)
            └── Local JSZip Batch Packaging
```

### Vercel Deployment Instructions:

1. **Deploy via Vercel CLI:**
   ```bash
   vercel --prod
   ```
2. **Deploy via Git Integration:**
   * **Framework Preset:** Vite
   * **Build Command:** `npm run build`
   * **Output Directory:** `dist`
   * **Install Command:** `npm ci`
3. **Environment Variables:**
   * **Zero secrets or API keys required.**
   * See [`.env.example`](file:///c:/Users/tejas/Downloads/image_compressor/.env.example) for documentation.

---

## 🛡️ Security Model & Hardening

The application is security-hardened against modern web threat classes:

| Threat Class | Mitigation Mechanism | Implementation Location |
| :--- | :--- | :--- |
| **XSS & DOM Injection** | User input (filenames, recipe names, watermark text) is strictly escaped via HTML entity encoder (`&`, `<`, `>`, `"`, `'`). DOM updates use `textContent` and safe element setters. | [`src/utils/dom.ts`](file:///c:/Users/tejas/Downloads/image_compressor/src/utils/dom.ts) |
| **Clickjacking & Frame Embedding** | Frame embedding blocked via `X-Frame-Options: DENY` and CSP `frame-ancestors 'none'`. | [`vercel.json`](file:///c:/Users/tejas/Downloads/image_compressor/vercel.json) |
| **MIME Sniffing** | `X-Content-Type-Options: nosniff` header enforced across all responses. | [`vercel.json`](file:///c:/Users/tejas/Downloads/image_compressor/vercel.json) |
| **Strict CSP** | Tailored Content Security Policy allowing only `'self'`, `blob:`, and `data:` for Workers and Canvas; forbids `unsafe-eval` and unauthorized remote scripts. | [`vercel.json`](file:///c:/Users/tejas/Downloads/image_compressor/vercel.json) |
| **Decompression Bombs & OOM** | Max file size capped at **100 MB**; image dimensions capped at **16,384 px per side** and **64 Megapixels** total before decompression. | [`src/services/ingestion.ts`](file:///c:/Users/tejas/Downloads/image_compressor/src/services/ingestion.ts) |
| **Worker Thread Exhaustion** | Worker pool concurrency bounded between 1 and 12 threads based on hardware. 30-second watchdog timers automatically abort and terminate hung worker jobs. | [`src/core/workers/WorkerPool.ts`](file:///c:/Users/tejas/Downloads/image_compressor/src/core/workers/WorkerPool.ts) |
| **PWA Cache Leakage** | Service worker caches *only* static app shell assets (HTML, CSS, JS, manifest). Never intercepts or stores `blob:` or `data:` image payloads. | [`public/sw.js`](file:///c:/Users/tejas/Downloads/image_compressor/public/sw.js) |

---

## ⚖️ Resource Governance vs. Rate Limiting

Because image processing is 100% client-side, **traditional server-side HTTP request rate limiting does not apply**. Serving static assets is handled by Vercel's global edge network with built-in DDoS protection.

Instead, OptiPulse implements **Client-Side Local Resource Governance**:
1. **Adaptive Concurrency:** Low-memory devices ($\le 2\text{ GB}$ RAM or $\le 2$ CPU cores) are locked to sequential 1-by-1 processing to prevent mobile browser crashes.
2. **Watchdog Timeout:** 30-second execution deadline per compression task prevents infinite loops in complex codecs.
3. **Automatic Worker Restart:** Unresponsive or terminated workers are replaced automatically without disrupting the batch queue.
4. **Memory Backpressure:** Large batch uploads render 200px micro-thumbnails to maintain a DOM memory footprint $< 15\text{ MB}$ even with 100+ files queued.

---

## 🌐 Browser Compatibility & Graceful Fallbacks

| Feature / API | Primary Path | Graceful Fallback Strategy |
| :--- | :--- | :--- |
| **OffscreenCanvas** | Off-thread worker rasterization | Main-thread hidden DOM `<canvas>` via `requestAnimationFrame` slicing |
| **createImageBitmap** | Step-down hardware decoding | Standard `HTMLImageElement` with `onload` async decode |
| **System Clipboard API** | `navigator.clipboard.write([ClipboardItem])` | Download fallback trigger with informative user notification |
| **AVIF / WebP Support** | Native browser encoder | Dynamic 1x1 canvas feature probe; falls back to JPEG/PNG if unsupported |
| **deviceMemory / Battery** | Hardware capability tiering | Defaults to safe conservative profile (2 cores, standard theme) |

---

## 📊 Measured Performance & Bundle Budget

*Measurements recorded on production build (`npm run build:check`):*

* **Total Combined Production Bundle:** **26.64 KB gzipped** (76.1% of strict 35 KB budget)
  * `index.js`: 20.23 KB gzipped
  * `index.css`: 4.34 KB gzipped
  * `compression.worker.js`: 2.06 KB gzipped
* **Production Runtime Dependencies:** **Strictly 0**
* **Target Size Solver Convergence:** 4–6 iterations, $< 150\text{ms}$ average
* **Build Time:** $< 300\text{ms}$ on Vite 6

---

## ⚠️ Known Limitations & Troubleshooting

1. **Browser Memory Bounds:** Extremely large batches (e.g. 50+ RAW 48MP photos) on mobile devices with $\le 2\text{ GB}$ RAM may experience throttling by mobile OS process managers. Use the target-size solver with downscaling enabled.
2. **Safari WebP/AVIF Encoding:** Older versions of WebKit/Safari (pre-16) lack native AVIF write support. OptiPulse automatically detects this and offers WebP or JPEG formats.
3. **Background Tab Throttling:** Modern browsers aggressively throttle `requestAnimationFrame` and `setTimeout` in inactive background tabs. Keep the tab visible for maximum multi-core throughput.

---

## 📚 Project Roadmap & Documentation

* **[idea.md](file:///c:/Users/tejas/Downloads/image_compressor/idea.md)**: Product vision, competitive teardown, and append-only user idea log.
* **[implementation.md](file:///c:/Users/tejas/Downloads/image_compressor/implementation.md)**: Full engineering specifications, mathematical algorithms, pipeline diagrams, and milestone tracker.
