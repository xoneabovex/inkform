import { afterEach, describe, expect, it, vi } from "vitest";
import { checkApiConnections } from "../api/connection-check";

afterEach(() => vi.unstubAllGlobals());
describe("read-only connection checks", () => {
  it("skips missing keys without sending requests", async () => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    expect(
      (await checkApiConnections({})).every((r) => r.status === "missing"),
    ).toBe(true);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("authenticates only against each key's provider and never generates", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ username: "test" })));
    vi.stubGlobal("fetch", fetcher);
    const results = await checkApiConnections({
      replicateApiToken: " test-token ",
    });
    expect(results[0].status).toBe("verified");
    expect(fetcher).toHaveBeenCalledWith(
      "https://api.replicate.com/v1/account",
      expect.objectContaining({
        headers: {
          Accept: "application/json",
          Authorization: "Bearer test-token",
        },
      }),
    );
    expect(fetcher.mock.calls[0][1].method).toBeUndefined();
    expect(JSON.stringify(results)).not.toContain("test-token");
  });
  it.each([401, 403, 429, 500])(
    "reports HTTP %s without echoing response secrets",
    async (status) => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(new Response("private-key", { status })),
      );
      const [result] = await checkApiConnections({
        replicateApiToken: "private-key",
      });
      expect(result.status).toBe(status === 401 ? "rejected" : "unverified");
      expect(JSON.stringify(result)).not.toContain("private-key");
    },
  );
  it("does not confuse an HTML success page with valid authentication", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("<html>Blocked</html>")),
    );
    expect(
      (await checkApiConnections({ replicateApiToken: "test" }))[0].status,
    ).toBe("unverified");
  });
  it("distinguishes RunPod authentication from a missing endpoint", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("[]")));
    const r = (await checkApiConnections({ runpodApiKey: "test" })).find(
      (r) => r.provider === "RunPod",
    )!;
    expect(r.status).toBe("verified");
    expect(r.message).toContain("endpoint is still needed");
  });
});
