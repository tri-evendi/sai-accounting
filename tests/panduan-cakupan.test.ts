/**
 * Penjaga cakupan PANDUAN — Alur Kerja & Tur Berpandu.
 *
 * ══ Kenapa penjaga ini ada ═════════════════════════════════════════════════
 * Aplikasi ini punya TIGA permukaan panduan, bukan satu: halaman `/docs`,
 * panel Alur Kerja di Beranda, dan Tur Berpandu. Hanya yang pertama pernah
 * dijaga (`tests/docs.test.ts`, #300) — dan gagasan di balik penjaga itu,
 * "sebuah modul tidak boleh lahir DIAM-DIAM tanpa panduan", tidak pernah
 * dibawa ke dua permukaan lainnya.
 *
 * Akibatnya terukur, bukan hipotetis. Modul Manufaktur (#495) lahir dengan
 * tiga layar, izinnya sendiri, kategori usahanya sendiri, dan halaman
 * dokumennya — lalu berdiri NOL di panel Alur Kerja dan NOL di Tur, dan tidak
 * satu tes pun berubah warna. Yang lebih buruk: `tests/tours.test.ts` justru
 * MEMAKU daftar tur yang ada ("tersedia untuk beranda, persetujuan, buat
 * tagihan, dan pusat laporan"). Tes itu potret keadaan, bukan penjaga — ia
 * merah kalau tur DIHAPUS dan diam saja kalau modul ditambah.
 *
 * ══ Apa yang dijaga, dan apa yang TIDAK ════════════════════════════════════
 * BUKAN "setiap modul punya panduan" — tuntutan itu tidak akan pernah benar
 * dan penjaga yang menuntutnya akan dilonggarkan sampai tak berarti. Yang
 * dijaga: setiap modul entah DISEBUT sebuah panduan, entah berdiri di peta
 * pengecualian dengan ALASAN TERTULIS. Menambah modul memaksa satu keputusan
 * di tempat yang terlihat di diff.
 *
 * Dijaga DUA ARAH, seperti #300 dan penjaga kunci yatim (#260): pengecualian
 * yang sudah tidak berlaku ikut merah, supaya daftar alasan tidak menjadi
 * arsip alasan basi.
 *
 * ⚠ Sudah dilihat MERAH sebelum dianggap selesai: dijalankan saat delapan
 * modul belum punya alur (hanya penjualan/pembelian/tutup_buku yang ada), dan
 * ia menyebut kedelapan namanya.
 */
import { describe, expect, it } from "vitest";

import { BUSINESS_MODULES, type BusinessModule } from "@/lib/business-modules";
import {
  MODUL_TANPA_ALUR,
  WORKFLOWS,
  modulBeralur,
  modulTanpaPanduan,
} from "@/lib/workflows";
import { MODUL_TANPA_TUR, TOURS, modulBertur, modulTanpaTur } from "@/lib/tours";
import { PERMUKAAN_LUAR_NAVIGASI } from "@/lib/docs";
import { NAV_GROUPS, NAV_HOME } from "@/lib/nav";
import { existsSync } from "node:fs";
import { join } from "node:path";

/** Alasan yang isinya spasi bukan alasan. */
const beralasan = (peta: Readonly<Partial<Record<BusinessModule, string>>>) =>
  Object.entries(peta).filter(([, sebab]) => (sebab ?? "").trim().length < 20);

describe("cakupan panduan — Alur Kerja", () => {
  it("setiap modul punya alur, atau alasan tertulis kenapa tidak", () => {
    expect(modulTanpaPanduan()).toEqual([]);
  });

  it("tidak menyimpan pengecualian yang sudah tidak berlaku", () => {
    const ada = modulBeralur();
    const basi = Object.keys(MODUL_TANPA_ALUR).filter((m) => ada.has(m as BusinessModule));
    expect(basi, "modul ini sudah punya alur; cabut dari MODUL_TANPA_ALUR").toEqual([]);
  });

  it("setiap alasan benar-benar menjelaskan, bukan sekadar terisi", () => {
    expect(beralasan(MODUL_TANPA_ALUR)).toEqual([]);
  });

  it("hanya menyebut modul yang benar-benar ada", () => {
    const sah = new Set<string>(BUSINESS_MODULES);
    const asing = [
      ...WORKFLOWS.flatMap((wf) => wf.modules),
      ...Object.keys(MODUL_TANPA_ALUR),
    ].filter((m) => !sah.has(m));
    expect(asing).toEqual([]);
  });

  it("id alur unik, dan tiap alur punya urutan (>= 2 langkah)", () => {
    const id = WORKFLOWS.map((wf) => wf.id);
    expect(id).toEqual([...new Set(id)]);
    for (const wf of WORKFLOWS) {
      expect(wf.steps.length, `alur ${wf.id} bukan urutan`).toBeGreaterThanOrEqual(2);
    }
  });

  it("tiap alur menyebut setidaknya satu modul", () => {
    // Alur tanpa klaim modul adalah alur yang tak terhitung di kedua arah:
    // ia tidak menutup apa pun, dan ketiadaannya pun tak akan tampak.
    for (const wf of WORKFLOWS) {
      expect(wf.modules.length, `alur ${wf.id} tidak menyebut modul`).toBeGreaterThan(0);
    }
  });
});

describe("cakupan panduan — Tur Berpandu", () => {
  it("setiap modul punya tur, atau alasan tertulis kenapa tidak", () => {
    expect(modulTanpaTur()).toEqual([]);
  });

  it("tidak menyimpan pengecualian yang sudah tidak berlaku", () => {
    const ada = modulBertur();
    const basi = Object.keys(MODUL_TANPA_TUR).filter((m) => ada.has(m as BusinessModule));
    expect(basi, "modul ini sudah punya tur; cabut dari MODUL_TANPA_TUR").toEqual([]);
  });

  it("setiap alasan benar-benar menjelaskan, bukan sekadar terisi", () => {
    expect(beralasan(MODUL_TANPA_TUR)).toEqual([]);
  });

  it("path tur unik — dua tur di satu halaman berarti satu tak pernah jalan", () => {
    const path = TOURS.map((t) => t.path);
    expect(path).toEqual([...new Set(path)]);
  });
});

describe("permukaan di luar navigasi", () => {
  const RUTE = join(
    __dirname,
    "..",
    "src/app/(app)/(dashboard)/t/[tenantSlug]/[companySlug]"
  );

  it("setiap halaman yang didaftar benar-benar ada", () => {
    for (const href of Object.keys(PERMUKAAN_LUAR_NAVIGASI)) {
      expect(existsSync(join(RUTE, href, "page.tsx")), `${href} tidak ada`).toBe(true);
    }
  });

  it("tidak ada yang diam-diam menjadi item menu", () => {
    // Begitu sebuah halaman di sini masuk ke NAV_GROUPS ia berhenti menjadi
    // chrome, dan aturan `NAV_TANPA_DOKUMEN` berlaku lagi atasnya. Tanpa tes
    // ini pengecualiannya akan tetap berdiri dan halaman itu lolos DUA
    // penjaga sekaligus.
    const nav = new Set(
      [NAV_HOME, ...NAV_GROUPS.flatMap((g) => g.items)].map((i) => i.href)
    );
    const bentrok = Object.keys(PERMUKAAN_LUAR_NAVIGASI).filter((h) => nav.has(h));
    expect(bentrok, "sudah jadi item menu; cabut dari PERMUKAAN_LUAR_NAVIGASI").toEqual([]);
  });

  it("setiap alasan benar-benar menjelaskan", () => {
    for (const [href, sebab] of Object.entries(PERMUKAAN_LUAR_NAVIGASI)) {
      expect(sebab.trim().length, `${href} tanpa alasan`).toBeGreaterThan(40);
    }
  });
});
