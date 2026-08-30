import { beforeEach, describe, expect, it, vi } from "vitest";
import { prepareImageInput } from "../api/image-input";

const mocks = vi.hoisted(() => ({
  readAsStringAsync: vi.fn().mockResolvedValue("aW5rZm9ybQ=="),
}));

vi.mock("expo-file-system/legacy", () => ({
  EncodingType: { Base64: "base64" },
  readAsStringAsync: mocks.readAsStringAsync,
}));

vi.mock("react-native", () => ({ Platform: { OS: "android" } }));

describe("prepareImageInput", () => {
  beforeEach(() => vi.clearAllMocks());

  it("leaves hosted and data images unchanged", async () => {
    await expect(
      prepareImageInput("https://example.com/reference.png"),
    ).resolves.toBe("https://example.com/reference.png");
    await expect(prepareImageInput("data:image/png;base64,abc")).resolves.toBe(
      "data:image/png;base64,abc",
    );
  });

  it("converts a phone file URI into an API-safe data URI", async () => {
    await expect(
      prepareImageInput("file:///data/user/0/inkform/reference.png"),
    ).resolves.toBe("data:image/png;base64,aW5rZm9ybQ==");

    expect(mocks.readAsStringAsync).toHaveBeenCalledWith(
      "file:///data/user/0/inkform/reference.png",
      { encoding: "base64" },
    );
  });
});
