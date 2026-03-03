import React, { useState, useCallback } from "react";
import {
  Text,
  View,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  Alert,
  Platform,
} from "react-native";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { useToast } from "@/lib/toast-context";
import { useFocusEffect } from "@react-navigation/native";
import { useRouter } from "expo-router";
import {
  getPromptHistory,
  clearPromptHistory,
  getBookmarks,
  addBookmark,
  removeBookmark,
} from "@/lib/storage/app-storage";
import type { SavedPrompt } from "@/lib/types";

type TabType = "history" | "bookmarks";

function PromptItem({
  item,
  colors,
  onPress,
  onBookmark,
  onRemoveBookmark,
  isBookmarked,
}: {
  item: SavedPrompt;
  colors: any;
  onPress: () => void;
  onBookmark?: () => void;
  onRemoveBookmark?: () => void;
  isBookmarked: boolean;
}) {
  const date = new Date(item.createdAt);
  const dateStr = `${date.getMonth() + 1}/${date.getDate()} ${date.getHours()}:${date.getMinutes().toString().padStart(2, "0")}`;

  return (
    <TouchableOpacity
      onPress={onPress}
      style={[styles.promptItem, { backgroundColor: colors.surface, borderColor: colors.border }]}
    >
      <View style={styles.promptContent}>
        <Text style={[styles.promptText, { color: colors.foreground }]} numberOfLines={3}>
          {item.prompt}
        </Text>
        {item.negativePrompt && (
          <Text style={[styles.negativeText, { color: colors.muted }]} numberOfLines={1}>
            Neg: {item.negativePrompt}
          </Text>
        )}
        <View style={styles.promptMeta}>
          <Text style={[styles.metaText, { color: colors.muted }]}>
            {item.provider} · {item.model}
          </Text>
          <Text style={[styles.metaText, { color: colors.muted }]}>{dateStr}</Text>
        </View>
      </View>
      <View style={styles.promptActions}>
        {onBookmark && !isBookmarked && (
          <TouchableOpacity onPress={onBookmark} style={styles.actionButton}>
            <Text style={{ color: colors.muted, fontSize: 20 }}>☆</Text>
          </TouchableOpacity>
        )}
        {onRemoveBookmark && isBookmarked && (
          <TouchableOpacity onPress={onRemoveBookmark} style={styles.actionButton}>
            <Text style={{ color: colors.warning, fontSize: 20 }}>★</Text>
          </TouchableOpacity>
        )}
      </View>
    </TouchableOpacity>
  );
}

export default function PromptsScreen() {
  const colors = useColors();
  const { showToast } = useToast();
  const router = useRouter();

  const [activeTab, setActiveTab] = useState<TabType>("history");
  const [history, setHistory] = useState<SavedPrompt[]>([]);
  const [bookmarks, setBookmarks] = useState<SavedPrompt[]>([]);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [])
  );

  const loadData = async () => {
    try {
      const [h, b] = await Promise.all([getPromptHistory(), getBookmarks()]);
      setHistory(h);
      setBookmarks(b);
    } catch (e) {
      showToast("Failed to load prompts", "error");
    } finally {
      setLoading(false);
    }
  };

  const handleBookmark = async (prompt: SavedPrompt) => {
    try {
      await addBookmark(prompt);
      setBookmarks((prev) => [{ ...prompt, isBookmarked: true }, ...prev]);
      showToast("Prompt bookmarked", "success");
    } catch (e) {
      showToast("Failed to bookmark", "error");
    }
  };

  const handleRemoveBookmark = async (id: string) => {
    try {
      await removeBookmark(id);
      setBookmarks((prev) => prev.filter((b) => b.id !== id));
      showToast("Bookmark removed", "info");
    } catch (e) {
      showToast("Failed to remove bookmark", "error");
    }
  };

  const handleClearHistory = () => {
    if (Platform.OS === "web") {
      clearPromptHistory().then(() => {
        setHistory([]);
        showToast("History cleared", "info");
      });
    } else {
      Alert.alert("Clear History", "Remove all prompt history?", [
        { text: "Cancel", style: "cancel" },
        {
          text: "Clear",
          style: "destructive",
          onPress: async () => {
            await clearPromptHistory();
            setHistory([]);
            showToast("History cleared", "info");
          },
        },
      ]);
    }
  };

  const handleUsePrompt = (prompt: SavedPrompt) => {
    // Navigate to generate tab - the prompt will be loaded there
    showToast("Prompt copied! Switch to Generate tab to use it.", "info");
  };

  const bookmarkIds = new Set(bookmarks.map((b) => b.id));
  const data = activeTab === "history" ? history : bookmarks;

  return (
    <ScreenContainer>
      <View style={styles.header}>
        <Text style={[styles.screenTitle, { color: colors.foreground }]}>Prompts</Text>
        {activeTab === "history" && history.length > 0 && (
          <TouchableOpacity onPress={handleClearHistory}>
            <Text style={[styles.clearText, { color: colors.error }]}>Clear</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Tab Switcher */}
      <View style={[styles.tabRow, { borderColor: colors.border }]}>
        <TouchableOpacity
          onPress={() => setActiveTab("history")}
          style={[
            styles.tab,
            activeTab === "history" && { borderBottomColor: colors.primary, borderBottomWidth: 2 },
          ]}
        >
          <Text
            style={[
              styles.tabText,
              { color: activeTab === "history" ? colors.primary : colors.muted },
            ]}
          >
            History ({history.length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => setActiveTab("bookmarks")}
          style={[
            styles.tab,
            activeTab === "bookmarks" && { borderBottomColor: colors.primary, borderBottomWidth: 2 },
          ]}
        >
          <Text
            style={[
              styles.tabText,
              { color: activeTab === "bookmarks" ? colors.primary : colors.muted },
            ]}
          >
            Bookmarks ({bookmarks.length})
          </Text>
        </TouchableOpacity>
      </View>

      {/* Prompt List */}
      {data.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={[styles.emptyText, { color: colors.muted }]}>
            {activeTab === "history"
              ? "No prompt history yet. Generate some images!"
              : "No bookmarked prompts yet."}
          </Text>
        </View>
      ) : (
        <FlatList
          data={data}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <PromptItem
              item={item}
              colors={colors}
              onPress={() => handleUsePrompt(item)}
              onBookmark={
                activeTab === "history" && !bookmarkIds.has(item.id)
                  ? () => handleBookmark(item)
                  : undefined
              }
              onRemoveBookmark={
                activeTab === "bookmarks"
                  ? () => handleRemoveBookmark(item.id)
                  : undefined
              }
              isBookmarked={bookmarkIds.has(item.id)}
            />
          )}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        />
      )}
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
  clearText: {
    fontSize: 15,
    fontWeight: "500",
  },
  tabRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    marginTop: 12,
    marginHorizontal: 16,
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    alignItems: "center",
  },
  tabText: {
    fontSize: 15,
    fontWeight: "600",
  },
  emptyState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 80,
  },
  emptyText: {
    fontSize: 15,
    textAlign: "center",
    paddingHorizontal: 32,
  },
  listContent: {
    padding: 16,
    gap: 10,
  },
  promptItem: {
    flexDirection: "row",
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
  },
  promptContent: {
    flex: 1,
  },
  promptText: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "500",
  },
  negativeText: {
    fontSize: 12,
    marginTop: 4,
    fontStyle: "italic",
  },
  promptMeta: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 8,
  },
  metaText: {
    fontSize: 12,
  },
  promptActions: {
    justifyContent: "center",
    paddingLeft: 10,
  },
  actionButton: {
    padding: 4,
  },
});
