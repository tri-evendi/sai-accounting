/**
 * Gerbang "aplikasi belum disiapkan" (lib/setup-gate.ts).
 *
 * Yang dijaga di sini bukan sekadar "mengembalikan boolean yang benar",
 * melainkan tiga sifat yang kalau meleset akibatnya fatal dan sunyi:
 *
 *  1. **Latch satu arah.** `isSetup` adalah bendera sekali-jalan, jadi begitu
 *     terlihat `true` gerbang berhenti bertanya ke basis data selamanya. Kalau
 *     latch-nya bocor, setiap pemuatan halaman menambah satu query.
 *  2. **Fail-open.** DB bermasalah BUKAN berarti "belum disiapkan". Melempar
 *     seluruh pengguna ke layar penyiapan saat basis data sedang mati hanya
 *     menyembunyikan galat sebenarnya di balik pesan yang salah.
 *  3. **Tidak melatch `false`.** Justru inilah keadaan yang harus terus
 *     ditanyakan: pemasangan baru dimulai dengan `false`, dan begitu wizard
 *     selesai gerbangnya wajib membuka TANPA perlu restart container.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const isSetupComplete = vi.hoisted(() => vi.fn());

vi.mock("@/lib/opening-balance", () => ({ isSetupComplete }));
vi.mock("server-only", () => ({}));

import { isSetupDone, resetSetupLatchForTests } from "@/lib/setup-gate";

beforeEach(() => {
  resetSetupLatchForTests();
  isSetupComplete.mockReset();
});

describe("gerbang setup", () => {
  it("melaporkan belum siap saat wizard belum dijalankan", async () => {
    isSetupComplete.mockResolvedValue(false);
    await expect(isSetupDone()).resolves.toBe(false);
  });

  it("melaporkan siap setelah wizard selesai", async () => {
    isSetupComplete.mockResolvedValue(true);
    await expect(isSetupDone()).resolves.toBe(true);
  });

  it("berhenti bertanya ke basis data begitu setup selesai (latch)", async () => {
    isSetupComplete.mockResolvedValue(true);

    await isSetupDone();
    await isSetupDone();
    await isSetupDone();

    // Satu query saja untuk tiga pemuatan halaman: dalam keadaan normal —
    // sepanjang umur pemasangan setelah wizard — gerbang ini gratis.
    expect(isSetupComplete).toHaveBeenCalledTimes(1);
  });

  it("TIDAK melatch keadaan belum-siap, sehingga wizard langsung membuka gerbang", async () => {
    isSetupComplete.mockResolvedValue(false);
    await isSetupDone();
    await isSetupDone();
    expect(isSetupComplete).toHaveBeenCalledTimes(2);

    // Wizard selesai di tengah umur proses — tanpa restart.
    isSetupComplete.mockResolvedValue(true);
    await expect(isSetupDone()).resolves.toBe(true);
  });

  it("fail-open saat basis data bermasalah", async () => {
    isSetupComplete.mockRejectedValue(new Error("connection refused"));
    await expect(isSetupDone()).resolves.toBe(true);
  });

  it("kegagalan basis data tidak ikut ter-latch", async () => {
    isSetupComplete.mockRejectedValue(new Error("connection refused"));
    await isSetupDone();

    // Setelah DB pulih dan ternyata memang belum disiapkan, gerbang harus
    // kembali jujur — bukan terkunci pada jawaban darurat tadi.
    isSetupComplete.mockReset();
    isSetupComplete.mockResolvedValue(false);
    await expect(isSetupDone()).resolves.toBe(false);
  });
});
