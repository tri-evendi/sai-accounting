/**
 * AKAR SUMBER UNTUK PENJAGA YANG MEMINDAI KODE (monorepo Fase 2).
 *
 * Sebelum Fase 2 seluruh kode tulisan tangan ada di `src/`, jadi puluhan
 * penjaga memindai `src/` saja. Sejak `packages/core` dan `packages/ui`, kode
 * yang PINDAH keluar dari pemindaian itu — dan pemindai yang tidak menemukan
 * apa-apa LULUS dengan nol pelanggar. Itulah kegagalan diam yang diperingatkan
 * dok 14 §Fase 2. Penjaga memakai helper ini supaya akar barunya satu daftar.
 *
 * Jalur relatif yang dilaporkan:
 *   - berkas di `src/`        → relatif ke `src/` (`components/x.tsx`), seperti dulu;
 *   - berkas di `packages/…` / `apps/…` → relatif ke AKAR repo
 *     (`packages/ui/src/components/button.tsx`, `apps/operator/src/lib/operator/guard.ts`).
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

export const AKAR_REPO = join(__dirname, "..");
export const SRC = join(AKAR_REPO, "src");

/**
 * `src/` + `src/` setiap paket workspace (`packages/*`) dan setiap aplikasi
 * tambahan (`apps/*`, sejak monorepo Fase 3d: konsol operator).
 */
export function akarSumber(): string[] {
  const di = (induk: string) => {
    const akar = join(AKAR_REPO, induk);
    if (!existsSync(akar)) return [];
    return readdirSync(akar, { withFileTypes: true })
      .filter((d) => d.isDirectory() && existsSync(join(akar, d.name, "src")))
      .map((d) => join(akar, d.name, "src"));
  };
  return [SRC, ...di("packages"), ...di("apps")];
}

/**
 * Akar pohon GO (`services/*`), untuk penjaga yang memindai kode Go.
 *
 * Terpisah dari `akarSumber()` dengan sengaja: `services/` bukan bagian
 * workspace bun (glob-nya `packages/*` + `apps/*`), jadi penjaga yang
 * menggabungkan keduanya akan memberi kode Go daftar aturan TypeScript yang
 * tidak berlaku untuknya. Yang dibagi di sini hanya SATU hal — tempatnya —
 * supaya penjaga Go kedua tidak mengetik `services/integrator` lagi dan
 * tertinggal pada hari layanan Go kedua lahir.
 *
 * ⚠ 25 dari 306+ berkas tes memindai kode untuk menegakkan aturan struktural,
 * dan semuanya berhenti di batas `services/`. Permukaan Go wajib punya
 * penjaganya sendiri, dan penjaga itu memakai daftar ini.
 */
export function akarGo(): string[] {
  const akar = join(AKAR_REPO, "services");
  if (!existsSync(akar)) return [];
  return readdirSync(akar, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => join(akar, d.name));
}

/** Setiap berkas `.go` di bawah `akarGo()`, beserta jalur relatif ke akar repo. */
export function berkasGo(): { jalur: string; rel: string; isi: string }[] {
  const hasil: { jalur: string; rel: string; isi: string }[] = [];
  const telusuri = (dir: string) => {
    for (const d of readdirSync(dir, { withFileTypes: true })) {
      const penuh = join(dir, d.name);
      if (d.isDirectory()) {
        telusuri(penuh);
      } else if (d.isFile() && d.name.endsWith(".go")) {
        hasil.push({
          jalur: penuh,
          rel: relative(AKAR_REPO, penuh).split(sep).join("/"),
          isi: readFileSync(penuh, "utf8"),
        });
      }
    }
  };
  for (const akar of akarGo()) telusuri(akar);
  return hasil;
}

/**
 * Teks sumber TANPA komentarnya.
 *
 * ══ KENAPA INI ADA DI SINI, DAN BUKAN DI SATU BERKAS TES ═══════════════════
 * Satu bentuk penjaga yang keliru sudah muncul EMPAT kali: pemeriksaan
 * "X TIDAK ADA" — atau "X muncul tepat sekali" — yang membaca seluruh teks
 * lalu menuding KOMENTAR yang menjelaskan X. Repo ini menulis komentar yang
 * panjang dengan sengaja, jadi komentar adalah tempat X paling sering disebut:
 * `postgresql-client` tanpa versi, `sh scripts/backup.sh` yang tidak lagi
 * dijadwalkan, `PLATFORM_DATABASE_URL` yang justru tidak dibaca, `doc.save()`
 * yang sudah diganti. Penjaga yang menolaknya memaksa alasannya dihapus dari
 * tempat ia paling berguna.
 *
 * Aturannya satu kalimat:
 *
 * > Penjaga **"X ADA"** boleh membaca teks penuh — komentar memang bagian dari
 * > apa yang dijaga repo ini. Penjaga **"X TIDAK ADA"** dan setiap penjaga
 * > yang MENGHITUNG wajib membaca `tanpaKomentar(...)`.
 *
 * Ia pengupas kasar, bukan pengurai: `//` di dalam string literal (`"http://"`)
 * ikut terpotong. Itu dapat diterima untuk tujuannya — yang dicari keberadaan
 * dan jumlah sebuah pola, bukan AST — dan jauh lebih mudah dipercaya daripada
 * pengurai yang benar 99% dengan satu kasus yang tidak ada yang tahu.
 */
export function tanpaKomentar(teks: string): string {
  return teks
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .map((baris) => {
      const t = baris.trimStart();
      if (t.startsWith("//") || t.startsWith("*") || t.startsWith("#")) return "";
      const i = baris.indexOf("//");
      return i >= 0 ? baris.slice(0, i) : baris;
    })
    .join("\n");
}

export function relSumber(jalur: string): string {
  const keSrc = relative(SRC, jalur);
  const rel = keSrc.startsWith("..") ? relative(AKAR_REPO, jalur) : keSrc;
  return rel.split(sep).join("/");
}

/**
 * `@sai/<paket>/<subpath>` → berkas absolutnya, menurut `exports` di manifes
 * paket. Penjaga yang membangun GRAF impor wajib memakainya: tanpa ini setiap
 * sisi graf yang melewati paket hilang tanpa bunyi (impor yang tak terurai
 * diperlakukan sebagai pihak ketiga).
 */
let PETA_EKSPOR: Map<string, string> | null = null;
export function uraiPaket(spec: string): string | null {
  /* `@op/*` — alias internal konsol operator (apps/operator/tsconfig.json). */
  if (spec.startsWith("@op/")) {
    const dasar = join(AKAR_REPO, "apps", "operator", "src", spec.slice(4));
    for (const k of [dasar, `${dasar}.ts`, `${dasar}.tsx`, join(dasar, "index.ts"), join(dasar, "index.tsx")]) {
      if (existsSync(k) && statSync(k).isFile()) return k;
    }
    return null;
  }
  if (!spec.startsWith("@sai/")) return null;
  if (!PETA_EKSPOR) {
    PETA_EKSPOR = new Map();
    const paket = join(AKAR_REPO, "packages");
    for (const d of readdirSync(paket)) {
      const manifes = join(paket, d, "package.json");
      if (!existsSync(manifes)) continue;
      const { name, exports } = JSON.parse(readFileSync(manifes, "utf8")) as {
        name: string;
        exports?: Record<string, string>;
      };
      for (const [sub, tujuan] of Object.entries(exports ?? {})) {
        PETA_EKSPOR.set(`${name}/${sub.replace(/^\.\//, "")}`, join(paket, d, tujuan));
      }
    }
  }
  const langsung = PETA_EKSPOR.get(spec);
  if (langsung) return langsung;
  for (const [pola, tujuan] of PETA_EKSPOR) {
    if (pola.endsWith("/*") && spec.startsWith(pola.slice(0, -1))) {
      return tujuan.slice(0, -1) + spec.slice(pola.length - 1);
    }
  }
  return null;
}
