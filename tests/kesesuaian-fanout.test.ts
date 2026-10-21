/**
 * PENJAGA sapuan kesesuaian yang berjalan SERENTAK (rancangan §6).
 *
 * ══ YANG DIBELI KONKURENSI, DAN YANG IA PECAHKAN ══════════════════════════
 * Sapuan berurutan atas 19 buku memakan waktu berbanding jumlah buku — persis
 * bentuk yang invarian I-1 larang ("jumlah tenant tidak boleh menambah waktu
 * tunggu"). Tapi menjalankannya serentak memecahkan tiga hal sekaligus, dan
 * ketiganya SUNYI:
 *
 *   1. **keluaran yang menyisip** — dua buku mencetak laporannya bergantian,
 *      dan yang tidak bisa dibaca adalah justru log pada hari satu di antaranya
 *      menemukan sesuatu;
 *   2. **urutan laporan yang berubah tiap putaran** — diff antar putaran
 *      berhenti berguna, dan dua sapuan yang hasilnya SAMA terbaca berbeda;
 *   3. **koneksi yang tidak ditutup pada jalur GAGAL** — satu per buku, dan
 *      sapuan yang gagal di sepuluh buku menghabiskan pool-nya sendiri.
 *
 * Berkas ini menjaga ketiganya. Bukan kecepatannya — kecepatan tidak bisa
 * dijaga tes statis, dan yang rusak bila konkurensi ditambahkan sembarangan
 * adalah hal-hal di atas.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { AKAR_REPO, tanpaKomentar } from "./akar-sumber";

const skrip = readFileSync(join(AKAR_REPO, "scripts/check-data-conformance.ts"), "utf8");
const bersih = tanpaKomentar(skrip);
const migrasi = readFileSync(join(AKAR_REPO, "scripts/migrate-all-companies.ts"), "utf8");
const store = readFileSync(join(AKAR_REPO, "apps/operator/src/lib/operator/store.ts"), "utf8");
const halaman = readFileSync(
  join(AKAR_REPO, "apps/operator/src/app/(operator)/conformance/page.tsx"),
  "utf8"
);

describe("sapuannya serentak, dengan batas yang berbunyi", () => {
  it("batasnya dari env, bawaan 3, plafon 8", () => {
    expect(bersih).toContain("process.env.CONFORMANCE_CONCURRENCY");
    expect(bersih).toMatch(/return 3;/);
    expect(bersih).toMatch(/n > 8/);
  });

  it("nilai salah tulis diabaikan dengan BUNYI, bukan diam", () => {
    /* Angka yang diam-diam jatuh ke bawaan membuat orang mengira ia sedang
       menjalankan sesuatu yang lain — dan pada sapuan yang memperlambat
       produksi, itu salah dugaan yang mahal. */
    const peringatan = bersih.match(/console\.warn\(/g) ?? [];
    expect(peringatan.length).toBeGreaterThanOrEqual(2);
    expect(bersih).toMatch(/bukan bilangan bulat/);
    expect(bersih).toMatch(/di atas plafon 8/);
  });

  it("serentaknya tidak pernah melebihi jumlah bukunya", () => {
    /* `Promise.all` atas 8 pelaksana untuk 2 buku membuat enam pelaksana lahir
       hanya untuk langsung selesai — dan jumlah yang dicetak ke log jadi
       bohong. */
    expect(bersih).toMatch(/Math\.min\(batasSerentak\(\), companies\.length\)/);
  });

  it("jumlah yang BENAR-BENAR dipakai dicetak, bukan yang diminta", () => {
    /* Log yang menyebut 8 sementara yang berjalan 2 adalah log yang membuat
       orang mencari sebab perlambatan di tempat yang salah. */
    expect(bersih).toMatch(/CONFORMANCE_CONCURRENCY=\$\{serentak\}/);
  });

  it("bawaannya BEDA dari migration, dan itu keputusan", () => {
    /*
     * Migration bawaannya 2 (satu proses Prisma CLI + satu backend per
     * pelaksana, berjalan sementara aplikasi melayani). Sapuan ini nol proses
     * anak dan hanya BACA — yang membatasinya basis datanya, bukan memorinya.
     * Menyalin angka 2 tanpa alasannya berarti dua angka yang kebetulan sama
     * lalu bergerak bersama tanpa sebab.
     */
    expect(migrasi).toContain("COMPANY_MIGRATE_CONCURRENCY");
    /*
     * ⚠ `bersih`, BUKAN `skrip` — dan saya menabraknya lebih dulu. Komentar di
     * skripnya MENYEBUT `COMPANY_MIGRATE_CONCURRENCY` untuk menjelaskan kenapa
     * angkanya berbeda, jadi pemeriksaan "tidak ada" atas teks penuh menuding
     * justru penjelasan yang membuat keputusannya bisa dipahami.
     *
     * Itu bentuk kekeliruan yang sudah terjadi LIMA kali di repo ini, dan
     * aturannya sudah tertulis di `akar-sumber.ts`: penjaga "X ADA" boleh
     * membaca teks penuh; penjaga "X TIDAK ADA" dan setiap penjaga yang
     * MENGHITUNG wajib membaca `tanpaKomentar(...)`.
     */
    expect(bersih).not.toContain("COMPANY_MIGRATE_CONCURRENCY");
    /* Dan yang ini "X ADA", jadi ia justru HARUS membaca komentarnya: yang
       dijaga adalah bahwa alasannya tertulis, bukan bahwa kodenya ada. */
    expect(skrip).toMatch(/bukan memori melainkan \*\*basis datanya\*\*/);
  });
});

describe("laporannya DETERMINISTIK meski urutan selesai tidak", () => {
  it("hasilnya ditaruh pada INDEKS bukunya, bukan di-push saat selesai", () => {
    /*
     * `push` saat selesai berarti urutan laporan = urutan selesai, yang berubah
     * tiap putaran. Diff antar dua sapuan yang hasilnya sama akan penuh, dan
     * diff yang selalu penuh adalah diff yang tidak dibaca.
     */
    expect(bersih).toMatch(/hasil\[i\] = await periksaSatu\(companies\[i\]\)/);
    expect(bersih).toMatch(/for \(const \[i, r\] of hasil\.entries\(\)\)/);
  });

  it("daftar bukunya sendiri berurutan menurut id", () => {
    /* Tanpa `orderBy`, urutannya urutan sisip — dan itu bisa berubah setelah
       satu baris di-update. */
    expect(bersih).toMatch(/orderBy: \{ id: "asc" \}/);
  });

  it("tiap buku MEMULANGKAN barisnya; pencetaknya satu tempat", () => {
    /*
     * `console.log` di dalam pemeriksaan membuat laporan dua buku saling
     * menyisip. Penjaga ini menyasar sifatnya, bukan namanya: fungsi
     * per-bukunya tidak boleh mencetak apa pun.
     */
    const awal = bersih.indexOf("async function periksaSatu");
    const akhir = bersih.indexOf("const hasil = new Array");
    expect(awal).toBeGreaterThan(-1);
    expect(akhir).toBeGreaterThan(awal);
    expect(bersih.slice(awal, akhir)).not.toMatch(/console\.(log|error|warn)\(/);
  });
});

describe("koneksi per buku ditutup pada SETIAP jalur", () => {
  it("`$disconnect` di `finally`, bukan diulang di tiap cabang", () => {
    /*
     * Jalur lama memanggilnya dua kali — sekali di `catch`, sekali setelahnya —
     * dan bentuk itu adalah bentuk yang kehilangan satu panggilan pada cabang
     * ketiga yang ditambahkan nanti. Satu klien yang tidak ditutup per buku, dan
     * sapuan yang gagal di sepuluh buku menghabiskan pool-nya sendiri.
     */
    const awal = bersih.indexOf("async function periksaSatu");
    const badan = bersih.slice(awal, bersih.indexOf("const hasil = new Array"));
    expect(badan).toMatch(/\} finally \{[\s\S]*?\$disconnect\(\)/);
    expect(badan.match(/\$disconnect\(\)/g) ?? []).toHaveLength(1);
  });
});

describe("jejaknya memuat catatan PER BASIS DATA (§6)", () => {
  it("`perCompany` ikut ditulis ke jejak", () => {
    expect(bersih).toContain("perCompany: hasil.perCompany");
    expect(bersih).toMatch(/perCompany: CatatanBuku\[\]/);
  });

  it("catatannya memuat status, jumlah temuan, DAN lamanya", () => {
    /* Lamanya bukan hiasan: sapuan yang melambat selalu melambat pada SATU buku
       lebih dulu — yang terbesar, atau yang indeksnya hilang — dan total
       putaran menyembunyikannya di balik rata-rata. */
    for (const medan of ["slug", "databaseName", "status", "findingCount", "durationMs"]) {
      expect(bersih, medan).toContain(`${medan}:`);
    }
  });

  it("`perCompany` TIDAK dipangkas, berbeda dari `findings`", () => {
    /* Panjangnya terikat jumlah perusahaan (19), bukan jumlah temuan (ribuan).
       Memangkasnya berarti buku ke-20 hilang dari jejak pada hari ia ditambah. */
    expect(bersih).toMatch(/findings: hasil\.findings\.slice\(0, 200\)/);
    expect(bersih).not.toMatch(/perCompany: hasil\.perCompany\.slice/);
  });

  it("status per buku memakai kosakata yang SAMA dengan status putaran", () => {
    /* Dua kosakata untuk satu hal lebih buruk daripada pilihan mana pun di
       antaranya — dan di sini ia akan membuat halaman menerjemahkan dua kali. */
    expect(bersih).toMatch(/status: "ok" \| "findings" \| "error"/);
    expect(bersih).toMatch(/r\.gagalPesan !== null \? "error" : r\.jumlahTemuan > 0 \? "findings" : "ok"/);
  });

  it("TANPA tabel baru, dan alasannya tertulis beserta pemicunya", () => {
    /*
     * Preseden repo ini: `backup_runs` pun satu baris per PUTARAN, dan bukti
     * per-basis-datanya hidup di `manifest.json` di dalam putaran itu. Yang
     * hilang dari pilihan ini nyata — JSON tidak bisa dikueri — jadi pemicunya
     * wajib tertulis, bukan disimpulkan.
     */
    expect(skrip).toMatch(/backup_runs` pun satu baris per PUTARAN/);
    expect(skrip).toMatch(/Pemicu/);
  });
});

describe("pembacanya: putaran LAMA tidak boleh terbaca sebagai nol buku", () => {
  it("parser menyaring per ELEMEN, bukan percaya karena JSON terurai", () => {
    /* Putaran lama ditulis sebelum medan ini ada, dan satu elemen yang
       bentuknya lain tidak boleh menjatuhkan seluruh halaman. */
    expect(store).toContain("bukuList");
    expect(store).toMatch(/typeof o\.slug !== "string"/);
    expect(store).toMatch(/typeof o\.durationMs === "number" \? o\.durationMs : 0/);
  });

  it("halamannya MEMBEDAKAN daftar kosong dari putaran lama", () => {
    /*
     * "Nol buku disapu" adalah insiden; "putaran lama" bukan apa-apa. Halaman
     * yang menampilkan keduanya sama membuat yang pertama tak terlihat.
     */
    expect(halaman).toContain("perCompany.length > 0");
    expect(halaman).toContain("operator.conformance.perBookLegacy");
  });

  it("tabel per buku DI ATAS daftar temuan", () => {
    /* Pertanyaan pertama orang yang membuka halaman ini "buku mana"; daftar
       temuan menjawab "apa", yang tidak berguna sebelum yang pertama terjawab. */
    expect(halaman.indexOf("perBookHeading")).toBeLessThan(halaman.indexOf("listFindings"));
  });

  it("nol temuan tidak diwarnai seperti yang bukan nol", () => {
    /* Warna yang menuntut perhatian untuk setiap baris adalah warna yang
       berhenti menuntut apa pun. */
    expect(halaman).toMatch(/b\.findingCount > 0 \? PERLU_TINDAKAN : TABULAR/);
  });
});
