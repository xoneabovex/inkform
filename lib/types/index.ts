// ===== Provider & Model Types =====

export type ProviderType = "runpod" | "replicate" | "google";

export interface ModelInfo {
  id: string;
  name: string;
  provider: ProviderType;
  replicateId?: string;
  supportsNegativePrompt: boolean;
  supportsCfg: boolean;
  supportsSteps: boolean;
  cfgRange?: [number, number];
  stepsRange?: [number, number];
  defaultCfg?: number;
  defaultSteps?: number;
  extraParams?: Record<string, any>;
}

export const REPLICATE_MODELS: ModelInfo[] = [
  {
    id: "flux-2-max",
    name: "FLUX.2 Max",
    provider: "replicate",
    replicateId: "black-forest-labs/flux-2-max",
    supportsNegativePrompt: false,
    supportsCfg: false,
    supportsSteps: false,
  },
  {
    id: "flux-2-pro",
    name: "FLUX.2 Pro",
    provider: "replicate",
    replicateId: "black-forest-labs/flux-2-pro",
    supportsNegativePrompt: false,
    supportsCfg: false,
    supportsSteps: true,
    stepsRange: [1, 50],
    defaultSteps: 25,
  },
  {
    id: "flux-2-dev",
    name: "FLUX.2 Dev",
    provider: "replicate",
    replicateId: "black-forest-labs/flux-2-dev",
    supportsNegativePrompt: false,
    supportsCfg: true,
    supportsSteps: true,
    cfgRange: [1, 20],
    stepsRange: [1, 50],
    defaultCfg: 3.5,
    defaultSteps: 28,
  },
  {
    id: "flux-2-klein-4b",
    name: "FLUX.2 Klein 4B",
    provider: "replicate",
    replicateId: "black-forest-labs/flux-2-klein-4b",
    supportsNegativePrompt: false,
    supportsCfg: false,
    supportsSteps: false,
  },
  {
    id: "flux-schnell",
    name: "FLUX.1 Schnell",
    provider: "replicate",
    replicateId: "black-forest-labs/flux-schnell",
    supportsNegativePrompt: false,
    supportsCfg: false,
    supportsSteps: false,
  },
  {
    id: "flux-1.1-pro",
    name: "FLUX 1.1 Pro",
    provider: "replicate",
    replicateId: "black-forest-labs/flux-1.1-pro",
    supportsNegativePrompt: false,
    supportsCfg: false,
    supportsSteps: false,
  },

  {
    id: "sdxl",
    name: "SDXL",
    provider: "replicate",
    replicateId: "stability-ai/sdxl",
    supportsNegativePrompt: true,
    supportsCfg: true,
    supportsSteps: true,
    cfgRange: [1, 20],
    stepsRange: [1, 50],
    defaultCfg: 7,
    defaultSteps: 30,
  },
];

export const GOOGLE_MODELS: ModelInfo[] = [
  {
    id: "imagen-3",
    name: "Imagen 3",
    provider: "google",
    supportsNegativePrompt: false,
    supportsCfg: false,
    supportsSteps: false,
  },
  {
    id: "imagen-4",
    name: "Imagen 4",
    provider: "google",
    supportsNegativePrompt: false,
    supportsCfg: false,
    supportsSteps: false,
  },
];

export const RUNPOD_MODEL: ModelInfo = {
  id: "runpod-custom",
  name: "RunPod Custom (Civitai)",
  provider: "runpod",
  supportsNegativePrompt: true,
  supportsCfg: true,
  supportsSteps: true,
  cfgRange: [1, 30],
  stepsRange: [1, 100],
  defaultCfg: 7,
  defaultSteps: 30,
};

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
