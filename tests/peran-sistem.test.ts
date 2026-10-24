/**
 * Peran SISTEM wajib disemai migration buku PostgreSQL (0006_system_roles).
 *
 * Baseline PostgreSQL membuat tabel `roles` tanpa isi, sehingga buku yang
 * dibuat sesudah pindah dari MariaDB tidak punya satu pun peran sistem dan
 * undangan pengguna ditolak. Penjaga ini memastikan setiap kunci di `ROLES`
 * disemai, dengan cara yang tidak menimpa peran yang sudah ada.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ROLES } from "@sai/core/constants";
import { AKAR_REPO } from "./akar-sumber";

const sql = readFileSync(join(AKAR_REPO, "prisma/postgresql/company/0006_system_roles/migration.sql"), "utf8");

describe("peran sistem di buku PostgreSQL", () => {
  it("setiap kunci di ROLES disemai", () => {
    for (const key of Object.values(ROLES)) expect(sql).toContain(`'${key}'`);
  });
  it("idempoten dan tidak menimpa peran yang sudah ada", () => {
    expect(sql).toMatch(/ON CONFLICT \("key"\) DO NOTHING/);
    expect(sql).not.toMatch(/\bUPDATE\b|\bDELETE\b/);
  });
});
