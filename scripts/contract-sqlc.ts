/**
 * LANGKAH `sqlc` DARI `contract:gen` — kueri Go bertipe atas basis data kendali
 * (09 §3.5): `contract/jobs.sql` + `contract/trail.sql` →
 * `services/integrator/internal/controlsql/`.
 *
 * ══ GERBANGNYA TANPA `sqlc`, TANPA GO, TANPA JARINGAN ══════════════════════
 * `sqlc` adalah biner Go yang ditarik lewat `go run` dengan versi yang dipatok
 * di `services/integrator/tools/sqlc/go.mod`. Menjalankannya di gerbang
 * (`contract:gen --cek`, dipanggil `bun run verify` di CI) berarti gerbang
 * yang butuh toolchain Go dan unduhan modul — dan gerbang yang bergantung pada
 * jaringan gagal karena hal yang bukan kodenya (`tests/gerbang-go.test.ts`
 * menolak bentuk itu untuk gerbang Go juga).
 *
 * Maka yang diperiksa `--cek` adalah SIDIK: SHA-256 setiap masukan (konfigurasi,
 * berkas kueri, skema = migration kendali berurutan, `go.mod`/`go.sum`
 * perkakas — versi `sqlc` ikut di dalamnya) dan setiap keluaran, tercatat di
 * `controlsql/sqlc.sum`. Dua penyimpangan tertangkap tanpa menjalankan apa pun:
 *
 *   • masukan berubah, keluaran tidak dibangkitkan ulang (kueri baru di
 *     `jobs.sql` yang lupa `contract:gen`; migration kendali baru yang
 *     mengubah tipe kolom yang dipakai kueri);
 *   • keluaran disunting tangan (`*_gen.go` tidak cocok dengan sidiknya).
 *
 * Yang TIDAK tertangkap tanpa `sqlc`: sidik yang ditulis ulang tangan bersama
 * keluaran yang salah. Itu bukan kelalaian yang mungkin terjadi diam-diam —
 * ia pemalsuan dengan sengaja, dan peninjau melihat dua berkas bangkitan
 * berubah tanpa `contract/*.sql` berubah.
 *
 * Mode tulis (`contract:gen` tanpa `--cek`) menjalankan `sqlc` HANYA bila
 * sidiknya tidak cocok (atau `--sqlc` dipaksa), jadi orang yang menyunting
 * `kinds.yaml` tanpa toolchain Go tetap bisa membangkitkan.
 */
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { load } from "js-yaml";

const rel = (akar: string, p: string) => relative(akar, p).split(sep).join("/");
const sha = (p: string) => createHash("sha256").update(readFileSync(p)).digest("hex");

/** Modul `sqlc` yang dijalankan; versinya dari `go.mod` perkakas, bukan dari sini. */
const PAKET_SQLC = ["github.com", "sqlc-dev", "sqlc", "cmd", "sqlc"].join("/");

interface Jalur {
  konfigurasi: string;
  perkakas: string;
  keluaran: string;
  manifes: string;
}

function jalur(akar: string): Jalur {
  const keluaran = join(akar, "services", "integrator", "internal", "controlsql");
  return {
    konfigurasi: join(akar, "contract", "sqlc.yaml"),
    perkakas: join(akar, "services", "integrator", "tools", "sqlc"),
    keluaran,
    manifes: join(keluaran, "sqlc.sum"),
  };
}

/** Masukan `sqlc`, berurutan stabil: konfigurasi, kueri, skema, pin versi. */
function masukan(akar: string, j: Jalur): string[] {
  const cfg = load(readFileSync(j.konfigurasi, "utf8")) as {
    sql: { schema: string | string[]; queries: string[] }[];
  };
  const dasar = join(akar, "contract");
  const hasil = [j.konfigurasi];
  for (const blok of cfg.sql) {
    for (const q of blok.queries) hasil.push(join(dasar, q));
    for (const pola of [blok.schema].flat()) {
      /* Satu bentuk glob saja yang didukung — `<dir>/*\/migration.sql` —
         sebab hanya itu yang dipakai, dan pengurai glob umum di sini akan
         menjadi tempat dua implementasi glob (ini dan `sqlc`) tidak sepakat. */
      const m = pola.match(/^(.*)\/\*\/([^/*]+)$/);
      if (!m) {
        hasil.push(join(dasar, pola));
        continue;
      }
      const dir = join(dasar, m[1]!);
      for (const d of readdirSync(dir).sort()) {
        const f = join(dir, d, m[2]!);
        if (existsSync(f)) hasil.push(f);
      }
    }
  }
  hasil.push(join(j.perkakas, "go.mod"), join(j.perkakas, "go.sum"));
  return hasil;
}

function keluaran(j: Jalur): string[] {
  if (!existsSync(j.keluaran)) return [];
  return readdirSync(j.keluaran)
    .filter((f) => f.endsWith(".go"))
    .sort()
    .map((f) => join(j.keluaran, f));
}

const KEPALA = `# DIBANGKITKAN \`bun run contract:gen\` — JANGAN DISUNTING TANGAN.
#
# Sidik SHA-256 masukan (\`in\`) dan keluaran (\`out\`) \`sqlc\` untuk paket ini.
# \`contract:gen --cek\` membandingkannya dengan berkas di disk TANPA menjalankan
# \`sqlc\` (gerbang tanpa Go dan tanpa jaringan): masukan yang berubah tanpa
# pembangkitan ulang, atau keluaran yang disunting tangan, ditolak.
# Sumber: contract/sqlc.yaml · contract/jobs.sql · contract/trail.sql.
`;

function susunManifes(akar: string, j: Jalur): string {
  const baris = [
    ...masukan(akar, j).map((p) => `in  ${sha(p)}  ${rel(akar, p)}`),
    ...keluaran(j).map((p) => `out ${sha(p)}  ${rel(akar, p)}`),
  ];
  return `${KEPALA}${baris.join("\n")}\n`;
}

function jalankanSqlc(akar: string, j: Jalur) {
  /* Keluaran lama dibuang dulu: kueri atau berkas kueri yang dihapus tidak
     boleh meninggalkan `*_gen.go` yatim yang tetap mengompilasi. */
  for (const f of keluaran(j)) unlinkSync(f);
  try {
    execFileSync("go", ["run", PAKET_SQLC, "generate", "-f", j.konfigurasi], {
      cwd: j.perkakas,
      stdio: "inherit",
    });
  } catch (e) {
    throw new Error(
      "`sqlc` gagal dijalankan. Ia butuh toolchain Go (versi `go.mod` integrator) dan — sekali, " +
        "untuk mengisi cache modul — jaringan. Jalankan ulang `bun run contract:gen` di mesin yang " +
        `memilikinya. Sebab: ${(e as Error).message}`
    );
  }
}

/**
 * Mode tulis: bangkitkan bila perlu, lalu tulis manifes. Memulangkan kalimat
 * ringkas untuk log.
 */
export function sqlcGenerate(akar: string, paksa: boolean): string {
  const j = jalur(akar);
  /* Sidik KESELURUHAN, bukan masukan saja: keluaran yang disunting tangan
     dengan masukan tetap juga memicu `sqlc` — kalau tidak, mode tulis akan
     MEMBERKATI suntingan itu dengan mencatat sidik barunya. */
  const tercatat = existsSync(j.manifes) ? readFileSync(j.manifes, "utf8") : null;
  const perlu = paksa || tercatat !== susunManifes(akar, j) || keluaran(j).length === 0;
  if (perlu) jalankanSqlc(akar, j);
  writeFileSync(j.manifes, susunManifes(akar, j));
  return perlu
    ? `✓ ${rel(akar, j.keluaran)}/ (sqlc dijalankan, ${keluaran(j).length} berkas)`
    : `✓ ${rel(akar, j.keluaran)}/ (sidik sqlc cocok — tidak dijalankan)`;
}

/** Mode `--cek`: daftar penyimpangan; kosong = sinkron. */
export function sqlcCheck(akar: string): string[] {
  const j = jalur(akar);
  if (!existsSync(j.manifes)) return [`${rel(akar, j.manifes)} belum ada`];
  const tercatat = readFileSync(j.manifes, "utf8");
  const kini = susunManifes(akar, j);
  if (tercatat === kini) return [];
  const peta = (isi: string) =>
    new Map(
      isi
        .split("\n")
        .filter((b) => /^(in|out) /.test(b))
        .map((b) => {
          const [, h, p] = b.split(/\s+/);
          return [p!, h!] as const;
        })
    );
  const a = peta(tercatat);
  const b = peta(kini);
  const hasil: string[] = [];
  for (const [p, h] of b) {
    if (!a.has(p)) hasil.push(`${p} baru — masukan/keluaran sqlc belum tercatat (bangkitkan ulang)`);
    else if (a.get(p) !== h) hasil.push(`${p} BERUBAH sejak sqlc terakhir dijalankan`);
  }
  for (const p of a.keys()) if (!b.has(p)) hasil.push(`${p} hilang`);
  if (hasil.length === 0) hasil.push(`${rel(akar, j.manifes)} BASI (kepala/urutan)`);
  return hasil;
}
