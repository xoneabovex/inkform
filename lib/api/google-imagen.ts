import type { GenerationRequest } from "@/lib/types";

// ===== Model routing =====

/**
 * Determine which API flow to use based on model ID.
 * - Imagen 4 models use the generateImages endpoint
 * - Nano Banana (Gemini 3 image) models use the generateContent endpoint
 */
function getModelConfig(modelId: string): {
  modelName: string;
  flow: "imagen" | "gemini";
} {
  switch (modelId) {
    case "imagen-4-ultra":
      return { modelName: "imagen-4.0-ultra-generate-001", flow: "imagen" };
    case "imagen-4-fast":
      return { modelName: "imagen-4.0-fast-generate-001", flow: "imagen" };
    case "gemini-3-flash-image":
      return { modelName: "gemini-3.1-flash-image-preview", flow: "gemini" };
    case "gemini-3-pro-image":
      return { modelName: "gemini-3-pro-image-preview", flow: "gemini" };
    case "gemini-2.5-flash-image":
      return { modelName: "gemini-2.5-flash-image", flow: "gemini" };
    case "imagen-4":
    default:
      return { modelName: "imagen-4.0-generate-001", flow: "imagen" };
  }
}

/**
 * Map aspect ratio values to Imagen-supported values.
 * Imagen 4 supports: "1:1", "3:4", "4:3", "9:16", "16:9"
 */
function mapAspectRatioForImagen(value: string): string {
  const supported = ["1:1", "3:4", "4:3", "9:16", "16:9"];
  if (supported.includes(value)) return value;
  switch (value) {
    case "3:2": return "4:3";
    case "2:3": return "3:4";
    case "21:9": return "16:9";
    default: return "1:1";
  }
}

/**
 * Map aspect ratio values to Gemini image generation supported values.
 * Gemini 3 supports: "1:1","1:4","1:8","2:3","3:2","3:4","4:1","4:3","4:5","5:4","8:1","9:16","16:9","21:9"
 */
function mapAspectRatioForGemini(value: string): string {
  const supported = [
    "1:1", "1:4", "1:8", "2:3", "3:2", "3:4", "4:1",
    "4:3", "4:5", "5:4", "8:1", "9:16", "16:9", "21:9",
  ];
  if (supported.includes(value)) return value;
  return "1:1";
}

// ===== Imagen 4 flow (generateImages endpoint) =====

async function generateWithImagen4(
  apiKey: string,
  modelName: string,
  req: GenerationRequest,
  onProgress?: (status: string) => void
): Promise<string[]> {
  onProgress?.(`Sending to ${modelName}...`);

  const requestBody: Record<string, any> = {
    prompt: req.prompt,
    config: {
      numberOfImages: Math.min(req.batchSize, 4),
      aspectRatio: mapAspectRatioForImagen(req.aspectRatio.value),
      personGeneration: "allow_adult",
    },
  };

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateImages`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify(requestBody),
    }
  );

  if (!response.ok) {
    const err = await response.text();
    let message = `Google Imagen API error (${response.status})`;
    try {
      const errData = JSON.parse(err);
      if (errData.error?.message) {
        message = errData.error.message;
      }
    } catch {
      if (err.length < 300) message = err;
    }
    throw new Error(message);
  }

  onProgress?.("Processing response...");
  const data = await response.json();

  // Response format: { generatedImages: [{ image: { imageBytes: "<base64>" } }] }
  if (data.generatedImages && data.generatedImages.length > 0) {
    return data.generatedImages
      .map((item: any) => {
        const bytes = item.image?.imageBytes;
        if (bytes) return `data:image/png;base64,${bytes}`;
        return null;
      })
      .filter(Boolean);
  }

  throw new Error(
    "No images returned from Imagen. The prompt may have been blocked by safety filters."
  );
}

// ===== Nano Banana / Gemini 3 image flow (generateContent endpoint) =====

async function generateWithGeminiImage(
  apiKey: string,
  modelName: string,
  req: GenerationRequest,
  onProgress?: (status: string) => void
): Promise<string[]> {
  onProgress?.(`Sending to ${modelName}...`);

  const requestBody: Record<string, any> = {
    contents: [
      {
        parts: [{ text: req.prompt }],
      },
    ],
    generationConfig: {
      responseModalities: ["IMAGE"],
      imageConfig: {
        aspectRatio: mapAspectRatioForGemini(req.aspectRatio.value),
      },
    },
  };

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify(requestBody),
    }
  );

  if (!response.ok) {
    const err = await response.text();
    let message = `Google Gemini Image API error (${response.status})`;
    try {
      const errData = JSON.parse(err);
      if (errData.error?.message) {
        message = errData.error.message;
      }
    } catch {
      if (err.length < 300) message = err;
    }
    throw new Error(message);
  }

  onProgress?.("Processing response...");
  const data = await response.json();

  // Response format: { candidates: [{ content: { parts: [{ inlineData: { data, mimeType } }] } }] }
  const images: string[] = [];
  const candidates = data.candidates ?? [];
  for (const candidate of candidates) {
    const parts = candidate.content?.parts ?? [];
    for (const part of parts) {
      if (part.inlineData?.data && !part.thought) {
        const mime = part.inlineData.mimeType ?? "image/png";
        images.push(`data:${mime};base64,${part.inlineData.data}`);
      }
    }
  }

  // Gemini generates 1 image per request — repeat for batch
  if (images.length > 0) {
    if (req.batchSize <= 1) return images;
    // For batch > 1, make parallel requests
    const extras = await Promise.allSettled(
      Array.from({ length: req.batchSize - 1 }, () =>
        generateWithGeminiImage(apiKey, modelName, { ...req, batchSize: 1 }, undefined)
      )
    );
    for (const result of extras) {
      if (result.status === "fulfilled") images.push(...result.value);
    }
    return images;
  }

  throw new Error(
    "No images returned from Gemini. The prompt may have been blocked by safety filters."
  );
}

// ===== Unified export =====

/**
 * Generate images using Google's Gemini API.
 * Routes to the correct endpoint based on model:
 * - Imagen 4 models → generateImages endpoint
 * - Nano Banana (Gemini 3 image) models → generateContent endpoint
 *
 * Authentication: x-goog-api-key header (Google AI Studio API key)
 */
export async function generateWithGoogleImagen(
  apiKey: string,
  req: GenerationRequest,
  onProgress?: (status: string) => void
): Promise<string[]> {
  const { modelName, flow } = getModelConfig(req.model.id);

  if (flow === "gemini") {
    return generateWithGeminiImage(apiKey, modelName, req, onProgress);
  }
  return generateWithImagen4(apiKey, modelName, req, onProgress);
}
