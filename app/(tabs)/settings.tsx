import React, { useState, useEffect, useCallback } from "react";
import {
  Text,
  View,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  StyleSheet,
} from "react-native";
import { Image } from "expo-image";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { useToast } from "@/lib/toast-context";
import {
  saveApiKey,
  getApiKey,
  getAllApiKeys,
} from "@/lib/storage/secure-store";
import {
  getSettings,
  saveSettings,
  type AppSettings,
} from "@/lib/storage/app-storage";
import {
  fetchCivitaiModelVersion,
  parseCivitaiId,
} from "@/lib/api/civitai";
import type { ApiKeys, CivitaiModelPreview } from "@/lib/types";

function SecureInput({
  label,
  value,
  onChangeText,
  placeholder,
  colors,
}: {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  placeholder: string;
  colors: any;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <View style={styles.inputGroup}>
      <Text style={[styles.inputLabel, { color: colors.muted }]}>{label}</Text>
      <View style={[styles.inputRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <TextInput
          style={[styles.textInput, { color: colors.foreground }]}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={colors.muted}
          secureTextEntry={!visible}
          autoCapitalize="none"
          autoCorrect={false}
        />
        <TouchableOpacity
          onPress={() => setVisible(!visible)}
          style={styles.eyeButton}
        >
          <Text style={{ color: colors.muted, fontSize: 12 }}>
            {visible ? "HIDE" : "SHOW"}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function CivitaiPreviewCard({
  preview,
  colors,
}: {
  preview: CivitaiModelPreview;
  colors: any;
}) {
  return (
    <View style={[styles.previewCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      {preview.thumbnailUrl && (
        <Image
          source={{ uri: preview.thumbnailUrl }}
          style={styles.previewImage}
          contentFit="cover"
          transition={200}
        />
      )}
      <View style={styles.previewInfo}>
        <Text style={[styles.previewName, { color: colors.foreground }]} numberOfLines={2}>
          {preview.name}
        </Text>
        {preview.baseModel && (
          <Text style={[styles.previewBase, { color: colors.muted }]}>
            Base: {preview.baseModel}
          </Text>
        )}
      </View>
    </View>
  );
}

export default function SettingsScreen() {
  const colors = useColors();
  const { showToast } = useToast();

  const [keys, setKeys] = useState<ApiKeys>({});
  const [settings, setSettingsState] = useState<AppSettings>({
    defaultProvider: "replicate",
    defaultAspectRatio: "1:1",
  });
  const [civitaiModelInput, setCivitaiModelInput] = useState("");
  const [civitaiLoraInput, setCivitaiLoraInput] = useState("");
  const [baseModelPreview, setBaseModelPreview] = useState<CivitaiModelPreview | null>(null);
  const [loraPreview, setLoraPreview] = useState<CivitaiModelPreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const apiKeys = await getAllApiKeys();
      const appSettings = await getSettings();
      setKeys(apiKeys);
      setSettingsState(appSettings);
      if (appSettings.civitaiBaseModelId) {
        setCivitaiModelInput(appSettings.civitaiBaseModelId);
      }
    } catch (e) {
      showToast("Failed to load settings", "error");
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      // Save API keys
      if (keys.runpodApiKey !== undefined) await saveApiKey("runpodApiKey", keys.runpodApiKey);
      if (keys.runpodEndpointId !== undefined) await saveApiKey("runpodEndpointId", keys.runpodEndpointId);
      if (keys.civitaiApiToken !== undefined) await saveApiKey("civitaiApiToken", keys.civitaiApiToken);
      if (keys.replicateApiToken !== undefined) await saveApiKey("replicateApiToken", keys.replicateApiToken);
      if (keys.googleApiKey !== undefined) await saveApiKey("googleApiKey", keys.googleApiKey);

      // Save settings
      await saveSettings({
        ...settings,
        civitaiBaseModelId: civitaiModelInput || undefined,
      });

      showToast("Settings saved", "success");
    } catch (e) {
      showToast("Failed to save settings", "error");
    } finally {
      setSaving(false);
    }
  };

  const fetchCivitaiPreview = async (input: string, type: "base" | "lora") => {
    const id = parseCivitaiId(input);
    if (!id) {
      showToast("Invalid Civitai ID or URL", "error");
      return;
    }
    try {
      const preview = await fetchCivitaiModelVersion(id, keys.civitaiApiToken);
      if (preview) {
        if (type === "base") setBaseModelPreview(preview);
        else setLoraPreview(preview);
      } else {
        showToast("Model not found on Civitai", "error");
      }
    } catch (e) {
      showToast("Failed to fetch Civitai model info", "error");
    }
  };

  if (loading) {
    return (
      <ScreenContainer className="flex-1 items-center justify-center">
        <ActivityIndicator size="large" color={colors.primary} />
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <Text style={[styles.screenTitle, { color: colors.foreground }]}>Settings</Text>

        {/* Replicate Section */}
        <View style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Replicate</Text>
          <SecureInput
            label="API Token"
            value={keys.replicateApiToken || ""}
            onChangeText={(t) => setKeys((k) => ({ ...k, replicateApiToken: t }))}
            placeholder="r8_..."
            colors={colors}
          />
        </View>

        {/* Google Section */}
        <View style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Google Vertex AI</Text>
          <SecureInput
            label="API Key"
            value={keys.googleApiKey || ""}
            onChangeText={(t) => setKeys((k) => ({ ...k, googleApiKey: t }))}
            placeholder="AIza..."
            colors={colors}
          />
        </View>

        {/* RunPod Section */}
        <View style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>RunPod Custom</Text>
          <SecureInput
            label="RunPod API Key"
            value={keys.runpodApiKey || ""}
            onChangeText={(t) => setKeys((k) => ({ ...k, runpodApiKey: t }))}
            placeholder="rp_..."
            colors={colors}
          />
          <View style={styles.inputGroup}>
            <Text style={[styles.inputLabel, { color: colors.muted }]}>Endpoint ID</Text>
            <TextInput
              style={[styles.singleInput, { color: colors.foreground, backgroundColor: colors.surface, borderColor: colors.border }]}
              value={keys.runpodEndpointId || ""}
              onChangeText={(t) => setKeys((k) => ({ ...k, runpodEndpointId: t }))}
              placeholder="abc123..."
              placeholderTextColor={colors.muted}
              autoCapitalize="none"
            />
          </View>
          <SecureInput
            label="Civitai API Token"
            value={keys.civitaiApiToken || ""}
            onChangeText={(t) => setKeys((k) => ({ ...k, civitaiApiToken: t }))}
            placeholder="Civitai token..."
            colors={colors}
          />

          {/* Civitai Base Model */}
          <View style={styles.inputGroup}>
            <Text style={[styles.inputLabel, { color: colors.muted }]}>Civitai Base Model ID/URL</Text>
            <View style={[styles.inputRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <TextInput
                style={[styles.textInput, { color: colors.foreground }]}
                value={civitaiModelInput}
                onChangeText={setCivitaiModelInput}
                placeholder="e.g., 128713 or civitai.com/models/..."
                placeholderTextColor={colors.muted}
                autoCapitalize="none"
              />
              <TouchableOpacity
                onPress={() => fetchCivitaiPreview(civitaiModelInput, "base")}
                style={[styles.fetchButton, { backgroundColor: colors.primary }]}
              >
                <Text style={styles.fetchButtonText}>Fetch</Text>
              </TouchableOpacity>
            </View>
            {baseModelPreview && (
              <CivitaiPreviewCard preview={baseModelPreview} colors={colors} />
            )}
          </View>

          {/* Civitai LoRA */}
          <View style={styles.inputGroup}>
            <Text style={[styles.inputLabel, { color: colors.muted }]}>LoRA IDs/URLs (one per line)</Text>
            <TextInput
              style={[styles.multilineInput, { color: colors.foreground, backgroundColor: colors.surface, borderColor: colors.border }]}
              value={civitaiLoraInput}
              onChangeText={setCivitaiLoraInput}
              placeholder="Enter LoRA IDs, one per line"
              placeholderTextColor={colors.muted}
              multiline
              numberOfLines={3}
              autoCapitalize="none"
            />
          </View>
        </View>

        {/* Save Button */}
        <TouchableOpacity
          onPress={handleSave}
          disabled={saving}
          style={[styles.saveButton, { backgroundColor: colors.primary, opacity: saving ? 0.6 : 1 }]}
        >
          {saving ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={styles.saveButtonText}>Save Settings</Text>
          )}
        </TouchableOpacity>

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
    marginBottom: 20,
  },
  section: {
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "600",
    marginBottom: 14,
  },
  inputGroup: {
    marginBottom: 14,
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: "500",
    marginBottom: 6,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 10,
    borderWidth: 1,
    overflow: "hidden",
  },
  textInput: {
    flex: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
  },
  singleInput: {
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
  },
  multilineInput: {
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    minHeight: 80,
    textAlignVertical: "top",
  },
  eyeButton: {
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  fetchButton: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 0,
  },
  fetchButtonText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "600",
  },
  previewCard: {
    flexDirection: "row",
    borderRadius: 10,
    borderWidth: 1,
    marginTop: 10,
    overflow: "hidden",
  },
  previewImage: {
    width: 72,
    height: 72,
  },
  previewInfo: {
    flex: 1,
    padding: 10,
    justifyContent: "center",
  },
  previewName: {
    fontSize: 14,
    fontWeight: "600",
  },
  previewBase: {
    fontSize: 12,
    marginTop: 4,
  },
  saveButton: {
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 8,
  },
  saveButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
});
