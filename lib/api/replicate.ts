import type { GenerationRequest } from "@/lib/types";

const REPLICATE_API = "https://api.replicate.com/v1";

interface ReplicatePrediction {
  id: string;
  status: "starting" | "processing" | "succeeded" | "failed" | "canceled";
  output: string[] | string | null;
  error: string | null;
}

interface ReplicateSecrets {
  openaiApiKey?: string;
}

const NATIVE_BATCH_FIELDS: Record<string, "num_outputs" | "number_of_images"> =
  {
    "black-forest-labs/flux-schnell": "num_outputs",
    "black-forest-labs/flux-krea-dev": "num_outputs",
    "openai/gpt-image-1": "number_of_images",
    "openai/gpt-image-2.5-flare": "number_of_images",
    "openai/gpt-image-2.5-sunburst": "number_of_images",
  };

const SINGLE_IMAGE_FIELDS: Record<
  string,
  "image" | "image_prompt" | "input_image"
> = {
  "black-forest-labs/flux-krea-dev": "image",
  "black-forest-labs/flux-kontext-max": "input_image",
  "black-forest-labs/flux-1.1-pro": "image_prompt",
  "qwen/qwen-image-2512": "image",
  "xai/grok-imagine-image-2": "image",
};

const MULTI_IMAGE_FIELDS: Record<
  string,
  "images" | "input_images" | "image_input"
> = {
  "bytedance/seedream-5-lite": "image_input",
  "openai/gpt-image-2.5-flare": "input_images",
  "openai/gpt-image-2.5-sunburst": "input_images",
  "black-forest-labs/flux-2-klein-4b": "images",
  "black-forest-labs/flux-2-dev": "input_images",
  "black-forest-labs/flux-2-pro": "input_images",
  "black-forest-labs/flux-2-max": "input_images",
  "openai/gpt-image-1": "input_images",
};

const CFG_FIELDS: Record<string, "guidance" | "guidance_scale"> = {
  "bytedance/seedream-3": "guidance_scale",
  "black-forest-labs/flux-krea-dev": "guidance",
  "qwen/qwen-image-2512": "guidance",
};

const STEP_MODELS = new Set([
  "black-forest-labs/flux-krea-dev",
  "qwen/qwen-image-2512",
]);

const DENOISING_FIELDS: Record<string, "prompt_strength" | "strength"> = {
  "black-forest-labs/flux-krea-dev": "prompt_strength",
  "qwen/qwen-image-2512": "strength",
};

const MODEL_ASPECT_RATIOS: Record<string, Set<string>> = {
  "openai/gpt-image-1": new Set(["1:1", "3:2", "2:3"]),
  "openai/gpt-image-2.5-flare": new Set([
    "1:1",
    "3:2",
    "2:3",
    "4:3",
    "3:4",
    "16:9",
    "9:16",
  ]),
  "openai/gpt-image-2.5-sunburst": new Set([
    "1:1",
    "3:2",
    "2:3",
    "4:3",
    "3:4",
    "16:9",
    "9:16",
  ]),
  "qwen/qwen-image-2512": new Set([
    "1:1",
    "16:9",
    "9:16",
    "4:3",
    "3:4",
    "3:2",
    "2:3",
  ]),
  "black-forest-labs/flux-kontext-max": new Set([
    "1:1",
    "16:9",
    "9:16",
    "4:3",
    "3:4",
    "3:2",
    "2:3",
  ]),
  "black-forest-labs/flux-1.1-pro": new Set([
    "1:1",
    "16:9",
    "9:16",
    "4:3",
    "3:4",
    "3:2",
    "2:3",
  ]),
  "black-forest-labs/flux-2-dev": new Set([
    "1:1",
    "16:9",
    "9:16",
    "4:3",
    "3:4",
    "3:2",
    "2:3",
  ]),
  "black-forest-labs/flux-2-pro": new Set([
    "1:1",
    "16:9",
    "9:16",
    "4:3",
    "3:4",
    "3:2",
    "2:3",
  ]),
  "black-forest-labs/flux-2-max": new Set([
    "1:1",
    "16:9",
    "9:16",
    "4:3",
    "3:4",
    "3:2",
    "2:3",
  ]),
};

function mapAspectRatio(modelId: string, aspectRatio: string): string {
  const supported = MODEL_ASPECT_RATIOS[modelId];
  if (!supported || supported.has(aspectRatio)) return aspectRatio;

  const [width, height] = aspectRatio.split(":").map(Number);
  if (!width || !height || width === height) return "1:1";
  const ratio = width / height;
  if (ratio >= 1.8 && supported.has("16:9")) return "16:9";
  if (ratio <= 0.56 && supported.has("9:16")) return "9:16";
  return width > height ? "3:2" : "2:3";
}

export function buildReplicateInput(
  req: GenerationRequest,
  secrets: ReplicateSecrets = {},
): Record<string, any> {
  const input: Record<string, any> = {
    prompt: req.prompt,
  };

  const modelId = req.model.replicateId || "";

  input.aspect_ratio = mapAspectRatio(modelId, req.aspectRatio.value);

  // Negative prompt
  if (req.negativePrompt && req.model.supportsNegativePrompt) {
    input.negative_prompt = req.negativePrompt;
  }

  // CFG / Guidance
  const cfgField = CFG_FIELDS[modelId];
  if (cfgField && req.cfg !== undefined && req.model.supportsCfg) {
    input[cfgField] = req.cfg;
  }

  if (
    STEP_MODELS.has(modelId) &&
    req.steps !== undefined &&
    req.model.supportsSteps
  ) {
    const minimum = req.model.stepsRange?.[0] ?? 1;
    const maximum = req.model.stepsRange?.[1] ?? 50;
    input.num_inference_steps = Math.max(minimum, Math.min(maximum, req.steps));
  }

  // Seed
  if (
    req.seed !== undefined &&
    req.seed !== -1 &&
    !modelId.startsWith("openai/") &&
    !modelId.startsWith("xai/") &&
    modelId !== "bytedance/seedream-5-lite"
  ) {
    input.seed = req.seed;
  }

  const batchField = NATIVE_BATCH_FIELDS[modelId];
  if (batchField && req.batchSize > 1) {
    input[batchField] = Math.min(
      req.batchSize,
      batchField === "num_outputs" ? 4 : 10,
    );
  }

  if (req.referenceImageUri) {
    const singleImageField = SINGLE_IMAGE_FIELDS[modelId];
    if (singleImageField) {
      input[singleImageField] = req.referenceImageUri;
    } else {
      const multiImageField = MULTI_IMAGE_FIELDS[modelId];
      if (multiImageField) {
        input[multiImageField] = [req.referenceImageUri];
      }
    }

    const denoisingField = DENOISING_FIELDS[modelId];
    if (denoisingField && req.denoisingStrength !== undefined) {
      input[denoisingField] = req.denoisingStrength;
    }
  }

  if (modelId.startsWith("openai/") && secrets.openaiApiKey) {
    input.openai_api_key = secrets.openaiApiKey;
  }

  return input;
}

export async function createReplicatePrediction(
  token: string,
  req: GenerationRequest,
  secrets: ReplicateSecrets = {},
): Promise<string> {
  const modelId = req.model.replicateId;
  if (!modelId) throw new Error("No Replicate model ID");

  const input = buildReplicateInput(req, secrets);

  const response = await fetch(
    `${REPLICATE_API}/models/${modelId}/predictions`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Prefer: "wait",
      },
      body: JSON.stringify({ input }),
    },
  );

  if (!response.ok) {
    const err = await response.text();
    let message = `Replicate API error (${response.status})`;
    try {
      const errData = JSON.parse(err);
      if (errData.detail)
        message =
          typeof errData.detail === "string"
            ? errData.detail
            : JSON.stringify(errData.detail);
      else if (errData.title) message = errData.title;
    } catch {
      if (err.length < 200) message = err;
    }
    throw new Error(message);
  }

  const data: ReplicatePrediction = await response.json();

  if (data.status === "succeeded" && data.output) {
    return data.id;
  }

  return data.id;
}

export async function pollReplicatePrediction(
  token: string,
  predictionId: string,
  onProgress?: (status: string) => void,
): Promise<string[]> {
  const maxAttempts = 120;
  const pollInterval = 2000;

  for (let i = 0; i < maxAttempts; i++) {
    const response = await fetch(
      `${REPLICATE_API}/predictions/${predictionId}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      },
    );

    if (!response.ok) {
      throw new Error(`Poll error: ${response.status}`);
    }

    const data: ReplicatePrediction = await response.json();
    onProgress?.(data.status);

    if (data.status === "succeeded") {
      if (Array.isArray(data.output)) {
        return data.output;
      }
      if (typeof data.output === "string") {
        return [data.output];
      }
      throw new Error("Unexpected output format");
    }

    if (data.status === "failed") {
      throw new Error(data.error || "Generation failed");
    }

    if (data.status === "canceled") {
      throw new Error("Generation was canceled");
    }

    await new Promise((resolve) => setTimeout(resolve, pollInterval));
  }

  throw new Error("Generation timed out after 4 minutes");
}

/** Models without a native batch field are submitted as parallel predictions. */
export async function generateWithReplicate(
  token: string,
  req: GenerationRequest,
  onProgress?: (status: string) => void,
  secrets: ReplicateSecrets = {},
): Promise<string[]> {
  const modelId = req.model.replicateId || "";
  const supportsNativeBatch = Boolean(NATIVE_BATCH_FIELDS[modelId]);
  const batchSize = req.batchSize ?? 1;

  // If native batch is supported (or batch=1), use a single prediction
  if (supportsNativeBatch || batchSize <= 1) {
    const predictionId = await createReplicatePrediction(token, req, secrets);
    return pollReplicatePrediction(token, predictionId, onProgress);
  }

  // For models that don't support num_outputs, run parallel predictions
  onProgress?.("Submitting " + batchSize + " parallel predictions...");

  // Create all predictions in parallel (with seed offset for variety)
  const predictionIds = await Promise.all(
    Array.from({ length: batchSize }, (_, i) => {
      const batchReq: GenerationRequest = {
        ...req,
        batchSize: 1,
        // Offset seed for each image so they're different (if seed is set)
        seed: req.seed !== undefined ? req.seed + i : undefined,
      };
      return createReplicatePrediction(token, batchReq, secrets);
    }),
  );

  // Poll all predictions in parallel
  let completed = 0;
  const results = await Promise.all(
    predictionIds.map(async (id) => {
      const images = await pollReplicatePrediction(token, id);
      completed++;
      onProgress?.(`Generating... (${completed}/${batchSize} done)`);
      return images;
    }),
  );

  // Flatten results (each prediction returns an array)
  return results.flat();
}

// ===== Upscaling =====

export async function upscaleWithReplicate(
  token: string,
  imageUrl: string,
  model: "real-esrgan" | "gfpgan",
  scaleFactor: number,
  faceEnhance: boolean,
  onProgress?: (status: string) => void,
): Promise<string> {
  // Community models use version-based predictions, not the official-model route.
  const version =
    model === "real-esrgan"
      ? "b3ef194191d13140337468c916c2c5b96dd0cb06dffc032a022a31807f6a5ea8"
      : "0fbacf7afc6c144e5be9767cff80f25aff23e52b0708f17e20f9879b2f21516c";

  const input: Record<string, any> = {
    [model === "real-esrgan" ? "image" : "img"]: imageUrl,
    scale: scaleFactor,
  };

  if (model === "real-esrgan") {
    input.scale = scaleFactor;
    input.face_enhance = faceEnhance;
  }

  const response = await fetch(`${REPLICATE_API}/predictions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Prefer: "wait",
    },
    body: JSON.stringify({ version, input }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Upscale API error: ${response.status} - ${err}`);
  }

  const data: ReplicatePrediction = await response.json();

  if (data.status === "succeeded" && data.output) {
    const output =
      typeof data.output === "string" ? data.output : data.output[0];
    if (output) return output;
  }

  const result = await pollReplicatePrediction(token, data.id, onProgress);
  return result[0];
}
