import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  Text,
  View,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  StyleSheet,
  FlatList,
  Alert,
  Switch,
  Platform,
  Dimensions,
  Keyboard,
} from "react-native";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import * as Clipboard from "expo-clipboard";
import * as MediaLibrary from "expo-media-library";
import * as FileSystem from "expo-file-system/legacy";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { useToast } from "@/lib/toast-context";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  MODEL_CATALOG,
  ALL_MODELS,
  getModelById,
  ASPECT_RATIOS,
  SAMPLING_METHODS,
  VAE_OPTIONS,
  type ModelInfo,
  type EcosystemGroup,
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

// ===== Main Screen =====
export default function StudioScreen() {
  const colors = useColors();
  const { showToast } = useToast();
  const insets = useSafeAreaInsets();

  // Model selection
  const [selectedModel, setSelectedModel] = useState<ModelInfo>(ALL_MODELS[0]);
  const [expandedEcosystem, setExpandedEcosystem] = useState<string | null>(null);
  const [showModelPicker, setShowModelPicker] = useState(false);

  // Core params
  const [prompt, setPrompt] = useState("");
  const [negativePrompt, setNegativePrompt] = useState("");
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>(ASPECT_RATIOS[0]);
  const [batchSize, setBatchSize] = useState(1);

  // Advanced params
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [seed, setSeed] = useState(-1);
  const [randomSeed, setRandomSeed] = useState(true);
  const [steps, setSteps] = useState(30);
  const [cfg, setCfg] = useState(7);
  const [samplingMethod, setSamplingMethod] = useState<SamplingMethodId>("euler_a");
  const [showSamplerPicker, setShowSamplerPicker] = useState(false);
  const [clipSkip, setClipSkip] = useState(2);
  const [vae, setVae] = useState<VaeId>("auto");
  const [showVaePicker, setShowVaePicker] = useState(false);
  const [matureContent, setMatureContent] = useState(false);

  // Hi-Res Fix
  const [hiResFix, setHiResFix] = useState(false);
  const [hiResUpscale, setHiResUpscale] = useState(1.5);
  const [hiResSteps, setHiResSteps] = useState(15);
  const [hiResDenoising, setHiResDenoising] = useState(0.5);

  // Civitai (Legacy loader — for SDXL/Pony/Illustrious/NoobAI)
  const [civitaiModelInput, setCivitaiModelInput] = useState("");
  const [civitaiModelPreview, setCivitaiModelPreview] = useState<CivitaiModelPreview | null>(null);
  const [civitaiLoading, setCivitaiLoading] = useState(false);

  // Civitai (Auto-routing — for other open-weight models)
  const [civitaiOverride, setCivitaiOverride] = useState("");

  // LoRA stack
  const [loraEntries, setLoraEntries] = useState<LoraEntry[]>([]);
  const [loraInput, setLoraInput] = useState("");
  const [loraLoading, setLoraLoading] = useState(false);

  // Reference Image (img2img)
  const [referenceImage, setReferenceImage] = useState<string | null>(null);
  const [denoisingStrength, setDenoisingStrength] = useState(0.7);

  // Negative prompt presets
  const [showNegPresets, setShowNegPresets] = useState(false);

  // Generation state
  const [generating, setGenerating] = useState(false);
  const [genStatus, setGenStatus] = useState("");
  const [generatedImages, setGeneratedImages] = useState<string[]>([]);

  // Load reuse settings on focus
  useEffect(() => {
    loadReuseSettings();
  }, []);

  const loadReuseSettings = async () => {
    try {
      const settings = await getReuseSettings();
      if (!settings) return;
      await clearReuseSettings();

      if (settings.prompt) setPrompt(settings.prompt);
      if (settings.negativePrompt) setNegativePrompt(settings.negativePrompt);
      if (settings.modelId) {
        const m = getModelById(settings.modelId);
        if (m) setSelectedModel(m);
      }
      if (settings.aspectRatio) {
        const ar = ASPECT_RATIOS.find((a) => a.value === settings.aspectRatio);
        if (ar) setAspectRatio(ar);
      }
      if (settings.seed !== undefined) {
        setSeed(settings.seed);
        setRandomSeed(settings.seed === -1);
      }
      if (settings.cfg !== undefined) setCfg(settings.cfg);
      if (settings.steps !== undefined) setSteps(settings.steps);
      if (settings.samplingMethod) setSamplingMethod(settings.samplingMethod as SamplingMethodId);
      showToast("Settings loaded from gallery", "success");
    } catch {}
  };

  // When model changes, update defaults
  useEffect(() => {
    if (selectedModel.defaultCfg) setCfg(selectedModel.defaultCfg);
    if (selectedModel.defaultSteps) setSteps(selectedModel.defaultSteps);
    if (selectedModel.defaultClipSkip) setClipSkip(selectedModel.defaultClipSkip);
    if (selectedModel.defaultCivitaiModelId) {
      setCivitaiOverride(selectedModel.defaultCivitaiModelId);
      if (selectedModel.useLegacyCivitaiLoader) {
        setCivitaiModelInput(selectedModel.defaultCivitaiModelId);
      }
    }
    // Reset LoRAs when switching to a model that doesn't support them
    if (!selectedModel.supportsLoRAs) {
      setLoraEntries([]);
    }
    // Reset reference image if model doesn't support img2img
    if (!selectedModel.supportsImg2Img) {
      setReferenceImage(null);
    }
    // Cap batch for models with maxBatch
    const maxBatch = selectedModel.extraParams?.maxBatch;
    if (maxBatch && batchSize > maxBatch) {
      setBatchSize(maxBatch);
    }
  }, [selectedModel]);

  // ===== Civitai Fetch (Legacy) =====
  const handleFetchCivitaiModel = async () => {
    const parsed = parseCivitaiId(civitaiModelInput);
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
        setCivitaiModelInput(String(preview.id));
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
      setReferenceImage(result.assets[0].uri);
    }
  };

  // ===== Generate =====
  const handleGenerate = async () => {
    if (!prompt.trim()) {
      showToast("Enter a prompt first", "error");
      return;
    }
    Keyboard.dismiss();
    setGenerating(true);
    setGenStatus("Preparing...");
    setGeneratedImages([]);

    try {
      const effectiveSeed = randomSeed ? -1 : seed;
      const maxBatch = selectedModel.extraParams?.maxBatch;
      const effectiveBatch = maxBatch ? Math.min(batchSize, maxBatch) : batchSize;

      // Determine civitai model ID
      let civitaiId: string | undefined;
      if (selectedModel.useLegacyCivitaiLoader) {
        civitaiId = parseCivitaiId(civitaiModelInput) || selectedModel.defaultCivitaiModelId;
      } else if (selectedModel.provider === "runpod") {
        civitaiId = parseCivitaiId(civitaiOverride) || selectedModel.defaultCivitaiModelId;
      }

      const req: GenerationRequest = {
        provider: selectedModel.provider,
        model: selectedModel,
        prompt: prompt.trim(),
        negativePrompt: selectedModel.supportsNegativePrompt ? negativePrompt.trim() || undefined : undefined,
        aspectRatio,
        batchSize: effectiveBatch,
        cfg: selectedModel.supportsCfg ? cfg : undefined,
        steps: selectedModel.supportsSteps ? steps : undefined,
        seed: effectiveSeed !== -1 ? effectiveSeed : undefined,
        samplingMethod: selectedModel.supportsSteps ? samplingMethod : undefined,
        clipSkip: selectedModel.supportsClipSkip ? clipSkip : undefined,
        vae: selectedModel.supportsVae ? vae : undefined,
        hiResFix: selectedModel.supportsHiResFix ? hiResFix : undefined,
        hiResUpscaleFactor: hiResFix ? hiResUpscale : undefined,
        hiResSteps: hiResFix ? hiResSteps : undefined,
        hiResDenoising: hiResFix ? hiResDenoising : undefined,
        matureContent,
        loraEntries: selectedModel.supportsLoRAs && loraEntries.length > 0 ? loraEntries : undefined,
        civitaiModelId: civitaiId,
        referenceImageUri: selectedModel.supportsImg2Img && referenceImage ? referenceImage : undefined,
        denoisingStrength: referenceImage ? denoisingStrength : undefined,
      };

      const images = await generateImages(req, setGenStatus);

      // Save to history and gallery (downloads to local storage)
      await savePromptToHistory({
        prompt: prompt.trim(),
        negativePrompt: negativePrompt.trim() || undefined,
        provider: selectedModel.provider,
        model: selectedModel.name,
      });

      const localUris: string[] = [];
      for (const uri of images) {
        const saved = await saveImageToGallery({
          uri,
          prompt: prompt.trim(),
          negativePrompt: negativePrompt.trim() || undefined,
          provider: selectedModel.provider,
          model: selectedModel.id,
          aspectRatio: aspectRatio.value,
          seed: effectiveSeed,
          samplingMethod: selectedModel.supportsSteps ? samplingMethod : undefined,
          cfg: selectedModel.supportsCfg ? cfg : undefined,
          steps: selectedModel.supportsSteps ? steps : undefined,
        });
        // Use the local URI so the result card shows the cached image
        localUris.push(saved.uri);
      }

      // Show local URIs in results (they persist even if remote URL expires)
      setGeneratedImages(localUris);

      showToast(`Generated ${images.length} image${images.length > 1 ? "s" : ""}`, "success");
    } catch (err: any) {
      const msg = err?.message || "Generation failed";
      showToast(msg.length > 120 ? msg.slice(0, 120) + "..." : msg, "error");
    } finally {
      setGenerating(false);
      setGenStatus("");
    }
  };

  // ===== Helpers =====
  const arch = selectedModel.architecture;
  const isApi = arch === "api";
  const isFlux = arch === "flux";
  const isLegacyCivitai = !!selectedModel.useLegacyCivitaiLoader;
  const isRunPod = selectedModel.provider === "runpod";
  const showCivitaiEnhancements = isRunPod && !isLegacyCivitai && !isApi;

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
            <Text style={[styles.pickerLabel, { color: colors.muted }]}>{selectedModel.ecosystem}</Text>
            <Text style={[styles.pickerValue, { color: colors.foreground }]}>{selectedModel.name}</Text>
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
                          setSelectedModel(model);
                          setShowModelPicker(false);
                          setExpandedEcosystem(null);
                        }}
                        style={[
                          styles.accordionItem,
                          { borderBottomColor: colors.border },
                          model.id === selectedModel.id && { backgroundColor: colors.primary + "20" },
                        ]}
                      >
                        <Text
                          style={[
                            styles.accordionItemText,
                            { color: model.id === selectedModel.id ? colors.primary : colors.foreground },
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
          value={prompt}
          onChangeText={setPrompt}
          placeholder="Describe your image..."
          placeholderTextColor={colors.muted}
          multiline
          numberOfLines={4}
          textAlignVertical="top"
        />

        {/* ===== Reference Image (img2img) ===== */}
        {selectedModel.supportsImg2Img && (
          <View style={styles.section}>
            <Text style={[styles.label, { color: colors.muted }]}>REFERENCE IMAGE</Text>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <TouchableOpacity
                onPress={handlePickReferenceImage}
                style={[styles.refImageBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
              >
                {referenceImage ? (
                  <Image source={{ uri: referenceImage }} style={styles.refImageThumb} contentFit="cover" />
                ) : (
                  <Text style={{ color: colors.muted, fontSize: 13 }}>Tap to select</Text>
                )}
              </TouchableOpacity>
              {referenceImage && (
                <TouchableOpacity onPress={() => setReferenceImage(null)}>
                  <Text style={{ color: colors.error, fontSize: 13, fontWeight: "600" }}>Remove</Text>
                </TouchableOpacity>
              )}
            </View>
            {referenceImage && (
              <View style={styles.sliderRow}>
                <Text style={[styles.advLabel, { color: colors.muted }]}>Denoising Strength</Text>
                <Text style={[styles.sliderValue, { color: colors.foreground }]}>{denoisingStrength.toFixed(2)}</Text>
              </View>
            )}
            {referenceImage && (
              <TextInput
                style={[styles.numInput, { color: colors.foreground, backgroundColor: colors.surface, borderColor: colors.border }]}
                value={String(denoisingStrength)}
                onChangeText={(t) => {
                  const v = parseFloat(t);
                  if (!isNaN(v) && v >= 0 && v <= 1) setDenoisingStrength(v);
                }}
                keyboardType="decimal-pad"
                returnKeyType="done"
              />
            )}
          </View>
        )}

        {/* ===== Aspect Ratio ===== */}
        <Text style={[styles.label, { color: colors.muted }]}>ASPECT RATIO</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipRow}>
          {ASPECT_RATIOS.map((ar) => (
            <TouchableOpacity
              key={ar.value}
              onPress={() => setAspectRatio(ar)}
              style={[
                styles.chip,
                { borderColor: colors.border },
                ar.value === aspectRatio.value && { backgroundColor: colors.primary, borderColor: colors.primary },
              ]}
            >
              <Text
                style={[
                  styles.chipText,
                  { color: ar.value === aspectRatio.value ? "#fff" : colors.foreground },
                ]}
              >
                {ar.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* ===== Batch Size ===== */}
        <Text style={[styles.label, { color: colors.muted }]}>BATCH SIZE</Text>
        <View style={styles.chipRow}>
          {[1, 2, 3, 4].map((n) => {
            const maxBatch = selectedModel.extraParams?.maxBatch;
            const disabled = maxBatch ? n > maxBatch : false;
            return (
              <TouchableOpacity
                key={n}
                onPress={() => !disabled && setBatchSize(n)}
                disabled={disabled}
                style={[
                  styles.chip,
                  { borderColor: colors.border },
                  n === batchSize && { backgroundColor: colors.primary, borderColor: colors.primary },
                  disabled && { opacity: 0.3 },
                ]}
              >
                <Text style={[styles.chipText, { color: n === batchSize ? "#fff" : colors.foreground }]}>{n}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* ===== Legacy Civitai Loader (Phase 3) ===== */}
        {isLegacyCivitai && (
          <View style={[styles.sectionCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.sectionCardTitle, { color: colors.foreground }]}>Civitai Model</Text>
            <Text style={[styles.sectionCardDesc, { color: colors.muted }]}>
              Enter a Civitai model version ID or URL to use a custom checkpoint.
            </Text>
            <View style={styles.fetchRow}>
              <TextInput
                style={[styles.fetchInput, { color: colors.foreground, backgroundColor: colors.background, borderColor: colors.border }]}
                value={civitaiModelInput}
                onChangeText={setCivitaiModelInput}
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
                onInsertTrigger={(words) => setPrompt((p) => p + " " + words.join(", "))}
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

        {/* ===== Auto Civitai Routing (Phase 4) ===== */}
        {showCivitaiEnhancements && (
          <View style={[styles.sectionCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.sectionCardTitle, { color: colors.foreground }]}>Civitai Enhancements</Text>
            <Text style={[styles.sectionCardDesc, { color: colors.muted }]}>
              Base model auto-populated. Edit to override with a different Civitai model.
            </Text>
            <TextInput
              style={[styles.singleInput, { color: colors.foreground, backgroundColor: colors.background, borderColor: colors.border }]}
              value={civitaiOverride}
              onChangeText={setCivitaiOverride}
              placeholder="Civitai Model Version ID"
              placeholderTextColor={colors.muted}
              autoCapitalize="none"
              returnKeyType="done"
            />

            {/* Dynamic LoRA Stack */}
            {selectedModel.supportsLoRAs && (
              <>
                <Text style={[styles.sectionCardSubtitle, { color: colors.foreground, marginTop: 14 }]}>LoRA Stack</Text>
                {loraEntries.map((lora) => (
                  <LoraRow
                    key={lora.id}
                    lora={lora}
                    colors={colors}
                    onWeightChange={(w) => handleLoraWeightChange(lora.id, w)}
                    onRemove={() => handleRemoveLora(lora.id)}
                    onInsertTrigger={(words) => setPrompt((p) => p + " " + words.join(", "))}
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

        {/* ===== Advanced Options ===== */}
        <TouchableOpacity
          onPress={() => setShowAdvanced(!showAdvanced)}
          style={styles.advancedToggle}
        >
          <Text style={[styles.advancedToggleText, { color: colors.primary }]}>
            Advanced Settings {showAdvanced ? "▲" : "▼"}
          </Text>
        </TouchableOpacity>

        {showAdvanced && (
          <View style={[styles.sectionCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            {/* Negative Prompt — show for SDXL/SD15/Other, hide for FLUX/API */}
            {selectedModel.supportsNegativePrompt && (
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
                        onPress={() => setNegativePrompt(p.text)}
                        style={[styles.presetChip, { borderColor: colors.border }]}
                      >
                        <Text style={[styles.presetChipText, { color: colors.foreground }]}>{p.label}</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                )}
                <TextInput
                  style={[styles.promptInput, { color: colors.foreground, backgroundColor: colors.background, borderColor: colors.border, minHeight: 60 }]}
                  value={negativePrompt}
                  onChangeText={setNegativePrompt}
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
                  value={randomSeed}
                  onValueChange={setRandomSeed}
                  trackColor={{ false: colors.border, true: colors.primary }}
                  thumbColor="#fff"
                />
              </View>
            </View>
            {!randomSeed && (
              <TextInput
                style={[styles.numInput, { color: colors.foreground, backgroundColor: colors.background, borderColor: colors.border }]}
                value={String(seed)}
                onChangeText={(t) => {
                  const v = parseInt(t);
                  if (!isNaN(v)) setSeed(v);
                  else if (t === "" || t === "-") setSeed(-1);
                }}
                keyboardType="number-pad"
                returnKeyType="done"
              />
            )}

            {/* Steps — hide for API models */}
            {selectedModel.supportsSteps && (
              <>
                <View style={styles.sliderRow}>
                  <Text style={[styles.advLabel, { color: colors.muted }]}>STEPS</Text>
                  <Text style={[styles.sliderValue, { color: colors.foreground }]}>{steps}</Text>
                </View>
                <TextInput
                  style={[styles.numInput, { color: colors.foreground, backgroundColor: colors.background, borderColor: colors.border }]}
                  value={String(steps)}
                  onChangeText={(t) => {
                    const v = parseInt(t);
                    if (!isNaN(v) && v >= 1 && v <= (selectedModel.stepsRange?.[1] || 100)) setSteps(v);
                  }}
                  keyboardType="number-pad"
                  returnKeyType="done"
                />
              </>
            )}

            {/* CFG Scale — hide for API models */}
            {selectedModel.supportsCfg && (
              <>
                <View style={styles.sliderRow}>
                  <Text style={[styles.advLabel, { color: colors.muted }]}>CFG SCALE</Text>
                  <Text style={[styles.sliderValue, { color: colors.foreground }]}>{cfg}</Text>
                </View>
                <TextInput
                  style={[styles.numInput, { color: colors.foreground, backgroundColor: colors.background, borderColor: colors.border }]}
                  value={String(cfg)}
                  onChangeText={(t) => {
                    const v = parseFloat(t);
                    if (!isNaN(v) && v >= 1 && v <= (selectedModel.cfgRange?.[1] || 30)) setCfg(v);
                  }}
                  keyboardType="decimal-pad"
                  returnKeyType="done"
                />
              </>
            )}

            {/* Sampler — hide for API models */}
            {selectedModel.supportsSteps && (
              <>
                <Text style={[styles.advLabel, { color: colors.muted, marginTop: 12 }]}>SAMPLER</Text>
                <TouchableOpacity
                  onPress={() => setShowSamplerPicker(!showSamplerPicker)}
                  style={[styles.dropdownBtn, { backgroundColor: colors.background, borderColor: colors.border }]}
                >
                  <Text style={{ color: colors.foreground, fontSize: 14 }}>
                    {SAMPLING_METHODS.find((s) => s.id === samplingMethod)?.label || samplingMethod}
                  </Text>
                  <Text style={{ color: colors.muted }}>▼</Text>
                </TouchableOpacity>
                {showSamplerPicker && (
                  <View style={[styles.dropdownList, { backgroundColor: colors.background, borderColor: colors.border }]}>
                    {SAMPLING_METHODS.map((s) => (
                      <TouchableOpacity
                        key={s.id}
                        onPress={() => {
                          setSamplingMethod(s.id);
                          setShowSamplerPicker(false);
                        }}
                        style={[styles.dropdownItem, s.id === samplingMethod && { backgroundColor: colors.primary + "20" }]}
                      >
                        <Text style={{ color: s.id === samplingMethod ? colors.primary : colors.foreground, fontSize: 14 }}>
                          {s.label}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </>
            )}

            {/* Clip Skip — SDXL/SD15 only */}
            {selectedModel.supportsClipSkip && (
              <>
                <View style={styles.sliderRow}>
                  <Text style={[styles.advLabel, { color: colors.muted }]}>CLIP SKIP</Text>
                  <Text style={[styles.sliderValue, { color: colors.foreground }]}>{clipSkip}</Text>
                </View>
                <TextInput
                  style={[styles.numInput, { color: colors.foreground, backgroundColor: colors.background, borderColor: colors.border }]}
                  value={String(clipSkip)}
                  onChangeText={(t) => {
                    const v = parseInt(t);
                    if (!isNaN(v) && v >= 1 && v <= 12) setClipSkip(v);
                  }}
                  keyboardType="number-pad"
                  returnKeyType="done"
                />
              </>
            )}

            {/* VAE — SDXL/SD15 only */}
            {selectedModel.supportsVae && (
              <>
                <Text style={[styles.advLabel, { color: colors.muted, marginTop: 12 }]}>VAE</Text>
                <TouchableOpacity
                  onPress={() => setShowVaePicker(!showVaePicker)}
                  style={[styles.dropdownBtn, { backgroundColor: colors.background, borderColor: colors.border }]}
                >
                  <Text style={{ color: colors.foreground, fontSize: 14 }}>
                    {VAE_OPTIONS.find((v) => v.id === vae)?.label || vae}
                  </Text>
                  <Text style={{ color: colors.muted }}>▼</Text>
                </TouchableOpacity>
                {showVaePicker && (
                  <View style={[styles.dropdownList, { backgroundColor: colors.background, borderColor: colors.border }]}>
                    {VAE_OPTIONS.map((v) => (
                      <TouchableOpacity
                        key={v.id}
                        onPress={() => {
                          setVae(v.id);
                          setShowVaePicker(false);
                        }}
                        style={[styles.dropdownItem, v.id === vae && { backgroundColor: colors.primary + "20" }]}
                      >
                        <Text style={{ color: v.id === vae ? colors.primary : colors.foreground, fontSize: 14 }}>
                          {v.label}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </>
            )}

            {/* Hi-Res Fix — SDXL/SD15 only */}
            {selectedModel.supportsHiResFix && (
              <>
                <View style={[styles.seedRow, { marginTop: 14 }]}>
                  <Text style={[styles.advLabel, { color: colors.muted }]}>HI-RES FIX</Text>
                  <Switch
                    value={hiResFix}
                    onValueChange={setHiResFix}
                    trackColor={{ false: colors.border, true: colors.primary }}
                    thumbColor="#fff"
                  />
                </View>
                {hiResFix && (
                  <View style={{ gap: 8, marginTop: 8 }}>
                    <View style={styles.sliderRow}>
                      <Text style={[styles.advLabel, { color: colors.muted }]}>Upscale Factor</Text>
                      <Text style={[styles.sliderValue, { color: colors.foreground }]}>{hiResUpscale.toFixed(1)}x</Text>
                    </View>
                    <TextInput
                      style={[styles.numInput, { color: colors.foreground, backgroundColor: colors.background, borderColor: colors.border }]}
                      value={String(hiResUpscale)}
                      onChangeText={(t) => {
                        const v = parseFloat(t);
                        if (!isNaN(v) && v >= 1 && v <= 4) setHiResUpscale(v);
                      }}
                      keyboardType="decimal-pad"
                      returnKeyType="done"
                    />
                    <View style={styles.sliderRow}>
                      <Text style={[styles.advLabel, { color: colors.muted }]}>Hires Steps</Text>
                      <Text style={[styles.sliderValue, { color: colors.foreground }]}>{hiResSteps}</Text>
                    </View>
                    <TextInput
                      style={[styles.numInput, { color: colors.foreground, backgroundColor: colors.background, borderColor: colors.border }]}
                      value={String(hiResSteps)}
                      onChangeText={(t) => {
                        const v = parseInt(t);
                        if (!isNaN(v) && v >= 1 && v <= 100) setHiResSteps(v);
                      }}
                      keyboardType="number-pad"
                      returnKeyType="done"
                    />
                    <View style={styles.sliderRow}>
                      <Text style={[styles.advLabel, { color: colors.muted }]}>Denoising</Text>
                      <Text style={[styles.sliderValue, { color: colors.foreground }]}>{hiResDenoising.toFixed(2)}</Text>
                    </View>
                    <TextInput
                      style={[styles.numInput, { color: colors.foreground, backgroundColor: colors.background, borderColor: colors.border }]}
                      value={String(hiResDenoising)}
                      onChangeText={(t) => {
                        const v = parseFloat(t);
                        if (!isNaN(v) && v >= 0 && v <= 1) setHiResDenoising(v);
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
                value={matureContent}
                onValueChange={setMatureContent}
                trackColor={{ false: colors.border, true: colors.primary }}
                thumbColor="#fff"
              />
            </View>
          </View>
        )}

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

        {/* ===== Generated Images ===== */}
        {generatedImages.length > 0 && (
          <View style={styles.resultsSection}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <Text style={[styles.label, { color: colors.muted }]}>RESULTS</Text>
              <TouchableOpacity
                onPress={async () => {
                  if (Platform.OS === "web") { showToast("Save not supported on web", "warning"); return; }
                  try {
                    const { status } = await MediaLibrary.requestPermissionsAsync();
                    if (status !== "granted") { showToast("Camera roll permission denied", "error"); return; }
                    let saved = 0;
                    for (const uri of generatedImages) {
                      let localUri = uri;
                      if (uri.startsWith("http")) {
                        const ext = uri.includes(".png") ? "png" : "jpg";
                        const dest = (FileSystem.cacheDirectory || "") + `inkform_save_${Date.now()}_${saved}.${ext}`;
                        const { uri: dl } = await FileSystem.downloadAsync(uri, dest);
                        localUri = dl;
                      }
                      await MediaLibrary.createAssetAsync(localUri);
                      saved++;
                    }
                    showToast(`Saved ${saved} image${saved > 1 ? "s" : ""} to camera roll ✓`, "success");
                  } catch (e: any) {
                    showToast("Failed to save: " + (e.message || "unknown"), "error");
                  }
                }}
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
                <View style={[styles.resultCard, { borderColor: colors.border }]}>
                  <Image source={{ uri: item }} style={styles.resultImage} contentFit="cover" />
                  <TouchableOpacity
                    onPress={async () => {
                      if (Platform.OS === "web") { showToast("Save not supported on web", "warning"); return; }
                      try {
                        const { status } = await MediaLibrary.requestPermissionsAsync();
                        if (status !== "granted") { showToast("Camera roll permission denied", "error"); return; }
                        let localUri = item;
                        if (item.startsWith("http")) {
                          const ext = item.includes(".png") ? "png" : "jpg";
                          const dest = (FileSystem.cacheDirectory || "") + `inkform_save_${Date.now()}.${ext}`;
                          const { uri: dl } = await FileSystem.downloadAsync(item, dest);
                          localUri = dl;
                        }
                        await MediaLibrary.createAssetAsync(localUri);
                        showToast("Saved to camera roll ✓", "success");
                      } catch (e: any) {
                        showToast("Failed to save: " + (e.message || "unknown"), "error");
                      }
                    }}
                    style={[styles.resultSaveBtn, { backgroundColor: "rgba(0,0,0,0.55)" }]}
                  >
                    <Text style={{ color: "#fff", fontSize: 11, fontWeight: "600" }}>💾</Text>
                  </TouchableOpacity>
                </View>
              )}
            />
          </View>
        )}

        <View style={{ height: 80 }} />
      </ScrollView>
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
  chipText: {
    fontSize: 13,
    fontWeight: "600",
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
  advancedToggle: {
    alignItems: "center",
    paddingVertical: 14,
    marginTop: 8,
  },
  advancedToggleText: {
    fontSize: 14,
    fontWeight: "600",
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
    paddingVertical: 16,
    alignItems: "center",
    marginTop: 16,
  },
  generateBtnText: {
    color: "#fff",
    fontSize: 17,
    fontWeight: "700",
  },
  // Results
  resultsSection: {
    marginTop: 20,
  },
  resultCard: {
    borderRadius: 12,
    borderWidth: 1,
    overflow: "hidden",
    marginRight: 10,
  },
  resultImage: {
    width: SCREEN_W * 0.7,
    height: SCREEN_W * 0.9,
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
});
