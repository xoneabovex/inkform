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
  const cleanPath = uri.split("?")[0].split("#")[0];
  const match = cleanPath.match(/\.([a-zA-Z0-9]+)$/);
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

export async function getGalleryImages(): Promise<GalleryImage[]> {
  if (Platform.OS === "web") {
    return parseStoredArray<GalleryImage>(
      await AsyncStorage.getItem(KEYS.GALLERY_WEB)
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

async function syncPromptHistoryBookmarkState(
  id: string,
  isBookmarked: boolean
): Promise<void> {
  const history = parseStoredArray<SavedPrompt>(
    await AsyncStorage.getItem(KEYS.PROMPT_HISTORY)
  );

  const updated = history.map((item) =>
    item.id === id ? { ...item, isBookmarked } : item
  );

  await AsyncStorage.setItem(KEYS.PROMPT_HISTORY, JSON.stringify(updated));
}

export async function createCollection(name: string): Promise<Collection> {
  const collections = parseStoredArray<Collection>(
    await AsyncStorage.getItem(KEYS.COLLECTIONS)
  );

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

export async function getPromptHistory(): Promise<SavedPrompt[]> {
  return parseStoredArray<SavedPrompt>(
    await AsyncStorage.getItem(KEYS.PROMPT_HISTORY)
  );
}

export async function addPromptToHistory(
  prompt: string,
  negativePrompt: string | undefined,
  provider: ProviderType,
  model: string
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
      item.model === model
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
    JSON.stringify(history.slice(0, MAX_HISTORY))
  );
}

export async function getBookmarks(): Promise<SavedPrompt[]> {
  return parseStoredArray<SavedPrompt>(
    await AsyncStorage.getItem(KEYS.BOOKMARKS)
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
      "Photo library permission denied. Please enable it in Settings."
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
        () => {}
      );
    }
  }
}
