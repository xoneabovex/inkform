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
import * as FileSystem from "expo-file-system/legacy";
import * as Clipboard from "expo-clipboard";
import { FullscreenViewer } from "@/components/features/fullscreen-viewer";
import {
  getGalleryImages,
  deleteGalleryImage,
  getCollections,
  createCollection,
  addImageToCollection,
  saveReuseSettings,
  saveToDeviceGallery,
  toggleProtectedImage,
} from "@/lib/storage/app-storage";
import type { GalleryImage, Collection } from "@/lib/types";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");
const NUM_COLUMNS = 3;
const GAP = 3;
const ITEM_SIZE = (SCREEN_WIDTH - GAP * (NUM_COLUMNS + 1)) / NUM_COLUMNS;

// ===== Main Gallery Screen =====
export default function GalleryScreen() {
  const colors = useColors();
  const { showToast } = useToast();
  const router = useRouter();

  const [images, setImages] = useState<GalleryImage[]>([]);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [selectedCollection, setSelectedCollection] = useState<string | null>(null);
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);
  const [selectedImage, setSelectedImage] = useState<GalleryImage | null>(null);
  const [showDetail, setShowDetail] = useState(false);
  const [fullscreenImage, setFullscreenImage] = useState<GalleryImage | null>(null);
  const [fullscreenIndex, setFullscreenIndex] = useState(0);
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

  const filteredImages = images.filter((img) => {
    if (selectedCollection && !img.collections.includes(selectedCollection)) return false;
    if (showFavoritesOnly && !img.isProtected) return false;
    return true;
  });

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
      await saveToDeviceGallery(uri);
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
    const idx = filteredImages.findIndex((img) => img.id === image.id);
    setFullscreenIndex(idx >= 0 ? idx : 0);
    setFullscreenImage(image);
  };

  const handleToggleFavorite = async (id: string) => {
    try {
      const newVal = await toggleProtectedImage(id);
      setImages((prev) =>
        prev.map((img) => (img.id === id ? { ...img, isProtected: newVal } : img))
      );
      // Also update selectedImage if it's the same
      if (selectedImage?.id === id) {
        setSelectedImage((prev) => prev ? { ...prev, isProtected: newVal } : prev);
      }
      showToast(newVal ? "Added to favorites" : "Removed from favorites", "success");
    } catch {
      showToast("Failed to update favorite", "error");
    }
  };

  const handleFullscreenPrev = () => {
    if (fullscreenIndex > 0) {
      const newIdx = fullscreenIndex - 1;
      setFullscreenIndex(newIdx);
      setFullscreenImage(filteredImages[newIdx]);
    }
  };

  const handleFullscreenNext = () => {
    if (fullscreenIndex < filteredImages.length - 1) {
      const newIdx = fullscreenIndex + 1;
      setFullscreenIndex(newIdx);
      setFullscreenImage(filteredImages[newIdx]);
    }
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
      {item.isProtected && (
        <View style={styles.favBadge}>
          <Text style={styles.favBadgeText}>♥</Text>
        </View>
      )}
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
          onPress={() => { setSelectedCollection(null); setShowFavoritesOnly(false); }}
          style={[
            styles.collectionPill,
            {
              backgroundColor: !selectedCollection && !showFavoritesOnly ? colors.primary : colors.surface,
              borderColor: !selectedCollection && !showFavoritesOnly ? colors.primary : colors.border,
            },
          ]}
        >
          <Text style={{ color: !selectedCollection && !showFavoritesOnly ? "#fff" : colors.foreground, fontSize: 13, fontWeight: "600" }}>
            All
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => { setShowFavoritesOnly(!showFavoritesOnly); setSelectedCollection(null); }}
          style={[
            styles.collectionPill,
            {
              backgroundColor: showFavoritesOnly ? colors.primary : colors.surface,
              borderColor: showFavoritesOnly ? colors.primary : colors.border,
            },
          ]}
        >
          <Text style={{ color: showFavoritesOnly ? "#fff" : colors.foreground, fontSize: 13, fontWeight: "600" }}>
            ♥ Favorites
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
          onPrev={fullscreenIndex > 0 ? handleFullscreenPrev : undefined}
          onNext={fullscreenIndex < filteredImages.length - 1 ? handleFullscreenNext : undefined}
          currentIndex={fullscreenIndex}
          totalCount={filteredImages.length}
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
                    onPress={() => handleToggleFavorite(selectedImage.id)}
                    style={[styles.detailActionBtn, { backgroundColor: selectedImage.isProtected ? colors.error : colors.surface, borderColor: selectedImage.isProtected ? colors.error : colors.border }]}
                  >
                    <Text style={{ color: selectedImage.isProtected ? "#fff" : colors.foreground, fontSize: 13, fontWeight: "600" }}>
                      {selectedImage.isProtected ? "♥ Fav" : "♡ Fav"}
                    </Text>
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
  favBadge: {
    position: "absolute",
    top: 4,
    right: 4,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "rgba(0,0,0,0.5)",
    alignItems: "center",
    justifyContent: "center",
  },
  favBadgeText: {
    color: "#EF4444",
    fontSize: 12,
    lineHeight: 14,
  },
});
