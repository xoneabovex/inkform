import type { GenerationRequest } from "@/lib/types";
import { generateWithReplicate } from "./replicate";
import { generateWithRunPod } from "./runpod";
import { generateWithGoogleImagen } from "./google-imagen";
import { getApiKey } from "@/lib/storage/secure-store";

export async function generateImages(
  req: GenerationRequest,
  onProgress?: (status: string) => void
): Promise<string[]> {
  switch (req.provider) {
    case "replicate": {
      const token = await getApiKey("replicateApiToken");
      if (!token) throw new Error("Replicate API token not configured. Go to Settings to add it.");
      return generateWithReplicate(token, req, onProgress);
    }

    case "runpod": {
      const apiKey = await getApiKey("runpodApiKey");
      const endpointId = await getApiKey("runpodEndpointId");
      const civitaiToken = await getApiKey("civitaiApiToken");
      if (!apiKey || !endpointId) {
        throw new Error("RunPod API key and Endpoint ID required. Go to Settings to add them.");
      }
      return generateWithRunPod(
        apiKey,
        endpointId,
        req,
        undefined,
        undefined,
        civitaiToken || undefined,
        onProgress
      );
    }

    case "google": {
      const apiKey = await getApiKey("googleApiKey");
      if (!apiKey) throw new Error("Google API key not configured. Go to Settings to add it.");
      return generateWithGoogleImagen(apiKey, req, onProgress);
    }

    default:
      throw new Error(`Unknown provider: ${req.provider}`);
  }
}
