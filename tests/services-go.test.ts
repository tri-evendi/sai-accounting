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
const BANGKITAN = [GEN, GEN_AKUNTANSI, GEN_TATA_LETAK, GEN_INSTANS];

/** Berkas Go tulisan TANGAN — yang dibangkitkan tunduk pada aturan lain. */
const TANGAN = GO.filter((b) => !BANGKITAN.includes(b.rel));

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
   * ⚠ MENAMBAH BARIS DI SINI ADALAH KEPUTUSAN. Setiap tambahan memperluas apa
   * yang bisa ditulis bahasa yang bukan pemilik pintu posting, dan alasannya
   * ditulis DI SINI — bukan di pesan commit yang tak akan dibaca orang
   * berikutnya.
   */
  const BOLEH_DITULIS = ["backup_runs", "jobs"];

  it("pohon Go hanya menulis tabel yang ada di daftar-izin", () => {
    const ditulis = new Set<string>();
    for (const b of GO) for (const t of tulisan(b.isi)) ditulis.add(t.tabel);
    expect([...ditulis].sort()).toEqual(BOLEH_DITULIS);
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
  const Q = GO.find((b) => b.rel.endsWith("internal/jobs/queue.go"))!.isi;
  const badan = (nama: string) => {
    const i = Q.indexOf(`func (q *Queue) ${nama}(`);
    expect(i, nama).toBeGreaterThan(-1);
    return Q.slice(i, Q.indexOf("\n}", i));
  };

  it("klaim adalah SATU pernyataan dengan `FOR UPDATE SKIP LOCKED`", () => {
    /* `SELECT … FOR UPDATE SKIP LOCKED` lalu `UPDATE` terpisah lolos setiap
       pengujian satu pekerja, dan gagal di produksi: dua pekerja memilih baris
       yang sama di celah antara dua pernyataan. Untuk `tenant.backup` itu dua
       dump menulis ke satu kunci objek, dan yang terakhir menang. */
    const b = badan("Claim");
    expect(b).toContain("FOR UPDATE SKIP LOCKED");
    expect(b).toMatch(/UPDATE jobs SET status = 'claimed'[\s\S]*WHERE id = \(\s*SELECT id/);
    expect(b.match(/pool\.(Query|QueryRow|Exec)\(/g) ?? []).toHaveLength(1);
  });

  it("setiap tulisan pekerja terkunci pada pemilik lease-nya", () => {
    /* Tanpa `claimed_by = $2`, pekerja yang lease-nya sudah kedaluwarsa tetap
       bisa menulis hasil ke pekerjaan yang kini milik pekerja lain — dua hasil
       untuk satu pekerjaan, dan yang terakhir menang. */
    for (const fn of ["RenewLease", "ReportProgress", "Complete"]) {
      const b = badan(fn);
      expect(b, fn).toContain("claimed_by = $2");
      expect(b, fn).toContain("status = 'claimed'");
    }
  });

  it("kegagalan yang barisnya bukan milik pekerja ini TIDAK ditulis", () => {
    /* Menulis kegagalan di sini akan menaikkan `attempts` milik pekerjaan orang
       lain, dan pekerjaan itu akan mati lebih cepat tanpa pernah gagal. */
    const b = badan("Fail");
    expect(b).toContain("claimed_by = $2");
    expect(b).toContain("pgx.ErrNoRows");
  });

  it("pengarsipan menyentuh `done` SAJA", () => {
    /* `dead` dan `failed` tidak pernah dipangkas: kegagalan adalah isi paling
       berharga di tabel ini, dan ia justru yang dicari orang berbulan-bulan
       kemudian. Predikat yang melebar ke "sudah selesai" membuang justru baris
       yang paling dicari orang. */
    const b = badan("ArchiveDone");
    expect(b).toContain("status = 'done'");
    expect(b).not.toMatch(/'dead'|'failed'|IN \(/);
  });

  it("reclaim memakai ambang lease dari kontrak, bukan dugaan durasi", () => {
    expect(Q).toContain("claimed_at < $1");
    const b = badan("ReclaimStale");
    expect(b).toContain("status = 'claimed'");
    expect(b).toContain("attempts + 1");
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
