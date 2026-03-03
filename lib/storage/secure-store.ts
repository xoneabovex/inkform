import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";
import type { ApiKeys } from "@/lib/types";

const KEY_PREFIX = "inkform_";

async function setItem(key: string, value: string): Promise<void> {
  const fullKey = KEY_PREFIX + key;
  if (Platform.OS === "web") {
    localStorage.setItem(fullKey, value);
  } else {
    await SecureStore.setItemAsync(fullKey, value);
  }
}

async function getItem(key: string): Promise<string | null> {
  const fullKey = KEY_PREFIX + key;
  if (Platform.OS === "web") {
    return localStorage.getItem(fullKey);
  }
  return SecureStore.getItemAsync(fullKey);
}

async function removeItem(key: string): Promise<void> {
  const fullKey = KEY_PREFIX + key;
  if (Platform.OS === "web") {
    localStorage.removeItem(fullKey);
  } else {
    await SecureStore.deleteItemAsync(fullKey);
  }
}

// API Key specific helpers
const API_KEY_KEYS = {
  runpodApiKey: "runpod_api_key",
  runpodEndpointId: "runpod_endpoint_id",
  civitaiApiToken: "civitai_api_token",
  replicateApiToken: "replicate_api_token",
  googleApiKey: "google_api_key",
} as const;

export async function saveApiKey(
  keyName: keyof ApiKeys,
  value: string
): Promise<void> {
  await setItem(API_KEY_KEYS[keyName], value);
}

export async function getApiKey(
  keyName: keyof ApiKeys
): Promise<string | null> {
  return getItem(API_KEY_KEYS[keyName]);
}

export async function removeApiKey(keyName: keyof ApiKeys): Promise<void> {
  await removeItem(API_KEY_KEYS[keyName]);
}

export async function getAllApiKeys(): Promise<ApiKeys> {
  const keys: ApiKeys = {};
  for (const [keyName, storageKey] of Object.entries(API_KEY_KEYS)) {
    const value = await getItem(storageKey);
    if (value) {
      (keys as any)[keyName] = value;
    }
  }
  return keys;
}

export async function hasApiKeysForProvider(
  provider: "runpod" | "replicate" | "google"
): Promise<boolean> {
  switch (provider) {
    case "runpod": {
      const apiKey = await getApiKey("runpodApiKey");
      const endpointId = await getApiKey("runpodEndpointId");
      return !!(apiKey && endpointId);
    }
    case "replicate": {
      const token = await getApiKey("replicateApiToken");
      return !!token;
    }
    case "google": {
      const key = await getApiKey("googleApiKey");
      return !!key;
    }
    default:
      return false;
  }
}
