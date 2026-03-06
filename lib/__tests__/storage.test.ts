import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock expo-file-system/legacy
vi.mock("expo-file-system/legacy", () => ({
  documentDirectory: "file:///data/user/0/com.inkform/files/",
  cacheDirectory: "file:///data/user/0/com.inkform/cache/",
  getInfoAsync: vi.fn().mockResolvedValue({ exists: false }),
  makeDirectoryAsync: vi.fn().mockResolvedValue(undefined),
  downloadAsync: vi.fn().mockImplementation((_url: string, dest: string) =>
    Promise.resolve({ uri: dest })
  ),
  deleteAsync: vi.fn().mockResolvedValue(undefined),
}));

// Mock AsyncStorage
vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: vi.fn().mockResolvedValue(null),
    setItem: vi.fn().mockResolvedValue(undefined),
    removeItem: vi.fn().mockResolvedValue(undefined),
  },
}));

// Mock react-native Platform
vi.mock("react-native", () => ({
  Platform: { OS: "android" },
}));

import {
  downloadImageToLocal,
  saveImageToGallery,
  getGalleryImages,
  deleteGalleryImage,
} from "../storage/app-storage";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as FileSystem from "expo-file-system/legacy";

describe("downloadImageToLocal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (FileSystem.getInfoAsync as any).mockResolvedValue({ exists: false });
    (FileSystem.makeDirectoryAsync as any).mockResolvedValue(undefined);
    (FileSystem.downloadAsync as any).mockImplementation((_url: string, dest: string) =>
      Promise.resolve({ uri: dest })
    );
  });

  it("returns local file:// URIs unchanged", async () => {
    const localUri = "file:///data/user/0/com.inkform/files/inkform_images/test.jpg";
    const result = await downloadImageToLocal(localUri);
    expect(result).toBe(localUri);
    expect(FileSystem.downloadAsync).not.toHaveBeenCalled();
  });

  it("downloads remote http:// URLs to local storage", async () => {
    const remoteUrl = "https://replicate.delivery/pbxt/abc123/output.jpg";
    const result = await downloadImageToLocal(remoteUrl);
    expect(FileSystem.downloadAsync).toHaveBeenCalledWith(
      remoteUrl,
      expect.stringContaining("inkform_images/")
    );
    expect(result).toContain("file:///");
  });

  it("uses .png extension for PNG URLs", async () => {
    const remoteUrl = "https://example.com/image.png?token=abc";
    await downloadImageToLocal(remoteUrl);
    const dest = (FileSystem.downloadAsync as any).mock.calls[0][1];
    expect(dest).toMatch(/\.png$/);
  });

  it("uses .jpg extension for non-PNG URLs", async () => {
    const remoteUrl = "https://example.com/image?format=jpeg";
    await downloadImageToLocal(remoteUrl);
    const dest = (FileSystem.downloadAsync as any).mock.calls[0][1];
    expect(dest).toMatch(/\.jpg$/);
  });
});

describe("saveImageToGallery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (AsyncStorage.getItem as any).mockResolvedValue(null);
    (AsyncStorage.setItem as any).mockResolvedValue(undefined);
    (FileSystem.getInfoAsync as any).mockResolvedValue({ exists: false });
    (FileSystem.makeDirectoryAsync as any).mockResolvedValue(undefined);
    (FileSystem.downloadAsync as any).mockImplementation((_url: string, dest: string) =>
      Promise.resolve({ uri: dest })
    );
  });

  it("returns a GalleryImage with a local URI", async () => {
    const result = await saveImageToGallery({
      uri: "https://replicate.delivery/pbxt/abc123/output.jpg",
      prompt: "a beautiful landscape",
      provider: "replicate",
      model: "flux-2-max",
      aspectRatio: "1:1",
    });

    expect(result.id).toBeTruthy();
    expect(result.uri).toContain("file:///");
    expect(result.prompt).toBe("a beautiful landscape");
    expect(result.provider).toBe("replicate");
    expect(result.model).toBe("flux-2-max");
    expect(result.collections).toEqual([]);
    expect(result.createdAt).toBeGreaterThan(0);
  });

  it("persists image to AsyncStorage", async () => {
    await saveImageToGallery({
      uri: "https://example.com/image.jpg",
      prompt: "test prompt",
      provider: "google",
      model: "imagen-4",
      aspectRatio: "16:9",
    });

    expect(AsyncStorage.setItem).toHaveBeenCalledWith(
      "inkform_gallery",
      expect.stringContaining("test prompt")
    );
  });

  it("stores local URI not remote URL in AsyncStorage", async () => {
    await saveImageToGallery({
      uri: "https://example.com/remote-image.jpg",
      prompt: "test",
      provider: "replicate",
      model: "flux-2-max",
      aspectRatio: "1:1",
    });

    const storedData = (AsyncStorage.setItem as any).mock.calls[0][1];
    const parsed = JSON.parse(storedData);
    expect(parsed[0].uri).toContain("file:///");
    expect(parsed[0].uri).not.toContain("https://");
  });

  it("caps gallery at 500 images", async () => {
    // Simulate 500 existing images
    const existingImages = Array.from({ length: 500 }, (_, i) => ({
      id: String(i),
      uri: `file:///data/user/0/com.inkform/files/inkform_images/img_${i}.jpg`,
      prompt: `prompt ${i}`,
      provider: "replicate",
      model: "flux-2-max",
      aspectRatio: "1:1",
      createdAt: Date.now() - i * 1000,
      collections: [],
    }));
    (AsyncStorage.getItem as any).mockResolvedValue(JSON.stringify(existingImages));
    (FileSystem.getInfoAsync as any).mockResolvedValue({ exists: false });

    await saveImageToGallery({
      uri: "https://example.com/new-image.jpg",
      prompt: "new image",
      provider: "replicate",
      model: "flux-2-max",
      aspectRatio: "1:1",
    });

    const storedData = (AsyncStorage.setItem as any).mock.calls[0][1];
    const parsed = JSON.parse(storedData);
    expect(parsed.length).toBe(500);
    // New image should be first
    expect(parsed[0].prompt).toBe("new image");
  });
});

describe("deleteGalleryImage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("removes image from storage and deletes local file", async () => {
    const existingImages = [
      {
        id: "img1",
        uri: "file:///data/user/0/com.inkform/files/inkform_images/img1.jpg",
        prompt: "test",
        provider: "replicate",
        model: "flux-2-max",
        aspectRatio: "1:1",
        createdAt: Date.now(),
        collections: [],
      },
    ];
    (AsyncStorage.getItem as any).mockResolvedValue(JSON.stringify(existingImages));
    (FileSystem.getInfoAsync as any).mockResolvedValue({ exists: true });

    await deleteGalleryImage("img1");

    expect(FileSystem.deleteAsync).toHaveBeenCalledWith(
      "file:///data/user/0/com.inkform/files/inkform_images/img1.jpg",
      { idempotent: true }
    );
    const storedData = (AsyncStorage.setItem as any).mock.calls[0][1];
    expect(JSON.parse(storedData)).toHaveLength(0);
  });
});
