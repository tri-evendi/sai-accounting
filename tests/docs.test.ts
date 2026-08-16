/**
 * Dokumentasi sistem `/docs` — penjaganya (issue #300).
 *
 * ══ Empat hal yang dijaga, dan kenapa masing-masing ════════════════════════
 *
 *  1. **KELENGKAPAN.** Setiap item di `NAV_GROUPS` punya halaman dokumen ATAU
 *     berdiri di `NAV_TANPA_DOKUMEN` dengan alasan yang ditulis. Yang dijaga
 *     BUKAN "semuanya sudah ditulis" — itu tidak akan pernah benar dan penjaga
 *     yang menuntutnya akan dilonggarkan sampai tak berarti — melainkan bahwa
 *     sebuah modul tidak bisa lahir DIAM-DIAM tanpa dokumen. Polanya sama
 *     dengan `tests/print-label-dictionary.test.ts` (#298) dan penjaga kunci
 *     yatim (#260): daftar pengecualian yang dijaga DUA ARAH, sehingga entri
 *     basi juga merah.
 *
 *  2. **PERMUKAAN KETIGA.** Dokumentasi tidak boleh mewarisi bentuk pemasaran
 *     maupun chrome app internal. Sisi pemasaran sudah ditutup
 *     `tests/landing-boundary.test.ts` tanpa satu baris pun ditambahkan di sana
 *     (hanya halaman `app/(marketing)/` yang boleh mengimpor `components/landing/**`) —
 *     dan tes di bawah MEMBUKTIKAN penjaga itu benar-benar mencakup direktori
 *     ini, alih-alih mengandaikannya. Sisi app internal belum dijaga siapa pun,
 *     dan itu yang ditutup di sini.
 *
 *  3. **PUBLIK adalah sifat, bukan janji.** `isDocsPath` dipakai `src/proxy.ts`;
 *     kalau pemakaian itu hilang, seluruh `/docs` mulai memantul ke `/login`
 *     dan tidak ada tes halaman mana pun yang akan menyebutkannya.
 *
 *     ⚠ Sejak "satu halaman, dua kulit", subpohon ini MEMBACA sesi — di satu
 *     berkas, `src/app/(app)/(docs)/layout.tsx`, dan hanya untuk memilih chrome.
 *     Bacaan itu bersifat "kalau ada": `pembacaDokumentasi()` menjawab `null`
 *     alih-alih memantulkan, dan describe "dua kulit" di bawah menguncinya —
 *     nol penjaga, nol `redirect()`, nol `notFound()` di jalur kulit.
 *
 *  4. **ISTILAH TIDAK DISALIN.** Definisi hidup di `lib/labels.ts` (#21/#1).
 *     Prosa yang menyalinnya melahirkan definisi kedua yang akan berselisih
 *     pada perubahan berikutnya.
 *
 * ⚠ Penjaga ini sudah dilihat MERAH sebelum dianggap selesai — modul palsu
 * disuntikkan ke `NAV_GROUPS`, dijalankan, lalu dikembalikan (dicatat di badan
 * PR). Penjaga yang tidak pernah dilihat merah bukan penjaga.
 */
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

import { NAV_GROUPS, NAV_HOME } from "@/lib/nav";
import {
  DOCS_ROOT,
  DOC_BRANCHES,
  DOC_INDEX,
  NAV_TANPA_DOKUMEN,
  docAnchor,
  docBySlug,
  docForNavHref,
  docForPathname,
  docsInBranch,
  docsPath,
  isDocsPath,
} from "@/lib/docs";
import { DOC_BLOCKS } from "@/lib/docs-content";
import { TERM_LIST } from "@/lib/labels";
import { PERMISSIONS } from "@/lib/authz";

const ROOT = join(__dirname, "..");
const SRC = join(ROOT, "src");
const DOCS_APP_DIR = join(SRC, "app", "(app)", "(docs)");
const DOCS_COMPONENT_DIR = join(SRC, "components", "docs");

function sourceFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return /\.tsx?$/.test(entry.name) ? [full] : [];
  });
}

const rel = (p: string) => p.slice(SRC.length + 1).split("\\").join("/");

/** Berkas yang MEMBENTUK permukaan dokumentasi — halaman + komponennya. */
const BERKAS_DOKUMENTASI = new Map<string, string>(
  [...sourceFiles(DOCS_APP_DIR), ...sourceFiles(DOCS_COMPONENT_DIR)].map((f) => [
    rel(f),
    readFileSync(f, "utf8"),
  ])
);

const NAV_ITEMS = [NAV_HOME, ...NAV_GROUPS.flatMap((g) => g.items)];

/**
 * SATU berkas yang boleh mengimpor chrome app internal — kulit yang dipakai
 * pembaca yang sedang bersesi.
 *
 * Pengecualiannya sengaja berupa satu NAMA BERKAS, bukan sebuah pelonggaran
 * direktori: yang dijaga daftar-IZIN di bawah adalah berkas-berkas yang dibaca
 * TANPA sesi, dan melonggarkannya untuk `components/docs/**` akan membuka jalan
 * yang sama bagi kolom baca, daftar isi, dan pengalih halaman — yang tidak
 * satu pun punya alasan menyentuh chrome.
 */
const KULIT_APLIKASI = "components/docs/docs-app-chrome.tsx";

describe("pemindainya memindai yang benar", () => {
  it("menemukan halaman & komponen dokumentasi", () => {
    // Tanpa ini, jalur yang salah tulis membuat SEMUA tes di bawah lulus
    // dengan daftar kosong — kelas kegagalan yang §Penjaga MASTER.md sebut
    // sebagai "terbaca benar, tidak menjaga apa pun".
    expect(BERKAS_DOKUMENTASI.size).toBeGreaterThanOrEqual(5);
    expect([...BERKAS_DOKUMENTASI.keys()]).toContain("app/(app)/(docs)/docs/page.tsx");
    expect([...BERKAS_DOKUMENTASI.keys()]).toContain("components/docs/docs-shell.tsx");
  });

  it("menemukan item navigasi untuk dibandingkan", () => {
    expect(NAV_ITEMS.length).toBeGreaterThan(30);
  });
});

describe("kelengkapan: modul baru tidak bisa lahir tanpa dokumen", () => {
  it("setiap item navigasi punya halaman dokumen ATAU alasan tertulis", () => {
    const yatim = NAV_ITEMS.filter(
      (item) => !docForNavHref(item.href) && !(item.href in NAV_TANPA_DOKUMEN)
    ).map((item) => `${item.href} (${item.label})`);

    expect(
      yatim,
      yatim.length === 0
        ? ""
        : "Item navigasi berikut tidak dijelaskan satu halaman dokumen pun, dan " +
            "tidak terdaftar sebagai pengecualian:\n\n  " +
            yatim.join("\n  ") +
            "\n\nDua jalan keluar, dan keduanya keputusan yang terlihat di diff:\n" +
            "  • sebut `href`-nya di `navHrefs` sebuah halaman di `lib/docs.ts` " +
            "(halaman baru butuh isinya di `lib/docs-content.ts`), ATAU\n" +
            "  • tambahkan barisnya ke `NAV_TANPA_DOKUMEN` BESERTA sebabnya.\n\n" +
            "Yang dijaga di sini bukan “semuanya sudah ditulis” — melainkan bahwa " +
            "sebuah modul tidak bisa lahir diam-diam tanpa dokumen."
    ).toEqual([]);
  });

  it("setiap pengecualian menyebut sebabnya, dan sebabnya bukan basa-basi", () => {
    const kosong = Object.entries(NAV_TANPA_DOKUMEN)
      .filter(([, alasan]) => alasan.trim().length < 40)
      .map(([href]) => href);
    expect(
      kosong,
      "Pengecualian tanpa alasan yang bisa dibaca:\n\n  " + kosong.join("\n  ")
    ).toEqual([]);
  });

  it("daftar pengecualian tidak menyimpan entri BASI (dijaga dua arah)", () => {
    /*
     * Arah kedua, dan inilah yang biasanya hilang: sebuah daftar pengecualian
     * yang hanya boleh BERTAMBAH akan menyimpan modul yang sudah dihapus dan
     * modul yang sudah punya dokumennya — dan yang membacanya kelak akan
     * menyangka keduanya masih menunggu.
     */
    const hrefNav = new Set(NAV_ITEMS.map((item) => item.href));
    const basi = Object.keys(NAV_TANPA_DOKUMEN).filter(
      (href) => !hrefNav.has(href) || docForNavHref(href) !== undefined
    );
    expect(
      basi,
      "Entri `NAV_TANPA_DOKUMEN` yang sudah tidak berlaku — modulnya hilang dari " +
        "navigasi, atau justru sudah punya halaman dokumen:\n\n  " +
        basi.join("\n  ")
    ).toEqual([]);
  });

  it("setiap `navHrefs` menunjuk item navigasi yang benar-benar ada", () => {
    const hrefNav = new Set(NAV_ITEMS.map((item) => item.href));
    const hantu = DOC_INDEX.flatMap((page) =>
      (page.navHrefs as readonly string[])
        .filter((href) => !hrefNav.has(href))
        .map((href) => `${page.slug} → ${href}`)
    );
    expect(
      hantu,
      "Halaman dokumen menyebut modul yang tidak ada di navigasi:\n\n  " +
        hantu.join("\n  ") +
        "\n\nSalah ketik di `navHrefs` tidak menghasilkan galat apa pun — ia hanya " +
        "membuat modulnya terhitung yatim dan tautan kontekstualnya tidak pernah muncul."
    ).toEqual([]);
  });

  it("satu modul dijelaskan paling banyak satu halaman", () => {
    const dipakai = DOC_INDEX.flatMap((p) => [...p.navHrefs]);
    const ganda = dipakai.filter((href, i) => dipakai.indexOf(href) !== i);
    expect(ganda, "Modul disebut dua halaman dokumen sekaligus").toEqual([]);
  });
});

describe("daftar isi", () => {
  it("slug unik dan aman sebagai segmen URL", () => {
    const slugs = DOC_INDEX.map((p) => p.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const slug of slugs) expect(slug).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
  });

  it("kedua cabang berisi — daftar isi satu cabang bukan daftar isi dua pembaca", () => {
    for (const cabang of DOC_BRANCHES) {
      expect(docsInBranch(cabang).length, `cabang ${cabang} kosong`).toBeGreaterThan(0);
    }
  });

  it("setiap halaman punya isi, dan setiap isi punya halaman", () => {
    // `tsc` sudah menjamin bentuk `Record<DocSlug, …>`; yang tak terlihat
    // olehnya adalah larik KOSONG — halaman yang ada di daftar isi lalu
    // membuka menjadi judul tanpa satu kalimat pun.
    for (const page of DOC_INDEX) {
      expect(DOC_BLOCKS[page.slug].length, `${page.slug} tanpa isi`).toBeGreaterThan(2);
    }
    expect(Object.keys(DOC_BLOCKS).sort()).toEqual(DOC_INDEX.map((p) => p.slug).sort());
  });

  it("`docBySlug` menemukan yang ada dan tidak mengarang yang tidak ada", () => {
    expect(docBySlug(DOC_INDEX[0].slug)?.slug).toBe(DOC_INDEX[0].slug);
    expect(docBySlug("halaman-yang-tidak-pernah-ditulis")).toBeUndefined();
  });
});

describe("tautan kontekstual dari dalam aplikasi", () => {
  it("kecocokan TERPANJANG yang menang — aturan yang sama dengan menu aktif", () => {
    /*
     * `/inventory` dan `/inventory/opname` sama-sama disebut halaman Stok hari
     * ini, tetapi bila kelak opname punya halamannya sendiri, alamat opname
     * harus mendarat di sana — bukan di halaman yang kebetulan berawalan sama.
     */
    const stok = docForPathname("/inventory");
    expect(stok?.slug).toBe("stok");
    expect(docForPathname("/inventory/opname")?.slug).toBe("stok");
  });

  it("bekerja pada jalur BERTENANT, bukan hanya jalur lama", () => {
    // Setiap halaman modul sungguhan beralamat `/t/{tenant}/{company}/…`; kalau
    // pemetaannya hanya mengenal jalur lama, tautan kontekstualnya tidak pernah
    // muncul di satu pun halaman nyata.
    expect(docForPathname("/t/acme/cv-maju/periods")?.slug).toBe("periode-terkunci");
  });

  it("alamat yang tak punya dokumen menjawab undefined, bukan halaman pertama", () => {
    expect(docForPathname("/settings")).toBeUndefined();
    expect(docForPathname("/t/acme/cv-maju/settings")).toBeUndefined();
  });
});

describe("jangkar sub-judul", () => {
  it("diturunkan dari judulnya, dan unik di dalam satu halaman", () => {
    for (const page of DOC_INDEX) {
      const jangkar = DOC_BLOCKS[page.slug]
        .filter((b) => b.kind === "sub")
        .map((b) => docAnchor(b.judul));
      expect(new Set(jangkar).size, `${page.slug} punya jangkar kembar`).toBe(jangkar.length);
      for (const a of jangkar) expect(a).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    }
  });
});

describe("bentuk alamat & pelepasan proxy", () => {
  it("`isDocsPath` mengenali akar & anaknya, dan menolak tetangga yang mirip", () => {
    expect(isDocsPath(DOCS_ROOT)).toBe(true);
    expect(isDocsPath(docsPath("stok"))).toBe(true);
    // `startsWith("/docs")` telanjang akan melepaskan keduanya — dan rute
    // seperti itu bisa lahir tanpa mengingatkan siapa pun.
    expect(isDocsPath("/docsx")).toBe(false);
    expect(isDocsPath("/document")).toBe(false);
    expect(isDocsPath("/documents")).toBe(false);
  });

  it("proxy benar-benar MEMAKAI `isDocsPath` untuk melepaskannya", () => {
    /*
     * Tanpa pemakaian itu seluruh `/docs` memantul ke `/login` — dan gejalanya
     * bukan galat melainkan halaman masuk, yaitu persis keadaan yang issue #300
     * dibuat untuk mengakhiri.
     */
    const proxy = readFileSync(join(SRC, "proxy.ts"), "utf8");
    expect(proxy).toContain('from "@/lib/docs"');
    expect(proxy).toContain("isDocsPath(pathname)");
  });
});

describe("permukaan KETIGA: bukan pemasaran, bukan meja kerja", () => {
  it("tidak mengimpor apa pun dari components/landing — dan penjaganya memang mencakupnya", () => {
    /*
     * Sisi ini sudah ditutup `tests/landing-boundary.test.ts` (hanya halaman
     * `app/(marketing)/` yang boleh mengimpornya), jadi yang dilakukan di sini
     * bukan menduplikasi aturannya melainkan MEMBUKTIKAN cakupannya: berkas
     * dokumentasi berdiri di luar `PINTU_MASUK`, sehingga sebuah impor ke sana
     * akan memerahkan penjaga itu. Sanity check di bawah menjaga agar keadaan
     * hari ini memang begitu.
     */
    const pelanggar = [...BERKAS_DOKUMENTASI]
      .filter(([, kode]) => /["']@\/components\/landing/.test(kode))
      .map(([berkas]) => berkas);
    expect(pelanggar).toEqual([]);

    const landingGuard = readFileSync(join(ROOT, "tests", "landing-boundary.test.ts"), "utf8");
    expect(landingGuard).toContain(
      'const PINTU_MASUK = ["app/(marketing)/page.tsx", "app/(marketing)/harga/page.tsx"];'
    );
  });

  it("tidak mengimpor chrome app internal — sisi yang belum dijaga siapa pun", () => {
    /*
     * Halaman ini dibaca orang yang belum punya sesi. Setiap impor ke chrome
     * dasbor, panel setelan, atau komponen bersama adalah satu jalan bagi kode
     * ber-`auth()`/ber-Prisma untuk ikut ke permukaan publik — bentuk kegagalan
     * yang sama yang membuat `components/landing/**` diberi daftar-IZIN impor
     * di #245. Bentuknya karena itu IZIN, bukan larangan: daftar larangan
     * selalu tertinggal satu direktori.
     *
     * ⚠ `"next"` DIBANDINGKAN PERSIS, dan `"next/"` sebagai awalan — bukan
     * `startsWith("next")`. Bentuk longgar itu ikut melepaskan `next-auth`,
     * `next-auth/react`, dan setiap paket pihak ketiga yang namanya kebetulan
     * berawalan sama; sebuah lubang yang tidak pernah berbunyi.
     */
    const SAH = [
      "@/components/docs/",
      "@/components/ui/",
      "@/lib/",
      "react",
      "@ant-design/icons",
    ];
    const nextSendiri = (spec: string) => spec === "next" || spec.startsWith("next/");
    const IMPOR = /^\s*import\s+(?:type\s+)?(?:[^;]*?\s+from\s+)?["']([^"']+)["']/gm;

    const pelanggar: string[] = [];
    for (const [berkas, kode] of BERKAS_DOKUMENTASI) {
      if (berkas === KULIT_APLIKASI) continue;
      for (const m of kode.matchAll(IMPOR)) {
        const spec = m[1];
        if (nextSendiri(spec)) continue;
        if (SAH.some((ok) => spec === ok || spec.startsWith(ok))) continue;
        pelanggar.push(`${berkas} — ${spec}`);
      }
    }
    expect(
      pelanggar,
      "Permukaan dokumentasi mengimpor di luar primitif, lib, dan sesama berkas " +
        "dokumentasi:\n\n  " +
        pelanggar.join("\n  ") +
        "\n\nHalaman ini dibaca tanpa sesi. Kalau yang dibutuhkan sebuah kendali, " +
        "ambil primitifnya dari `@/components/ui`; kalau sebuah angka atau daftar, " +
        "ambil sumbernya dari `@/lib`.\n\nSatu berkas dikecualikan — " +
        KULIT_APLIKASI +
        " — dan pengecualiannya dijaga tesnya sendiri di bawah."
    ).toEqual([]);
  });

  it("pengecualian daftar-IZIN itu SATU berkas, dan ia memang ada", () => {
    /*
     * Arah kedua dari pengecualian di atas. Tanpa tes ini, `KULIT_APLIKASI`
     * yang salah tulis akan diam-diam membuat daftar izinnya berlaku penuh
     * (tidak ada yang dilewati) ATAU — jauh lebih buruk — sebuah berkas kedua
     * bisa diberi nama yang sama lalu ikut lolos tanpa siapa pun memutuskannya.
     */
    expect([...BERKAS_DOKUMENTASI.keys()]).toContain(KULIT_APLIKASI);

    const kode = BERKAS_DOKUMENTASI.get(KULIT_APLIKASI) ?? "";
    // Yang boleh diimpornya di luar daftar SAH: kulit panel akun, dan itu saja.
    expect(kode).toContain('from "@/components/tenant/platform-shell"');
    // Kerangka dasbor TIDAK. Alasannya di kepala `src/lib/docs-chrome.tsx`:
    // ia menyusun menunya dari peran DI SEBUAH PT dan karena itu memutar layar
    // pemuatan selamanya bagi pembaca yang belum punya satu pun PT.
    for (const dilarang of [
      "@/components/layout/sidebar",
      "@/components/layout/navbar",
      "@/app/(app)/(dashboard)",
    ]) {
      expect(kode, `${KULIT_APLIKASI} menyeret kerangka dasbor`).not.toContain(dilarang);
    }
  });

  it("tidak menyentuh skala pemasaran, dan tidak mengaku sebagai pendaratan", () => {
    for (const [berkas, kode] of BERKAS_DOKUMENTASI) {
      expect(kode, `${berkas} menyebut skala pemasaran`).not.toContain("--sai-landing-");
      expect(kode, `${berkas} mengaku permukaan pemasaran`).not.toContain("data-landing");
    }
  });

  it("langit-langit tipografinya DI BAWAH langit-langit app internal", () => {
    /*
     * App internal berhenti di `fontSizeHeading1` (38px, MASTER.md §Pemasaran
     * vs App); pendaratan melampauinya dengan sengaja. Dokumentasi berhenti
     * satu tingkat LEBIH RENDAH — `fontSizeHeading2` — sehingga ia tidak pernah
     * bisa terbaca sebagai halaman jualan, bahkan kalau kelak seseorang menyalin
     * bentuk hero ke sini tanpa membaca satu komentar pun.
     */
    for (const [berkas, kode] of BERKAS_DOKUMENTASI) {
      expect(kode, `${berkas} memakai skala judul app internal`).not.toContain(
        "--ant-font-size-heading-1"
      );
    }
    const shell = BERKAS_DOKUMENTASI.get("components/docs/docs-shell.tsx") ?? "";
    expect(shell).toContain("--ant-font-size-heading-2");
  });

  it("NOL tombol berisi penuh — dokumentasi tidak mengikat apa pun", () => {
    /*
     * §Aksi utama per layar: "satu aksi utama per layar; nol juga sah". Sebuah
     * permukaan yang hanya menjelaskan tidak memajukan apa pun, jadi jawabannya
     * nol — dan pengulangan CTA adalah salah satu dari empat dimensi yang
     * membuat sebuah halaman menjadi PEMASARAN.
     */
    for (const [berkas, kode] of BERKAS_DOKUMENTASI) {
      expect(kode, `${berkas} memasang tombol berisi penuh`).not.toContain('variant="primary"');
    }
  });
});

describe("satu halaman, DUA kulit", () => {
  const LAYOUT = "app/(app)/(docs)/layout.tsx";
  const layout = BERKAS_DOKUMENTASI.get(LAYOUT) ?? "";
  const viewer = readFileSync(join(SRC, "lib", "docs-viewer.ts"), "utf8");

  it("kulitnya dipilih di LAYOUT, dan kedua halaman tetap bersih dari sesi", () => {
    /*
     * Kalau pemilihan kulit turun ke halaman, dua hal patah sekaligus: janji
     * `tests/authz-coverage` ("halaman grup (docs) tidak menyentuh sesi") dan
     * jaminan bahwa halaman dokumentasi BERIKUTNYA ikut mendapat kulit yang
     * benar tanpa penulisnya mengingat apa pun.
     */
    expect([...BERKAS_DOKUMENTASI.keys()]).toContain(LAYOUT);
    expect(layout).toContain("pembacaDokumentasi(");
    expect(layout).toContain("kulitDokumentasi(");

    for (const halaman of ["app/(app)/(docs)/docs/page.tsx", "app/(app)/(docs)/docs/[...slug]/page.tsx"]) {
      const kode = BERKAS_DOKUMENTASI.get(halaman) ?? "";
      expect(kode, `${halaman} membaca sesi`).not.toContain("@/lib/auth");
      expect(kode, `${halaman} membaca sesi`).not.toContain("pembacaDokumentasi");
    }
  });

  it("pembacaan sesinya bersifat “kalau ada”, bukan “harus ada”", () => {
    /*
     * Inilah yang membedakan berkas ini dari sebuah penjaga. Satu `redirect()`
     * yang menyelinap ke jalur pemilihan kulit akan mengubah `/docs` menjadi
     * halaman masuk bagi orang yang paling membutuhkannya — dan gejalanya bukan
     * galat melainkan halaman masuk yang terlihat bekerja.
     */
    for (const [nama, kode] of [
      [LAYOUT, layout],
      ["lib/docs-viewer.ts", viewer],
    ] as const) {
      for (const penjaga of [
        "requirePagePermission(",
        "requireTenantPagePermission(",
        "requirePageSession(",
        "requireOperatorPage(",
        "redirect(",
        "notFound(",
      ]) {
        expect(kode, `${nama} memanggil ${penjaga}`).not.toContain(penjaga);
      }
    }
    // Dan jawabannya memang punya bentuk "tidak ada pembaca".
    expect(viewer).toContain("Promise<PembacaDokumentasi | null>");
  });

  it("kolom baca 768px ditulis SEKALI dan dipakai kedua kulit", () => {
    /*
     * MASTER.md §Dokumentasi mengikat 768. Angka yang disalin ke kulit kedua
     * adalah angka yang akan bergeser sendiri — dan yang bergeser adalah kulit
     * APLIKASI, tempat area kerjanya lebar penuh dan kolom yang melebar tidak
     * terlihat salah bagi siapa pun yang tidak membaca tabelnya.
     */
    const shell = BERKAS_DOKUMENTASI.get("components/docs/docs-shell.tsx") ?? "";
    expect(shell).toContain("const LEBAR_BACA = 768");

    const menulisSendiri = [...BERKAS_DOKUMENTASI]
      .filter(([berkas]) => berkas !== "components/docs/docs-shell.tsx")
      .filter(([, kode]) => /\b768\b/.test(kode))
      .map(([berkas]) => berkas);
    expect(menulisSendiri, "Angka 768 disalin di luar `docs-shell.tsx`").toEqual([]);

    for (const kulit of [KULIT_APLIKASI, "components/docs/docs-public-chrome.tsx"]) {
      const kode = BERKAS_DOKUMENTASI.get(kulit) ?? "";
      expect(kode, `${kulit} tidak memakai kolom baca bersama`).toContain("KOLOM_BACA");
    }
  });

  it("hanya SATU `<main>` di kedua kulit — `Layout.Content` sudah merendernya", () => {
    /*
     * `Layout.Content` AntD merender `<main>`-nya sendiri. Sebuah `<main>` yang
     * ditulis di dalam kolom baca akan bersarang di sana: markup tak sah, dan
     * dua tengara "main" bagi pembaca layar — cacat yang tidak terlihat sama
     * sekali di layar.
     */
    /*
     * Komentar dibuang lebih dulu: ketiga berkas di bawah MENJELASKAN aturan
     * ini di prosanya, dan sebuah penjaga yang merah karena penjelasannya
     * sendiri akan dilonggarkan pada perubahan berikutnya.
     */
    const kode = (berkas: string) =>
      (BERKAS_DOKUMENTASI.get(berkas) ?? "").replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");

    expect(kode("components/docs/docs-public-chrome.tsx")).toContain("<main");
    for (const berkas of ["components/docs/docs-shell.tsx", KULIT_APLIKASI]) {
      expect(
        kode(berkas),
        `${berkas} menulis tengara main di dalam kulit yang sudah punya satu`
      ).not.toContain("<main");
    }
  });
});

describe("istilah dibaca, tidak disalin (#21/#1)", () => {
  it("tidak satu pun definisi kamus diketik ulang di dalam prosa dokumentasi", () => {
    const prosa = readFileSync(join(SRC, "lib", "docs-content.ts"), "utf8");
    const disalin = TERM_LIST.filter((entri) => prosa.includes(entri.definisi)).map((e) => e.key);
    expect(
      disalin,
      "Definisi istilah disalin ke dalam prosa dokumentasi:\n\n  " +
        disalin.join("\n  ") +
        "\n\nDefinisi ditulis SEKALI di `lib/labels.ts` (#21) dan dibaca blok " +
        "`istilah`. Salinan kedua akan berselisih dengan yang pertama pada " +
        "perubahan berikutnya, dan yang salah adalah yang tidak dibaca siapa pun."
    ).toEqual([]);
  });

  it("setiap blok istilah menunjuk entri kamus yang benar-benar ada", () => {
    const dikenal = new Set(TERM_LIST.map((e) => e.key));
    const hantu = DOC_INDEX.flatMap((page) =>
      DOC_BLOCKS[page.slug]
        .filter((b) => b.kind === "istilah")
        .flatMap((b) => b.kunci.filter((k) => !dikenal.has(k)).map((k) => `${page.slug} → ${k}`))
    );
    expect(hantu).toEqual([]);
  });
});

describe("peran & izin DIBANGKITKAN, bukan disalin (#73)", () => {
  const halaman = DOC_INDEX.find((p) =>
    (p.navHrefs as readonly string[]).includes("/permissions")
  );
  const matriks = readFileSync(
    join(SRC, "components", "docs", "permission-matrix.tsx"),
    "utf8"
  );

  it("halamannya ada dan memuat blok bangkitan", () => {
    expect(halaman, "tidak ada halaman dokumen untuk /permissions").toBeDefined();
    const blok = DOC_BLOCKS[halaman!.slug];
    expect(blok.some((b) => b.kind === "matriks-izin")).toBe(true);
  });

  it("perendernya membaca `PERMISSION_ROLES`, bukan tabel yang diketik", () => {
    expect(matriks).toContain("PERMISSION_ROLES");
    expect(matriks).toContain("ROLE_VALUES");
    // Nama peran yang diketik di perendernya = tabel tangan yang menyamar.
    for (const peran of ["managing_director", "finance_manager", "warehouse_head"]) {
      expect(matriks, `nama peran ${peran} diketik di perender`).not.toContain(peran);
    }
    // Begitu pula nama izin: satu saja berarti tabelnya sebagian disalin.
    const izinDiketik = PERMISSIONS.filter((p) => matriks.includes(`"${p}"`));
    expect(izinDiketik).toEqual([]);
  });

  it("halamannya menyebut dirinya BAWAAN yang bisa ditimpa — dua lapis, keduanya disebut", () => {
    /*
     * Tanpa kalimat ini, tabel bangkitan justru lebih berbahaya daripada tabel
     * tangan: ia terlihat berwibawa DAN salah di setiap tenant yang menimpanya.
     * Dua lapis yang membuatnya bukan kebenaran tetap — override per sel (#73)
     * dan peran sebagai DATA — keduanya harus disebut, karena menyebut satu
     * saja meninggalkan pembaca dengan setengah kesimpulan yang salah.
     */
    const teks = DOC_BLOCKS[halaman!.slug]
      .map((b) =>
        b.kind === "paragraf" || b.kind === "catatan"
          ? b.teks
          : b.kind === "poin"
            ? b.butir.join(" ")
            : ""
      )
      .join(" ")
      .toLowerCase();
    expect(teks, "tidak menyebut dirinya bawaan").toContain("bawaan");
    expect(teks, "tidak menyebut override per sel").toContain("ditimpa");
    expect(teks, "tidak menyebut peran sebagai data").toContain("data");
  });
});
