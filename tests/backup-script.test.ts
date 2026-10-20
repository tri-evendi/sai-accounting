/**
 * PENJAGA #374 — jaminan skrip cadangan.
 *
 * Skrip cadangan punya sifat aneh: ia berjalan hijau setiap hari selama
 * bertahun-tahun, dan kesalahannya baru ketahuan pada satu hari ketika kita
 * paling tidak bisa menanggungnya. Tidak ada permukaan yang berubah warna
 * ketika seseorang menukar urutan dua langkah di dalamnya.
 *
 * Karena itu yang dijaga di sini bukan "apakah ia jalan" — itu urusan latihan
 * pemulihan — melainkan URUTAN dan SYARAT yang membuat kegagalannya tidak
 * berbahaya. Idiom sapuan sumber yang sama dengan `tests/no-public-uploads.test.ts`.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { tanpaKomentar } from "./akar-sumber";

const script = readFileSync(join(process.cwd(), "scripts", "backup.sh"), "utf8");
const compose = readFileSync(join(process.cwd(), "docker-compose.yml"), "utf8");

/** Posisi sebuah langkah di dalam skrip — untuk menguji URUTANNYA. */
const at = (needle: string): number => {
  const i = script.indexOf(needle);
  expect(i, `tidak ditemukan di backup.sh: ${needle}`).toBeGreaterThan(-1);
  return i;
};

describe("skrip cadangan: syarat yang menolak berjalan (#374)", () => {
  it("berhenti pada galat pertama, bukan melanjutkan setengah jalan", () => {
    // Tanpa ini, `mariadb-dump` yang gagal tetap diikuti tar, enkripsi, dan
    // unggah — menghasilkan "cadangan" berisi arsip kosong yang lampunya hijau.
    expect(script).toMatch(/^set -eu$/m);
  });

  it("menolak berjalan tanpa kunci enkripsi", () => {
    // Isinya seluruh pembukuan setiap pelanggan. Cadangan tanpa sandi yang
    // dikirim ke penyimpanan objek adalah kebocoran yang kita jadwalkan sendiri.
    expect(script).toContain('BACKUP_ENCRYPTION_KEY:-');
    expect(script).toMatch(/BACKUP_ENCRYPTION_KEY[\s\S]{0,200}die/);
  });

  it("tanpa tujuan di luar mesin ia TETAP mencadangkan — ke cakram, dan berkata apa adanya", () => {
    // ══ TES INI DULU MENUNTUT YANG SEBALIKNYA ════════════════════════════════
    // Sampai 12 Okt 2026 ia menuntut `BACKUP_S3_BUCKET[\s\S]{0,200}die` — tanpa
    // bucket, skripnya harus MENOLAK berjalan. Niatnya benar ("cadangan yang
    // tinggal di mesin yang sama bukan cadangan") tapi akibatnya terukur dan
    // buruk: produksi menjalankan 54 putaran dengan NOL artefak, dan satu-satunya
    // jaring adalah dump tangan yang kebetulan diambil saat rilis.
    //
    // Penolakan itu melindungi dari SATU bentuk kegagalan — kehilangan mesin —
    // dengan membiarkan kita tanpa pertahanan terhadap semua bentuk lain:
    // `DROP TABLE` keliru, migrasi yang merusak, kerusakan logis. Itu mayoritas
    // kejadian yang sungguh terjadi.
    //
    // Yang dijaga SEKARANG bukan lagi "menolak", melainkan "tidak pernah
    // mengklaim lebih dari yang benar".
    expect(script).toMatch(/MODE=lokal/);
    expect(script).toMatch(/BACKUP_LOCAL_DIR/);
  });

  it("putaran lokal dicatat `lokal`, BUKAN `ok` — satu kata yang menentukan kejujurannya", () => {
    // `backupHealth` mencari keberhasilan dengan `where: { status: "ok" }`.
    // Kalau putaran lokal ikut menulis `ok`, `lastSuccessAt` terisi, umurnya
    // terhitung segar, dan permukaan kesehatan berkata TERLINDUNGI untuk keadaan
    // yang satu kehilangan mesin saja sudah cukup menghapus data dan salinannya
    // sekaligus. Ini satu-satunya baris yang mencegah itu.
    expect(script).toMatch(/rekam lokal/);
    expect(script).toMatch(/MODE" = "s3"[\s\S]{0,120}rekam ok/);
  });

  it("mode lokal berbunyi di log, tidak menyelinap", () => {
    // Jaring sementara yang dipasang diam-diam adalah jaring yang dilupakan
    // sebagai permanen.
    expect(script).toMatch(/BACKUP_S3_BUCKET belum diset[\s\S]{0,200}TIDAK menyelamatkan/);
  });

  it("salinan lokal ditulis lewat berkas sementara, lalu dipindahkan", () => {
    // `cp` yang terputus di tengah meninggalkan berkas setengah yang NAMANYA
    // tampak sah — dan nama yang tampak sah itulah yang akan dipercaya pada hari
    // pemulihan. `mv` dalam satu filesystem bersifat atomik.
    expect(script).toMatch(/\.partial/);
    expect(script).toMatch(/mv "\$\{DEST\}\/\.\$\(basename "\$SEALED"\)\.partial"/);
  });

  it("pemangkasan lokal TIDAK PERNAH membuang salinan terbaru", () => {
    // Aturan yang tidak ada di jalur S3, dan harus ada di sini: di S3 retensi 30
    // hari tanpa pengecualian aman karena sumber lain masih ada; di cakram ini
    // direktori itu satu-satunya yang ada. Sebuah mesin yang mati sebulan lalu
    // hidup kembali tidak boleh menyalakan pemangkas yang menghapus salinan
    // terakhirnya sendiri.
    expect(script).toMatch(/TERBARU=/);
    expect(script).toMatch(/\[ "\$base" = "\$TERBARU" \] && continue/);
  });

  it("mencadangkan SELURUH basis data, bukan daftar yang diketik tangan", () => {
    // Daftar yang diketik tangan pasti tertinggal saat pelanggan baru mendaftar
    // — dan cadangan "hampir semua" adalah janji yang diingkari diam-diam.
    expect(script).toContain("--all-databases");
    expect(script).toContain("--single-transaction");
  });

  it("berkas di luar basis data ikut (#367 dokumen, #370 jejak)", () => {
    expect(script).toContain("documents");
    expect(script).toContain("audit");
  });
});

describe("skrip cadangan: urutan yang membuat kegagalan tidak berbahaya", () => {
  it("menyandikan SEBELUM mengirim, tidak pernah sesudah", () => {
    expect(at("openssl enc")).toBeLessThan(at("aws s3 cp"));
  });

  it("memangkas PALING AKHIR, setelah unggahan berhasil", () => {
    // Memangkas lebih dulu bisa meninggalkan kita tanpa cadangan sama sekali:
    // yang lama sudah dibuang, yang baru gagal naik.
    expect(at("aws s3 cp")).toBeLessThan(at("aws s3 rm"));
  });

  it("unggahan yang gagal MENGHENTIKAN skrip sebelum pemangkasan", () => {
    const upload = script.slice(at("aws s3 cp"), at("aws s3 rm"));
    expect(upload).toContain("die");
  });

  it("sidik jari dihitung dan ikut dikirim", () => {
    // AES-256-CBC tidak membawa pemeriksaan keutuhan sendiri: tanpa berkas
    // .sha256 di sebelahnya, arsip yang rusak di tengah jalan baru ketahuan
    // pada hari kita paling tidak ingin menemukannya.
    expect(script).toContain("sha256sum");
    expect(script).toContain(".sha256");
  });
});

describe("skrip cadangan: tujuan diturunkan dari URL, bukan sakelar sendiri", () => {
  /*
   * == CACAT YANG DIJAGA DI SINI, DAN IA SUDAH TERJADI ======================
   * Mesinnya sudah diturunkan dari `DATABASE_URL`; HOST-nya tidak — ia berdiri
   * sendiri sebagai `: "${DB_HOST:=db}"`. Sesudah penukaran PostgreSQL 15 Okt
   * 2026, skrip ini memakai perkakas yang BENAR terhadap host yang SALAH:
   *
   *   pg_dumpall: error: connection to server at "db" (172.19.0.2), port 5432
   *   failed: Connection refused
   *
   * Yang membuatnya mahal bukan galatnya — galatnya jelas. Yang mahal adalah
   * ia tidak terlihat di mana pun kecuali di `/api/health`: container tetap
   * "Up", penjadwal tetap `ok`, dan tidak ada satu pun cadangan otomatis yang
   * berhasil selama berjam-jam.
   */
  /*
   * ⚠ Komentar DIBUANG lebih dulu. Komentar yang menjelaskan cacat ini
   * mengutip `DB_HOST:=db` apa adanya, dan tes yang memindai mentah akan
   * membaca penjelasannya sebagai pelanggaran. Pola ini sudah menggigit EMPAT
   * kali di repo ini — tes yang menghukum dokumentasi yang baik akan membuat
   * orang menghapus dokumentasinya.
   */
  const kode = script
    .split("\n")
    .filter((b) => !/^\s*#/.test(b))
    .join("\n");

  /** Cabang `then` dan `else` dari percabangan mesin, terpisah. */
  const cabang = (() => {
    const mulai = kode.indexOf('if [ "$MESIN" = "postgres" ]');
    const sisa = kode.slice(mulai);
    const iElse = sisa.indexOf("\nelse\n");
    const iFi = sisa.indexOf("\nfi\n");
    return { pg: sisa.slice(0, iElse), maria: sisa.slice(iElse, iFi) };
  })();

  it("percabangan mesinnya ketemu — penjaga atas tes ini sendiri", () => {
    expect(cabang.pg.length).toBeGreaterThan(50);
    expect(cabang.maria.length).toBeGreaterThan(20);
  });

  it("host, port, peran, dan sandi PostgreSQL diambil dari DATABASE_URL", () => {
    expect(kode).toMatch(/DATABASE_URL#\*:\/\//);
    expect(cabang.pg).toMatch(/DB_HOST:=\$_host/);
    expect(cabang.pg).toMatch(/DB_PORT:=\$_port/);
  });

  it("`db` hanya boleh menjadi bawaan di cabang MariaDB", () => {
    /* Bawaan `db` yang berdiri di luar percabangan berlaku untuk KEDUA mesin —
       itulah bentuk persis cacat yang sudah terjadi. */
    expect(cabang.pg, "cabang PostgreSQL tidak boleh menyebut host `db`").not.toMatch(
      /DB_HOST:=db/
    );
    expect(cabang.maria).toMatch(/DB_HOST:=db/);
  });

  it("peran PostgreSQL TIDAK dipaku `postgres`", () => {
    /* Peran super di pemasangan ini bernama `sai`. Nama yang dipaku gagal di
       setiap pemasangan yang menamainya lain — termasuk yang ini. */
    expect(kode).not.toMatch(/--username=postgres\b/);
    expect(kode).toMatch(/--username="\$DB_USER"/);
  });

  it("kredensial di URL di-decode sebelum dipakai", () => {
    /* Sandi ter-persen-encode gagal hanya ketika ia kebetulan memuat `@`
       atau `%` — yaitu gagal belakangan, pada sandi yang berbeda, jauh dari
       perubahan yang menyebabkannya. Dua skrip di repo ini sudah kena. */
    expect(kode).toMatch(/uri_decode/);
  });
});

describe("skrip cadangan: kredensial tidak pernah terlihat", () => {
  it("kata sandi basis data lewat berkas opsi, bukan argumen", () => {
    // Argumen baris perintah terbaca siapa pun yang bisa menjalankan `ps` di
    // dalam container.
    expect(script).toContain("--defaults-extra-file");
    expect(script).not.toMatch(/-p\$\{?DB_ROOT_PASSWORD/);
    expect(script).not.toMatch(/--password=\$/);
  });

  it("kunci enkripsi lewat environment, bukan argumen", () => {
    expect(script).toContain("-pass env:BACKUP_ENCRYPTION_KEY");
    expect(script).not.toMatch(/-pass\s+pass:/);
  });

  it("berkas kerja dibuang apa pun yang terjadi", () => {
    // Termasuk berkas opsi yang memuat kata sandi root.
    expect(script).toContain("trap cleanup EXIT");
  });
});

/**
 * Potongan satu layanan compose, sampai layanan BERIKUTNYA.
 *
 * Diambil sampai nama layanan berikutnya, bukan sampai nama yang dipaku —
 * supaya rename berikutnya tidak memecahkan tes ini lagi (`backup` →
 * `job-backup`, `web` → `app-customer` + `app-operator`).
 */
function layanan(nama: string): string {
  const mulai = compose.indexOf(`\n  ${nama}:`);
  expect(mulai, `layanan ${nama} tidak ada di compose`).toBeGreaterThan(-1);
  const sisa = compose.slice(mulai + 1);
  const habis = sisa.search(/\n {2}[a-z][a-z0-9-]*:$/m);
  return habis > 0 ? sisa.slice(0, habis) : sisa;
}

/**
 * Teks compose TANPA baris komentar.
 *
 * Pembungkus satu baris di atas `tanpaKomentar` yang bersama — aturannya,
 * beserta empat kali ia terbukti perlu, ada di `tests/akar-sumber.ts`.
 * Namanya dipertahankan karena di berkas ini yang dibaca memang PERINTAH
 * compose, dan itu yang dicari orang saat membaca asersinya.
 */
const perintah = tanpaKomentar;

describe("jalur `tenant` di compose — PELAKSANA cadangan sejak tahap 1b", () => {
  const svc = layanan("svc-tenant");

  it("ada, dan hidup lagi setelah restart mesin", () => {
    expect(svc).toContain("restart: unless-stopped");
  });

  it("dibangun dari tahap Go, bukan dari image migrator", () => {
    /* Image yang salah di sini adalah bentuk kegagalan paling senyap di seluruh
       penyebaran: layanan ini tidak melayani HTTP, jadi image yang keliru tidak
       merusak satu halaman pun — ia hanya tidak mencadangkan. */
    expect(svc).toMatch(/target: integrator/);
    expect(svc).toMatch(/-integrator:\$\{SAI_TAG/);
  });

  it("volume yang DICADANGKAN tetap hanya-baca", () => {
    /* Layanan yang tugasnya menyalin tidak punya satu alasan pun untuk bisa
       menulis, dan bendera itu menghapus seluruh kelas kecelakaan di mana jalur
       cadangan justru merusak yang dicadangkannya. */
    expect(svc).toMatch(/documents:\/app\/data\/documents:ro/);
    expect(svc).toMatch(/audit:\/app\/data\/audit:ro/);
  });

  it("punya tepat SATU mount yang bisa ditulis, dan itu tujuannya sendiri", () => {
    const mounts = svc
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => /^- \w+:\/app\//.test(l));
    const bisaDitulis = mounts.filter((l) => !l.endsWith(":ro"));
    expect(bisaDitulis).toEqual(["- cadangan:/app/data/cadangan"]);
  });

  it("menyambung LANGSUNG ke `pg`, melewati PgBouncer", () => {
    /* Jalur ini MENDAFTAR seluruh basis data (`pg_database`) lalu menyambung ke
       tiap-tiap basis data. PgBouncer hanya mengekspos yang terdaftar di
       konfigurasinya, jadi lewat pooler pencacahan memulangkan SEBAGIAN — dan
       sebagian itulah bentuk cadangan paling berbahaya: ia ada, ia tampak
       berhasil, dan ia baru ketahuan kurang pada hari pemulihan. */
    expect(svc).toMatch(/CONTROL_DATABASE_URL:\s*postgres:\/\/[^\n]*@pg:5432/);
    expect(svc).not.toMatch(/@pgbouncer:/);
  });

  it("TIDAK bergantung pada pgbouncer", () => {
    // Bergantung pada yang sengaja dilewati hanya menunda boot tanpa manfaat.
    const dep = svc.slice(svc.indexOf("depends_on:"));
    expect(dep).not.toContain("pgbouncer");
  });

  it("diberi jendela berhenti supaya objek yang sedang ditulis selesai rapi", () => {
    expect(svc).toMatch(/stop_grace_period:/);
  });
});

describe("cut-over: TEPAT SATU pelaksana cadangan", () => {
  it("`job-backup` tidak lagi menjalankan `backup.sh` di sebuah putaran", () => {
    /* Membiarkan putaran harian lama tetap hidup berarti DUA pelaksana untuk
       satu pekerjaan, dan yang memisahkan keduanya hanya nama berkas yang
       kebetulan berbeda. Cacat yang persis sama hampir lolos di tahap 1a,
       ketika `recurring:run` masih di penjadwal sementara `svc-ledger` lahir. */
    const jb = perintah(layanan("job-backup"));
    expect(jb).not.toMatch(/sh scripts\/backup\.sh/);
    expect(jb).not.toMatch(/sleep 86400/);
  });

  it("`job-backup` tidak ikut `docker compose up`", () => {
    const jb = layanan("job-backup");
    expect(jb).toMatch(/profiles:\s*\["perkakas"\]/);
    /* Dan perintahnya tidak boleh `unless-stopped`: perintah yang berakhir di
       bawah restart otomatis adalah crash-loop yang mengisi log tanpa
       mengerjakan apa pun. */
    expect(jb).toMatch(/restart: "no"/);
  });

  it("`job-backup` tetap bisa dipanggil sebagai PERKAKAS", () => {
    /* Image-nya satu-satunya yang punya klien Prisma, `openssl`, `awscli`, DAN
       klien MariaDB — yang terakhir supaya pembukti masih bisa membaca artefak
       dari sebelum penukaran mesin. `svc-tenant` sengaja tidak memuat semua itu. */
    const jb = layanan("job-backup");
    expect(jb).toMatch(/target: backup/);
    expect(jb).toMatch(/docker compose run --rm job-backup/);
  });

  it("tidak ada layanan LAIN yang menjalankan `backup.sh`", () => {
    /* Penjaga atas penjaga di atas: cut-over yang hanya memeriksa satu layanan
       akan lolos pada hari seseorang menyalin putaran lamanya ke layanan baru. */
    expect(perintah(compose)).not.toMatch(/scripts\/backup\.sh/);
  });

  it("penjadwal MENERBITKAN pekerjaan cadangan", () => {
    /* Tanpa langkah ini tidak ada yang menerbitkan `tenant.backup`, dan
       `svc-tenant` akan hidup menganggur selamanya — antrean kosong, umur
       tertua nol, setiap ambang HIJAU, sementara tidak satu salinan pun pernah
       dibuat. Itu kegagalan total yang terbaca sebagai kesehatan sempurna. */
    expect(layanan("job-scheduler")).toMatch(/langkah backup:publish bun run backup:publish/);
  });
});

describe("pembukti pemulihan: harus bisa membaca artefak yang BENAR-BENAR ada", () => {
  const prover = readFileSync(join(process.cwd(), "scripts/prove-backup-restore.ts"), "utf8");

  it("tidak berhenti hanya karena BACKUP_S3_BUCKET kosong (12 Okt 2026)", () => {
    /*
     * Cacat yang hampir lolos: jalur cadangan belajar menyimpan ke cakram, tapi
     * pembuktinya masih menuntut bucket. Hasilnya jaring yang TIDAK BISA
     * dibuktikan — dan aturan repo ini jelas, cadangan yang belum pernah dibuka
     * bukan cadangan. Pembuktian yang tidak bisa membaca satu-satunya artefak
     * yang ada tidak membuktikan apa pun.
     *
     * Diperiksa dari PERILAKUNYA, bukan dari nama sebuah variabel: nama berubah
     * saat pembukti ini ditulis ulang untuk tata letak per tenant, dan penjaga
     * yang terpaku pada nama akan merah atas perubahan yang justru memperluas
     * kemampuannya.
     */
    expect(prover).not.toMatch(/if \(!bucket\) fail/);
    expect(prover).toContain("BACKUP_LOCAL_DIR");
    expect(prover).toMatch(/bucket \? sumberS3\([^)]*\) : sumberCakram\(/);
  });

  it("artefak lokal DISALIN ke direktori kerja, tidak dibuka di tempatnya", () => {
    // Dekripsi menulis hasilnya di sebelah berkas sumbernya, dan direktori
    // cadangan adalah satu-satunya tempat artefak itu ada. Pembuktian tidak
    // boleh menyentuh apa yang dibuktikannya.
    expect(prover).toContain("copyFileSync");
  });

  it("langkah pembuktiannya SAMA untuk kedua sumber — yang diuji artefaknya", () => {
    /* Satu fungsi sidik jari, satu fungsi dekripsi. Dua jalur pembuktian akan
       menyimpang, dan yang menyimpang akan dipercaya justru pada hari ia salah. */
    expect(prover.match(/createHash\("sha256"\)/g) ?? []).toHaveLength(1);
    expect(prover.match(/"enc", "-d"/g) ?? []).toHaveLength(1);
  });

  it("mode lokal MENGUMUMKAN batasnya, bukan lulus diam-diam", () => {
    expect(prover).toMatch(/TIDAK menyelamatkan dari kehilangan mesin/);
  });

  it("mengerti KEDUA tata letak — baru dan warisan", () => {
    /* Pada hari cut-over, artefak TERBARU yang ada masih berbentuk lama. Pembukti
       yang hanya mengerti bentuk baru akan menolak satu-satunya salinan yang ada,
       justru pada hari ia paling dibutuhkan. Aturan yang sama sudah berlaku untuk
       dump MariaDB sesudah penukaran PostgreSQL. */
    expect(prover).toMatch(/async function buktikanPutaran/);
    expect(prover).toMatch(/async function buktikanBerkasLama/);
    /* Dan bentuknya dikenali dari NAMANYA, bukan dari bendera tambahan: satu
       bendera lagi adalah satu hal lagi yang harus diingat benar pada hari
       pemulihan. */
    expect(prover).toMatch(/diminta\.endsWith\("\.enc"\)/);
  });

  it("memeriksa SETIAP objek, bukan satu", () => {
    /* Satu dump PT yang rusak tidak boleh tersembunyi di balik putaran yang
       "lampu hijau" — itu bentuk kegagalan yang sama dengan cadangan yang
       kehilangan satu PT: gagal untuk satu customer saja, dan karena itu paling
       mudah tidak terlihat. */
    const i = prover.indexOf("for (const o of manifest.objek)");
    expect(i, "manifest tidak dilalui satu per satu").toBeGreaterThan(-1);
    const badan = prover.slice(i, prover.indexOf("\n  }", i));
    expect(badan).toContain("SIDIK JARI TIDAK COCOK");
    expect(badan).toContain("dekripsi(");
  });

  it("objek basis data dibuktikan `pg_restore --list`, bukan dengan menebak isinya", () => {
    /* `pg_restore --list` membaca KATALOG dump format custom tanpa memuat satu
       baris pun ke mana pun. Ia membuktikan dua hal yang pemeriksaan "memuat
       teks .sql" tidak bisa: bahwa berkasnya memang dump PostgreSQL, dan bahwa
       katalognya utuh. */
    expect(prover).toMatch(/run\("pg_restore", \["--list"/);
  });

  it("manifest yang HILANG menggagalkan pembuktian", () => {
    /* Manifest ditulis PALING AKHIR, jadi ketiadaannya berarti putaran itu
       berhenti di tengah — objek di dalamnya tidak lengkap, dan tidak ada yang
       bisa mengatakan apa yang kurang. */
    expect(prover).toMatch(/BERHENTI DI TENGAH/);
  });

  it("menuntut peran & hak akses ikut", () => {
    /* Dump per basis data tidak memuat satu pun peran, jadi pemasangan yang
       dipulihkan dari dump-dump itu SAJA akan berisi data lengkap yang tidak
       bisa dimasuki siapa pun. */
    expect(prover).toMatch(/CREATE ROLE/);
    expect(prover).toMatch(/tidak memuat objek `globals`/);
  });

  it("menuntut SETIAP PT terdaftar punya objek dumpnya SENDIRI", () => {
    /* Inilah aturan kelengkapan §6, dan ia TIDAK BISA dijawab oleh dump besar:
       "hadir di dalam satu dump" dan "punya objek dumpnya sendiri" adalah dua
       janji yang berbeda, dan hanya yang kedua yang membuat satu tenant bisa
       dipulihkan tanpa menyentuh tenant lain. */
    expect(prover).toMatch(/tidak punya objeknya sendiri/);
    expect(prover).toMatch(/CADANGAN TIDAK LENGKAP/);
  });

  it("mencetak perintah pemulihan SATU PT", () => {
    /* Permintaan yang melahirkan celah #5: "pulihkan data kami saja ke keadaan
       Selasa". Perintahnya dicetak di tempat orang membacanya — di akhir
       pembuktian, bukan hanya di runbook. */
    expect(prover).toMatch(/pg_restore -h <host-bayangan>/);
    expect(prover).toMatch(/Pulihkan SATU PT saja/);
  });

  it("TIDAK memuat apa pun ke basis data mana pun", () => {
    /* Satu perintah yang salah sasaran akan menimpa produksi dengan data lama,
       dan tidak ada nilai pembuktian yang sepadan dengan risiko itu. */
    expect(prover).not.toMatch(/run\("psql"/);
    expect(prover).not.toMatch(/run\("pg_restore", \["(?!--list)/);
    expect(prover).not.toMatch(/\$executeRaw|\$queryRaw/);
  });
});
