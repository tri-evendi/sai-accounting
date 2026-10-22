/**
 * PENJAGA: `app-customer` TIDAK PERNAH memegang kredensial PEMILIK PostgreSQL,
 * dan tidak punya jalan kode untuk membuat basis data.
 *
 * ══ KENAPA (Okt 2026) ══════════════════════════════════════════════════════
 * Sejak peran hak minimum (`sai_owner` / `sai_app` / `sai_backup`), risiko sisa
 * yang tercatat di PRODUCTION.md adalah satu ini: `/companies/new` membuat
 * basis data PT di dalam permintaan HTTP, jadi `app-customer` — satu-satunya
 * container yang menghadap internet — memegang `PROVISION_DATABASE_URL`
 * (`sai_owner`, CREATEDB, pemilik setiap buku). RCE di sana = DDL di setiap
 * buku PT. Penyediaan kini pekerjaan antrean `company.provision` yang
 * dikerjakan `svc-worker`; `app-customer` hanya menerbitkan & menunggu.
 *
 * Penjaga ini menolak DUA arah regresi, karena keduanya diam:
 *
 *  1. **Compose.** Kredensial pemilik kembali ke `environment:` `app-customer`
 *     di berkas compose MANA PUN (dasar, HA, on-premise, replika) — langsung
 *     sebagai `PROVISION_DATABASE_URL`/`PG_OWNER_*`, atau dirakit dari
 *     `${PG_OWNER_…}` di nilai variabel lain.
 *  2. **Kode.** Graf impor `app-customer` kembali menjangkau modul penyedia
 *     (`src/lib/company-provisioning.ts`) atau handler pekerjanya. Tanpa
 *     kredensial, jalan kode itu gagal 42501 di produksi — kegagalan yang
 *     baru terlihat ketika customer menekan "Buat Perusahaan", dan godaan
 *     perbaikan tercepatnya adalah mengembalikan kredensial itu.
 */
import { relative } from "node:path";
import { describe, expect, it } from "vitest";

import { importClosure, REPO, serviceSurfaces } from "../scripts/lib/env-inventory";
import { COMPOSE_FILES, envMap, loadCompose } from "./compose-yaml";

const LAYANAN_INTERNET = ["app-customer"];

describe("compose: `app-customer` tanpa kredensial pemilik", () => {
  it("penjaganya memang melihat `app-customer` di compose dasar", () => {
    /* Pemindai yang tidak menemukan layanannya lulus dengan nol pelanggar. */
    expect(loadCompose("docker-compose.yml").services?.["app-customer"]).toBeTruthy();
  });

  it("tidak satu berkas compose pun memberi `app-customer` PROVISION_DATABASE_URL / PG_OWNER_*", () => {
    const pelanggar: string[] = [];
    for (const f of COMPOSE_FILES) {
      for (const [svc, s] of Object.entries(loadCompose(f).services ?? {})) {
        if (!LAYANAN_INTERNET.includes(svc)) continue;
        for (const [nama, nilai] of Object.entries(envMap(s))) {
          if (nama === "PROVISION_DATABASE_URL" || nama.startsWith("PG_OWNER_")) {
            pelanggar.push(`${f} → ${svc}.${nama}`);
          }
          if (typeof nilai === "string" && nilai.includes("PG_OWNER_")) {
            pelanggar.push(`${f} → ${svc}.${nama} (dirakit dari PG_OWNER_*)`);
          }
        }
      }
    }
    expect(
      pelanggar,
      "kredensial PEMILIK di container yang menghadap internet — penyediaan PT milik `svc-worker` (`company.provision`)"
    ).toEqual([]);
  });

  it("penyedia yang sah (`svc-worker`) memang menerimanya — kalau tidak, PT baru gagal 42501", () => {
    const env = envMap(loadCompose("docker-compose.yml").services?.["svc-worker"]);
    expect(Object.keys(env)).toContain("PROVISION_DATABASE_URL");
    expect(Object.keys(env)).toContain("PG_APP_USER");
  });
});

describe("kode: `app-customer` tidak menjangkau penyedia basis data", () => {
  const permukaan = serviceSurfaces([]).find((s) => s.service === "app-customer")!;
  const jangkauan = new Set([...importClosure(permukaan.js)].map((f) => relative(REPO, f)));

  it("graf impornya terbaca (bukan himpunan kosong)", () => {
    expect(jangkauan.size).toBeGreaterThan(200);
    expect(jangkauan.has("src/lib/company-provisioning-queue.ts")).toBe(true);
  });

  it("modul penyedia & handler pekerjanya tidak terimpor dari aplikasi customer", () => {
    for (const f of ["src/lib/company-provisioning.ts", "workers/company-provision.ts"]) {
      expect(jangkauan.has(f), `${f} terjangkau dari app-customer`).toBe(false);
    }
  });
});
