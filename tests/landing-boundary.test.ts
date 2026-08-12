/**
 * BATAS DUA DUNIA — pendaratan pemasaran vs app internal (issue #245).
 *
 * ══ Apa yang dijaga di sini, dan kenapa ia baru ada sekarang ════════════════
 * MASTER.md sejak awal melarang "gaya landing/marketing (hero raksasa, CTA
 * 'Start trial') di app internal". Larangan itu bertahan bertahun-tahun tanpa
 * satu penjaga pun — dan bukan karena disiplin, melainkan karena sebuah
 * **kebetulan mekanis**: dua dunia memakai kelas Tailwind yang kelihatan
 * berbeda, jadi menyalin gaya pemasaran ke halaman internal sudah terasa
 * janggal saat menulisnya.
 *
 * Epik #206 menghapus kebetulan itu. Setelah pendaratan dan app internal
 * sama-sama berdiri di atas token AntD, `fontSize:
 * "var(--ant-font-size-heading-1)"` di halaman piutang dan di hero pendaratan
 * terlihat persis sama, dan yang tersisa hanyalah satu kalimat larangan di
 * dokumen yang tidak dijalankan siapa pun. Berkas ini adalah penggantinya.
 *
 * ══ Bentuk penjagaannya: BUKAN daftar kelas terlarang ══════════════════════
 * Penjaga yang mencari "kelas yang mencurigakan" tidak akan pernah selesai —
 * setiap bentuk penulisan baru lolos sampai ada yang menambahkannya ke pola.
 * Yang dijaga di sini adalah JALUR, dan hanya ada satu:
 *
 *   1. Skala pemasaran (`--sai-landing-*`) hanya dideklarasikan di dalam
 *      `[data-landing]`, yang hanya dipasang `LandingShell`.
 *   2. `LandingShell` — dan semua yang serumah dengannya — hanya boleh diimpor
 *      oleh `app/page.tsx`.
 *   3. String `--sai-landing-` dan atribut `data-landing` tidak boleh muncul di
 *      satu berkas pun di luar `src/components/landing/**`.
 *
 * Ketiganya bersama berarti: menyalin hero ke halaman internal tidak lagi
 * menghasilkan hero. Ia menghasilkan properti CSS yang tidak pernah teratasi
 * (poin 1+3), atau sebuah impor yang GAGAL di tes (poin 2). Batasnya berhenti
 * menjadi selera dan menjadi mekanisme.
 *
 * ══ Sisi sebaliknya juga dijaga ════════════════════════════════════════════
 * `components/landing/**` tidak boleh mengimpor permukaan app internal —
 * chrome dasbor, panel setelan, komponen bersama yang menarik Prisma. Bukan
 * kerapian: halaman ini dibaca orang yang BELUM punya sesi, dan setiap impor ke
 * dalam app internal adalah satu kesempatan bagi kode ber-`auth()`/ber-Prisma
 * untuk ikut ke permukaan publik.
 *
 * ⚠ Penjaga ini pernah dilihat MERAH sebelum dianggap selesai — tiga
 * pelanggaran disengaja, dijalankan, lalu dikembalikan (dicatat di badan PR
 * #245). Penjaga yang tidak pernah dilihat merah bukan penjaga.
 */
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { LANDING_STYLE } from "@/components/landing/landing-scale";

const SRC = join(__dirname, "..", "src");

/** Direktori tempat bentuk pemasaran boleh hidup. */
const LANDING_DIR = "components/landing/";

/**
 * SATU-SATUNYA berkas di luar direktori itu yang boleh mengimpor darinya.
 *
 * Daftarnya sengaja daftar, bukan pengecualian yang ditanam di dalam kondisi:
 * menambah pintu masuk kedua harus terlihat sebagai baris di diff, dengan nama
 * berkasnya, supaya bisa dipertanyakan seorang peninjau.
 */
const PINTU_MASUK = ["app/page.tsx"];

/**
 * Yang boleh diimpor DARI dalam `components/landing/**`.
 *
 * Bentuknya izin, bukan larangan: daftar larangan selalu tertinggal satu
 * direktori di belakang. `@/components/ui` (primitif), `@/lib` (kamus,
 * konstanta, katalog paket), dan sesama berkas pendaratan — selebihnya tidak.
 */
const IMPOR_SAH = ["@/components/landing/", "@/components/ui/", "@/lib/"];

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    // Klien Prisma hasil `prisma generate` — bukan kode kita, dan tidak di git.
    if (entry.isDirectory()) return entry.name === "generated" ? [] : sourceFiles(full);
    return /\.tsx?$/.test(entry.name) ? [full] : [];
  });
}

const rel = (p: string) => p.slice(SRC.length + 1).split("\\").join("/");

const files = new Map<string, string>(
  sourceFiles(SRC).map((f) => [rel(f), readFileSync(f, "utf8")])
);

const isLanding = (file: string) => file.startsWith(LANDING_DIR);

/** Spesifier impor runtime MAUPUN tipe — keduanya menyatakan ketergantungan. */
const IMPOR = /^\s*import\s+(?:type\s+)?(?:[^;]*?\s+from\s+)?["']([^"']+)["']/gm;

const importsOf = (code: string) => [...code.matchAll(IMPOR)].map((m) => m[1]);

/** Impor ke dalam direktori pendaratan, lewat alias `@/` maupun jalur relatif. */
const menujuLanding = (spec: string) =>
  spec.startsWith("@/components/landing") || /(^|\/)landing\//.test(spec);

describe("pemindainya memindai yang benar", () => {
  it("menemukan pohon sumber dan berkas pendaratannya", () => {
    // Kalau pemindainya rusak (jalur salah, filter kelewat rakus), semua tes di
    // bawah lulus dengan daftar kosong. Ini yang menahan kegagalan diam itu.
    expect(files.size).toBeGreaterThan(400);
    expect([...files.keys()].filter(isLanding).length).toBeGreaterThanOrEqual(9);
  });
});

describe("app internal tidak mengimpor bentuk pemasaran", () => {
  it("hanya app/page.tsx yang boleh mengimpor components/landing/**", () => {
    const pelanggar = [...files]
      .filter(([file]) => !isLanding(file) && !PINTU_MASUK.includes(file))
      .filter(([, code]) => importsOf(code).some(menujuLanding))
      .map(([file]) => file);

    expect(
      pelanggar,
      pelanggar.length === 0
        ? ""
        : "Berkas berikut mengimpor sesuatu dari `components/landing/**`:\n\n  " +
            pelanggar.join("\n  ") +
            "\n\nDirektori itu memuat SATU-SATUNYA jalan menuju skala pemasaran " +
            "(hero ≈53px, irama 96px, CTA berulang). Mengimpornya dari app " +
            "internal berarti membawa bentuk halaman jualan ke layar kerja — " +
            "persis yang dilarang MASTER.md §Pemasaran vs App.\n\n" +
            "Yang biasanya sebenarnya dibutuhkan: `PageHeader` untuk judul, " +
            "`Card` untuk permukaan, `Button` untuk aksi. Kalau memang ada " +
            "permukaan PUBLIK kedua (bukan app internal), tambahkan berkasnya ke " +
            "PINTU_MASUK dengan alasannya di pesan commit."
    ).toEqual([]);
  });

  it("halaman harga DI DALAM aplikasi tetap berdiri sendiri", () => {
    // Tetangga terdekat pendaratan, dan karena itu yang paling mudah kabur:
    // satu-satunya layar internal yang juga memajang daftar harga. Kepala
    // berkasnya sudah menyatakan ia tidak mengimpor apa pun dari sana; di sini
    // pernyataan itu berhenti menjadi komentar.
    const file = "app/(tenant)/(panel)/platform/billing/plans/page.tsx";
    const code = files.get(file);
    expect(code, `${file} tidak ditemukan — jalurnya berubah?`).toBeDefined();
    expect(importsOf(code!).filter(menujuLanding)).toEqual([]);
  });
});

describe("pendaratan tidak mengimpor app internal", () => {
  it("hanya primitif, lib, dan sesama berkas pendaratan", () => {
    const pelanggar: string[] = [];
    for (const [file, code] of files) {
      if (!isLanding(file)) continue;
      for (const spec of importsOf(code)) {
        // Paket pihak ketiga (`next/link`, `@ant-design/icons`, `react`) tidak
        // pernah berawalan `@/` — ia bukan permukaan aplikasi ini.
        if (!spec.startsWith("@/") && !spec.startsWith(".")) continue;
        if (IMPOR_SAH.some((ok) => spec.startsWith(ok))) continue;
        pelanggar.push(`${file} — ${spec}`);
      }
    }

    expect(
      pelanggar,
      pelanggar.length === 0
        ? ""
        : "Berkas pendaratan mengimpor permukaan di luar primitif & lib:\n\n  " +
            pelanggar.join("\n  ") +
            "\n\nHalaman ini dibaca orang yang BELUM punya sesi. Setiap impor ke " +
            "app internal adalah satu jalan bagi chrome dasbor — dan kode " +
            "ber-`auth()`/ber-Prisma di belakangnya — ikut ke permukaan publik. " +
            "Kalau yang dibutuhkan sebuah kendali, ambil primitifnya dari " +
            "`@/components/ui`; kalau sebuah angka, ambil sumbernya dari `@/lib`."
    ).toEqual([]);
  });
});

describe("skala pemasaran tidak bisa dipanggil dari luar", () => {
  it("string `--sai-landing-` tidak muncul di luar components/landing/**", () => {
    const pelanggar = [...files]
      .filter(([file, code]) => !isLanding(file) && code.includes("--sai-landing-"))
      .map(([file]) => file);

    expect(
      pelanggar,
      pelanggar.length === 0
        ? ""
        : "Berkas berikut menyebut variabel skala pemasaran:\n\n  " +
            pelanggar.join("\n  ") +
            "\n\nVariabel itu HANYA dideklarasikan di dalam `[data-landing]`, jadi " +
            "di luar pendaratan ia tidak pernah teratasi: teksnya diam-diam " +
            "mewarisi ukuran induknya, dan tidak ada yang gagal. Kalau yang " +
            "dibutuhkan memang ukuran besar, pakai skala heading AntD " +
            "(`--ant-font-size-heading-*`) — itulah langit-langit app internal."
    ).toEqual([]);
  });

  it("atribut `data-landing` hanya dipasang di dalam direktorinya", () => {
    const pelanggar = [...files]
      .filter(([file, code]) => !isLanding(file) && code.includes("data-landing"))
      .map(([file]) => file);

    expect(
      pelanggar,
      pelanggar.length === 0
        ? ""
        : "Atribut `data-landing*` dipasang di luar `components/landing/**`:\n\n  " +
            pelanggar.join("\n  ") +
            "\n\nMenyalin atributnya tidak membawa skalanya ikut — blok gayanya " +
            "hanya ada di dokumen yang merender `LandingShell` — tapi ia MENGAKU " +
            "sebagai permukaan pemasaran, dan penjaga di atas jadi berbohong."
    ).toEqual([]);
  });

  it("akarnya dipasang tepat satu berkas: landing-shell.tsx", () => {
    const akar = [...files]
      .filter(([, code]) => /data-landing=""/.test(code))
      .map(([file]) => file);
    expect(akar).toEqual([`${LANDING_DIR}landing-shell.tsx`]);
  });
});

describe("blok skala terkurung di dalam [data-landing]", () => {
  /** Pasangan selektor → badan, dari teks CSS-nya sendiri. */
  const blok = [...LANDING_STYLE.matchAll(/([^{}@]+)\{([^{}]*)\}/g)].map((m) => ({
    selektor: m[1].trim(),
    isi: m[2],
  }));

  it("terurai — kalau tidak, tiga tes di bawah lulus tanpa memeriksa apa pun", () => {
    expect(blok.length).toBeGreaterThan(5);
    expect(blok.some((b) => b.isi.includes("--sai-landing-font-size-hero"))).toBe(true);
  });

  it("setiap deklarasi `--sai-landing-*` berada di selektor ber-[data-landing]", () => {
    const bocor = blok
      .filter((b) => /--sai-landing-[a-z-]+\s*:/.test(b.isi))
      .filter((b) => !b.selektor.includes("[data-landing]"))
      .map((b) => b.selektor);

    expect(
      bocor,
      "Skala pemasaran dideklarasikan di selektor yang bukan `[data-landing]`:\n\n  " +
        bocor.join("\n  ") +
        "\n\nDeklarasi di `:root` (atau `html`/`body`/`*`) membuat hero 53px " +
        "tersedia bagi SETIAP halaman aplikasi — termasuk halaman yang membaca " +
        "buku besar. Justru pengurungan inilah yang membuat batas dua dunia " +
        "menjadi mekanisme, bukan imbauan."
    ).toEqual([]);
  });

  it("tidak ada selektor global sama sekali di blok pendaratan", () => {
    const global = blok
      .map((b) => b.selektor)
      .filter((s) => /(^|,)\s*(:root|html|body|\*)\b/.test(s));
    expect(global, "Selektor global di blok pendaratan").toEqual([]);
  });

  it("setiap variabel yang DIPAKAI juga dideklarasikan", () => {
    const dideklarasikan = new Set(
      [...LANDING_STYLE.matchAll(/(--sai-landing-[a-z-]+)\s*:/g)].map((m) => m[1])
    );
    const dipakai = new Set<string>();
    for (const [file, code] of files) {
      if (!isLanding(file)) continue;
      for (const m of code.matchAll(/var\((--sai-landing-[a-z-]+)/g)) dipakai.add(m[1]);
    }

    const hantu = [...dipakai].filter((v) => !dideklarasikan.has(v)).sort();
    expect(
      hantu,
      "Variabel skala dipakai tapi tidak pernah dideklarasikan:\n\n  " +
        hantu.join("\n  ") +
        "\n\nSalah ketik pada properti kustom TIDAK menghasilkan galat apa pun — " +
        "nilainya kosong dan elemennya mewarisi induknya. Ini satu-satunya " +
        "tempat yang bisa menangkapnya."
    ).toEqual([]);
  });
});

describe("skala pemasaran adalah TURUNAN skala aplikasi", () => {
  it("hero melampaui heading terbesar app, dan lewat token app", () => {
    /*
     * Izin "pendaratan boleh punya tokennya sendiri" hanya sah selama tokennya
     * TURUNAN: kalau ia berdiri di atas angka sendiri, ia menjadi tipografi
     * kedua yang bisa menyimpang dari aplikasi tanpa ada yang tahu. Bentuk yang
     * dituntut karena itu `calc(var(--ant-font-size-heading-1) * n)`, n > 1 —
     * hero HARUS lebih besar dari langit-langit app, dan harus ikut bergerak
     * kalau skala app bergeser.
     *
     * ⚠ Sejak hero menjadi FLUID (`clamp()`), yang diperiksa bukan lagi satu
     * angka melainkan KEDUA UJUNGNYA — dan itu justru lebih ketat daripada
     * sebelumnya. Suku tengah `clamp()` boleh berbasis viewport (`vw`): ia
     * hanya menentukan laju di antara dua ujung yang keduanya turunan token
     * aplikasi, jadi hero tidak bisa menyimpang keluar dari skala app di
     * ukuran layar mana pun. Yang TIDAK boleh adalah ujung yang berupa angka
     * mati — di situlah tipografi kedua lahir.
     */
    const ujung = [
      ...LANDING_STYLE.matchAll(/calc\(var\(--ant-font-size-heading-1\)\s*\*\s*([\d.]+)\)/g),
    ].map((m) => Number(m[1]));

    expect(
      ujung.length,
      "hero tidak menyebut `--ant-font-size-heading-1` sama sekali — " +
        "kalau ia kini berdiri di atas angka sendiri, skala pemasaran sudah " +
        "menjadi tipografi kedua yang bisa menyimpang tanpa ada yang tahu"
    ).toBeGreaterThanOrEqual(2);

    // Setiap ujung harus MELAMPAUI langit-langit app, bukan hanya yang terbesar.
    for (const n of ujung) expect(n).toBeGreaterThan(1);
  });

  it("hanya LEBAR yang boleh berupa angka telanjang", () => {
    /*
     * Aplikasi internal tidak punya token untuk "kolom baca" — ia memang tidak
     * pernah membutuhkannya (tabel 12 kolom memakai lebar penuh area kerja).
     * Ketiga lebar itu karena itu satu-satunya nilai yang tidak diturunkan;
     * setiap nilai lain wajib menyebut sebuah token `--ant-`.
     */
    const mandiri = [...LANDING_STYLE.matchAll(/(--sai-landing-[a-z-]+):\s*([^;{}]+)/g)]
      .filter(([, , nilai]) => !nilai.includes("var(--ant-"))
      .map(([, nama]) => nama)
      .sort();

    expect(mandiri).toEqual([
      "--sai-landing-font-weight-display",
      "--sai-landing-measure",
      "--sai-landing-measure-copy",
      "--sai-landing-measure-narrow",
      "--sai-landing-tracking-hero",
    ]);
  });
});
