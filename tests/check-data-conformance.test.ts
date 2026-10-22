/**
 * Pemeriksa kesesuaian data tidak boleh punya kosakata SENDIRI.
 *
 * `scripts/check-data-conformance.ts` ada untuk menemukan data yang menyimpang
 * dari aturan kode — status di luar enum, mata uang tak dikenal, dan seterusnya.
 * Nilai pembandingnya karena itu WAJIB datang dari konstanta yang sama dengan
 * yang dipakai zod di jalur tulis. Begitu ia menyalin daftarnya sendiri, ia
 * berhenti memeriksa "apakah data sesuai kode" dan mulai memeriksa "apakah data
 * sesuai salinan lama" — yaitu persis kelas cacat yang ia cari, kini di dalam
 * dirinya sendiri.
 *
 * Tesnya statis (membaca berkasnya) sebab isinya SQL terhadap basis data
 * sungguhan: yang bisa dijaga tanpa DB adalah bentuknya, dan bentuk itulah yang
 * paling mudah membusuk diam-diam.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { CONTRACT_STATUSES, CURRENCIES } from "@sai/core/constants";

const SOURCE = readFileSync(join(process.cwd(), "scripts/check-data-conformance.ts"), "utf8");
/** Hanya badan skrip — kepala & komentar memang menyebut nilai contoh. */
const CODE = SOURCE.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

describe("kosakata pemeriksa datang dari konstanta, bukan salinan", () => {
  it("mengimpor daftar status & mata uang dari sumber yang dipakai zod", () => {
    expect(CODE).toMatch(/import \{[^}]*CONTRACT_STATUSES[^}]*\} from "@sai\/core\/constants"/);
    expect(CODE).toMatch(/import \{[^}]*CURRENCIES[^}]*\} from "@sai\/core\/constants"/);
    expect(CODE).toMatch(/ACCOUNT_TYPE_VALUES/);
  });

  it("tidak menuliskan satu pun nilai status sebagai literal", () => {
    const offenders = CONTRACT_STATUSES.filter((s) => CODE.includes(`'${s}'`));
    expect(
      offenders,
      "Nilai status ditulis langsung di SQL. Pakai `list(CONTRACT_STATUSES)` supaya " +
        "pemeriksa ikut berubah saat enum-nya berubah."
    ).toEqual([]);
  });

  it("tidak menuliskan mata uang asing sebagai literal", () => {
    /* `'IDR'` DIKECUALIKAN dengan sengaja: ia bukan anggota daftar yang bisa
       berubah, melainkan MATA UANG DASAR buku besar — dipakai untuk menurunkan
       nilai IDR (`toBase`), bukan untuk memeriksa keanggotaan enum. */
    const offenders = CURRENCIES.filter((c) => c !== "IDR" && CODE.includes(`'${c}'`));
    expect(offenders).toEqual([]);
  });
});

describe("bentuk daftar pemeriksaan", () => {
  const keys = [...CODE.matchAll(/^\s*key: "([a-z0-9-]+)",$/gm)].map((m) => m[1]);
  const judul = [...CODE.matchAll(/^\s*judul: "/gm)].length;

  it("ada beberapa pemeriksaan, masing-masing berkunci unik", () => {
    expect(keys.length).toBeGreaterThanOrEqual(8);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("setiap pemeriksaan punya judul yang bisa dibaca manusia", () => {
    expect(judul).toBe(keys.length);
  });

  /*
   * Setiap pemeriksaan harus menghasilkan `label` — TAPI ada dua jalan ke sana,
   * dan keduanya sah sejak issue #444.
   *
   * Jalan pertama, yang lama: SQL-nya sendiri merakit `AS label`.
   *
   * Jalan kedua: SQL-nya cuma MENGUMPULKAN angka, dan `nilai` merakit labelnya
   * di TypeScript. Itu ada karena tidak setiap aturan pantas ditulis sebagai
   * SQL — pagar materialitas membandingkan tiap akun dengan TOTAL seluruh akun,
   * dan menuliskannya sebagai SQL berarti menaruh aturan akuntansi di tempat
   * yang tidak bisa diuji tanpa basis data.
   *
   * Yang dijaga tetap sama: TIDAK ADA pemeriksaan yang diam-diam tak punya cara
   * memberi tahu orang apa yang ditemukannya.
   */
  it("setiap pemeriksaan punya label — dari SQL-nya, atau dari aturan murni `nilai`", () => {
    const sqlCount = [...CODE.matchAll(/^\s*sql: `/gm)].length;
    const labelCount = [...CODE.matchAll(/AS label/g)].length;
    const nilaiCount = [...CODE.matchAll(/^\s*nilai: /gm)].length;
    expect(sqlCount).toBe(keys.length);
    expect(labelCount + nilaiCount).toBeGreaterThanOrEqual(keys.length);
  });

  /*
   * Pemeriksaan ber-`nilai` TIDAK BOLEH juga merakit `AS label` di SQL-nya.
   * Label yang dirakit lalu dibuang adalah kode mati yang terbaca seperti
   * kebenaran — dan di berkas ini ia sempat ada, ditulis semata agar penjaga di
   * atas lulus. Itu bukan lulus, itu menyiasati.
   */
  /* Tanpa ini, kedua tes di atas lulus dengan daftar kosong begitu `nilai`
     hilang dari berkasnya — "terbaca benar, tidak menjaga apa pun". */
  it("ada pemeriksaan yang memang memakai `nilai`, jadi penjaganya tidak hampa", () => {
    expect([...CODE.matchAll(/^\s*nilai: /gm)].length).toBeGreaterThanOrEqual(1);
  });

  it("pemeriksaan ber-`nilai` tidak merakit label yang lalu dibuang", () => {
    const blok = CODE.split(/^\s*\{$/gm);
    const curang = blok.filter((b) => /^\s*nilai: /m.test(b) && /AS label/.test(b));
    expect(curang).toEqual([]);
  });
});

describe("pemeriksa tidak boleh mengubah satu angka akuntansi pun", () => {
  it("tidak memuat pernyataan SQL yang mengubah data", () => {
    /* Keputusan "angka mana yang benar" hampir selalu butuh dokumen fisik atau
       pemilik datanya. Yang boleh diotomatiskan hanya MENEMUKANNYA. */
    for (const kata of ["UPDATE ", "DELETE ", "INSERT ", "DROP ", "TRUNCATE "]) {
      expect(CODE.toUpperCase()).not.toContain(kata);
    }
  });

  /*
   * ══ KENAPA TIGA TES DI BAWAH DITAMBAHKAN ═════════════════════════════════
   * Sejak jejak putaran lahir (`conformance_runs`), berkas ini MEMANG menulis —
   * satu baris, ke basis data PLATFORM. Penjaga di atas tidak melihatnya:
   * `platformDb.conformanceRun.create()` tidak memuat satu pun kata SQL yang
   * dicarinya.
   *
   * Melonggarkan penjaganya bukan jawabannya, dan "lolos secara huruf" juga
   * bukan. Yang benar adalah menyatakan sifat yang SEBENARNYA harus dijaga —
   * lebih presisi daripada ketiadaan lima kata:
   *
   *   buku PT hanya boleh DIBACA; satu-satunya tulisan yang diizinkan adalah
   *   jejak putaran, dan sasarannya PLATFORM.
   */
  it("klien buku PT hanya dipakai untuk MEMBACA", () => {
    // `$queryRawUnsafe` membaca. `$executeRaw*` mengubah — dan tidak boleh ada
    // di berkas ini dalam bentuk apa pun.
    expect(CODE).toContain("$queryRawUnsafe");
    expect(CODE).not.toContain("$executeRaw");
    expect(CODE).not.toContain("$executeRawUnsafe");
  });

  it("satu-satunya tulisan Prisma menyasar `controlDb`, bukan buku PT", () => {
    /* Sasarannya `controlDb` sejak jejak putaran pindah ke basis data kendali
       (migration kendali 0005). Yang dijaga tes ini tidak berubah: pemeriksa
       kesesuaian MEMBACA buku dan menulis TEPAT SATU hal — jejak putarannya.
       Yang berubah hanya di basis data mana jejak itu tinggal, dan pindahnya
       justru supaya pemeriksa tetap bisa mencatat di pemasangan on-premise,
       yang tidak memasang `sai_platform`. */
    const tulisan = [...CODE.matchAll(/(\w+)\.(\w+)\.(create|createMany|update|updateMany|upsert|delete|deleteMany)\(/g)];
    expect(tulisan.length, "diharapkan TEPAT satu tulisan: jejak putaran").toBe(1);
    const [, klien, model, operasi] = tulisan[0]!;
    expect(klien).toBe("controlDb");
    expect(model).toBe("conformanceRun");
    expect(operasi).toBe("create");
  });

  it("jejaknya ditulis SEBELUM `process.exit`, bukan sesudahnya", () => {
    /*
     * `process.exit` tidak menunggu promise yang masih berjalan. Mencatat
     * sesudahnya berarti jejak yang HILANG tepat pada putaran yang paling perlu
     * dicatat — yaitu yang menemukan sesuatu, sebab itulah putaran yang keluar
     * dengan kode bukan-nol.
     */
    const rekam = CODE.indexOf("await rekam(");
    const keluarTemuan = CODE.indexOf("process.exit(1)", rekam);
    expect(rekam, "pemanggilan `rekam()` tidak ditemukan").toBeGreaterThan(-1);
    expect(keluarTemuan).toBeGreaterThan(rekam);
  });
});
