import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  Text,
  View,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Dimensions,
  Platform,
} from "react-native";
import { Image } from "expo-image";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { useToast } from "@/lib/toast-context";
import { generateImages } from "@/lib/api/generate";
import { saveGalleryImage } from "@/lib/storage/app-storage";
import { addPromptToHistory } from "@/lib/storage/app-storage";
import {
  REPLICATE_MODELS,
  GOOGLE_MODELS,
  RUNPOD_MODEL,
  ASPECT_RATIOS,
  type ProviderType,
  type ModelInfo,
  type AspectRatio,
  type GenerationRequest,
  type GalleryImage,
} from "@/lib/types";

const PROVIDERS: { id: ProviderType; label: string }[] = [
  { id: "replicate", label: "Replicate" },
  { id: "google", label: "Google" },
  { id: "runpod", label: "RunPod" },
];

function getModelsForProvider(provider: ProviderType): ModelInfo[] {
  switch (provider) {
    case "replicate":
      return REPLICATE_MODELS;
    case "google":
      return GOOGLE_MODELS;
    case "runpod":
      return [RUNPOD_MODEL];
    default:
      return [];
  }
}

export default function GenerateScreen() {
  const colors = useColors();
  const { showToast } = useToast();
  const screenWidth = Dimensions.get("window").width;

  const [provider, setProvider] = useState<ProviderType>("replicate");
  const [selectedModel, setSelectedModel] = useState<ModelInfo>(REPLICATE_MODELS[0]);
  const [prompt, setPrompt] = useState("");
  const [negativePrompt, setNegativePrompt] = useState("");
  const [showNegative, setShowNegative] = useState(false);
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>(ASPECT_RATIOS[0]);
  const [batchSize, setBatchSize] = useState(1);
  const [cfg, setCfg] = useState(7);
  const [steps, setSteps] = useState(30);
  const [generating, setGenerating] = useState(false);
  const [progressStatus, setProgressStatus] = useState("");
  const [resultImages, setResultImages] = useState<string[]>([]);
  const [showModelPicker, setShowModelPicker] = useState(false);

  useEffect(() => {
    const models = getModelsForProvider(provider);
    if (models.length > 0) {
      setSelectedModel(models[0]);
      setCfg(models[0].defaultCfg ?? 7);
      setSteps(models[0].defaultSteps ?? 30);
    }
  }, [provider]);

  const handleGenerate = useCallback(async () => {
    if (!prompt.trim()) {
      showToast("Please enter a prompt", "warning");
      return;
    }

    setGenerating(true);
    setProgressStatus("Starting...");
    setResultImages([]);

    try {
      const request: GenerationRequest = {
        provider,
        model: selectedModel,
        prompt: prompt.trim(),
        negativePrompt: negativePrompt.trim() || undefined,
        aspectRatio,
        batchSize,
        cfg: selectedModel.supportsCfg ? cfg : undefined,
        steps: selectedModel.supportsSteps ? steps : undefined,
      };

      const images = await generateImages(request, setProgressStatus);
      setResultImages(images);

      // Save to history
      await addPromptToHistory(prompt.trim(), negativePrompt.trim() || undefined, provider, selectedModel.name);

      // Save each image to gallery
      for (const imageUrl of images) {
        const galleryImage: GalleryImage = {
          id: Date.now().toString() + Math.random().toString(36).slice(2),
          uri: imageUrl,
          prompt: prompt.trim(),
          negativePrompt: negativePrompt.trim() || undefined,
          provider,
          model: selectedModel.name,
          aspectRatio: aspectRatio.value,
          createdAt: Date.now(),
          collections: [],
        };
        await saveGalleryImage(galleryImage);
      }

      showToast(`Generated ${images.length} image${images.length > 1 ? "s" : ""}`, "success");
    } catch (error: any) {
      const errMsg = error.message || "Generation failed";
      showToast(errMsg.length > 120 ? errMsg.slice(0, 120) + "..." : errMsg, "error");
    } finally {
      setGenerating(false);
      setProgressStatus("");
    }
  }, [prompt, negativePrompt, provider, selectedModel, aspectRatio, batchSize, cfg, steps]);

  const models = getModelsForProvider(provider);

  return (
    <ScreenContainer>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={[styles.screenTitle, { color: colors.foreground }]}>Generate</Text>

        {/* Provider Selector */}
        <View style={styles.providerRow}>
          {PROVIDERS.map((p) => (
            <TouchableOpacity
              key={p.id}
              onPress={() => setProvider(p.id)}
              style={[
                styles.providerPill,
                {
                  backgroundColor: provider === p.id ? colors.primary : colors.surface,
                  borderColor: provider === p.id ? colors.primary : colors.border,
                },
              ]}
            >
              <Text
                style={[
                  styles.providerPillText,
                  { color: provider === p.id ? "#fff" : colors.foreground },
                ]}
              >
                {p.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Model Selector */}
        <TouchableOpacity
          onPress={() => setShowModelPicker(!showModelPicker)}
          style={[styles.modelSelector, { backgroundColor: colors.surface, borderColor: colors.border }]}
        >
          <Text style={[styles.modelSelectorLabel, { color: colors.muted }]}>Model</Text>
          <Text style={[styles.modelSelectorValue, { color: colors.foreground }]}>
            {selectedModel.name}
          </Text>
          <Text style={{ color: colors.muted }}>▼</Text>
        </TouchableOpacity>

        {showModelPicker && (
          <View style={[styles.modelDropdown, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            {models.map((m) => (
              <TouchableOpacity
                key={m.id}
                onPress={() => {
                  setSelectedModel(m);
                  setCfg(m.defaultCfg ?? 7);
                  setSteps(m.defaultSteps ?? 30);
                  setShowModelPicker(false);
                }}
                style={[
                  styles.modelOption,
                  selectedModel.id === m.id && { backgroundColor: colors.primary + "22" },
                ]}
              >
                <Text style={[styles.modelOptionText, { color: colors.foreground }]}>
                  {m.name}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Prompt Input */}
        <View style={styles.promptSection}>
          <Text style={[styles.fieldLabel, { color: colors.muted }]}>PROMPT</Text>
          <TextInput
            style={[styles.promptInput, { color: colors.foreground, backgroundColor: colors.surface, borderColor: colors.border }]}
            value={prompt}
            onChangeText={setPrompt}
            placeholder="Describe your image..."
            placeholderTextColor={colors.muted}
            multiline
            numberOfLines={4}
            textAlignVertical="top"
          />
        </View>

        {/* Negative Prompt Toggle */}
        {selectedModel.supportsNegativePrompt && (
          <View style={styles.promptSection}>
            <TouchableOpacity
              onPress={() => setShowNegative(!showNegative)}
              style={styles.negativeToggle}
            >
              <Text style={[styles.fieldLabel, { color: colors.muted }]}>
                NEGATIVE PROMPT {showNegative ? "▲" : "▼"}
              </Text>
            </TouchableOpacity>
            {showNegative && (
              <TextInput
                style={[styles.promptInput, { color: colors.foreground, backgroundColor: colors.surface, borderColor: colors.border, minHeight: 60 }]}
                value={negativePrompt}
                onChangeText={setNegativePrompt}
                placeholder="What to avoid..."
                placeholderTextColor={colors.muted}
                multiline
                numberOfLines={2}
                textAlignVertical="top"
              />
            )}
          </View>
        )}

        {/* Aspect Ratio */}
        <View style={styles.paramSection}>
          <Text style={[styles.fieldLabel, { color: colors.muted }]}>ASPECT RATIO</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.arScroll}>
            {ASPECT_RATIOS.map((ar) => (
              <TouchableOpacity
                key={ar.value}
                onPress={() => setAspectRatio(ar)}
                style={[
                  styles.arPill,
                  {
                    backgroundColor: aspectRatio.value === ar.value ? colors.primary : colors.surface,
                    borderColor: aspectRatio.value === ar.value ? colors.primary : colors.border,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.arPillText,
                    { color: aspectRatio.value === ar.value ? "#fff" : colors.foreground },
                  ]}
                >
                  {ar.label}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* Batch Size */}
        <View style={styles.paramSection}>
          <Text style={[styles.fieldLabel, { color: colors.muted }]}>BATCH SIZE</Text>
          <View style={styles.stepperRow}>
            {[1, 2, 3, 4].map((n) => (
              <TouchableOpacity
                key={n}
                onPress={() => setBatchSize(n)}
                style={[
                  styles.stepperButton,
                  {
                    backgroundColor: batchSize === n ? colors.primary : colors.surface,
                    borderColor: batchSize === n ? colors.primary : colors.border,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.stepperText,
                    { color: batchSize === n ? "#fff" : colors.foreground },
                  ]}
                >
                  {n}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Dynamic Parameters */}
        {selectedModel.supportsCfg && (
          <View style={styles.paramSection}>
            <View style={styles.sliderHeader}>
              <Text style={[styles.fieldLabel, { color: colors.muted }]}>GUIDANCE / CFG</Text>
              <Text style={[styles.sliderValue, { color: colors.foreground }]}>{cfg.toFixed(1)}</Text>
            </View>
            <View style={styles.sliderRow}>
              <TouchableOpacity
                onPress={() => setCfg(Math.max(selectedModel.cfgRange?.[0] ?? 1, cfg - 0.5))}
                style={[styles.sliderBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
              >
                <Text style={{ color: colors.foreground, fontSize: 18 }}>−</Text>
              </TouchableOpacity>
              <View style={[styles.sliderTrack, { backgroundColor: colors.border }]}>
                <View
                  style={[
                    styles.sliderFill,
                    {
                      backgroundColor: colors.primary,
                      width: `${((cfg - (selectedModel.cfgRange?.[0] ?? 1)) / ((selectedModel.cfgRange?.[1] ?? 20) - (selectedModel.cfgRange?.[0] ?? 1))) * 100}%`,
                    },
                  ]}
                />
              </View>
              <TouchableOpacity
                onPress={() => setCfg(Math.min(selectedModel.cfgRange?.[1] ?? 20, cfg + 0.5))}
                style={[styles.sliderBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
              >
                <Text style={{ color: colors.foreground, fontSize: 18 }}>+</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {selectedModel.supportsSteps && (
          <View style={styles.paramSection}>
            <View style={styles.sliderHeader}>
              <Text style={[styles.fieldLabel, { color: colors.muted }]}>STEPS</Text>
              <Text style={[styles.sliderValue, { color: colors.foreground }]}>{steps}</Text>
            </View>
            <View style={styles.sliderRow}>
              <TouchableOpacity
                onPress={() => setSteps(Math.max(selectedModel.stepsRange?.[0] ?? 1, steps - 1))}
                style={[styles.sliderBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
              >
                <Text style={{ color: colors.foreground, fontSize: 18 }}>−</Text>
              </TouchableOpacity>
              <View style={[styles.sliderTrack, { backgroundColor: colors.border }]}>
                <View
                  style={[
                    styles.sliderFill,
                    {
                      backgroundColor: colors.primary,
                      width: `${((steps - (selectedModel.stepsRange?.[0] ?? 1)) / ((selectedModel.stepsRange?.[1] ?? 50) - (selectedModel.stepsRange?.[0] ?? 1))) * 100}%`,
                    },
                  ]}
                />
              </View>
              <TouchableOpacity
                onPress={() => setSteps(Math.min(selectedModel.stepsRange?.[1] ?? 50, steps + 1))}
                style={[styles.sliderBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
              >
                <Text style={{ color: colors.foreground, fontSize: 18 }}>+</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Generate Button */}
        <TouchableOpacity
          onPress={handleGenerate}
          disabled={generating}
          style={[
            styles.generateButton,
            { backgroundColor: colors.primary, opacity: generating ? 0.7 : 1 },
          ]}
        >
          {generating ? (
            <View style={styles.generatingRow}>
              <ActivityIndicator color="#fff" size="small" />
              <Text style={styles.generateButtonText}>
                {progressStatus || "Generating..."}
              </Text>
            </View>
          ) : (
            <Text style={styles.generateButtonText}>Generate</Text>
          )}
        </TouchableOpacity>

        {/* Result Images */}
        {resultImages.length > 0 && (
          <View style={styles.resultsSection}>
            <Text style={[styles.fieldLabel, { color: colors.muted, marginBottom: 10 }]}>
              RESULTS
            </Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {resultImages.map((uri, idx) => (
                <View
                  key={idx}
                  style={[styles.resultImageContainer, { borderColor: colors.border }]}
                >
                  <Image
                    source={{ uri }}
                    style={{
                      width: screenWidth - 64,
                      height: screenWidth - 64,
                      borderRadius: 12,
                    }}
                    contentFit="contain"
                    transition={300}
                  />
                </View>
              ))}
            </ScrollView>
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
  providerRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 14,
  },
  providerPill: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
  },
  providerPillText: {
    fontSize: 14,
    fontWeight: "600",
  },
  modelSelector: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 4,
  },
  modelSelectorLabel: {
    fontSize: 12,
    fontWeight: "500",
    marginRight: 8,
  },
  modelSelectorValue: {
    flex: 1,
    fontSize: 15,
    fontWeight: "600",
  },
  modelDropdown: {
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 10,
    overflow: "hidden",
  },
  modelOption: {
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  modelOptionText: {
    fontSize: 15,
  },
  promptSection: {
    marginTop: 14,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: "600",
    letterSpacing: 0.8,
    marginBottom: 6,
  },
  promptInput: {
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    minHeight: 100,
    lineHeight: 22,
  },
  negativeToggle: {
    paddingVertical: 4,
  },
  paramSection: {
    marginTop: 16,
  },
  arScroll: {
    marginTop: 2,
  },
  arPill: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 18,
    borderWidth: 1,
    marginRight: 8,
  },
  arPillText: {
    fontSize: 13,
    fontWeight: "600",
  },
  stepperRow: {
    flexDirection: "row",
    gap: 8,
  },
  stepperButton: {
    width: 48,
    height: 40,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  stepperText: {
    fontSize: 16,
    fontWeight: "600",
  },
  sliderHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  sliderValue: {
    fontSize: 15,
    fontWeight: "600",
  },
  sliderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  sliderBtn: {
    width: 36,
    height: 36,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  sliderTrack: {
    flex: 1,
    height: 6,
    borderRadius: 3,
    overflow: "hidden",
  },
  sliderFill: {
    height: "100%",
    borderRadius: 3,
  },
  generateButton: {
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: "center",
    marginTop: 24,
  },
  generateButtonText: {
    color: "#fff",
    fontSize: 17,
    fontWeight: "700",
  },
  generatingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  resultsSection: {
    marginTop: 24,
  },
  resultImageContainer: {
    borderRadius: 14,
    borderWidth: 1,
    overflow: "hidden",
    marginRight: 12,
  },
});
