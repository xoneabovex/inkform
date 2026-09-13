import { describe, expect, it } from "vitest";
import { buildReplicateInput } from "../api/replicate";
import { ASPECT_RATIOS, getModelById, type GenerationRequest } from "../types";

function makeRequest(
  modelId: string,
  overrides: Partial<GenerationRequest> = {},
): GenerationRequest {
  const model = getModelById(modelId);
  if (!model) throw new Error(`Missing test model: ${modelId}`);

  return {
    provider: "replicate",
    model,
    prompt: "A cinematic portrait",
    aspectRatio: ASPECT_RATIOS[0],
    batchSize: 1,
    ...overrides,
  };
}

describe("Replicate model routing", () => {
  it("uses current provider model IDs", () => {
    expect(getModelById("flux-1-krea")?.replicateId).toBe(
      "black-forest-labs/flux-krea-dev",
    );
    expect(getModelById("flux-1-kontext")?.replicateId).toBe(
      "black-forest-labs/flux-kontext-max",
    );
    expect(getModelById("qwen")?.replicateId).toBe("qwen/qwen-image");
    expect(getModelById("grok-image")?.replicateId).toBe(
      "xai/grok-imagine-image-2",
    );
  });

  it("uses input_images for FLUX.2 reference images", () => {
    const input = buildReplicateInput(
      makeRequest("flux-2-max", {
        referenceImageUri: "data:image/jpeg;base64,abc",
        denoisingStrength: 0.7,
      }),
    );

    expect(input.input_images).toEqual(["data:image/jpeg;base64,abc"]);
    expect(input.prompt_strength).toBeUndefined();
  });

  it("uses input_image for Kontext", () => {
    const input = buildReplicateInput(
      makeRequest("flux-1-kontext", {
        referenceImageUri: "https://example.com/reference.jpg",
      }),
    );

    expect(input.input_image).toBe("https://example.com/reference.jpg");
    expect(input.image_prompt).toBeUndefined();
  });

  it("maps Qwen controls and ultrawide ratios to supported fields", () => {
    const input = buildReplicateInput(
      makeRequest("qwen", {
        aspectRatio: ASPECT_RATIOS.find((ratio) => ratio.value === "21:9")!,
        cfg: 3,
        steps: 32,
        denoisingStrength: 0.55,
        referenceImageUri: "data:image/png;base64,abc",
      }),
    );

    expect(input).toMatchObject({
      aspect_ratio: "16:9",
      guidance: 3,
      num_inference_steps: 32,
      strength: 0.55,
      image: "data:image/png;base64,abc",
    });
  });

  it("supplies GPT Image credentials and its native batch field", () => {
    const input = buildReplicateInput(
      makeRequest("openai-gpt-image", {
        aspectRatio: ASPECT_RATIOS.find((ratio) => ratio.value === "16:9")!,
        batchSize: 4,
        referenceImageUri: "data:image/jpeg;base64,abc",
      }),
      { openaiApiKey: "test-openai-key" },
    );

    expect(input).toMatchObject({
      aspect_ratio: "3:2",
      number_of_images: 4,
      input_images: ["data:image/jpeg;base64,abc"],
      openai_api_key: "test-openai-key",
    });
  });

  it("does not send the obsolete num_outputs field to Flux 1.1 Pro", () => {
    const input = buildReplicateInput(
      makeRequest("flux-1.1-pro", { batchSize: 4 }),
    );
    expect(input.num_outputs).toBeUndefined();
  });
});
