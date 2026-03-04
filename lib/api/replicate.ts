import type { GenerationRequest, AspectRatio } from "@/lib/types";

const REPLICATE_API = "https://api.replicate.com/v1";

interface ReplicatePrediction {
  id: string;
  status: "starting" | "processing" | "succeeded" | "failed" | "canceled";
  output: string[] | string | null;
  error: string | null;
}

function getAspectRatioString(ar: AspectRatio): string {
  return ar.value;
}

function buildReplicateInput(req: GenerationRequest): Record<string, any> {
  const input: Record<string, any> = {
    prompt: req.prompt,
  };

  // Aspect ratio
  const modelId = req.model.replicateId || "";

  if (modelId.includes("flux")) {
    input.aspect_ratio = getAspectRatioString(req.aspectRatio);
  } else if (modelId.includes("sdxl")) {
    input.width = req.aspectRatio.width;
    input.height = req.aspectRatio.height;
  } else if (modelId.includes("qwen")) {
    input.size = `${req.aspectRatio.width}x${req.aspectRatio.height}`;
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

  // Batch size
  if (req.batchSize > 1) {
    input.num_outputs = req.batchSize;
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

  // If "Prefer: wait" returned a completed prediction
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

export async function generateWithReplicate(
  token: string,
  req: GenerationRequest,
  onProgress?: (status: string) => void
): Promise<string[]> {
  const predictionId = await createReplicatePrediction(token, req);
  return pollReplicatePrediction(token, predictionId, onProgress);
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

  // Need to poll
  const result = await pollReplicatePrediction(token, data.id, onProgress);
  return result[0];
}
