import React, { useState, useCallback } from "react";
import {
  Text,
  View,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Dimensions,
  StyleSheet,
  Platform,
  Switch,
} from "react-native";
import { Image } from "expo-image";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { useToast } from "@/lib/toast-context";
import { useFocusEffect } from "@react-navigation/native";
import { getGalleryImages, saveGalleryImage } from "@/lib/storage/app-storage";
import { getApiKey } from "@/lib/storage/secure-store";
import { upscaleWithReplicate } from "@/lib/api/replicate";
import type { GalleryImage, UpscaleModel } from "@/lib/types";

const SCREEN_WIDTH = Dimensions.get("window").width;

export default function UpscaleScreen() {
  const colors = useColors();
  const { showToast } = useToast();

  const [images, setImages] = useState<GalleryImage[]>([]);
  const [selectedImage, setSelectedImage] = useState<GalleryImage | null>(null);
  const [upscaleModel, setUpscaleModel] = useState<UpscaleModel>("real-esrgan");
  const [scaleFactor, setScaleFactor] = useState(2);
  const [faceEnhance, setFaceEnhance] = useState(false);
  const [upscaling, setUpscaling] = useState(false);
  const [progressStatus, setProgressStatus] = useState("");
  const [resultImage, setResultImage] = useState<string | null>(null);
  const [showPicker, setShowPicker] = useState(false);

  useFocusEffect(
    useCallback(() => {
      loadImages();
    }, [])
  );

  const loadImages = async () => {
    const imgs = await getGalleryImages();
    setImages(imgs);
  };

  const handleUpscale = async () => {
    if (!selectedImage) {
      showToast("Select an image first", "warning");
      return;
    }

    const token = await getApiKey("replicateApiToken");
    if (!token) {
      showToast("Replicate API token required for upscaling. Go to Settings.", "error");
      return;
    }

    setUpscaling(true);
    setProgressStatus("Starting upscale...");
    setResultImage(null);

    try {
      const result = await upscaleWithReplicate(
        token,
        selectedImage.uri,
        upscaleModel,
        scaleFactor,
        faceEnhance,
        setProgressStatus
      );

      setResultImage(result);

      // Save to gallery
      const galleryImage: GalleryImage = {
        id: Date.now().toString() + Math.random().toString(36).slice(2),
        uri: result,
        prompt: selectedImage.prompt + " (upscaled)",
        negativePrompt: selectedImage.negativePrompt,
        provider: selectedImage.provider,
        model: `${upscaleModel} ${scaleFactor}x`,
        aspectRatio: selectedImage.aspectRatio,
        createdAt: Date.now(),
        collections: [],
        isUpscaled: true,
      };
      await saveGalleryImage(galleryImage);

      showToast("Image upscaled successfully", "success");
    } catch (error: any) {
      showToast(error.message || "Upscale failed", "error");
    } finally {
      setUpscaling(false);
      setProgressStatus("");
    }
  };

  const handleSaveToCameraRoll = async () => {
    if (!resultImage) return;

    if (Platform.OS === "web") {
      // Web: open in new tab for download
      try {
        const link = document.createElement("a");
        link.href = resultImage;
        link.download = `inkform-upscaled-${Date.now()}.png`;
        link.target = "_blank";
        link.click();
        showToast("Download started", "success");
      } catch {
        window.open(resultImage, "_blank");
      }
      return;
    }

    try {
      const MediaLibrary = await import("expo-media-library");
      const FileSystem = await import("expo-file-system/legacy");

      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status !== "granted") {
        showToast("Permission denied to save to camera roll", "error");
        return;
      }

      const fileUri = FileSystem.documentDirectory + `inkform-upscaled-${Date.now()}.png`;
      await FileSystem.downloadAsync(resultImage, fileUri);
      await MediaLibrary.createAssetAsync(fileUri);
      showToast("Saved to Camera Roll", "success");
    } catch (error: any) {
      showToast("Failed to save: " + error.message, "error");
    }
  };

  return (
    <ScreenContainer>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <Text style={[styles.screenTitle, { color: colors.foreground }]}>Upscale</Text>

        {/* Image Picker */}
        <TouchableOpacity
          onPress={() => setShowPicker(!showPicker)}
          style={[styles.pickerButton, { backgroundColor: colors.surface, borderColor: colors.border }]}
        >
          {selectedImage ? (
            <View style={styles.selectedRow}>
              <Image
                source={{ uri: selectedImage.uri }}
                style={styles.selectedThumb}
                contentFit="cover"
              />
              <View style={styles.selectedInfo}>
                <Text style={[styles.selectedPrompt, { color: colors.foreground }]} numberOfLines={1}>
                  {selectedImage.prompt}
                </Text>
                <Text style={[styles.selectedMeta, { color: colors.muted }]}>
                  {selectedImage.model} · {selectedImage.aspectRatio}
                </Text>
              </View>
              <Text style={{ color: colors.muted }}>▼</Text>
            </View>
          ) : (
            <Text style={[styles.pickerPlaceholder, { color: colors.muted }]}>
              Tap to select an image from gallery
            </Text>
          )}
        </TouchableOpacity>

        {showPicker && (
          <View style={[styles.pickerDropdown, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <ScrollView style={{ maxHeight: 240 }} nestedScrollEnabled>
              {images.length === 0 ? (
                <Text style={[styles.emptyPicker, { color: colors.muted }]}>
                  No images in gallery
                </Text>
              ) : (
                images.map((img) => (
                  <TouchableOpacity
                    key={img.id}
                    onPress={() => {
                      setSelectedImage(img);
                      setShowPicker(false);
                      setResultImage(null);
                    }}
                    style={[
                      styles.pickerItem,
                      selectedImage?.id === img.id && { backgroundColor: colors.primary + "22" },
                    ]}
                  >
                    <Image
                      source={{ uri: img.uri }}
                      style={styles.pickerThumb}
                      contentFit="cover"
                    />
                    <Text style={[styles.pickerItemText, { color: colors.foreground }]} numberOfLines={1}>
                      {img.prompt}
                    </Text>
                  </TouchableOpacity>
                ))
              )}
            </ScrollView>
          </View>
        )}

        {/* Selected Image Preview */}
        {selectedImage && (
          <View style={[styles.previewContainer, { borderColor: colors.border }]}>
            <Image
              source={{ uri: selectedImage.uri }}
              style={styles.previewImage}
              contentFit="contain"
              transition={200}
            />
          </View>
        )}

        {/* Upscale Model Selection */}
        <View style={styles.paramSection}>
          <Text style={[styles.fieldLabel, { color: colors.muted }]}>UPSCALE MODEL</Text>
          <View style={styles.modelCards}>
            <TouchableOpacity
              onPress={() => setUpscaleModel("real-esrgan")}
              style={[
                styles.modelCard,
                {
                  backgroundColor: upscaleModel === "real-esrgan" ? colors.primary + "22" : colors.surface,
                  borderColor: upscaleModel === "real-esrgan" ? colors.primary : colors.border,
                },
              ]}
            >
              <Text style={[styles.modelCardTitle, { color: colors.foreground }]}>Real-ESRGAN</Text>
              <Text style={[styles.modelCardDesc, { color: colors.muted }]}>
                Best for 2D art, clean lines, flat colors
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setUpscaleModel("gfpgan")}
              style={[
                styles.modelCard,
                {
                  backgroundColor: upscaleModel === "gfpgan" ? colors.primary + "22" : colors.surface,
                  borderColor: upscaleModel === "gfpgan" ? colors.primary : colors.border,
                },
              ]}
            >
              <Text style={[styles.modelCardTitle, { color: colors.foreground }]}>GFPGAN</Text>
              <Text style={[styles.modelCardDesc, { color: colors.muted }]}>
                Best for faces, cinematic photorealism
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Scale Factor */}
        <View style={styles.paramSection}>
          <Text style={[styles.fieldLabel, { color: colors.muted }]}>SCALE FACTOR</Text>
          <View style={styles.scaleRow}>
            {[2, 3, 4].map((n) => (
              <TouchableOpacity
                key={n}
                onPress={() => setScaleFactor(n)}
                style={[
                  styles.scaleButton,
                  {
                    backgroundColor: scaleFactor === n ? colors.primary : colors.surface,
                    borderColor: scaleFactor === n ? colors.primary : colors.border,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.scaleText,
                    { color: scaleFactor === n ? "#fff" : colors.foreground },
                  ]}
                >
                  {n}x
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Face Enhancement */}
        <View style={[styles.switchRow, { borderColor: colors.border }]}>
          <View>
            <Text style={[styles.switchLabel, { color: colors.foreground }]}>Face Enhancement</Text>
            <Text style={[styles.switchDesc, { color: colors.muted }]}>
              Improve facial details
            </Text>
          </View>
          <Switch
            value={faceEnhance}
            onValueChange={setFaceEnhance}
            trackColor={{ false: colors.border, true: colors.primary + "88" }}
            thumbColor={faceEnhance ? colors.primary : colors.muted}
          />
        </View>

        {/* Upscale Button */}
        <TouchableOpacity
          onPress={handleUpscale}
          disabled={upscaling || !selectedImage}
          style={[
            styles.upscaleButton,
            {
              backgroundColor: colors.primary,
              opacity: upscaling || !selectedImage ? 0.5 : 1,
            },
          ]}
        >
          {upscaling ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator color="#fff" size="small" />
              <Text style={styles.upscaleButtonText}>{progressStatus || "Upscaling..."}</Text>
            </View>
          ) : (
            <Text style={styles.upscaleButtonText}>Upscale Image</Text>
          )}
        </TouchableOpacity>

        {/* Result */}
        {resultImage && (
          <View style={styles.resultSection}>
            <Text style={[styles.fieldLabel, { color: colors.muted, marginBottom: 10 }]}>
              UPSCALED RESULT
            </Text>
            <View style={[styles.resultContainer, { borderColor: colors.border }]}>
              <Image
                source={{ uri: resultImage }}
                style={styles.resultImage}
                contentFit="contain"
                transition={300}
              />
            </View>
            <TouchableOpacity
              onPress={handleSaveToCameraRoll}
              style={[styles.saveButton, { backgroundColor: colors.success }]}
            >
              <Text style={styles.saveButtonText}>Save to Camera Roll</Text>
            </TouchableOpacity>
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 32,
  },
  screenTitle: {
    fontSize: 28,
    fontWeight: "700",
    marginBottom: 16,
  },
  pickerButton: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
  },
  selectedRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  selectedThumb: {
    width: 44,
    height: 44,
    borderRadius: 8,
  },
  selectedInfo: {
    flex: 1,
  },
  selectedPrompt: {
    fontSize: 14,
    fontWeight: "500",
  },
  selectedMeta: {
    fontSize: 12,
    marginTop: 2,
  },
  pickerPlaceholder: {
    fontSize: 15,
    textAlign: "center",
    paddingVertical: 8,
  },
  pickerDropdown: {
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 4,
    overflow: "hidden",
  },
  emptyPicker: {
    padding: 16,
    textAlign: "center",
  },
  pickerItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: 10,
    gap: 10,
  },
  pickerThumb: {
    width: 40,
    height: 40,
    borderRadius: 6,
  },
  pickerItemText: {
    flex: 1,
    fontSize: 14,
  },
  previewContainer: {
    borderRadius: 14,
    borderWidth: 1,
    overflow: "hidden",
    marginTop: 14,
  },
  previewImage: {
    width: "100%",
    height: 240,
  },
  paramSection: {
    marginTop: 20,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: "600",
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  modelCards: {
    flexDirection: "row",
    gap: 10,
  },
  modelCard: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1.5,
    padding: 14,
  },
  modelCardTitle: {
    fontSize: 15,
    fontWeight: "600",
    marginBottom: 4,
  },
  modelCardDesc: {
    fontSize: 12,
    lineHeight: 16,
  },
  scaleRow: {
    flexDirection: "row",
    gap: 10,
  },
  scaleButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: "center",
  },
  scaleText: {
    fontSize: 16,
    fontWeight: "700",
  },
  switchRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 20,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderBottomWidth: 1,
  },
  switchLabel: {
    fontSize: 15,
    fontWeight: "500",
  },
  switchDesc: {
    fontSize: 12,
    marginTop: 2,
  },
  upscaleButton: {
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: "center",
    marginTop: 24,
  },
  upscaleButtonText: {
    color: "#fff",
    fontSize: 17,
    fontWeight: "700",
  },
  loadingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  resultSection: {
    marginTop: 24,
  },
  resultContainer: {
    borderRadius: 14,
    borderWidth: 1,
    overflow: "hidden",
  },
  resultImage: {
    width: "100%",
    height: 300,
  },
  saveButton: {
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 12,
  },
  saveButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
});
