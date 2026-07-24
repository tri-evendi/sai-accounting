/**
 * Izin khusus per pengguna (issue #75) — keputusan murninya.
 *
 * Yang dijaga: urutan evaluasi bawaan → override peran → override PENGGUNA
 * (baris pengguna menang atas keputusan perannya); tanpa baris = mengikuti
 * peran sepenuhnya; deny-by-default tak bisa dibobol lewat baris yatim;
 * validasi menolak anti-lockout bos, sel kembar, dan pelanggaran invarian
 * delete ⊆ write ⊆ read pada set izin FINAL pengguna; cache per-pengguna
 * menghormati TTL + invalidasi TERARAH per id; kegagalan DB jatuh ke izin
 * level peran. Tanpa DB — sumber override di-inject.
 */
import { describe, expect, it } from "vitest";
import {
  USER_OVERRIDES_TTL_MS,
  applyUserOverrides,
  canWithUserOverrides,
  createUserOverridesLoader,
  normalizeUserOverrides,
  rolePermissionSet,
  validateUserOverrides,
} from "@/lib/authz-user-overrides";
import {
  EFFECTIVE_MATRIX_TTL_MS,
  PROTECTED_CELLS,
  applyOverrides,
} from "@/lib/authz-overrides";
import { PERMISSIONS, PERMISSION_ROLES, type Permission } from "@/lib/authz";

/** Matriks efektif = bawaan (tanpa override peran) — titik berangkat umum. */
const baseline = applyOverrides([]);

describe("rolePermissionSet — izin sebuah peran menurut matriks efektif", () => {
  it("memuat persis izin peran itu; peran kosong/asing = set kosong", () => {
    const core = rolePermissionSet(baseline, "core");
    for (const permission of PERMISSIONS) {
      expect(core.has(permission), permission).toBe(
        (PERMISSION_ROLES[permission] as readonly string[]).includes("core")
      );
    }
    expect(rolePermissionSet(baseline, null).size).toBe(0);
    expect(rolePermissionSet(baseline, "admin").size).toBe(0);
  });
});

describe("applyUserOverrides — set izin FINAL pengguna", () => {
  it("tanpa override = persis izin perannya (perilaku hari ini)", () => {
    const roleSet = rolePermissionSet(baseline, "core");
    expect(applyUserOverrides(roleSet, [])).toEqual(
      PERMISSIONS.filter((p) => roleSet.has(p))
    );
  });

  it("override MENGHADIAHKAN izin yang perannya tidak punya", () => {
    const final = applyUserOverrides(rolePermissionSet(baseline, "core"), [
      { permission: "report.read", allowed: true },
    ]);
    expect(final).toContain("report.read");
    // Izin lain tidak tersentuh.
    expect(final).toContain("contract.write");
    expect(final).not.toContain("journal.write");
  });

  it("override MENCABUT izin yang perannya punya", () => {
    const final = applyUserOverrides(rolePermissionSet(baseline, "core"), [
      { permission: "contract.write", allowed: false },
    ]);
    expect(final).not.toContain("contract.write");
    expect(final).toContain("contract.read");
  });

  it("baris yatim diabaikan — izin yang tak dikenal kode tak pernah hidup", () => {
    const roleSet = rolePermissionSet(baseline, "ptg");
    const final = applyUserOverrides(roleSet, [
      { permission: "ghost.read", allowed: true },
      { permission: "ghost.write", allowed: false },
    ]);
    expect(final).toEqual(applyUserOverrides(roleSet, []));
  });

  it("tersusun di atas override PERAN (#73): urutan bawaan → peran → pengguna", () => {
    // Override peran mencabut contract.write dari core; override pengguna
    // menghadiahkannya kembali untuk SATU orang.
    const matrix = applyOverrides([
      { role: "core", permission: "contract.write", allowed: false },
    ]);
    const roleSet = rolePermissionSet(matrix, "core");
    expect(roleSet.has("contract.write")).toBe(false);
    expect(
      applyUserOverrides(roleSet, [{ permission: "contract.write", allowed: true }])
    ).toContain("contract.write");
  });
});

describe("canWithUserOverrides — keputusan per pengguna", () => {
  it("baris pengguna menang; tanpa baris keputusan perannya berlaku", () => {
    expect(canWithUserOverrides(baseline, { role: "core" }, [], "report.read")).toBe(false);
    expect(
      canWithUserOverrides(
        baseline,
        { role: "core" },
        [{ permission: "report.read", allowed: true }],
        "report.read"
      )
    ).toBe(true);
    expect(
      canWithUserOverrides(
        baseline,
        { role: "core" },
        [{ permission: "contract.write", allowed: false }],
        "contract.write"
      )
    ).toBe(false);
    // Baris untuk izin LAIN tidak memengaruhi keputusan izin ini.
    expect(
      canWithUserOverrides(
        baseline,
        { role: "core" },
        [{ permission: "report.read", allowed: true }],
        "contract.write"
      )
    ).toBe(true);
  });

  it("deny-by-default dipertahankan tanpa baris: tanpa peran = ditolak", () => {
    expect(canWithUserOverrides(baseline, null, [], "report.read")).toBe(false);
    expect(canWithUserOverrides(baseline, { role: "" }, [], "report.read")).toBe(false);
    expect(canWithUserOverrides(baseline, { role: "admin" }, [], "report.read")).toBe(false);
  });
});

describe("validateUserOverrides — anti-lockout & invarian pada set FINAL", () => {
  const coreSet = rolePermissionSet(baseline, "core");
  const bosSet = rolePermissionSet(baseline, "bos");
  const ptgSet = rolePermissionSet(baseline, "ptg");

  it("set kosong dan override wajar diterima", () => {
    expect(validateUserOverrides("core", [], coreSet)).toEqual([]);
    expect(
      validateUserOverrides(
        "core",
        [
          { permission: "report.read", allowed: true },
          { permission: "inventory.write", allowed: false },
        ],
        coreSet
      )
    ).toEqual([]);
  });

  it("menolak pencabutan izin anti-lockout dari pengguna ber-peran bos", () => {
    for (const cell of PROTECTED_CELLS) {
      const errors = validateUserOverrides(
        "bos",
        [{ permission: cell.permission, allowed: false }],
        bosSet
      );
      expect(errors.length, cell.permission).toBeGreaterThan(0);
      expect(errors.join(" ")).toContain(cell.permission);
    }
    // Izin bos lain TIDAK terkunci (bos boleh dilepas izin non-kritis).
    expect(
      validateUserOverrides("bos", [{ permission: "report.read", allowed: false }], bosSet)
    ).toEqual([]);
    // Peran non-bos tidak tersentuh kuncinya: core toh tidak memegangnya —
    // barisnya sekadar redundan, bukan pelanggaran.
    expect(
      validateUserOverrides("core", [{ permission: "user.manage", allowed: false }], coreSet)
    ).toEqual([]);
  });

  it("menolak write tanpa read pada set FINAL (write ⊆ read)", () => {
    const errors = validateUserOverrides(
      "ptg",
      [{ permission: "contract.write", allowed: true }],
      ptgSet
    );
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.join(" ")).toContain("contract");
    // Diberikan BERSAMA read-nya → sah.
    expect(
      validateUserOverrides(
        "ptg",
        [
          { permission: "contract.write", allowed: true },
          { permission: "contract.read", allowed: true },
        ],
        ptgSet
      )
    ).toEqual([]);
    // Mencabut read sambil menyisakan write juga ditolak.
    const revokeRead = validateUserOverrides(
      "core",
      [{ permission: "contract.read", allowed: false }],
      coreSet
    );
    expect(revokeRead.length).toBeGreaterThan(0);
  });

  it("menolak delete yang lolos dari write (delete ⊆ write)", () => {
    const errors = validateUserOverrides(
      "bos",
      [{ permission: "invoice.write", allowed: false }],
      bosSet
    );
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.join(" ")).toContain("invoice");
    // Dicabut BERSAMA delete-nya → sah.
    expect(
      validateUserOverrides(
        "bos",
        [
          { permission: "invoice.write", allowed: false },
          { permission: "invoice.delete", allowed: false },
        ],
        bosSet
      )
    ).toEqual([]);
  });

  it("menolak izin asing dan baris kembar", () => {
    expect(
      validateUserOverrides("core", [{ permission: "ghost.read", allowed: true }], coreSet).join(" ")
    ).toContain("ghost.read");
    const dup = validateUserOverrides(
      "core",
      [
        { permission: "report.read", allowed: true },
        { permission: "report.read", allowed: false },
      ],
      coreSet
    );
    expect(dup.length).toBeGreaterThan(0);
  });
});

describe("normalizeUserOverrides — baris redundan dibuang", () => {
  it("baris yang sama dengan nilai efektif perannya tidak disimpan", () => {
    const coreSet = rolePermissionSet(baseline, "core");
    const rows = normalizeUserOverrides(coreSet, [
      // Redundan: perannya memang begitu.
      { permission: "contract.write", allowed: true },
      { permission: "report.read", allowed: false },
      // Penyimpangan sungguhan.
      { permission: "report.read" as Permission, allowed: true },
      { permission: "inventory.write", allowed: false },
    ] as Array<{ permission: Permission; allowed: boolean }>);
    expect(rows).toEqual([
      { permission: "report.read", allowed: true },
      { permission: "inventory.write", allowed: false },
    ]);
  });
});

describe("createUserOverridesLoader — cache per-pengguna + invalidasi terarah", () => {
  it("TTL-nya konstanta 60 dtk yang sama dengan matriks efektif #73", () => {
    expect(USER_OVERRIDES_TTL_MS).toBe(EFFECTIVE_MATRIX_TTL_MS);
  });

  it("membaca sumber sekali PER PENGGUNA lalu memakai cache selama TTL", async () => {
    const reads: number[] = [];
    let clock = 1_000;
    const loader = createUserOverridesLoader(
      async (userId) => {
        reads.push(userId);
        return [{ permission: "report.read", allowed: true }];
      },
      () => clock
    );
    expect(await loader.get(1)).toHaveLength(1);
    expect(await loader.get(2)).toHaveLength(1);
    clock += USER_OVERRIDES_TTL_MS - 1;
    await loader.get(1);
    await loader.get(2);
    expect(reads).toEqual([1, 2]);
    // TTL lewat → membaca lagi.
    clock += 2;
    await loader.get(1);
    expect(reads).toEqual([1, 2, 1]);
  });

  it("invalidate(userId) TERARAH: cache pengguna lain tetap utuh", async () => {
    const rowsByUser = new Map<number, Array<{ permission: string; allowed: boolean }>>();
    const reads: number[] = [];
    const loader = createUserOverridesLoader(
      async (userId) => {
        reads.push(userId);
        return rowsByUser.get(userId) ?? [];
      },
      () => 42 // waktu beku: tanpa invalidasi, cache tak pernah kedaluwarsa
    );
    expect(await loader.get(1)).toEqual([]);
    expect(await loader.get(2)).toEqual([]);

    // "PUT /api/users/1/permissions" menulis lalu menginvalidasi user 1 saja:
    rowsByUser.set(1, [{ permission: "report.read", allowed: true }]);
    rowsByUser.set(2, [{ permission: "report.read", allowed: true }]);
    loader.invalidate(1);
    expect(await loader.get(1)).toHaveLength(1);
    expect(await loader.get(2), "user 2 masih dari cache lama").toEqual([]);
    expect(reads).toEqual([1, 2, 1]);
  });

  it("sumber yang gagal → jatuh ke daftar kosong (izin level peran), tanpa meracuni cache", async () => {
    let fail = true;
    const loader = createUserOverridesLoader(async () => {
      if (fail) throw new Error("db down");
      return [{ permission: "report.read", allowed: true }];
    });
    expect(await loader.get(7)).toEqual([]);
    // Sumber pulih → pembacaan berikutnya melihat override (kegagalan tak di-cache).
    fail = false;
    expect(await loader.get(7)).toHaveLength(1);
  });
});
