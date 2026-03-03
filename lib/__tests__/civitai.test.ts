import { describe, it, expect } from "vitest";
import { parseCivitaiId } from "../api/civitai";

describe("Civitai API", () => {
  describe("parseCivitaiId", () => {
    it("should parse a raw numeric ID", () => {
      expect(parseCivitaiId("128713")).toBe("128713");
    });

    it("should parse a Civitai model URL", () => {
      expect(parseCivitaiId("https://civitai.com/models/128713")).toBe("128713");
    });

    it("should parse a Civitai model-versions URL", () => {
      expect(
        parseCivitaiId("https://civitai.com/api/v1/model-versions/128713")
      ).toBe("128713");
    });

    it("should handle whitespace", () => {
      expect(parseCivitaiId("  128713  ")).toBe("128713");
    });

    it("should return null for invalid input", () => {
      expect(parseCivitaiId("not-a-number")).toBeNull();
    });

    it("should return null for empty string", () => {
      expect(parseCivitaiId("")).toBeNull();
    });

    it("should parse URL with extra path segments", () => {
      expect(
        parseCivitaiId("https://civitai.com/models/128713/some-model-name")
      ).toBe("128713");
    });
  });
});
