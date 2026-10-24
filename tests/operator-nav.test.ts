/**
 * MENU KONSOL OPERATOR — kelompok menurut pekerjaan.
 *
 * Yang dijaga: (1) setiap rute yang pernah ada di menu TETAP ada, persis
 * sekali — perapian menu tidak boleh menghilangkan halaman; (2) urutan &
 * kelompoknya seperti yang diputuskan; (3) butir pendaratan tetap `exact`
 * (kalau tidak ia menyala di setiap anak-rute); (4) tidak ada butir tanpa
 * kelompok — butir tanpa `group` diam-diam menumpang kelompok sebelumnya.
 */
import { describe, expect, it } from "vitest";

import { translate, type Dictionary } from "@sai/core/i18n/dictionary";
import id from "@sai/core/i18n/dictionaries/id.json";
import en from "@sai/core/i18n/dictionaries/en.json";
import zh from "@sai/core/i18n/dictionaries/zh.json";
import { operatorNav } from "@op/lib/operator/nav";

const navIn = (dict: unknown) =>
  operatorNav((key) => translate(dict as Dictionary, key));

describe("operatorNav — kelompok & urutan", () => {
  it("tujuh kelompok, urutan dan butirnya seperti yang diputuskan (id)", () => {
    const nav = navIn(id);
    const grouped: [string, string[]][] = [];
    for (const item of nav) {
      const last = grouped[grouped.length - 1];
      if (last && last[0] === item.group) last[1].push(item.label);
      else grouped.push([item.group ?? "", [item.label]]);
    }
    expect(grouped).toEqual([
      ["Ringkasan", ["Ringkasan"]],
      ["Pelanggan", ["Tenant", "Lisensi on-premise", "Permintaan penghapusan"]],
      ["Penjualan & tagihan", ["Katalog paket", "e-Faktur platform", "Rekonsiliasi"]],
      ["Halaman publik", ["Isi halaman depan", "Tampilan halaman depan", "Gambar & bukti sosial", "Logo produk"]],
      ["Komunikasi", ["Pengumuman status", "Surel"]],
      ["Sistem", ["Penjadwal", "Cadangan", "Kesesuaian data"]],
      ["Administrasi", ["Pengaturan", "Akun operator", "Jejak audit"]],
    ]);
  });

  it("setiap rute lama tetap ada, persis sekali", () => {
    const hrefs = navIn(id).map((i) => i.href);
    expect([...hrefs].sort()).toEqual(
      [
        "/",
        "/tenants",
        "/licences",
        "/deletions",
        "/plans",
        "/efaktur",
        "/reconciliation",
        "/content",
        "/landing",
        "/landing/media",
        "/brand",
        "/status-notices",
        "/mail",
        "/scheduler",
        "/backup",
        "/conformance",
        "/settings",
        "/accounts",
        "/audit",
      ].sort()
    );
  });

  it("butir pendaratan tetap `exact`; tidak ada butir tanpa kelompok", () => {
    const nav = navIn(id);
    expect(nav.find((i) => i.href === "/")?.exact).toBe(true);
    // `/landing` juga `exact`: `/landing/media` punya butirnya sendiri.
    expect(nav.filter((i) => i.href !== "/" && i.exact).map((i) => i.href)).toEqual(["/landing"]);
    expect(nav.filter((i) => !i.group).map((i) => i.href)).toEqual([]);
  });

  it("tidak ada kata Inggris 'Customer' di UI Indonesia; label en/zh terisi", () => {
    expect(navIn(id).map((i) => i.group)).not.toContain("Customer");
    for (const dict of [en, zh]) {
      for (const item of navIn(dict)) {
        expect(item.label).not.toMatch(/^operator\./);
        expect(item.group).not.toMatch(/^operator\./);
      }
    }
  });
});
