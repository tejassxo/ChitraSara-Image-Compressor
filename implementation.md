# 🛠️ Implementation Blueprint: Next-Gen Image Compressor

> **Anchor Principle:** All implementation details must directly serve the vision outlined in [idea.md](file:///c:/Users/tejas/Downloads/image_compressor/idea.md). Refactor continuously to keep the architecture lean, performant, and tightly bound to the core original mission (100% client-side privacy, blazing speed, smart batching, target file size mode, universal low-end runnability, and signature novelties).

---

## 🏛️ 1. Architectural Guardrails & Principles

1. **Zero-Server Guarantee:** 100% of processing happens in the browser memory via `OffscreenCanvas`, modern Web APIs, and Web Workers. No image bytes are ever transmitted over the network.
2. **Universal Low-End Device Runnability & OOM Shield:**
   * Runs fluidly on devices with $\le 1\text{ GB}$ RAM (budget Android Go, older iPads, low-tier laptops) without crashing the browser tab.
   * Total core bundle size $< 35\text{ KB}$ gzipped (pure zero-dependency Vanilla ES6 + CSS3).
   * Zero memory leaks: every `ImageBitmap` is explicitly closed (`.close()`), every object URL is revoked (`URL.revokeObjectURL()`), and previews use lightweight micro-thumbnails.
3. **Non-Blocking Main Thread:** Heavy compression calculations, quantization, and binary search iterations run inside a dedicated Web Worker pool (or `requestAnimationFrame` sliced fallback on legacy browsers).
4. **Graceful Degenerative Fallbacks:**
   * If `OffscreenCanvas` is not supported (older Safari/legacy webviews), fallback automatically to hidden DOM canvas without breaking.
   * If `backdrop-filter` is unsupported or device is low-power, fallback seamlessly to clean solid/translucent CSS tokens.
5. **Clean, Modular Codebase:** Separated into independent services:
   * `HardwareGovernor` (Detects RAM, CPU cores, battery status; toggles low-power safety)
   * `CompressionEngine` (Canvas + OffscreenCanvas + Wasm)
   * `WorkerPool` (Adaptive queue dispatcher: 1 thread for low-end, multi-core for high-end)
   * `TargetSizeSolver` (Binary search auto-tuner)
   * `DeltaHeatmapService` (Real-time pixel difference shader/canvas engine)
   * `SweetSpotOptimizer` (Rate-distortion / SSIM Pareto curve sampler)
   * `DevExportService` (Clipboard API, Base64, responsive `<picture>` generator)
   * `ProfileService` (Local storage recipes & workspace presets)
   * `ZipExportService` (JSZip zero-server batch archive)

---

## 🧰 2. Technology Stack

* **Build Tool:** Vite (Ultra-fast HMR and lean production bundling).
* **Core Logic:** Pure Vanilla ESNext JavaScript / TypeScript + Web Workers + `OffscreenCanvas`. Zero heavy framework overhead (no React/Vue runtime bloat).
* **Compression Pipeline:**
  * Native browser `createImageBitmap()` + `OffscreenCanvas.convertToBlob()` / `canvas.toBlob()`.
  * Step-down decoding (`resizeWidth` option in `createImageBitmap`) to avoid 100MB+ RAM spikes on massive camera photos.
* **Metrics & Diff:** Canvas `getImageData` pixel-level RGB delta math + fast SSIM/PSNR approximation.
* **Archive & Packaging:** `JSZip` + streaming blob save (in-browser zero-server zip generation).
* **UI & Styling:** Vanilla CSS with custom tokens (glassmorphism with flat fallbacks, CSS containment `contain: content`, GPU transforms, fluid responsive layout).

---

## 🧩 3. Core Engine Pipelines

### Pipeline A: Fast Quality Compression
```
Input File (Blob) 
  --> Memory Check & Downscale Guard (if image > 4K on low-end device)
  --> createImageBitmap(blob, { resizeWidth, resizeHeight })
  --> Worker Pool Task Dispatch
  --> OffscreenCanvas Draw & Convert
  --> convertToBlob({ type: outputFormat, quality: q })
  --> Explicit imageBitmap.close()
  --> Return Compressed Blob + Stats (Old Size, New Size, Ratio, Latency)
```

### Pipeline B: "Target File Size" Binary Search Solver
```
Target Limit: T bytes (e.g. 100 KB) with tolerance ε (e.g. ±3%)
Step 1: Set Q_low = 0.05, Q_high = 0.95
Step 2: While iterations < max_iterations:
          Q_mid = (Q_low + Q_high) / 2
          Blob_test = Compress(Q_mid, CurrentScale)
          If Size(Blob_test) <= T and Size >= T * (1 - ε):
              Found optimal solution! Break.
          Else If Size(Blob_test) > T:
              Q_high = Q_mid - 0.05
          Else:
              Q_low = Q_mid + 0.05
Step 3: If Q reaches minimum and Size > T:
          Downscale dimensions slightly (e.g. 90%, 80%) and repeat.
```

### Pipeline C: Split-Screen Visual Diff & Magnifying Loupe
* Overlay of two canvas/image elements clipped by an interactive slider coordinate `X`.
* Pointer tracking over preview activates a magnified loupe (200%–800% zoom) showing original vs. compressed pixels side-by-side.

### Pipeline D: Adaptive Batch Queue & Worker Farm
* Query `HardwareGovernor`:
  * If `deviceMemory <= 2` OR `hardwareConcurrency <= 2`: Set Concurrency = 1 (Sequential safe mode).
  * Else: Set Concurrency = `Math.min(navigator.hardwareConcurrency || 4, 8)`.
* Job Queue distributes images.
* Previews use low-res 200px micro-thumbnails to keep DOM memory footprint $< 15\text{ MB}$ even with 100+ images in queue.
* Bulk action triggers client-side ZIP stream via `JSZip`.

### Pipeline E: Adaptive Hardware & Low-Power Governor
```
Input: System Hardware Metrics
1. Inspect navigator.deviceMemory (GB) and navigator.hardwareConcurrency (Cores).
2. Check battery status API (if discharging & battery < 20% -> force LowPowerMode).
3. If LowPowerMode:
   - Disable CSS backdrop-filter blur (use solid theme surface tokens).
   - Cap max parallel jobs to 1.
   - Restrict max preview loupe zoom to 4x.
   - Disable animated gradient background loops.
4. If HighCapabilityMode:
   - Full glassmorphism, 8x loupe, multi-core worker distribution.
```

---

## 🔬 4. Signature Novelty Pipelines

### Novelty Pipeline 1: "Chroma Delta Heatmap" (Perceptual Artifact Radar)
```
Input: Original ImageData (O), Compressed ImageData (C)
1. Iterate over pixels (i = 0; i < length; i += 4):
     ΔR = |O[i]   - C[i]|
     ΔG = |O[i+1] - C[i+1]|
     ΔB = |O[i+2] - C[i+2]|
     ΔMax = max(ΔR, ΔG, ΔB)
2. Amplify difference signal: Intensity = min(255, ΔMax * Gain)  [Gain = 5x to 20x]
3. Map Intensity to false-color Heatmap Palette:
     - 0: Transparent / Pitch Black (Identical pixels)
     - 1-60: Deep Cyan / Blue (Sub-perceptual quantization)
     - 61-150: Vivid Emerald / Yellow (Moderate edge/texture softening)
     - 151-255: Neon Magenta / Hot Pink (Significant blocking / color shift)
4. Render to overlay canvas with opacity blend slider.
```

### Novelty Pipeline 2: "Pareto Sweet-Spot Curve" (Rate-Distortion Auto-Optimizer)
```
Input: Image ImageBitmap
1. Worker runs 5 rapid micro-samples at thumbnail resolution (width: 320px):
     Sample Qualities: Q = [0.30, 0.50, 0.70, 0.85, 0.95]
2. Compute Size(Q) and SSIM(Original, Compressed_Q).
3. Plot live curve: X-axis = File Size (KB), Y-axis = SSIM (0 to 1.0).
4. Identify Inflection Point (Elbow):
     Maximize: Fitness(Q) = SSIM(Q) / sqrt(Size(Q))
5. Mark "Golden Sweet Spot" badge on curve; 1-click applies Q* to high-res engine.
```

### Novelty Pipeline 3: Zero-Friction Dev/Creator Pipeline
* **Clipboard Sync:**
  * `paste` listener on `window`: Automatically parses `e.clipboardData.items` for image files and feeds into compression pipeline instantly.
  * 1-Click **"Copy Image to Clipboard"**: Calls `navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })])`.
* **Code-Ready Generators:**
  * **Base64 / Data-URI:** Generates ready-to-use `data:image/...;base64,...` with character count and encoded size.
  * **Responsive `<picture>` Markup:** Outputs clean semantic HTML with AVIF, WebP, and JPG fallbacks + `srcset`.

---

## 🎨 5. Personalization & Customization Suite

### 1. Custom Recipes & Profile Schema (Saved in `localStorage`)
```typescript
interface UserRecipe {
  id: string;
  name: string;
  isDefault: boolean;
  mode: 'targetSize' | 'quality' | 'lossless';
  targetSizeKB?: number;
  quality?: number; // 0.05 to 1.0
  format: 'original' | 'webp' | 'avif' | 'jpeg' | 'png';
  maxWidth?: number;
  maxHeight?: number;
  stripMetadata: boolean;
  watermark?: {
    enabled: boolean;
    text?: string;
    opacity: number;
    position: 'bottom-right' | 'bottom-left' | 'center' | 'top-right';
  };
  customExifTag?: string; // e.g. "Creator: Tejas"
}
```

### 2. Multi-Theme Engine & Adaptive UI
* Dynamic CSS Variables toggled via `data-theme`:
  * `obsidian`: Deep space dark with emerald/cyan neon accents.
  * `cyberpunk`: Electric violet & radiant yellow accents.
  * `tokyo-night`: Sleek indigo, slate blue, and pastel pink.
  * `paper-white`: Clean high-contrast monochrome light theme.
* **Low-Power Mode Toggle (`data-low-power="true"`):** Removes all heavy blur filters and animations for instantaneous 60fps rendering on budget GPUs.
* Command Palette (`Ctrl+K` / `Cmd+K`): Instant keyboard search for recipes, batch actions, theme switches, and settings.

---

## 📅 6. Phased Implementation Milestones

- [ ] **Milestone 1: Zero-Bloat Vanilla Setup & Adaptive Hardware Governor**
  - Ultra-lightweight Vite project setup with pure Vanilla JS/CSS (no heavy framework overhead).
  - Implement `HardwareGovernor` (`navigator.deviceMemory`, core count, low-power mode detector).
  - Implement CSS design tokens with hardware-accelerated transforms and glassmorphism/flat fallback.
- [ ] **Milestone 2: Memory-Safe Compression Core & Worker Farm**
  - Web Worker engine using `OffscreenCanvas` with automatic hidden DOM canvas fallback.
  - Step-down bitmap decoding (`createImageBitmap` scaling) and aggressive memory garbage cleanup (`.close()`, `revokeObjectURL()`).
  - Format converters (WebP, AVIF, JPEG, PNG) and real-time statistics.
- [ ] **Milestone 3: Target File Size Binary Search Solver**
  - Auto-tuner to hit target file sizes (e.g. $\le 50\text{ KB}$, $\le 200\text{ KB}$) within 5 iterations.
- [ ] **Milestone 4: Memory-Efficient Batch Queue & Streaming Zip**
  - Adaptive batch queue (1-at-a-time on low-RAM, multi-threaded on desktop).
  - Low-memory 200px micro-thumbnail UI list.
  - Client-side zero-server ZIP creation via `JSZip`.
- [ ] **Milestone 5: Flagship Novelties (Chroma Delta Heatmap & Split Loupe)**
  - Split-slider comparison viewer with 200%–800% magnifying loupe.
  - Real-time Perceptual Delta Heatmap canvas shader to visualize compression artifacts.
- [ ] **Milestone 6: Pareto Sweet-Spot Analyzer & Dev Export Suite**
  - Fast 5-point SSIM sampler plotting the Rate-Distortion curve with "Apply Sweet Spot" button.
  - Clipboard copy-out, Base64 generator, and responsive `<picture>` code exporter.
- [ ] **Milestone 7: Custom Recipes, Watermark Studio & Offline PWA**
  - LocalStorage recipe manager, custom EXIF/watermark tool, PWA offline manifest + Service Worker (<30KB footprint).

---

## 🔄 7. Refactoring & Alignment Log
*(Check this section whenever making architectural updates to verify alignment with idea.md)*

* **[2026-09-22]:** Initial architecture drafted (Client-side, privacy-first, target size solver, batch queue).
* **[2026-09-22]:** Expanded with Flagship Novelties (Chroma Delta Heatmap, Pareto Sweet-Spot Optimizer, Dev Export Suite) and Personal Customizability (Saved Recipes, Theme Engine, Command Palette).
* **[2026-09-22]:** Added Universal Runnability & Low-End Device Architecture: Zero-bloat Vanilla JS/CSS (<35KB gzipped), Adaptive Hardware & Memory Governor to eliminate OOM crashes on low-RAM devices, Step-Down Bitmap decoding, and CSS Low-Power GPU fallbacks.
