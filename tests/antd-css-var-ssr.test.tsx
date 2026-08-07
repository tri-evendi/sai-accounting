/**
 * Token AntD sebagai variabel CSS yang sampai ke SERVER COMPONENT (issue #227).
 *
 * ══ Apa yang sebenarnya dibuktikan di sini ═══════════════════════════════════
 * Klaimnya satu kalimat: **sebuah server component tanpa satu pun komponen AntD
 * di atasnya boleh menulis `var(--ant-…)`, dan warnanya sudah benar pada HTML
 * PERTAMA — bukan setelah hydrate.**
 *
 * Klaim itu tidak bisa dibuktikan dari layar. Kedipan warna berlangsung satu
 * frame di jaringan lokal; "kelihatan benar di peramban" adalah kalimat yang
 * sama-sama benar untuk mekanisme yang bekerja dan untuk mekanisme yang baru
 * bekerja setelah JavaScript-nya jalan. Karena itu buktinya diambil dari STRING
 * yang dihasilkan server — persis cara #184 membuktikan gayanya — dengan
 * memakai ulang dua bagian yang sama yang dipakai produksi:
 *
 *   `createCache()` + `StyleProvider`  = yang dipasang `AntdRegistry`
 *   `extractStyle(cache, {plain, once})` = yang dipanggil `AntdRegistry` di
 *                                          `useServerInsertedHTML`
 *
 * Jadi yang diperiksa bukan tiruan jalur produksinya, melainkan jalurnya
 * sendiri, dipanggil dengan argumen yang sama.
 *
 * ══ Catatan #194 yang dikoreksi berkas ini ═══════════════════════════════════
 * #194 dan #227 sama-sama mencatat "`extractStyle()` tidak memuat blok variabel
 * sama sekali". Itu keliru, dan tes pertama di bawah menguncinya sebagai FAKTA
 * PAKET, bukan sebagai ingatan: `types` bawaan `extractStyle` memang memuat
 * `token`, dan cabang itu persis mengeluarkan `cssVarsStr`. Yang tidak pernah
 * ada adalah string `--sai-`: `cssVar.key` menamai KELAS pemikulnya, sedangkan
 * nama variabelnya datang dari `cssVar.prefix` yang bawaannya `ant`.
 *
 * Yang benar-benar hilang hanyalah pemikul kelasnya — bawaannya kelas ber-
 * `useId` yang hanya dipasang komponen AntD pada dirinya sendiri. #227 memberi
 * kunci tetap dan memasangnya di `<html>`; sisanya sudah ada sejak #184.
 *
 * ══ Diverifikasi sekali di server sungguhan ═════════════════════════════════
 * Berkas ini merender di luar Next, jadi satu mata rantai tidak terjangkau:
 * kapan `useServerInsertedHTML` benar-benar menyiram gayanya. Itu diukur sekali,
 * tangan, terhadap `next dev` yang berjalan (`curl` + `<html>` mentahnya,
 * 2026-08-06), dan hasilnya dicatat di sini supaya tidak perlu diulang:
 *
 *   <html lang="id" class="… h-full sai-tokens dark" style="color-scheme:dark">
 *   <style id="antd-cssinjs"> pada offset 1.649
 *   `.sai-tokens{…--ant-color-money-positive:#8fd460;…}` pada offset 35.591
 *   <body> baru pada offset 49.956
 *
 * Blok variabelnya berdiri di `<head>`, ribuan bita SEBELUM markup mana pun
 * yang memakainya, dengan nilai tema GELAP — dari cookie, pada HTML pertama,
 * tanpa satu baris JavaScript. Tema terang memberi bentuk yang sama dengan
 * `#237804`. Jangan ganti angka-angka itu tanpa mengukur ulang.
 */
import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { createCache, extractStyle, StyleProvider } from "@ant-design/cssinjs";

import type { ContractChainStage } from "@/lib/document-chain";
import type { Dictionary, DictionaryKey, TranslationValues } from "@/lib/i18n/dictionary";
import id from "@/lib/i18n/dictionaries/id.json";
import { translate } from "@/lib/i18n/dictionary";
import {
  ANTD_CSS_VAR_KEY,
  MONEY_TOKENS_DARK,
  MONEY_TOKENS_LIGHT,
} from "@/lib/theme/antd-tokens";
import { ThemeProvider } from "@/lib/theme/client";
import { AntdProvider } from "@/components/providers/antd-provider";

/*
 * `getT` membaca cookie lewat `next/headers`, yang menuntut konteks permintaan —
 * tidak ada di perenderan SSR telanjang seperti di sini. Kamusnya tetap kamus
 * SUNGGUHAN, jadi kunci salah ketik tetap muncul sebagai teks kunci di markup.
 */
const dict = id as unknown as Dictionary;
vi.mock("@/lib/i18n/server", () => ({
  getT: async () => (key: DictionaryKey, values?: TranslationValues) =>
    translate(dict, key, values),
}));

const { DocumentChainTimeline } = await import("@/components/shared/document-chain-timeline");

/** Empat tahap dengan tiga status berbeda, supaya ketiga cincin ikut terbukti. */
const STAGES: ContractChainStage[] = [
  { key: "contract", label: "Kontrak", status: "selesai", done: 1, target: 1, count: 1, unit: "kg" },
  { key: "delivery", label: "Surat Jalan", status: "sebagian", done: 5, target: 10, count: 2, unit: "kg" },
  { key: "invoice", label: "Faktur", status: "belum", done: 0, target: 10, count: 0, unit: "kg" },
  { key: "payment", label: "Pembayaran", status: "sebagian", done: 1, target: 2, count: 1, unit: "IDR" },
];

/**
 * Satu render server yang menyalin susunan root layout: `StyleProvider` (dari
 * `AntdRegistry`) di luar, `ThemeProvider` menyemai tema dari cookie, lalu
 * `AntdProvider` — dan server component-nya sebagai anak.
 *
 * `AntdProvider` merender `<App component={false}>`, yaitu sebuah `Fragment`,
 * jadi TIDAK ADA satu pun elemen AntD di atas markup yang diuji. Itu bagian
 * penting: kalau ada, kelas pemikul variabel akan menempel di situ dan tesnya
 * lulus tanpa membuktikan apa pun tentang `<html>`.
 */
async function renderSSR(theme: "light" | "dark") {
  const cache = createCache();
  const html = renderToStaticMarkup(
    <StyleProvider cache={cache}>
      <ThemeProvider theme={theme}>
        <AntdProvider locale="id">
          {await DocumentChainTimeline({ stages: STAGES })}
        </AntdProvider>
      </ThemeProvider>
    </StyleProvider>
  );
  // Argumen yang sama persis dengan `AntdRegistry.useServerInsertedHTML`.
  const style = extractStyle(cache, { plain: true, once: true });
  return { html, style };
}

/** Isi blok variabel milik kelas kita, dari string SSR — bukan dari DOM. */
function varBlock(style: string): string {
  const at = style.indexOf(`.${ANTD_CSS_VAR_KEY}{`);
  expect(at, `selektor .${ANTD_CSS_VAR_KEY} tidak ada di gaya hasil server`).toBeGreaterThanOrEqual(0);
  const open = style.indexOf("{", at);
  return style.slice(open + 1, style.indexOf("}", open));
}

describe("fakta paket: extractStyle memang mengeluarkan blok variabel", () => {
  const require = createRequire(import.meta.url);
  const bacaTerpasang = (paket: string, berkas: string) =>
    readFileSync(join(dirname(require.resolve(paket)), berkas), "utf8");

  it("`types` bawaan extractStyle memuat `token`", () => {
    /*
     * Cabang `token` inilah yang mengeluarkan `cssVarsStr` — blok variabel yang
     * di peramban disuntik `updateCSS`. Kalau versi cssinjs baru mengeluarkannya
     * dari daftar bawaan, seluruh mekanisme #227 mati diam-diam: tidak ada galat,
     * hanya warna yang jatuh ke warisan di 67 berkas.
     */
    const sumber = bacaTerpasang("@ant-design/cssinjs", "extractStyle.js");
    expect(sumber).toMatch(/types\s*=\s*\['style',\s*'token',\s*'cssVar'\]/);
  });

  it("AntdRegistry memanggil extractStyle tanpa mempersempit `types`", () => {
    /*
     * `plain: true` membuat hasilnya CSS telanjang (registry membungkusnya
     * sendiri dalam satu `<style id="antd-cssinjs">`), `once: true` mencegah
     * gaya yang sama ikut lagi di flush berikutnya. Yang TIDAK boleh muncul di
     * baris itu adalah `types` — menyebutnya berarti memilih, dan pilihan yang
     * lupa `token` menghapus blok variabelnya.
     */
    const sumber = bacaTerpasang("@ant-design/nextjs-registry", "AntdRegistry.js");
    expect(sumber).toContain("extractStyle");
    expect(sumber).not.toContain("types");
  });
});

describe("blok variabel ada di HTML PERTAMA, dengan selektor yang bisa ditebak", () => {
  it("selektornya kelas tetap milik kita, bukan kelas ber-useId", async () => {
    const { style } = await renderSSR("light");
    expect(style).toContain(`.${ANTD_CSS_VAR_KEY}{`);
    /*
     * Bawaan AntD adalah `.css-var-«useId»` — kelas yang hanya dipasang komponen
     * AntD pada dirinya sendiri, jadi ia tidak bisa dipasang root layout di
     * `<html>`. Kalau ia muncul lagi, `cssVar.key` hilang dari AntdProvider.
     */
    expect(style).not.toMatch(/\.css-var-_[^{]*\{--ant-/);
  });

  it("blok variabel dan gaya komponen keluar dari SATU panggilan yang sama", async () => {
    const { style } = await renderSSR("light");
    /*
     * `AntdRegistry` membungkus hasil SATU panggilan `extractStyle` ke dalam
     * SATU `<style id="antd-cssinjs">`. Selama keduanya ada di string yang sama,
     * keduanya tiba dan diurai peramban bersama — tidak ada jendela waktu di
     * mana gaya komponen sudah berlaku tapi variabel yang dirujuknya belum.
     *
     * Letak relatifnya sengaja TIDAK dijaga: terukur, blok variabel justru
     * berdiri sesudah gaya komponen, dan untuk properti kustom itu tidak
     * berpengaruh — masing-masing hanya dideklarasikan sekali, jadi tidak ada
     * yang bisa saling menimpa.
     */
    expect(style, "markup uji harus memuat sebuah komponen AntD (Badge → Tag)").toContain(".ant-tag");
    expect(style).toContain(`.${ANTD_CSS_VAR_KEY}{`);
  });

  it("nilainya token yang sudah dihitung, bukan rujukan yang menunggu client", async () => {
    const blok = varBlock((await renderSSR("light")).style);
    expect(blok).toContain(`--ant-color-money-positive:${MONEY_TOKENS_LIGHT.colorMoneyPositive}`);
    expect(blok).toContain(`--ant-color-money-pending:${MONEY_TOKENS_LIGHT.colorMoneyPending}`);
    expect(blok).toContain("--ant-color-success-bg:");
    expect(blok).toContain("--ant-color-text-secondary:");
  });
});

describe("tema gelap ikut benar sejak HTML pertama", () => {
  it("blok variabel gelap memuat anak tangga gelap, bukan yang terang", async () => {
    const blok = varBlock((await renderSSR("dark")).style);
    expect(blok).toContain(`--ant-color-money-positive:${MONEY_TOKENS_DARK.colorMoneyPositive}`);
    expect(blok).toContain(`--ant-color-money-pending:${MONEY_TOKENS_DARK.colorMoneyPending}`);
    /*
     * Inilah bentuk kedipan yang dilarang: kalau nilai TERANG ikut terkirim di
     * halaman bertema gelap, layar sempat memakai hijau terang di atas
     * permukaan gelap (1,9:1) sebelum client memperbaikinya.
     */
    expect(blok).not.toContain(MONEY_TOKENS_LIGHT.colorMoneyPositive);
  });

  it("kedua tema memakai selektor yang SAMA, supaya toggle menimpa alih-alih menumpuk", async () => {
    const terang = (await renderSSR("light")).style;
    const gelap = (await renderSSR("dark")).style;
    expect(terang).toContain(`.${ANTD_CSS_VAR_KEY}{`);
    expect(gelap).toContain(`.${ANTD_CSS_VAR_KEY}{`);
    /*
     * Selektor yang sama = kunci `updateCSS` yang sama (`css-var-«key»`), jadi
     * saat tema diganti saat berjalan blok lama DIGANTI isinya, bukan disusul
     * blok kedua yang harus menang lewat urutan. Server component karena itu
     * ikut berganti warna tanpa dirender ulang.
     */
  });
});

describe("server component tanpa komponen AntD di atasnya", () => {
  it("markupnya memakai var(--ant-…), bukan warna yang sudah dihitung", async () => {
    const { html } = await renderSSR("light");
    expect(html).toContain("var(--ant-color-success-bg)");
    expect(html).toContain("var(--ant-color-money-positive)");
    expect(html).toContain("var(--ant-color-text-secondary)");
    /*
     * Kebalikannya yang harus mustahil: hex token yang tertanam di markup
     * berarti komponennya kembali membaca `theme.useToken()` — yaitu kembali
     * menjadi komponen client.
     */
    expect(html).not.toContain(MONEY_TOKENS_LIGHT.colorMoneyPositive);
  });

  it("tidak ada elemen ber-kelas pemikul variabel DI ATAS simpul berwarna itu", async () => {
    const { html } = await renderSSR("light");
    const berwarna = html.indexOf("var(--ant-color-success-bg)");
    expect(berwarna).toBeGreaterThan(0);
    /*
     * Ini inti issue #227. Kalau kelas pemikulnya kebetulan ada di salah satu
     * pembungkus, variabelnya teratasi lewat pembungkus itu dan tes ini akan
     * lulus untuk alasan yang salah — persis keadaan SEBELUM #227, di mana
     * warna hanya benar di halaman yang kebetulan punya komponen AntD di atas.
     * Yang harus menanggungnya adalah `<html>`, dan `<html>` tidak ada di
     * potongan markup ini.
     */
    expect(html.slice(0, berwarna)).not.toContain(ANTD_CSS_VAR_KEY);
  });

  it("tidak ada satu pun atribut `class` di atas cincin tahap", async () => {
    const { html } = await renderSSR("light");
    const berwarna = html.indexOf("var(--ant-color-success-bg)");
    /*
     * Bentuk paling keras dari klaim yang sama: yang mendahului simpul berwarna
     * bukan sekadar "bukan kelas AntD" — ia tidak punya `class` sama sekali,
     * hanya `style` inline. Jadi tidak ada kandidat pemikul variabel di seluruh
     * rantai leluhurnya di dalam markup ini; satu-satunya yang tersisa adalah
     * `<html>`. `Tag` (Badge) memang komponen AntD, tapi ia berdiri SETELAH
     * cincin, bukan di atasnya.
     */
    expect(html.slice(0, berwarna)).not.toContain("class=");
  });
});

describe("kedua ujung mekanisme harus menyebut kunci yang sama", () => {
  const baca = (p: string) => readFileSync(join(__dirname, "..", "src", p), "utf8");

  it("root layout memasang ANTD_CSS_VAR_KEY pada <html>", () => {
    /*
     * Mekanisme ini punya dua ujung yang letaknya berjauhan: `AntdProvider`
     * (yang MENULIS bloknya) dan root layout (yang MEMASANG pemikulnya).
     * Menghapus salah satunya tidak menghasilkan galat apa pun — `var(--ant-…)`
     * hanya berhenti teratasi dan warnanya jatuh diam-diam ke warisan. Karena
     * itu keduanya dijaga di sini, bukan hanya yang bisa dirender.
     */
    const layout = baca("app/layout.tsx");
    expect(layout).toContain("ANTD_CSS_VAR_KEY");
    expect(layout).toMatch(/className=\{`[^`]*\$\{ANTD_CSS_VAR_KEY\}[^`]*`\}/);
  });

  it("AntdProvider menyerahkan kunci itu ke ConfigProvider", () => {
    const provider = baca("components/providers/antd-provider.tsx");
    expect(provider).toMatch(/cssVar:\s*\{\s*key:\s*ANTD_CSS_VAR_KEY\s*\}/);
  });
});
