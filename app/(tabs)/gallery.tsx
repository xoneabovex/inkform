import React, { useState, useCallback } from "react";
import {
  Text,
  View,
  TouchableOpacity,
  FlatList,
  Modal,
  ScrollView,
  TextInput,
  ActivityIndicator,
  Dimensions,
  StyleSheet,
  Alert,
  Platform,
  Share,
} from "react-native";
import { Image } from "expo-image";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { useToast } from "@/lib/toast-context";
import { useFocusEffect } from "@react-navigation/native";
import { useRouter } from "expo-router";
import { Gesture, GestureDetector, GestureHandlerRootView } from "react-native-gesture-handler";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
} from "react-native-reanimated";
import * as MediaLibrary from "expo-media-library";
import * as FileSystem from "expo-file-system/legacy";
import * as Clipboard from "expo-clipboard";
import {
  getGalleryImages,
  deleteGalleryImage,
  getCollections,
  createCollection,
  addImageToCollection,
  saveReuseSettings,
} from "@/lib/storage/app-storage";
import type { GalleryImage, Collection } from "@/lib/types";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");
const NUM_COLUMNS = 3;
const GAP = 3;
const ITEM_SIZE = (SCREEN_WIDTH - GAP * (NUM_COLUMNS + 1)) / NUM_COLUMNS;

// ===== Pinch-to-zoom fullscreen viewer =====
function FullscreenViewer({
  image,
  onClose,
  onSave,
  onShare,
  onCopyPrompt,
  colors,
}: {
  image: GalleryImage;
  onClose: () => void;
  onSave: () => void;
  onShare: () => void;
  onCopyPrompt: () => void;
  colors: any;
}) {
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedTranslateX = useSharedValue(0);
  const savedTranslateY = useSharedValue(0);
  const focalX = useSharedValue(0);
  const focalY = useSharedValue(0);

  const pinchGesture = Gesture.Pinch()
    .onStart((e) => {
      focalX.value = e.focalX;
      focalY.value = e.focalY;
      savedScale.value = scale.value;
    })
    .onUpdate((e) => {
      const newScale = Math.max(1, Math.min(6, savedScale.value * e.scale));
      scale.value = newScale;
    })
    .onEnd(() => {
      savedScale.value = scale.value;
      if (scale.value < 1.05) {
        scale.value = withTiming(1, { duration: 200 });
        savedScale.value = 1;
        translateX.value = withTiming(0, { duration: 200 });
        translateY.value = withTiming(0, { duration: 200 });
        savedTranslateX.value = 0;
        savedTranslateY.value = 0;
      }
    });

  const panGesture = Gesture.Pan()
    .minPointers(1)
    .maxPointers(2)
    .onStart(() => {
      savedTranslateX.value = translateX.value;
      savedTranslateY.value = translateY.value;
    })
    .onUpdate((e) => {
      if (scale.value > 1.05) {
        const maxX = (SCREEN_WIDTH * (scale.value - 1)) / 2;
        const maxY = (SCREEN_HEIGHT * (scale.value - 1)) / 2;
        const newX = savedTranslateX.value + e.translationX;
        const newY = savedTranslateY.value + e.translationY;
        translateX.value = Math.max(-maxX, Math.min(maxX, newX));
        translateY.value = Math.max(-maxY, Math.min(maxY, newY));
      }
    })
    .onEnd(() => {
      savedTranslateX.value = translateX.value;
      savedTranslateY.value = translateY.value;
    });

  const doubleTapGesture = Gesture.Tap()
    .numberOfTaps(2)
    .maxDuration(300)
    .onEnd((_e, success) => {
      if (!success) return;
      if (savedScale.value > 1.05) {
        // Zoom out
        scale.value = withTiming(1, { duration: 250 });
        savedScale.value = 1;
        translateX.value = withTiming(0, { duration: 250 });
        translateY.value = withTiming(0, { duration: 250 });
        savedTranslateX.value = 0;
        savedTranslateY.value = 0;
      } else {
        // Zoom in to 2.5x
        scale.value = withTiming(2.5, { duration: 250 });
        savedScale.value = 2.5;
      }
    });

  // Exclusive: pinch+pan win immediately on 2 fingers; double-tap fires on confirmed 2-tap
  const composed = Gesture.Exclusive(
    Gesture.Simultaneous(pinchGesture, panGesture),
    doubleTapGesture,
  );

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }));

  return (
    <Modal visible animationType="fade" transparent statusBarTranslucent>
      {/* GestureHandlerRootView is required inside Modal on Android */}
      <GestureHandlerRootView style={{ flex: 1 }}>
        <View style={viewerStyles.overlay}>
          {/* Top bar */}
          <View style={viewerStyles.topBar}>
            <TouchableOpacity onPress={onClose} style={viewerStyles.closeBtn}>
              <Text style={viewerStyles.closeBtnText}>✕</Text>
            </TouchableOpacity>
            <View style={viewerStyles.topActions}>
              <TouchableOpacity onPress={onCopyPrompt} style={viewerStyles.topBtn}>
                <Text style={viewerStyles.topBtnText}>📋</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={onShare} style={viewerStyles.topBtn}>
                <Text style={viewerStyles.topBtnText}>↗</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={onSave}
                style={[viewerStyles.topBtn, { backgroundColor: colors.primary }]}
              >
                <Text style={viewerStyles.topBtnText}>💾 Save</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Zoomable image area — fills the space between top bar and bottom bar */}
          <GestureDetector gesture={composed}>
            <Animated.View style={[viewerStyles.imageContainer, animatedStyle]}>
              <Image
                source={{ uri: image.uri }}
                style={{ width: SCREEN_WIDTH, height: SCREEN_HEIGHT * 0.8 }}
                contentFit="contain"
              />
            </Animated.View>
          </GestureDetector>

          {/* Bottom info */}
          <View style={viewerStyles.bottomBar}>
            <Text style={viewerStyles.bottomModel} numberOfLines={1}>
              {image.model} · {image.provider}
            </Text>
            <Text style={viewerStyles.hint}>Pinch to zoom · Double-tap to zoom in/out</Text>
          </View>
        </View>
      </GestureHandlerRootView>
    </Modal>
  );
}

const viewerStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "#000",
  },
  topBar: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: Platform.OS === "ios" ? 56 : 44,
    paddingBottom: 12,
    zIndex: 10,
    backgroundColor: "rgba(0,0,0,0.5)",
  },
  topActions: {
    flexDirection: "row",
    gap: 8,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  closeBtnText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
  },
  topBtn: {
    backgroundColor: "rgba(255,255,255,0.15)",
    borderRadius: 18,
    paddingHorizontal: 12,
    paddingVertical: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  topBtnText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "600",
  },
  imageContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  bottomBar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 16,
    paddingBottom: Platform.OS === "ios" ? 40 : 24,
    paddingTop: 12,
    backgroundColor: "rgba(0,0,0,0.5)",
    alignItems: "center",
  },
  bottomModel: {
    color: "rgba(255,255,255,0.7)",
    fontSize: 13,
    fontWeight: "500",
    marginBottom: 4,
  },
  hint: {
    color: "rgba(255,255,255,0.35)",
    fontSize: 11,
  },
});

// ===== Main Gallery Screen =====
export default function GalleryScreen() {
  const colors = useColors();
  const { showToast } = useToast();
  const router = useRouter();

  const [images, setImages] = useState<GalleryImage[]>([]);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [selectedCollection, setSelectedCollection] = useState<string | null>(null);
  const [selectedImage, setSelectedImage] = useState<GalleryImage | null>(null);
  const [showDetail, setShowDetail] = useState(false);
  const [fullscreenImage, setFullscreenImage] = useState<GalleryImage | null>(null);
  const [showCollectionModal, setShowCollectionModal] = useState(false);
  const [newCollectionName, setNewCollectionName] = useState("");
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [])
  );

  const loadData = async () => {
    try {
      const [imgs, cols] = await Promise.all([getGalleryImages(), getCollections()]);
      setImages(imgs);
      setCollections(cols);
    } catch {
      showToast("Failed to load gallery", "error");
    } finally {
      setLoading(false);
    }
  };

  const filteredImages = selectedCollection
    ? images.filter((img) => img.collections.includes(selectedCollection))
    : images;

  const handleDelete = async (id: string) => {
    try {
      await deleteGalleryImage(id);
      setImages((prev) => prev.filter((img) => img.id !== id));
      setShowDetail(false);
      showToast("Image deleted", "info");
    } catch {
      showToast("Failed to delete image", "error");
    }
  };

  const handleCreateCollection = async () => {
    if (!newCollectionName.trim()) return;
    try {
      const col = await createCollection(newCollectionName.trim());
      setCollections((prev) => [...prev, col]);
      setNewCollectionName("");
      showToast("Collection created", "success");
    } catch {
      showToast("Failed to create collection", "error");
    }
  };

  const handleAddToCollection = async (imageId: string, collectionId: string) => {
    try {
      await addImageToCollection(imageId, collectionId);
      await loadData();
      showToast("Added to collection", "success");
    } catch {
      showToast("Failed to add to collection", "error");
    }
  };

  const handleSaveToGallery = async (uri: string) => {
    if (Platform.OS === "web") {
      showToast("Save not supported on web", "warning");
      return;
    }
    try {
      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status !== "granted") {
        showToast("Camera roll permission denied", "error");
        return;
      }

      let localUri = uri;

      // If it's a remote URL, download to cache first
      if (uri.startsWith("http")) {
        const ext = uri.includes(".png") ? "png" : "jpg";
        const filename = `inkform_save_${Date.now()}.${ext}`;
        const dest = (FileSystem.cacheDirectory || "") + filename;
        const { uri: downloaded } = await FileSystem.downloadAsync(uri, dest);
        localUri = downloaded;
      }

      // createAssetAsync is more reliable than saveToLibraryAsync on Android
      // and works with both file:// and content:// URIs
      await MediaLibrary.createAssetAsync(localUri);
      showToast("Saved to camera roll ✓", "success");
    } catch (e: any) {
      showToast("Failed to save: " + (e.message || "unknown error"), "error");
    }
  };

  const handleShare = async (uri: string) => {
    try {
      if (Platform.OS === "web") {
        showToast("Sharing not supported on web", "warning");
        return;
      }
      let localUri = uri;
      if (uri.startsWith("http")) {
        const filename = `inkform_share_${Date.now()}.jpg`;
        const dest = FileSystem.cacheDirectory + filename;
        const { uri: downloaded } = await FileSystem.downloadAsync(uri, dest);
        localUri = downloaded;
      }
      await Share.share({ url: localUri, message: "Generated with Inkform" });
    } catch {
      showToast("Failed to share image", "error");
    }
  };

  const handleCopyPrompt = async (prompt: string) => {
    try {
      await Clipboard.setStringAsync(prompt);
      showToast("Prompt copied to clipboard", "success");
    } catch {
      showToast("Failed to copy prompt", "error");
    }
  };

  const openFullscreen = (image: GalleryImage) => {
    setFullscreenImage(image);
  };

  const handleReuseSettings = async (image: GalleryImage) => {
    try {
      await saveReuseSettings({
        prompt: image.prompt,
        negativePrompt: image.negativePrompt,
        provider: image.provider,
        modelId: image.model,
        aspectRatio: image.aspectRatio,
        seed: image.seed,
        samplingMethod: image.samplingMethod,
        cfg: image.cfg,
        steps: image.steps,
      });
      setShowDetail(false);
      router.push("/(tabs)" as any);
      showToast("Settings loaded — ready to regenerate", "success");
    } catch {
      showToast("Failed to load settings", "error");
    }
  };

  const renderImageItem = ({ item }: { item: GalleryImage }) => (
    <TouchableOpacity
      onPress={() => openFullscreen(item)}
      onLongPress={() => {
        setSelectedImage(item);
        setShowDetail(true);
      }}
      style={[styles.gridItem, { backgroundColor: colors.surface }]}
    >
      <Image
        source={{ uri: item.uri }}
        style={styles.gridImage}
        contentFit="cover"
        transition={200}
      />
    </TouchableOpacity>
  );

  if (loading) {
    return (
      <ScreenContainer className="flex-1 items-center justify-center">
        <ActivityIndicator size="large" color={colors.primary} />
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      <View style={styles.header}>
        <Text style={[styles.screenTitle, { color: colors.foreground }]}>Gallery</Text>
        <Text style={[styles.countText, { color: colors.muted }]}>
          {filteredImages.length} image{filteredImages.length !== 1 ? "s" : ""}
        </Text>
      </View>

      {/* Collection Filter */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.collectionScroll}
        contentContainerStyle={styles.collectionScrollContent}
      >
        <TouchableOpacity
          onPress={() => setSelectedCollection(null)}
          style={[
            styles.collectionPill,
            {
              backgroundColor: !selectedCollection ? colors.primary : colors.surface,
              borderColor: !selectedCollection ? colors.primary : colors.border,
            },
          ]}
        >
          <Text style={{ color: !selectedCollection ? "#fff" : colors.foreground, fontSize: 13, fontWeight: "600" }}>
            All
          </Text>
        </TouchableOpacity>
        {collections.map((col) => (
          <TouchableOpacity
            key={col.id}
            onPress={() => setSelectedCollection(col.id)}
            style={[
              styles.collectionPill,
              {
                backgroundColor: selectedCollection === col.id ? colors.primary : colors.surface,
                borderColor: selectedCollection === col.id ? colors.primary : colors.border,
              },
            ]}
          >
            <Text style={{ color: selectedCollection === col.id ? "#fff" : colors.foreground, fontSize: 13, fontWeight: "600" }}>
              {col.name}
            </Text>
          </TouchableOpacity>
        ))}
        <TouchableOpacity
          onPress={() => setShowCollectionModal(true)}
          style={[styles.collectionPill, { backgroundColor: colors.surface, borderColor: colors.border }]}
        >
          <Text style={{ color: colors.primary, fontSize: 13, fontWeight: "600" }}>+ New</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Tap hint */}
      {filteredImages.length > 0 && (
        <Text style={[styles.tapHint, { color: colors.muted }]}>
          Tap to view full screen · Long press for details
        </Text>
      )}

      {/* Image Grid */}
      {filteredImages.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={[styles.emptyText, { color: colors.muted }]}>
            {selectedCollection ? "No images in this collection" : "No images yet. Generate some!"}
          </Text>
        </View>
      ) : (
        <FlatList
          data={filteredImages}
          renderItem={renderImageItem}
          keyExtractor={(item) => item.id}
          numColumns={NUM_COLUMNS}
          contentContainerStyle={styles.gridContent}
          columnWrapperStyle={styles.gridRow}
          showsVerticalScrollIndicator={false}
        />
      )}

      {/* Fullscreen Viewer */}
      {fullscreenImage && (
        <FullscreenViewer
          image={fullscreenImage}
          onClose={() => setFullscreenImage(null)}
          onSave={() => handleSaveToGallery(fullscreenImage.uri)}
          onShare={() => handleShare(fullscreenImage.uri)}
          onCopyPrompt={() => handleCopyPrompt(fullscreenImage.prompt)}
          colors={colors}
        />
      )}

      {/* Image Detail Modal (long-press) */}
      <Modal visible={showDetail} animationType="slide" transparent>
        <View style={[styles.modalOverlay, { backgroundColor: colors.background + "F5" }]}>
          {selectedImage && (
            <View style={styles.detailContainer}>
              <View style={styles.detailHeader}>
                <TouchableOpacity onPress={() => setShowDetail(false)}>
                  <Text style={[styles.closeText, { color: colors.primary }]}>Close</Text>
                </TouchableOpacity>
                <View style={styles.detailHeaderActions}>
                  <TouchableOpacity
                    onPress={() => {
                      setShowDetail(false);
                      openFullscreen(selectedImage);
                    }}
                    style={[styles.detailActionBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
                  >
                    <Text style={{ color: colors.foreground, fontSize: 13, fontWeight: "600" }}>⛶ Expand</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => handleSaveToGallery(selectedImage.uri)}
                    style={[styles.detailActionBtn, { backgroundColor: colors.primary }]}
                  >
                    <Text style={{ color: "#fff", fontSize: 13, fontWeight: "600" }}>💾 Save</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => {
                      if (Platform.OS === "web") {
                        handleDelete(selectedImage.id);
                      } else {
                        Alert.alert("Delete Image", "Are you sure?", [
                          { text: "Cancel", style: "cancel" },
                          { text: "Delete", style: "destructive", onPress: () => handleDelete(selectedImage.id) },
                        ]);
                      }
                    }}
                  >
                    <Text style={[styles.deleteText, { color: colors.error }]}>Delete</Text>
                  </TouchableOpacity>
                </View>
              </View>

              <ScrollView showsVerticalScrollIndicator={false}>
                <TouchableOpacity
                  onPress={() => {
                    setShowDetail(false);
                    openFullscreen(selectedImage);
                  }}
                >
                  <Image
                    source={{ uri: selectedImage.uri }}
                    style={[styles.detailImage, { width: SCREEN_WIDTH - 32 }]}
                    contentFit="contain"
                    transition={300}
                  />
                </TouchableOpacity>

                <View style={[styles.metadataCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <View style={styles.promptHeader}>
                    <Text style={[styles.metaLabel, { color: colors.muted }]}>PROMPT</Text>
                    <TouchableOpacity onPress={() => handleCopyPrompt(selectedImage.prompt)}>
                      <Text style={{ color: colors.primary, fontSize: 12, fontWeight: "600" }}>📋 Copy</Text>
                    </TouchableOpacity>
                  </View>
                  <Text style={[styles.metaValue, { color: colors.foreground }]} selectable>
                    {selectedImage.prompt}
                  </Text>

                  {selectedImage.negativePrompt && (
                    <>
                      <Text style={[styles.metaLabel, { color: colors.muted, marginTop: 10 }]}>NEGATIVE</Text>
                      <Text style={[styles.metaValue, { color: colors.foreground }]} selectable>
                        {selectedImage.negativePrompt}
                      </Text>
                    </>
                  )}

                  <View style={styles.metaRow}>
                    <View style={styles.metaItem}>
                      <Text style={[styles.metaLabel, { color: colors.muted }]}>PROVIDER</Text>
                      <Text style={[styles.metaSmall, { color: colors.foreground }]}>{selectedImage.provider}</Text>
                    </View>
                    <View style={styles.metaItem}>
                      <Text style={[styles.metaLabel, { color: colors.muted }]}>MODEL</Text>
                      <Text style={[styles.metaSmall, { color: colors.foreground }]}>{selectedImage.model}</Text>
                    </View>
                    <View style={styles.metaItem}>
                      <Text style={[styles.metaLabel, { color: colors.muted }]}>RATIO</Text>
                      <Text style={[styles.metaSmall, { color: colors.foreground }]}>{selectedImage.aspectRatio}</Text>
                    </View>
                  </View>

                  {/* Extra metadata */}
                  <View style={[styles.metaRow, { marginTop: 8 }]}>
                    {selectedImage.seed != null && (
                      <View style={styles.metaItem}>
                        <Text style={[styles.metaLabel, { color: colors.muted }]}>SEED</Text>
                        <Text style={[styles.metaSmall, { color: colors.foreground }]}>{selectedImage.seed}</Text>
                      </View>
                    )}
                    {selectedImage.samplingMethod && (
                      <View style={styles.metaItem}>
                        <Text style={[styles.metaLabel, { color: colors.muted }]}>SAMPLER</Text>
                        <Text style={[styles.metaSmall, { color: colors.foreground }]}>{selectedImage.samplingMethod}</Text>
                      </View>
                    )}
                    {selectedImage.steps != null && (
                      <View style={styles.metaItem}>
                        <Text style={[styles.metaLabel, { color: colors.muted }]}>STEPS</Text>
                        <Text style={[styles.metaSmall, { color: colors.foreground }]}>{selectedImage.steps}</Text>
                      </View>
                    )}
                  </View>
                </View>

                {/* Action buttons */}
                <View style={styles.actionBtnRow}>
                  <TouchableOpacity
                    onPress={() => handleShare(selectedImage.uri)}
                    style={[styles.actionBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
                  >
                    <Text style={{ color: colors.foreground, fontSize: 13, fontWeight: "600" }}>↗ Share</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => handleCopyPrompt(selectedImage.prompt)}
                    style={[styles.actionBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
                  >
                    <Text style={{ color: colors.foreground, fontSize: 13, fontWeight: "600" }}>📋 Copy Prompt</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => handleReuseSettings(selectedImage)}
                    style={[styles.actionBtn, { backgroundColor: colors.primary, borderColor: colors.primary }]}
                  >
                    <Text style={{ color: "#fff", fontSize: 13, fontWeight: "600" }}>↺ Reuse</Text>
                  </TouchableOpacity>
                </View>

                {/* Add to Collection */}
                {collections.length > 0 && (
                  <View style={[styles.metadataCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                    <Text style={[styles.metaLabel, { color: colors.muted }]}>ADD TO COLLECTION</Text>
                    <View style={styles.collectionChips}>
                      {collections.map((col) => {
                        const isIn = selectedImage.collections.includes(col.id);
                        return (
                          <TouchableOpacity
                            key={col.id}
                            onPress={() => handleAddToCollection(selectedImage.id, col.id)}
                            style={[
                              styles.collectionChip,
                              {
                                backgroundColor: isIn ? colors.primary : "transparent",
                                borderColor: isIn ? colors.primary : colors.border,
                              },
                            ]}
                          >
                            <Text style={{ color: isIn ? "#fff" : colors.foreground, fontSize: 13 }}>
                              {isIn ? "✓ " : ""}{col.name}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </View>
                )}

                <View style={{ height: 60 }} />
              </ScrollView>
            </View>
          )}
        </View>
      </Modal>

      {/* New Collection Modal */}
      <Modal visible={showCollectionModal} animationType="fade" transparent>
        <View style={styles.collectionModalOverlay}>
          <View style={[styles.collectionModalContent, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.collectionModalTitle, { color: colors.foreground }]}>New Collection</Text>
            <TextInput
              style={[styles.collectionInput, { color: colors.foreground, backgroundColor: colors.background, borderColor: colors.border }]}
              value={newCollectionName}
              onChangeText={setNewCollectionName}
              placeholder="Collection name"
              placeholderTextColor={colors.muted}
              autoFocus
              returnKeyType="done"
              onSubmitEditing={() => {
                handleCreateCollection();
                setShowCollectionModal(false);
              }}
            />
            <View style={styles.collectionModalButtons}>
              <TouchableOpacity
                onPress={() => { setShowCollectionModal(false); setNewCollectionName(""); }}
                style={[styles.collectionModalBtn, { borderColor: colors.border }]}
              >
                <Text style={{ color: colors.muted }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => { handleCreateCollection(); setShowCollectionModal(false); }}
                style={[styles.collectionModalBtn, { backgroundColor: colors.primary }]}
              >
                <Text style={{ color: "#fff", fontWeight: "600" }}>Create</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
  },
  screenTitle: {
    fontSize: 28,
    fontWeight: "700",
  },
  countText: {
    fontSize: 14,
  },
  collectionScroll: {
    maxHeight: 44,
  },
  collectionScrollContent: {
    paddingHorizontal: 12,
    gap: 8,
    alignItems: "center",
  },
  collectionPill: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
  },
  tapHint: {
    fontSize: 11,
    textAlign: "center",
    paddingVertical: 6,
  },
  gridContent: {
    paddingHorizontal: GAP,
    paddingTop: GAP,
  },
  gridRow: {
    gap: GAP,
    marginBottom: GAP,
  },
  gridItem: {
    width: ITEM_SIZE,
    height: ITEM_SIZE,
    borderRadius: 4,
    overflow: "hidden",
  },
  gridImage: {
    width: "100%",
    height: "100%",
  },
  emptyState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
  },
  emptyText: {
    fontSize: 16,
    textAlign: "center",
    lineHeight: 24,
  },
  modalOverlay: {
    flex: 1,
  },
  detailContainer: {
    flex: 1,
    paddingTop: 60,
    paddingHorizontal: 16,
  },
  detailHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  detailHeaderActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  detailActionBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
  },
  closeText: {
    fontSize: 16,
    fontWeight: "600",
  },
  deleteText: {
    fontSize: 16,
    fontWeight: "600",
  },
  detailImage: {
    height: 320,
    borderRadius: 14,
    marginBottom: 12,
  },
  metadataCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    marginBottom: 12,
  },
  promptHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  metaLabel: {
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 0.8,
    marginBottom: 4,
  },
  metaValue: {
    fontSize: 14,
    lineHeight: 20,
  },
  metaRow: {
    flexDirection: "row",
    marginTop: 12,
    gap: 12,
  },
  metaItem: {
    flex: 1,
  },
  metaSmall: {
    fontSize: 13,
    fontWeight: "500",
  },
  actionBtnRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 12,
  },
  actionBtn: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    paddingVertical: 12,
    alignItems: "center",
  },
  collectionChips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 8,
  },
  collectionChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
    borderWidth: 1,
  },
  collectionModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  collectionModalContent: {
    width: "100%",
    borderRadius: 16,
    borderWidth: 1,
    padding: 20,
  },
  collectionModalTitle: {
    fontSize: 18,
    fontWeight: "600",
    marginBottom: 14,
  },
  collectionInput: {
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    marginBottom: 14,
  },
  collectionModalButtons: {
    flexDirection: "row",
    gap: 10,
  },
  collectionModalBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: "center",
  },
});
