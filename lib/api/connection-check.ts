import type { ApiKeys } from "@/lib/types";

export interface ConnectionResult {
  provider: string;
  status: "verified" | "missing" | "rejected" | "unverified";
  message: string;
}

/** Read-only authentication checks; never starts inference or loads credits. */
export async function checkApiConnections(
  keys: ApiKeys,
): Promise<ConnectionResult[]> {
  const checks = [
    {
      provider: "Replicate",
      key: keys.replicateApiToken,
      url: "https://api.replicate.com/v1/account",
    },
    {
      provider: "Google",
      key: keys.googleApiKey,
      url: "https://generativelanguage.googleapis.com/v1beta/models",
    },
    {
      provider: "OpenAI",
      key: keys.openaiApiKey,
      url: "https://api.openai.com/v1/models",
    },
    {
      provider: "RunPod",
      key: keys.runpodApiKey,
      url: "https://rest.runpod.io/v1/endpoints",
    },
    {
      provider: "Civitai",
      key: keys.civitaiApiToken,
      url: "https://civitai.com/api/v1/me",
    },
  ];
  return Promise.all(
    checks.map(async ({ provider, key, url }): Promise<ConnectionResult> => {
      if (!key?.trim())
        return { provider, status: "missing", message: "No key configured." };
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);
      try {
        const headers: Record<string, string> = { Accept: "application/json" };
        if (provider === "Google") headers["x-goog-api-key"] = key.trim();
        else headers.Authorization = `Bearer ${key.trim()}`;
        const response = await fetch(url, {
          headers,
          signal: controller.signal,
        });
        if (response.status === 401)
          return {
            provider,
            status: "rejected",
            message: "Authentication rejected (401). Check or replace the key.",
          };
        if (!response.ok)
          return {
            provider,
            status: "unverified",
            message: `Check failed (HTTP ${response.status}). Permissions, limits, or service access may be responsible.`,
          };
        const data = await response.json();
        const valid =
          provider === "Replicate"
            ? typeof data.username === "string"
            : provider === "Google"
              ? Array.isArray(data.models)
              : provider === "OpenAI"
                ? Array.isArray(data.data)
                : provider === "RunPod"
                  ? Array.isArray(data)
                  : Boolean(data.id || data.user?.id);
        if (!valid)
          return {
            provider,
            status: "unverified",
            message:
              "Unexpected response; authentication could not be confirmed.",
          };
        const message =
          provider === "RunPod" && !keys.runpodEndpointId?.trim()
            ? "Key accepted. An endpoint is still needed for generation."
            : "Key accepted. Generation and billing have not been tested.";
        return { provider, status: "verified", message };
      } catch {
        return {
          provider,
          status: "unverified",
          message:
            "Could not complete the check. Check your connection and try again.",
        };
      } finally {
        clearTimeout(timeout);
      }
    }),
  );
}
