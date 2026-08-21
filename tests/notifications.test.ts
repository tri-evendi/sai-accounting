/**
 * Pusat pemberitahuan (issue #416, tindak lanjut).
 *
 * Yang diuji di sini adalah ATURAN yang menentukan apakah kabar sampai dan
 * apakah ia mengomel: tahap pengingat, kunci idempotensi, dan bentuk kosakata.
 * Jalur basis datanya sendiri dijaga constraint `@@unique` — yang tidak bisa
 * ditiru tes tanpa DB, dan justru karena itu tidak dipalsukan di sini.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { NOTIFICATION_KINDS } from "@/lib/notifications";
import { tahapUntuk } from "../scripts/notify-pending-setup";

describe("tahap pengingat penyiapan", () => {
  it("diam pada hari pertama — perusahaan baru memang belum disiapkan", () => {
    expect(tahapUntuk(0)).toBeNull();
  });

  it("berbunyi mulai H+1", () => {
    expect(tahapUntuk(1)).toBe(1);
    expect(tahapUntuk(2)).toBe(1);
  });

  it("naik tahap di H+3, H+7, dan H+14", () => {
    expect(tahapUntuk(3)).toBe(3);
    expect(tahapUntuk(6)).toBe(3);
    expect(tahapUntuk(7)).toBe(7);
    expect(tahapUntuk(13)).toBe(7);
    expect(tahapUntuk(14)).toBe(14);
  });

  it("berhenti di tahap terakhir — tidak mengomel selamanya", () => {
    /* Tahap yang terus bertambah berarti kunci dedupe yang selalu baru, dan
       pemberitahuan baru setiap hari sampai akhir zaman. */
    expect(tahapUntuk(30)).toBe(14);
    expect(tahapUntuk(365)).toBe(14);
  });

  it("satu perusahaan menerima paling banyak empat kabar", () => {
    const tahap = new Set(
      Array.from({ length: 400 }, (_, hari) => tahapUntuk(hari)).filter((t) => t !== null)
    );
    expect(tahap.size).toBe(4);
  });
});

describe("kosakata jenis pemberitahuan", () => {
  it("memuat jenis yang benar-benar diterbitkan produser", () => {
    const source = readFileSync(join(process.cwd(), "scripts/notify-pending-setup.ts"), "utf8");
    const dipakai = [...source.matchAll(/kind: "([a-z_]+)"/g)].map((m) => m[1]);

    expect(dipakai.length).toBeGreaterThan(0);
    for (const kind of dipakai) {
      expect(NOTIFICATION_KINDS as readonly string[]).toContain(kind);
    }
  });

  it("jenisnya snake_case — konvensi enum-like docs/DATABASE.md", () => {
    for (const kind of NOTIFICATION_KINDS) expect(kind).toMatch(/^[a-z][a-z_]*$/);
  });
});

describe("kunci idempotensi produser", () => {
  const source = readFileSync(join(process.cwd(), "scripts/notify-pending-setup.ts"), "utf8");

  it("membawa id perusahaan DAN tahapnya", () => {
    /* Tanpa tahap, hanya kabar pertama yang pernah terbit; tanpa id perusahaan,
       satu kabar membungkam seluruh perusahaan milik pengguna yang sama. */
    expect(source).toMatch(/dedupeKey = `company:\$\{company\.id\}:d\$\{tahap\}`/);
  });

  it("memakai skipDuplicates, bukan menangkap galat unik", () => {
    expect(source).toContain("skipDuplicates: true");
  });
});
