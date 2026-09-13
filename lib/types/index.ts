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
  unavailableReason?: string;

  // Feature flags
  supportsNegativePrompt: boolean;
  supportsCfg: boolean;
  supportsSteps: boolean;
  supportsLoRAs: boolean;
  supportsImg2Img: boolean;
  supportsDenoisingStrength: boolean;
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
  defaultCivitaiModelId?: string; // Phase 4: auto-populate for auto-routing

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
  overrides: Partial<ModelInfo> = {},
): ModelInfo {
  const base: ModelInfo = {
    id,
    name,
    provider: "runpod",
    architecture: arch,
    ecosystem,
    supportsNegativePrompt:
      arch === "sdxl" || arch === "sd15" || arch === "other",
    supportsCfg: arch !== "api",
    supportsSteps: arch !== "api",
    supportsLoRAs: arch !== "api",
    supportsImg2Img: true,
    supportsDenoisingStrength: true,
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
  overrides: Partial<ModelInfo> = {},
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
    supportsDenoisingStrength: false,
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
  overrides: Partial<ModelInfo> = {},
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
    supportsDenoisingStrength: false,
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
      repModel(
        "seedream",
        "Seedream 5.0 Lite",
        "BYTEDANCE",
        "bytedance/seedream-5-lite",
        "api",
        {
          supportsImg2Img: true,
          maxRefImages: 1,
        },
      ),
    ],
  },
  {
    name: "FLUX",
    models: [
      repModel(
        "flux-1-schnell",
        "Flux.1 Schnell",
        "FLUX",
        "black-forest-labs/flux-schnell",
        "flux",
      ),
      repModel(
        "flux-1-krea",
        "Flux.1 Krea Dev",
        "FLUX",
        "black-forest-labs/flux-krea-dev",
        "flux",
        {
          supportsCfg: true,
          supportsSteps: true,
          supportsImg2Img: true,
          supportsDenoisingStrength: true,
          cfgRange: [1, 10],
          stepsRange: [1, 50],
          defaultCfg: 3.5,
          defaultSteps: 28,
          maxRefImages: 1,
        },
      ),
      repModel(
        "flux-1-kontext",
        "Flux.1 Kontext Max",
        "FLUX",
        "black-forest-labs/flux-kontext-max",
        "flux",
        {
          supportsImg2Img: true,
          maxRefImages: 1,
        },
      ),
      repModel(
        "flux-1.1-pro",
        "Flux 1.1 Pro",
        "FLUX",
        "black-forest-labs/flux-1.1-pro",
        "flux",
        {
          supportsImg2Img: true,
          maxRefImages: 1,
        },
      ),
      repModel(
        "flux-2-dev",
        "Flux.2 Dev",
        "FLUX",
        "black-forest-labs/flux-2-dev",
        "flux",
        {
          supportsImg2Img: true,
          maxRefImages: 5,
        },
      ),
      repModel(
        "flux-2-pro",
        "Flux.2 Pro",
        "FLUX",
        "black-forest-labs/flux-2-pro",
        "flux",
        {
          supportsImg2Img: true,
          maxRefImages: 8,
        },
      ),
      repModel(
        "flux-2-max",
        "Flux.2 Max",
        "FLUX",
        "black-forest-labs/flux-2-max",
        "flux",
        {
          supportsImg2Img: true,
          maxRefImages: 8,
        },
      ),
      repModel(
        "flux-2-klein",
        "Flux.2 Klein",
        "FLUX",
        "black-forest-labs/flux-2-klein-4b",
        "flux",
        {
          supportsImg2Img: true,
          maxRefImages: 5,
        },
      ),
      // RunPod FLUX variants (for Civitai auto-routing)
      rpModel("rp-flux-1", "Flux.1 (Civitai)", "FLUX", "flux", {
        supportsNegativePrompt: false,
        supportsClipSkip: false,
        supportsVae: false,
        supportsHiResFix: false,
        unavailableReason:
          "The current RunPod worker supports SD 1.x and SDXL only. Choose a hosted FLUX model above.",
      }),
    ],
  },
  {
    name: "GOOGLE",
    models: [
      gModel("gemini-3-flash-image", "Nano Banana 2", {
        supportsImg2Img: true,
        maxRefImages: 1,
      }),
      gModel("gemini-3-pro-image", "Nano Banana Pro", {
        supportsImg2Img: true,
        maxRefImages: 1,
      }),
      gModel("gemini-3.1-flash-lite-image", "Nano Banana 2 Lite", {
        supportsImg2Img: true,
        maxRefImages: 1,
      }),
      gModel("gemini-2.5-flash-image", "Nano Banana (2.5 Flash)", {
        supportsImg2Img: true,
        maxRefImages: 1,
      }),
    ],
  },
  {
    name: "OPENAI",
    models: [
      repModel(
        "openai-gpt-image",
        "GPT Image 2.5 Flare",
        "OPENAI",
        "openai/gpt-image-2.5-flare",
        "api",
        {
          supportsImg2Img: true,
          maxRefImages: 1,
        },
      ),
      repModel(
        "openai-gpt-image-sunburst",
        "GPT Image 2.5 Sunburst",
        "OPENAI",
        "openai/gpt-image-2.5-sunburst",
        "api",
        {
          supportsImg2Img: true,
          maxRefImages: 1,
        },
      ),
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
        unavailableReason:
          "The previous Pony V7 checkpoint ID is unavailable. Use Pony V6 or supply a verified compatible checkpoint with the custom loader.",
      }),
    ],
  },
  {
    name: "QWEN",
    models: [
      repModel(
        "qwen",
        "Qwen Image 2512",
        "QWEN",
        "qwen/qwen-image-2512",
        "api",
        {
          supportsNegativePrompt: true,
          supportsCfg: true,
          supportsSteps: true,
          supportsImg2Img: true,
          supportsDenoisingStrength: true,
          cfgRange: [0, 10],
          stepsRange: [20, 50],
          defaultCfg: 4,
          defaultSteps: 40,
          maxRefImages: 1,
        },
      ),
    ],
  },
  {
    name: "SDXL COMMUNITY",
    models: [
      rpModel("rp-illustrious", "Illustrious", "SDXL COMMUNITY", "sdxl", {
        useLegacyCivitaiLoader: true,
        defaultCivitaiModelId: "889818",
      }),
      rpModel("rp-noobai", "NoobAI XL Epsilon 1.1", "SDXL COMMUNITY", "sdxl", {
        useLegacyCivitaiLoader: true,
        defaultCivitaiModelId: "1116447",
      }),
    ],
  },
  {
    name: "STABLE DIFFUSION",
    models: [
      rpModel("rp-sd15", "DreamShaper 8 (SD 1.5)", "STABLE DIFFUSION", "sd15", {
        defaultCivitaiModelId: "128713",
      }),
      rpModel("rp-sdxl", "Stable Diffusion XL", "STABLE DIFFUSION", "sdxl", {
        useLegacyCivitaiLoader: true,
      }),
    ],
  },
  {
    name: "XAI",
    models: [
      repModel(
        "grok-image",
        "Grok Imagine Image 2",
        "XAI",
        "xai/grok-imagine-image-2",
        "api",
        {
          supportsImg2Img: true,
          maxRefImages: 1,
        },
      ),
    ],
  },
  {
    name: "ZIMAGE",
    models: [
      rpModel("rp-zimage", "ZImage", "ZIMAGE", "other", {
        unavailableReason:
          "Z-Image requires a dedicated pipeline that is not installed in this RunPod worker.",
        supportsLoRAs: true,
      }),
    ],
  },
  {
    name: "OTHER",
    models: [
      rpModel("rp-chroma", "Chroma", "OTHER", "other", {
        unavailableReason:
          "Chroma requires a dedicated pipeline that is not installed in this RunPod worker.",
        supportsLoRAs: true,
      }),
      rpModel("rp-hidream", "HiDream", "OTHER", "other", {
        unavailableReason:
          "HiDream requires a dedicated pipeline that is not installed in this RunPod worker.",
        supportsLoRAs: false,
      }),
    ],
  },
];

// Flatten all models for quick lookup
export const ALL_MODELS: ModelInfo[] = MODEL_CATALOG.flatMap((g) => g.models);

// Get model by ID
export function getModelById(id: string): ModelInfo | undefined {
  // Preserve saved Imagen prompts/settings after Google's August 2026 retirement.
  const aliases: Record<string, string> = {
    "imagen-4": "gemini-3-flash-image",
    "imagen-4-fast": "gemini-3.1-flash-lite-image",
    "imagen-4-ultra": "gemini-3-pro-image",
  };
  return ALL_MODELS.find((m) => m.id === (aliases[id] ?? id));
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
  {
    label: "4:3",
    value: "4:3",
    width: 1024,
    height: 768,
    category: "Standard",
  },
  {
    label: "3:4",
    value: "3:4",
    width: 768,
    height: 1024,
    category: "Standard",
  },
  { label: "3:2", value: "3:2", width: 1024, height: 683, category: "Photo" },
  { label: "2:3", value: "2:3", width: 683, height: 1024, category: "Photo" },
  {
    label: "16:9",
    value: "16:9",
    width: 1024,
    height: 576,
    category: "Cinema",
  },
  {
    label: "21:9",
    value: "21:9",
    width: 1024,
    height: 439,
    category: "Cinema",
  },
  {
    label: "9:16",
    value: "9:16",
    width: 576,
    height: 1024,
    category: "Mobile",
  },
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
  isProtected?: boolean; // Prevents auto-deletion during 500-image cap
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

// ===== Style Presets =====

export interface GenerationStylePreset {
  id: string;
  name: string;
  description?: string;
  modelId: string;
  config: Partial<
    Omit<GenerationRequest, "prompt" | "negativePrompt" | "referenceImageUri">
  >;
  negativePromptAppend?: string;
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
  openaiApiKey?: string;
}
