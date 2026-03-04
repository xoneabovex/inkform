import React, { useState, useCallback, useRef } from "react";
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
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  runOnJS,
} from "react-native-reanimated";
import * as MediaLibrary from "expo-media-library";
import * as FileSystem from "expo-file-system/legacy";
import {
  getGalleryImages,
  deleteGalleryImage,
  getCollections,
  createCollection,
  addImageToCollection,
  removeImageFromCollection,
} from "@/lib/storage/app-storage";
import type { GalleryImage, Collection } from "@/lib/types";

const SCREEN_WIDTH = Dimensions.get("window").width;
const SCREEN_HEIGHT = Dimensions.get("window").height;
const NUM_COLUMNS = 3;
const GAP = 3;
const ITEM_SIZE = (SCREEN_WIDTH - GAP * (NUM_COLUMNS + 1)) / NUM_COLUMNS;

// ===== Pinch-to-zoom fullscreen viewer =====
function FullscreenViewer({
  uri,
  onClose,
  onSave,
  onShare,
  colors,
}: {
  uri: string;
  onClose: () => void;
  onSave: () => void;
  onShare: () => void;
  colors: any;
}) {
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedTranslateX = useSharedValue(0);
  const savedTranslateY = useSharedValue(0);

  const pinchGesture = Gesture.Pinch()
    .onUpdate((e) => {
      scale.value = Math.max(1, Math.min(5, savedScale.value * e.scale));
    })
    .onEnd(() => {
      savedScale.value = scale.value;
      if (scale.value < 1.05) {
        scale.value = withTiming(1);
        savedScale.value = 1;
        translateX.value = withTiming(0);
        translateY.value = withTiming(0);
        savedTranslateX.value = 0;
        savedTranslateY.value = 0;
      }
    });

  const panGesture = Gesture.Pan()
    .onUpdate((e) => {
      if (savedScale.value > 1) {
        translateX.value = savedTranslateX.value + e.translationX;
        translateY.value = savedTranslateY.value + e.translationY;
      }
    })
    .onEnd(() => {
      savedTranslateX.value = translateX.value;
      savedTranslateY.value = translateY.value;
    });

  const doubleTapGesture = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd(() => {
      if (savedScale.value > 1) {
        scale.value = withTiming(1);
        savedScale.value = 1;
        translateX.value = withTiming(0);
        translateY.value = withTiming(0);
        savedTranslateX.value = 0;
        savedTranslateY.value = 0;
      } else {
        scale.value = withTiming(2.5);
        savedScale.value = 2.5;
      }
    });

  const composed = Gesture.Simultaneous(pinchGesture, panGesture, doubleTapGesture);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }));

  return (
    <Modal visible animationType="fade" transparent statusBarTranslucent>
      <View style={viewerStyles.overlay}>
        {/* Top bar */}
        <View style={viewerStyles.topBar}>
          <TouchableOpacity onPress={onClose} style={viewerStyles.topBtn}>
            <Text style={viewerStyles.topBtnText}>✕</Text>
          </TouchableOpacity>
          <View style={viewerStyles.topActions}>
            <TouchableOpacity onPress={onShare} style={viewerStyles.topBtn}>
              <Text style={viewerStyles.topBtnText}>⬆</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={onSave} style={[viewerStyles.topBtn, { backgroundColor: colors.primary }]}>
              <Text style={viewerStyles.topBtnText}>⬇ Save</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Zoomable image */}
        <GestureDetector gesture={composed}>
          <Animated.View style={[viewerStyles.imageContainer, animatedStyle]}>
            <Image
              source={{ uri }}
              style={{ width: SCREEN_WIDTH, height: SCREEN_HEIGHT }}
              contentFit="contain"
            />
          </Animated.View>
        </GestureDetector>

        <Text style={viewerStyles.hint}>Pinch to zoom · Double-tap to zoom in/out</Text>
      </View>
    </Modal>
  );
}

const viewerStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.97)",
    alignItems: "center",
    justifyContent: "center",
  },
  topBar: {
    position: "absolute",
    top: 52,
    left: 0,
    right: 0,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    zIndex: 10,
  },
  topActions: {
    flexDirection: "row",
    gap: 8,
  },
  topBtn: {
    backgroundColor: "rgba(255,255,255,0.18)",
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  topBtnText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
  },
  imageContainer: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
    alignItems: "center",
    justifyContent: "center",
  },
  hint: {
    position: "absolute",
    bottom: 48,
    color: "rgba(255,255,255,0.4)",
    fontSize: 12,
  },
});

// ===== Main Gallery Screen =====
export default function GalleryScreen() {
  const colors = useColors();
  const { showToast } = useToast();

  const [images, setImages] = useState<GalleryImage[]>([]);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [selectedCollection, setSelectedCollection] = useState<string | null>(null);
  const [selectedImage, setSelectedImage] = useState<GalleryImage | null>(null);
  const [showDetail, setShowDetail] = useState(false);
  const [showFullscreen, setShowFullscreen] = useState(false);
  const [fullscreenUri, setFullscreenUri] = useState<string | null>(null);
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
      // If it's a remote URL, download it first
      if (uri.startsWith("http")) {
        const filename = `inkform_${Date.now()}.jpg`;
        const dest = FileSystem.cacheDirectory + filename;
        const { uri: downloaded } = await FileSystem.downloadAsync(uri, dest);
        localUri = downloaded;
      }

      await MediaLibrary.saveToLibraryAsync(localUri);
      showToast("Saved to camera roll", "success");
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

  const openFullscreen = (uri: string) => {
    setFullscreenUri(uri);
    setShowFullscreen(true);
  };

  const renderImageItem = ({ item }: { item: GalleryImage }) => (
    <TouchableOpacity
      onPress={() => openFullscreen(item.uri)}
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
          Tap to view · Long press for details & collections
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
      {showFullscreen && fullscreenUri && (
        <FullscreenViewer
          uri={fullscreenUri}
          onClose={() => { setShowFullscreen(false); setFullscreenUri(null); }}
          onSave={() => handleSaveToGallery(fullscreenUri)}
          onShare={() => handleShare(fullscreenUri)}
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
                      openFullscreen(selectedImage.uri);
                    }}
                    style={[styles.detailActionBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
                  >
                    <Text style={{ color: colors.foreground, fontSize: 13, fontWeight: "600" }}>⛶ Expand</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => handleSaveToGallery(selectedImage.uri)}
                    style={[styles.detailActionBtn, { backgroundColor: colors.primary }]}
                  >
                    <Text style={{ color: "#fff", fontSize: 13, fontWeight: "600" }}>⬇ Save</Text>
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
                    openFullscreen(selectedImage.uri);
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
                  <Text style={[styles.metaLabel, { color: colors.muted }]}>PROMPT</Text>
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
                </View>

                {/* Share button */}
                <TouchableOpacity
                  onPress={() => handleShare(selectedImage.uri)}
                  style={[styles.shareBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
                >
                  <Text style={{ color: colors.foreground, fontSize: 14, fontWeight: "600" }}>⬆ Share Image</Text>
                </TouchableOpacity>

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
                                backgroundColor: isIn ? colors.primary : colors.background,
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
  // Detail modal
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
  shareBtn: {
    borderRadius: 12,
    borderWidth: 1,
    paddingVertical: 12,
    alignItems: "center",
    marginBottom: 12,
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
