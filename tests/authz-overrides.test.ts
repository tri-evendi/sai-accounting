/**
 * RBAC dapat dikonfigurasi (issue #73) — keputusan murninya.
 *
 * Yang dijaga: matriks EFEKTIF = bawaan + override per sel, dengan tabel
 * kosong berarti persis bawaan; deny-by-default tak bisa dibobol lewat baris
 * yatim; validasi menolak pencabutan anti-lockout dan pelanggaran invarian
 * delete ⊆ write ⊆ read; cache loader menghormati TTL dan invalidasi
 * eksplisit saat tulis. Tanpa DB — sumber override di-inject.
 */
import { describe, expect, it } from "vitest";
import {
  EFFECTIVE_MATRIX_TTL_MS,
  PROTECTED_CELLS,
  applyOverrides,
  canWithMatrix,
  createEffectiveMatrixLoader,
  isProtectedCell,
  normalizeOverrides,
  validateOverrides,
} from "@/lib/authz-overrides";
import { PERMISSIONS, PERMISSION_ROLES, can, type Permission } from "@/lib/authz";
import { ROLE_VALUES } from "@/lib/constants";

describe("applyOverrides — merakit matriks efektif", () => {
  it("tanpa override = persis matriks bawaan (perilaku hari ini)", () => {
    const matrix = applyOverrides([]);
    for (const permission of PERMISSIONS) {
      expect([...matrix[permission]].sort(), permission).toEqual(
        [...PERMISSION_ROLES[permission]].sort()
      );
    }
  });

  it("override MENGHADIAHKAN izin yang bawaannya tidak ada", () => {
    const matrix = applyOverrides([{ role: "finance_manager", permission: "report.read", allowed: true }]);
    expect(matrix["report.read"]).toContain("finance_manager");
    expect(canWithMatrix(matrix, { role: "finance_manager" }, "report.read")).toBe(true);
    // Sel lain tidak tersentuh.
    expect(canWithMatrix(matrix, { role: "warehouse_head" }, "report.read")).toBe(false);
    expect(can({ role: "finance_manager" }, "report.read"), "bawaan di kode tidak berubah").toBe(false);
  });

  it("override MENCABUT izin yang bawaannya ada", () => {
    const matrix = applyOverrides([{ role: "finance_manager", permission: "contract.write", allowed: false }]);
    expect(matrix["contract.write"]).not.toContain("finance_manager");
    expect(canWithMatrix(matrix, { role: "finance_manager" }, "contract.write")).toBe(false);
    expect(canWithMatrix(matrix, { role: "managing_director" }, "contract.write")).toBe(true);
  });

  it("baris yatim diabaikan — izin/peran yang tak dikenal kode tak pernah hidup", () => {
    const matrix = applyOverrides([
      // Izin yang sudah dihapus dari kode (sisa data lama).
      { role: "finance_manager", permission: "ghost.read", allowed: true },
      // Peran yang tidak ada.
      { role: "admin", permission: "report.read", allowed: true },
    ]);
    for (const permission of PERMISSIONS) {
      expect([...matrix[permission]].sort(), permission).toEqual(
        [...PERMISSION_ROLES[permission]].sort()
      );
    }
    // Deny-by-default `canWithMatrix` — sama seperti `can()`.
    expect(canWithMatrix(matrix, { role: "admin" }, "report.read")).toBe(false);
    expect(canWithMatrix(matrix, null, "report.read")).toBe(false);
    expect(canWithMatrix(matrix, { role: "" }, "report.read")).toBe(false);
  });
});

describe("validateOverrides — anti-lockout & invarian", () => {
  it("set kosong dan override wajar diterima", () => {
    expect(validateOverrides([])).toEqual([]);
    expect(
      validateOverrides([
        { role: "finance_manager", permission: "report.read", allowed: true },
        { role: "warehouse_head", permission: "inventory.write", allowed: false },
      ])
    ).toEqual([]);
  });

  it("menolak pencabutan sel anti-lockout: Direktur Utama & Administrator × authz.manage / user.manage", () => {
    for (const cell of PROTECTED_CELLS) {
      const errors = validateOverrides([{ ...cell, allowed: false }]);
      expect(errors.length, cell.permission).toBeGreaterThan(0);
      expect(errors.join(" ")).toContain(cell.permission);
      expect(isProtectedCell(cell.role, cell.permission)).toBe(true);
    }
    // Sel akses-penuh lain TIDAK terkunci (boleh melepas izin non-kritis).
    expect(isProtectedCell("managing_director", "report.read")).toBe(false);
    expect(validateOverrides([{ role: "managing_director", permission: "report.read", allowed: false }])).toEqual([]);
  });

  it("menolak write tanpa read pada matriks EFEKTIF (write ⊆ read)", () => {
    // Kepala Gudang diberi contract.write tetapi tidak contract.read → lebih longgar
    // menulis daripada membaca; harus ditolak dengan pesan Indonesia.
    const errors = validateOverrides([{ role: "warehouse_head", permission: "contract.write", allowed: true }]);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.join(" ")).toContain("contract");
    // Diberikan BERSAMA read-nya → sah.
    expect(
      validateOverrides([
        { role: "warehouse_head", permission: "contract.write", allowed: true },
        { role: "warehouse_head", permission: "contract.read", allowed: true },
      ])
    ).toEqual([]);
  });

  it("menolak delete yang lolos dari write (delete ⊆ write)", () => {
    // Mencabut invoice.write Direktur Utama sambil membiarkan invoice.delete-nya.
    const errors = validateOverrides([{ role: "managing_director", permission: "invoice.write", allowed: false }]);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.join(" ")).toContain("invoice");
  });

  it("menolak peran/izin asing dan sel kembar", () => {
    expect(validateOverrides([{ role: "admin", permission: "report.read", allowed: true }]).join(" ")).toContain("admin");
    expect(validateOverrides([{ role: "finance_manager", permission: "ghost.read", allowed: true }]).join(" ")).toContain("ghost.read");
    const dup = validateOverrides([
      { role: "finance_manager", permission: "report.read", allowed: true },
      { role: "finance_manager", permission: "report.read", allowed: false },
    ]);
    expect(dup.length).toBeGreaterThan(0);
  });
});

describe("normalizeOverrides — baris redundan dibuang", () => {
  it("baris yang sama dengan bawaan tidak disimpan; penyimpangan disimpan", () => {
    const rows = normalizeOverrides([
      // Redundan: bawaan memang begitu.
      { role: "managing_director", permission: "report.read", allowed: true },
      { role: "warehouse_head", permission: "report.read", allowed: false },
      // Penyimpangan sungguhan.
      { role: "finance_manager", permission: "report.read", allowed: true },
      { role: "finance_manager", permission: "contract.write", allowed: false },
    ]);
    expect(rows).toEqual([
      { role: "finance_manager", permission: "report.read", allowed: true },
      { role: "finance_manager", permission: "contract.write", allowed: false },
    ]);
  });
});

describe("createEffectiveMatrixLoader — cache TTL + invalidasi", () => {
  const grantRow = [{ role: "finance_manager", permission: "report.read" as Permission, allowed: true }];

  it("membaca sumber sekali lalu memakai cache selama TTL", async () => {
    let reads = 0;
    let clock = 1_000;
    const loader = createEffectiveMatrixLoader(
      async () => {
        reads += 1;
        return grantRow;
      },
      () => clock
    );
    expect((await loader.get())["report.read"]).toContain("finance_manager");
    clock += EFFECTIVE_MATRIX_TTL_MS - 1;
    await loader.get();
    expect(reads).toBe(1);
    // TTL lewat → membaca lagi.
    clock += 2;
    await loader.get();
    expect(reads).toBe(2);
  });

  it("invalidate() memaksa pembacaan berikutnya ke sumber — ritme tulis", async () => {
    const rows: Array<{ role: string; permission: string; allowed: boolean }> = [];
    let reads = 0;
    const loader = createEffectiveMatrixLoader(
      async () => {
        reads += 1;
        return rows;
      },
      () => 42 // waktu beku: tanpa invalidasi, cache tak pernah kedaluwarsa
    );
    expect((await loader.get())["report.read"]).not.toContain("finance_manager");

    // "PUT /api/authz/overrides" menulis lalu menginvalidasi:
    rows.push({ role: "finance_manager", permission: "report.read", allowed: true });
    await loader.get();
    expect(reads, "sebelum invalidasi masih dari cache").toBe(1);
    loader.invalidate();
    expect((await loader.get())["report.read"]).toContain("finance_manager");
    expect(reads).toBe(2);
  });

  it("sumber yang gagal → jatuh ke matriks bawaan, tanpa meracuni cache", async () => {
    let fail = true;
    const loader = createEffectiveMatrixLoader(async () => {
      if (fail) throw new Error("db down");
      return grantRow;
    });
    const fallback = await loader.get();
    expect(fallback["report.read"]).toEqual(PERMISSION_ROLES["report.read"]);
    // Sumber pulih → pembacaan berikutnya melihat override (kegagalan tak di-cache).
    fail = false;
    expect((await loader.get())["report.read"]).toContain("finance_manager");
  });
});

describe("konsistensi konfigurasi", () => {
  it("sel terlindung memakai peran & izin yang benar-benar ada", () => {
    for (const cell of PROTECTED_CELLS) {
      expect(ROLE_VALUES).toContain(cell.role);
      expect(PERMISSIONS).toContain(cell.permission);
      // Bawaan memang memberikannya — kunci tidak menciptakan izin baru.
      expect(can({ role: cell.role }, cell.permission)).toBe(true);
    }
  });
});
