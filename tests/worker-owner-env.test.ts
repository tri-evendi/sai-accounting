/**
 * PENJAGA: kredensial PEMILIK PostgreSQL hanya sampai ke peran `svc-worker`
 * yang MENYEDIAKAN PT.
 *
 * `PROVISION_DATABASE_URL` (`sai_owner`) dan `PG_APP_USER` ada di environment
 * container `svc-worker` karena satu `kind` — `company.provision`, diklaim peran
 * `interactive`. Compose menyatakan env per container, jadi tanpa penyaring
 * keempat peran mewarisinya (09 §3.2, risiko 5). Penyaringnya `roleEnv()` di
 * penyelia; berkas ini menjaga tiga hal yang hilangnya TIDAK berbunyi:
 *
 *   1. penyaringnya benar sebagai fungsi;
 *   2. penyelia sungguh MEMAKAINYA saat melahirkan peran (bukan `process.env`);
 *   3. daftar-izinnya menunjuk peran yang ADA di compose dan yang memang
 *      menjalankan pelari jalur `interactive` — peran yang berganti nama akan
 *      membuat daftar-izin menunjuk kekosongan, dan penyediaan PT jatuh ke
 *      `CONTROL_DATABASE_URL` (ditolak 42501 sesudah peralihan hak minimum).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { OWNER_ONLY_ENV, roleEnv } from "../scripts/run-workers";
import { AKAR_REPO } from "./akar-sumber";
import { workerRoles } from "./compose-worker";

const ENV = {
  PATH: "/usr/bin",
  CONTROL_DATABASE_URL: "postgres://sai_app:x@pgbouncer:6432/sai_control",
  PROVISION_DATABASE_URL: "postgres://sai_owner:rahasia@pg:5432/sai_control",
  PG_APP_USER: "sai_app",
};

describe("roleEnv — env pemilik hanya untuk peran yang berhak", () => {
  it("peran `interactive` menerima keduanya", () => {
    const env = roleEnv("interactive", ENV);
    expect(env.PROVISION_DATABASE_URL).toBe(ENV.PROVISION_DATABASE_URL);
    expect(env.PG_APP_USER).toBe("sai_app");
  });

  it.each(["ledger", "scheduler", "conformance", "peran-baru"])(
    "peran `%s` TIDAK menerimanya — sisanya utuh",
    (peran) => {
      const env = roleEnv(peran, ENV);
      expect(env.PROVISION_DATABASE_URL).toBeUndefined();
      expect(env.PG_APP_USER).toBeUndefined();
      expect("PROVISION_DATABASE_URL" in env).toBe(false);
      expect(env.CONTROL_DATABASE_URL).toBe(ENV.CONTROL_DATABASE_URL);
      expect(env.PATH).toBe("/usr/bin");
    }
  );

  it("menyalin, tidak mengubah environment penyelia", () => {
    const asli = { ...ENV };
    roleEnv("ledger", asli);
    expect(asli).toEqual(ENV);
  });
});

describe("penyelia memakai penyaringnya", () => {
  const kode = readFileSync(join(AKAR_REPO, "scripts", "run-workers.ts"), "utf8");

  it("peran dilahirkan dengan `roleEnv(...)`, bukan `process.env` mentah", () => {
    expect(kode).toMatch(/env:\s*roleEnv\(role\.name,\s*process\.env\)/);
    expect(kode).not.toMatch(/env:\s*process\.env\b/);
  });
});

describe("daftar-izin sepadan dengan compose", () => {
  const peran = workerRoles();

  it("setiap peran yang disebut OWNER_ONLY_ENV ada di `svc-worker`", () => {
    for (const [nama, berhak] of Object.entries(OWNER_ONLY_ENV)) {
      for (const p of berhak) {
        expect(peran.has(p), `${nama} → peran \`${p}\` tidak ada di svc-worker`).toBe(true);
      }
    }
  });

  it("peran yang berhak adalah pelari jalur `interactive` — pengklaim `company.provision`", () => {
    expect(OWNER_ONLY_ENV.PROVISION_DATABASE_URL).toEqual(["interactive"]);
    expect(peran.get("interactive")).toMatch(/jobs:run:interactive/);
    const pelari = readFileSync(join(AKAR_REPO, "workers", "interactive.ts"), "utf8");
    expect(pelari).toMatch(/provisionCompanyJob/);
  });

  it("tidak ada peran lain yang menjalankan penyedia PT", () => {
    for (const [nama, skrip] of peran) {
      if (nama === "interactive") continue;
      expect(skrip, `peran \`${nama}\``).not.toMatch(/jobs:run:interactive|create-company/);
    }
  });
});
