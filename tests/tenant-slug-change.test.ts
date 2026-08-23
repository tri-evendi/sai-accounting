/**
 * Ganti ALAMAT akun (issue #458 lingkup 3–4).
 *
 * Yang dijaga bukan tampilannya melainkan tiga janji yang, kalau dilanggar,
 * tidak berbunyi sampai ada pelanggan yang tautannya mendarat di tempat yang
 * salah:
 *
 *  1. slug lama TIDAK PERNAH dilepas untuk akun lain;
 *  2. alamat lama tetap sampai — dan HANYA bagi anggota akun itu;
 *  3. pagar 30 hari berdiri di server, bukan di layar.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  JEDA_GANTI_SLUG_HARI,
  SLUG_TERLARANG,
  bolehGantiLagi,
  tolakGantiSlug,
} from "@/lib/tenant-slug";

const ROOT = join(__dirname, "..");
const baca = (p: string) => readFileSync(join(ROOT, p), "utf8");

const DASAR = {
  slugSekarang: "tri-evendi",
  slugChangedAt: null,
  sudahDipakai: false,
};

describe("aturan ganti slug — keputusan murni", () => {
  it("menerima slug yang wajar", () => {
    expect(tolakGantiSlug({ ...DASAR, slugBaru: "movin-nusantara" })).toBeNull();
  });

  it("menolak bentuk yang tidak sah", () => {
    /* `-movin`/`movin-` LOLOS pola bersama (`isValidSlug`) — pola itu dipakai
       juga untuk membaca jalur. Yang menolaknya di sini adalah aturan yang
       lebih ketat untuk slug yang sedang DIBUAT; lihat `tolakGantiSlug`. */
    for (const buruk of ["Movin Nusantara", "movin_nusantara", "-movin", "movin-", "mo--vin", "m", "a".repeat(51)]) {
      expect(tolakGantiSlug({ ...DASAR, slugBaru: buruk }), buruk).toBe("bentuk");
    }
  });

  it("menolak slug yang bisa dipakai menyamar sebagai kami", () => {
    /* Bukan karena bentrok rute — slug akun hidup di bawah `/t/`. Alasannya
       penyamaran: tautan dari akun bernama `support` terbaca seperti tautan
       dari kami. */
    for (const nama of ["admin", "support", "billing", "operator"]) {
      expect(SLUG_TERLARANG).toContain(nama);
      expect(tolakGantiSlug({ ...DASAR, slugBaru: nama }), nama).toBe("terlarang");
    }
  });

  it("menolak slug yang sudah dipakai ATAU pernah dipakai", () => {
    /* "Pernah dipakai" ikut ditolak: slug lama yang bisa diambil orang berarti
       tautan lama yang mendarat di buku MILIK ORANG LAIN. */
    expect(tolakGantiSlug({ ...DASAR, slugBaru: "toko-maju", sudahDipakai: true })).toBe("dipakai");
  });

  it("menolak slug yang sama dengan yang sekarang", () => {
    expect(tolakGantiSlug({ ...DASAR, slugBaru: DASAR.slugSekarang })).toBe("sama");
  });

  it(`menahan penggantian kedua di dalam ${JEDA_GANTI_SLUG_HARI} hari`, () => {
    const now = new Date("2026-09-01T00:00:00Z");
    const baruSaja = new Date("2026-08-25T00:00:00Z");
    const lama = new Date("2026-07-01T00:00:00Z");

    expect(
      tolakGantiSlug({ ...DASAR, slugBaru: "movin", slugChangedAt: baruSaja, now })
    ).toBe("terlalu-sering");
    expect(tolakGantiSlug({ ...DASAR, slugBaru: "movin", slugChangedAt: lama, now })).toBeNull();
  });

  it("`bolehGantiLagi` menyebut TANGGALNYA, bukan sekadar menolak", () => {
    expect(bolehGantiLagi(null)).toBeNull();
    const baruSaja = new Date(Date.now() - 1000);
    const kapan = bolehGantiLagi(baruSaja);
    expect(kapan).not.toBeNull();
    expect(kapan!.getTime()).toBeGreaterThan(Date.now());
    /* Sudah lewat = tidak terkunci lagi, bukan terkunci selamanya. */
    expect(bolehGantiLagi(new Date(Date.now() - (JEDA_GANTI_SLUG_HARI + 1) * 86400000))).toBeNull();
  });
});

describe("penulisan & pemantulan", () => {
  const lib = baca("src/lib/tenant-slug.ts");
  const route = baca("src/lib/company-route.ts");

  it("slug lama dicatat DAN slug baru dipasang dalam SATU transaksi", () => {
    /* Urutan terbalik (pasang dulu, catat belakangan) meninggalkan lubang di
       mana alamat lama sudah mati tetapi belum tercatat milik siapa pun — dan
       di lubang itu ia bisa diambil orang. */
    expect(lib).toContain("controlDb.$transaction");
    const transaksi = lib.slice(lib.indexOf("controlDb.$transaction"));
    expect(transaksi.indexOf("tenantSlugHistory.create")).toBeLessThan(
      transaksi.indexOf("tenant.update")
    );
  });

  it("alamat lama dipantulkan HANYA bagi anggota akun itu", () => {
    /*
     * Tanpa syarat keanggotaan, siapa pun bisa menukar-nukar slug untuk
     * memetakan "akun lama X kini bernama Y" — kebocoran yang tidak terlihat
     * sebagai kebocoran, dan yang membatalkan alasan 404 di sini ditulis
     * seragam sejak awal.
     */
    expect(route).toContain("tenantIdUntukSlugLama");
    const blok = route.slice(route.indexOf("tenantIdUntukSlugLama"));
    expect(blok).toContain("aktor?.tenantId === tenantIdLama");
    expect(blok).toContain('reason: "moved"');
  });

  it("pantulannya PERMANEN, dan ke halaman yang sama — bukan ke beranda", () => {
    const guard = baca("src/lib/page-auth.ts");
    expect(guard).toContain("permanentRedirect");
    /* Jalur dalamnya datang dari header yang dititipkan proxy; tanpa itu satu-
       satunya pantulan yang mungkin adalah "kembali ke beranda", yang mengubah
       bookmark ke sebuah faktur menjadi kunjungan ke dasbor. */
    expect(guard).toContain('"x-sai-path"');

    const proxy = baca("src/proxy.ts");
    expect(proxy).toContain('headers.set("x-sai-path"');
    /* Ditulis ULANG, tidak pernah dipercaya dari luar: nilai kiriman klien
       akan mengubah tujuan pantulan menjadi alamat pilihan penyerang. */
    expect(proxy).toContain("new Headers(request.headers)");
  });
});

describe("satu penulis untuk pelanggan MAUPUN operator", () => {
  it("route dan skrip operator sama-sama lewat `renameTenantSlug`", () => {
    /* Skrip yang menulis langsung ke tabel akan melewati pemesanan slug lama —
       dan slug lama yang tidak terpesan berarti tautan lama yang suatu hari
       mendarat di buku milik orang lain. */
    for (const berkas of [
      "src/app/api/tenant/slug/route.ts",
      "scripts/rename-tenant-slug.ts",
    ]) {
      const kode = baca(berkas);
      expect(kode, `${berkas} tidak memakai penulis bersama`).toContain("renameTenantSlug");
      /* `[\s\S]` dan bukan flag `s`: target tsconfig repo ini di bawah es2018,
         jadi flag itu ditolak `tsc` (TS1501). */
      expect(kode, `${berkas} menulis slug tenant langsung`).not.toMatch(
        /tenant\.update\([\s\S]*?data:\s*\{[^}]*slug:/
      );
    }
  });

  it("keduanya dijaga izin & tercatat di jejak audit", () => {
    const route = baca("src/app/api/tenant/slug/route.ts");
    expect(route).toContain('requireTenantApiPermission("tenant.settings")');
    expect(route).toContain('action: "tenant.slug.change"');
    /* Jejaknya ditulis ke berkas slug LAMA: di sanalah riwayat akun ini berada,
       dan memindahkannya memutus riwayat tepat di peristiwa yang paling perlu
       bisa ditelusuri. */
    expect(route).toContain("tenantSlug: hasil.slugLama");
  });

  it("skrip operator tidak punya jalan pintas melewati pagar 30 hari", () => {
    /* Komentar dibuang lebih dulu: berkas itu MENJELASKAN kenapa jalan pintas
       tidak ada, dan penjaga yang merah karena penjelasannya sendiri akan
       dilonggarkan pada perubahan berikutnya. */
    const skrip = baca("scripts/rename-tenant-slug.ts").replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
    expect(skrip).not.toMatch(/--paksa|--force|--lewati/i);
  });
});
