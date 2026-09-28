import { afterEach, describe, expect, it, vi } from "vitest";
import { type Connection, extractRecentAddresses, fetchConnections } from "../recentConnections";

const ADDR_A = "0xD37888F19e669874cfcCF519bf267280d70498C7";
const ADDR_B = "0x70f11443F009f374EBAE23Ce4f8029774c30F0e9";
const ADDR_C = "0x314ab97b76e39d63c78d5c86c2daf8eaa306b182";

const LIVE_SAMPLE: Connection[] = [
  { address: ADDR_A, timestamp: "2026-09-28T18:39:46.479Z" },
  { address: ADDR_B, timestamp: "2026-09-28T18:41:44.690Z" },
];

const SINCE = new Date("2026-09-28T18:00:00.000Z");
const UNTIL = new Date("2026-09-28T19:00:00.000Z");

describe("extractRecentAddresses", () => {
  it("returns lowercased addresses from the live API sample", () => {
    const result = extractRecentAddresses(LIVE_SAMPLE, SINCE, UNTIL);

    expect(result.valid).toEqual([ADDR_A.toLowerCase(), ADDR_B.toLowerCase()]);
    expect(result.invalid).toEqual([]);
  });

  it("returns empty lists for empty input", () => {
    expect(extractRecentAddresses([], SINCE, UNTIL)).toEqual({ valid: [], invalid: [] });
  });

  it("includes entries exactly at since and until (inclusive boundaries)", () => {
    const connections: Connection[] = [
      { address: ADDR_A, timestamp: SINCE.toISOString() },
      { address: ADDR_B, timestamp: UNTIL.toISOString() },
    ];
    const result = extractRecentAddresses(connections, SINCE, UNTIL);

    expect(result.valid).toEqual([ADDR_A.toLowerCase(), ADDR_B.toLowerCase()]);
  });

  it("excludes entries before since and after until", () => {
    const connections: Connection[] = [
      { address: ADDR_A, timestamp: "2026-09-28T17:59:59.999Z" },
      { address: ADDR_B, timestamp: "2026-09-28T19:00:00.001Z" },
      { address: ADDR_C, timestamp: "2026-09-28T18:30:00.000Z" },
      { address: "not-an-address", timestamp: "2026-09-27T18:30:00.000Z" },
    ];
    const result = extractRecentAddresses(connections, SINCE, UNTIL);

    expect(result.valid).toEqual([ADDR_C]);
    expect(result.invalid).toEqual([]);
  });

  it("has no upper bound when until is omitted (tolerates client clock behind server)", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-28T18:40:00.000Z"));
    try {
      const result = extractRecentAddresses(LIVE_SAMPLE, SINCE);
      expect(result.valid).toEqual(LIVE_SAMPLE.map(({ address }) => address.toLowerCase()));
    } finally {
      vi.useRealTimers();
    }
  });

  it("dedupes checksummed and lowercase variants of the same address", () => {
    const connections: Connection[] = [
      { address: ADDR_A, timestamp: "2026-09-28T18:10:00.000Z" },
      { address: ADDR_A.toLowerCase(), timestamp: "2026-09-28T18:20:00.000Z" },
      { address: ADDR_A, timestamp: "2026-09-28T18:30:00.000Z" },
      { address: ADDR_B, timestamp: "2026-09-28T18:40:00.000Z" },
    ];
    const result = extractRecentAddresses(connections, SINCE, UNTIL);

    expect(result.valid).toEqual([ADDR_A.toLowerCase(), ADDR_B.toLowerCase()]);
  });

  it("accepts a whitespace-padded valid address after trimming", () => {
    const connections: Connection[] = [{ address: `  ${ADDR_A}\n`, timestamp: "2026-09-28T18:10:00.000Z" }];
    const result = extractRecentAddresses(connections, SINCE, UNTIL);

    expect(result.valid).toEqual([ADDR_A.toLowerCase()]);
    expect(result.invalid).toEqual([]);
  });

  it("puts invalid addresses in invalid and dedupes them", () => {
    const tooShort = "0xD37888F19e669874cfcCF519bf267280d70498";
    const nonHex = "0xZZ7888F19e669874cfcCF519bf267280d70498C7";
    const badChecksum = "0xd37888F19e669874cfcCF519bf267280d70498C7";
    const ts = "2026-09-28T18:10:00.000Z";
    const connections: Connection[] = [
      { address: tooShort, timestamp: ts },
      { address: nonHex, timestamp: ts },
      { address: badChecksum, timestamp: ts },
      { address: "", timestamp: ts },
      { address: tooShort, timestamp: "2026-09-28T18:20:00.000Z" },
      { address: "", timestamp: "2026-09-28T18:20:00.000Z" },
      { address: ADDR_B, timestamp: ts },
    ];
    const result = extractRecentAddresses(connections, SINCE, UNTIL);

    expect(result.valid).toEqual([ADDR_B.toLowerCase()]);
    expect(result.invalid).toEqual([tooShort, nonHex, badChecksum, ""]);
  });

  it("skips entries with unparseable timestamps", () => {
    const connections: Connection[] = [
      { address: ADDR_A, timestamp: "not a date" },
      { address: "garbage", timestamp: "" },
      { address: ADDR_B, timestamp: "2026-09-28T18:41:44.690Z" },
    ];
    const result = extractRecentAddresses(connections, SINCE, UNTIL);

    expect(result.valid).toEqual([ADDR_B.toLowerCase()]);
    expect(result.invalid).toEqual([]);
  });
});

describe("fetchConnections", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const jsonResponse = (body: unknown, init?: ResponseInit) =>
    new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" }, ...init });

  it("returns the parsed array", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse(LIVE_SAMPLE));

    const result = await fetchConnections("https://example.test/listConnections");

    expect(result).toEqual(LIVE_SAMPLE);
    expect(fetchSpy).toHaveBeenCalledWith("https://example.test/listConnections", { signal: undefined });
  });

  it("passes the abort signal to fetch", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse([]));
    const controller = new AbortController();

    await fetchConnections("/api/listConnections", controller.signal);

    expect(fetchSpy).toHaveBeenCalledWith("/api/listConnections", { signal: controller.signal });
  });

  it("drops malformed entries", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse([
        LIVE_SAMPLE[0],
        null,
        "0x70f11443F009f374EBAE23Ce4f8029774c30F0e9",
        42,
        { address: ADDR_B },
        { timestamp: "2026-09-28T18:41:44.690Z" },
        { address: 123, timestamp: "2026-09-28T18:41:44.690Z" },
        { address: ADDR_B, timestamp: 1790620904690 },
        [],
        LIVE_SAMPLE[1],
      ]),
    );

    const result = await fetchConnections("/api/listConnections");

    expect(result).toEqual(LIVE_SAMPLE);
  });

  it("throws on a non-ok status", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("oops", { status: 502, statusText: "Bad Gateway" }));

    await expect(fetchConnections("/api/listConnections")).rejects.toThrow(
      "Failed to fetch connections: 502 Bad Gateway",
    );
  });

  it("throws when the JSON is not an array", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse({ connections: LIVE_SAMPLE }));

    await expect(fetchConnections("/api/listConnections")).rejects.toThrow(
      "Unexpected connections response: expected an array",
    );
  });

  it("propagates fetch rejections (e.g. abort)", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new DOMException("Aborted", "AbortError"));

    await expect(fetchConnections("/api/listConnections")).rejects.toThrow("Aborted");
  });
});
