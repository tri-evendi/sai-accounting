/**
 * PENJAGA: setiap cache tingkat modul DIKLASIFIKASI — terdaftar di bus
 * invalidasi tahap 2, atau dikecualikan dengan alasan yang ditulis.
 *
 * Bus (`@sai/platform/cache-bus`) hanya menolong cache yang mendaftar. Cache
 * baru yang lahir tanpa mendaftar tidak merah di mana pun: di satu replika ia
 * benar, di dua replika ia basi satu TTL — dan bila isinya izin, itu izin yang
 * sudah dicabut tetapi masih berlaku. Karena itu pemindai ini tidak bertanya
 * "apakah cache X terdaftar" (daftar yang membusuk), melainkan "apakah SETIAP
 * penyimpan tingkat modul sudah diputuskan" — penyimpan baru merahkan tes ini
 * sampai seseorang memutuskannya.
 *
 * Memindai `akarSumber()` (src + packages + apps), bukan `src/` saja — pemindai
 * yang hanya menyapu `src/` lulus dengan nol pelanggar begitu kodenya pindah
 * ke paket (AGENTS.md §Struktur monorepo).
 */
import { describe, expect, it } from "vitest";

import { berkasSumber, tanpaKomentar } from "./akar-sumber";

/** Penyimpan yang WAJIB mendaftar dan membaca lewat `usable()`. */
const REGISTERED: Record<string, string> = {
  "src/lib/authz-effective.ts:perCompany": "authz",
  "src/lib/company-registry.ts:cache": "company-registry",
  "src/lib/company-route.ts:cache": "tenant-route",
  "src/lib/tenant-mail-settings.ts:cache": "tenant-mail",
  "src/lib/entitlement-source.ts:cache": "entitlement",
  "packages/platform/src/mail-settings.ts:cache": "platform-mail-settings",
  "packages/platform/src/status-notices-store.ts:cache": "status-notices",
  "packages/platform/src/brand-assets.ts:metaCache": "brand-mark",
};

/** Penyimpan yang SENGAJA tidak mendaftar — alasannya bagian dari keputusan. */
const EXEMPT: Record<string, string> = {
  "src/lib/use-effective-permissions.ts:inFlight": "hook peramban; menggabungkan fetch yang sedang berjalan, bukan cache server",
  "src/components/layout/sidebar.tsx:pendengar": "pendengar event di peramban",
  "src/lib/tenant-mail-settings.ts:tenantOfCompany": "companyId → tenantId tidak pernah berubah selama perusahaan hidup",
  "src/lib/prisma.ts:modelCache": "pegangan model Prisma (proxy), bukan data",
  "src/lib/setup-gate.ts:completedCompanies": "latch satu arah false → true; replika yang belum melihatnya hanya bertanya lagi",
  "src/lib/company-clients.ts:pool": "kolam KONEKSI per replika — anggarannya di 02 §19, bukan invalidasi",
  "src/lib/company-schema-gate.ts:cache":
    "vonis skema per buku: yang membuka disimpan seumur proses (skema hanya maju selama image hidup), yang menutup 5 detik — bukan data kendali",
  "src/lib/company-schema-gate.ts:inflight": "penggabung pertanyaan yang sedang berjalan, bukan cache",
  "src/lib/company-clients.ts:readPool": "kolam KONEKSI ke replika baca (tahap 3) — sama seperti `pool`, bukan data",
  "packages/core/src/rate-limit.ts:attempts": "penyimpanan cadangan `rate-limit-shared` saat Redis tidak ada",
  "packages/platform/src/brand-assets.ts:contentCache": "dikunci sidik isi (sha256) — tidak bisa basi; dikosongkan bersama metaCache",
  "packages/platform/src/landing-images.ts:isiCache": "baris `landing_images` tidak pernah diubah sesudah dibuat — isi per id tidak bisa basi; gambar MANA yang dipakai hidup di sinyal `landing-settings`",
};

/** Deklarasi tingkat modul yang berbentuk penyimpan yang bisa berubah. */
const STORE = [
  /^(?:export\s+)?(?:const|let)\s+(\w+)(?:\s*:[^=]+)?\s*=\s*(?:[\w.]+\s*\?\?\s*)?new (?:Map|Set)(?:<[^\n]*>)?\(\s*\)/gm,
  /^(?:export\s+)?let\s+(\w*[cC]ache\w*)\b/gm,
];

function storesInSource(): string[] {
  const found: string[] = [];
  for (const f of berkasSumber([".ts", ".tsx"])) {
    if (f.rel.includes(".test.")) continue;
    const code = tanpaKomentar(f.isi);
    const rel = f.rel.startsWith("src/") || f.rel.startsWith("packages/") || f.rel.startsWith("apps/") ? f.rel : `src/${f.rel}`;
    for (const re of STORE) for (const m of code.matchAll(re)) found.push(`${rel}:${m[1]}`);
  }
  return [...new Set(found)].sort();
}

describe("setiap penyimpan tingkat modul sudah diputuskan", () => {
  const stores = storesInSource();

  it("pemindai menemukan sesuatu (penjaga ini tidak boleh lulus kosong)", () => {
    expect(stores.length).toBeGreaterThanOrEqual(Object.keys(REGISTERED).length);
  });

  it("tak ada penyimpan yang belum diklasifikasi", () => {
    const unclassified = stores.filter((s) => !(s in REGISTERED) && !(s in EXEMPT));
    expect(
      unclassified,
      "Penyimpan tingkat modul baru. Bila isinya data kendali yang bisa berubah, " +
        "daftarkan lewat `registerSharedCache` (@sai/platform/cache-bus) dan baca " +
        "lewat `usable()`; bila tidak, masukkan ke EXEMPT beserta alasannya."
    ).toEqual([]);
  });

  it("tak ada klasifikasi yatim (berkas/nama yang sudah tidak ada)", () => {
    const stale = [...Object.keys(REGISTERED), ...Object.keys(EXEMPT)].filter((k) => !stores.includes(k));
    expect(stale).toEqual([]);
  });
});

describe("cache terdaftar sungguh terhubung ke bus", () => {
  const files = new Map(berkasSumber([".ts"]).map((f) => [f.rel.startsWith("src/") || f.rel.startsWith("packages/") ? f.rel : `src/${f.rel}`, tanpaKomentar(f.isi)]));

  it.each(Object.entries(REGISTERED))("%s mendaftar sebagai '%s', membaca lewat usable(), dan mengumumkan", (key, name) => {
    const file = key.split(":")[0];
    const code = files.get(file) ?? "";
    expect(code, `${file} tidak mendaftar`).toContain(`registerSharedCache("${name}"`);
    expect(code, `${file} membaca cache tanpa memeriksa koherensi bus`).toMatch(/shared\.usable\(\)/);
    // tenant-route tidak punya invalidasi eksplisit (slug → id hanya lahir).
    if (name !== "tenant-route") expect(code, `${file} tidak pernah mengumumkan invalidasinya`).toMatch(/shared\.publish\(/);
  });

  it("nama cache unik — dua cache satu nama saling mengosongkan", () => {
    const names = Object.values(REGISTERED);
    expect(new Set(names).size).toBe(names.length);
  });
});

describe("cache data Next ikut buku tag bersama", () => {
  it("setiap `unstable_cache` memakai `tags` — tanpa tag, handler tahap 2 tidak bisa membasikannya", () => {
    const offenders: string[] = [];
    let calls = 0;
    for (const f of berkasSumber([".ts", ".tsx"])) {
      const code = tanpaKomentar(f.isi);
      for (const m of code.matchAll(/unstable_cache\(/g)) {
        calls += 1;
        if (!/tags:\s*\[/.test(code.slice(m.index ?? 0, (m.index ?? 0) + 400))) offenders.push(f.rel);
      }
    }
    expect(calls, "pemindai tidak menemukan satu pun unstable_cache").toBeGreaterThanOrEqual(3);
    expect(offenders).toEqual([]);
  });
});
