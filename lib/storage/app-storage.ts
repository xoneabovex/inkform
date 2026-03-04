import AsyncStorage from "@react-native-async-storage/async-storage";
import type {
  GalleryImage,
  Collection,
  SavedPrompt,
  ProviderType,
} from "@/lib/types";

const KEYS = {
  GALLERY: "inkform_gallery",
  COLLECTIONS: "inkform_collections",
  PROMPT_HISTORY: "inkform_prompt_history",
  BOOKMARKS: "inkform_bookmarks",
  SETTINGS: "inkform_settings",
  CIVITAI_BASE_MODEL: "inkform_civitai_base_model",
  CIVITAI_LORAS: "inkform_civitai_loras",
  REUSE_SETTINGS: "inkform_reuse_settings",
};

// ===== Gallery =====

export async function getGalleryImages(): Promise<GalleryImage[]> {
  const data = await AsyncStorage.getItem(KEYS.GALLERY);
  return data ? JSON.parse(data) : [];
}

export async function saveGalleryImage(image: GalleryImage): Promise<void> {
  const images = await getGalleryImages();
  images.unshift(image);
  await AsyncStorage.setItem(KEYS.GALLERY, JSON.stringify(images));
}

export async function deleteGalleryImage(id: string): Promise<void> {
  const images = await getGalleryImages();
  const filtered = images.filter((img) => img.id !== id);
  await AsyncStorage.setItem(KEYS.GALLERY, JSON.stringify(filtered));
}

export async function updateGalleryImage(
  id: string,
  updates: Partial<GalleryImage>
): Promise<void> {
  const images = await getGalleryImages();
  const idx = images.findIndex((img) => img.id === id);
  if (idx >= 0) {
    images[idx] = { ...images[idx], ...updates };
    await AsyncStorage.setItem(KEYS.GALLERY, JSON.stringify(images));
  }
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
  await AsyncStorage.setItem(KEYS.COLLECTIONS, JSON.stringify(collections));
  return newCol;
}

export async function deleteCollection(id: string): Promise<void> {
  const collections = await getCollections();
  const filtered = collections.filter((c) => c.id !== id);
  await AsyncStorage.setItem(KEYS.COLLECTIONS, JSON.stringify(filtered));
  // Also remove collection from all images
  const images = await getGalleryImages();
  const updated = images.map((img) => ({
    ...img,
    collections: img.collections.filter((cid) => cid !== id),
  }));
  await AsyncStorage.setItem(KEYS.GALLERY, JSON.stringify(updated));
}

export async function addImageToCollection(
  imageId: string,
  collectionId: string
): Promise<void> {
  const images = await getGalleryImages();
  const idx = images.findIndex((img) => img.id === imageId);
  if (idx >= 0 && !images[idx].collections.includes(collectionId)) {
    images[idx].collections.push(collectionId);
    await AsyncStorage.setItem(KEYS.GALLERY, JSON.stringify(images));
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
    await AsyncStorage.setItem(KEYS.GALLERY, JSON.stringify(images));
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
  await AsyncStorage.setItem(KEYS.PROMPT_HISTORY, JSON.stringify(history));
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
    await AsyncStorage.setItem(KEYS.BOOKMARKS, JSON.stringify(bookmarks));
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
  civitaiBaseModelId?: string;
  civitaiLoraIds?: string[];
}

const DEFAULT_SETTINGS: AppSettings = {
  defaultProvider: "replicate",
  defaultAspectRatio: "1:1",
};

export async function getSettings(): Promise<AppSettings> {
  const data = await AsyncStorage.getItem(KEYS.SETTINGS);
  return data ? { ...DEFAULT_SETTINGS, ...JSON.parse(data) } : DEFAULT_SETTINGS;
}

// ===== Reuse Settings (pre-fill Generate tab from gallery) =====

export interface ReuseSettings {
  prompt: string;
  negativePrompt?: string;
  provider: ProviderType;
  modelId: string;
  aspectRatioValue: string;
  cfg?: number;
  steps?: number;
  seed?: number;
  samplingMethod?: string;
  clipSkip?: number;
  qualityBoost?: boolean;
  civitaiModelInput?: string;
}

export async function saveReuseSettings(settings: ReuseSettings): Promise<void> {
  await AsyncStorage.setItem(KEYS.REUSE_SETTINGS, JSON.stringify(settings));
}

export async function getReuseSettings(): Promise<ReuseSettings | null> {
  const data = await AsyncStorage.getItem(KEYS.REUSE_SETTINGS);
  return data ? JSON.parse(data) : null;
}

export async function clearReuseSettings(): Promise<void> {
  await AsyncStorage.removeItem(KEYS.REUSE_SETTINGS);
}

export async function saveSettings(
  settings: Partial<AppSettings>
): Promise<void> {
  const current = await getSettings();
  const updated = { ...current, ...settings };
  await AsyncStorage.setItem(KEYS.SETTINGS, JSON.stringify(updated));
}
