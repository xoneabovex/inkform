import * as FileSystem from "expo-file-system/legacy";
import { Platform } from "react-native";

function mimeTypeForUri(uri: string): string {
  const path = uri.split("?")[0].split("#")[0].toLowerCase();
  if (path.endsWith(".png")) return "image/png";
  if (path.endsWith(".webp")) return "image/webp";
  if (path.endsWith(".gif")) return "image/gif";
  if (path.endsWith(".heic") || path.endsWith(".heif")) return "image/heic";
  return "image/jpeg";
}

function blobToDataUri(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () =>
      reject(reader.error ?? new Error("Could not read image"));
    reader.readAsDataURL(blob);
  });
}

/**
 * Cloud image APIs cannot read an Android/iOS file:// URI. Convert local
 * picker results to a portable data URI while leaving hosted/data inputs alone.
 */
export async function prepareImageInput(uri: string): Promise<string> {
  if (
    uri.startsWith("https://") ||
    uri.startsWith("http://") ||
    uri.startsWith("data:image/")
  ) {
    return uri;
  }

  if (Platform.OS === "web") {
    const response = await fetch(uri);
    if (!response.ok) {
      throw new Error("Could not read the selected reference image");
    }
    return blobToDataUri(await response.blob());
  }

  const normalizedUri = uri.startsWith("/") ? `file://${uri}` : uri;
  const base64 = await FileSystem.readAsStringAsync(normalizedUri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  return `data:${mimeTypeForUri(uri)};base64,${base64}`;
}
