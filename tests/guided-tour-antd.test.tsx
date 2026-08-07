/**
 * Tur berpandu di atas Ant Design `Tour` (issue #224).
 *
 * ══ YANG PALING MUDAH RUSAK TANPA BERSUARA ════════════════════════════════
 * Sebuah tur yang menunjuk ruang kosong TIDAK menggagalkan apa pun. Nama
 * sasarannya hidup di `lib/tours.ts` (`target`), atributnya hidup di berkas
 * halaman (`data-tour="…"`), dan tidak ada satu pun tipe yang menghubungkan
 * keduanya: mengganti nama atribut, memindahkan panel, atau menghapus
 * pembungkusnya lolos `tsc`, lolos lint, dan baru ketahuan ketika seorang
 * pengguna menekan "Ulangi tur" lalu melihat kartu melayang di tengah layar.
 * Tes pertama di bawah menutup celah itu.
 *
 * ── Apa yang TIDAK bisa dibuktikan di sini ────────────────────────────────
 * Suite ini berjalan di `environment: "node"` — tidak ada DOM, dan `Tour`
 * merender lewat portal (di server ia tidak menghasilkan markup sama sekali).
 * Jadi tidak ada yang benar-benar menekan Escape atau memindahkan fokus di
 * sini. Yang bisa dibuktikan adalah rantai sebabnya, dan rantainya dipecah
 * seperti pada `tests/layout-chrome-antd.test.tsx`:
 *
 *   1. **Fakta paket terpasang.** rc-tour benar-benar menutup pada Escape, dan
 *      syaratnya `keyboard` menyala serta `closable` tidak `null`.
 *   2. **Kontrak komponen kita.** `GuidedTour` tidak mematikan keduanya.
 *   3. **Bagian yang memang kita tulis sendiri.** `kembalikanFokus` — satu-
 *      satunya potongan pengelolaan fokus yang tidak diberikan AntD.
 */
import { describe, expect, it, vi } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";

import { LocaleProvider } from "@/lib/i18n/client";
import type { Dictionary } from "@/lib/i18n/dictionary";
import id from "@/lib/i18n/dictionaries/id.json";
import { TOURS } from "@/lib/tours";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: () => {}, push: () => {} }),
  usePathname: () => "/dashboard",
}));

/**
 * `Tour` palsu yang hanya MEREKAM propnya. `Tour` sungguhan merender lewat
 * portal, jadi di server ia tidak menghasilkan apa-apa dan setiap pernyataan
 * tentang markupnya akan lulus tanpa arti.
 */
const tourProps: Record<string, unknown>[] = [];

vi.mock("antd", async (importOriginal) => {
  const actual = await importOriginal<typeof import("antd")>();
  const FakeTour = (props: Record<string, unknown>) => {
    tourProps.push(props);
    return null;
  };
  return { ...actual, Tour: FakeTour };
});

const { GuidedTour, kembalikanFokus, selektorSasaran } = await import(
  "@/components/help/guided-tour"
);

const SRC_DIR = join(__dirname, "..", "src");
const BERKAS_TUR = join(SRC_DIR, "components", "help", "guided-tour.tsx");

function render() {
  tourProps.length = 0;
  renderToStaticMarkup(
    <LocaleProvider locale="id" dictionary={id as unknown as Dictionary}>
      <GuidedTour />
    </LocaleProvider>
  );
  return tourProps.at(-1);
}

/** Seluruh berkas sumber `.ts`/`.tsx` di bawah `src/`. */
function berkasSumber(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return berkasSumber(full);
    return /\.tsx?$/.test(entry.name) ? [full] : [];
  });
}

describe("sasaran tur benar-benar ada di halaman", () => {
  const sumber = berkasSumber(SRC_DIR).map((f) => readFileSync(f, "utf8"));

  it("setiap `target` di lib/tours.ts punya atribut data-tour yang cocok", () => {
    const dicari = [...new Set(TOURS.flatMap((t) => t.steps.map((s) => s.target)))].filter(
      (nama): nama is string => Boolean(nama)
    );
    // Penjaga bagi penjaga: daftar kosong akan membuat tes ini lulus tanpa
    // memeriksa apa pun.
    expect(dicari.length).toBeGreaterThan(5);

    /*
     * Dua bentuk penulisan, dan yang kedua mudah terlewat: atributnya bisa
     * ditulis langsung (`data-tour="ringkasan"`) atau lewat ekspresi
     * (`data-tour={groupIndex === 0 ? "laporan-kategori-pertama" : undefined}`,
     * di Pusat Laporan). Pencocokan yang hanya mengenal bentuk pertama akan
     * MELAPORKAN sasaran yang sebenarnya ada — kesalahan yang membuat penjaga
     * ini tidak bisa dipercaya.
     */
    const hilang = dicari.filter((nama) => {
      const pola = new RegExp(`data-tour=(?:"${nama}"|\\{[^}]*"${nama}")`);
      return !sumber.some((isi) => pola.test(isi));
    });
    expect(
      hilang,
      "Langkah tur menunjuk nama `data-tour` yang tidak ada di satu berkas pun. " +
        "Turnya tidak akan error — ia hanya menyorot ruang kosong. Kembalikan " +
        "atributnya, atau perbarui `target` di src/lib/tours.ts."
    ).toEqual([]);
  });

  it("selektornya persis atribut itu, tanpa hiasan", () => {
    expect(selektorSasaran("menu-tugas")).toBe('[data-tour="menu-tugas"]');
  });
});

describe("prop yang diserahkan ke Tour", () => {
  it("langkahnya sama banyak dengan definisi turnya, dengan sasaran di tempat yang sama", () => {
    const props = render();
    const steps = props?.steps as { target?: unknown }[] | undefined;
    const beranda = TOURS.find((t) => t.id === "beranda");
    expect(steps).toHaveLength(beranda!.steps.length);
    // Langkah bersasaran → fungsi pencari; langkah tanpa sasaran → `undefined`,
    // yang di rc-tour berarti "kartu di tengah layar".
    expect(steps?.map((s) => typeof s.target)).toEqual(
      beranda!.steps.map((s) => (s.target ? "function" : "undefined"))
    );
  });

  it("tombolnya berbahasa kamus, dan langkah terakhir berbunyi Selesai", () => {
    const steps = render()?.steps as { nextButtonProps: { children: string } }[];
    expect(steps.at(0)?.nextButtonProps.children).toBe("Lanjut");
    expect(steps.at(-1)?.nextButtonProps.children).toBe("Selesai");
  });

  it("Escape tidak dimatikan dari sisi kita", () => {
    const props = render();
    // Mata rantai #2. Keduanya bawaan menyala; yang dijaga adalah tidak ada
    // yang mematikannya "supaya tidak mengganggu" — dan `closable: null`
    // (yaitu `closable={false}` tanpa ikon) mematikan Escape juga, bukan
    // hanya menyembunyikan tombol silangnya.
    expect(props?.keyboard).not.toBe(false);
    expect(props?.closable).toBeTruthy();
  });

  it("tur ditutup lewat satu jalan saja: onClose", () => {
    // rc-tour memanggil `onClose` lebih dulu, baru `onFinish`. Memasang
    // keduanya berarti menandai "sudah dilihat" dua kali dan mengembalikan
    // fokus dua kali.
    const props = render();
    expect(typeof props?.onClose).toBe("function");
    expect(props?.onFinish).toBeUndefined();
  });
});

describe("rc-tour yang terpasang memang menutup pada Escape", () => {
  /** Berkas rc-tour yang benar-benar dimuat aplikasi ini. */
  function sumberRcTour(): string {
    const require = createRequire(import.meta.url);
    return readFileSync(join(dirname(require.resolve("@rc-component/tour")), "Tour.js"), "utf8");
  }

  it("bawaan `keyboard` menyala dan Escape hanya diabaikan bila closable null", () => {
    // Mata rantai #1: kalau versi berikutnya menghapus klausa ini, kegagalannya
    // harus muncul DI SINI — bukan sebagai laporan "tur tidak bisa ditutup".
    const source = sumberRcTour();
    expect(source).toContain("keyboard = true");
    expect(source).toContain("if (keyboard && mergedClosable !== null)");
    // Penangannya disalurkan lewat `onEsc` milik rc-portal, yang tahu urutan
    // tumpukan overlay — pendengar `document` lama tidak tahu.
    expect(source).toContain("onEsc: handleEscClose");
  });
});

describe("kembalikanFokus", () => {
  it("memfokuskan pemicu yang masih tersambung", () => {
    let terfokus = false;
    const pemicu = { isConnected: true, focus: () => (terfokus = true) };
    expect(kembalikanFokus(pemicu)).toBe(true);
    expect(terfokus).toBe(true);
  });

  it("diam saja untuk pemicu yang sudah lepas dari dokumen", () => {
    // Kasus yang paling sering: baris menu Bantuan ikut lenyap bersama
    // dropdown-nya. Memfokuskan simpul lepas membuang fokus ke <body>, dan
    // yang benar di sana adalah tidak melakukan apa-apa — `Dropdown` AntD
    // sudah mengembalikannya ke tombol Bantuan.
    let terfokus = false;
    expect(kembalikanFokus({ isConnected: false, focus: () => (terfokus = true) })).toBe(false);
    expect(terfokus).toBe(false);
    expect(kembalikanFokus(null)).toBe(false);
  });
});

describe("berkas turnya sendiri", () => {
  it("nol kelas Tailwind — seluruh gayanya dari token AntD", () => {
    const source = readFileSync(BERKAS_TUR, "utf8");
    expect(source).not.toContain("className");
  });

  it("nol <button> mentah — karena itu ia keluar dari RAW_BUTTON_ALLOWLIST", () => {
    expect(readFileSync(BERKAS_TUR, "utf8")).not.toMatch(/<button[\s>]/);
  });
});
