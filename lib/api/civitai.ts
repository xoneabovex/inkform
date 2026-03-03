import type { CivitaiModelPreview } from "@/lib/types";

/**
 * Extract Civitai model version ID from a URL or raw ID string.
 * Supports formats:
 * - "12345" (raw ID)
 * - "https://civitai.com/models/12345" (model page)
 * - "https://civitai.com/api/v1/model-versions/12345"
 */
export function parseCivitaiId(input: string): string | null {
  const trimmed = input.trim();
  // Pure numeric ID
  if (/^\d+$/.test(trimmed)) {
    return trimmed;
  }
  // URL with model-versions
  const versionMatch = trimmed.match(/model-versions\/(\d+)/);
  if (versionMatch) return versionMatch[1];
  // URL with models/ID
  const modelMatch = trimmed.match(/models\/(\d+)/);
  if (modelMatch) return modelMatch[1];
  return null;
}

/**
 * Fetch model version info from Civitai API.
 */
export async function fetchCivitaiModelVersion(
  versionId: string,
  civitaiToken?: string
): Promise<CivitaiModelPreview | null> {
  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (civitaiToken) {
      headers["Authorization"] = `Bearer ${civitaiToken}`;
    }

    const response = await fetch(
      `https://civitai.com/api/v1/model-versions/${versionId}`,
      { headers }
    );

    if (!response.ok) {
      console.warn(`Civitai API returned ${response.status}`);
      return null;
    }

    const data = await response.json();
    const thumbnailUrl =
      data.images && data.images.length > 0 ? data.images[0].url : null;

    return {
      id: data.id,
      name: data.model?.name
        ? `${data.model.name} - ${data.name}`
        : data.name || `Model ${versionId}`,
      thumbnailUrl,
      baseModel: data.baseModel,
    };
  } catch (error) {
    console.error("Failed to fetch Civitai model:", error);
    return null;
  }
}
