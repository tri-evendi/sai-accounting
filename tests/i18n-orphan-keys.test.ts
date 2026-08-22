/**
 * Kunci kamus YATIM — kunci yang tidak dirujuk satu baris pun di `src/`
 * (issue #260).
 *
 * ══ Kenapa penjaga ini ada, dan kenapa `tsc` tidak bisa menggantikannya ═════
 *
 * Kamus repo ini bertipe **dot-path** (`DictionaryKey` di `lib/i18n/dictionary.ts`),
 * jadi kunci yang HILANG adalah galat `tsc`. Itu fitur, dan itulah yang membuat
 * terjemahan yang belum ditulis mustahil lolos. Tetapi hubungan itu **satu
 * arah**: kunci yang MENGANGGUR tidak melanggar tipe apa pun. Ia hanya
 * menumpuk — di tiga bahasa sekaligus — sampai seseorang kebetulan mencarinya.
 *
 * Ongkosnya bukan ukuran berkas: penerjemah berikutnya merawat kalimat yang
 * tidak dipakai siapa pun, dan pembaca berikutnya menyangka kalimat itu masih
 * menggambarkan perilaku aplikasi.
 *
 * Kelasnya berulang, bukan kejadian tunggal: #216 meninggalkan tiga kunci,
 * #263 (PR #296) mencabut tujuh kunci keluarga `searchPlaceholder`, dan saat
 * penjaga ini pertama dijalankan ia menemukan **25** — sepuluh kali lipat dari
 * yang disebut di badan issue.
 *
 * ══ Bagaimana sebuah kunci dianggap DIRUJUK ════════════════════════════════
 *
 * Empat bentuk, dan hanya empat — diukur dengan parser TypeScript atas seluruh
 * `src/`, bukan `grep`. (Di repo ini `grep` atas sumber sudah berkali-kali
 * memberi angka yang salah; lihat kepala `tests/anchor-button-nesting.test.ts`.)
 *
 *  1. **Literal string** yang isinya persis jalur-titik kunci itu —
 *     `t("common.save")`, `labelKey: "nav.items.contracts"`. Ini jalur
 *     mayoritas mutlak: 3.117 dari 3.366 kunci saat penjaga ini ditulis.
 *
 *  2. **Rantai properti berakar kamus** — `dictionary.status.contract.signed`.
 *     Dipakai peta label bertipe penuh di `lib/i18n/labels.ts` (issue #68):
 *     di sana kuncinya memang BUKAN string, melainkan akses properti, supaya
 *     `tsc` menolak nilai enum baru yang belum punya label.
 *
 *  3. **Cabang yang diambil UTUH** — `useDictionary()?.accounts.accurateType`,
 *     lalu diindeks dengan nilai runtime (`legend?.[row.code]`). Di sini
 *     penjaga BUTA terhadap daun mana yang benar-benar dibaca, jadi seluruh
 *     subpohonnya dikecualikan. Daftarnya `CABANG_UTUH` di bawah, dan ia
 *     dijaga dua arah (lihat "Dua daftar" di bawah).
 *
 *  4. **Kunci yang dirakit template** — `t(`setup.${key}`)`. Prefiksnya
 *     dideklarasikan di `PREFIKS_DINAMIS`; daunnya dianggap dirujuk bila
 *     ADA literal string di `src/` yang, disambung ke prefiks itu,
 *     menghasilkan kunci yang benar-benar ada. Jadi `setup.${key}` di
 *     `setup-wizard.tsx` menghidupkan `setup.introPoint1..3` karena ketiga
 *     namanya memang ditulis sebagai literal di berkas itu — dan TIDAK
 *     menghidupkan sisa namespace `setup.*` yang lain. Ini sengaja lebih
 *     ketat daripada mengecualikan seluruh subpohon: `setup` punya puluhan
 *     kunci, dan mengecualikan semuanya berarti penjaga ini menyerah pada
 *     namespace terbesar keempat di kamus.
 *
 * ══ Dua daftar, dan kenapa keduanya dijaga DUA ARAH ════════════════════════
 *
 * `PREFIKS_DINAMIS` dan `CABANG_UTUH` adalah dua lubang yang disengaja: di
 * kedua bentuk itu kunci yang dipakai memang tidak pernah muncul utuh di
 * sumber. Keputusan itu diambil di depan (issue #260 meminta persis ini:
 * daftar-izin sempit ATAU aturan awalan) dan bentuknya adalah daftar-izin
 * sempit yang **diukur**, bukan ditebak — masing-masing empat dan sembilan
 * entri di seluruh app.
 *
 * Yang membuat daftar semacam ini biasanya membusuk adalah ia hanya dijaga
 * SATU arah: entri boleh ditambah kapan saja untuk membuat merah jadi hijau,
 * dan entri yang sudah tak ada rujukannya tetap duduk di sana selamanya. Dua
 * tes di bawah menutup kedua arah itu:
 *
 *   • entri yang **tidak lagi ada di `src/`** → MERAH (daftar basi);
 *   • bentuk dinamis **baru yang belum terdaftar** → MERAH (pelebaran diam).
 *
 * Jadi menambah `t(`foo.${x}`)` baru memaksa satu baris keputusan di berkas
 * ini, di tempat yang terlihat di diff. Itu memang gesekan; itu memang
 * maksudnya. Yang TIDAK boleh dilakukan adalah melonggarkan daftar ini supaya
 * hijau tanpa menuliskan alasannya di sebelah entrinya.
 *
 * ══ ⚠ Yang penjaga ini TIDAK bisa lihat ════════════════════════════════════
 *
 * Ditulis karena di repo ini lima penjaga sudah ketahuan palsu, tumpul, atau
 * usang modelnya — dan yang membuat mereka bertahan adalah orang yang membaca
 * hijau lalu berhenti bertanya.
 *
 *   • **Kunci yang dirujuk hanya dari `tests/` atau `scripts/`.** Penjaga ini
 *     sengaja hanya membaca `src/`: kunci yang hidup semata-mata karena sebuah
 *     tes menyebutnya BUKAN kunci yang dipakai aplikasi. Konsekuensinya harus
 *     diketahui: mencabut kunci di sini bisa memerahkan sebuah tes, dan itu
 *     urutan yang benar (tes ikut kode, bukan sebaliknya).
 *
 *   • **Literal yang kebetulan sama.** Sebuah literal `"common.save"` di
 *     konteks apa pun — kunci localStorage, nilai uji — dihitung sebagai
 *     rujukan. Penjaga ini menghitung SEBUTAN, bukan pemakaian; ia tidak tahu
 *     apakah `t()` benar-benar dipanggil.
 *
 *   • **Subpohon di `CABANG_UTUH`.** Daun mati di dalam `permission.*`,
 *     `month.*`, atau `reports.catalogReport.*` tidak akan pernah terlihat di
 *     sini. Untuk `permission.*`/`permissionResource.*`/`accountType.*` ada
 *     penjaga LAIN yang menutupinya dari sisi berlawanan: `tests/i18n.test.ts`
 *     membandingkan peta label di `labels.ts` dengan sumber enumnya, sehingga
 *     daun yang tak lagi punya nilai enum akan memerahkan `tsc` di `labels.ts`.
 *     Untuk `reports.catalogReport.*` dan `accounts.accurateType.*` tidak ada
 *     penjaga semacam itu; di sana hanya mata yang bisa menemukannya.
 *
 *   • **Prefiks dinamis yang nilainya tak pernah jadi literal.** Bila sebuah
 *     status langganan hanya ada di basis data dan tidak pernah ditulis
 *     sebagai literal di `src/`, kunci `tenantSettings.status.<status>`-nya
 *     akan dilaporkan yatim walaupun hidup. Itu positif palsu yang MUNGKIN —
 *     hari ini tidak ada satu pun (kesepuluh nilai statusnya ditulis sebagai
 *     literal di kode), dan bila suatu saat muncul, jawabannya adalah menulis
 *     nilai itu sebagai literal di kode (`satisfies` daftar status), bukan
 *     melemahkan penjaga ini.
 *
 *   • **Akar kamus yang tak dikenali.** Rantai properti hanya dilacak bila
 *     akarnya ketahuan memegang kamus: hasil `useDictionary()` /
 *     `getDictionary()` / `getRequestI18n()`, atau sebuah nama yang tipenya
 *     ditulis `Dictionary`. Bila suatu saat kamus mengalir lewat jalur yang
 *     tidak beranotasi (mis. `any`), rantainya tak terlihat dan daun-daunnya
 *     akan dilaporkan yatim. Kegagalannya berisik, bukan senyap — dan itu arah
 *     yang benar.
 *
 * ══ Bukti bahwa penjaga ini bukan hiasan ═══════════════════════════════════
 *
 * Pada jalannya yang pertama ia MERAH dengan 25 kunci di tiga kamus, termasuk
 * ketiga kunci yang disebut issue #260 (`inventory.pickItemFirst`,
 * `inventory.qtyPositive`, `finance.errRateRequired`) dan 22 lain yang belum
 * pernah dicurigai siapa pun — di antaranya enam sisa formulir "Buat Pengguna"
 * (`users.newUser`, `users.createTitle`, `users.passwordField`,
 * `users.creating`, `users.createUser`, `users.errCreate`, `users.created`)
 * yang sudah lama digantikan alur undangan.
 */
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";

const ROOT = join(__dirname, "..");
const SRC = join(ROOT, "src");

/**
 * Prefiks kunci yang dirakit dinamis: `t(`<prefiks>.${x}`)`.
 *
 * Daunnya dicocokkan dengan literal string mana pun di `src/` (lihat bentuk 4
 * di kepala berkas), jadi ini BUKAN pengecualian sesubpohon — hanya izin untuk
 * merakit kunci dari potongan.
 */
const PREFIKS_DINAMIS: ReadonlyArray<{ prefiks: string; alasan: string }> = [
  {
    prefiks: "tenantSettings.status",
    alasan:
      "Status langganan datang dari basis data platform (trialing/active/past_due/…) " +
      "dan dipetakan ke kalimat di delapan tempat: konsol operator dan halaman /platform.",
  },
  {
    prefiks: "tenantSettings.invoiceStatus",
    alasan: "Status tagihan langganan (draft/issued/paid/void) — sama alasannya.",
  },
  {
    prefiks: "setup",
    alasan:
      "Tiga butir pengantar wizard penyiapan dirender lewat " +
      '`(["introPoint1","introPoint2","introPoint3"] as const).map(…)`; ketiga namanya ' +
      "tetap literal di berkas itu, jadi hanya ketiga daun itu yang ikut hidup.",
  },
  {
    prefiks: "auth",
    alasan:
      "Tiga butir nilai jual di panel kiri layar masuk — bentuk `.map()` yang sama " +
      "dengan wizard penyiapan (`brandPoint1..3`).",
  },
];

/**
 * Cabang kamus yang diambil UTUH sebagai nilai lalu diindeks dengan sesuatu
 * yang hanya diketahui saat runtime. Seluruh subpohonnya kebal terhadap
 * penjaga ini — itulah harga bentuknya, dan itulah kenapa daftarnya pendek.
 */
const CABANG_UTUH: ReadonlyArray<{ cabang: string; alasan: string }> = [
  {
    cabang: "accountType",
    alasan: "labels.ts: `accountTypeLabels()` merakit peta dari ACCOUNT_TYPES (issue #68).",
  },
  {
    cabang: "expenseNature",
    alasan:
      "labels.ts: `expenseNatureLabels()` merakit peta dari EXPENSE_NATURES (issue #445) — " +
      "pola yang sama persis dengan `accountType` di atas, dan dengan alasan yang sama: " +
      "daunnya diindeks dengan nilai runtime (`natureLabels[n.value]`), jadi parser buta " +
      "terhadap daun mana yang benar-benar dibaca.",
  },
  {
    cabang: "month",
    alasan: "labels.ts: `monthNames()` mengembalikan larik 12 bulan.",
  },
  {
    cabang: "approvalMessage",
    alasan: "labels.ts: `approvalDecisionMessage()` memilih template menurut status.",
  },
  {
    cabang: "permissionResource",
    alasan: "labels.ts: nama kelompok baris matriks izin (issue #73).",
  },
  {
    cabang: "permission",
    alasan: "labels.ts: satu kalimat per izin, bentuknya ditegakkan `Record<Permission, string>`.",
  },
  {
    cabang: "termCategory",
    alasan: "labels.ts: nama kategori Kamus Istilah.",
  },
  {
    cabang: "accounts.accurateType",
    alasan:
      "accounts/import/import-form.tsx: legenda kode tipe Accurate diindeks dengan kode " +
      "yang datang dari berkas CSV yang diunggah pengguna.",
  },
  {
    cabang: "reports.catalogReport",
    alasan: "reports/page.tsx: judul & penjelasan laporan dikunci dari id katalog.",
  },
  {
    cabang: "reports.catalogCategory",
    alasan: "reports/page.tsx: nama kelompok kategori laporan, dikunci dari id kategori.",
  },
];

// ───────────────────────────── pembacaan kamus ─────────────────────────────

/** Daun (teks) dan cabang (simpul) kamus, sebagai jalur-titik. */
function pohonKamus(nilai: unknown, prefiks = "", daun = new Set<string>(), cabang = new Set<string>()) {
  if (typeof nilai !== "object" || nilai === null) return { daun, cabang };
  for (const [k, anak] of Object.entries(nilai as Record<string, unknown>)) {
    const jalur = prefiks ? `${prefiks}.${k}` : k;
    if (typeof anak === "string") daun.add(jalur);
    else {
      cabang.add(jalur);
      pohonKamus(anak, jalur, daun, cabang);
    }
  }
  return { daun, cabang };
}

const kamusId: unknown = JSON.parse(
  readFileSync(join(SRC, "lib", "i18n", "dictionaries", "id.json"), "utf8")
);
const { daun: DAUN, cabang: CABANG } = pohonKamus(kamusId);

// ───────────────────────────── pembacaan sumber ─────────────────────────────

function berkasSumber(dir: string, keluar: string[] = []): string[] {
  for (const entri of readdirSync(dir, { withFileTypes: true })) {
    const jalur = join(dir, entri.name);
    // `src/generated` adalah klien Prisma, bukan kode kita.
    if (entri.isDirectory()) {
      if (entri.name !== "generated") berkasSumber(jalur, keluar);
    } else if (entri.name.endsWith(".ts") || entri.name.endsWith(".tsx")) keluar.push(jalur);
  }
  return keluar;
}

/** Fungsi yang mengembalikan kamus (atau objek yang memuatnya). */
const PEMUAT_KAMUS = /^(useDictionary|getDictionary|getRequestI18n)$/;

/** `Dictionary`, tetapi BUKAN `DictionaryKey` — `\b` menolak huruf setelahnya. */
const TIPE_KAMUS = /\bDictionary\b/;

interface Temuan {
  /** Literal string apa pun di `src/`. */
  literal: Set<string>;
  /** Daun kamus yang disebut lewat rantai properti berakar kamus. */
  daunRantai: Set<string>;
  /** Cabang kamus yang diambil utuh → jalur cabang ke bukti pertama. */
  cabangUtuh: Map<string, string>;
  /** Prefiks template dinamis → semua tempatnya. */
  prefiksDinamis: Map<string, string[]>;
}

function bacaSumber(): Temuan {
  const temuan: Temuan = {
    literal: new Set(),
    daunRantai: new Set(),
    cabangUtuh: new Map(),
    prefiksDinamis: new Map(),
  };

  for (const berkas of berkasSumber(SRC)) {
    const kode = readFileSync(berkas, "utf8");
    const src = ts.createSourceFile(berkas, kode, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const rel = berkas.slice(SRC.length + 1).split("\\").join("/");
    const tempat = (n: ts.Node) =>
      `${rel}:${src.getLineAndCharacterOfPosition(n.getStart()).line + 1}`;

    /*
     * Lintasan 1 — nama lokal yang memegang kamus.
     *
     * Dikumpulkan lebih dulu karena sebuah nama bisa dipakai di atas tempat ia
     * dideklarasikan (fungsi yang saling memanggil), dan karena tanpa daftar
     * ini rantai `x.foo.bar` tidak bisa dibedakan dari variabel biasa yang
     * kebetulan bernama sama dengan namespace kamus. Perbedaan itu bukan
     * teoretis: namespace tingkat atas di kamus ini bernama `inventory`,
     * `users`, `errors`, `status` — kata-kata yang juga dipakai puluhan
     * variabel biasa. Tanpa pengakaran, `const inventory = …` di wizard
     * penyiapan akan mengecualikan SELURUH `inventory.*`, termasuk dua kunci
     * mati yang justru menjadi alasan issue #260 ditulis.
     */
    const akar = new Set<string>();
    const kumpulkanAkar = (n: ts.Node) => {
      const bertipeKamus =
        (ts.isParameter(n) || ts.isVariableDeclaration(n) || ts.isPropertyDeclaration(n) ||
          ts.isPropertySignature(n)) &&
        n.type !== undefined &&
        TIPE_KAMUS.test(n.type.getText());
      if (bertipeKamus && ts.isIdentifier(n.name)) akar.add(n.name.text);

      // `const d = useDictionary()`, `const d = await getDictionary(…)`,
      // `const { dictionary } = await getRequestI18n()`.
      if (ts.isVariableDeclaration(n) && n.initializer) {
        let init: ts.Node = n.initializer;
        while (
          ts.isAwaitExpression(init) ||
          ts.isNonNullExpression(init) ||
          ts.isParenthesizedExpression(init) ||
          ts.isAsExpression(init)
        )
          init = init.expression;
        if (
          ts.isCallExpression(init) &&
          ts.isIdentifier(init.expression) &&
          PEMUAT_KAMUS.test(init.expression.text)
        ) {
          if (ts.isIdentifier(n.name)) akar.add(n.name.text);
          else if (ts.isObjectBindingPattern(n.name)) {
            for (const el of n.name.elements) {
              const asal = (el.propertyName ?? el.name).getText();
              if (asal === "dictionary" && ts.isIdentifier(el.name)) akar.add(el.name.text);
            }
          }
        }
      }
      ts.forEachChild(n, kumpulkanAkar);
    };
    kumpulkanAkar(src);

    /** Jalur kamus dari sebuah rantai properti; null bila akarnya bukan kamus. */
    const jalurKamus = (n: ts.Node): string[] | null => {
      if (ts.isIdentifier(n)) return akar.has(n.text) ? [] : null;
      if (ts.isPropertyAccessExpression(n)) {
        const dasar = jalurKamus(n.expression);
        return dasar === null ? null : [...dasar, n.name.text];
      }
      if (
        ts.isNonNullExpression(n) ||
        ts.isParenthesizedExpression(n) ||
        ts.isAsExpression(n) ||
        ts.isAwaitExpression(n)
      )
        return jalurKamus(n.expression);
      if (
        ts.isCallExpression(n) &&
        ts.isIdentifier(n.expression) &&
        PEMUAT_KAMUS.test(n.expression.text)
      )
        return [];
      return null;
    };

    const kunjungi = (n: ts.Node) => {
      if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) temuan.literal.add(n.text);

      /*
       * Hanya rantai TERLUAR yang dibaca. `dictionary.accountType.cash_bank`
       * memuat simpul dalam `dictionary.accountType`; membacanya juga akan
       * mencatat `accountType` sebagai cabang-yang-diambil-utuh dan dengan
       * begitu mengecualikan enam belas daun karena satu daun disebut.
       */
      if (ts.isPropertyAccessExpression(n)) {
        const terluar = !(ts.isPropertyAccessExpression(n.parent) && n.parent.expression === n);
        if (terluar) {
          const bagian = jalurKamus(n);
          if (bagian && bagian.length > 0) {
            const jalur = bagian.join(".");
            if (DAUN.has(jalur)) temuan.daunRantai.add(jalur);
            else if (CABANG.has(jalur) && !temuan.cabangUtuh.has(jalur))
              temuan.cabangUtuh.set(jalur, tempat(n));
          }
        }
      }

      if (ts.isTemplateExpression(n) && n.head.text.endsWith(".")) {
        const prefiks = n.head.text.slice(0, -1);
        if (CABANG.has(prefiks))
          temuan.prefiksDinamis.set(prefiks, [
            ...(temuan.prefiksDinamis.get(prefiks) ?? []),
            tempat(n),
          ]);
      }

      ts.forEachChild(n, kunjungi);
    };
    kunjungi(src);
  }

  return temuan;
}

const TEMUAN = bacaSumber();

// ───────────────────────────────── tes ─────────────────────────────────────

describe("kunci kamus yatim", () => {
  it("membaca seluruh `src/` — kalau tidak, hijaunya tidak berarti apa-apa", () => {
    // Penjaga atas penjaganya: sebuah salah jalur diam-diam membuat setiap
    // kunci terlihat yatim (merah, ketahuan) ATAU — kalau daftar berkasnya
    // kosong dan tesnya dibalik — membuat semuanya hijau tanpa memeriksa apa
    // pun. Angka ini memastikan sapuannya benar-benar terjadi.
    expect(berkasSumber(SRC).length).toBeGreaterThan(400);
    expect(DAUN.size).toBeGreaterThan(3000);
    expect(TEMUAN.literal.size).toBeGreaterThan(1000);
  });

  it("tidak ada satu pun kunci tanpa rujukan di `src/`", () => {
    const prefiksTerdaftar = PREFIKS_DINAMIS.map((p) => p.prefiks);
    const cabangTerdaftar = CABANG_UTUH.map((c) => c.cabang);

    /** Daun yang bisa dirakit dari sebuah prefiks dinamis + literal di `src/`. */
    const dariTemplate = new Set<string>();
    for (const prefiks of prefiksTerdaftar)
      for (const lit of TEMUAN.literal)
        if (DAUN.has(`${prefiks}.${lit}`)) dariTemplate.add(`${prefiks}.${lit}`);

    const dibawahCabang = (kunci: string) =>
      cabangTerdaftar.some((c) => kunci === c || kunci.startsWith(`${c}.`));

    const yatim = [...DAUN].filter(
      (kunci) =>
        !TEMUAN.literal.has(kunci) &&
        !TEMUAN.daunRantai.has(kunci) &&
        !dariTemplate.has(kunci) &&
        !dibawahCabang(kunci)
    );

    expect(
      yatim,
      "Kunci berikut ada di ketiga kamus tetapi TIDAK dirujuk satu baris pun di src/.\n" +
        "Cabut dari id.json, en.json, DAN zh.json — bukan hanya salah satunya.\n" +
        "Kalau kuncinya memang dipakai lewat bentuk yang tidak terlihat parser, " +
        "jangan mencabutnya: daftarkan bentuknya di PREFIKS_DINAMIS atau CABANG_UTUH " +
        "beserta alasannya, dan baca dulu 'Yang penjaga ini TIDAK bisa lihat' di kepala berkas."
    ).toEqual([]);
  });
});

describe("daftar-izin penjaga kunci yatim tetap jujur", () => {
  it("setiap prefiks dinamis yang terdaftar memang masih dirakit di `src/`", () => {
    const basi = PREFIKS_DINAMIS.filter((p) => !TEMUAN.prefiksDinamis.has(p.prefiks)).map(
      (p) => p.prefiks
    );
    expect(
      basi,
      "Prefiks berikut terdaftar di PREFIKS_DINAMIS tetapi tidak ada satu pun " +
        "`…${…}` yang merakitnya lagi di src/. Cabut entrinya — daftar pengecualian " +
        "yang tidak lagi mengecualikan apa pun adalah cara paling pelan penjaga ini " +
        "berhenti menjaga."
    ).toEqual([]);
  });

  it("setiap cabang yang terdaftar memang masih diambil utuh di `src/`", () => {
    const basi = CABANG_UTUH.filter((c) => !TEMUAN.cabangUtuh.has(c.cabang)).map((c) => c.cabang);
    expect(
      basi,
      "Cabang berikut terdaftar di CABANG_UTUH tetapi tidak ada kode yang " +
        "mengambilnya utuh lagi. Cabut entrinya — subpohonnya kini bisa dijaga " +
        "kunci demi kunci, dan itu lebih baik."
    ).toEqual([]);
  });

  it("tidak ada bentuk dinamis BARU yang belum diputuskan", () => {
    const prefiksTerdaftar = new Set(PREFIKS_DINAMIS.map((p) => p.prefiks));
    const cabangTerdaftar = new Set(CABANG_UTUH.map((c) => c.cabang));

    const barTemplate = [...TEMUAN.prefiksDinamis]
      .filter(([p]) => !prefiksTerdaftar.has(p))
      .map(([p, di]) => `${p}.\${…} @ ${di[0]}`);
    const barCabang = [...TEMUAN.cabangUtuh]
      .filter(([c]) => !cabangTerdaftar.has(c))
      .map(([c, di]) => `${c} @ ${di}`);

    expect(
      [...barTemplate, ...barCabang],
      "Bentuk dinamis berikut ada di src/ tetapi belum terdaftar di berkas ini.\n" +
        "Ia MELEBARKAN lubang penjaga tanpa ada yang memutuskannya, jadi tesnya merah " +
        "sampai keputusannya ditulis: tambahkan ke PREFIKS_DINAMIS / CABANG_UTUH dengan " +
        "alasannya, ATAU ubah kodenya supaya kuncinya tetap terlihat utuh di sumber " +
        "(yang hampir selalu lebih baik)."
    ).toEqual([]);
  });

  it("daftar-izinnya tetap pendek — kalau ia memanjang, modelnya yang salah", () => {
    // Bukan angka keramat: sembilan cabang + empat prefiks adalah keadaan
    // terukur saat penjaga ini ditulis, dan batas ini ada supaya "tambahkan
    // saja satu entri lagi" tidak pernah menjadi kebiasaan yang tak terlihat.
    // Kalau daftarnya benar-benar perlu tumbuh melewati ini, naikkan batasnya
    // BERSAMA satu kalimat kenapa bentuk dinamis makin banyak dipakai.
    expect(PREFIKS_DINAMIS.length).toBeLessThanOrEqual(6);
    expect(CABANG_UTUH.length).toBeLessThanOrEqual(12);
  });
});
