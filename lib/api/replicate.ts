import type { GenerationRequest, AspectRatio } from "@/lib/types";

const REPLICATE_API = "https://api.replicate.com/v1";

interface ReplicatePrediction {
  id: string;
  status: "starting" | "processing" | "succeeded" | "failed" | "canceled";
  output: string[] | string | null;
  error: string | null;
}

function buildReplicateInput(req: GenerationRequest): Record<string, any> {
  const input: Record<string, any> = {
    prompt: req.prompt,
  };

  const modelId = req.model.replicateId || "";

  // Aspect ratio — FLUX models use string, others use width/height
  if (modelId.includes("flux")) {
    input.aspect_ratio = req.aspectRatio.value;
  } else {
    input.width = req.aspectRatio.width;
    input.height = req.aspectRatio.height;
  }

  // Negative prompt
  if (req.negativePrompt && req.model.supportsNegativePrompt) {
    input.negative_prompt = req.negativePrompt;
  }

  // CFG / Guidance
  if (req.cfg !== undefined && req.model.supportsCfg) {
    if (modelId.includes("flux")) {
      input.guidance = req.cfg;
    } else {
      input.guidance_scale = req.cfg;
    }
  }

  // Steps
  if (req.steps !== undefined && req.model.supportsSteps) {
    input.num_inference_steps = req.steps;
  }

  // Seed
  if (req.seed !== undefined && req.seed !== -1) {
    input.seed = req.seed;
  }

  // Batch size — only set num_outputs for models that natively support it
  // (parallel predictions are used for others — handled in generateWithReplicate)
  if (req.batchSize > 1) {
    const modelId = req.model.replicateId || "";
    const supportsNativeBatch = [
      "black-forest-labs/flux-schnell",
      "black-forest-labs/flux-1.1-pro",
      "black-forest-labs/flux-1.1-pro-ultra",
    ].includes(modelId);
    if (supportsNativeBatch) {
      input.num_outputs = req.batchSize;
    }
  }

  // Img2img — reference image
  if (req.referenceImageUri) {
    // FLUX models use image_prompt or image, others use init_image
    if (modelId.includes("flux")) {
      input.image_prompt = req.referenceImageUri;
      if (req.denoisingStrength !== undefined) {
        input.prompt_strength = req.denoisingStrength;
      }
    } else {
      input.image = req.referenceImageUri;
      if (req.denoisingStrength !== undefined) {
        input.prompt_strength = req.denoisingStrength;
      }
    }
  }

  return input;
}

export async function createReplicatePrediction(
  token: string,
  req: GenerationRequest
): Promise<string> {
  const modelId = req.model.replicateId;
  if (!modelId) throw new Error("No Replicate model ID");

  const input = buildReplicateInput(req);

  const response = await fetch(`${REPLICATE_API}/models/${modelId}/predictions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Prefer: "wait",
    },
    body: JSON.stringify({ input }),
  });

  if (!response.ok) {
    const err = await response.text();
    let message = `Replicate API error (${response.status})`;
    try {
      const errData = JSON.parse(err);
      if (errData.detail) message = typeof errData.detail === "string" ? errData.detail : JSON.stringify(errData.detail);
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
  onProgress?: (status: string) => void
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
      }
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

/**
 * Models that natively support num_outputs (return multiple images in one prediction).
 * All others require parallel predictions.
 */
const NATIVE_BATCH_MODELS = new Set([
  "black-forest-labs/flux-schnell",
  "black-forest-labs/flux-1.1-pro",
  "black-forest-labs/flux-1.1-pro-ultra",
]);

export async function generateWithReplicate(
  token: string,
  req: GenerationRequest,
  onProgress?: (status: string) => void
): Promise<string[]> {
  const modelId = req.model.replicateId || "";
  const supportsNativeBatch = NATIVE_BATCH_MODELS.has(modelId);
  const batchSize = req.batchSize ?? 1;

  // If native batch is supported (or batch=1), use a single prediction
  if (supportsNativeBatch || batchSize <= 1) {
    const predictionId = await createReplicatePrediction(token, req);
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
      return createReplicatePrediction(token, batchReq);
    })
  );

  // Poll all predictions in parallel
  let completed = 0;
  const results = await Promise.all(
    predictionIds.map((id) =>
      pollReplicatePrediction(token, id, () => {
        completed++;
        onProgress?.(`Generating... (${completed}/${batchSize} done)`);
      })
    )
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
  onProgress?: (status: string) => void
): Promise<string> {
  const modelId =
    model === "real-esrgan"
      ? "nightmareai/real-esrgan"
      : "tencentarc/gfpgan";

  const input: Record<string, any> = {
    image: imageUrl,
  };

  if (model === "real-esrgan") {
    input.scale = scaleFactor;
    input.face_enhance = faceEnhance;
  }

  const response = await fetch(`${REPLICATE_API}/models/${modelId}/predictions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Prefer: "wait",
    },
    body: JSON.stringify({ input }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Upscale API error: ${response.status} - ${err}`);
  }

  const data: ReplicatePrediction = await response.json();

  if (data.status === "succeeded" && data.output) {
    const output = typeof data.output === "string" ? data.output : data.output[0];
    if (output) return output;
  }

  const result = await pollReplicatePrediction(token, data.id, onProgress);
  return result[0];
}
