/**
 * Migration 0032 — nama jabatan baku + peran `administrator`.
 *
 * Kunci peran tidak hanya hidup di `roles.key`: ia disalin ke LIMA kolom di
 * empat tabel. Melewatkan satu kolom saat mengganti nama peran adalah kegagalan
 * yang paling mungkin terjadi DAN paling sulit terlihat — tidak ada FOREIGN KEY
 * yang menjerit, tidak ada tes lain yang merah; yang terjadi hanyalah pengguna
 * kehilangan seluruh izinnya, atau sebuah pengajuan tak pernah cocok dengan
 * penyetuju mana pun, di produksi, setelah deploy.
 *
 * Maka tes ini membaca SQL-nya dan menuntut setiap kolom pembawa kunci peran
 * benar-benar punya UPDATE untuk ketiga nama lama. Ia juga menjaga sifat yang
 * membuat migration ini aman dijalankan: satu transaksi, penyemaian yang aman
 * diulang, dan DEFAULT kolom `users.role` ikut berpindah.
 *
 * Tes ini sengaja membaca BERKAS, bukan database — tak ada koneksi DB di sini
 * (sama seperti seluruh suite), dan berkas migration memang bukti yang akan
 * dijalankan migrator saat deploy.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ROLES, ROLE_LABELS, ROLE_VALUES } from "@/lib/constants";

const MIGRATION_PATH = path.join(
  process.cwd(),
  "prisma/migrations/0032_standard_role_positions/migration.sql"
);
const sql = readFileSync(MIGRATION_PATH, "utf8");
/** Perbandingan tanpa peduli spasi berlebih / huruf besar-kecil kata kunci. */
const normalized = sql.replace(/\s+/g, " ");

/** Nama lama → nama baru. Sumber kebenaran pemetaannya, dipakai ulang di bawah. */
const RENAMES = [
  { from: "bos", to: ROLES.MANAGING_DIRECTOR },
  { from: "core", to: ROLES.FINANCE_MANAGER },
  { from: "ptg", to: ROLES.WAREHOUSE_HEAD },
] as const;

/**
 * SETIAP kolom yang menyimpan kunci peran. Menambah kolom pembawa peran di
 * kemudian hari? Tambahkan di sini juga — inilah daftarnya.
 */
const ROLE_BEARING_COLUMNS = [
  { table: "users", column: "role" },
  { table: "roles", column: "key" },
  { table: "role_permission_overrides", column: "role" },
  { table: "approval_rules", column: "approver_role" },
  { table: "approval_requests", column: "approver_role" },
] as const;

describe("migration 0032 — kelima kolom pembawa kunci peran ikut berpindah", () => {
  it("daftar kolomnya berjumlah lima dan tak ada yang kembar", () => {
    expect(ROLE_BEARING_COLUMNS).toHaveLength(5);
    const keys = ROLE_BEARING_COLUMNS.map((c) => `${c.table}.${c.column}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  for (const { table, column } of ROLE_BEARING_COLUMNS) {
    for (const { from, to } of RENAMES) {
      it(`\`${table}.${column}\` mengganti '${from}' → '${to}'`, () => {
        // UPDATE `<tabel>` SET … `<kolom>` = '<baru>' … WHERE `<kolom>` = '<lama>'
        const pattern = new RegExp(
          `UPDATE \`${table}\` SET [^;]*\`${column}\` = '${to}'[^;]*WHERE \`${column}\` = '${from}'`,
          "i"
        );
        expect(
          pattern.test(normalized),
          `migration 0032 tidak mengganti nama '${from}' → '${to}' pada ${table}.${column}. ` +
            "Kolom pembawa kunci peran yang terlewat = data rusak diam-diam."
        ).toBe(true);
      });
    }
  }

  it("`user_permission_overrides` memang TIDAK punya kolom peran — jadi tidak disentuh", () => {
    // Tabelnya berpasangan (pengguna × izin). Kalau suatu saat ia mendapat kolom
    // peran, baris ini harus gagal dan daftarnya di atas ditambah.
    expect(normalized).not.toMatch(/UPDATE `user_permission_overrides`/i);
  });
});

describe("migration 0032 — peran `administrator` disemai sebagai peran SISTEM", () => {
  it("menyisipkan barisnya ke `roles` dengan is_system & is_active", () => {
    const insert = normalized.match(/INSERT INTO `roles`[^;]+;/i)?.[0] ?? "";
    expect(insert, "tidak ada INSERT ke `roles`").not.toBe("");
    expect(insert).toContain(`'${ROLES.ADMINISTRATOR}'`);
    expect(insert).toContain(`'${ROLE_LABELS[ROLES.ADMINISTRATOR]}'`);
    // Peran sistem: tak bisa dinonaktifkan/dihapus dari UI — sama seperti 0031.
    expect(insert.toLowerCase()).toContain("`is_system`");
    expect(insert.toLowerCase()).toContain("`is_active`");
    expect(insert.toLowerCase()).toMatch(/true, true/);
  });

  it("penyemaiannya aman diulang (tidak menggandakan baris)", () => {
    expect(normalized).toMatch(
      /WHERE NOT EXISTS \( ?SELECT 1 FROM `roles` WHERE `key` = 'administrator' ?\)/i
    );
  });
});

describe("migration 0032 — aman dijalankan", () => {
  it("seluruh DML terbungkus SATU transaksi", () => {
    expect(normalized).toMatch(/START TRANSACTION;/i);
    expect(normalized).toMatch(/COMMIT;/i);
    expect((sql.match(/START TRANSACTION;/gi) ?? []).length).toBe(1);
    expect((sql.match(/COMMIT;/gi) ?? []).length).toBe(1);

    // Setiap UPDATE + INSERT berada DI ANTARA keduanya; hanya DDL (yang tak bisa
    // ikut transaksi di MySQL) yang boleh berada di luar.
    const begin = sql.search(/START TRANSACTION;/i);
    const end = sql.search(/COMMIT;/i);
    expect(begin).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(begin);
    const outside = sql.slice(0, begin) + sql.slice(end);
    const statementsOutside = outside
      .split("\n")
      .filter((line) => /^\s*(UPDATE|INSERT)\b/i.test(line));
    expect(statementsOutside, "ada DML di luar transaksi").toEqual([]);
  });

  it("DEFAULT kolom `users.role` ikut berpindah ke peran yang masih ada", () => {
    expect(normalized).toMatch(
      new RegExp(
        `ALTER TABLE \`users\` ALTER COLUMN \`role\` SET DEFAULT '${ROLES.FINANCE_MANAGER}'`,
        "i"
      )
    );
    // DDL meng-commit implisit, jadi ia harus berada SESUDAH COMMIT — kalau
    // tidak, transaksinya terbelah dan migration bisa separuh jalan.
    expect(sql.search(/ALTER TABLE `users`/i)).toBeGreaterThan(sql.search(/COMMIT;/i));
  });

  it("tak ada satu pun nama peran LAMA yang tertinggal sebagai nilai BARU", () => {
    for (const { from } of RENAMES) {
      expect(normalized, `'${from}' masih dipakai sebagai nilai tujuan`).not.toMatch(
        new RegExp(`= '${from}'(?! *(--)?)[^;]*WHERE`, "i")
      );
    }
  });

  it("nama baru di SQL sama persis dengan `ROLE_VALUES` di kode", () => {
    for (const role of ROLE_VALUES) {
      expect(normalized, `peran ${role} tidak disebut migration`).toContain(`'${role}'`);
    }
    // Empat peran sistem, tidak lebih: SQL tak boleh menyemai peran yang tak
    // dikenal kode (baris seperti itu diabaikan matriks efektif → peran mati).
    const seeded = new Set(
      [...normalized.matchAll(/'([a-z][a-z_]*)'/g)]
        .map((m) => m[1])
        .filter((v) => (ROLE_VALUES as readonly string[]).includes(v))
    );
    expect([...seeded].sort()).toEqual([...ROLE_VALUES].sort());
  });
});
