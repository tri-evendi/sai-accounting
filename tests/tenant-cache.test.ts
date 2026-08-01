/**
 * TenantKeyedCache (issue #137) — aturan cache #104 diperluas ke tenant.
 *
 * Yang dikunci di sini adalah sifat yang membuat cache platform AMAN dipakai
 * satu proses untuk banyak tenant bergantian: nilai milik tenant A tidak
 * pernah terbaca sebagai milik tenant B, TTL benar-benar mengakhiri hidup
 * sebuah entri, dan invalidasi hanya mengenai tenant yang dimaksud.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TenantKeyedCache } from "@/lib/tenant-cache";

describe("TenantKeyedCache", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("memisahkan nilai per tenant — milik A tidak pernah terbaca untuk B", () => {
    const cache = new TenantKeyedCache<string>(60_000);
    cache.set(1, "paket-A");
    cache.set(2, "paket-B");

    expect(cache.get(1)).toBe("paket-A");
    expect(cache.get(2)).toBe("paket-B");
    expect(cache.get(3)).toBeUndefined();
  });

  it("entri mati setelah TTL lewat", () => {
    const cache = new TenantKeyedCache<string>(60_000);
    cache.set(1, "trialing");

    vi.advanceTimersByTime(59_999);
    expect(cache.get(1)).toBe("trialing");

    vi.advanceTimersByTime(1);
    expect(cache.get(1)).toBeUndefined();
  });

  it("invalidate hanya membuang tenant yang dimaksud", () => {
    const cache = new TenantKeyedCache<string>(60_000);
    cache.set(1, "active");
    cache.set(2, "past_due");

    cache.invalidate(1);

    expect(cache.get(1)).toBeUndefined();
    expect(cache.get(2)).toBe("past_due");
  });

  it("set menimpa nilai lama dan menyegarkan TTL", () => {
    const cache = new TenantKeyedCache<string>(60_000);
    cache.set(1, "trialing");

    vi.advanceTimersByTime(50_000);
    cache.set(1, "active");

    vi.advanceTimersByTime(50_000); // 100 dtk sejak set pertama, 50 sejak kedua
    expect(cache.get(1)).toBe("active");
  });

  it("clear mengosongkan semuanya", () => {
    const cache = new TenantKeyedCache<string>(60_000);
    cache.set(1, "a");
    cache.set(2, "b");

    cache.clear();

    expect(cache.get(1)).toBeUndefined();
    expect(cache.get(2)).toBeUndefined();
  });
});
