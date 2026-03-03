import { describe, it, expect } from "vitest";
import {
  REPLICATE_MODELS,
  GOOGLE_MODELS,
  RUNPOD_MODEL,
  ASPECT_RATIOS,
} from "../types";

describe("Types and Constants", () => {
  it("should have correct number of Replicate models", () => {
    expect(REPLICATE_MODELS.length).toBe(7);
  });

  it("should have all required Replicate model IDs", () => {
    const ids = REPLICATE_MODELS.map((m) => m.replicateId);
    expect(ids).toContain("black-forest-labs/flux-2-max");
    expect(ids).toContain("black-forest-labs/flux-2-pro");
    expect(ids).toContain("black-forest-labs/flux-2-dev");
    expect(ids).toContain("black-forest-labs/flux-2-klein");
    expect(ids).toContain("qwen/qwen-image-2512");
    expect(ids).toContain("qwen/qwen-image-edit");
    expect(ids).toContain("stability-ai/sdxl");
  });

  it("should have Google Imagen 3 model", () => {
    expect(GOOGLE_MODELS.length).toBe(1);
    expect(GOOGLE_MODELS[0].id).toBe("imagen-3");
    expect(GOOGLE_MODELS[0].provider).toBe("google");
  });

  it("should have RunPod custom model", () => {
    expect(RUNPOD_MODEL.provider).toBe("runpod");
    expect(RUNPOD_MODEL.supportsNegativePrompt).toBe(true);
    expect(RUNPOD_MODEL.supportsCfg).toBe(true);
    expect(RUNPOD_MODEL.supportsSteps).toBe(true);
  });

  it("should have 8 aspect ratio presets", () => {
    expect(ASPECT_RATIOS.length).toBe(8);
  });

  it("should have correct aspect ratio values", () => {
    const values = ASPECT_RATIOS.map((ar) => ar.value);
    expect(values).toContain("1:1");
    expect(values).toContain("4:3");
    expect(values).toContain("3:4");
    expect(values).toContain("3:2");
    expect(values).toContain("2:3");
    expect(values).toContain("16:9");
    expect(values).toContain("21:9");
    expect(values).toContain("9:16");
  });

  it("all aspect ratios should have valid dimensions", () => {
    for (const ar of ASPECT_RATIOS) {
      expect(ar.width).toBeGreaterThan(0);
      expect(ar.height).toBeGreaterThan(0);
    }
  });

  it("SDXL model should support negative prompts", () => {
    const sdxl = REPLICATE_MODELS.find((m) => m.id === "sdxl");
    expect(sdxl).toBeDefined();
    expect(sdxl!.supportsNegativePrompt).toBe(true);
  });

  it("FLUX models should not support negative prompts", () => {
    const fluxModels = REPLICATE_MODELS.filter((m) => m.id.startsWith("flux"));
    for (const m of fluxModels) {
      expect(m.supportsNegativePrompt).toBe(false);
    }
  });
});
