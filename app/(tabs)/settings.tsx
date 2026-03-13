import React, { useState, useEffect } from "react";
import {
  Text,
  View,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  StyleSheet,
} from "react-native";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { useToast } from "@/lib/toast-context";
import { useThemeContext, type ThemeMode } from "@/lib/theme-provider";
import {
  saveApiKey,
  getAllApiKeys,
} from "@/lib/storage/secure-store";
import type { ApiKeys } from "@/lib/types";

function SecureInput({
  label,
  hint,
  value,
  onChangeText,
  placeholder,
  colors,
}: {
  label: string;
  hint?: string;
  value: string;
  onChangeText: (text: string) => void;
  placeholder: string;
  colors: any;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <View style={styles.inputGroup}>
      <Text style={[styles.inputLabel, { color: colors.muted }]}>{label}</Text>
      {hint && <Text style={[styles.inputHint, { color: colors.muted }]}>{hint}</Text>}
      <View style={[styles.inputRow, { backgroundColor: colors.background, borderColor: colors.border }]}>
        <TextInput
          style={[styles.textInput, { color: colors.foreground }]}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={colors.muted}
          secureTextEntry={!visible}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="done"
        />
        <TouchableOpacity
          onPress={() => setVisible(!visible)}
          style={styles.eyeButton}
        >
          <Text style={{ color: colors.muted, fontSize: 11, fontWeight: "600" }}>
            {visible ? "HIDE" : "SHOW"}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function PlainInput({
  label,
  hint,
  value,
  onChangeText,
  placeholder,
  colors,
}: {
  label: string;
  hint?: string;
  value: string;
  onChangeText: (text: string) => void;
  placeholder: string;
  colors: any;
}) {
  return (
    <View style={styles.inputGroup}>
      <Text style={[styles.inputLabel, { color: colors.muted }]}>{label}</Text>
      {hint && <Text style={[styles.inputHint, { color: colors.muted }]}>{hint}</Text>}
      <TextInput
        style={[styles.singleInput, { color: colors.foreground, backgroundColor: colors.background, borderColor: colors.border }]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.muted}
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="done"
      />
    </View>
  );
}

const THEME_OPTIONS: { mode: ThemeMode; label: string; icon: string }[] = [
  { mode: "light", label: "Light", icon: "☀️" },
  { mode: "dark", label: "Dark", icon: "🌙" },
  { mode: "system", label: "System", icon: "⚙️" },
];

export default function SettingsScreen() {
  const colors = useColors();
  const { showToast } = useToast();
  const { themeMode, setThemeMode } = useThemeContext();

  const [keys, setKeys] = useState<ApiKeys>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const apiKeys = await getAllApiKeys();
      setKeys(apiKeys);
    } catch {
      showToast("Failed to load settings", "error");
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      if (keys.replicateApiToken !== undefined)
        await saveApiKey("replicateApiToken", keys.replicateApiToken);
      if (keys.googleApiKey !== undefined)
        await saveApiKey("googleApiKey", keys.googleApiKey);
      if (keys.runpodApiKey !== undefined)
        await saveApiKey("runpodApiKey", keys.runpodApiKey);
      if (keys.runpodEndpointId !== undefined)
        await saveApiKey("runpodEndpointId", keys.runpodEndpointId);
      if (keys.civitaiApiToken !== undefined)
        await saveApiKey("civitaiApiToken", keys.civitaiApiToken);

      showToast("Settings saved", "success");
    } catch {
      showToast("Failed to save settings", "error");
    } finally {
      setSaving(false);
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
        keyboardShouldPersistTaps="handled"
      >
        <Text style={[styles.screenTitle, { color: colors.foreground }]}>Settings</Text>
        <Text style={[styles.screenSubtitle, { color: colors.muted }]}>
          Appearance and API configuration.
        </Text>

        {/* Appearance / Theme */}
        <View style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Appearance</Text>
          <Text style={[styles.sectionDesc, { color: colors.muted }]}>
            Choose your preferred color theme.
          </Text>
          <View style={styles.themeRow}>
            {THEME_OPTIONS.map((opt) => {
              const isActive = themeMode === opt.mode;
              return (
                <TouchableOpacity
                  key={opt.mode}
                  onPress={() => setThemeMode(opt.mode)}
                  style={[
                    styles.themeOption,
                    {
                      backgroundColor: isActive ? colors.primary : colors.background,
                      borderColor: isActive ? colors.primary : colors.border,
                    },
                  ]}
                >
                  <Text style={styles.themeIcon}>{opt.icon}</Text>
                  <Text
                    style={[
                      styles.themeLabel,
                      { color: isActive ? "#fff" : colors.foreground },
                    ]}
                  >
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* API Keys Header */}
        <Text style={[styles.apiKeysHeader, { color: colors.muted }]}>
          API keys are stored securely on your device.
        </Text>

        {/* Replicate */}
        <View style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Replicate</Text>
          <Text style={[styles.sectionDesc, { color: colors.muted }]}>
            Used for FLUX.2, FLUX.1 Schnell, and other Replicate-hosted models.
          </Text>
          <SecureInput
            label="API TOKEN"
            hint="Get yours at replicate.com/account/api-tokens"
            value={keys.replicateApiToken || ""}
            onChangeText={(t) => setKeys((k) => ({ ...k, replicateApiToken: t }))}
            placeholder="r8_..."
            colors={colors}
          />
        </View>

        {/* Google Gemini */}
        <View style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Google (Gemini API)</Text>
          <Text style={[styles.sectionDesc, { color: colors.muted }]}>
            Used for Imagen 3 and Imagen 4 image generation.
          </Text>
          <SecureInput
            label="API KEY"
            hint="Get yours at aistudio.google.com/apikey"
            value={keys.googleApiKey || ""}
            onChangeText={(t) => setKeys((k) => ({ ...k, googleApiKey: t }))}
            placeholder="AIza..."
            colors={colors}
          />
        </View>

        {/* RunPod */}
        <View style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>RunPod</Text>
          <Text style={[styles.sectionDesc, { color: colors.muted }]}>
            Used for custom Civitai models and LoRAs via your serverless endpoint. Configure models and LoRAs in the Generate tab when RunPod is selected.
          </Text>
          <SecureInput
            label="RUNPOD API KEY"
            hint="Get yours at runpod.io/console/user/settings → API Keys"
            value={keys.runpodApiKey || ""}
            onChangeText={(t) => setKeys((k) => ({ ...k, runpodApiKey: t }))}
            placeholder="rp_..."
            colors={colors}
          />
          <PlainInput
            label="ENDPOINT ID"
            hint="Found in your serverless endpoint dashboard"
            value={keys.runpodEndpointId || ""}
            onChangeText={(t) => setKeys((k) => ({ ...k, runpodEndpointId: t }))}
            placeholder="abc1234xyz..."
            colors={colors}
          />
          <SecureInput
            label="CIVITAI API TOKEN"
            hint="Optional — needed for private models. Get at civitai.com/user/account"
            value={keys.civitaiApiToken || ""}
            onChangeText={(t) => setKeys((k) => ({ ...k, civitaiApiToken: t }))}
            placeholder="civitai_..."
            colors={colors}
          />
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

        <View style={{ height: 60 }} />
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
    marginBottom: 4,
  },
  screenSubtitle: {
    fontSize: 14,
    marginBottom: 20,
    lineHeight: 20,
  },
  apiKeysHeader: {
    fontSize: 12,
    fontWeight: "500",
    letterSpacing: 0.5,
    marginBottom: 12,
    marginTop: 4,
  },
  section: {
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: "600",
    marginBottom: 4,
  },
  sectionDesc: {
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 14,
  },
  themeRow: {
    flexDirection: "row",
    gap: 10,
  },
  themeOption: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
  },
  themeIcon: {
    fontSize: 16,
  },
  themeLabel: {
    fontSize: 14,
    fontWeight: "600",
  },
  inputGroup: {
    marginBottom: 14,
  },
  inputLabel: {
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 0.8,
    marginBottom: 3,
  },
  inputHint: {
    fontSize: 11,
    marginBottom: 6,
    lineHeight: 16,
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
    fontSize: 14,
  },
  singleInput: {
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  },
  eyeButton: {
    paddingHorizontal: 12,
    paddingVertical: 10,
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
