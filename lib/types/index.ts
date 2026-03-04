// ===== Provider & Architecture Types =====

export type ProviderType = "runpod" | "replicate" | "google";

/**
 * Architecture determines which advanced params are shown/hidden.
 * - "sdxl"  → SDXL, Pony, Illustrious, NoobAI (full params + legacy Civitai loader)
 * - "sd15"  → Stable Diffusion 1.x (full params + auto Civitai)
 * - "flux"  → FLUX variants (minimal params, no neg prompt)
 * - "api"   → Managed APIs (OpenAI, Google, Grok, Qwen, Bytedance) — minimal params
 * - "other" → Chroma, HiDream, etc.
 */
export type ModelArchitecture = "sdxl" | "sd15" | "flux" | "api" | "other";

// ===== Model Info =====

export interface ModelInfo {
  id: string;
  name: string;
  provider: ProviderType;
  architecture: ModelArchitecture;
  ecosystem: string; // Accordion group name
  replicateId?: string;

  // Feature flags
  supportsNegativePrompt: boolean;
  supportsCfg: boolean;
  supportsSteps: boolean;
  supportsLoRAs: boolean;
  supportsImg2Img: boolean;
  supportsClipSkip: boolean;
  supportsVae: boolean;
  supportsHiResFix: boolean;

  // Ranges & defaults
  cfgRange?: [number, number];
  stepsRange?: [number, number];
  defaultCfg?: number;
  defaultSteps?: number;
  defaultClipSkip?: number;
  maxRefImages?: number; // Max reference images for img2img

  // Civitai integration
  useLegacyCivitaiLoader?: boolean; // Phase 3: use existing manual Civitai UI
  defaultCivitaiModelId?: string;   // Phase 4: auto-populate for auto-routing

  extraParams?: Record<string, any>;
}

// ===== Ecosystem Catalog =====

export interface EcosystemGroup {
  name: string;
  models: ModelInfo[];
}

// Helper to build a RunPod model
function rpModel(
  id: string,
  name: string,
  ecosystem: string,
  arch: ModelArchitecture,
  overrides: Partial<ModelInfo> = {}
): ModelInfo {
  const base: ModelInfo = {
    id,
    name,
    provider: "runpod",
    architecture: arch,
    ecosystem,
    supportsNegativePrompt: arch === "sdxl" || arch === "sd15" || arch === "other",
    supportsCfg: arch !== "api",
    supportsSteps: arch !== "api",
    supportsLoRAs: arch !== "api",
    supportsImg2Img: true,
    supportsClipSkip: arch === "sdxl" || arch === "sd15",
    supportsVae: arch === "sdxl" || arch === "sd15",
    supportsHiResFix: arch === "sdxl" || arch === "sd15",
    cfgRange: [1, 30],
    stepsRange: [1, 100],
    defaultCfg: arch === "flux" ? 3.5 : 7,
    defaultSteps: 30,
    defaultClipSkip: arch === "sdxl" || arch === "sd15" ? 2 : undefined,
    maxRefImages: 1,
  };
  return { ...base, ...overrides };
}

// Helper to build a Replicate model
function repModel(
  id: string,
  name: string,
  ecosystem: string,
  replicateId: string,
  arch: ModelArchitecture,
  overrides: Partial<ModelInfo> = {}
): ModelInfo {
  const base: ModelInfo = {
    id,
    name,
    provider: "replicate",
    architecture: arch,
    ecosystem,
    replicateId,
    supportsNegativePrompt: false,
    supportsCfg: false,
    supportsSteps: false,
    supportsLoRAs: false,
    supportsImg2Img: false,
    supportsClipSkip: false,
    supportsVae: false,
    supportsHiResFix: false,
    maxRefImages: 0,
  };
  return { ...base, ...overrides };
}

// Helper to build a Google model
function gModel(
  id: string,
  name: string,
  overrides: Partial<ModelInfo> = {}
): ModelInfo {
  const base: ModelInfo = {
    id,
    name,
    provider: "google",
    architecture: "api",
    ecosystem: "GOOGLE",
    supportsNegativePrompt: false,
    supportsCfg: false,
    supportsSteps: false,
    supportsLoRAs: false,
    supportsImg2Img: false,
    supportsClipSkip: false,
    supportsVae: false,
    supportsHiResFix: false,
    maxRefImages: 0,
  };
  return { ...base, ...overrides };
}

// ===== Full Model Catalog =====

export const MODEL_CATALOG: EcosystemGroup[] = [
  {
    name: "BYTEDANCE",
    models: [
      repModel("seedream", "Seedream", "BYTEDANCE", "bytedance/seedream-3", "api"),
    ],
  },
  {
    name: "FLUX",
    models: [
      repModel("flux-1-schnell", "Flux.1 Schnell", "FLUX", "black-forest-labs/flux-schnell", "flux"),
      repModel("flux-1-krea", "Flux.1 Krea", "FLUX", "lucataco/flux-krea-ai", "flux"),
      repModel("flux-1-kontext", "Flux.1 Kontext", "FLUX", "black-forest-labs/flux-1-kontext-max", "flux", {
        supportsImg2Img: true,
        maxRefImages: 1,
      }),
      repModel("flux-1.1-pro", "Flux 1.1 Pro", "FLUX", "black-forest-labs/flux-1.1-pro", "flux"),
      repModel("flux-2-dev", "Flux.2 Dev", "FLUX", "black-forest-labs/flux-2-dev", "flux", {
        supportsCfg: true,
        supportsSteps: true,
        cfgRange: [1, 20],
        stepsRange: [1, 50],
        defaultCfg: 3.5,
        defaultSteps: 28,
      }),
      repModel("flux-2-pro", "Flux.2 Pro", "FLUX", "black-forest-labs/flux-2-pro", "flux", {
        supportsSteps: true,
        stepsRange: [1, 50],
        defaultSteps: 25,
      }),
      repModel("flux-2-max", "Flux.2 Max", "FLUX", "black-forest-labs/flux-2-max", "flux"),
      repModel("flux-2-klein", "Flux.2 Klein", "FLUX", "black-forest-labs/flux-2-klein-4b", "flux"),
      // RunPod FLUX variants (for Civitai auto-routing)
      rpModel("rp-flux-1", "Flux.1 (Civitai)", "FLUX", "flux", {
        supportsNegativePrompt: false,
        supportsClipSkip: false,
        supportsVae: false,
        supportsHiResFix: false,
        defaultCivitaiModelId: "618692", // FLUX.1 Dev on Civitai
      }),
    ],
  },
  {
    name: "GOOGLE",
    models: [
      gModel("imagen-4", "Imagen 4"),
      gModel("imagen-4-ultra", "Imagen 4 Ultra", { extraParams: { maxBatch: 1 } }),
      gModel("imagen-4-fast", "Imagen 4 Fast"),
      gModel("gemini-3-flash-image", "Nano Banana (3.1 Flash)"),
      gModel("gemini-3-pro-image", "Nano Banana (3 Pro)", { extraParams: { maxBatch: 1 } }),
      gModel("gemini-2.5-flash-image", "Nano Banana (2.5 Flash)"),
    ],
  },
  {
    name: "OPENAI",
    models: [
      repModel("openai-gpt-image", "GPT Image 1", "OPENAI", "openai/gpt-image-1", "api"),
    ],
  },
  {
    name: "PONY DIFFUSION",
    models: [
      rpModel("rp-pony", "Pony Diffusion", "PONY DIFFUSION", "sdxl", {
        useLegacyCivitaiLoader: true,
        defaultCivitaiModelId: "290640",
      }),
      rpModel("rp-pony-v7", "Pony Diffusion V7", "PONY DIFFUSION", "sdxl", {
        useLegacyCivitaiLoader: true,
        defaultCivitaiModelId: "1268539",
      }),
    ],
  },
  {
    name: "QWEN",
    models: [
      repModel("qwen", "Qwen", "QWEN", "qwen-ai/qwen2.5-vl-7b-instruct", "api"),
    ],
  },
  {
    name: "SDXL COMMUNITY",
    models: [
      rpModel("rp-illustrious", "Illustrious", "SDXL COMMUNITY", "sdxl", {
        useLegacyCivitaiLoader: true,
        defaultCivitaiModelId: "889818",
      }),
      rpModel("rp-noobai", "NoobAI", "SDXL COMMUNITY", "sdxl", {
        useLegacyCivitaiLoader: true,
        defaultCivitaiModelId: "833294",
      }),
    ],
  },
  {
    name: "STABLE DIFFUSION",
    models: [
      rpModel("rp-sd15", "Stable Diffusion 1.x", "STABLE DIFFUSION", "sd15", {
        defaultCivitaiModelId: "128713",
      }),
      rpModel("rp-sdxl", "Stable Diffusion XL", "STABLE DIFFUSION", "sdxl", {
        useLegacyCivitaiLoader: true,
        defaultCivitaiModelId: "101055",
      }),
    ],
  },
  {
    name: "XAI",
    models: [
      repModel("grok-image", "Grok", "XAI", "x-ai/grok-2-image", "api"),
    ],
  },
  {
    name: "ZIMAGE",
    models: [
      rpModel("rp-zimage", "ZImage", "ZIMAGE", "other", {
        defaultCivitaiModelId: "1076277",
        supportsLoRAs: true,
      }),
    ],
  },
  {
    name: "OTHER",
    models: [
      rpModel("rp-chroma", "Chroma", "OTHER", "other", {
        defaultCivitaiModelId: "1175869",
        supportsLoRAs: true,
      }),
      rpModel("rp-hidream", "HiDream", "OTHER", "other", {
        defaultCivitaiModelId: "1120418",
        supportsLoRAs: false,
      }),
    ],
  },
];

// Flatten all models for quick lookup
export const ALL_MODELS: ModelInfo[] = MODEL_CATALOG.flatMap((g) => g.models);

// Get model by ID
export function getModelById(id: string): ModelInfo | undefined {
  return ALL_MODELS.find((m) => m.id === id);
}

// ===== Sampling Methods =====

export const SAMPLING_METHODS = [
  { id: "euler", label: "Euler" },
  { id: "euler_a", label: "Euler a" },
  { id: "dpm++_2m_karras", label: "DPM++ 2M Karras" },
  { id: "dpm++_sde_karras", label: "DPM++ SDE Karras" },
  { id: "dpm++_2m", label: "DPM++ 2M" },
  { id: "dpm++_sde", label: "DPM++ SDE" },
  { id: "ddim", label: "DDIM" },
  { id: "lcm", label: "LCM" },
  { id: "heun", label: "Heun" },
  { id: "lms", label: "LMS" },
] as const;

export type SamplingMethodId = (typeof SAMPLING_METHODS)[number]["id"];

// ===== VAE Options =====

export const VAE_OPTIONS = [
  { id: "auto", label: "Auto" },
  { id: "sdxl_vae", label: "SDXL VAE" },
  { id: "sdxl_fp16", label: "SDXL FP16 Fix" },
  { id: "sd15_vae", label: "SD 1.5 VAE" },
  { id: "none", label: "None" },
] as const;

export type VaeId = (typeof VAE_OPTIONS)[number]["id"];

// ===== LoRA Types =====

export interface LoraEntry {
  id: string; // Civitai version ID or URL
  weight: number; // -2.0 to 2.0
  preview: CivitaiModelPreview | null;
  triggerWords?: string[];
}

// ===== Aspect Ratio =====

export interface AspectRatio {
  label: string;
  value: string;
  width: number;
  height: number;
  category: string;
}

export const ASPECT_RATIOS: AspectRatio[] = [
  { label: "1:1", value: "1:1", width: 1024, height: 1024, category: "Square" },
  { label: "4:3", value: "4:3", width: 1024, height: 768, category: "Standard" },
  { label: "3:4", value: "3:4", width: 768, height: 1024, category: "Standard" },
  { label: "3:2", value: "3:2", width: 1024, height: 683, category: "Photo" },
  { label: "2:3", value: "2:3", width: 683, height: 1024, category: "Photo" },
  { label: "16:9", value: "16:9", width: 1024, height: 576, category: "Cinema" },
  { label: "21:9", value: "21:9", width: 1024, height: 439, category: "Cinema" },
  { label: "9:16", value: "9:16", width: 576, height: 1024, category: "Mobile" },
];

// ===== Civitai Types =====

export interface CivitaiModelPreview {
  id: number;
  name: string;
  thumbnailUrl: string | null;
  baseModel?: string;
  triggerWords?: string[];
}

// ===== Gallery Types =====

export interface GalleryImage {
  id: string;
  uri: string;
  prompt: string;
  negativePrompt?: string;
  provider: ProviderType;
  model: string;
  aspectRatio: string;
  createdAt: number;
  collections: string[];
  isUpscaled?: boolean;
  width?: number;
  height?: number;
  seed?: number;
  samplingMethod?: string;
  cfg?: number;
  steps?: number;
}

export interface Collection {
  id: string;
  name: string;
  createdAt: number;
}

// ===== Prompt Types =====

export interface SavedPrompt {
  id: string;
  prompt: string;
  negativePrompt?: string;
  provider: ProviderType;
  model: string;
  createdAt: number;
  isBookmarked: boolean;
}

// ===== Generation Types =====

export interface GenerationRequest {
  provider: ProviderType;
  model: ModelInfo;
  prompt: string;
  negativePrompt?: string;
  aspectRatio: AspectRatio;
  batchSize: number;
  cfg?: number;
  steps?: number;
  seed?: number;
  samplingMethod?: SamplingMethodId;
  clipSkip?: number;
  vae?: VaeId;
  hiResFix?: boolean;
  hiResUpscaleFactor?: number;
  hiResSteps?: number;
  hiResDenoising?: number;
  matureContent?: boolean;
  loraEntries?: LoraEntry[];
  civitaiModelId?: string;
  referenceImageUri?: string; // local URI for img2img
  denoisingStrength?: number; // 0.0 to 1.0 for img2img
  extraParams?: Record<string, any>;
}

export interface GenerationResult {
  images: string[]; // URLs or base64
  provider: ProviderType;
  model: string;
}

// ===== Upscale Types =====

export type UpscaleModel = "real-esrgan" | "gfpgan";

export interface UpscaleRequest {
  imageUri: string;
  model: UpscaleModel;
  scaleFactor: number;
  faceEnhance: boolean;
}

// ===== API Keys =====

export interface ApiKeys {
  runpodApiKey?: string;
  runpodEndpointId?: string;
  civitaiApiToken?: string;
  replicateApiToken?: string;
  googleApiKey?: string;
}
