import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildGoogleImageRequest,
  generateWithGoogleImagen,
  GOOGLE_IMAGE_MODELS,
} from "../api/google-imagen";
import { getModelById, ASPECT_RATIOS, type GenerationRequest } from "../types";
const req: GenerationRequest = {
  provider: "google",
  model: getModelById("gemini-3-flash-image")!,
  prompt: "A blue square",
  aspectRatio: ASPECT_RATIOS[0],
  batchSize: 1,
};
afterEach(() => vi.unstubAllGlobals());
describe("Google model migration", () => {
  it("migrates saved Imagen IDs", () => {
    expect(getModelById("imagen-4")?.id).toBe("gemini-3-flash-image");
    expect(getModelById("imagen-4-ultra")?.id).toBe("gemini-3-pro-image");
    expect(getModelById("imagen-4-fast")?.id).toBe(
      "gemini-3.1-flash-lite-image",
    );
    expect(
      Object.values(GOOGLE_IMAGE_MODELS).some(
        (v) => v.includes("preview") || v.startsWith("imagen"),
      ),
    ).toBe(false);
  });
  it("sends reference bytes rather than ignoring the image", () => {
    const body = buildGoogleImageRequest({
      ...req,
      referenceImageUri: "data:image/png;base64,YWJj",
    });
    expect(body.contents[0].parts[1]).toEqual({
      inlineData: { mimeType: "image/png", data: "YWJj" },
    });
    expect(() =>
      buildGoogleImageRequest({
        ...req,
        referenceImageUri: "file:///photo.png",
      }),
    ).toThrow();
  });
  it("uses generateContent and returns only final images", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify({
            candidates: [
              {
                content: {
                  parts: [
                    { thought: true, inlineData: { data: "hidden" } },
                    { inlineData: { mimeType: "image/png", data: "final" } },
                  ],
                },
              },
            ],
          }),
        ),
      );
    vi.stubGlobal("fetch", fetcher);
    expect(await generateWithGoogleImagen("test-key", req)).toEqual([
      "data:image/png;base64,final",
    ]);
    expect(fetcher.mock.calls[0][0]).toContain(
      "gemini-3.1-flash-image:generateContent",
    );
  });
});
