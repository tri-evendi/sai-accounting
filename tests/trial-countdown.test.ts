/**
 * Hitung mundur uji coba — MURNI, dan alasannya komersial bukan kosmetik.
 *
 * Sejak uji coba menjadi uji coba paket PRO, hari terakhirnya tidak berakhir
 * dengan tagihan Rp 0 melainkan dengan TAGIHAN SUNGGUHAN. Satu-satunya
 * petunjuk sebelum ini adalah satu baris abu-abu berisi tanggal — kalimat yang
 * benar dan tidak memberi tahu apa pun tentang apa yang akan terjadi. Orang
 * tidak menghitung mundur tanggal; mereka membaca "berapa hari lagi".
 *
 * Yang dikunci di sini adalah dua keputusan yang mudah salah tanpa berbunyi:
 * PEMBULATAN (ke atas, supaya hari terakhir tidak pernah tampil sebagai nol)
 * dan AMBANG MENDESAK (kapan spanduknya berubah nada).
 */
import { describe, expect, it } from "vitest";

import { trialCountdown } from "@/lib/subscription-lifecycle";

const NOW = new Date("2026-08-04T10:00:00Z");
const DAY = 24 * 60 * 60 * 1000;

describe("trialCountdown", () => {
  it("tanpa tanggal berakhir → tidak ada hitung mundur", () => {
    expect(trialCountdown(null, NOW)).toBeNull();
    expect(trialCountdown(undefined, NOW)).toBeNull();
  });

  it("membulatkan KE ATAS — sisa setengah hari tetap '1 hari lagi', bukan nol", () => {
    // Menyebut nol sebelum harinya benar-benar lewat membuat pembacanya
    // mengira uji cobanya sudah habis padahal masih bisa dipakai.
    expect(trialCountdown(new Date(NOW.getTime() + DAY / 2), NOW)?.days).toBe(1);
    expect(trialCountdown(new Date(NOW.getTime() + DAY / 24), NOW)?.days).toBe(1);
  });

  it("hari penuh dihitung apa adanya", () => {
    expect(trialCountdown(new Date(NOW.getTime() + 14 * DAY), NOW)?.days).toBe(14);
    expect(trialCountdown(new Date(NOW.getTime() + 4 * DAY), NOW)?.days).toBe(4);
  });

  it("mendesak mulai 3 hari — tidak lebih awal, supaya nadanya tidak selalu menyala", () => {
    expect(trialCountdown(new Date(NOW.getTime() + 4 * DAY), NOW)?.urgent).toBe(false);
    expect(trialCountdown(new Date(NOW.getTime() + 3 * DAY), NOW)?.urgent).toBe(true);
    expect(trialCountdown(new Date(NOW.getTime() + DAY), NOW)?.urgent).toBe(true);
  });

  it("sudah lewat → hari <= 0 dan tetap mendesak", () => {
    const past = trialCountdown(new Date(NOW.getTime() - DAY), NOW);
    expect(past?.days).toBeLessThanOrEqual(0);
    expect(past?.urgent).toBe(true);
  });
});
