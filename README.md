# Inkform — AI Image Generation Studio

<p align="center">
  <img src="assets/images/icon.png" width="120" alt="Inkform icon" />
</p>

<p align="center">
  A professional AI image generation mobile app built with <strong>React Native</strong> and <strong>Expo SDK 54</strong>.<br/>
  Generate, upscale, and manage AI-created images from multiple providers — all from your phone.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Expo-54-000020?logo=expo" alt="Expo 54" />
  <img src="https://img.shields.io/badge/React_Native-0.81-61DAFB?logo=react" alt="React Native" />
  <img src="https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript" alt="TypeScript" />
  <img src="https://img.shields.io/badge/NativeWind-4-38BDF8?logo=tailwindcss" alt="NativeWind" />
  <img src="https://img.shields.io/github/actions/workflow/status/xoneabovex/inkform/ci.yml?label=CI" alt="CI" />
</p>

---

## Features

### Studio (Generate Tab)
- **Multi-provider generation** — Replicate (FLUX.2 Max/Pro/Dev/Klein, FLUX.1 Schnell, FLUX 1.1 Pro), Google (Imagen 4, Imagen 4 Ultra, Imagen 4 Fast, Imagen 3, Gemini Flash Image, Gemini Pro Image, Gemini 2.5 Flash Image), and custom RunPod endpoints
- **Batch generation** — generate up to 4 images simultaneously with parallel predictions
- **Advanced parameters** — CFG scale, steps, seed, sampling method (Euler, DPM++ 2M Karras, DDIM, LCM, and more), CLIP skip, VAE selector, Hi-Res Fix
- **LoRA support** — load multiple LoRAs from Civitai with individual weight sliders and trigger word display
- **Image-to-image** — upload a reference image with adjustable denoising strength
- **Negative prompt presets** — insertable templates (SDXL Quality, Anime Clean, Photorealistic, etc.)
- **Quality boost** — one-tap toggle that appends a detail-enhancing prompt suffix
- **Advanced settings BottomSheet** — swipeable panel for parameters that don't need to be always visible
- **Batch progress bar** — real-time save progress indicator for multi-image runs

### Gallery
- **Persistent local storage** — images downloaded to device filesystem at generation time; never expire
- **500-image cap** — oldest images auto-deleted when limit is reached (favorites are protected)
- **Fullscreen viewer** — pinch-to-zoom, double-tap zoom, pan, and swipe left/right to browse
- **Favorites** — heart any image to protect it from auto-cleanup; filter to view favorites only
- **Collections** — create named collections and organise images into them
- **Metadata view** — see the full prompt, model, parameters, and generation date for every image
- **Reuse settings** — tap any gallery image to pre-fill the Studio with its exact prompt and parameters
- **Save to Camera Roll** — works from every save button across the app (gallery, fullscreen viewer, generate results)
- **Share** — share any image via the system share sheet

### Upscale
- **Real-ESRGAN** — 2× and 4× AI upscaling via Replicate
- **GFPGAN** — face restoration and enhancement
- Save upscaled result directly to Camera Roll

### Prompts
- **History** — last 50 prompts saved automatically; tap to reuse
- **Bookmarks** — save favourite prompts for quick access

### Settings
- **Theme** — Dark / Light / System toggle (Cinematic Blue palette: grey+blue dark mode, clean light mode)
- **API keys** — secure storage for Replicate, Google AI, and RunPod credentials
- **Provider configuration** — RunPod endpoint URL and model selection

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | React Native 0.81 + Expo SDK 54 |
| Language | TypeScript 5.9 |
| Navigation | Expo Router 6 (file-based) |
| Styling | NativeWind 4 (Tailwind CSS) |
| State | React `useReducer` + Context |
| Storage | Expo FileSystem + AsyncStorage |
| Animations | React Native Reanimated 4 + Gesture Handler |
| Testing | Vitest |
| CI | GitHub Actions |

---

## Getting Started

### Prerequisites

- [Node.js 20+](https://nodejs.org/)
- [pnpm 9+](https://pnpm.io/) — `npm install -g pnpm`
- [Expo Go](https://expo.dev/go) on your iOS or Android device (for live preview)

### Installation

```bash
git clone https://github.com/xoneabovex/inkform.git
cd inkform
pnpm install
```

### Running the App

```bash
pnpm dev
```

This starts the Metro bundler. Scan the QR code with Expo Go on your device, or press `w` to open in a web browser.

### Running Tests

```bash
pnpm test
```

---

## API Keys

Inkform connects to external AI providers. You will need at least one of the following:

| Provider | Where to get it | Required for |
|---|---|---|
| **Replicate** | [replicate.com/account/api-tokens](https://replicate.com/account/api-tokens) | FLUX models |
| **Google AI** | [aistudio.google.com/apikey](https://aistudio.google.com/apikey) | Imagen 3/4, Gemini Image models |
| **RunPod** | [runpod.io/console/user/settings](https://www.runpod.io/console/user/settings) | Custom RunPod endpoint (optional) |

Enter your keys in the **Settings** tab of the app. Keys are stored securely on-device using Expo SecureStore and are never transmitted anywhere other than the respective provider APIs.

---

## RunPod Worker (Optional)

If you want to run your own Stable Diffusion models via RunPod, a ready-made serverless worker is included.

```
runpod-worker/
  handler.py       ← Serverless handler (SD 1.5, Pony, Illustrious, NoobAI, FLUX)
  Dockerfile       ← Container definition
  requirements.txt ← Python dependencies
  README.md        ← Deployment instructions
```

See `runpod-worker/README.md` for full deployment instructions.

---

## Project Structure

```
app/
  (tabs)/
    index.tsx        ← Studio / Generate screen
    gallery.tsx      ← Gallery screen
    upscale.tsx      ← Upscale screen
    prompts.tsx      ← Prompt history & bookmarks
    settings.tsx     ← Settings screen
components/
  features/
    fullscreen-viewer.tsx  ← Shared fullscreen image viewer
  ui/
    bottom-sheet.tsx       ← Swipeable bottom sheet
    icon-symbol.tsx        ← SF Symbols → Material Icons mapping
  screen-container.tsx     ← SafeArea wrapper
lib/
  api/
    generate.ts            ← Provider routing
    replicate.ts           ← Replicate API
    google-imagen.ts       ← Google Imagen / Gemini Image API
    runpod.ts              ← RunPod serverless API
    civitai.ts             ← Civitai model/LoRA metadata
  storage/
    app-storage.ts         ← Gallery persistence, saveToDeviceGallery
  types/
    index.ts               ← Shared TypeScript types and model catalog
```

---

## Contributing

This is a personal project. If you fork it and make improvements, feel free to open a pull request.

---

## License

Private — all rights reserved.
