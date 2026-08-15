/**
 * Log terstruktur + peredam peringatan (issue #374).
 *
 * Keputusan pemiliknya adalah log terstruktur + surel, BUKAN vendor pelacak
 * galat. Pilihan itu memindahkan beban: tanpa dasbor, tidak ada pengelompokan
 * dan tidak ada riwayat, jadi dua hal harus benar-benar bekerja — bentuk yang
 * bisa diagregasi mesin, dan peredam yang menjaga kotak masuk tetap layak
 * dibaca. Keduanya yang dikunci di sini.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { REDACTED, formatLogLine } from "@/lib/log";
import { alertFingerprint } from "@/lib/alert";

const now = new Date("2026-08-15T10:30:00.000Z");

describe("formatLogLine", () => {
  it("selalu membawa ts, level, dan event — tiga bidang yang disaring orang", () => {
    expect(formatLogLine("error", "audit.write_failed", {}, undefined, now)).toMatchObject({
      ts: "2026-08-15T10:30:00.000Z",
      level: "error",
      event: "audit.write_failed",
    });
  });

  it("konteks ikut apa adanya", () => {
    const line = formatLogLine("warn", "x", { tenantId: 7, slug: "pt-anu", ok: false }, undefined, now);
    expect(line).toMatchObject({ tenantId: 7, slug: "pt-anu", ok: false });
  });

  it("konteks TIDAK BISA menimpa bidang bakunya", () => {
    // Peristiwa yang bisa menulis ulang levelnya sendiri membuat penyaringan
    // `grep '"level":"error"'` berbohong.
    const line = formatLogLine(
      "error",
      "nyata",
      { level: "info", event: "palsu", ts: "kemarin" } as never,
      undefined,
      now
    );
    expect(line.level).toBe("error");
    expect(line.event).toBe("nyata");
    expect(line.ts).toBe("2026-08-15T10:30:00.000Z");
  });

  it("galat diurai jadi nama, pesan, dan jejak yang dipangkas", () => {
    const line = formatLogLine("error", "x", {}, new TypeError("gagal urai"), now);
    expect(line.errorName).toBe("TypeError");
    expect(line.errorMessage).toBe("gagal urai");
    expect(String(line.errorStack).split("|").length).toBeLessThanOrEqual(6);
  });

  it("yang dilempar bukan Error tetap terbaca", () => {
    expect(formatLogLine("error", "x", {}, "string telanjang", now).errorMessage).toBe(
      "string telanjang"
    );
  });

  it("satu baris = satu JSON yang sah", () => {
    const line = formatLogLine("info", "x", { a: 1 }, undefined, now);
    expect(JSON.stringify(line)).not.toContain("\n");
    expect(JSON.parse(JSON.stringify(line)).event).toBe("x");
  });
});

describe("redaksi log", () => {
  it("kunci bernuansa rahasia dibuang, apa pun bentuk namanya", () => {
    const line = formatLogLine(
      "error",
      "x",
      {
        password: "rahasia",
        passwordHash: "$2b$12$...",
        newPassword: "rahasia2",
        AUTH_SECRET: "abc",
        sessionToken: "xyz",
        authorization: "Bearer abc",
        apiKey: "k",
        BACKUP_ENCRYPTION_KEY: "kunci",
      },
      undefined,
      now
    );
    for (const key of Object.keys(line)) {
      if (["ts", "level", "event"].includes(key)) continue;
      expect(line[key], `${key} tidak disunting`).toBe(REDACTED);
    }
  });

  it("kunci biasa tidak ikut disunting", () => {
    const line = formatLogLine("info", "x", { email: "a@b.test", tenantId: 3 }, undefined, now);
    expect(line.email).toBe("a@b.test");
    expect(line.tenantId).toBe(3);
  });
});

describe("peredam peringatan", () => {
  it("sidik jari TIDAK memuat pesan galat", () => {
    // Pesan sering memuat id yang berbeda tiap kejadian; sidik jari yang ikut
    // berubah menghasilkan ember baru setiap kali — yaitu tidak ada peredaman
    // sama sekali, dengan tampilan seolah ada.
    const a = alertFingerprint("audit.write_failed", new Error("baris #1 gagal"));
    const b = alertFingerprint("audit.write_failed", new Error("baris #2 gagal"));
    expect(a).toBe(b);
  });

  it("peristiwa berbeda diredam terpisah", () => {
    expect(alertFingerprint("a", new Error("x"))).not.toBe(alertFingerprint("b", new Error("x")));
  });

  it("jenis galat berbeda diredam terpisah", () => {
    expect(alertFingerprint("a", new TypeError("x"))).not.toBe(
      alertFingerprint("a", new RangeError("x"))
    );
  });
});

describe("jalur yang menelan galat kini mengetuk pintu (#374)", () => {
  const read = (...p: string[]) => readFileSync(join(process.cwd(), ...p), "utf8");

  it("surel verifikasi yang gagal terkirim", () => {
    // Pendaftar tidak melihat apa pun yang salah — ia hanya tidak pernah
    // menerima tautannya, lalu pergi.
    expect(read("src", "app", "api", "auth", "register", "route.ts")).toContain(
      'reportError("register.verification_mail_failed"'
    );
  });

  it("langganan pertama yang gagal lahir", () => {
    expect(read("src", "app", "api", "auth", "verify-email", "route.ts")).toContain(
      'reportError("verify_email.initial_subscription_failed"'
    );
  });

  it("jejak audit yang gagal ditulis", () => {
    // Tindakan yang terjadi tanpa meninggalkan jejak adalah persis keadaan yang
    // jejak audit ada untuk mencegahnya.
    expect(read("src", "lib", "audit.ts")).toContain('reportError("audit.write_failed"');
  });

  it("peringatan tidak pernah bisa memanggil dirinya sendiri", () => {
    // Komentar dilucuti: berkas itu MENJELASKAN kenapa `logError` tidak dipakai
    // di sana, dan penjelasannya bukan pemanggilan.
    const alert = read("src", "lib", "alert.ts")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    const tail = alert.slice(alert.lastIndexOf("catch"));
    // Satu-satunya jalan yang tidak bisa kembali ke sini.
    expect(tail).toContain("console.error");
    expect(tail).not.toContain("logError");
    expect(tail).not.toContain("reportError");
  });

  it("peredamnya memakai penghitung persisten, bukan mekanisme kedua", () => {
    const alert = read("src", "lib", "alert.ts");
    expect(alert).toContain("checkPersistentRateLimit");
    expect(alert).toContain("maxAttempts: 1");
  });
});
