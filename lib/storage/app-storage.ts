import AsyncStorage from "@react-native-async-storage/async-storage";
import * as FileSystem from "expo-file-system/legacy";
import * as MediaLibrary from "expo-media-library";
import { Platform } from "react-native";
import type {
  GalleryImage,
  Collection,
  SavedPrompt,
  ProviderType,
} from "@/lib/types";

const KEYS = {
  COLLECTIONS: "inkform_collections",
  PROMPT_HISTORY: "inkform_prompt_history",
  BOOKMARKS: "inkform_bookmarks",
  SETTINGS: "inkform_settings",
  REUSE_SETTINGS: "inkform_reuse_settings",
};

const MAX_GALLERY_IMAGES = 500;

/**
 * Gallery metadata is stored in the filesystem (not AsyncStorage) to bypass
 * the Android 2MB SQLite limit that causes crashes with large galleries.
 */
const GALLERY_FILE =
  (FileSystem.documentDirectory || "") + "inkform_gallery_metadata.json";

// ===== Image Filesystem Helpers =====

function getImagesDir(): string {
  return (FileSystem.documentDirectory || "") + "inkform_images/";
}

/**
 * Extracts file extension from a URI, handling query parameters and fragments.
 * Falls back to "jpg" if no extension is found.
 */
function getFileExtension(uri: string): string {
  const cleanPath = uri.split("?")[0].split("#")[0];
  const match = cleanPath.match(/\.(\w+)$/);
  return match ? match[1].toLowerCase() : "jpg";
}

async function ensureImagesDirExists(): Promise<void> {
  if (Platform.OS === "web") return;
  const dir = getImagesDir();
  const info = await FileSystem.getInfoAsync(dir);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
  }
}

/**
 * Downloads a remote image URL to permanent local storage.
 * If the URI is already a local file:// path, returns it as-is.
 * Returns the local file:// URI.
 */
export async function downloadImageToLocal(
  remoteUri: string
): Promise<string> {
  if (Platform.OS === "web") return remoteUri;

  // Already a local file — nothing to do
  if (remoteUri.startsWith("file://") || remoteUri.startsWith("/")) {
    return remoteUri;
  }

  await ensureImagesDirExists();

  const ext = getFileExtension(remoteUri);
  const filename = `inkform_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const destUri = getImagesDir() + filename;

  const result = await FileSystem.downloadAsync(remoteUri, destUri);
  return result.uri;
}

/**
 * Deletes a local image file from the filesystem.
 * Silently ignores errors (file may already be deleted).
 */
async function deleteLocalImageFile(uri: string): Promise<void> {
  if (Platform.OS === "web") return;
  if (!uri.startsWith("file://")) return;
  try {
    const info = await FileSystem.getInfoAsync(uri);
    if (info.exists) {
      await FileSystem.deleteAsync(uri, { idempotent: true });
    }
  } catch {
    // Ignore — file may already be gone
  }
}

// ===== Gallery (filesystem-based metadata) =====

export async function getGalleryImages(): Promise<GalleryImage[]> {
  if (Platform.OS === "web") {
    const data = await AsyncStorage.getItem("inkform_gallery");
    return data ? JSON.parse(data) : [];
  }
  try {
    const info = await FileSystem.getInfoAsync(GALLERY_FILE);
    if (!info.exists) return [];
    const data = await FileSystem.readAsStringAsync(GALLERY_FILE);
    return JSON.parse(data);
  } catch (error) {
    console.error("Failed to read gallery file:", error);
    return [];
  }
}

async function writeGalleryImages(images: GalleryImage[]): Promise<void> {
  if (Platform.OS === "web") {
    await AsyncStorage.setItem("inkform_gallery", JSON.stringify(images));
  } else {
    await FileSystem.writeAsStringAsync(
      GALLERY_FILE,
      JSON.stringify(images)
    );
  }
}

export async function saveGalleryImage(image: GalleryImage): Promise<void> {
  const images = await getGalleryImages();
  images.unshift(image);

  // Enforce 500-image cap — delete oldest non-protected images and their files
  if (images.length > MAX_GALLERY_IMAGES) {
    let removeCount = images.length - MAX_GALLERY_IMAGES;
    for (let i = images.length - 1; i >= 0 && removeCount > 0; i--) {
      if (!images[i].isProtected) {
        const old = images.splice(i, 1)[0];
        await deleteLocalImageFile(old.uri);
        removeCount--;
      }
    }
  }

  await writeGalleryImages(images);
}

/**
 * Convenience: download image to local storage, create a GalleryImage, and persist it.
 * This is the primary entry point called after generation.
 */
export async function saveImageToGallery(params: {
  uri: string;
  prompt: string;
  negativePrompt?: string;
  provider: ProviderType;
  model: string;
  aspectRatio: string;
  seed?: number;
  samplingMethod?: string;
  cfg?: number;
  steps?: number;
}): Promise<GalleryImage> {
  // Download to permanent local storage so the image never expires
  let localUri = params.uri;
  try {
    localUri = await downloadImageToLocal(params.uri);
  } catch {
    // If download fails, fall back to remote URI (better than nothing)
    localUri = params.uri;
  }

  const image: GalleryImage = {
    id: Date.now().toString() + Math.random().toString(36).slice(2, 6),
    uri: localUri,
    prompt: params.prompt,
    negativePrompt: params.negativePrompt,
    provider: params.provider,
    model: params.model,
    aspectRatio: params.aspectRatio,
    createdAt: Date.now(),
    collections: [],
    seed: params.seed,
    samplingMethod: params.samplingMethod,
    cfg: params.cfg,
    steps: params.steps,
  };
  await saveGalleryImage(image);
  return image;
}

export async function deleteGalleryImage(id: string): Promise<void> {
  const images = await getGalleryImages();
  const target = images.find((img) => img.id === id);
  if (target) {
    await deleteLocalImageFile(target.uri);
  }
  const filtered = images.filter((img) => img.id !== id);
  await writeGalleryImages(filtered);
}

export async function updateGalleryImage(
  id: string,
  updates: Partial<GalleryImage>
): Promise<void> {
  const images = await getGalleryImages();
  const idx = images.findIndex((img) => img.id === id);
  if (idx >= 0) {
    images[idx] = { ...images[idx], ...updates };
    await writeGalleryImages(images);
  }
}

/**
 * Toggle the isProtected (favorite) flag on a gallery image.
 * Protected images are exempt from the 500-image auto-cleanup cap.
 */
export async function toggleProtectedImage(id: string): Promise<boolean> {
  const images = await getGalleryImages();
  const idx = images.findIndex((img) => img.id === id);
  if (idx < 0) return false;
  const newValue = !images[idx].isProtected;
  images[idx].isProtected = newValue;
  await writeGalleryImages(images);
  return newValue;
}

// ===== Save to Device Camera Roll =====

/**
 * Saves an image to the device's camera roll / photo library.
 * Handles all URI types: file://, absolute paths, and remote HTTP URLs.
 * Requests permission first and uses createAssetAsync (most reliable on Android).
 */
export async function saveToDeviceGallery(
  uri: string
): Promise<boolean> {
  if (Platform.OS === "web") return false;

  // 1. Request permission
  const { status } = await MediaLibrary.requestPermissionsAsync();
  if (status !== "granted") {
    throw new Error(
      "Photo library permission denied. Please enable it in Settings."
    );
  }

  // 2. Ensure we have a local file:/// URI (Android requires this)
  let localUri = uri;

  if (uri.startsWith("http://") || uri.startsWith("https://")) {
    // Remote URL — download to cache first
    const ext = getFileExtension(uri);
    const filename = `inkform_save_${Date.now()}_${Math.random().toString(36).slice(2, 6)}.${ext}`;
    const dest = (FileSystem.cacheDirectory || "") + filename;
    const result = await FileSystem.downloadAsync(uri, dest);
    localUri = result.uri;
  } else if (!uri.startsWith("file://") && uri.startsWith("/")) {
    // Absolute path without file:// prefix
    localUri = `file://${uri}`;
  }

  // 3. Verify the file exists before attempting to save
  try {
    const info = await FileSystem.getInfoAsync(localUri);
    if (!info.exists) {
      throw new Error("Image file not found on device");
    }
  } catch (e: any) {
    // getInfoAsync can throw on some URIs; proceed anyway
    if (e.message === "Image file not found on device") throw e;
  }

  // 4. Save using createAssetAsync (most reliable, returns asset, works on Android)
  await MediaLibrary.createAssetAsync(localUri);
  return true;
}

// ===== Collections =====

export async function getCollections(): Promise<Collection[]> {
  const data = await AsyncStorage.getItem(KEYS.COLLECTIONS);
  return data ? JSON.parse(data) : [];
}

export async function createCollection(name: string): Promise<Collection> {
  const collections = await getCollections();
  const newCol: Collection = {
    id: Date.now().toString(),
    name,
    createdAt: Date.now(),
  };
  collections.push(newCol);
  await AsyncStorage.setItem(
    KEYS.COLLECTIONS,
    JSON.stringify(collections)
  );
  return newCol;
}

export async function deleteCollection(id: string): Promise<void> {
  const collections = await getCollections();
  const filtered = collections.filter((c) => c.id !== id);
  await AsyncStorage.setItem(
    KEYS.COLLECTIONS,
    JSON.stringify(filtered)
  );
  // Also remove collection references from gallery images
  const images = await getGalleryImages();
  const updated = images.map((img) => ({
    ...img,
    collections: img.collections.filter((cid) => cid !== id),
  }));
  await writeGalleryImages(updated);
}

export async function addImageToCollection(
  imageId: string,
  collectionId: string
): Promise<void> {
  const images = await getGalleryImages();
  const idx = images.findIndex((img) => img.id === imageId);
  if (idx >= 0 && !images[idx].collections.includes(collectionId)) {
    images[idx].collections.push(collectionId);
    await writeGalleryImages(images);
  }
}

export async function removeImageFromCollection(
  imageId: string,
  collectionId: string
): Promise<void> {
  const images = await getGalleryImages();
  const idx = images.findIndex((img) => img.id === imageId);
  if (idx >= 0) {
    images[idx].collections = images[idx].collections.filter(
      (cid) => cid !== collectionId
    );
    await writeGalleryImages(images);
  }
}

// ===== Prompt History =====

const MAX_HISTORY = 50;

export async function getPromptHistory(): Promise<SavedPrompt[]> {
  const data = await AsyncStorage.getItem(KEYS.PROMPT_HISTORY);
  return data ? JSON.parse(data) : [];
}

export async function addPromptToHistory(
  prompt: string,
  negativePrompt: string | undefined,
  provider: ProviderType,
  model: string
): Promise<void> {
  const history = await getPromptHistory();
  const entry: SavedPrompt = {
    id: Date.now().toString(),
    prompt,
    negativePrompt,
    provider,
    model,
    createdAt: Date.now(),
    isBookmarked: false,
  };
  history.unshift(entry);
  if (history.length > MAX_HISTORY) {
    history.pop();
  }
  await AsyncStorage.setItem(
    KEYS.PROMPT_HISTORY,
    JSON.stringify(history)
  );
}

export async function savePromptToHistory(params: {
  prompt: string;
  negativePrompt?: string;
  provider: ProviderType;
  model: string;
}): Promise<void> {
  await addPromptToHistory(
    params.prompt,
    params.negativePrompt,
    params.provider,
    params.model
  );
}

export async function clearPromptHistory(): Promise<void> {
  await AsyncStorage.setItem(KEYS.PROMPT_HISTORY, JSON.stringify([]));
}

// ===== Bookmarks =====

export async function getBookmarks(): Promise<SavedPrompt[]> {
  const data = await AsyncStorage.getItem(KEYS.BOOKMARKS);
  return data ? JSON.parse(data) : [];
}

export async function addBookmark(prompt: SavedPrompt): Promise<void> {
  const bookmarks = await getBookmarks();
  const exists = bookmarks.some((b) => b.id === prompt.id);
  if (!exists) {
    bookmarks.unshift({ ...prompt, isBookmarked: true });
    await AsyncStorage.setItem(
      KEYS.BOOKMARKS,
      JSON.stringify(bookmarks)
    );
  }
}

export async function removeBookmark(id: string): Promise<void> {
  const bookmarks = await getBookmarks();
  const filtered = bookmarks.filter((b) => b.id !== id);
  await AsyncStorage.setItem(KEYS.BOOKMARKS, JSON.stringify(filtered));
}

// ===== Settings =====

export interface AppSettings {
  defaultProvider: ProviderType;
  defaultAspectRatio: string;
}

const DEFAULT_SETTINGS: AppSettings = {
  defaultProvider: "replicate",
  defaultAspectRatio: "1:1",
};

export async function getSettings(): Promise<AppSettings> {
  const data = await AsyncStorage.getItem(KEYS.SETTINGS);
  return data
    ? { ...DEFAULT_SETTINGS, ...JSON.parse(data) }
    : DEFAULT_SETTINGS;
}

export async function saveSettings(
  settings: Partial<AppSettings>
): Promise<void> {
  const current = await getSettings();
  const updated = { ...current, ...settings };
  await AsyncStorage.setItem(KEYS.SETTINGS, JSON.stringify(updated));
}

// ===== Reuse Settings (pre-fill Generate tab from gallery) =====

export interface ReuseSettings {
  prompt: string;
  negativePrompt?: string;
  provider: ProviderType;
  modelId: string;
  aspectRatio?: string;
  cfg?: number;
  steps?: number;
  seed?: number;
  samplingMethod?: string;
  clipSkip?: number;
}

export async function saveReuseSettings(
  settings: ReuseSettings
): Promise<void> {
  await AsyncStorage.setItem(
    KEYS.REUSE_SETTINGS,
    JSON.stringify(settings)
  );
}

export async function getReuseSettings(): Promise<ReuseSettings | null> {
  const data = await AsyncStorage.getItem(KEYS.REUSE_SETTINGS);
  return data ? JSON.parse(data) : null;
}

export async function clearReuseSettings(): Promise<void> {
  await AsyncStorage.removeItem(KEYS.REUSE_SETTINGS);
}
