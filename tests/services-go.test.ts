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

/** Berkas Go tulisan TANGAN — yang dibangkitkan tunduk pada aturan lain. */
const TANGAN = GO.filter((b) => b.rel !== GEN);

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

  it("satu-satunya tabel yang ditulis pohon Go adalah `jobs`", () => {
    /* Lebih kuat daripada penjaga di atas, dan sengaja: daftar tabel buku hanya
       memuat basis data PERUSAHAAN, jadi tulisan ke tabel `control` atau
       `platform` mana pun akan lolos darinya. Penagihan (#137) dan pengguna
       bukan milik integrator. */
    const ditulis = new Set<string>();
    for (const b of GO) for (const t of tulisan(b.isi)) ditulis.add(t.tabel);
    expect([...ditulis].sort()).toEqual(["jobs"]);
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

describe("integrator tidak menyentuh bidang yang bukan miliknya", () => {
  it("tidak ada rujukan ke basis data penagihan atau platform", () => {
    /* #137: bidang penagihan turun ≠ aplikasi turun, dan integrator tidak punya
       urusan di sana sama sekali. */
    for (const b of GO) {
      expect(b.isi, b.rel).not.toContain("PLATFORM_DATABASE_URL");
      expect(b.isi, b.rel).not.toContain("platformDb");
    }
  });

  it("konteks perusahaan yang hilang MELEMPAR, tidak jatuh ke bawaan", () => {
    /* Aturan #104 yang paling mahal bila dilanggar: jatuh ke bawaan berarti
       pekerjaan PT A menulis ke buku PT B tanpa galat dan tanpa jejak. */
    const dsn = GO.find((b) => b.rel.endsWith("internal/db/dsn.go"))!.isi;
    expect(dsn).toContain("CONTROL_DATABASE_URL belum diset");
    expect(dsn).toMatch(/MELEMPAR|melempar/);
  });
});
