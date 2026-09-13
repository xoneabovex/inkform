import type { GenerationRequest } from "@/lib/types";

// Verified using Google's authenticated models API, September 2026.
export const GOOGLE_IMAGE_MODELS: Record<string, string> = {
  "gemini-3-flash-image": "gemini-3.1-flash-image",
  "gemini-3-pro-image": "gemini-3-pro-image",
  "gemini-3.1-flash-lite-image": "gemini-3.1-flash-lite-image",
  "gemini-2.5-flash-image": "gemini-2.5-flash-image",
  "imagen-4": "gemini-3.1-flash-image",
  "imagen-4-fast": "gemini-3.1-flash-lite-image",
  "imagen-4-ultra": "gemini-3-pro-image",
};

export function buildGoogleImageRequest(req: GenerationRequest) {
  const parts: Record<string, unknown>[] = [{ text: req.prompt }];
  if (req.referenceImageUri) {
    const match = /^data:(image\/[\w.+-]+);base64,([\s\S]+)$/.exec(
      req.referenceImageUri,
    );
    if (match) {
      parts.push({ inlineData: { mimeType: match[1], data: match[2] } });
    } else if (/^https?:\/\//.test(req.referenceImageUri)) {
      parts.push({ fileData: { fileUri: req.referenceImageUri } });
    } else {
      throw new Error(
        "Prepare the reference image before sending it to Google.",
      );
    }
  }
  return {
    contents: [{ role: "user", parts }],
    generationConfig: {
      responseModalities: ["TEXT", "IMAGE"],
      imageConfig: { aspectRatio: req.aspectRatio.value },
    },
  };
}

// Keep the existing exported name for callers after the Imagen migration.
export async function generateWithGoogleImagen(
  apiKey: string,
  req: GenerationRequest,
  onProgress?: (status: string) => void,
): Promise<string[]> {
  const model = GOOGLE_IMAGE_MODELS[req.model.id];
  if (!model)
    throw new Error("Unknown Google image model. Select a current model.");
  const images: string[] = [];
  const count = Math.max(1, Math.min(4, Math.floor(req.batchSize)));
  for (let index = 0; index < count; index++) {
    onProgress?.(`Generating image ${index + 1} of ${count}...`);
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey,
        },
        body: JSON.stringify(buildGoogleImageRequest(req)),
      },
    );
    if (!response.ok) {
      throw new Error(
        `Google image request failed (HTTP ${response.status}). Check the key, model access, and billing in Settings.`,
      );
    }
    const data = await response.json();
    const current: string[] = [];
    for (const candidate of data.candidates ?? []) {
      for (const part of candidate.content?.parts ?? []) {
        if (part.inlineData?.data && !part.thought) {
          current.push(
            `data:${part.inlineData.mimeType ?? "image/png"};base64,${part.inlineData.data}`,
          );
        }
      }
    }
    if (!current.length)
      throw new Error("Google returned no image. Try adjusting the prompt.");
    images.push(...current);
  }
  return images;
}
