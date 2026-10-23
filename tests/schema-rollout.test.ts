/**
 * KEPUTUSAN fan-out migration buku (09 §6) — kapan rilis BERHENTI, sebagai
 * fungsi murni (`@sai/core/schema-version`) dan alarm-nya
 * (`decideMigrationsAlert`).
 *
 * Yang paling mahal di sini adalah dua kesalahan yang berlawanan arah:
 *   • terlalu KETAT — satu buku rusak menahan setiap `docker compose up -d`
 *     berikutnya (CMD image migrator dijalankan ulang lewat `depends_on`);
 *   • terlalu LONGGAR — migration yang rusak untuk SEMUA buku tetap
 *     meluncurkan image baru, yang lalu menutup setiap buku.
 */
import { describe, expect, it } from "vitest";

import { migrationsHealth, rolloutExitCode, rolloutStatus } from "@sai/core/schema-version";
import { decideMigrationsAlert } from "@/lib/health-watchdog";

describe("rolloutStatus", () => {
  it("nol gagal = ok, termasuk putaran yang hanya melewati", () => {
    expect(rolloutStatus({ atHead: 17, failed: 0 })).toBe("ok");
    expect(rolloutStatus({ atHead: 0, failed: 0 })).toBe("ok");
  });

  it("sebagian gagal = partial", () => {
    expect(rolloutStatus({ atHead: 16, failed: 1 })).toBe("partial");
  });

  it("putaran ULANG sesudah rilis parsial (16 dilewati, 1 masih gagal) tetap partial", () => {
    /* Kalau `error`, setiap `up -d` berikutnya tertahan oleh satu buku. */
    expect(rolloutStatus({ atHead: 16, failed: 1 })).toBe("partial");
  });

  it("tak satu buku pun di kepala = error — migration-nya yang rusak", () => {
    expect(rolloutStatus({ atHead: 0, failed: 17 })).toBe("error");
    expect(rolloutStatus({ atHead: 0, failed: 1 })).toBe("error");
  });
});

describe("rolloutExitCode", () => {
  it("strict: kegagalan apa pun = 1 (manusia, CI, dev)", () => {
    expect(rolloutExitCode("ok", "strict")).toBe(0);
    expect(rolloutExitCode("partial", "strict")).toBe(1);
    expect(rolloutExitCode("error", "strict")).toBe(1);
  });

  it("release: partial TIDAK menahan rilis, error tetap menahan", () => {
    expect(rolloutExitCode("ok", "release")).toBe(0);
    expect(rolloutExitCode("partial", "release")).toBe(0);
    expect(rolloutExitCode("error", "release")).toBe(1);
  });
});

describe("migrationsHealth", () => {
  const HEAD = "0003_x";
  it("tanpa putaran = unknown, bukan ok", () => {
    expect(migrationsHealth(null, HEAD)).toBe("unknown");
  });
  it("putaran untuk image LAMA = pending", () => {
    expect(migrationsHealth({ status: "ok", targetMigration: "0002_y" }, HEAD)).toBe("pending");
  });
  it.each(["ok", "partial", "error"] as const)("putaran untuk image ini: %s", (s) => {
    expect(migrationsHealth({ status: s, targetMigration: HEAD }, HEAD)).toBe(s);
  });
  it("status di luar kosakata = unknown", () => {
    expect(migrationsHealth({ status: "aneh", targetMigration: HEAD }, HEAD)).toBe("unknown");
  });
});

describe("decideMigrationsAlert", () => {
  const dasar = { expected: "0003_x", lastTarget: "0003_x", lastRunAt: "2026-10-23T00:00:00Z" };
  it.each(["ok", "unknown"] as const)("%s diam", (status) => {
    expect(decideMigrationsAlert({ ...dasar, status, failedSlugs: [] }).alert).toBe(false);
  });
  it("partial berbunyi dan menyebut bukunya + perintah lanjutannya", () => {
    const d = decideMigrationsAlert({ ...dasar, status: "partial", failedSlugs: ["pt-a"] });
    expect(d.alert).toBe(true);
    expect(d.body).toContain("pt-a");
    expect(d.body).toContain("db:migrate:release");
    expect(d.fingerprint).toBe("migrations:partial:0003_x");
  });
  it("pending berbunyi — fan-out rilis ini belum berjalan", () => {
    const d = decideMigrationsAlert({ ...dasar, status: "pending", lastTarget: "0002_y", failedSlugs: [] });
    expect(d.alert).toBe(true);
    expect(d.body).toContain("0002_y");
  });
});
