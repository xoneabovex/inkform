import { describe, it, expect } from "vitest";
import {
  MODEL_CATALOG,
  ALL_MODELS,
  getModelById,
  ASPECT_RATIOS,
  SAMPLING_METHODS,
  VAE_OPTIONS,
} from "../types";

describe("Model Catalog", () => {
  it("has ecosystem groups", () => {
    expect(MODEL_CATALOG.length).toBeGreaterThan(5);
    for (const group of MODEL_CATALOG) {
      expect(group.name).toBeTruthy();
      expect(group.models.length).toBeGreaterThan(0);
    }
  });

  it("ALL_MODELS flattens all models", () => {
    const totalModels = MODEL_CATALOG.reduce((sum, g) => sum + g.models.length, 0);
    expect(ALL_MODELS.length).toBe(totalModels);
  });

  it("getModelById returns correct model", () => {
    const flux = getModelById("flux-2-max");
    expect(flux).toBeDefined();
    expect(flux?.name).toBe("Flux.2 Max");
    expect(flux?.provider).toBe("replicate");
  });

  it("getModelById returns undefined for missing model", () => {
    expect(getModelById("nonexistent")).toBeUndefined();
  });

  it("legacy Civitai loader models have useLegacyCivitaiLoader flag", () => {
    const legacy = ALL_MODELS.filter((m) => m.useLegacyCivitaiLoader);
    expect(legacy.length).toBeGreaterThan(0);
    for (const m of legacy) {
      expect(m.architecture).toBe("sdxl");
    }
  });

  it("FLUX models have flux architecture", () => {
    const fluxModels = ALL_MODELS.filter((m) => m.ecosystem === "FLUX");
    for (const m of fluxModels) {
      expect(m.architecture).toBe("flux");
    }
  });

  it("API models do not support LoRAs", () => {
    const apiModels = ALL_MODELS.filter((m) => m.architecture === "api");
    for (const m of apiModels) {
      expect(m.supportsLoRAs).toBe(false);
    }
  });
});

describe("Constants", () => {
  it("has aspect ratios", () => {
    expect(ASPECT_RATIOS.length).toBe(8);
  });

  it("has sampling methods", () => {
    expect(SAMPLING_METHODS.length).toBeGreaterThan(5);
  });

  it("has VAE options", () => {
    expect(VAE_OPTIONS.length).toBeGreaterThan(2);
  });
});
