/**
 * ARAH DEPENDENSI KONSOL OPERATOR ↔ PERMUKAAN PELANGGAN
 * (Fase 0 — docs/arsitektur/14-RENCANA-MONOREPO.md §4)
 *
 * == KENAPA ADA ==========================================================
 * Konsol operator masih SATU kode dengan permukaan pelanggan, dengan sengaja
 * (dok 14 §0). Yang membuat pilihan itu bisa dibatalkan kelak adalah arah
 * dependensinya: pada hari `apps/operator` dipisah, setiap impor yang
 * menyeberang harus dibongkar dulu. Tanpa penjaga ini, Fase 1 dimulai dengan
 * arkeologi.
 *
 * Penyeberangan yang SUDAH terjadi sebelum tes ini ada, dan karena itu bukan
 * kekhawatiran teoretis:
 *   - dua rute pelanggan mengimpor `changeTenantPlan`/`planChangeApplier` dari
 *     `lib/operator/writes`. Logika penagihan yang kebetulan pertama kali
 *     ditulis untuk konsol. Kini di `lib/billing/change-tenant-plan.ts`;
 *   - konsol operator mengimpor `components/dashboard/stat-card`, komponen
 *     generik yang tinggal di folder milik buku besar. Kini di
 *     `components/ui/stat-card.tsx`.
 *
 * == ATURANNYA ===========================================================
 *   1. Di luar permukaan operator, `src/` TIDAK mengimpor `lib/operator/*`,
 *      `components/operator/*`, atau `app/(app)/(operator)/*` — kecuali daftar
 *      putih di bawah, yang EKSPLISIT dan PENDEK.
 *   2. Permukaan operator TIDAK mengimpor rute di luar `(operator)`.
 *   3. Permukaan operator hanya mengimpor komponen dari `components/ui/*` dan
 *      `components/operator/*`. Komponen yang dipakai dua sisi tinggal di `ui`.
 *   `lib/*` lainnya bebas dipakai kedua sisi: itu fondasi bersama (i18n, tema,
 *   format uang, basis data kendali), yang pada hari pemisahan menjadi
 *   `packages/core`.
 *
 * `scripts/` sengaja di luar cakupan: skrip CLI adalah jalur pemulihan
 * operator (`execute-tenant-deletion`, `pause-platform-billing`) dan memang
 * memakai inti operator.
 *
 * Impor diselesaikan sebagai PATH (alias `@/` dan relatif), bukan dicocokkan
 * sebagai teks: `../operator/guard` dari `lib/` adalah penyeberangan yang sama
 * dengan `@/lib/operator/guard`. Komentar dibuang lebih dulu — tes yang
 * menghukum dokumentasi yang baik membuat orang menghapus dokumentasinya
 * (pola `tests/adapter-dari-url.test.ts`).
 */
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, normalize } from "node:path";

const AKAR = process.cwd();

/** Permukaan operator: rute konsol, inti operator, komponen konsol. */
const OPERATOR = [
  "src/app/(app)/(operator)",
  "src/lib/operator",
  "src/components/operator",
];

/**
 * Satu-satunya penyeberangan yang dibolehkan, dan alasannya.
 * Entri yang tidak lagi dipakai MEMBUAT TES MERAH: daftar putih yang hanya
 * tumbuh adalah daftar putih yang berhenti berarti.
 */
const DAFTAR_PUTIH: Record<string, { target: string; alasan: string }[]> = {
  "src/proxy.ts": [
    {
      target: "src/lib/operator/plane",
      alasan:
        "proxy memutuskan BIDANG (host operator vs pelanggan) sebelum rute mana pun berjalan",
    },
  ],
};

/** Komponen yang boleh dipakai permukaan operator. */
const KOMPONEN_BOLEH = ["src/components/ui", "src/components/operator"];

function berkasTs(dir: string): string[] {
  const keluar: string[] = [];
  const telusuri = (p: string) => {
    for (const e of readdirSync(join(AKAR, p), { withFileTypes: true })) {
      const anak = `${p}/${e.name}`;
      if (e.isDirectory()) {
        if (e.name === "generated" || e.name === "node_modules") continue;
        telusuri(anak);
      } else if (e.name.endsWith(".ts") || e.name.endsWith(".tsx")) {
        keluar.push(anak);
      }
    }
  };
  telusuri(dir);
  return keluar;
}

function tanpaKomentar(teks: string): string {
  return teks.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

/** `from "x"`, `import "x"`, `import("x")`, `export … from "x"`. */
const IMPOR = /(?:\bfrom\s+|\bimport\s*\(\s*|\bimport\s+)["']([^"']+)["']/g;

/** Spesifier impor → path berkas relatif akar (tanpa ekstensi), atau null untuk paket. */
function selesaikan(dariBerkas: string, spesifier: string): string | null {
  if (spesifier.startsWith("@/")) return `src/${spesifier.slice(2)}`;
  if (spesifier.startsWith(".")) return normalize(join(dirname(dariBerkas), spesifier));
  return null;
}

function imporDari(teks: string, berkas: string): string[] {
  const hasil: string[] = [];
  for (const m of tanpaKomentar(teks).matchAll(IMPOR)) {
    const t = selesaikan(berkas, m[1]);
    if (t) hasil.push(t.replace(/\.(tsx?|jsx?)$/, ""));
  }
  return hasil;
}

const di = (path: string, akar: string) => path === akar || path.startsWith(`${akar}/`);
const diOperator = (path: string) => OPERATOR.some((a) => di(path, a));

/* `packages/*` ikut: penulis penagihan bersama kini di `@sai/platform/billing`. */
const semua = [...berkasTs("src"), ...berkasTs("packages")];
const imporPerBerkas = new Map(
  semua.map((f) => [f, imporDari(readFileSync(join(AKAR, f), "utf8"), f)])
);

describe("arah dependensi konsol operator", () => {
  it("ada berkas di kedua sisi — penjaga atas tes ini sendiri", () => {
    expect(semua.filter(diOperator).length).toBeGreaterThan(20);
    expect(semua.filter((f) => !diOperator(f)).length).toBeGreaterThan(500);
    expect(semua).toContain("src/proxy.ts");
  });

  it("pengurai impor mengenali setiap bentuk, dan mengabaikan komentar", () => {
    const contoh = [
      'import { a } from "@/lib/operator/guard";',
      'import type { B } from "../operator/session";',
      'export { c } from "@/lib/operator/store";',
      'const d = await import("@/lib/operator/totp");',
      'import "@/lib/operator/audit";',
      '// import { x } from "@/lib/operator/nav";',
      '/* import { y } from "@/lib/operator/attention"; */',
    ].join("\n");
    expect(imporDari(contoh, "src/lib/billing/contoh.ts")).toEqual([
      "src/lib/operator/guard",
      "src/lib/operator/session",
      "src/lib/operator/store",
      "src/lib/operator/totp",
      "src/lib/operator/audit",
    ]);
  });

  it("1. di luar permukaan operator, tidak ada yang mengimpor ke dalamnya (selain daftar putih)", () => {
    const pelanggar: string[] = [];
    for (const [f, impor] of imporPerBerkas) {
      if (diOperator(f)) continue;
      const boleh = (DAFTAR_PUTIH[f] ?? []).map((e) => e.target);
      for (const t of impor) {
        if (diOperator(t) && !boleh.includes(t)) pelanggar.push(`${f} → ${t}`);
      }
    }
    expect(
      pelanggar,
      "Logika yang dipakai pelanggan JUGA bukan logika operator: pindahkan ke lib/* " +
        "(contoh: lib/billing/change-tenant-plan.ts), jangan menambah daftar putih."
    ).toEqual([]);
  });

  it("daftar putih tidak memuat entri yang sudah tak terpakai", () => {
    const basi: string[] = [];
    for (const [f, entri] of Object.entries(DAFTAR_PUTIH)) {
      const impor = imporPerBerkas.get(f) ?? [];
      for (const e of entri) if (!impor.includes(e.target)) basi.push(`${f} → ${e.target}`);
    }
    expect(basi).toEqual([]);
  });

  it("2. permukaan operator tidak mengimpor rute di luar (operator)", () => {
    const pelanggar: string[] = [];
    for (const [f, impor] of imporPerBerkas) {
      if (!diOperator(f)) continue;
      for (const t of impor) {
        if (di(t, "src/app") && !di(t, "src/app/(app)/(operator)")) pelanggar.push(`${f} → ${t}`);
      }
    }
    expect(pelanggar).toEqual([]);
  });

  it("3. permukaan operator hanya memakai komponen dari components/ui dan components/operator", () => {
    const pelanggar: string[] = [];
    for (const [f, impor] of imporPerBerkas) {
      if (!diOperator(f)) continue;
      for (const t of impor) {
        if (di(t, "src/components") && !KOMPONEN_BOLEH.some((a) => di(t, a))) {
          pelanggar.push(`${f} → ${t}`);
        }
      }
    }
    expect(
      pelanggar,
      "Komponen yang dipakai dua sisi tinggal di components/ui (contoh: ui/stat-card.tsx)."
    ).toEqual([]);
  });

  it("logika penagihan bersama tidak bergantung balik pada operator", () => {
    const billing = semua.filter((f) => di(f, "packages/platform/src/billing"));
    expect(billing).toContain("packages/platform/src/billing/change-tenant-plan.ts");
    for (const f of billing) {
      expect((imporPerBerkas.get(f) ?? []).filter(diOperator), f).toEqual([]);
    }
  });
});
