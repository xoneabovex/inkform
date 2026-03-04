import type { GenerationRequest } from "@/lib/types";

interface RunPodResponse {
  id: string;
  status: "IN_QUEUE" | "IN_PROGRESS" | "COMPLETED" | "FAILED" | "CANCELLED";
  output?: {
    images?: string[];
    image?: string;
    error?: string;
  };
  error?: string;
}

export async function generateWithRunPod(
  apiKey: string,
  endpointId: string,
  req: GenerationRequest,
  civitaiModelId?: string,
  civitaiLoraIds?: string[],
  civitaiToken?: string,
  onProgress?: (status: string) => void
): Promise<string[]> {
  const input: Record<string, any> = {
    prompt: req.prompt,
    negative_prompt: req.negativePrompt || "",
    width: req.aspectRatio.width,
    height: req.aspectRatio.height,
    num_images: req.batchSize,
    guidance_scale: req.cfg ?? 7,
    num_inference_steps: req.steps ?? 30,
  };

  // Civitai model — prefer inline req.civitaiModelId, fallback to passed arg
  const effectiveModelId = req.civitaiModelId || civitaiModelId;
  if (effectiveModelId) {
    input.civitai_model_version_id = effectiveModelId;
  }

  // LoRAs — pass as [{id, weight}] objects matching the handler schema
  if (req.loraEntries && req.loraEntries.length > 0) {
    input.civitai_loras = req.loraEntries.map((l) => ({ id: l.id, weight: l.weight }));
  } else if (civitaiLoraIds && civitaiLoraIds.length > 0) {
    input.civitai_loras = civitaiLoraIds.map((id) => ({ id, weight: 0.8 }));
  }

  if (civitaiToken) {
    input.civitai_token = civitaiToken;
  }
  if (req.seed !== undefined) {
    input.seed = req.seed;
  }
  if (req.samplingMethod) {
    input.sampling_method = req.samplingMethod;
  }
  if (req.clipSkip !== undefined) {
    input.clip_skip = req.clipSkip;
  }
  if (req.qualityBoost !== undefined) {
    input.quality_boost = req.qualityBoost;
  }

  onProgress?.("Submitting to RunPod...");

  // Try runsync first (waits up to 30s)
  const runResponse = await fetch(
    `https://api.runpod.ai/v2/${endpointId}/runsync`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ input }),
    }
  );

  if (!runResponse.ok) {
    const err = await runResponse.text();
    throw new Error(`RunPod API error: ${runResponse.status} - ${err}`);
  }

  const data: RunPodResponse = await runResponse.json();

  if (data.status === "COMPLETED") {
    return extractImages(data);
  }

  if (data.status === "FAILED") {
    throw new Error(data.error || data.output?.error || "RunPod generation failed");
  }

  // Poll for completion
  return pollRunPod(apiKey, endpointId, data.id, onProgress);
}

async function pollRunPod(
  apiKey: string,
  endpointId: string,
  jobId: string,
  onProgress?: (status: string) => void
): Promise<string[]> {
  const maxAttempts = 180; // 6 minutes for cold boots
  const pollInterval = 2000;

  for (let i = 0; i < maxAttempts; i++) {
    onProgress?.(i < 10 ? "Warming up worker..." : "Generating...");

    const response = await fetch(
      `https://api.runpod.ai/v2/${endpointId}/status/${jobId}`,
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
      }
    );

    if (!response.ok) {
      throw new Error(`RunPod poll error: ${response.status}`);
    }

    const data: RunPodResponse = await response.json();

    if (data.status === "COMPLETED") {
      return extractImages(data);
    }

    if (data.status === "FAILED") {
      throw new Error(
        data.error || data.output?.error || "RunPod generation failed"
      );
    }

    if (data.status === "CANCELLED") {
      throw new Error("RunPod job was cancelled");
    }

    await new Promise((resolve) => setTimeout(resolve, pollInterval));
  }

  throw new Error("RunPod generation timed out (cold boot may be needed)");
}

function extractImages(data: RunPodResponse): string[] {
  if (data.output?.images && data.output.images.length > 0) {
    return data.output.images;
  }
  if (data.output?.image) {
    return [data.output.image];
  }
  throw new Error("No images in RunPod response");
}
