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
