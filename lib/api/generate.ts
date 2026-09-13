import type { GenerationRequest } from "@/lib/types";
import { generateWithReplicate } from "./replicate";
import { generateWithRunPod } from "./runpod";
import { generateWithGoogleImagen } from "./google-imagen";
import { getApiKey } from "@/lib/storage/secure-store";
import { prepareImageInput } from "./image-input";

export async function generateImages(
  req: GenerationRequest,
  onProgress?: (status: string) => void,
): Promise<string[]> {
  let preparedRequest = req;
  if (req.referenceImageUri) {
    onProgress?.("Preparing reference image...");
    preparedRequest = {
      ...req,
      referenceImageUri: await prepareImageInput(req.referenceImageUri),
    };
  }

  switch (preparedRequest.provider) {
    case "replicate": {
      const token = await getApiKey("replicateApiToken");
      if (!token)
        throw new Error(
          "Replicate API token not configured. Go to Settings to add it.",
        );

      const openaiApiKey =
        preparedRequest.model.replicateId === "openai/gpt-image-1"
          ? await getApiKey("openaiApiKey")
          : null;
      if (
        preparedRequest.model.replicateId === "openai/gpt-image-1" &&
        !openaiApiKey
      ) {
        throw new Error(
          "GPT Image 1 also requires an OpenAI API key. Add it in Settings.",
        );
      }

      return generateWithReplicate(token, preparedRequest, onProgress, {
        openaiApiKey: openaiApiKey || undefined,
      });
    }

    case "runpod": {
      const apiKey = await getApiKey("runpodApiKey");
      const endpointId = await getApiKey("runpodEndpointId");
      const civitaiToken = await getApiKey("civitaiApiToken");
      if (!apiKey || !endpointId) {
        throw new Error(
          "RunPod API key and Endpoint ID required. Go to Settings to add them.",
        );
      }
      return generateWithRunPod(
        apiKey,
        endpointId,
        preparedRequest,
        undefined,
        undefined,
        civitaiToken || undefined,
        onProgress,
      );
    }

    case "google": {
      const apiKey = await getApiKey("googleApiKey");
      if (!apiKey)
        throw new Error(
          "Google API key not configured. Go to Settings to add it.",
        );
      return generateWithGoogleImagen(apiKey, preparedRequest, onProgress);
    }

    default:
      throw new Error(`Unknown provider: ${preparedRequest.provider}`);
  }
}
