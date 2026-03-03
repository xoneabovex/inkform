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
} from "react-native";
import { Image } from "expo-image";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { useToast } from "@/lib/toast-context";
import { useFocusEffect } from "@react-navigation/native";
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
const NUM_COLUMNS = 3;
const GAP = 3;
const ITEM_SIZE = (SCREEN_WIDTH - GAP * (NUM_COLUMNS + 1)) / NUM_COLUMNS;

export default function GalleryScreen() {
  const colors = useColors();
  const { showToast } = useToast();

  const [images, setImages] = useState<GalleryImage[]>([]);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [selectedCollection, setSelectedCollection] = useState<string | null>(null);
  const [selectedImage, setSelectedImage] = useState<GalleryImage | null>(null);
  const [showDetail, setShowDetail] = useState(false);
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
      const [imgs, cols] = await Promise.all([
        getGalleryImages(),
        getCollections(),
      ]);
      setImages(imgs);
      setCollections(cols);
    } catch (e) {
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
    } catch (e) {
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
    } catch (e) {
      showToast("Failed to create collection", "error");
    }
  };

  const handleAddToCollection = async (imageId: string, collectionId: string) => {
    try {
      await addImageToCollection(imageId, collectionId);
      await loadData();
      showToast("Added to collection", "success");
    } catch (e) {
      showToast("Failed to add to collection", "error");
    }
  };

  const renderImageItem = ({ item }: { item: GalleryImage }) => (
    <TouchableOpacity
      onPress={() => {
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
            <Text
              style={{
                color: selectedCollection === col.id ? "#fff" : colors.foreground,
                fontSize: 13,
                fontWeight: "600",
              }}
            >
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

      {/* Image Detail Modal */}
      <Modal visible={showDetail} animationType="slide" transparent>
        <View style={[styles.modalOverlay, { backgroundColor: colors.background + "F5" }]}>
          {selectedImage && (
            <View style={styles.detailContainer}>
              <View style={styles.detailHeader}>
                <TouchableOpacity onPress={() => setShowDetail(false)}>
                  <Text style={[styles.closeText, { color: colors.primary }]}>Close</Text>
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

              <ScrollView showsVerticalScrollIndicator={false}>
                <Image
                  source={{ uri: selectedImage.uri }}
                  style={[styles.detailImage, { width: SCREEN_WIDTH - 32 }]}
                  contentFit="contain"
                  transition={300}
                />

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
            <Text style={[styles.collectionModalTitle, { color: colors.foreground }]}>
              New Collection
            </Text>
            <TextInput
              style={[styles.collectionInput, { color: colors.foreground, backgroundColor: colors.background, borderColor: colors.border }]}
              value={newCollectionName}
              onChangeText={setNewCollectionName}
              placeholder="Collection name"
              placeholderTextColor={colors.muted}
              autoFocus
            />
            <View style={styles.collectionModalButtons}>
              <TouchableOpacity
                onPress={() => {
                  setShowCollectionModal(false);
                  setNewCollectionName("");
                }}
                style={[styles.collectionModalBtn, { borderColor: colors.border }]}
              >
                <Text style={{ color: colors.muted }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => {
                  handleCreateCollection();
                  setShowCollectionModal(false);
                }}
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
    justifyContent: "space-between",
    alignItems: "baseline",
    paddingHorizontal: 16,
    paddingTop: 8,
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
    marginTop: 12,
  },
  collectionScrollContent: {
    paddingHorizontal: 16,
    gap: 8,
  },
  collectionPill: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 16,
    borderWidth: 1,
    marginRight: 8,
  },
  emptyState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 80,
  },
  emptyText: {
    fontSize: 15,
  },
  gridContent: {
    padding: GAP,
    paddingTop: 12,
  },
  gridRow: {
    gap: GAP,
  },
  gridItem: {
    width: ITEM_SIZE,
    height: ITEM_SIZE,
    borderRadius: 4,
    overflow: "hidden",
    marginBottom: GAP,
  },
  gridImage: {
    width: "100%",
    height: "100%",
  },
  modalOverlay: {
    flex: 1,
  },
  detailContainer: {
    flex: 1,
    paddingTop: 50,
  },
  detailHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 12,
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
    height: 350,
    borderRadius: 14,
    alignSelf: "center",
  },
  metadataCard: {
    margin: 16,
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
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
    gap: 16,
  },
  metaItem: {
    flex: 1,
  },
  metaSmall: {
    fontSize: 13,
    fontWeight: "500",
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
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "center",
    alignItems: "center",
    padding: 32,
  },
  collectionModalContent: {
    width: "100%",
    maxWidth: 340,
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
    marginBottom: 16,
  },
  collectionModalButtons: {
    flexDirection: "row",
    gap: 10,
  },
  collectionModalBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "transparent",
    alignItems: "center",
  },
});
