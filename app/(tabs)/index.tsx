import React, { useState, useEffect, useCallback, useRef } from "react";
import { useFocusEffect } from "@react-navigation/native";
import { useRouter } from "expo-router";
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
  Modal,
  Alert,
  Switch,
} from "react-native";
import { Image } from "expo-image";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { useToast } from "@/lib/toast-context";
import { generateImages } from "@/lib/api/generate";
import { saveGalleryImage, addPromptToHistory, getReuseSettings, clearReuseSettings } from "@/lib/storage/app-storage";
import { fetchCivitaiModelVersion, parseCivitaiId } from "@/lib/api/civitai";
import type { CivitaiModelDetails } from "@/lib/api/civitai";
import { getApiKey } from "@/lib/storage/secure-store";
import {
  REPLICATE_MODELS,
  GOOGLE_MODELS,
  RUNPOD_MODEL,
  ASPECT_RATIOS,
  SAMPLING_METHODS,
  type ProviderType,
  type ModelInfo,
  type AspectRatio,
  type GenerationRequest,
  type GalleryImage,
  type LoraEntry,
  type SamplingMethodId,
  type CivitaiModelPreview,
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

// ===== Slider Component =====
function Slider({
  label,
  value,
  min,
  max,
  step = 1,
  onDecrease,
  onIncrease,
  colors,
  format,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onDecrease: () => void;
  onIncrease: () => void;
  colors: any;
  format?: (v: number) => string;
}) {
  const pct = Math.max(0, Math.min(100, ((value - min) / (max - min)) * 100));
  const displayVal = format ? format(value) : String(value);
  return (
    <View style={styles.paramSection}>
      <View style={styles.sliderHeader}>
        <Text style={[styles.fieldLabel, { color: colors.muted }]}>{label}</Text>
        <Text style={[styles.sliderValue, { color: colors.foreground }]}>{displayVal}</Text>
      </View>
      <View style={styles.sliderRow}>
        <TouchableOpacity
          onPress={onDecrease}
          style={[styles.sliderBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
        >
          <Text style={{ color: colors.foreground, fontSize: 18 }}>−</Text>
        </TouchableOpacity>
        <View style={[styles.sliderTrack, { backgroundColor: colors.border }]}>
          <View style={[styles.sliderFill, { backgroundColor: colors.primary, width: `${pct}%` }]} />
        </View>
        <TouchableOpacity
          onPress={onIncrease}
          style={[styles.sliderBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
        >
          <Text style={{ color: colors.foreground, fontSize: 18 }}>+</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ===== LoRA Row Component =====
function LoraRow({
  entry,
  onRemove,
  onWeightChange,
  onInsertTrigger,
  colors,
}: {
  entry: LoraEntry;
  onRemove: () => void;
  onWeightChange: (w: number) => void;
  onInsertTrigger?: (words: string) => void;
  colors: any;
}) {
  const hasTriggers = entry.triggerWords && entry.triggerWords.length > 0;
  return (
    <View style={[styles.loraRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      {entry.preview?.thumbnailUrl ? (
        <Image
          source={{ uri: entry.preview.thumbnailUrl }}
          style={styles.loraThumbnail}
          contentFit="cover"
        />
      ) : (
        <View style={[styles.loraThumbnail, { backgroundColor: colors.border, alignItems: "center", justifyContent: "center" }]}>
          <Text style={{ color: colors.muted, fontSize: 10 }}>LoRA</Text>
        </View>
      )}
      <View style={{ flex: 1, paddingHorizontal: 8 }}>
        <Text style={[styles.loraName, { color: colors.foreground }]} numberOfLines={1}>
          {entry.preview?.name || `LoRA ${entry.id}`}
        </Text>
        <Text style={[styles.loraBase, { color: colors.muted }]}>
          {entry.preview?.baseModel || "Unknown base"}
        </Text>
        {hasTriggers && (
          <TouchableOpacity
            onPress={() => onInsertTrigger?.(entry.triggerWords!.join(", "))}
            style={[styles.loraTriggerBtn, { backgroundColor: colors.primary + "22", borderColor: colors.primary + "44" }]}
          >
            <Text style={[styles.loraTriggerText, { color: colors.primary }]} numberOfLines={1}>
              + triggers: {entry.triggerWords!.slice(0, 2).join(", ")}{entry.triggerWords!.length > 2 ? "..." : ""}
            </Text>
          </TouchableOpacity>
        )}
        <View style={styles.loraWeightRow}>
          <TouchableOpacity
            onPress={() => onWeightChange(Math.max(0, Math.round((entry.weight - 0.1) * 10) / 10))}
            style={[styles.loraWeightBtn, { backgroundColor: colors.background, borderColor: colors.border }]}
          >
            <Text style={{ color: colors.foreground }}>−</Text>
          </TouchableOpacity>
          <Text style={[styles.loraWeightText, { color: colors.foreground }]}>
            {entry.weight.toFixed(1)}
          </Text>
          <TouchableOpacity
            onPress={() => onWeightChange(Math.min(2, Math.round((entry.weight + 0.1) * 10) / 10))}
            style={[styles.loraWeightBtn, { backgroundColor: colors.background, borderColor: colors.border }]}
          >
            <Text style={{ color: colors.foreground }}>+</Text>
          </TouchableOpacity>
        </View>
      </View>
      <TouchableOpacity onPress={onRemove} style={styles.loraRemove}>
        <Text style={{ color: colors.error, fontSize: 18 }}>×</Text>
      </TouchableOpacity>
    </View>
  );
}

export default function GenerateScreen() {
  const colors = useColors();
  const { showToast } = useToast();
  const screenWidth = Dimensions.get("window").width;

  // Provider / model
  const [provider, setProvider] = useState<ProviderType>("replicate");
  const [selectedModel, setSelectedModel] = useState<ModelInfo>(REPLICATE_MODELS[0]);
  const [showModelPicker, setShowModelPicker] = useState(false);

  // Prompts
  const [prompt, setPrompt] = useState("");
  const [negativePrompt, setNegativePrompt] = useState("");
  const [showNegative, setShowNegative] = useState(false);

  // Basic params
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>(ASPECT_RATIOS[0]);
  const [batchSize, setBatchSize] = useState(1);
  const [cfg, setCfg] = useState(7);
  const [steps, setSteps] = useState(30);

  // Advanced params
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [seed, setSeed] = useState<string>("");
  const [useRandomSeed, setUseRandomSeed] = useState(true);
  const [samplingMethod, setSamplingMethod] = useState<SamplingMethodId>("euler_a");
  const [showSamplerPicker, setShowSamplerPicker] = useState(false);
  const [clipSkip, setClipSkip] = useState(1);
  const [qualityBoost, setQualityBoost] = useState(false);

  // RunPod Civitai config (inline in Generate tab)
  const [civitaiModelInput, setCivitaiModelInput] = useState("");
  const [civitaiModelPreview, setCivitaiModelPreview] = useState<CivitaiModelPreview | null>(null);
  const [fetchingModel, setFetchingModel] = useState(false);
  const [loraEntries, setLoraEntries] = useState<LoraEntry[]>([]);
  const [loraInput, setLoraInput] = useState("");
  const [fetchingLora, setFetchingLora] = useState(false);

  // Generation state
  const [generating, setGenerating] = useState(false);
  const [progressStatus, setProgressStatus] = useState("");
  const [resultImages, setResultImages] = useState<string[]>([]);

  // Fullscreen viewer
  const [viewerUri, setViewerUri] = useState<string | null>(null);

  // Negative prompt presets
  const [showNegPresets, setShowNegPresets] = useState(false);

  const NEGATIVE_PRESETS = [
    {
      label: "SDXL Quality",
      value: "worst quality, low quality, normal quality, lowres, blurry, jpeg artifacts, watermark, signature, text, logo, bad anatomy, bad hands, extra fingers, missing fingers, deformed, ugly",
    },
    {
      label: "Anime Clean",
      value: "lowres, bad anatomy, bad hands, text, error, missing fingers, extra digit, fewer digits, cropped, worst quality, low quality, normal quality, jpeg artifacts, signature, watermark, username, blurry, artist name",
    },
    {
      label: "Photorealistic",
      value: "cartoon, anime, illustration, painting, drawing, art, sketch, 3d render, cgi, unrealistic, deformed, disfigured, bad anatomy, extra limbs, watermark, text, blurry, low quality, grainy",
    },
    {
      label: "Pony/Illustrious",
      value: "score_4, score_3, score_2, score_1, bad quality, worst quality, low quality, normal quality, lowres, bad anatomy, bad hands, extra fingers, missing fingers, deformed, ugly, watermark, text",
    },
    {
      label: "No Watermarks",
      value: "watermark, signature, text, logo, username, artist name, copyright, url",
    },
    {
      label: "Face Fix",
      value: "bad face, deformed face, ugly face, asymmetrical eyes, cross-eyed, extra eyes, missing eyes, bad teeth, deformed teeth, bad nose, deformed nose",
    },
  ];

  useEffect(() => {
    const models = getModelsForProvider(provider);
    if (models.length > 0) {
      setSelectedModel(models[0]);
      setCfg(models[0].defaultCfg ?? 7);
      setSteps(models[0].defaultSteps ?? 30);
    }
  }, [provider]);

  // Load reuse settings when tab comes into focus
  useFocusEffect(
    useCallback(() => {
      (async () => {
        const reuse = await getReuseSettings();
        if (!reuse) return;
        await clearReuseSettings();

        // Apply provider
        setProvider(reuse.provider);
        const models = getModelsForProvider(reuse.provider);
        const matchedModel = models.find((m) => m.id === reuse.modelId) || models[0];
        if (matchedModel) {
          setSelectedModel(matchedModel);
          setCfg(reuse.cfg ?? matchedModel.defaultCfg ?? 7);
          setSteps(reuse.steps ?? matchedModel.defaultSteps ?? 30);
        }

        // Apply prompts
        setPrompt(reuse.prompt);
        if (reuse.negativePrompt) {
          setNegativePrompt(reuse.negativePrompt);
          setShowNegative(true);
        }

        // Apply aspect ratio
        const ar = ASPECT_RATIOS.find((a) => a.value === reuse.aspectRatioValue);
        if (ar) setAspectRatio(ar);

        // Apply advanced params
        if (reuse.seed !== undefined) {
          setSeed(String(reuse.seed));
          setUseRandomSeed(false);
        }
        if (reuse.samplingMethod) setSamplingMethod(reuse.samplingMethod as SamplingMethodId);
        if (reuse.clipSkip !== undefined) setClipSkip(reuse.clipSkip);
        if (reuse.qualityBoost !== undefined) setQualityBoost(reuse.qualityBoost);
        if (reuse.civitaiModelInput) setCivitaiModelInput(reuse.civitaiModelInput);

        showToast("Settings loaded from gallery image", "success");
      })();
    }, [])
  );

  // ===== Civitai Fetch =====
  const fetchCivitaiModel = useCallback(async () => {
    const id = parseCivitaiId(civitaiModelInput);
    if (!id) {
      showToast("Invalid Civitai ID or URL", "error");
      return;
    }
    setFetchingModel(true);
    try {
      const civitaiToken = await getApiKey("civitaiApiToken");
      const preview = await fetchCivitaiModelVersion(id, civitaiToken || undefined);
      if (preview) {
        setCivitaiModelPreview(preview);
        showToast("Model loaded: " + preview.name.slice(0, 40), "success");
      } else {
        showToast("Model not found on Civitai", "error");
      }
    } catch {
      showToast("Failed to fetch Civitai model", "error");
    } finally {
      setFetchingModel(false);
    }
  }, [civitaiModelInput]);

  const fetchLoraAndAdd = useCallback(async () => {
    const id = parseCivitaiId(loraInput);
    if (!id) {
      showToast("Invalid Civitai LoRA ID or URL", "error");
      return;
    }
    if (loraEntries.some((l) => l.id === id)) {
      showToast("LoRA already added", "warning");
      return;
    }
    setFetchingLora(true);
    try {
      const civitaiToken = await getApiKey("civitaiApiToken");
      const details = await fetchCivitaiModelVersion(id, civitaiToken || undefined) as CivitaiModelDetails | null;
      const triggerWords = details?.triggerWords ?? [];
      const entry: LoraEntry = { id, weight: 0.8, preview: details, triggerWords };
      setLoraEntries((prev) => [...prev, entry]);
      setLoraInput("");
      if (triggerWords.length > 0) {
        showToast(`LoRA added — triggers: ${triggerWords.slice(0, 3).join(", ")}`, "success");
      } else {
        showToast(details ? "LoRA added: " + details.name.slice(0, 30) : "LoRA added", "success");
      }
    } catch {
      showToast("Failed to fetch LoRA info", "error");
    } finally {
      setFetchingLora(false);
    }
  }, [loraInput, loraEntries]);

  const removeLoraEntry = useCallback((id: string) => {
    setLoraEntries((prev) => prev.filter((l) => l.id !== id));
  }, []);

  const updateLoraWeight = useCallback((id: string, weight: number) => {
    setLoraEntries((prev) => prev.map((l) => (l.id === id ? { ...l, weight } : l)));
  }, []);

  // ===== Generate =====
  const handleGenerate = useCallback(async () => {
    if (!prompt.trim()) {
      showToast("Please enter a prompt", "warning");
      return;
    }

    setGenerating(true);
    setProgressStatus("Starting...");
    setResultImages([]);

    try {
      const effectiveSeed = useRandomSeed
        ? undefined
        : seed.trim()
        ? parseInt(seed.trim(), 10)
        : undefined;

      const request: GenerationRequest = {
        provider,
        model: selectedModel,
        prompt: prompt.trim(),
        negativePrompt: negativePrompt.trim() || undefined,
        aspectRatio,
        batchSize,
        cfg: selectedModel.supportsCfg ? cfg : undefined,
        steps: selectedModel.supportsSteps ? steps : undefined,
        seed: effectiveSeed,
        samplingMethod: provider === "runpod" ? samplingMethod : undefined,
        clipSkip: provider === "runpod" ? clipSkip : undefined,
        qualityBoost: provider === "runpod" ? qualityBoost : undefined,
        loraEntries: provider === "runpod" ? loraEntries : undefined,
        civitaiModelId:
          provider === "runpod" && civitaiModelPreview
            ? parseCivitaiId(civitaiModelInput) || undefined
            : undefined,
      };

      const images = await generateImages(request, setProgressStatus);
      setResultImages(images);

      await addPromptToHistory(
        prompt.trim(),
        negativePrompt.trim() || undefined,
        provider,
        selectedModel.name
      );

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
  }, [
    prompt, negativePrompt, provider, selectedModel, aspectRatio, batchSize,
    cfg, steps, seed, useRandomSeed, samplingMethod, clipSkip, qualityBoost,
    loraEntries, civitaiModelInput, civitaiModelPreview,
  ]);

  const models = getModelsForProvider(provider);
  const selectedSampler = SAMPLING_METHODS.find((s) => s.id === samplingMethod);

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
                <Text style={[styles.modelOptionText, { color: colors.foreground }]}>{m.name}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* ===== RunPod: Civitai Model + LoRA (inline) ===== */}
        {provider === "runpod" && (
          <View style={[styles.runpodSection, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.runpodSectionTitle, { color: colors.foreground }]}>
              Civitai Configuration
            </Text>

            {/* Base Model */}
            <Text style={[styles.fieldLabel, { color: colors.muted, marginBottom: 6 }]}>
              BASE MODEL (ID or URL)
            </Text>
            <View style={[styles.inputRow, { backgroundColor: colors.background, borderColor: colors.border }]}>
              <TextInput
                style={[styles.inputField, { color: colors.foreground }]}
                value={civitaiModelInput}
                onChangeText={setCivitaiModelInput}
                placeholder="e.g. 128713 or civitai.com/models/..."
                placeholderTextColor={colors.muted}
                autoCapitalize="none"
                autoCorrect={false}
              />
              <TouchableOpacity
                onPress={fetchCivitaiModel}
                disabled={fetchingModel || !civitaiModelInput.trim()}
                style={[
                  styles.fetchBtn,
                  { backgroundColor: colors.primary, opacity: fetchingModel || !civitaiModelInput.trim() ? 0.5 : 1 },
                ]}
              >
                {fetchingModel ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.fetchBtnText}>Fetch</Text>
                )}
              </TouchableOpacity>
            </View>

            {civitaiModelPreview && (
              <View style={[styles.previewCard, { backgroundColor: colors.background, borderColor: colors.border }]}>
                {civitaiModelPreview.thumbnailUrl && (
                  <Image
                    source={{ uri: civitaiModelPreview.thumbnailUrl }}
                    style={styles.previewThumb}
                    contentFit="cover"
                  />
                )}
                <View style={{ flex: 1, paddingLeft: 10 }}>
                  <Text style={[styles.previewName, { color: colors.foreground }]} numberOfLines={2}>
                    {civitaiModelPreview.name}
                  </Text>
                  {civitaiModelPreview.baseModel && (
                    <Text style={[styles.previewBase, { color: colors.muted }]}>
                      {civitaiModelPreview.baseModel}
                    </Text>
                  )}
                </View>
                <TouchableOpacity
                  onPress={() => { setCivitaiModelPreview(null); setCivitaiModelInput(""); }}
                  style={{ padding: 6 }}
                >
                  <Text style={{ color: colors.error, fontSize: 16 }}>×</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* LoRA Section */}
            <Text style={[styles.fieldLabel, { color: colors.muted, marginTop: 14, marginBottom: 6 }]}>
              LORAS
            </Text>
            <View style={[styles.inputRow, { backgroundColor: colors.background, borderColor: colors.border }]}>
              <TextInput
                style={[styles.inputField, { color: colors.foreground }]}
                value={loraInput}
                onChangeText={setLoraInput}
                placeholder="LoRA ID or civitai.com/models/..."
                placeholderTextColor={colors.muted}
                autoCapitalize="none"
                autoCorrect={false}
              />
              <TouchableOpacity
                onPress={fetchLoraAndAdd}
                disabled={fetchingLora || !loraInput.trim()}
                style={[
                  styles.fetchBtn,
                  { backgroundColor: colors.primary, opacity: fetchingLora || !loraInput.trim() ? 0.5 : 1 },
                ]}
              >
                {fetchingLora ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.fetchBtnText}>Add</Text>
                )}
              </TouchableOpacity>
            </View>

            {loraEntries.map((entry) => (
              <LoraRow
                key={entry.id}
                entry={entry}
                onRemove={() => removeLoraEntry(entry.id)}
                onWeightChange={(w) => updateLoraWeight(entry.id, w)}
                onInsertTrigger={(words) => {
                  setPrompt((prev) => prev ? prev + ", " + words : words);
                  showToast("Trigger words added to prompt", "success");
                }}
                colors={colors}
              />
            ))}
          </View>
        )}

        {/* Prompt */}
        <View style={styles.promptSection}>
          <Text style={[styles.fieldLabel, { color: colors.muted }]}>PROMPT</Text>
          <TextInput
            style={[
              styles.promptInput,
              { color: colors.foreground, backgroundColor: colors.surface, borderColor: colors.border },
            ]}
            value={prompt}
            onChangeText={setPrompt}
            placeholder="Describe your image..."
            placeholderTextColor={colors.muted}
            multiline
            numberOfLines={4}
            textAlignVertical="top"
          />
        </View>

        {/* Negative Prompt */}
        {selectedModel.supportsNegativePrompt && (
          <View style={styles.promptSection}>
            <View style={styles.negativeHeader}>
              <TouchableOpacity
                onPress={() => setShowNegative(!showNegative)}
                style={styles.negativeToggle}
              >
                <Text style={[styles.fieldLabel, { color: colors.muted }]}>
                  NEGATIVE PROMPT {showNegative ? "▲" : "▼"}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setShowNegPresets(!showNegPresets)}
                style={[styles.presetToggleBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
              >
                <Text style={[styles.presetToggleBtnText, { color: colors.primary }]}>Presets</Text>
              </TouchableOpacity>
            </View>
            {showNegPresets && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
                {NEGATIVE_PRESETS.map((preset) => (
                  <TouchableOpacity
                    key={preset.label}
                    onPress={() => {
                      setNegativePrompt(preset.value);
                      setShowNegative(true);
                      setShowNegPresets(false);
                      showToast(`Applied: ${preset.label}`, "success");
                    }}
                    style={[styles.negPresetChip, { backgroundColor: colors.surface, borderColor: colors.border }]}
                  >
                    <Text style={[styles.negPresetText, { color: colors.foreground }]}>{preset.label}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}
            {showNegative && (
              <TextInput
                style={[
                  styles.promptInput,
                  { color: colors.foreground, backgroundColor: colors.surface, borderColor: colors.border, minHeight: 60 },
                ]}
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

        {/* CFG */}
        {selectedModel.supportsCfg && (
          <Slider
            label="GUIDANCE / CFG"
            value={cfg}
            min={selectedModel.cfgRange?.[0] ?? 1}
            max={selectedModel.cfgRange?.[1] ?? 20}
            step={0.5}
            onDecrease={() => setCfg((v) => Math.max(selectedModel.cfgRange?.[0] ?? 1, Math.round((v - 0.5) * 10) / 10))}
            onIncrease={() => setCfg((v) => Math.min(selectedModel.cfgRange?.[1] ?? 20, Math.round((v + 0.5) * 10) / 10))}
            colors={colors}
            format={(v) => v.toFixed(1)}
          />
        )}

        {/* Steps */}
        {selectedModel.supportsSteps && (
          <Slider
            label="STEPS"
            value={steps}
            min={selectedModel.stepsRange?.[0] ?? 1}
            max={selectedModel.stepsRange?.[1] ?? 50}
            onDecrease={() => setSteps((v) => Math.max(selectedModel.stepsRange?.[0] ?? 1, v - 1))}
            onIncrease={() => setSteps((v) => Math.min(selectedModel.stepsRange?.[1] ?? 50, v + 1))}
            colors={colors}
          />
        )}

        {/* ===== Advanced Options Toggle ===== */}
        <TouchableOpacity
          onPress={() => setShowAdvanced(!showAdvanced)}
          style={[styles.advancedToggle, { borderColor: colors.border }]}
        >
          <Text style={[styles.advancedToggleText, { color: colors.primary }]}>
            Advanced Options {showAdvanced ? "▲" : "▼"}
          </Text>
        </TouchableOpacity>

        {showAdvanced && (
          <View style={[styles.advancedSection, { backgroundColor: colors.surface, borderColor: colors.border }]}>

            {/* Seed */}
            <View style={styles.paramSection}>
              <View style={styles.seedHeader}>
                <Text style={[styles.fieldLabel, { color: colors.muted }]}>SEED</Text>
                <View style={styles.seedToggleRow}>
                  <Text style={[styles.seedToggleLabel, { color: colors.muted }]}>Random</Text>
                  <Switch
                    value={useRandomSeed}
                    onValueChange={setUseRandomSeed}
                    trackColor={{ false: colors.border, true: colors.primary + "88" }}
                    thumbColor={useRandomSeed ? colors.primary : colors.muted}
                  />
                </View>
              </View>
              {!useRandomSeed && (
                <TextInput
                  style={[
                    styles.seedInput,
                    { color: colors.foreground, backgroundColor: colors.background, borderColor: colors.border },
                  ]}
                  value={seed}
                  onChangeText={setSeed}
                  placeholder="Enter seed number..."
                  placeholderTextColor={colors.muted}
                  keyboardType="numeric"
                  returnKeyType="done"
                />
              )}
            </View>

            {/* Sampling Method (RunPod only) */}
            {provider === "runpod" && (
              <View style={styles.paramSection}>
                <Text style={[styles.fieldLabel, { color: colors.muted }]}>SAMPLING METHOD</Text>
                <TouchableOpacity
                  onPress={() => setShowSamplerPicker(!showSamplerPicker)}
                  style={[styles.dropdownSelector, { backgroundColor: colors.background, borderColor: colors.border }]}
                >
                  <Text style={[styles.dropdownValue, { color: colors.foreground }]}>
                    {selectedSampler?.label || "Euler a"}
                  </Text>
                  <Text style={{ color: colors.muted }}>▼</Text>
                </TouchableOpacity>
                {showSamplerPicker && (
                  <View style={[styles.dropdownList, { backgroundColor: colors.background, borderColor: colors.border }]}>
                    {SAMPLING_METHODS.map((s) => (
                      <TouchableOpacity
                        key={s.id}
                        onPress={() => {
                          setSamplingMethod(s.id as SamplingMethodId);
                          setShowSamplerPicker(false);
                        }}
                        style={[
                          styles.dropdownItem,
                          samplingMethod === s.id && { backgroundColor: colors.primary + "22" },
                        ]}
                      >
                        <Text style={[styles.dropdownItemText, { color: colors.foreground }]}>{s.label}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </View>
            )}

            {/* CLIP Skip (RunPod only) */}
            {provider === "runpod" && (
              <Slider
                label="CLIP SKIP"
                value={clipSkip}
                min={1}
                max={4}
                onDecrease={() => setClipSkip((v) => Math.max(1, v - 1))}
                onIncrease={() => setClipSkip((v) => Math.min(4, v + 1))}
                colors={colors}
              />
            )}

            {/* Quality Boost (RunPod only) */}
            {provider === "runpod" && (
              <View style={[styles.paramSection, styles.toggleRow]}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.fieldLabel, { color: colors.muted }]}>QUALITY BOOST</Text>
                  <Text style={[styles.toggleDesc, { color: colors.muted }]}>
                    Adds detail injection pass (slower)
                  </Text>
                </View>
                <Switch
                  value={qualityBoost}
                  onValueChange={setQualityBoost}
                  trackColor={{ false: colors.border, true: colors.primary + "88" }}
                  thumbColor={qualityBoost ? colors.primary : colors.muted}
                />
              </View>
            )}
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
              RESULTS — tap to expand
            </Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {resultImages.map((uri, idx) => (
                <TouchableOpacity
                  key={idx}
                  onPress={() => setViewerUri(uri)}
                  style={[styles.resultImageContainer, { borderColor: colors.border }]}
                >
                  <Image
                    source={{ uri }}
                    style={{ width: screenWidth - 64, height: screenWidth - 64, borderRadius: 12 }}
                    contentFit="contain"
                    transition={300}
                  />
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Fullscreen Image Viewer */}
      <Modal visible={!!viewerUri} animationType="fade" transparent statusBarTranslucent>
        <View style={styles.viewerOverlay}>
          <TouchableOpacity
            onPress={() => setViewerUri(null)}
            style={styles.viewerClose}
          >
            <Text style={styles.viewerCloseText}>✕</Text>
          </TouchableOpacity>
          {viewerUri && (
            <Image
              source={{ uri: viewerUri }}
              style={styles.viewerImage}
              contentFit="contain"
              transition={200}
            />
          )}
        </View>
      </Modal>
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
  // RunPod section
  runpodSection: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    marginTop: 10,
    marginBottom: 4,
  },
  runpodSectionTitle: {
    fontSize: 15,
    fontWeight: "600",
    marginBottom: 12,
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 10,
    borderWidth: 1,
    overflow: "hidden",
    marginBottom: 8,
  },
  inputField: {
    flex: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  },
  fetchBtn: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    minWidth: 52,
    alignItems: "center",
    justifyContent: "center",
  },
  fetchBtnText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "600",
  },
  previewCard: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 8,
    overflow: "hidden",
    padding: 8,
  },
  previewThumb: {
    width: 56,
    height: 56,
    borderRadius: 6,
  },
  previewName: {
    fontSize: 13,
    fontWeight: "600",
    lineHeight: 18,
  },
  previewBase: {
    fontSize: 11,
    marginTop: 2,
  },
  loraRow: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 10,
    borderWidth: 1,
    marginTop: 8,
    overflow: "hidden",
    padding: 8,
  },
  loraThumbnail: {
    width: 48,
    height: 48,
    borderRadius: 6,
  },
  loraName: {
    fontSize: 12,
    fontWeight: "600",
    lineHeight: 16,
  },
  loraBase: {
    fontSize: 10,
    marginTop: 2,
  },
  loraWeightRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 4,
    gap: 6,
  },
  loraWeightBtn: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  loraWeightText: {
    fontSize: 13,
    fontWeight: "600",
    minWidth: 28,
    textAlign: "center",
  },
  loraRemove: {
    padding: 8,
  },
  loraTriggerBtn: {
    borderRadius: 6,
    borderWidth: 1,
    paddingHorizontal: 6,
    paddingVertical: 3,
    marginTop: 3,
    marginBottom: 2,
    alignSelf: "flex-start",
  },
  loraTriggerText: {
    fontSize: 10,
    fontWeight: "600",
  },
  // Prompts
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
  negativeHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  negativeToggle: {
    paddingVertical: 4,
    flex: 1,
  },
  presetToggleBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
  },
  presetToggleBtnText: {
    fontSize: 12,
    fontWeight: "600",
  },
  negPresetChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 16,
    borderWidth: 1,
    marginRight: 8,
  },
  negPresetText: {
    fontSize: 13,
    fontWeight: "500",
  },
  // Params
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
  // Advanced
  advancedToggle: {
    marginTop: 18,
    paddingVertical: 10,
    borderTopWidth: 1,
    alignItems: "center",
  },
  advancedToggleText: {
    fontSize: 14,
    fontWeight: "600",
  },
  advancedSection: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    marginTop: 4,
  },
  seedHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  seedToggleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  seedToggleLabel: {
    fontSize: 13,
  },
  seedInput: {
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
  },
  dropdownSelector: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  dropdownValue: {
    fontSize: 15,
    fontWeight: "500",
  },
  dropdownList: {
    borderRadius: 10,
    borderWidth: 1,
    marginTop: 4,
    overflow: "hidden",
  },
  dropdownItem: {
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  dropdownItemText: {
    fontSize: 14,
  },
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  toggleDesc: {
    fontSize: 11,
    marginTop: 2,
  },
  // Generate
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
  // Fullscreen viewer
  viewerOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.95)",
    alignItems: "center",
    justifyContent: "center",
  },
  viewerClose: {
    position: "absolute",
    top: 56,
    right: 20,
    zIndex: 10,
    backgroundColor: "rgba(255,255,255,0.15)",
    borderRadius: 20,
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  viewerCloseText: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "600",
  },
  viewerImage: {
    width: "100%",
    height: "100%",
  },
});
