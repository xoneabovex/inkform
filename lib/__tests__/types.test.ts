import { describe, it, expect } from "vitest";
import {
  REPLICATE_MODELS,
  GOOGLE_MODELS,
  RUNPOD_MODEL,
  ASPECT_RATIOS,
  SAMPLING_METHODS,
} from "../types";

describe("Types and Constants", () => {
  it("should have correct number of Replicate models", () => {
    // FLUX.2 Max, FLUX.2 Pro, FLUX.2 Dev, FLUX.2 Klein 4B, FLUX.1 Schnell, FLUX 1.1 Pro
    expect(REPLICATE_MODELS.length).toBe(6);
  });

  it("should have all required Replicate model IDs", () => {
    const ids = REPLICATE_MODELS.map((m) => m.replicateId);
    expect(ids).toContain("black-forest-labs/flux-2-max");
    expect(ids).toContain("black-forest-labs/flux-2-pro");
    expect(ids).toContain("black-forest-labs/flux-2-dev");
    expect(ids).toContain("black-forest-labs/flux-2-klein-4b");
    expect(ids).toContain("black-forest-labs/flux-schnell");
    expect(ids).toContain("black-forest-labs/flux-1.1-pro");
  });

  it("should NOT include SDXL in Replicate models", () => {
    const ids = REPLICATE_MODELS.map((m) => m.id);
    expect(ids).not.toContain("sdxl");
  });

  it("should have Google Imagen models", () => {
    expect(GOOGLE_MODELS.length).toBeGreaterThanOrEqual(3);
    const ids = GOOGLE_MODELS.map((m) => m.id);
    expect(ids).toContain("imagen-4");
    expect(ids).toContain("imagen-4-ultra");
    expect(ids).toContain("gemini-3-flash-image");
    expect(GOOGLE_MODELS[0].provider).toBe("google");
  });

  it("should have RunPod custom model with full parameter support", () => {
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

  it("FLUX models should not support negative prompts", () => {
    const fluxModels = REPLICATE_MODELS.filter((m) => m.id.startsWith("flux"));
    expect(fluxModels.length).toBeGreaterThan(0);
    for (const m of fluxModels) {
      expect(m.supportsNegativePrompt).toBe(false);
    }
  });

  it("should have sampling methods including common ones", () => {
    const ids = SAMPLING_METHODS.map((s) => s.id);
    expect(ids).toContain("euler");
    expect(ids).toContain("euler_a");
    expect(ids).toContain("dpm++_2m_karras");
    expect(ids).toContain("ddim");
    expect(ids).toContain("lcm");
  });
});
