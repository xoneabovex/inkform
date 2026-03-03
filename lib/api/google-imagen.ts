import type { GenerationRequest } from "@/lib/types";

/**
 * Generate images using Google's Imagen 3 API via the Generative Language API.
 * Uses the REST endpoint: https://generativelanguage.googleapis.com/v1beta/models/imagen-3.0-generate-002:predict
 */
export async function generateWithGoogleImagen(
  apiKey: string,
  req: GenerationRequest,
  onProgress?: (status: string) => void
): Promise<string[]> {
  onProgress?.("Sending to Google Imagen 3...");

  const requestBody: Record<string, any> = {
    instances: [
      {
        prompt: req.prompt,
      },
    ],
    parameters: {
      sampleCount: req.batchSize,
      aspectRatio: req.aspectRatio.value,
    },
  };

  if (req.negativePrompt) {
    requestBody.parameters.negativePrompt = req.negativePrompt;
  }

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/imagen-3.0-generate-002:predict?key=${apiKey}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    }
  );

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Google Imagen API error: ${response.status} - ${err}`);
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

  throw new Error("No images in Google Imagen response");
}
