/**
 * PENJAGA POHON GO — aturan yang 25 pemindai TypeScript lain tidak melihat.
 *
 * ══ KENAPA PENJAGA GO DITULIS DALAM TYPESCRIPT ═════════════════════════════
 * Gerbang rilis repo ini TIGA (`AGENTS.md`): `bun run verify`, gerbang Go, dan
 * build. Yang pertama berjalan di CI pada setiap PR dan tidak pernah dilewati
 * siapa pun; gerbang Go hanya berjalan bila seseorang menjalankannya. Maka
 * aturan yang akibat pelanggarannya PERMANEN — tulisan ke buku besar dari
 * bahasa yang bukan pemilik pintu posting — dijaga di gerbang yang tidak bisa
 * lupa, bukan di gerbang yang paling dekat dengan kodenya.
 *
 * Yang dijaga di SISI GO (`services/integrator/internal/jobs/*_test.go`)
 * adalah perilaku: aritmetika backoff, ambang lease, dan konsistensi kontrak
 * saat dipakai. Pembagiannya: TypeScript menjaga yang bisa dibaca dari teks,
 * Go menjaga yang hanya bisa dibuktikan dengan menjalankannya.
 *
 * ══ YANG DIPERIKSA DI SINI SIFAT, BUKAN "APAKAH JALAN" ═════════════════════
 * SQL-nya tidak bisa dijalankan tanpa basis data, jadi yang dijaga BENTUKNYA —
 * idiom yang sama dengan `tests/backup-script.test.ts` dan
 * `tests/contract-jobs.test.ts`. Yang diperiksa hanya sifat yang kalau hilang
 * TIDAK menghasilkan galat apa pun.
 */
import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { AKAR_REPO, akarGo, berkasGo } from "./akar-sumber";
import { JOB_KINDS, JOB_STATUSES } from "@sai/core/generated/job-kinds";

const GO = berkasGo();
const GEN = "services/integrator/internal/contract/jobs_gen.go";
/** Bangkitan kedua sejak tahap 1d: `contract/accounting.yaml`. */
const GEN_AKUNTANSI = "services/integrator/internal/contract/accounting_gen.go";
/** Bangkitan ketiga (tahap 1d): tata letak berkas laporan, dari modul TS-nya. */
const GEN_TATA_LETAK = "services/integrator/internal/contract/report_layout_gen.go";
/** Bangkitan keempat (tahap 4): bentuk instans basis data, `contract/db-instances.yaml`. */
const GEN_INSTANS = "services/integrator/internal/contract/dbinstances_gen.go";
/* Umur Piutang & Umur Utang (tahap 1d): berkas bangkitan tersendiri. */
const GEN_TATA_LETAK_UMUR = "services/integrator/internal/contract/aging_layout_gen.go";
/* Laporan stok (tahap 1d): berkas bangkitan tersendiri. */
const GEN_TATA_LETAK_STOK = "services/integrator/internal/contract/stock_layout_gen.go";
/* Rekap per Pihak, Kas & Bank, Realisasi vs Anggaran (tahap 1d, gelombang A). */
const GEN_TATA_LETAK_REKAP = "services/integrator/internal/contract/recap_layout_gen.go";
const BANGKITAN = [
  GEN,
  GEN_AKUNTANSI,
  GEN_TATA_LETAK,
  GEN_TATA_LETAK_UMUR,
  GEN_TATA_LETAK_STOK,
  GEN_TATA_LETAK_REKAP,
  GEN_INSTANS,
];

/**
 * Bangkitan `sqlc` (09 §3.5): `contract/jobs.sql` + `contract/trail.sql` →
 * kueri Go bertipe atas basis data kendali. Satu paket, seluruhnya bangkitan.
 */
const CONTROLSQL = "services/integrator/internal/controlsql/";
const GEN_SQLC = GO.filter((b) => b.rel.startsWith(CONTROLSQL));
/** Sumber SQL-nya — yang DIBACA penjaga di bawah, bukan teks bangkitannya saja. */
const SQL_ANTREAN = readFileSync(join(AKAR_REPO, "contract", "jobs.sql"), "utf8");
const SQL_JEJAK = readFileSync(join(AKAR_REPO, "contract", "trail.sql"), "utf8");

/** Berkas Go tulisan TANGAN — yang dibangkitkan tunduk pada aturan lain. */
const TANGAN = GO.filter((b) => !BANGKITAN.includes(b.rel) && !b.rel.startsWith(CONTROLSQL));

/**
 * Tulisan tangan yang BUKAN tes, untuk aturan "jangan menulis kosakata".
 *
 * Berkas tes memang menyebut `"tenant.backup"` dan `"queued"` sebagai teks, dan
 * itu bukan daftar kedua — itu ASERSI. Penjaga yang melarangnya akan memaksa
 * tes membandingkan konstanta dengan dirinya sendiri, yang berarti tes yang
 * tetap hijau setelah kontraknya berubah.
 */
const TANGAN_PRODUKSI = TANGAN.filter((b) => !b.rel.endsWith("_test.go"));

/**
 * Tabel BUKU BESAR, dibaca dari skema perusahaan — bukan diketik di sini.
 *
 * Daftar yang diketik tangan akan tertinggal pada tabel ke-63, dan penjaga yang
 * tertinggal lulus dengan nol pelanggar. Itu kegagalan diam yang sama yang
 * sudah terjadi sekali di Fase 2.
 */
const TABEL_BUKU: string[] = (() => {
  const skema = readFileSync(
    join(AKAR_REPO, "packages", "db", "prisma", "company", "schema.prisma"),
    "utf8"
  );
  const nama = [...skema.matchAll(/@@map\("([a-z_]+)"\)/g)].map((m) => m[1]!);
  return [...new Set(nama)];
})();

describe("pohon Go: bentuknya sendiri", () => {
  it("ada, dan setiap berkasnya terbaca penjaga ini", () => {
    /* Pemindai yang menyapu direktori yang salah LULUS dengan nol pelanggar.
       Angka di bawah memastikan penjaga ini memang sedang melihat sesuatu. */
    expect(akarGo().length).toBeGreaterThan(0);
    expect(GO.length).toBeGreaterThan(5);
    expect(TANGAN.length).toBeGreaterThan(0);
  });

  it("TIDAK memuat `package.json` — `services/` di luar workspace bun", () => {
    /* Glob workspace-nya `packages/*` + `apps/*`. Satu `package.json` di dalam
       pohon Go menariknya ke graf paket yang penjaganya tidak memahaminya, dan
       `bun install` mulai menyentuh sesuatu yang bukan miliknya. */
    const telusuri = (dir: string): string[] => {
      const hasil: string[] = [];
      for (const d of readdirSync(dir, { withFileTypes: true })) {
        if (d.name === "node_modules") continue;
        const penuh = join(dir, d.name);
        if (d.isDirectory()) hasil.push(...telusuri(penuh));
        else if (d.name === "package.json") hasil.push(penuh);
      }
      return hasil;
    };
    for (const akar of akarGo()) expect(telusuri(akar)).toEqual([]);
  });

  it("modulnya memaku versi Go dan punya `go.sum`", () => {
    /* Versi yang berbeda antara mesin pengembang dan image `go-build` berarti
       perilaku yang berbeda pada hal yang paling sulit dilihat. `go.sum` yang
       hilang berarti build yang menarik versi apa pun yang kebetulan terbaru. */
    for (const akar of akarGo()) {
      const mod = join(akar, "go.mod");
      expect(existsSync(mod), `${akar}/go.mod`).toBe(true);
      expect(readFileSync(mod, "utf8")).toMatch(/^go \d+\.\d+$/m);
      expect(existsSync(join(akar, "go.sum")), `${akar}/go.sum`).toBe(true);
    }
  });
});

describe("invarian I-2: pintu posting tunggal, dan ia TypeScript", () => {
  /**
   * Pola tulisan SQL. Dibandingkan terhadap nama tabel buku yang dibaca dari
   * skema, bukan terhadap daftar yang diketik di sini.
   */
  /*
   * `SKIP` dikecualikan, dan bukan demi kerapian: `FOR UPDATE SKIP LOCKED`
   * membuat pemindai naif membaca `SKIP` sebagai nama tabel — jadi penjaga
   * yang paling penting di berkas ini akan MERAH pada kode yang justru benar,
   * dan penjaga yang merah untuk hal yang benar adalah penjaga yang dimatikan
   * orang. Yang dikecualikan hanya kata kunci SQL, bukan nama tabel mana pun.
   */
  const BUKAN_TABEL = new Set(["skip", "set", "only", "jobs_pkey"]);
  const tulisan = (isi: string) =>
    [...isi.matchAll(/\b(INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+"?([a-z_][a-z0-9_]*)"?/gi)]
      .map((m) => ({ aksi: m[1]!.replace(/\s+/g, " ").toUpperCase(), tabel: m[2]!.toLowerCase() }))
      .filter((t) => !BUKAN_TABEL.has(t.tabel));

  it("tidak ada satu pun tulisan ke tabel buku besar dari `services/`", () => {
    /* Kode Go membaca buku, menulis tabel `jobs`, dan menghasilkan berkas —
       tidak lebih. `app-customer` memposting secara sinkron saat pengguna
       menekan tombol (44 pemanggil `postForSource`) dan ia tidak akan pindah;
       pintu posting kedua di Go berarti dua mesin menulis buku besar, dan
       penyimpangan di antara keduanya TIDAK memunculkan galat. */
    const pelanggar: string[] = [];
    for (const b of GO) {
      for (const t of tulisan(b.isi)) {
        if (TABEL_BUKU.includes(t.tabel)) pelanggar.push(`${b.rel}: ${t.aksi} ${t.tabel}`);
      }
    }
    expect(pelanggar, "tulisan ke buku besar dari pohon Go").toEqual([]);
  });

  it("daftar tabel buku memang terbaca dari skema perusahaan", () => {
    // Penjaga di atas tidak berarti apa pun bila daftarnya kosong.
    expect(TABEL_BUKU.length).toBeGreaterThan(50);
    for (const wajib of ["journals", "journal_lines", "invoices", "accounts"]) {
      expect(TABEL_BUKU, wajib).toContain(wajib);
    }
  });

  /**
   * Tabel yang BOLEH ditulis pohon Go — daftar-izin, dan sengaja sependek ini.
   *
   * Lebih kuat daripada penjaga tabel buku di atas: daftar itu hanya memuat
   * basis data PERUSAHAAN, jadi tulisan ke tabel `control` atau `platform` mana
   * pun akan lolos darinya. Penagihan (#137) dan pengguna bukan milik
   * integrator.
   *
   * `backup_runs` masuk di tahap 1b, dan itu PENGECUALIAN YANG DISEBUT — bukan
   * pelonggaran yang kebetulan lolos. Sebabnya I-3: layanan tidak saling
   * memanggil. `scripts/backup.sh` menitipkan barisnya ke Node lewat `bun run
   * record:backup`; jalur Go tidak punya jalan itu (tidak ada Node di
   * image-nya, dan memanggil layanan lain justru yang dilarang). Yang tersisa
   * dua pilihan: Go menulis barisnya sendiri, atau jejaknya hilang.
   *
   * Jejaknya tidak boleh hilang — ia yang menjawab `/api/health` → `backup`,
   * dan tanpanya produksi bisa berjalan puluhan hari tanpa satu salinan
   * sementara container terlihat "Up". Itu bukan hipotesis: produksi repo ini
   * pernah berjalan 26 hari begitu (#374).
   *
   * Dan ia bukan tabel buku: nol angka akuntansi, dan menghapus seluruh isinya
   * tidak mengubah satu laporan pun. Invarian I-2 tidak tersentuh.
   *
   * `conformance_runs` masuk 23 Okt 2026 (sapuan kesesuaian data pindah ke
   * jalur `tenant` Go di belakang sakelar `runner:`), dan alasannya SAMA
   * dengan `backup_runs`, diuji ulang terhadap jalan lainnya:
   *
   *   • Jalan yang DITOLAK: Go memulangkan temuan sebagai hasil pekerjaan, lalu
   *     handler Node menulis barisnya. Itu Go MENITIPKAN jejaknya ke layanan
   *     kedua — persis yang I-3 larang, dengan bentuk gagal yang sudah dikenal:
   *     jejak yang hanya ada bila `svc-worker` hidup. Sapuan Go yang berhasil
   *     terbaca "tidak pernah jalan", `/api/health` → `conformance` berbunyi
   *     `late` untuk pemeriksa yang bekerja sempurna — dan harganya satu `kind`
   *     tambahan beserta pengklaimnya, hanya untuk memindahkan SATU baris.
   *   • Jalan yang DIPILIH: Go menulis barisnya sendiri. Tabelnya jejak
   *     putaran di basis data KENDALI (tetangga `backup_runs`), isinya label
   *     temuan dan hitungan — nol angka akuntansi — dan menghapus seluruh
   *     isinya tidak mengubah satu laporan pun. I-2 tidak tersentuh; buku PT
   *     sendiri hanya DIBACA, di transaksi `READ ONLY` (`ledgerread`).
   *
   * Penulisnya satu berkas, `internal/trail/conformance.go`, dengan konvensi
   * jam `backup_runs` (teks UTC `::timestamp`) — dijaga di bawah.
   *
   * `efaktur_submissions` (Okt 2026) TIDAK masuk, dan itu juga keputusan yang
   * ditulis di sini. Status kiriman ke PJAP memang bukan buku (nol angka
   * akuntansi), jadi ia LOLOS syarat yang sama dengan `backup_runs` — tetapi
   * syarat kedua `backup_runs` (Go tidak punya jalan lain) TIDAK berlaku:
   * jalur `integration` melaporkan setiap hasil PJAP sebagai pekerjaan
   * `efaktur.record`, dan pelari `interactive` Node yang menuliskannya ke buku
   * PT. Antrean adalah perantaranya, jadi I-3 tetap utuh dan daftar ini tidak
   * bertambah karenanya.
   *
   * Kenapa jawabannya BERBEDA dari `conformance_runs` di atas, padahal jalan
   * yang ditolak di sana (Node menulis hasil Go) adalah jalan yang dipilih di
   * sini — dua perbedaan, keduanya soal tabelnya, bukan soal selera:
   *   • `conformance_runs` adalah DENYUT kesehatan di basis data KENDALI: ia
   *     harus ada justru saat hanya Go yang hidup. Status e-Faktur adalah DATA
   *     PT di buku PT, yang seluruhnya dibaca penjaga di atas sebagai tabel
   *     buku — memasukkannya berarti melubangi penjaga itu untuk satu tabel.
   *   • Bila `svc-worker` mati, `efaktur.record` MENUNGGU sebagai `queued`
   *     (retensi tidak memangkas `queued`) dan tercatat begitu ia hidup lagi:
   *     yang tertunda tampilan status, bukan jejak yang hilang. Kiriman ke DJP
   *     sendiri sudah terjadi di Go. docs/EFAKTUR.md §Keputusan.
   *
   * ⚠ MENAMBAH BARIS DI SINI ADALAH KEPUTUSAN. Setiap tambahan memperluas apa
   * yang bisa ditulis bahasa yang bukan pemilik pintu posting, dan alasannya
   * ditulis DI SINI — bukan di pesan commit yang tak akan dibaca orang
   * berikutnya.
   */
  const BOLEH_DITULIS = ["backup_runs", "conformance_runs", "jobs"];

  it("pohon Go hanya menulis tabel yang ada di daftar-izin", () => {
    const ditulis = new Set<string>();
    for (const b of GO) for (const t of tulisan(b.isi)) ditulis.add(t.tabel);
    expect([...ditulis].sort()).toEqual(BOLEH_DITULIS);
  });

  it("jejak putaran ditulis HANYA dari `internal/trail` — satu berkas per tabel", () => {
    /* Pengecualian yang DISEBUT tetap sempit: satu paket, satu berkas per
       tabel. Tulisan `conformance_runs` dari paket sapuan sendiri akan
       menyebar keputusan ini ke tempat yang tidak dibaca orang berikutnya.

       Sejak `sqlc` (09 §3.5) teks SQL-nya hidup di `contract/trail.sql` dan
       bangkitannya `controlsql/trail.sql_gen.go`; yang dijaga kini dua lapis:
       SQL tulisannya hanya di sana, dan PEMANGGIL fungsi bertipenya hanya
       satu berkas `internal/trail` per tabel. */
    const penulis = (tabel: string) =>
      GO.filter((b) => !b.rel.endsWith("_test.go") && tulisan(b.isi).some((t) => t.tabel === tabel)).map(
        (b) => b.rel
      );
    expect(penulis("backup_runs")).toEqual([`${CONTROLSQL}trail.sql_gen.go`]);
    expect(penulis("conformance_runs")).toEqual([`${CONTROLSQL}trail.sql_gen.go`]);
    expect([...new Set(tulisan(SQL_JEJAK).map((t) => t.tabel))].sort()).toEqual(["backup_runs", "conformance_runs"]);
    expect([...new Set(tulisan(SQL_ANTREAN).map((t) => t.tabel))]).toEqual(["jobs"]);

    const pemanggil = (fn: string) =>
      TANGAN.filter((b) => !b.rel.endsWith("_test.go") && b.isi.includes(`.${fn}(`)).map((b) => b.rel);
    expect(pemanggil("InsertBackupRun")).toEqual(["services/integrator/internal/trail/backup.go"]);
    expect(pemanggil("InsertConformanceRun")).toEqual(["services/integrator/internal/trail/conformance.go"]);
  });

  it("tidak satu pun tabel di daftar-izin adalah tabel buku", () => {
    /* Penjaga atas penjaga: daftar-izin yang suatu hari memuat `journals`
       membatalkan invarian I-2 tanpa satu baris tes pun berubah warna. */
    for (const t of BOLEH_DITULIS) expect(TABEL_BUKU, t).not.toContain(t);
  });

  it("pelari Go MENOLAK mengklaim kind penulis buku", () => {
    /* Kontraknya sudah menjamin hal yang sama, dan pemeriksaan ini tetap ada:
       kontrak melindungi dari kind yang salah tempat, pemeriksaan ini
       melindungi dari PELARI yang salah dikonfigurasi ke jalur `ledger`. */
    const q = GO.find((b) => b.rel.endsWith("internal/jobs/queue.go"));
    expect(q, "internal/jobs/queue.go").toBeDefined();
    const i = q!.isi.indexOf("func (q *Queue) Claim(");
    expect(i).toBeGreaterThan(-1);
    const badan = q!.isi.slice(i, q!.isi.indexOf("\n}", i));
    expect(badan).toContain("WritesLedger");
    expect(badan).toMatch(/I-2/);
  });

  it("jalur `ledger` tidak punya biner Go", () => {
    /* Jalur `ledger` adalah satu-satunya yang menulis buku, dan pelarinya Node
       (`workers/ledger.ts`). Satu `cmd/ledger/` di pohon Go adalah pintu posting
       kedua yang sedang dibangun. */
    const cmd = join(AKAR_REPO, "services", "integrator", "cmd");
    if (!existsSync(cmd)) return;
    expect(readdirSync(cmd)).not.toContain("ledger");
  });
});

describe("kontrak: Go tidak punya daftarnya sendiri", () => {
  it("berkas bangkitannya menyatakan dirinya tidak boleh disunting", () => {
    const gen = GO.find((b) => b.rel === GEN);
    expect(gen, GEN).toBeDefined();
    expect(gen!.isi).toContain("JANGAN DISUNTING TANGAN");
    expect(gen!.isi).toContain("contract/kinds.yaml");

    const akuntansi = GO.find((b) => b.rel === GEN_AKUNTANSI);
    expect(akuntansi, GEN_AKUNTANSI).toBeDefined();
    expect(akuntansi!.isi).toContain("JANGAN DISUNTING TANGAN");
    expect(akuntansi!.isi).toContain("contract/accounting.yaml");

    const tataLetak = GO.find((b) => b.rel === GEN_TATA_LETAK);
    expect(tataLetak, GEN_TATA_LETAK).toBeDefined();
    expect(tataLetak!.isi).toContain("JANGAN DISUNTING TANGAN");
    expect(tataLetak!.isi).toContain("src/lib/statement-layout.ts");

    const umur = GO.find((b) => b.rel === GEN_TATA_LETAK_UMUR);
    expect(umur, GEN_TATA_LETAK_UMUR).toBeDefined();
    expect(umur!.isi).toContain("JANGAN DISUNTING TANGAN");
    const rekap = GO.find((b) => b.rel === GEN_TATA_LETAK_REKAP);
    expect(rekap, GEN_TATA_LETAK_REKAP).toBeDefined();
    expect(rekap!.isi).toContain("JANGAN DISUNTING TANGAN");
    const instans = GO.find((b) => b.rel === GEN_INSTANS);
    expect(instans, GEN_INSTANS).toBeDefined();
    expect(instans!.isi).toContain("JANGAN DISUNTING TANGAN");
    expect(instans!.isi).toContain("contract/db-instances.yaml");
  });

  it("setiap berkas di `internal/contract/` adalah bangkitan", () => {
    /* Berkas tulisan tangan di paket kontrak adalah daftar kedua yang
       menyamar sebagai kontrak — penjaga `TANGAN` di atas melewatinya hanya
       bila namanya terdaftar sebagai bangkitan. */
    const diKontrak = GO.filter((b) => b.rel.includes("/internal/contract/")).map((b) => b.rel);
    expect(diKontrak.sort()).toEqual([...BANGKITAN].sort());
  });

  it("tidak ada `kind` pekerjaan yang ditulis sebagai teks di luar berkas bangkitan", () => {
    /* `kind` yang hanya dikenal satu sisi adalah baris `queued` yang menumpuk
       SELAMANYA tanpa pengklaim — tanpa galat, tanpa pekerja yang mengeluh, dan
       hanya metrik umur-tertua yang perlahan memerah berbulan-bulan kemudian. */
    const pelanggar: string[] = [];
    for (const b of TANGAN_PRODUKSI) {
      for (const kind of Object.keys(JOB_KINDS)) {
        if (b.isi.includes(`"${kind}"`)) pelanggar.push(`${b.rel}: "${kind}"`);
      }
    }
    expect(pelanggar, "kind ditulis tangan di pohon Go").toEqual([]);
  });

  it("status pekerjaan di luar berkas bangkitan hanya muncul DI DALAM SQL", () => {
    /* `'queued'` di dalam teks SQL memang tak terhindarkan — itu nilai kolom,
       bukan kosakata yang disalin. Yang dilarang bentuk Go-nya (`"queued"`),
       sebab itulah yang menyimpang dari kontrak tanpa bunyi. */
    const pelanggar: string[] = [];
    for (const b of TANGAN_PRODUKSI) {
      for (const status of JOB_STATUSES) {
        if (b.isi.includes(`"${status}"`)) pelanggar.push(`${b.rel}: "${status}"`);
      }
    }
    expect(pelanggar, "status ditulis tangan di pohon Go").toEqual([]);
  });

  it("angka antrean tidak ditulis ulang di Go", () => {
    /* Dipakai dua bahasa, dan penyimpangannya tidak menghasilkan satu pun
       galat — hanya dua pelari yang bersikap berbeda terhadap satu tabel.
       Semuanya WAJIB lewat `contract.*`. */
    const pelanggar: string[] = [];
    for (const b of TANGAN_PRODUKSI) {
      for (const angka of ["30000", "3600000", "60000", "2000", "420", "600"]) {
        if (new RegExp(`\\b${angka}\\s*\\*\\s*time\\.`).test(b.isi)) {
          pelanggar.push(`${b.rel}: ${angka} * time.…`);
        }
      }
    }
    expect(pelanggar, "angka waktu ditulis tangan di pohon Go").toEqual([]);
  });
});

describe("SQL antrean Go: sifat yang hilangnya tidak menghasilkan galat", () => {
  /*
   * Sejak `sqlc` (09 §3.5) teks kuerinya hidup di `contract/jobs.sql`, dan
   * `internal/jobs/queue.go` memanggil fungsi bertipe bangkitannya. Penjaga
   * membaca KEDUANYA: sifat SQL dari sumbernya (satu kueri = satu blok
   * `-- name:`), dan dari `queue.go` bahwa aturan di sekitar kueri (kunci
   * pemilik lease, makna nol baris) tetap dipakai pemanggilnya.
   */
  const Q = GO.find((b) => b.rel.endsWith("internal/jobs/queue.go"))!.isi;
  const badan = (nama: string) => {
    const i = Q.indexOf(`func (q *Queue) ${nama}(`);
    expect(i, nama).toBeGreaterThan(-1);
    return Q.slice(i, Q.indexOf("\n}", i));
  };
  /** Teks satu kueri bernama di `contract/jobs.sql`, sampai titik komanya. */
  const kueri = (nama: string) => {
    const blok = SQL_ANTREAN.split(/^-- name: /m).find((b) => b.startsWith(`${nama} `));
    expect(blok, `kueri ${nama} di contract/jobs.sql`).toBeDefined();
    return blok!.slice(0, blok!.indexOf(";"));
  };
  const GEN_ANTREAN = GEN_SQLC.find((b) => b.rel === `${CONTROLSQL}jobs.sql_gen.go`)?.isi ?? "";

  it("klaim adalah SATU pernyataan dengan `FOR UPDATE SKIP LOCKED`", () => {
    /* `SELECT … FOR UPDATE SKIP LOCKED` lalu `UPDATE` terpisah lolos setiap
       pengujian satu pekerja, dan gagal di produksi: dua pekerja memilih baris
       yang sama di celah antara dua pernyataan. Untuk `tenant.backup` itu dua
       dump menulis ke satu kunci objek, dan yang terakhir menang. */
    const k = kueri("ClaimJob");
    expect(k).toContain("FOR UPDATE SKIP LOCKED");
    expect(k).toMatch(/UPDATE jobs SET status = 'claimed'[\s\S]*WHERE id = \(\s*SELECT id/);
    /* `started_at` bersama `claimed_at`, persis klaim Node: tanpa ia durasi
       pekerjaan Go tidak terukur (`claimed_at` diperpanjang tiap lease), dan
       histogram/ambang durasi per jalur (09 §11) melewatkan setiap jalur Go. */
    expect(k).toContain("started_at = now()");
    expect(readFileSync(join(AKAR_REPO, "packages", "platform", "src", "job-queue.ts"), "utf8")).toContain(
      "started_at = now()"
    );
    const b = badan("Claim");
    expect(b.match(/q\.sql\.\w+\(/g) ?? []).toEqual(["q.sql.ClaimJob("]);
    expect(b).not.toMatch(/pool\.(Query|QueryRow|Exec)\(/);
  });

  it("setiap tulisan pekerja terkunci pada pemilik lease-nya", () => {
    /* Tanpa `claimed_by = …`, pekerja yang lease-nya sudah kedaluwarsa tetap
       bisa menulis hasil ke pekerjaan yang kini milik pekerja lain — dua hasil
       untuk satu pekerjaan, dan yang terakhir menang. */
    const pasangan: [string, string][] = [
      ["RenewLease", "RenewLease"],
      ["ReportProgress", "ReportProgress"],
      ["Complete", "CompleteJob"],
    ];
    for (const [fn, nama] of pasangan) {
      const k = kueri(nama);
      expect(k, nama).toContain("claimed_by = sqlc.arg(worker_id)");
      expect(k, nama).toContain("status = 'claimed'");
      expect(badan(fn), fn).toContain(`q.sql.${nama}(`);
    }
  });

  it("kegagalan yang barisnya bukan milik pekerja ini TIDAK ditulis", () => {
    /* Menulis kegagalan di sini akan menaikkan `attempts` milik pekerjaan orang
       lain, dan pekerjaan itu akan mati lebih cepat tanpa pernah gagal. */
    const k = kueri("ClaimedAttempts");
    expect(k).toContain("claimed_by = sqlc.arg(worker_id)");
    expect(k).toContain("status = 'claimed'");
    const b = badan("Fail");
    expect(b).toContain("pgx.ErrNoRows");
    const baca = b.indexOf("q.sql.ClaimedAttempts(");
    expect(baca).toBeGreaterThan(-1);
    for (const tulis of ["q.sql.MarkDead(", "q.sql.Requeue("]) {
      expect(b.indexOf(tulis), tulis).toBeGreaterThan(baca);
    }
  });

  it("pengarsipan menyentuh `done` SAJA", () => {
    /* `dead` dan `failed` tidak pernah dipangkas: kegagalan adalah isi paling
       berharga di tabel ini, dan ia justru yang dicari orang berbulan-bulan
       kemudian. Predikat yang melebar ke "sudah selesai" membuang justru baris
       yang paling dicari orang. */
    const k = kueri("ArchiveDone");
    expect(k).toContain("status = 'done'");
    expect(k).not.toMatch(/'dead'|'failed'|IN \(/);
  });

  it("reclaim memakai ambang lease dari kontrak, bukan dugaan durasi", () => {
    const k = kueri("ReclaimStale");
    expect(k).toContain("claimed_at < LOCALTIMESTAMP - sqlc.arg(stale_us)::bigint * interval '1 microsecond'");
    expect(GEN_ANTREAN).toContain("claimed_at < LOCALTIMESTAMP - $1::bigint * interval '1 microsecond'");
    expect(k).toContain("status = 'claimed'");
    expect(k).toContain("attempts + 1");
    // Pemanggilnya menyuntik `contract.LeaseStale` — bukan angka di tempat.
    const runner = GO.find((x) => x.rel.endsWith("internal/jobs/runner.go"))!.isi;
    expect(runner).toContain("ReclaimStale(ctx, contract.LeaseStale)");
  });

  it("tidak ada teks yang dirangkai ke dalam SQL", () => {
    /* Parameter terikat (`$1`, `$2`) atau tidak sama sekali — tidak pernah
       `fmt.Sprintf` ke dalam teks kueri. */
    const sprintfDiSql = /(?:Query|QueryRow|Exec)\(\s*ctx,\s*fmt\.Sprintf/;
    for (const b of GO) expect(sprintfDiSql.test(b.isi), b.rel).toBe(false);
  });

  it("SQL `jobs` dan jejak putaran HANYA di `contract/*.sql` — tidak ditulis tangan di Go", () => {
    /* Kueri tulisan tangan kedua atas tabel yang sama adalah daftar kedua:
       ia lolos dari pengetikan `sqlc` DAN dari penjaga di atas, yang membaca
       `contract/jobs.sql`. Berkas tes boleh menanam baris (fikstur). */
    const KUNCI = /\b(jobs|backup_runs|conformance_runs)\b/;
    const literal = (isi: string) =>
      [...isi.replace(/^\s*\/\/.*$/gm, "").matchAll(/`([^`]*)`/g)]
        .map((m) => m[1]!)
        .filter((t) => /\b(SELECT|INSERT|UPDATE|DELETE)\b/.test(t) && KUNCI.test(t));
    const pelanggar = TANGAN_PRODUKSI.filter((b) => literal(b.isi).length > 0).map((b) => b.rel);
    expect(pelanggar).toEqual([]);
    // Bangkitannya memang memuat kueri itu — pemindai di atas tidak buta.
    expect(GEN_ANTREAN).toContain("FOR UPDATE SKIP LOCKED");
  });

  it("bangkitan `sqlc` memakai versi yang dipatok perkakasnya, dan integrator tidak menariknya", () => {
    /* Versi yang tercetak di kepala bangkitan = versi `require` di
       `tools/sqlc/go.mod`; `sqlc.sum` mencatat `go.mod` itu sebagai masukan,
       jadi menaikkan versi tanpa membangkitkan ulang ditolak `contract:gen
       --cek`. `go.mod` integrator sendiri tidak boleh memuat `sqlc` — ratusan
       modulnya akan ikut ke graf build image (lihat kepala `tools.go`). */
    const alat = readFileSync(join(AKAR_REPO, "services/integrator/tools/sqlc/go.mod"), "utf8");
    const versi = alat.match(/^require \S*sqlc-dev\/sqlc (v[\d.]+)$/m)?.[1];
    expect(versi, "versi sqlc di tools/sqlc/go.mod").toBeDefined();
    expect(GEN_SQLC.length).toBeGreaterThanOrEqual(3);
    for (const b of GEN_SQLC) {
      expect(b.isi, b.rel).toContain("// Code generated by sqlc. DO NOT EDIT.");
      expect(b.isi, b.rel).toContain(`//   sqlc ${versi}`);
    }
    const integrator = readFileSync(join(AKAR_REPO, "services/integrator/go.mod"), "utf8");
    expect(integrator).not.toContain("sqlc");
  });

  it("pagar jalur memakai nama kunci yang SAMA dengan sisi Node", () => {
    /* Dua pagar yang tidak saling melihat bukan pagar: pelari Node dan pelari
       Go akan sama-sama merasa memegang jalur yang sama. */
    const runnerTs = readFileSync(join(AKAR_REPO, "workers", "runner.ts"), "utf8");
    expect(runnerTs).toContain("sai.lane.");
    expect(Q).toContain('"sai.lane."');
    expect(Q).toContain("pg_try_advisory_lock(hashtext($1))");
  });

  it("kunci advisory TIDAK dilepas kembali ke kolam koneksi", () => {
    /* Kunci advisory milik KONEKSI. Melepas koneksinya ke kolam melepas
       kuncinya juga — diam-diam, dan hanya di bawah beban ketika kolam memang
       memakai ulang koneksi. Jadi koneksinya dipulangkan ke pemanggil. */
    const b = badan("TryLaneLock");
    expect(b).toContain("pool.Acquire");
    expect(b).toMatch(/\*pgxpool\.Conn/);
  });
});

describe("jam kolom waktu: Go tidak mengikat instan ke TIMESTAMP tanpa zona", () => {
  /**
   * Kolom waktu `jobs` dan `backup_runs` bertipe TIMESTAMP(3) TANPA zona, dan
   * `time.Time` yang diikat pgx ke kolom seperti itu dikodekan menurut MODE
   * koneksi: mode bawaan membuang zonanya (jam dinding PROSES terkirim), mode
   * `exec` (PgBouncer) mengirim `timestamptz` yang dikonversi zona SESI.
   * Hasilnya benar hanya bila TZ container kebetulan sama dengan TimeZone
   * server — dan ketika tidak, upkeep memulangkan lease yang masih hidup atau
   * tidak pernah memulangkan yang mati, tanpa satu galat (ditemukan 23 Okt
   * 2026 di kotak ber-TZ CST).
   *
   * Dua konvensi, satu per tabel, dan keduanya ditulis di kodenya:
   * - `jobs`: jam `now()` sesi (DEFAULT `CURRENT_TIMESTAMP` + `now()` di kedua
   *   bahasa). Go hanya mengirim DURASI; nilai `$n` tidak pernah bersentuhan
   *   langsung dengan kolom waktunya (`internal/jobs/queue.go`).
   * - `backup_runs` dan `conformance_runs` (jejak putaran, 23 Okt 2026): UTC,
   *   sebab pembacanya Prisma. Instan dikirim sebagai teks
   *   UTC `$n::text::timestamp` (sebelum `sqlc`: `$n::timestamp` + string —
   *   masukan `timestamp` yang sama), dan `now()` hanya dalam bentuk
   *   `AT TIME ZONE 'UTC'` (`contract/trail.sql`).
   *
   * Yang dipindai: SQL di bangkitan `sqlc` (`internal/controlsql/`, dari
   * `contract/*.sql`) DAN setiap literal SQL tulisan tangan yang tersisa.
   *
   * Perilakunya dibuktikan `internal/jobs/queue_tz_integration_test.go` (tiga
   * TZ proses × tiga zona sesi × dua mode pgx); yang di sini menjaga BENTUKNYA
   * di gerbang yang berjalan pada setiap PR.
   */
  const KOLOM = "run_after|claimed_at|started_at|finished_at|created_at|updated_at";
  const OP = "=|<>|!=|<=|>=|<|>";

  /** Literal SQL mentah (backtick) di satu berkas Go, tanpa baris komentar. */
  const literalSql = (isi: string) =>
    [...isi.replace(/^\s*\/\/.*$/gm, "").matchAll(/`([^`]*)`/g)]
      .map((m) => m[1]!)
      .filter((s) => /\b(SELECT|INSERT|UPDATE|DELETE)\b/.test(s));

  /** Pisah daftar SQL pada koma tingkat teratas (tidak di dalam kurung). */
  const pisah = (daftar: string) => {
    const hasil: string[] = [];
    let kedalaman = 0;
    let kini = "";
    for (const c of daftar) {
      if (c === "(") kedalaman++;
      if (c === ")") kedalaman--;
      if (c === "," && kedalaman === 0) {
        hasil.push(kini.trim());
        kini = "";
      } else kini += c;
    }
    if (kini.trim()) hasil.push(kini.trim());
    return hasil;
  };

  /** Pelanggaran satu literal SQL; kosong = patuh. Diuji juga atas contoh buruk di bawah. */
  const periksa = (sql: string): string[] => {
    const pel: string[] = [];
    const jobs = /\bjobs\b/.test(sql);
    const backup = /\b(backup_runs|conformance_runs)\b/.test(sql);
    if (!jobs && !backup) return pel;

    const langsung = new RegExp(
      `\\b(${KOLOM})\\s*(?:${OP})\\s*(\\$\\d+(?:::[a-z]+)?)|(\\$\\d+(?:::[a-z]+)?)\\s*(?:${OP})\\s*(${KOLOM})\\b`,
      "g"
    );
    for (const m of sql.matchAll(langsung)) {
      const param = m[2] ?? m[3]!;
      const bolehUtc = backup && !jobs && /^\$\d+(?:::text)?::timestamp$/.test(param);
      if (!bolehUtc) pel.push(`${m[1] ?? m[4]} terikat langsung ke ${param}`);
    }

    const ins = sql.match(
      /INSERT\s+INTO\s+(jobs|backup_runs|conformance_runs)\s*\(([^)]*)\)\s*VALUES\s*\(([\s\S]*)\)/i
    );
    if (ins) {
      const kolom = pisah(ins[2]!);
      const nilai = pisah(ins[3]!.replace(/\)\s*(ON CONFLICT|RETURNING)[\s\S]*$/i, ""));
      kolom.forEach((k, i) => {
        if (!new RegExp(`^(${KOLOM})$`).test(k)) return;
        const v = nilai[i] ?? "";
        /* Satu bentuk ber-`$` yang SAH: DURASI dari `now()` server — konvensi
           yang sama dengan `UPDATE … run_after = now() + $n::bigint * interval`
           di `Fail` (jeda putaran PJAP, jalur `integration`). */
        const durasi = /^now\(\) \+ \$\d+::bigint \* interval '1 (microsecond|millisecond)'$/.test(v);
        if (ins[1] === "jobs" && v.includes("$") && !durasi) pel.push(`INSERT jobs.${k} = ${v}`);
        if (ins[1] !== "jobs" && !/^\$\d+(?:::text)?::timestamp$/.test(v) && !/AT TIME ZONE 'UTC'/.test(v)) {
          pel.push(`INSERT ${ins[1]}.${k} = ${v}`);
        }
      });
    }

    if (backup && /now\(\)(?!\s*AT TIME ZONE 'UTC')/.test(sql)) {
      pel.push("jejak putaran memakai now() zona sesi, bukan UTC");
    }
    return pel;
  };

  it("penjaganya menolak bentuk yang dulu ada di pohon ini", () => {
    /* Penjaga atas penjaga: bentuk persis dari sebelum perbaikan — kalau ini
       lolos, penjaga di bawah lulus dengan nol pelanggar tanpa arti. */
    expect(periksa("DELETE FROM jobs WHERE status = 'done' AND finished_at < $1")).not.toEqual([]);
    expect(periksa("UPDATE jobs SET run_after = $4, claimed_at = NULL WHERE id = $1")).not.toEqual([]);
    expect(periksa("UPDATE jobs SET status = 'queued' WHERE claimed_at < $1::timestamp")).not.toEqual([]);
    expect(
      periksa("INSERT INTO backup_runs (started_at, finished_at, status, created_at, updated_at) VALUES ($1, $2, $3, now(), now())")
    ).not.toEqual([]);
    expect(periksa("INSERT INTO jobs (kind, run_after, updated_at) VALUES ($1, $2, now())")).not.toEqual([]);
    expect(periksa("INSERT INTO jobs (kind, run_after, updated_at) VALUES ($1, $2::timestamp + interval '1 second', now())")).not.toEqual([]);
    expect(
      periksa("INSERT INTO jobs (kind, run_after, updated_at) VALUES ($1, now() + $2::bigint * interval '1 microsecond', now())")
    ).toEqual([]);
    // …dan menerima bentuk yang benar.
    expect(periksa("UPDATE jobs SET run_after = now() + $4::bigint * interval '1 microsecond' WHERE id = $1")).toEqual([]);
    expect(
      periksa(
        "INSERT INTO backup_runs (started_at, finished_at, status, created_at, updated_at) VALUES ($1::timestamp, $2::timestamp, $3, now() AT TIME ZONE 'UTC', now() AT TIME ZONE 'UTC')"
      )
    ).toEqual([]);
    expect(
      periksa("INSERT INTO conformance_runs (started_at, finished_at, status, created_at, updated_at) VALUES ($1, $2, $3, now(), now())")
    ).not.toEqual([]);
    // Bentuk bangkitan `sqlc`: teks UTC `::text::timestamp` sah untuk jejak, tidak untuk `jobs`.
    expect(
      periksa(
        "INSERT INTO backup_runs (started_at, finished_at, status, created_at, updated_at) VALUES ($1::text::timestamp, $2::text::timestamp, $3, now() AT TIME ZONE 'UTC', now() AT TIME ZONE 'UTC')"
      )
    ).toEqual([]);
    expect(periksa("INSERT INTO jobs (kind, run_after, updated_at) VALUES ($1, $2::text::timestamp, now())")).not.toEqual([]);
  });

  it("tidak ada SQL Go yang mengikat nilai `$n` langsung ke kolom waktu `jobs`/`backup_runs`", () => {
    const pelanggar: string[] = [];
    let dilihat = 0;
    for (const b of [...TANGAN_PRODUKSI, ...GEN_SQLC]) {
      for (const sql of literalSql(b.isi)) {
        if (/\b(jobs|backup_runs|conformance_runs)\b/.test(sql)) dilihat++;
        for (const p of periksa(sql)) pelanggar.push(`${b.rel}: ${p}`);
      }
    }
    // Pemindai yang tidak melihat apa pun lulus dengan nol pelanggar.
    expect(dilihat, "literal SQL `jobs`/`backup_runs` yang terbaca").toBeGreaterThanOrEqual(10);
    expect(pelanggar, "instan terikat ke TIMESTAMP tanpa zona").toEqual([]);
  });

  it("berkas yang menulis SQL `jobs` tidak memanggil `time.Now()`", () => {
    /* Jam proses tidak punya urusan di tabel yang jamnya `now()` server.
       Satu `time.Now()` di berkas antrean adalah awal dari instan yang
       berikutnya diikat ke kolomnya. */
    /* Sejak `sqlc`, "menulis SQL `jobs`" = memanggil kueri bangkitannya. */
    const menulis = TANGAN_PRODUKSI.filter(
      (b) => literalSql(b.isi).some((s) => /\bjobs\b/.test(s)) || /\bq\.sql\.\w+\(/.test(b.isi)
    );
    expect(menulis.map((b) => b.rel)).toContain("services/integrator/internal/jobs/queue.go");
    const pelanggar = menulis.filter((b) => /\btime\.Now\(/.test(b.isi)).map((b) => b.rel);
    expect(pelanggar).toEqual([]);
  });
});

describe("kosakata lintas bahasa: yang DITULIS Go = yang DIBACA kesehatan", () => {
  /**
   * `backup_runs.status` adalah kolom yang ditulis Go dan dibaca TypeScript,
   * dan ia bukan kosakata yang dibangkitkan dari `contract/` — jadi ia
   * satu-satunya tempat di repo ini di mana dua bahasa menyepakati sebuah
   * nilai tanpa generator di antaranya.
   *
   * Bentuk penyimpangannya tidak menghasilkan satu pun galat: Go yang menulis
   * `"sukses"` alih-alih `"ok"` membuat `lastBackup()` tidak pernah menemukan
   * satu keberhasilan pun — `lastSuccessAt` tetap null selamanya, denyutnya
   * `late`, dan `watch:health` mengirim surel setiap hari tentang cadangan
   * yang sebenarnya berjalan sempurna. Kebalikannya lebih buruk: Go yang
   * menulis `"ok"` untuk salinan yang TIDAK pergi ke luar mesin membuat
   * permukaan ini berkata terlindungi untuk keadaan yang satu kehilangan mesin
   * saja sudah cukup menghapus semuanya.
   *
   * Dibangkitkan? Tidak — tiga nilai di satu kolom belum sepadan dengan satu
   * entri lagi di `contract/`, dan generator yang dipanggil untuk hal sekecil
   * ini akan membuat orang berikutnya menambahkan hal kecil lain ke sana
   * sampai `contract/` menjadi berkas konfigurasi. Yang dipilih penjaga ini:
   * satu tes yang menyebut bentuk kegagalannya.
   */
  const KOSAKATA = ["ok", "local", "error"];

  it("Go menulis ketiga nilai yang sama, tidak lebih", () => {
    const trail = GO.find((b) => b.rel.endsWith("internal/trail/backup.go"));
    expect(trail, "internal/trail/backup.go").toBeDefined();
    for (const nilai of KOSAKATA) {
      expect(trail!.isi, nilai).toContain(`\`${nilai}\``);
    }

    /* Nilai yang SUNGGUH diberikan ke kolomnya datang dari `Hasil.Status` di
       paket backup, bukan dari berkas jejaknya. Di sanalah ia diperiksa. */
    const jalankan = GO.find((b) => b.rel.endsWith("internal/backup/jalankan.go"))!.isi;
    const literal = [...jalankan.matchAll(/status\s*(?::=|=)\s*"([a-z_]+)"/g)].map((m) => m[1]!);
    expect(literal.length, "status putaran tidak ditetapkan di `jalankan.go`").toBeGreaterThan(0);
    for (const nilai of literal) expect(KOSAKATA, `status ${nilai}`).toContain(nilai);
  });

  it("`ok` HANYA untuk salinan yang pergi ke LUAR mesin", () => {
    /* Satu kata ini yang menentukan apakah permukaan kesehatan berkata benar. */
    const jalankan = GO.find((b) => b.rel.endsWith("internal/backup/jalankan.go"))!.isi;
    expect(jalankan).toMatch(/status := "local"[\s\S]{0,200}LuarMesin\(\)[\s\S]{0,80}status = "ok"/);
  });

  it("`conformance_runs.status` dari Go = kosakata yang ditulis Node (ok | findings | error)", () => {
    /* Sejak sakelar `runner:` satu tabel punya dua kemungkinan penulis. Status
       yang hanya dikenal satu sisi membuat konsol `/conformance` mewarnai
       putaran Go berbeda dari putaran Node yang hasilnya sama. */
    const sapuan = GO.find((b) => b.rel.endsWith("internal/conformance/sweep.go"));
    expect(sapuan, "internal/conformance/sweep.go").toBeDefined();
    const literal = [...sapuan!.isi.matchAll(/[Ss]tatus\s*(?::=|=)\s*"([a-z_]+)"/g)].map((m) => m[1]!);
    expect(literal.length).toBeGreaterThanOrEqual(3);
    for (const nilai of literal) expect(["ok", "findings", "error"], nilai).toContain(nilai);
    const node = readFileSync(join(AKAR_REPO, "scripts", "check-data-conformance.ts"), "utf8");
    expect(node).toContain('status: "ok" | "findings" | "error"');
  });

  it("TypeScript membaca ketiga nilai itu juga", () => {
    const health = readFileSync(join(AKAR_REPO, "src", "lib", "health-report.ts"), "utf8");
    expect(health).toContain('status: "ok"');
    expect(health).toContain('percobaan.status === "ok"');
    expect(health).toContain('percobaan.status === "local"');
  });
});

describe("integrator tidak menyentuh bidang yang bukan miliknya", () => {
  it("tidak MEMBACA alamat basis data penagihan", () => {
    /* #137: bidang penagihan turun ≠ aplikasi turun, dan integrator tidak punya
       urusan di sana sama sekali.
     *
     * Yang dilarang BACAANNYA (`os.Getenv`), bukan penyebutannya: komentar yang
     * menjelaskan kenapa variabel ini tidak dibaca adalah komentar yang paling
     * ingin dibaca orang berikutnya, dan penjaga yang menolaknya memaksa
     * alasannya dihapus dari tempat ia paling berguna. Ini bukan pelonggaran —
     * `os.Getenv("PLATFORM_DATABASE_URL")` tetap merah, dan itu diuji dengan
     * menambahkannya. */
    const baca = /os\.Getenv\(\s*"PLATFORM_DATABASE_URL"/;
    for (const b of GO) {
      expect(baca.test(b.isi), b.rel).toBe(false);
      expect(b.isi, b.rel).not.toContain("platformDb");
    }
  });

  it("basis data penagihan TETAP ikut dicadangkan — lewat pencacahan server", () => {
    /* Penjaga di atas tidak boleh terbaca sebagai "platform tidak dicadangkan".
       Pencacahan lewat `pg_database` itulah yang membuat integrator tidak perlu
       memegang alamatnya: `sai_platform` ikut punya objek dumpnya sendiri tanpa
       satu baris kredensial penagihan pernah masuk ke jalur ini. */
    const daftar = GO.find((b) => b.rel.endsWith("internal/backup/daftar.go"));
    expect(daftar, "internal/backup/daftar.go").toBeDefined();
    expect(daftar!.isi).toContain("FROM pg_database");
    expect(daftar!.isi).toContain("sai_platform");
  });

  it("konteks perusahaan yang hilang MELEMPAR, tidak jatuh ke bawaan", () => {
    /* Aturan #104 yang paling mahal bila dilanggar: jatuh ke bawaan berarti
       pekerjaan PT A menulis ke buku PT B tanpa galat dan tanpa jejak. */
    const dsn = GO.find((b) => b.rel.endsWith("internal/db/dsn.go"))!.isi;
    expect(dsn).toContain("CONTROL_DATABASE_URL belum diset");
    expect(dsn).toMatch(/MELEMPAR|melempar/);
  });
});
