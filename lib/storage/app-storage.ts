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
  GALLERY_WEB: "inkform_gallery",
};

const MAX_GALLERY_IMAGES = 500;
const MAX_HISTORY = 50;

const GALLERY_FILE =
  (FileSystem.documentDirectory || "") + "inkform_gallery_metadata.json";

function makeId(prefix = ""): string {
  return `${prefix}${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function parseStoredArray<T>(raw: string | null): T[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function getImagesDir(): string {
  return (FileSystem.documentDirectory || "") + "inkform_images/";
}

function getFileExtension(uri: string): string {
  const dataMime = uri.match(/^data:image\/([^;,]+)[;,]/i)?.[1]?.toLowerCase();
  if (dataMime) {
    if (dataMime === "jpeg") return "jpg";
    if (["png", "webp", "gif", "heic", "heif", "avif"].includes(dataMime)) {
      return dataMime;
    }
  }

  const cleanPath = uri.split("?")[0].split("#")[0];
  const match = cleanPath.match(/\.([a-zA-Z0-9]+)$/);
  const extension = match?.[1]?.toLowerCase();

  if (extension === "jpeg") return "jpg";
  return extension &&
    ["jpg", "png", "webp", "gif", "heic", "heif", "avif"].includes(extension)
    ? extension
    : "jpg";
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
 * Copies generated image data into Inkform's permanent app storage.
 * Provider responses may be remote URLs, base64 data URIs, content URIs, or
 * local files, so each format needs its own persistence path on Android.
 */
export async function downloadImageToLocal(sourceUri: string): Promise<string> {
  if (Platform.OS === "web") return sourceUri;
  if (!sourceUri) throw new Error("Image URI is empty");

  if (sourceUri.startsWith("file://") || sourceUri.startsWith("/")) {
    return sourceUri;
  }

  await ensureImagesDirExists();

  const extension = getFileExtension(sourceUri);
  const destination = `${getImagesDir()}inkform_${makeId()}.${extension}`;

  if (sourceUri.startsWith("data:image/")) {
    const separator = sourceUri.indexOf(",");
    if (separator < 0 || !sourceUri.slice(0, separator).includes(";base64")) {
      throw new Error("Unsupported image data URI");
    }

    await FileSystem.writeAsStringAsync(
      destination,
      sourceUri.slice(separator + 1),
      { encoding: FileSystem.EncodingType.Base64 },
    );
    return destination;
  }

  if (sourceUri.startsWith("content://")) {
    await FileSystem.copyAsync({ from: sourceUri, to: destination });
    return destination;
  }

  if (sourceUri.startsWith("http://") || sourceUri.startsWith("https://")) {
    const result = await FileSystem.downloadAsync(sourceUri, destination);
    return result.uri;
  }

  throw new Error("Unsupported image URI");
}

async function deleteLocalImageFile(uri: string): Promise<void> {
  if (Platform.OS === "web" || !uri.startsWith("file://")) return;

  try {
    const info = await FileSystem.getInfoAsync(uri);
    if (info.exists) {
      await FileSystem.deleteAsync(uri, { idempotent: true });
    }
  } catch {
    // The file may already have been removed outside Inkform.
  }
}

export async function getGalleryImages(): Promise<GalleryImage[]> {
  if (Platform.OS === "web") {
    return parseStoredArray<GalleryImage>(
      await AsyncStorage.getItem(KEYS.GALLERY_WEB),
    );
  }

  try {
    const info = await FileSystem.getInfoAsync(GALLERY_FILE);
    if (!info.exists) return [];
    const data = await FileSystem.readAsStringAsync(GALLERY_FILE);
    return parseStoredArray<GalleryImage>(data);
  } catch (error) {
    console.error("Failed to read gallery file:", error);
    return [];
  }
}

async function writeGalleryImages(images: GalleryImage[]): Promise<void> {
  const payload = JSON.stringify(images);

  if (Platform.OS === "web") {
    await AsyncStorage.setItem(KEYS.GALLERY_WEB, payload);
    return;
  }

  await FileSystem.writeAsStringAsync(GALLERY_FILE, payload);
}

export async function saveGalleryImage(image: GalleryImage): Promise<void> {
  const images = await getGalleryImages();
  images.unshift(image);

  if (images.length > MAX_GALLERY_IMAGES) {
    let removeCount = images.length - MAX_GALLERY_IMAGES;

    for (
      let index = images.length - 1;
      index >= 0 && removeCount > 0;
      index--
    ) {
      if (!images[index].isProtected) {
        const [removed] = images.splice(index, 1);
        await deleteLocalImageFile(removed.uri);
        removeCount--;
      }
    }
  }

  await writeGalleryImages(images);
}

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
  const localUri = await downloadImageToLocal(params.uri);
  const image: GalleryImage = {
    id: makeId("image_"),
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
  const target = images.find((image) => image.id === id);

  if (target) {
    await deleteLocalImageFile(target.uri);
  }

  await writeGalleryImages(images.filter((image) => image.id !== id));
}

export async function updateGalleryImage(
  id: string,
  updates: Partial<GalleryImage>,
): Promise<void> {
  const images = await getGalleryImages();
  const index = images.findIndex((image) => image.id === id);
  if (index < 0) return;

  images[index] = { ...images[index], ...updates };
  await writeGalleryImages(images);
}

export async function toggleProtectedImage(id: string): Promise<boolean> {
  const images = await getGalleryImages();
  const index = images.findIndex((image) => image.id === id);
  if (index < 0) return false;

  const isProtected = !images[index].isProtected;
  images[index] = { ...images[index], isProtected };
  await writeGalleryImages(images);
  return isProtected;
}

async function syncPromptHistoryBookmarkState(
  id: string,
  isBookmarked: boolean,
): Promise<void> {
  const history = parseStoredArray<SavedPrompt>(
    await AsyncStorage.getItem(KEYS.PROMPT_HISTORY),
  );

  const updated = history.map((item) =>
    item.id === id ? { ...item, isBookmarked } : item,
  );

  await AsyncStorage.setItem(KEYS.PROMPT_HISTORY, JSON.stringify(updated));
}

export async function getCollections(): Promise<Collection[]> {
  return parseStoredArray<Collection>(
    await AsyncStorage.getItem(KEYS.COLLECTIONS),
  );
}

export async function createCollection(name: string): Promise<Collection> {
  const collections = await getCollections();

  const trimmed = name.trim();
  if (!trimmed) {
    throw new Error("Collection name is required");
  }

  const newCol: Collection = {
    id: makeId("col_"),
    name: trimmed,
    createdAt: Date.now(),
  };

  collections.push(newCol);
  await AsyncStorage.setItem(KEYS.COLLECTIONS, JSON.stringify(collections));
  return newCol;
}

export async function deleteCollection(id: string): Promise<void> {
  const collections = await getCollections();
  await AsyncStorage.setItem(
    KEYS.COLLECTIONS,
    JSON.stringify(collections.filter((collection) => collection.id !== id)),
  );

  const images = await getGalleryImages();
  const updated = images.map((image) => ({
    ...image,
    collections: (image.collections ?? []).filter(
      (collectionId) => collectionId !== id,
    ),
  }));
  await writeGalleryImages(updated);
}

export async function addImageToCollection(
  imageId: string,
  collectionId: string,
): Promise<void> {
  const images = await getGalleryImages();
  const index = images.findIndex((image) => image.id === imageId);
  if (index < 0) return;

  const collections = images[index].collections ?? [];
  if (collections.includes(collectionId)) return;

  images[index] = {
    ...images[index],
    collections: [...collections, collectionId],
  };
  await writeGalleryImages(images);
}

export async function removeImageFromCollection(
  imageId: string,
  collectionId: string,
): Promise<void> {
  const images = await getGalleryImages();
  const index = images.findIndex((image) => image.id === imageId);
  if (index < 0) return;

  images[index] = {
    ...images[index],
    collections: (images[index].collections ?? []).filter(
      (id) => id !== collectionId,
    ),
  };
  await writeGalleryImages(images);
}

export async function getPromptHistory(): Promise<SavedPrompt[]> {
  return parseStoredArray<SavedPrompt>(
    await AsyncStorage.getItem(KEYS.PROMPT_HISTORY),
  );
}

export async function addPromptToHistory(
  prompt: string,
  negativePrompt: string | undefined,
  provider: ProviderType,
  model: string,
): Promise<void> {
  const history = await getPromptHistory();
  const normalizedPrompt = prompt.trim();
  const normalizedNegative = negativePrompt?.trim() || undefined;

  if (!normalizedPrompt) return;

  const existingIndex = history.findIndex(
    (item) =>
      item.prompt === normalizedPrompt &&
      item.negativePrompt === normalizedNegative &&
      item.provider === provider &&
      item.model === model,
  );

  if (existingIndex >= 0) {
    const existing = history.splice(existingIndex, 1)[0];
    history.unshift({
      ...existing,
      createdAt: Date.now(),
    });
  } else {
    history.unshift({
      id: makeId("prompt_"),
      prompt: normalizedPrompt,
      negativePrompt: normalizedNegative,
      provider,
      model,
      createdAt: Date.now(),
      isBookmarked: false,
    });
  }

  await AsyncStorage.setItem(
    KEYS.PROMPT_HISTORY,
    JSON.stringify(history.slice(0, MAX_HISTORY)),
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
    params.model,
  );
}

export async function clearPromptHistory(): Promise<void> {
  await AsyncStorage.setItem(KEYS.PROMPT_HISTORY, JSON.stringify([]));
}

export async function getBookmarks(): Promise<SavedPrompt[]> {
  return parseStoredArray<SavedPrompt>(
    await AsyncStorage.getItem(KEYS.BOOKMARKS),
  );
}

export async function addBookmark(prompt: SavedPrompt): Promise<void> {
  const bookmarks = await getBookmarks();
  const exists = bookmarks.some((b) => b.id === prompt.id);

  if (!exists) {
    bookmarks.unshift({ ...prompt, isBookmarked: true });
    await AsyncStorage.setItem(KEYS.BOOKMARKS, JSON.stringify(bookmarks));
  }

  await syncPromptHistoryBookmarkState(prompt.id, true);
}

export async function removeBookmark(id: string): Promise<void> {
  const bookmarks = await getBookmarks();
  const filtered = bookmarks.filter((b) => b.id !== id);

  await AsyncStorage.setItem(KEYS.BOOKMARKS, JSON.stringify(filtered));
  await syncPromptHistoryBookmarkState(id, false);
}

export async function saveToDeviceGallery(uri: string): Promise<boolean> {
  if (Platform.OS === "web") return false;

  const { status } = await MediaLibrary.requestPermissionsAsync();
  if (status !== "granted") {
    throw new Error(
      "Photo library permission denied. Please enable it in Settings.",
    );
  }

  let localUri = uri;
  let tempUri: string | null = null;
  const writableDir = FileSystem.cacheDirectory || FileSystem.documentDirectory;

  if (uri.startsWith("http://") || uri.startsWith("https://")) {
    if (!writableDir) {
      throw new Error("No writable directory available for image download");
    }

    const ext = getFileExtension(uri);
    tempUri = `${writableDir}inkform_save_${makeId()}.${ext}`;
    const result = await FileSystem.downloadAsync(uri, tempUri);
    localUri = result.uri;
  } else if (uri.startsWith("/")) {
    localUri = `file://${uri}`;
  } else if (uri.startsWith("content://")) {
    if (!writableDir) {
      throw new Error("No writable directory available for image copy");
    }

    const ext = getFileExtension(uri);
    tempUri = `${writableDir}inkform_content_${makeId()}.${ext}`;
    await FileSystem.copyAsync({ from: uri, to: tempUri });
    localUri = tempUri;
  }

  const info = await FileSystem.getInfoAsync(localUri);
  if (!info.exists) {
    throw new Error("Image file not found on device");
  }

  try {
    await MediaLibrary.createAssetAsync(localUri);
    return true;
  } finally {
    if (tempUri) {
      await FileSystem.deleteAsync(tempUri, { idempotent: true }).catch(
        () => {},
      );
    }
  }
}

export interface AppSettings {
  defaultProvider: ProviderType;
  defaultAspectRatio: string;
}

const DEFAULT_SETTINGS: AppSettings = {
  defaultProvider: "replicate",
  defaultAspectRatio: "1:1",
};

export async function getSettings(): Promise<AppSettings> {
  const raw = await AsyncStorage.getItem(KEYS.SETTINGS);
  if (!raw) return DEFAULT_SETTINGS;

  try {
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export async function saveSettings(
  settings: Partial<AppSettings>,
): Promise<void> {
  const current = await getSettings();
  await AsyncStorage.setItem(
    KEYS.SETTINGS,
    JSON.stringify({ ...current, ...settings }),
  );
}

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
  settings: ReuseSettings,
): Promise<void> {
  await AsyncStorage.setItem(KEYS.REUSE_SETTINGS, JSON.stringify(settings));
}

export async function getReuseSettings(): Promise<ReuseSettings | null> {
  const raw = await AsyncStorage.getItem(KEYS.REUSE_SETTINGS);
  if (!raw) return null;

  try {
    return JSON.parse(raw) as ReuseSettings;
  } catch {
    await AsyncStorage.removeItem(KEYS.REUSE_SETTINGS);
    return null;
  }
}

export async function clearReuseSettings(): Promise<void> {
  await AsyncStorage.removeItem(KEYS.REUSE_SETTINGS);
}
