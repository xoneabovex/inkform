import type { GenerationRequest } from "@/lib/types";

/**
 * Map model IDs to their API model names.
 */
function getGoogleModelName(modelId: string): string {
  switch (modelId) {
    case "imagen-4":
      return "imagen-4.0-generate-001";
    case "imagen-3":
    default:
      return "imagen-3.0-generate-002";
  }
}

/**
 * Map aspect ratio values to Google-supported values.
 * Google supports: "1:1", "3:4", "4:3", "9:16", "16:9"
 */
function mapAspectRatio(value: string): string {
  const supported = ["1:1", "3:4", "4:3", "9:16", "16:9"];
  if (supported.includes(value)) return value;
  // Map unsupported ratios to closest supported
  switch (value) {
    case "3:2":
      return "4:3";
    case "2:3":
      return "3:4";
    case "21:9":
      return "16:9";
    default:
      return "1:1";
  }
}

/**
 * Generate images using Google's Imagen API via the Gemini API.
 * Uses the REST endpoint with x-goog-api-key header for authentication.
 */
export async function generateWithGoogleImagen(
  apiKey: string,
  req: GenerationRequest,
  onProgress?: (status: string) => void
): Promise<string[]> {
  const modelName = getGoogleModelName(req.model.id);
  onProgress?.(`Sending to Google ${modelName}...`);

  const requestBody: Record<string, any> = {
    instances: [
      {
        prompt: req.prompt,
      },
    ],
    parameters: {
      sampleCount: Math.min(req.batchSize, 4),
      aspectRatio: mapAspectRatio(req.aspectRatio.value),
    },
  };

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:predict`,
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
    // Provide a user-friendly error message
    let message = `Google Imagen API error (${response.status})`;
    try {
      const errData = JSON.parse(err);
      if (errData.error?.message) {
        message = errData.error.message;
      }
    } catch {
      // Use raw text if not JSON
      if (err.length < 200) message = err;
    }
    throw new Error(message);
  }

  onProgress?.("Processing response...");

  const data = await response.json();

  if (data.predictions && data.predictions.length > 0) {
    return data.predictions
      .map((pred: any) => {
        if (pred.bytesBase64Encoded) {
          return `data:image/png;base64,${pred.bytesBase64Encoded}`;
        }
        if (pred.uri) {
          return pred.uri;
        }
        return null;
      })
      .filter(Boolean);
  }

  throw new Error("No images returned from Google Imagen. The prompt may have been blocked by safety filters.");
}
