/**
 * Penegakan modul (issue #99) — lapisan ketiga di `canEffective`.
 *
 * Modul hanya berguna kalau ia benar-benar menutup permukaan, dan hanya AMAN
 * kalau ia tidak menyentuh apa pun selain permukaan. Empat sifat yang dijaga di
 * sini, semuanya di titik rakit yang sama (`lib/authz-effective.ts`):
 *
 *  1. **Menutup untuk semua orang** — termasuk peran berakses penuh; menu, dan
 *     karena satu titik yang sama, halaman & route API sekaligus.
 *  2. **Tidak pernah menutup buku besar & pintu admin** — `journal`, `ledger`,
 *     `report`, `authz.manage`, `user.manage` ada di modul inti.
 *  3. **Tidak mengubah izin siapa pun** — override peran/pengguna tidak
 *     disentuh, jadi menyalakan modulnya kembali menghasilkan set izin yang
 *     PERSIS SAMA seperti sebelum dimatikan. Bukan "kira-kira sama".
 *  4. **Cache-nya sejalan dengan cache izin** — jendela yang sama, dan
 *     invalidasi saat menulis membuat perubahan terasa seketika di proses yang
 *     menyimpan.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  MissingCompanyContextError,
  runWithCompany,
  runWithoutCompany,
} from "@/lib/company-context";
import { ROLES } from "@/lib/constants";
import { PERMISSIONS, type Permission } from "@/lib/authz";

const db = vi.hoisted(() => ({
  overrides: [] as Array<{ role: string; permission: string; allowed: boolean }>,
  userOverrides: [] as Array<{ permission: string; allowed: boolean }>,
  enabledModules: null as string | null,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    rolePermissionOverride: { findMany: async () => db.overrides },
    userPermissionOverride: { findMany: async () => db.userOverrides },
    companySetting: { findFirst: async () => ({ enabledModules: db.enabledModules }) },
  },
}));

import {
  canEffective,
  effectivePermissionsFor,
  getEnabledModules,
  invalidateEffectiveMatrix,
  invalidateEnabledModules,
  invalidateUserOverrides,
  isModuleActiveFor,
} from "@/lib/authz-effective";

const MD = { id: "1", role: ROLES.MANAGING_DIRECTOR };
const FINANCE = { id: "2", role: ROLES.FINANCE_MANAGER };

/** Setel keadaan DB palsu + buang semua cache — tiap tes mulai bersih. */
function setDb(state: Partial<typeof db>) {
  Object.assign(db, state);
  invalidateEffectiveMatrix();
  invalidateEnabledModules();
  invalidateUserOverrides(1);
  invalidateUserOverrides(2);
}

beforeEach(() => {
  setDb({ overrides: [], userOverrides: [], enabledModules: null });
});

describe("kolom kosong = semua modul aktif (perilaku hari ini, tanpa backfill)", () => {
  it("NULL berarti setiap izin tetap terjangkau seperti sebelum fitur ini ada", async () => {
    expect([...(await getEnabledModules())].length).toBeGreaterThan(0);
    expect(await canEffective(MD, "contract.read")).toBe(true);
    expect(await canEffective(MD, "document.write")).toBe(true);
    expect(await canEffective(FINANCE, "invoice.write")).toBe(true);
  });

  it("set izin efektif sama persis dengan sebelum modul diperkenalkan", async () => {
    const all = await effectivePermissionsFor(MD);
    // Direktur Utama memegang SEMUA izin, dan tanpa modul yang dimatikan tak
    // satu pun boleh hilang dari sidebar.
    expect(all).toEqual([...PERMISSIONS]);
  });
});

describe("modul non-aktif menutup permukaannya — untuk semua orang", () => {
  beforeEach(() => {
    setDb({ enabledModules: "core_accounting,sales,purchasing,cash_bank" });
  });

  it("menolak izin modul non-aktif walau perannya berakses penuh", async () => {
    for (const permission of [
      "contract.read",
      "delivery_order.write",
      "consignee.read",
      "inventory.read",
      "fixed_asset.read",
      "document.read",
      "tax.read",
      "approval.view",
    ] as Permission[]) {
      expect(await canEffective(MD, permission), permission).toBe(false);
    }
  });

  it("TIDAK menutup buku besar, laporan, maupun pintu admin", async () => {
    for (const permission of [
      "journal.read",
      "ledger.read",
      "report.read",
      "report.export",
      "budget.manage",
      "account.manage",
      "authz.manage",
      "user.manage",
      "settings.view",
    ] as Permission[]) {
      expect(await canEffective(MD, permission), permission).toBe(true);
    }
  });

  it("membuang izin modul non-aktif dari set efektif (menu & Aksi Cepat ikut hilang)", async () => {
    const permissions = await effectivePermissionsFor(MD);
    expect(permissions).not.toContain("contract.read");
    expect(permissions).not.toContain("inventory.read");
    expect(permissions).toContain("invoice.read");
    expect(permissions).toContain("ledger.read");
  });

  it("membedakan 'modul mati' dari 'tidak punya akses' — dua kalimat berbeda", async () => {
    // Modul mati: berlaku untuk siapa pun.
    expect(await isModuleActiveFor("contract.read")).toBe(false);
    // Modul hidup, tetapi perannya memang tidak punya izinnya: pesannya harus
    // TETAP soal hak akses, bukan soal modul.
    expect(await isModuleActiveFor("journal.write")).toBe(true);
    expect(await canEffective(FINANCE, "journal.write")).toBe(false);
  });
});

describe("modul ≠ izin: menyalakan kembali tidak mengubah hak siapa pun", () => {
  it("set izin sebelum dimatikan dan sesudah dinyalakan lagi sama PERSIS", async () => {
    setDb({ enabledModules: null });
    const before = await effectivePermissionsFor(FINANCE);

    setDb({ enabledModules: "core_accounting,sales" });
    const whileOff = await effectivePermissionsFor(FINANCE);
    expect(whileOff.length).toBeLessThan(before.length);

    setDb({ enabledModules: null });
    expect(await effectivePermissionsFor(FINANCE)).toEqual(before);
  });

  it("override peran yang MENCABUT izin tetap berlaku setelah modulnya menyala lagi", async () => {
    // Manajer Keuangan dicabut haknya membuat kontrak — keputusan peran, bukan modul.
    setDb({
      overrides: [
        { role: ROLES.FINANCE_MANAGER, permission: "contract.write", allowed: false },
        { role: ROLES.FINANCE_MANAGER, permission: "contract.read", allowed: false },
      ],
      enabledModules: "core_accounting,sales",
    });
    expect(await canEffective(FINANCE, "contract.write")).toBe(false);

    // Modul dinyalakan lagi: yang kembali hanya keterjangkauan, bukan izinnya.
    setDb({ enabledModules: null });
    expect(await canEffective(FINANCE, "contract.write")).toBe(false);
    expect(await canEffective(MD, "contract.write")).toBe(true);
  });

  it("izin khusus per pengguna juga tidak dihapus oleh modul yang mati", async () => {
    setDb({
      userOverrides: [{ permission: "contract.delete", allowed: true }],
      enabledModules: null,
    });
    expect(await canEffective(FINANCE, "contract.delete")).toBe(true);

    setDb({
      userOverrides: [{ permission: "contract.delete", allowed: true }],
      enabledModules: "core_accounting,sales",
    });
    expect(await canEffective(FINANCE, "contract.delete")).toBe(false);

    setDb({
      userOverrides: [{ permission: "contract.delete", allowed: true }],
      enabledModules: null,
    });
    expect(await canEffective(FINANCE, "contract.delete")).toBe(true);
  });
});

describe("cache & invalidasi", () => {
  it("perubahan modul terasa SEKETIKA setelah invalidasi (jendela penulisan)", async () => {
    expect(await canEffective(MD, "inventory.read")).toBe(true);

    db.enabledModules = "core_accounting";
    invalidateEnabledModules();

    expect(await canEffective(MD, "inventory.read")).toBe(false);
  });

  it("tanpa invalidasi, keputusan lama masih dipakai sampai TTL habis", async () => {
    expect(await canEffective(MD, "inventory.read")).toBe(true);

    // Proses LAIN mengubah kolomnya; proses ini belum tahu.
    db.enabledModules = "core_accounting";

    expect(await canEffective(MD, "inventory.read")).toBe(true);
  });
});

describe("penjaga halaman & API benar-benar memakai gerbang modul", () => {
  const read = (rel: string) => readFileSync(join(__dirname, "..", "src", rel), "utf8");

  it("penjaga API menolak dengan kode 'module_inactive' sebelum cek peran", () => {
    const src = read("lib/auth-guard.ts");
    expect(src).toContain("isModuleActiveFor(");
    expect(src).toContain("module_inactive");
    // Urutannya penting: kalau cek peran lebih dulu, pengguna berakses penuh
    // akan mendapat "Forbidden" tanpa penjelasan alih-alih kalimat yang benar.
    expect(src.indexOf("isModuleActiveFor(")).toBeLessThan(src.indexOf("canEffective("));
  });

  it("penjaga halaman mengarahkan ke layar penjelasan, bukan memantul diam-diam", () => {
    const src = read("lib/page-auth.ts");
    expect(src).toContain("isModuleActiveFor(");
    expect(src).toContain("/feature-inactive");
  });

  it("wizard penyiapan pun tidak bisa mematikan modul inti (validasi di server)", () => {
    // Permintaan pertama seumur pemasangan tetap lewat penjaga yang sama: tanpa
    // ini sebuah POST /api/setup yang dirakit tangan bisa menutup /permissions
    // dan /users sejak menit nol.
    const src = read("app/api/setup/route.ts");
    expect(src).toContain("validateEnabledModules(");
    expect(src).toContain("serializeEnabledModules(");
    expect(src).toContain("invalidateEnabledModules()");
  });

  it("API modul ber-gate izin & menginvalidasi cache setelah menyimpan", () => {
    const src = read("app/api/company-settings/modules/route.ts");
    expect(src).toContain('requireApiPermission("company_setting.manage")');
    expect(src).toContain("validateEnabledModules(");
    expect(src).toContain("invalidateEnabledModules()");
    expect(src).toContain("writeAuditLog(");
  });

  it("layar penjelasannya ada dan menjaga dirinya sendiri agar bukan jalan buntu", () => {
    const src = read("app/(app)/(auth)/feature-inactive/page.tsx");
    expect(src).toContain("isModuleEnabled(");
    expect(src).toContain('redirect("/dashboard")');
  });

  /*
   * Issue #355 — regresi yang membuat gerbang modul terasa seperti kerusakan.
   *
   * Halaman DI LUAR `(dashboard)` tidak lewat `requirePagePermission`, dan
   * penjaga itulah satu-satunya yang menanam konteks perusahaan untuk sebuah
   * permintaan HTTP. Halaman semacam itu yang tetap memanggil pembaca
   * ber-lingkup-perusahaan akan melempar `MissingCompanyContextError` — yang
   * sampai ke pengguna sebagai layar galat bawaan Next berbahasa Inggris
   * ("This page couldn't load", HTTP 409), bukan sebagai penjelasan.
   *
   * Persis itu yang terjadi pada `/feature-inactive` dan `/setup-required`:
   * 16 rute milik modul yang dimatikan berakhir di layar galat, dan penjelasan
   * berbahasa Indonesia di dalamnya tidak pernah terlihat sekali pun.
   *
   * Tesnya sengaja MENYAPU, bukan menyebut dua berkas itu: yang dijaga adalah
   * sifatnya — "membaca lingkup perusahaan tanpa penjaga ⇒ wajib menanam
   * konteks sendiri" — supaya halaman `(auth)` BERIKUTNYA yang memanggil
   * `canEffective()` ikut tertangkap.
   */
  it("halaman di luar (dashboard) yang membaca lingkup perusahaan menanam konteksnya sendiri", () => {
    const SCOPED_READERS = [
      "getEnabledModules(",
      "canEffective(",
      "isSetupDone(",
      "effectivePermissionsFor(",
      "isModuleActiveFor(",
      "currentCompanyId(",
    ];
    const roots = ["app/(app)/(auth)", "app/(app)/(tenant)", "app/(app)/(operator)", "app/(app)/(docs)"];
    const offenders: string[] = [];

    for (const root of roots) {
      const dir = join(__dirname, "..", "src", root);
      if (!existsSync(dir)) continue;
      for (const file of readdirSync(dir, { recursive: true, encoding: "utf8" })) {
        if (!file.endsWith(".tsx") && !file.endsWith(".ts")) continue;
        const rel = join(root, file);
        const src = read(rel);
        // Baris komentar dibuang dulu: berkas ini justru MENJELASKAN jebakannya
        // dengan menyebut nama fungsinya, dan penjelasan bukan pemanggilan.
        const code = src
          .replace(/\/\*[\s\S]*?\*\//g, "")
          .replace(/^\s*\/\/.*$/gm, "");
        const reads = SCOPED_READERS.filter((fn) => code.includes(fn));
        if (reads.length === 0) continue;
        if (!code.includes("runWithCompany(")) {
          offenders.push(`${rel} memanggil ${reads.join(", ")} tanpa runWithCompany()`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });

  /*
   * Pasangan perilaku untuk tes sapuan di atas. Yang itu menjaga BENTUK
   * kodenya; yang ini membuktikan PREMIS-nya — bahwa `runWithCompany()` memang
   * yang membedakan "melempar" dari "menjawab". Tanpa tes ini, sapuan di atas
   * hanya memaksa sebuah nama fungsi muncul di berkas.
   *
   * `runWithoutCompany()` dipakai untuk keluar dari konteks yang dipasang
   * `tests/setup-company-context.ts` ke SETIAP tes — tanpa itu, konteks global
   * tes akan menutupi justru keadaan yang ingin dibuktikan di sini.
   */
  it("getEnabledModules() melempar tanpa konteks, dan menjawab di dalam runWithCompany()", async () => {
    setDb({ enabledModules: "core_accounting,sales" });

    await expect(
      runWithoutCompany(() => getEnabledModules())
    ).rejects.toThrow(MissingCompanyContextError);

    const enabled = await runWithoutCompany(() =>
      runWithCompany(
        { companyId: 7, slug: "pt-lain", databaseName: "sai_lain" },
        () => getEnabledModules()
      )
    );
    expect(enabled.has("sales")).toBe(true);
  });
});
