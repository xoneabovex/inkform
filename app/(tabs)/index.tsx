import React, { useReducer, useEffect, useState, useCallback } from "react";
import {
  Text,
  View,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  StyleSheet,
  FlatList,
  Switch,
  Platform,
  Dimensions,
  Keyboard,
  Share,
} from "react-native";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import * as Clipboard from "expo-clipboard";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { useToast } from "@/lib/toast-context";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { FullscreenViewer } from "@/components/features/fullscreen-viewer";
import {
  MODEL_CATALOG,
  ALL_MODELS,
  getModelById,
  ASPECT_RATIOS,
  SAMPLING_METHODS,
  VAE_OPTIONS,
  type ModelInfo,
  type LoraEntry,
  type AspectRatio,
  type SamplingMethodId,
  type VaeId,
  type GenerationRequest,
  type CivitaiModelPreview,
} from "@/lib/types";
import { generateImages } from "@/lib/api/generate";
import { parseCivitaiId, fetchCivitaiModelVersion } from "@/lib/api/civitai";
import {
  savePromptToHistory,
  saveImageToGallery,
  saveToDeviceGallery,
  getReuseSettings,
  clearReuseSettings,
} from "@/lib/storage/app-storage";
import { getApiKey } from "@/lib/storage/secure-store";

const { width: SCREEN_W } = Dimensions.get("window");

// ===== Negative Prompt Presets =====
const NEG_PRESETS = [
  { label: "SDXL Quality", text: "worst quality, low quality, lowres, blurry, bad anatomy, bad hands, cropped, jpeg artifacts, watermark, text, signature, deformed" },
  { label: "Anime Clean", text: "worst quality, low quality, lowres, bad anatomy, bad hands, extra fingers, fewer fingers, missing fingers, extra limbs, mutated, deformed, ugly, blurry, text, watermark" },
  { label: "Photorealistic", text: "cartoon, anime, illustration, painting, drawing, 3d render, cgi, lowres, blurry, bad anatomy, bad hands, watermark, text, signature, deformed" },
  { label: "Pony/Illustrious", text: "score_4, score_3, score_2, score_1, worst quality, low quality, lowres, bad anatomy, bad hands, extra digits, fewer digits, text, watermark, signature" },
  { label: "No Watermarks", text: "watermark, text, signature, logo, banner, username, copyright, artist name, url, website" },
  { label: "Face Fix", text: "deformed face, ugly face, asymmetrical eyes, cross-eyed, bad eyes, deformed iris, bad teeth, extra teeth, missing teeth" },
];

// ===== Reducer State =====
interface GenState {
  model: ModelInfo;
  prompt: string;
  negativePrompt: string;
  aspectRatio: AspectRatio;
  batchSize: number;
  seed: number;
  randomSeed: boolean;
  steps: number;
  cfg: number;
  samplingMethod: SamplingMethodId;
  clipSkip: number;
  vae: VaeId;
  matureContent: boolean;
  referenceImage: string | null;
  denoisingStrength: number;
  hiResFix: boolean;
  hiResUpscale: number;
  hiResSteps: number;
  hiResDenoising: number;
  civitaiModelInput: string;
  civitaiOverride: string;
}

const initialState: GenState = {
  model: ALL_MODELS[0],
  prompt: "",
  negativePrompt: "",
  aspectRatio: ASPECT_RATIOS[0],
  batchSize: 1,
  seed: -1,
  randomSeed: true,
  steps: 30,
  cfg: 7,
  samplingMethod: "euler_a",
  clipSkip: 2,
  vae: "auto",
  matureContent: false,
  referenceImage: null,
  denoisingStrength: 0.7,
  hiResFix: false,
  hiResUpscale: 1.5,
  hiResSteps: 15,
  hiResDenoising: 0.5,
  civitaiModelInput: "",
  civitaiOverride: "",
};

type GenAction =
  | { type: "SET_FIELD"; field: keyof GenState; value: any }
  | { type: "LOAD_PRESET"; payload: Partial<GenState> }
  | { type: "SET_MODEL"; model: ModelInfo };

function genReducer(state: GenState, action: GenAction): GenState {
  switch (action.type) {
    case "SET_FIELD":
      return { ...state, [action.field]: action.value };
    case "LOAD_PRESET":
      return { ...state, ...action.payload };
    case "SET_MODEL": {
      const m = action.model;
      const updates: Partial<GenState> = { model: m };
      if (m.defaultCfg) updates.cfg = m.defaultCfg;
      if (m.defaultSteps) updates.steps = m.defaultSteps;
      if (m.defaultClipSkip) updates.clipSkip = m.defaultClipSkip;
      if (m.defaultCivitaiModelId) {
        updates.civitaiOverride = m.defaultCivitaiModelId;
        if (m.useLegacyCivitaiLoader) {
          updates.civitaiModelInput = m.defaultCivitaiModelId;
        }
      }
      if (!m.supportsImg2Img) updates.referenceImage = null;
      const maxBatch = m.extraParams?.maxBatch;
      if (maxBatch && state.batchSize > maxBatch) updates.batchSize = maxBatch;
      return { ...state, ...updates };
    }
    default:
      return state;
  }
}

// ===== Main Screen =====
export default function StudioScreen() {
  const colors = useColors();
  const { showToast } = useToast();

  const [state, dispatch] = useReducer(genReducer, initialState);
  const updateField = (field: keyof GenState, value: any) =>
    dispatch({ type: "SET_FIELD", field, value });

  // Model picker
  const [expandedEcosystem, setExpandedEcosystem] = useState<string | null>(null);
  const [showModelPicker, setShowModelPicker] = useState(false);

  // Advanced BottomSheet
  const [showAdvancedSheet, setShowAdvancedSheet] = useState(false);

  // Dropdown pickers inside BottomSheet
  const [showSamplerPicker, setShowSamplerPicker] = useState(false);
  const [showVaePicker, setShowVaePicker] = useState(false);
  const [showNegPresets, setShowNegPresets] = useState(false);

  // Civitai
  const [civitaiModelPreview, setCivitaiModelPreview] = useState<CivitaiModelPreview | null>(null);
  const [civitaiLoading, setCivitaiLoading] = useState(false);

  // LoRA stack
  const [loraEntries, setLoraEntries] = useState<LoraEntry[]>([]);
  const [loraInput, setLoraInput] = useState("");
  const [loraLoading, setLoraLoading] = useState(false);

  // Generation state
  const [generating, setGenerating] = useState(false);
  const [genStatus, setGenStatus] = useState("");
  const [generatedImages, setGeneratedImages] = useState<string[]>([]);
  const [batchProgress, setBatchProgress] = useState({ done: 0, total: 0 });

  // Fullscreen viewer
  const [fullscreenUri, setFullscreenUri] = useState<string | null>(null);

  // Load reuse settings on mount
  useEffect(() => {
    (async () => {
      try {
        const settings = await getReuseSettings();
        if (!settings) return;
        await clearReuseSettings();
        const payload: Partial<GenState> = {};
        if (settings.prompt) payload.prompt = settings.prompt;
        if (settings.negativePrompt) payload.negativePrompt = settings.negativePrompt;
        if (settings.modelId) {
          const m = getModelById(settings.modelId);
          if (m) payload.model = m;
        }
        if (settings.aspectRatio) {
          const ar = ASPECT_RATIOS.find((a) => a.value === settings.aspectRatio);
          if (ar) payload.aspectRatio = ar;
        }
        if (settings.seed !== undefined) {
          payload.seed = settings.seed;
          payload.randomSeed = settings.seed === -1;
        }
        if (settings.cfg !== undefined) payload.cfg = settings.cfg;
        if (settings.steps !== undefined) payload.steps = settings.steps;
        if (settings.samplingMethod) payload.samplingMethod = settings.samplingMethod as SamplingMethodId;
        dispatch({ type: "LOAD_PRESET", payload });
        showToast("Settings loaded from gallery", "success");
      } catch {}
    })();
  }, []);

  // When model changes via SET_MODEL, reset LoRAs if not supported
  useEffect(() => {
    if (!state.model.supportsLoRAs) setLoraEntries([]);
  }, [state.model]);

  // ===== Civitai Fetch (Legacy) =====
  const handleFetchCivitaiModel = async () => {
    const parsed = parseCivitaiId(state.civitaiModelInput);
    if (!parsed) {
      showToast("Invalid Civitai model ID or URL", "error");
      return;
    }
    setCivitaiLoading(true);
    try {
      const token = await getApiKey("civitaiApiToken");
      const preview = await fetchCivitaiModelVersion(parsed, token || undefined);
      if (preview) {
        setCivitaiModelPreview(preview);
        updateField("civitaiModelInput", String(preview.id));
      } else {
        showToast("Model not found on Civitai", "error");
      }
    } catch {
      showToast("Failed to fetch model info", "error");
    } finally {
      setCivitaiLoading(false);
    }
  };

  // ===== LoRA Fetch =====
  const handleAddLora = async () => {
    const parsed = parseCivitaiId(loraInput);
    if (!parsed) {
      showToast("Invalid LoRA ID or URL", "error");
      return;
    }
    if (loraEntries.some((l) => l.id === parsed)) {
      showToast("LoRA already added", "error");
      return;
    }
    setLoraLoading(true);
    try {
      const token = await getApiKey("civitaiApiToken");
      const preview = await fetchCivitaiModelVersion(parsed, token || undefined);
      const entry: LoraEntry = {
        id: parsed,
        weight: 0.8,
        preview: preview || null,
        triggerWords: (preview as any)?.triggerWords || [],
      };
      setLoraEntries((prev) => [...prev, entry]);
      setLoraInput("");
    } catch {
      showToast("Failed to fetch LoRA info", "error");
    } finally {
      setLoraLoading(false);
    }
  };

  const handleRemoveLora = (id: string) => {
    setLoraEntries((prev) => prev.filter((l) => l.id !== id));
  };

  const handleLoraWeightChange = (id: string, weight: number) => {
    setLoraEntries((prev) =>
      prev.map((l) => (l.id === id ? { ...l, weight } : l))
    );
  };

  // ===== Reference Image =====
  const handlePickReferenceImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.9,
    });
    if (!result.canceled && result.assets[0]) {
      updateField("referenceImage", result.assets[0].uri);
    }
  };

  // ===== Generate =====
  const handleGenerate = async () => {
    if (!state.prompt.trim()) {
      showToast("Enter a prompt first", "error");
      return;
    }
    Keyboard.dismiss();
    setGenerating(true);
    setGenStatus("Preparing...");
    setGeneratedImages([]);
    setBatchProgress({ done: 0, total: 0 });

    try {
      const effectiveSeed = state.randomSeed ? -1 : state.seed;
      const maxBatch = state.model.extraParams?.maxBatch;
      const effectiveBatch = maxBatch ? Math.min(state.batchSize, maxBatch) : state.batchSize;

      // Determine civitai model ID
      let civitaiId: string | undefined;
      if (state.model.useLegacyCivitaiLoader) {
        civitaiId = parseCivitaiId(state.civitaiModelInput) || state.model.defaultCivitaiModelId;
      } else if (state.model.provider === "runpod") {
        civitaiId = parseCivitaiId(state.civitaiOverride) || state.model.defaultCivitaiModelId;
      }

      const req: GenerationRequest = {
        provider: state.model.provider,
        model: state.model,
        prompt: state.prompt.trim(),
        negativePrompt: state.model.supportsNegativePrompt ? state.negativePrompt.trim() || undefined : undefined,
        aspectRatio: state.aspectRatio,
        batchSize: effectiveBatch,
        cfg: state.model.supportsCfg ? state.cfg : undefined,
        steps: state.model.supportsSteps ? state.steps : undefined,
        seed: effectiveSeed !== -1 ? effectiveSeed : undefined,
        samplingMethod: state.model.supportsSteps ? state.samplingMethod : undefined,
        clipSkip: state.model.supportsClipSkip ? state.clipSkip : undefined,
        vae: state.model.supportsVae ? state.vae : undefined,
        hiResFix: state.model.supportsHiResFix ? state.hiResFix : undefined,
        hiResUpscaleFactor: state.hiResFix ? state.hiResUpscale : undefined,
        hiResSteps: state.hiResFix ? state.hiResSteps : undefined,
        hiResDenoising: state.hiResFix ? state.hiResDenoising : undefined,
        matureContent: state.matureContent,
        loraEntries: state.model.supportsLoRAs && loraEntries.length > 0 ? loraEntries : undefined,
        civitaiModelId: civitaiId,
        referenceImageUri: state.model.supportsImg2Img && state.referenceImage ? state.referenceImage : undefined,
        denoisingStrength: state.referenceImage ? state.denoisingStrength : undefined,
      };

      const images = await generateImages(req, setGenStatus);

      // Save to history and gallery (downloads to local storage)
      await savePromptToHistory({
        prompt: state.prompt.trim(),
        negativePrompt: state.negativePrompt.trim() || undefined,
        provider: state.model.provider,
        model: state.model.name,
      });

      const localUris: string[] = [];
      setBatchProgress({ done: 0, total: images.length });
      setGenStatus("Saving...");
      for (let i = 0; i < images.length; i++) {
        const saved = await saveImageToGallery({
          uri: images[i],
          prompt: state.prompt.trim(),
          negativePrompt: state.negativePrompt.trim() || undefined,
          provider: state.model.provider,
          model: state.model.id,
          aspectRatio: state.aspectRatio.value,
          seed: effectiveSeed,
          samplingMethod: state.model.supportsSteps ? state.samplingMethod : undefined,
          cfg: state.model.supportsCfg ? state.cfg : undefined,
          steps: state.model.supportsSteps ? state.steps : undefined,
        });
        localUris.push(saved.uri);
        setBatchProgress({ done: i + 1, total: images.length });
      }

      setGeneratedImages(localUris);
      showToast(`Generated ${images.length} image${images.length > 1 ? "s" : ""}`, "success");
    } catch (err: any) {
      const msg = err?.message || "Generation failed";
      showToast(msg.length > 120 ? msg.slice(0, 120) + "..." : msg, "error");
    } finally {
      setGenerating(false);
      setGenStatus("");
      setBatchProgress({ done: 0, total: 0 });
    }
  };

  // ===== Save to camera roll =====
  const handleNativeSave = async (uri: string) => {
    try {
      await saveToDeviceGallery(uri);
      showToast("Saved to camera roll ✓", "success");
    } catch (e: any) {
      showToast("Failed to save: " + (e.message || "unknown"), "error");
    }
  };

  const handleSaveAll = async () => {
    if (Platform.OS === "web") {
      showToast("Save not supported on web", "warning");
      return;
    }
    try {
      let saved = 0;
      for (const uri of generatedImages) {
        await saveToDeviceGallery(uri);
        saved++;
      }
      showToast(`Saved ${saved} image${saved > 1 ? "s" : ""} to camera roll ✓`, "success");
    } catch (e: any) {
      showToast("Failed to save: " + (e.message || "unknown"), "error");
    }
  };

  // ===== Helpers =====
  const isLegacyCivitai = !!state.model.useLegacyCivitaiLoader;
  const isRunPod = state.model.provider === "runpod";
  const showCivitaiEnhancements = isRunPod && !isLegacyCivitai && state.model.architecture !== "api";

  // ===== Render =====
  return (
    <ScreenContainer>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={[styles.screenTitle, { color: colors.foreground }]}>Studio</Text>

        {/* ===== Model Picker ===== */}
        <Text style={[styles.label, { color: colors.muted }]}>MODEL</Text>
        <TouchableOpacity
          onPress={() => setShowModelPicker(!showModelPicker)}
          style={[styles.pickerBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
        >
          <View style={{ flex: 1 }}>
            <Text style={[styles.pickerLabel, { color: colors.muted }]}>{state.model.ecosystem}</Text>
            <Text style={[styles.pickerValue, { color: colors.foreground }]}>{state.model.name}</Text>
          </View>
          <Text style={{ color: colors.muted, fontSize: 18 }}>{showModelPicker ? "▲" : "▼"}</Text>
        </TouchableOpacity>

        {showModelPicker && (
          <View style={[styles.accordionContainer, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <ScrollView
              nestedScrollEnabled
              showsVerticalScrollIndicator
              keyboardShouldPersistTaps="handled"
              style={{ maxHeight: 380 }}
            >
              {MODEL_CATALOG.map((group) => (
                <View key={group.name}>
                  <TouchableOpacity
                    onPress={() => setExpandedEcosystem(expandedEcosystem === group.name ? null : group.name)}
                    style={[styles.accordionHeader, { borderBottomColor: colors.border }]}
                  >
                    <Text style={[styles.accordionTitle, { color: colors.foreground }]}>{group.name}</Text>
                    <Text style={{ color: colors.muted }}>{expandedEcosystem === group.name ? "−" : "+"}</Text>
                  </TouchableOpacity>
                  {expandedEcosystem === group.name &&
                    group.models.map((model) => (
                      <TouchableOpacity
                        key={model.id}
                        onPress={() => {
                          dispatch({ type: "SET_MODEL", model });
                          setShowModelPicker(false);
                          setExpandedEcosystem(null);
                        }}
                        style={[
                          styles.accordionItem,
                          { borderBottomColor: colors.border },
                          model.id === state.model.id && { backgroundColor: colors.primary + "20" },
                        ]}
                      >
                        <Text
                          style={[
                            styles.accordionItemText,
                            { color: model.id === state.model.id ? colors.primary : colors.foreground },
                          ]}
                        >
                          {model.name}
                        </Text>
                        <Text style={[styles.accordionItemBadge, { color: colors.muted }]}>
                          {model.provider === "replicate" ? "API" : model.provider === "google" ? "API" : "RunPod"}
                        </Text>
                      </TouchableOpacity>
                    ))}
                </View>
              ))}
            </ScrollView>
          </View>
        )}

        {/* ===== Prompt ===== */}
        <Text style={[styles.label, { color: colors.muted }]}>PROMPT</Text>
        <TextInput
          style={[styles.promptInput, { color: colors.foreground, backgroundColor: colors.surface, borderColor: colors.border }]}
          value={state.prompt}
          onChangeText={(t) => updateField("prompt", t)}
          placeholder="Describe your image..."
          placeholderTextColor={colors.muted}
          multiline
          numberOfLines={4}
          textAlignVertical="top"
        />

        {/* ===== Reference Image (img2img) ===== */}
        {state.model.supportsImg2Img && (
          <View style={styles.section}>
            <Text style={[styles.label, { color: colors.muted }]}>REFERENCE IMAGE</Text>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <TouchableOpacity
                onPress={handlePickReferenceImage}
                style={[styles.refImageBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
              >
                {state.referenceImage ? (
                  <Image source={{ uri: state.referenceImage }} style={styles.refImageThumb} contentFit="cover" />
                ) : (
                  <Text style={{ color: colors.muted, fontSize: 13 }}>Tap to select</Text>
                )}
              </TouchableOpacity>
              {state.referenceImage && (
                <TouchableOpacity onPress={() => updateField("referenceImage", null)}>
                  <Text style={{ color: colors.error, fontSize: 13, fontWeight: "600" }}>Remove</Text>
                </TouchableOpacity>
              )}
            </View>
            {state.referenceImage && (
              <>
                <View style={styles.sliderRow}>
                  <Text style={[styles.advLabel, { color: colors.muted }]}>Denoising Strength</Text>
                  <Text style={[styles.sliderValue, { color: colors.foreground }]}>{state.denoisingStrength.toFixed(2)}</Text>
                </View>
                <TextInput
                  style={[styles.numInput, { color: colors.foreground, backgroundColor: colors.surface, borderColor: colors.border }]}
                  value={String(state.denoisingStrength)}
                  onChangeText={(t) => {
                    const v = parseFloat(t);
                    if (!isNaN(v) && v >= 0 && v <= 1) updateField("denoisingStrength", v);
                  }}
                  keyboardType="decimal-pad"
                  returnKeyType="done"
                />
              </>
            )}
          </View>
        )}

        {/* ===== Aspect Ratio ===== */}
        <Text style={[styles.label, { color: colors.muted }]}>ASPECT RATIO</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipRow}>
          {ASPECT_RATIOS.map((ar) => (
            <TouchableOpacity
              key={ar.value}
              onPress={() => updateField("aspectRatio", ar)}
              style={[
                styles.chip,
                { borderColor: colors.border },
                ar.value === state.aspectRatio.value && { backgroundColor: colors.primary, borderColor: colors.primary },
              ]}
            >
              <Text style={{ color: ar.value === state.aspectRatio.value ? "#fff" : colors.foreground, fontWeight: "600" }}>
                {ar.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* ===== Batch Size ===== */}
        <Text style={[styles.label, { color: colors.muted }]}>BATCH SIZE</Text>
        <View style={styles.chipRow}>
          {[1, 2, 3, 4].map((n) => {
            const maxBatch = state.model.extraParams?.maxBatch;
            const disabled = maxBatch ? n > maxBatch : false;
            return (
              <TouchableOpacity
                key={n}
                onPress={() => !disabled && updateField("batchSize", n)}
                disabled={disabled}
                style={[
                  styles.chip,
                  { borderColor: colors.border },
                  n === state.batchSize && { backgroundColor: colors.primary, borderColor: colors.primary },
                  disabled && { opacity: 0.3 },
                ]}
              >
                <Text style={{ color: n === state.batchSize ? "#fff" : colors.foreground, fontWeight: "600" }}>{n}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* ===== Legacy Civitai Loader ===== */}
        {isLegacyCivitai && (
          <View style={[styles.sectionCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.sectionCardTitle, { color: colors.foreground }]}>Civitai Model</Text>
            <Text style={[styles.sectionCardDesc, { color: colors.muted }]}>
              Enter a Civitai model version ID or URL to use a custom checkpoint.
            </Text>
            <View style={styles.fetchRow}>
              <TextInput
                style={[styles.fetchInput, { color: colors.foreground, backgroundColor: colors.background, borderColor: colors.border }]}
                value={state.civitaiModelInput}
                onChangeText={(t) => updateField("civitaiModelInput", t)}
                placeholder="Model ID or URL"
                placeholderTextColor={colors.muted}
                autoCapitalize="none"
                returnKeyType="done"
              />
              <TouchableOpacity
                onPress={handleFetchCivitaiModel}
                disabled={civitaiLoading}
                style={[styles.fetchBtn, { backgroundColor: colors.primary }]}
              >
                {civitaiLoading ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.fetchBtnText}>Fetch</Text>
                )}
              </TouchableOpacity>
            </View>
            {civitaiModelPreview && (
              <View style={[styles.previewCard, { backgroundColor: colors.background, borderColor: colors.border }]}>
                {civitaiModelPreview.thumbnailUrl && (
                  <Image source={{ uri: civitaiModelPreview.thumbnailUrl }} style={styles.previewThumb} contentFit="cover" />
                )}
                <View style={{ flex: 1 }}>
                  <Text style={[styles.previewName, { color: colors.foreground }]} numberOfLines={2}>
                    {civitaiModelPreview.name}
                  </Text>
                  {civitaiModelPreview.baseModel && (
                    <Text style={[styles.previewBase, { color: colors.muted }]}>{civitaiModelPreview.baseModel}</Text>
                  )}
                </View>
              </View>
            )}

            {/* Legacy LoRA Stack */}
            <Text style={[styles.sectionCardSubtitle, { color: colors.foreground, marginTop: 14 }]}>LoRA Stack</Text>
            {loraEntries.map((lora) => (
              <LoraRow
                key={lora.id}
                lora={lora}
                colors={colors}
                onWeightChange={(w) => handleLoraWeightChange(lora.id, w)}
                onRemove={() => handleRemoveLora(lora.id)}
                onInsertTrigger={(words) => updateField("prompt", state.prompt + " " + words.join(", "))}
              />
            ))}
            <View style={styles.fetchRow}>
              <TextInput
                style={[styles.fetchInput, { color: colors.foreground, backgroundColor: colors.background, borderColor: colors.border }]}
                value={loraInput}
                onChangeText={setLoraInput}
                placeholder="LoRA ID or URL"
                placeholderTextColor={colors.muted}
                autoCapitalize="none"
                returnKeyType="done"
              />
              <TouchableOpacity
                onPress={handleAddLora}
                disabled={loraLoading}
                style={[styles.fetchBtn, { backgroundColor: colors.primary }]}
              >
                {loraLoading ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.fetchBtnText}>Add</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* ===== Auto Civitai Routing ===== */}
        {showCivitaiEnhancements && (
          <View style={[styles.sectionCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.sectionCardTitle, { color: colors.foreground }]}>Civitai Enhancements</Text>
            <Text style={[styles.sectionCardDesc, { color: colors.muted }]}>
              Base model auto-populated. Edit to override with a different Civitai model.
            </Text>
            <TextInput
              style={[styles.singleInput, { color: colors.foreground, backgroundColor: colors.background, borderColor: colors.border }]}
              value={state.civitaiOverride}
              onChangeText={(t) => updateField("civitaiOverride", t)}
              placeholder="Civitai Model Version ID"
              placeholderTextColor={colors.muted}
              autoCapitalize="none"
              returnKeyType="done"
            />

            {/* Dynamic LoRA Stack */}
            {state.model.supportsLoRAs && (
              <>
                <Text style={[styles.sectionCardSubtitle, { color: colors.foreground, marginTop: 14 }]}>LoRA Stack</Text>
                {loraEntries.map((lora) => (
                  <LoraRow
                    key={lora.id}
                    lora={lora}
                    colors={colors}
                    onWeightChange={(w) => handleLoraWeightChange(lora.id, w)}
                    onRemove={() => handleRemoveLora(lora.id)}
                    onInsertTrigger={(words) => updateField("prompt", state.prompt + " " + words.join(", "))}
                  />
                ))}
                <View style={styles.fetchRow}>
                  <TextInput
                    style={[styles.fetchInput, { color: colors.foreground, backgroundColor: colors.background, borderColor: colors.border }]}
                    value={loraInput}
                    onChangeText={setLoraInput}
                    placeholder="LoRA ID or URL"
                    placeholderTextColor={colors.muted}
                    autoCapitalize="none"
                    returnKeyType="done"
                  />
                  <TouchableOpacity
                    onPress={handleAddLora}
                    disabled={loraLoading}
                    style={[styles.fetchBtn, { backgroundColor: colors.primary }]}
                  >
                    {loraLoading ? (
                      <ActivityIndicator color="#fff" size="small" />
                    ) : (
                      <Text style={styles.fetchBtnText}>Add LoRA</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        )}

        {/* ===== Advanced Settings Button ===== */}
        <View style={styles.actionRow}>
          <TouchableOpacity
            onPress={() => setShowAdvancedSheet(true)}
            style={[styles.advancedBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
          >
            <Text style={{ color: colors.foreground, fontWeight: "600" }}>⚙️ Advanced Settings</Text>
          </TouchableOpacity>
        </View>

        {/* ===== Generate Button ===== */}
        <TouchableOpacity
          onPress={handleGenerate}
          disabled={generating}
          style={[styles.generateBtn, { backgroundColor: colors.primary, opacity: generating ? 0.7 : 1 }]}
        >
          {generating ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <ActivityIndicator color="#fff" size="small" />
              <Text style={styles.generateBtnText}>{genStatus || "Generating..."}</Text>
            </View>
          ) : (
            <Text style={styles.generateBtnText}>Generate</Text>
          )}
        </TouchableOpacity>

        {/* ===== Progress Bar ===== */}
        {generating && batchProgress.total > 0 && (
          <View style={styles.progressContainer}>
            <View style={[styles.progressTrack, { backgroundColor: colors.border }]}>
              <View
                style={[
                  styles.progressFill,
                  {
                    backgroundColor: colors.primary,
                    width: `${Math.round((batchProgress.done / batchProgress.total) * 100)}%`,
                  },
                ]}
              />
            </View>
            <Text style={[styles.progressText, { color: colors.muted }]}>
              {batchProgress.done}/{batchProgress.total} saved
            </Text>
          </View>
        )}

        {/* ===== Generated Images ===== */}
        {generatedImages.length > 0 && (
          <View style={styles.resultsSection}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <Text style={[styles.label, { color: colors.muted, marginTop: 0 }]}>RESULTS</Text>
              <TouchableOpacity
                onPress={handleSaveAll}
                style={[styles.saveAllBtn, { backgroundColor: colors.primary }]}
              >
                <Text style={{ color: "#fff", fontSize: 13, fontWeight: "600" }}>💾 Save All</Text>
              </TouchableOpacity>
            </View>
            <FlatList
              data={generatedImages}
              horizontal
              showsHorizontalScrollIndicator={false}
              keyExtractor={(_, i) => String(i)}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[styles.resultCard, { borderColor: colors.border }]}
                  onPress={() => setFullscreenUri(item)}
                >
                  <Image source={{ uri: item }} style={styles.resultImage} contentFit="cover" />
                  <TouchableOpacity
                    onPress={() => handleNativeSave(item)}
                    style={[styles.resultSaveBtn, { backgroundColor: "rgba(0,0,0,0.55)" }]}
                  >
                    <Text style={{ color: "#fff", fontSize: 11, fontWeight: "600" }}>💾</Text>
                  </TouchableOpacity>
                </TouchableOpacity>
              )}
            />
          </View>
        )}

        <View style={{ height: 80 }} />
      </ScrollView>

      {/* ===== Advanced Settings BottomSheet ===== */}
      <BottomSheet
        isVisible={showAdvancedSheet}
        onClose={() => {
          setShowAdvancedSheet(false);
          setShowSamplerPicker(false);
          setShowVaePicker(false);
          setShowNegPresets(false);
        }}
        colors={colors}
        heightRatio={0.8}
      >
        <ScrollView
          style={styles.sheetContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          nestedScrollEnabled
        >
          <Text style={[styles.sheetTitle, { color: colors.foreground }]}>Advanced Settings</Text>

          {/* Negative Prompt */}
          {state.model.supportsNegativePrompt && (
            <>
              <View style={styles.negHeaderRow}>
                <Text style={[styles.advLabel, { color: colors.muted }]}>NEGATIVE PROMPT</Text>
                <TouchableOpacity onPress={() => setShowNegPresets(!showNegPresets)}>
                  <Text style={{ color: colors.primary, fontSize: 12, fontWeight: "600" }}>
                    {showNegPresets ? "Hide Presets" : "Presets"}
                  </Text>
                </TouchableOpacity>
              </View>
              {showNegPresets && (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
                  {NEG_PRESETS.map((p) => (
                    <TouchableOpacity
                      key={p.label}
                      onPress={() => updateField("negativePrompt", p.text)}
                      style={[styles.presetChip, { borderColor: colors.border }]}
                    >
                      <Text style={[styles.presetChipText, { color: colors.foreground }]}>{p.label}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              )}
              <TextInput
                style={[styles.promptInput, { color: colors.foreground, backgroundColor: colors.background, borderColor: colors.border, minHeight: 60 }]}
                value={state.negativePrompt}
                onChangeText={(t) => updateField("negativePrompt", t)}
                placeholder="Things to avoid..."
                placeholderTextColor={colors.muted}
                multiline
                textAlignVertical="top"
              />
            </>
          )}

          {/* Seed */}
          <View style={styles.seedRow}>
            <Text style={[styles.advLabel, { color: colors.muted }]}>SEED</Text>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Text style={{ color: colors.muted, fontSize: 12 }}>Random</Text>
              <Switch
                value={state.randomSeed}
                onValueChange={(v) => updateField("randomSeed", v)}
                trackColor={{ false: colors.border, true: colors.primary }}
                thumbColor="#fff"
              />
            </View>
          </View>
          {!state.randomSeed && (
            <TextInput
              style={[styles.numInput, { color: colors.foreground, backgroundColor: colors.background, borderColor: colors.border }]}
              value={String(state.seed)}
              onChangeText={(t) => {
                const v = parseInt(t);
                if (!isNaN(v)) updateField("seed", v);
                else if (t === "" || t === "-") updateField("seed", -1);
              }}
              keyboardType="number-pad"
              returnKeyType="done"
            />
          )}

          {/* Steps */}
          {state.model.supportsSteps && (
            <>
              <View style={styles.sliderRow}>
                <Text style={[styles.advLabel, { color: colors.muted }]}>STEPS</Text>
                <Text style={[styles.sliderValue, { color: colors.foreground }]}>{state.steps}</Text>
              </View>
              <TextInput
                style={[styles.numInput, { color: colors.foreground, backgroundColor: colors.background, borderColor: colors.border }]}
                value={String(state.steps)}
                onChangeText={(t) => {
                  const v = parseInt(t);
                  if (!isNaN(v) && v >= 1 && v <= (state.model.stepsRange?.[1] || 100)) updateField("steps", v);
                }}
                keyboardType="number-pad"
                returnKeyType="done"
              />
            </>
          )}

          {/* CFG Scale */}
          {state.model.supportsCfg && (
            <>
              <View style={styles.sliderRow}>
                <Text style={[styles.advLabel, { color: colors.muted }]}>CFG SCALE</Text>
                <Text style={[styles.sliderValue, { color: colors.foreground }]}>{state.cfg}</Text>
              </View>
              <TextInput
                style={[styles.numInput, { color: colors.foreground, backgroundColor: colors.background, borderColor: colors.border }]}
                value={String(state.cfg)}
                onChangeText={(t) => {
                  const v = parseFloat(t);
                  if (!isNaN(v) && v >= 1 && v <= (state.model.cfgRange?.[1] || 30)) updateField("cfg", v);
                }}
                keyboardType="decimal-pad"
                returnKeyType="done"
              />
            </>
          )}

          {/* Sampler */}
          {state.model.supportsSteps && (
            <>
              <Text style={[styles.advLabel, { color: colors.muted, marginTop: 12 }]}>SAMPLER</Text>
              <TouchableOpacity
                onPress={() => setShowSamplerPicker(!showSamplerPicker)}
                style={[styles.dropdownBtn, { backgroundColor: colors.background, borderColor: colors.border }]}
              >
                <Text style={{ color: colors.foreground, fontSize: 14 }}>
                  {SAMPLING_METHODS.find((s) => s.id === state.samplingMethod)?.label || state.samplingMethod}
                </Text>
                <Text style={{ color: colors.muted }}>▼</Text>
              </TouchableOpacity>
              {showSamplerPicker && (
                <View style={[styles.dropdownList, { backgroundColor: colors.background, borderColor: colors.border }]}>
                  {SAMPLING_METHODS.map((s) => (
                    <TouchableOpacity
                      key={s.id}
                      onPress={() => {
                        updateField("samplingMethod", s.id);
                        setShowSamplerPicker(false);
                      }}
                      style={[styles.dropdownItem, s.id === state.samplingMethod && { backgroundColor: colors.primary + "20" }]}
                    >
                      <Text style={{ color: s.id === state.samplingMethod ? colors.primary : colors.foreground, fontSize: 14 }}>
                        {s.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </>
          )}

          {/* Clip Skip */}
          {state.model.supportsClipSkip && (
            <>
              <View style={styles.sliderRow}>
                <Text style={[styles.advLabel, { color: colors.muted }]}>CLIP SKIP</Text>
                <Text style={[styles.sliderValue, { color: colors.foreground }]}>{state.clipSkip}</Text>
              </View>
              <TextInput
                style={[styles.numInput, { color: colors.foreground, backgroundColor: colors.background, borderColor: colors.border }]}
                value={String(state.clipSkip)}
                onChangeText={(t) => {
                  const v = parseInt(t);
                  if (!isNaN(v) && v >= 1 && v <= 12) updateField("clipSkip", v);
                }}
                keyboardType="number-pad"
                returnKeyType="done"
              />
            </>
          )}

          {/* VAE */}
          {state.model.supportsVae && (
            <>
              <Text style={[styles.advLabel, { color: colors.muted, marginTop: 12 }]}>VAE</Text>
              <TouchableOpacity
                onPress={() => setShowVaePicker(!showVaePicker)}
                style={[styles.dropdownBtn, { backgroundColor: colors.background, borderColor: colors.border }]}
              >
                <Text style={{ color: colors.foreground, fontSize: 14 }}>
                  {VAE_OPTIONS.find((v) => v.id === state.vae)?.label || state.vae}
                </Text>
                <Text style={{ color: colors.muted }}>▼</Text>
              </TouchableOpacity>
              {showVaePicker && (
                <View style={[styles.dropdownList, { backgroundColor: colors.background, borderColor: colors.border }]}>
                  {VAE_OPTIONS.map((v) => (
                    <TouchableOpacity
                      key={v.id}
                      onPress={() => {
                        updateField("vae", v.id);
                        setShowVaePicker(false);
                      }}
                      style={[styles.dropdownItem, v.id === state.vae && { backgroundColor: colors.primary + "20" }]}
                    >
                      <Text style={{ color: v.id === state.vae ? colors.primary : colors.foreground, fontSize: 14 }}>
                        {v.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </>
          )}

          {/* Hi-Res Fix */}
          {state.model.supportsHiResFix && (
            <>
              <View style={[styles.seedRow, { marginTop: 14 }]}>
                <Text style={[styles.advLabel, { color: colors.muted }]}>HI-RES FIX</Text>
                <Switch
                  value={state.hiResFix}
                  onValueChange={(v) => updateField("hiResFix", v)}
                  trackColor={{ false: colors.border, true: colors.primary }}
                  thumbColor="#fff"
                />
              </View>
              {state.hiResFix && (
                <View style={{ gap: 8, marginTop: 8 }}>
                  <View style={styles.sliderRow}>
                    <Text style={[styles.advLabel, { color: colors.muted }]}>Upscale Factor</Text>
                    <Text style={[styles.sliderValue, { color: colors.foreground }]}>{state.hiResUpscale.toFixed(1)}x</Text>
                  </View>
                  <TextInput
                    style={[styles.numInput, { color: colors.foreground, backgroundColor: colors.background, borderColor: colors.border }]}
                    value={String(state.hiResUpscale)}
                    onChangeText={(t) => {
                      const v = parseFloat(t);
                      if (!isNaN(v) && v >= 1 && v <= 4) updateField("hiResUpscale", v);
                    }}
                    keyboardType="decimal-pad"
                    returnKeyType="done"
                  />
                  <View style={styles.sliderRow}>
                    <Text style={[styles.advLabel, { color: colors.muted }]}>Hires Steps</Text>
                    <Text style={[styles.sliderValue, { color: colors.foreground }]}>{state.hiResSteps}</Text>
                  </View>
                  <TextInput
                    style={[styles.numInput, { color: colors.foreground, backgroundColor: colors.background, borderColor: colors.border }]}
                    value={String(state.hiResSteps)}
                    onChangeText={(t) => {
                      const v = parseInt(t);
                      if (!isNaN(v) && v >= 1 && v <= 100) updateField("hiResSteps", v);
                    }}
                    keyboardType="number-pad"
                    returnKeyType="done"
                  />
                  <View style={styles.sliderRow}>
                    <Text style={[styles.advLabel, { color: colors.muted }]}>Denoising</Text>
                    <Text style={[styles.sliderValue, { color: colors.foreground }]}>{state.hiResDenoising.toFixed(2)}</Text>
                  </View>
                  <TextInput
                    style={[styles.numInput, { color: colors.foreground, backgroundColor: colors.background, borderColor: colors.border }]}
                    value={String(state.hiResDenoising)}
                    onChangeText={(t) => {
                      const v = parseFloat(t);
                      if (!isNaN(v) && v >= 0 && v <= 1) updateField("hiResDenoising", v);
                    }}
                    keyboardType="decimal-pad"
                    returnKeyType="done"
                  />
                </View>
              )}
            </>
          )}

          {/* Mature Content Toggle */}
          <View style={[styles.seedRow, { marginTop: 14 }]}>
            <Text style={[styles.advLabel, { color: colors.muted }]}>MATURE CONTENT</Text>
            <Switch
              value={state.matureContent}
              onValueChange={(v) => updateField("matureContent", v)}
              trackColor={{ false: colors.border, true: colors.primary }}
              thumbColor="#fff"
            />
          </View>

          <View style={{ height: 60 }} />
        </ScrollView>
      </BottomSheet>

      {/* ===== Fullscreen Viewer ===== */}
      {fullscreenUri && (
        <FullscreenViewer
          image={{
            uri: fullscreenUri,
            prompt: state.prompt,
            model: state.model.name,
            provider: state.model.provider,
          } as any}
          onClose={() => setFullscreenUri(null)}
          onSave={() => handleNativeSave(fullscreenUri)}
          onShare={() => Share.share({ url: fullscreenUri, message: "Generated with Inkform" })}
          onCopyPrompt={() => {
            Clipboard.setStringAsync(state.prompt);
            showToast("Prompt copied", "success");
          }}
          colors={colors}
        />
      )}
    </ScreenContainer>
  );
}

// ===== LoRA Row Component =====
function LoraRow({
  lora,
  colors,
  onWeightChange,
  onRemove,
  onInsertTrigger,
}: {
  lora: LoraEntry;
  colors: any;
  onWeightChange: (w: number) => void;
  onRemove: () => void;
  onInsertTrigger: (words: string[]) => void;
}) {
  return (
    <View style={[styles.loraRow, { backgroundColor: colors.background, borderColor: colors.border }]}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.loraName, { color: colors.foreground }]} numberOfLines={1}>
            {lora.preview?.name || `LoRA ${lora.id}`}
          </Text>
          {lora.triggerWords && lora.triggerWords.length > 0 && (
            <TouchableOpacity onPress={() => onInsertTrigger(lora.triggerWords!)}>
              <Text style={[styles.loraTrigger, { color: colors.primary }]} numberOfLines={1}>
                ⚡ {lora.triggerWords.join(", ")}
              </Text>
            </TouchableOpacity>
          )}
        </View>
        <TouchableOpacity onPress={onRemove} style={{ padding: 4 }}>
          <Text style={{ color: colors.error, fontSize: 13, fontWeight: "600" }}>Remove</Text>
        </TouchableOpacity>
      </View>
      <View style={styles.sliderRow}>
        <Text style={[styles.advLabel, { color: colors.muted }]}>Weight</Text>
        <Text style={[styles.sliderValue, { color: colors.foreground }]}>{lora.weight.toFixed(2)}</Text>
      </View>
      <TextInput
        style={[styles.numInput, { color: colors.foreground, backgroundColor: colors.surface, borderColor: colors.border }]}
        value={String(lora.weight)}
        onChangeText={(t) => {
          const v = parseFloat(t);
          if (!isNaN(v) && v >= -2 && v <= 2) onWeightChange(v);
        }}
        keyboardType="decimal-pad"
        returnKeyType="done"
      />
    </View>
  );
}

// ===== Styles =====
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
  label: {
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 0.8,
    marginBottom: 6,
    marginTop: 14,
  },
  section: {
    marginTop: 8,
  },
  // Model Picker
  pickerBtn: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
  },
  pickerLabel: {
    fontSize: 11,
    fontWeight: "500",
    marginBottom: 2,
  },
  pickerValue: {
    fontSize: 16,
    fontWeight: "600",
  },
  // Accordion
  accordionContainer: {
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 6,
    overflow: "hidden",
  },
  accordionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 0.5,
  },
  accordionTitle: {
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  accordionItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderBottomWidth: 0.5,
  },
  accordionItemText: {
    fontSize: 14,
    fontWeight: "500",
  },
  accordionItemBadge: {
    fontSize: 10,
    fontWeight: "600",
    letterSpacing: 0.5,
  },
  // Prompt
  promptInput: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    fontSize: 14,
    minHeight: 80,
    lineHeight: 20,
  },
  // Chips
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 4,
  },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    marginRight: 4,
    marginBottom: 4,
  },
  // Section Card
  sectionCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 16,
    marginTop: 14,
  },
  sectionCardTitle: {
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 4,
  },
  sectionCardSubtitle: {
    fontSize: 14,
    fontWeight: "600",
  },
  sectionCardDesc: {
    fontSize: 12,
    lineHeight: 17,
    marginBottom: 10,
  },
  // Fetch Row
  fetchRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 8,
  },
  fetchInput: {
    flex: 1,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  },
  fetchBtn: {
    borderRadius: 10,
    paddingHorizontal: 16,
    justifyContent: "center",
    alignItems: "center",
  },
  fetchBtnText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "600",
  },
  singleInput: {
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  },
  // Preview Card
  previewCard: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 10,
    borderWidth: 1,
    padding: 8,
    marginTop: 10,
    gap: 10,
  },
  previewThumb: {
    width: 48,
    height: 48,
    borderRadius: 8,
  },
  previewName: {
    fontSize: 13,
    fontWeight: "600",
  },
  previewBase: {
    fontSize: 11,
    marginTop: 2,
  },
  // LoRA Row
  loraRow: {
    borderRadius: 10,
    borderWidth: 1,
    padding: 10,
    marginTop: 8,
  },
  loraName: {
    fontSize: 13,
    fontWeight: "600",
  },
  loraTrigger: {
    fontSize: 11,
    marginTop: 2,
    fontWeight: "500",
  },
  // Advanced
  actionRow: {
    flexDirection: "row",
    marginTop: 20,
  },
  advancedBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "center",
  },
  advLabel: {
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 0.8,
  },
  seedRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 12,
  },
  sliderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 10,
  },
  sliderValue: {
    fontSize: 14,
    fontWeight: "600",
  },
  numInput: {
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
    marginTop: 4,
  },
  negHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  },
  presetChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    marginRight: 6,
  },
  presetChipText: {
    fontSize: 11,
    fontWeight: "500",
  },
  // Dropdown
  dropdownBtn: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginTop: 4,
  },
  dropdownList: {
    borderRadius: 10,
    borderWidth: 1,
    marginTop: 4,
    overflow: "hidden",
  },
  dropdownItem: {
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  // Reference Image
  refImageBtn: {
    width: 80,
    height: 80,
    borderRadius: 12,
    borderWidth: 1,
    borderStyle: "dashed",
    justifyContent: "center",
    alignItems: "center",
    overflow: "hidden",
  },
  refImageThumb: {
    width: 80,
    height: 80,
  },
  // Generate
  generateBtn: {
    borderRadius: 14,
    paddingVertical: 18,
    alignItems: "center",
    marginTop: 20,
  },
  generateBtnText: {
    color: "#fff",
    fontSize: 17,
    fontWeight: "700",
  },
  // Results
  resultsSection: {
    marginTop: 24,
  },
  resultCard: {
    borderRadius: 12,
    borderWidth: 1,
    overflow: "hidden",
    marginRight: 10,
  },
  resultImage: {
    width: SCREEN_W * 0.75,
    height: SCREEN_W * 0.95,
  },
  saveAllBtn: {
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  resultSaveBtn: {
    position: "absolute",
    bottom: 8,
    right: 8,
    borderRadius: 16,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  // BottomSheet content
  sheetContent: {
    padding: 20,
  },
  sheetTitle: {
    fontSize: 20,
    fontWeight: "700",
    marginBottom: 20,
  },
  progressContainer: {
    marginTop: 8,
    alignItems: "center",
    gap: 6,
  },
  progressTrack: {
    width: "100%",
    height: 6,
    borderRadius: 3,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: 3,
  },
  progressText: {
    fontSize: 12,
    fontWeight: "500",
  },
});
