/**
 * `lib/contact-channels.ts` (#398) — kanal kontak dibaca dari environment,
 * dan yang tidak diisi / salah bentuk TIDAK pernah keluar sebagai tautan.
 */
import { describe, expect, it } from "vitest";

import {
  WHATSAPP_NUMBER_PATTERN,
  contactChannels,
  parseWhatsappNumber,
  whatsappUrl,
} from "@/lib/contact-channels";

describe("contactChannels", () => {
  it("kosong = kosong: tidak ada kanal yang dikarang", () => {
    expect(contactChannels({})).toEqual({});
    expect(
      contactChannels({ PLATFORM_CONTACT_EMAIL: "  ", PLATFORM_CONTACT_WHATSAPP: "" }),
    ).toEqual({});
  });

  it("surel di-trim, WhatsApp menjadi URL wa.me", () => {
    expect(
      contactChannels({
        PLATFORM_CONTACT_EMAIL: " sales@contoh.co.id ",
        PLATFORM_CONTACT_WHATSAPP: " 6281234567890 ",
      }),
    ).toEqual({
      email: "sales@contoh.co.id",
      whatsappUrl: "https://wa.me/6281234567890",
    });
  });

  it("nomor yang salah bentuk diperlakukan seperti tidak diisi", () => {
    // Nol awal, tanda plus, spasi, terlalu pendek, huruf: semuanya bukan
    // bentuk yang diterima wa.me — tautan ke nomor seperti itu membuka
    // WhatsApp lalu berkata "nomor tidak ditemukan".
    for (const salah of ["081234567890", "+6281234567890", "62 812 3456", "62812", "62812abc"]) {
      expect(parseWhatsappNumber(salah), salah).toBeUndefined();
      expect(contactChannels({ PLATFORM_CONTACT_WHATSAPP: salah })).toEqual({});
    }
  });

  it("pola & URL-nya konsisten dengan yang dipakai scripts/check-env.mjs", () => {
    expect(WHATSAPP_NUMBER_PATTERN.test("6281234567890")).toBe(true);
    expect(WHATSAPP_NUMBER_PATTERN.test("1234567")).toBe(true); // 7 digit, batas bawah
    expect(WHATSAPP_NUMBER_PATTERN.test("1234567890123456")).toBe(false); // 16 digit
    expect(whatsappUrl("6281234567890")).toBe("https://wa.me/6281234567890");
  });
});
