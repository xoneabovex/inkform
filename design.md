# Inkform — Mobile App Interface Design

## Brand & Color Choices

| Token | Dark Mode | Light Mode | Purpose |
|-------|-----------|------------|---------|
| primary | #7C5CFC | #6B4EE6 | Main accent — purple/violet for creative AI branding |
| background | #0D0D12 | #FFFFFF | Deep dark base |
| surface | #1A1A24 | #F5F5F7 | Cards, panels, elevated surfaces |
| foreground | #EEEEF0 | #11181C | Primary text |
| muted | #8888A0 | #687076 | Secondary text, labels |
| border | #2A2A3C | #E5E7EB | Dividers |
| success | #4ADE80 | #22C55E | Generation complete |
| warning | #FBBF24 | #F59E0B | Warnings, cold boot |
| error | #F87171 | #EF4444 | Errors |

## Screen List

### Tab Screens (Bottom Tab Bar)
1. **Generate** — Main image generation screen
2. **Gallery** — Grid of all generated/upscaled images
3. **Upscale** — Image upscaling with model selection
4. **Prompts** — Prompt history and bookmarks
5. **Settings** — Provider configuration and API key management

## Screen Details

### 1. Generate Screen
- **Provider selector** at top: horizontal pill buttons (RunPod / Replicate / Google)
- **Model selector** below provider: dropdown/picker showing available models for selected provider
- **Civitai preview card** (for RunPod/SDXL): shows thumbnail + model name when a Civitai ID is entered
- **Prompt textarea**: large multiline input, placeholder "Describe your image..."
- **Negative prompt textarea**: collapsible, smaller
- **Parameter section**: 
  - Aspect ratio: horizontal scrollable pill selector (1:1, 4:3, 3:4, 3:2, 2:3, 16:9, 21:9, 9:16)
  - Batch size: stepper 1–4
  - Guidance/CFG slider (dynamic per model)
  - Steps slider (dynamic per model)
  - Additional model-specific params (e.g., go_fast for Qwen)
- **Generate button**: large, full-width, purple accent with loading state
- **Result area**: shows generated images in a horizontal scroll, tap to view full screen

### 2. Gallery Screen
- **Grid layout**: 3-column masonry-style grid of thumbnails
- **Collection filter**: horizontal scrollable tabs at top (All, + collection names)
- **Tap image**: opens detail view with full image, metadata (prompt, model, date), and actions
- **Actions on detail**: Add to collection, Share, Delete, Send to Upscale
- **Long press**: multi-select mode for batch operations

### 3. Upscale Screen
- **Image picker area**: tap to select from gallery or recent generations
- **Selected image preview**: large centered preview
- **Model selector**: two cards side by side
  - Real-ESRGAN (2D/Animation fidelity)
  - GFPGAN (Cinematic/Face restoration)
- **Scale factor**: segmented control (2x, 3x, 4x)
- **Face enhancement toggle**: switch
- **Upscale button**: full-width accent button
- **Result**: before/after comparison, Save to Camera Roll button

### 4. Prompts Screen
- **Two tabs** at top: History / Bookmarks
- **History**: list of last 50 prompts with model used, date, thumbnail
- **Bookmarks**: saved prompts with star icon
- **Tap prompt**: loads it into Generate screen
- **Swipe actions**: Bookmark (history), Delete (bookmarks)

### 5. Settings Screen
- **Sections** in a scrollable list:
  - **RunPod Configuration**
    - RunPod API Key (secure input, masked)
    - Endpoint ID (text input)
    - Civitai API Token (secure input)
    - Civitai Base Model Version ID/URL (with preview card)
    - LoRA IDs/URLs (multi-input, each with preview card)
  - **Replicate Configuration**
    - Replicate API Token (secure input)
  - **Google Vertex AI Configuration**
    - Google API Key (secure input)
  - **App Settings**
    - Default provider
    - Default aspect ratio
    - Clear cache
    - About / Version

## Key User Flows

### Generate Image Flow
1. User selects provider (e.g., Replicate)
2. User selects model (e.g., FLUX.2 Pro)
3. User types prompt in textarea
4. User adjusts aspect ratio and parameters
5. User taps "Generate" button
6. Loading spinner with progress indicator appears
7. Image(s) appear in result area
8. Images auto-saved to local gallery with metadata
9. User can tap image to view full screen, bookmark prompt, or send to upscale

### Civitai Model Setup Flow
1. User goes to Settings → RunPod Configuration
2. User pastes Civitai model URL or ID
3. App fetches model info from Civitai API
4. Preview card appears with thumbnail and model name
5. User confirms selection

### Upscale Flow
1. User navigates to Upscale tab
2. User selects image from gallery or recent generation
3. User picks upscaler model (Real-ESRGAN or GFPGAN)
4. User sets scale factor and face enhancement
5. User taps "Upscale"
6. Loading state with progress
7. Before/after comparison shown
8. User taps "Save to Camera Roll" to save natively

## Layout Principles
- Dark theme by default (forced dark for this creative/professional tool)
- Bottom tab bar with 5 tabs: Generate, Gallery, Upscale, Prompts, Settings
- All screens use ScreenContainer for safe area handling
- Cards use surface color with subtle border
- Inputs use surface background with border
- Purple accent for primary actions
- Toast notifications for success/error states (auto-dismiss)
- Loading states on all async operations
