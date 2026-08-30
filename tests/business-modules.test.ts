/**
 * Modul per kategori usaha (issue #99) — peta modul & aturan mainnya.
 *
 * Yang dijaga di sini adalah bagian STRUKTURAL fitur ini, yang kalau meleset
 * gagalnya sunyi:
 *
 *  1. **Peta itu lengkap dan tidak tumpang tindih.** Sumber daya izin yang
 *     tidak punya modul akan hilang dari menu untuk SEMUA orang begitu ada satu
 *     modul saja yang dimatikan — tanpa galat, tanpa merah. `tsc` sudah menolak
 *     sumber daya baru tanpa modul (Record bertipe penuh); tes ini menjaga sisi
 *     sebaliknya: tidak ada modul hantu, dan gabungan seluruh modul = seluruh
 *     izin, tanpa satu pun yang terhitung dua kali.
 *  2. **Kosong = semua aktif.** Inilah yang membuat fitur ini mendarat tanpa
 *     backfill: kolom baru yang NULL harus berarti "aplikasi persis seperti
 *     kemarin".
 *  3. **Anti-lockout.** Modul inti tak bisa dimatikan — lewat data (parse),
 *     lewat API (validate), maupun lewat penyusunan ulang (normalize).
 *  4. **Cache-nya sejalan dengan cache izin.** Perubahan modul harus terasa di
 *     jendela yang sama dengan perubahan izin, dan invalidasi harus benar-benar
 *     memaksa pembacaan ulang.
 */
import { describe, expect, it, vi } from "vitest";
import { PERMISSIONS, type Permission } from "@/lib/authz";
import { permissionResource } from "@/lib/authz-labels";
import { EFFECTIVE_MATRIX_TTL_MS } from "@/lib/authz-overrides";
import {
  ALL_MODULES,
  BUSINESS_CATEGORIES,
  BUSINESS_MODULES,
  isOptInModule,
  CORE_MODULE,
  ENABLED_MODULES_TTL_MS,
  MODULE_META,
  RESOURCE_MODULE,
  createEnabledModulesLoader,
  filterPermissionsByModules,
  isModuleEnabled,
  isPermissionEnabled,
  moduleForPermission,
  modulesForCategory,
  normalizeEnabledModules,
  parseEnabledModules,
  permissionsForModule,
  serializeEnabledModules,
  validateEnabledModules,
  type BusinessModule,
} from "@/lib/business-modules";

/** Himpunan modul "semua kecuali X" — bentuk yang dipakai perusahaan sungguhan. */
const allExcept = (...off: BusinessModule[]): ReadonlySet<BusinessModule> =>
  new Set(BUSINESS_MODULES.filter((m) => !off.includes(m)));

describe("peta modul: lengkap, kasar, tanpa tumpang tindih", () => {
  it("setiap sumber daya izin punya modul yang dikenal", () => {
    for (const permission of PERMISSIONS) {
      const owner = moduleForPermission(permission);
      expect(BUSINESS_MODULES, `izin ${permission}`).toContain(owner);
    }
  });

  it("gabungan seluruh modul = seluruh izin, tepat satu kali masing-masing", () => {
    const seen = new Map<Permission, BusinessModule>();
    for (const owner of BUSINESS_MODULES) {
      for (const permission of permissionsForModule(owner)) {
        expect(seen.has(permission), `izin ${permission} milik dua modul`).toBe(false);
        seen.set(permission, owner);
      }
    }
    expect([...seen.keys()].sort()).toEqual([...PERMISSIONS].sort());
  });

  it("tidak ada sumber daya hantu di peta (sisa dari izin yang sudah dihapus)", () => {
    const live = new Set(PERMISSIONS.map((p) => permissionResource(p)));
    expect(Object.keys(RESOURCE_MODULE).filter((r) => !live.has(r as never))).toEqual([]);
  });

  it("setiap modul benar-benar berisi izin (bukan modul kosong yang membingungkan)", () => {
    for (const owner of BUSINESS_MODULES) {
      expect(permissionsForModule(owner).length, `modul ${owner}`).toBeGreaterThan(0);
    }
  });

  it("kasar, bukan halus: 8–11 modul untuk seluruh matriks izin", () => {
    // Batas atas dinaikkan dari 10 ke 11 SEKALI, untuk `manufacturing` (#495
    // butir 3). Ia dinaikkan dengan sadar, bukan dilonggarkan: modul ke-12
    // harus menabrak penjaga ini lagi dan menjelaskan dirinya lagi, sebab
    // modul yang terlalu halus hanya jadi labirin konfigurasi.
    expect(BUSINESS_MODULES.length).toBeGreaterThanOrEqual(8);
    expect(BUSINESS_MODULES.length).toBeLessThanOrEqual(11);
  });

  it("setiap modul punya teks (kunci kamus), termasuk yang baru ditambahkan", () => {
    for (const owner of BUSINESS_MODULES) {
      expect(MODULE_META[owner].labelKey).toBe(`modules.name.${owner}`);
      expect(MODULE_META[owner].descriptionKey).toBe(`modules.description.${owner}`);
    }
  });
});

describe("modul inti: pintu yang tak pernah bisa ditutup", () => {
  it("memuat kedua izin anti-lockout + seluruh permukaan akuntansi", () => {
    const core = new Set(permissionsForModule(CORE_MODULE));
    for (const permission of [
      "authz.manage",
      "user.manage",
      "journal.read",
      "journal.write",
      "ledger.read",
      "account.manage",
      "report.read",
      "period.manage",
      "setup.manage",
      "company_setting.manage",
      "audit.read",
      "budget.manage",
      "cost_center.manage",
      "settings.view",
    ] as Permission[]) {
      expect(core, `izin ${permission} harus di modul inti`).toContain(permission);
    }
  });

  it("tetap aktif walau himpunan modulnya kosong sama sekali", () => {
    const nothing = new Set<BusinessModule>();
    expect(isModuleEnabled(CORE_MODULE, nothing)).toBe(true);
    expect(isPermissionEnabled("authz.manage", nothing)).toBe(true);
    expect(isPermissionEnabled("user.manage", nothing)).toBe(true);
    expect(isPermissionEnabled("ledger.read", nothing)).toBe(true);
    expect(isPermissionEnabled("contract.read", nothing)).toBe(false);
  });
});

describe("keputusan: modul menggerbangi permukaan, bukan buku besar", () => {
  it("mematikan `trading` menutup kontrak & penerima barang tapi TIDAK jurnal & laporan", () => {
    const enabled = allExcept("trading");

    for (const permission of [
      "contract.read",
      "contract.write",
      "consignee.read",
    ] as Permission[]) {
      expect(isPermissionEnabled(permission, enabled), permission).toBe(false);
    }

    /*
     * Surat jalan & retur SENGAJA BERTAHAN sejak koreksi pemetaan — dan ini
     * bukan pelonggaran melainkan perbaikan cacat fungsional yang terukur.
     *
     * Sebelumnya keduanya milik `trading`, sehingga preset DISTRIBUSI (grosir,
     * yang memang tanpa `trading`) bisa menerbitkan faktur tetapi tidak bisa
     * mengirim barangnya maupun mencatat barang yang dikembalikan pelanggannya.
     *
     * Buktinya ada di skema, bukan di selera:
     *   • `sales_returns.invoice_id` WAJIB — retur menunjuk FAKTUR (`sales`);
     *   • `delivery_orders.contract_id` NULLABLE — surat jalan tidak pernah
     *     menuntut kontrak, dan ia menulis gerakan stok + memposting HPP
     *     (`inventory`).
     *
     * Yang tersisa di `trading` adalah yang memang khas perdagangan berjangka
     * ekspor: kontrak dan penerima barang di pelabuhan tujuan.
     */
    expect(isPermissionEnabled("delivery_order.read" as Permission, enabled)).toBe(true);
    expect(isPermissionEnabled("return.write" as Permission, enabled)).toBe(true);

    // Uang muka SENGAJA bertahan — ia hidup di `purchasing`, bukan `trading`.
    expect(isPermissionEnabled("advance.read" as Permission, enabled)).toBe(true);

    // Inilah janji terpenting fitur ini: jurnal yang PERNAH dibuat kontrak tetap
    // terbaca, dan setiap laporan tetap terjangkau.
    for (const permission of [
      "journal.read",
      "ledger.read",
      "report.read",
      "report.export",
      "account.read",
    ] as Permission[]) {
      expect(isPermissionEnabled(permission, enabled), permission).toBe(true);
    }
  });

  it("uang muka ikut `purchasing`, bukan `trading`", () => {
    /*
     * Pasangan pembuktian, bukan satu asersi.
     *
     * Rancangan awal #99 menaruh `advance` bersama kontrak — masuk akal di SAI,
     * karena di sana uang muka memang menyertai kontrak komoditas. Tapi
     * membayar di muka ke pemasok adalah praktik PEMBELIAN yang lumrah:
     * perusahaan jasa atau distribusi yang mematikan `trading` tetap membayar
     * uang muka, dan ikut mematikannya akan memaksa mereka mencatat pembayaran
     * itu sebagai sesuatu yang bukan dirinya.
     *
     * Kalau suatu saat `advance` digeser kembali ke `trading`, salah satu dari
     * dua asersi ini pasti merah — jadi keputusannya tak bisa berbalik diam-diam.
     */
    expect(isPermissionEnabled("advance.read" as Permission, allExcept("trading"))).toBe(true);
    expect(isPermissionEnabled("advance.read" as Permission, allExcept("purchasing"))).toBe(false);
  });

  it("penyaringan izin membuang persis izin modul non-aktif, urut aslinya", () => {
    const enabled = allExcept("inventory", "documents");
    const filtered = filterPermissionsByModules(PERMISSIONS, enabled);

    expect(filtered).not.toContain("inventory.read");
    expect(filtered).not.toContain("document.write");
    expect(filtered).toContain("invoice.read");
    // Urutan deklarasi tetap — sidebar & matriks izin membacanya berurutan.
    expect(filtered).toEqual(PERMISSIONS.filter((p) => filtered.includes(p)));
  });
});

describe("penyimpanan: kosong = semua aktif", () => {
  it("NULL / kosong / spasi berarti modul BAWAAN — semua kecuali yang opt-in", () => {
    /*
     * Dulu ini berbunyi "SEMUA modul aktif". Maksudnya tidak berubah: kolom
     * yang tak pernah disentuh berarti aplikasi persis seperti kemarin, tanpa
     * backfill. Yang berubah adalah bahwa modul OPT-IN (#495 butir 3) tidak
     * ikut bawaan itu — kalau ia ikut, "persis seperti kemarin" justru
     * dilanggar: 14 buku yang tak satu pun memintanya akan mendapat tiga menu
     * manufaktur pada rilis berikutnya.
     */
    for (const raw of [null, undefined, "", "   "]) {
      const parsed = parseEnabledModules(raw);
      for (const m of BUSINESS_MODULES) {
        expect(parsed.has(m), `${m} pada kolom kosong`).toBe(!isOptInModule(m));
      }
    }
  });

  it("nilai rusak jatuh ke BAWAAN, bukan ke kosong dan bukan ke semua", () => {
    // Gagal-tertutup berarti seluruh aplikasi di luar inti lenyap gara-gara satu
    // baris salah ketik. Gagal-terbuka penuh berarti data rusak MENGHADIAHKAN
    // modul yang tak pernah dinyalakan siapa pun. Bawaan adalah keduanya bukan.
    const parsed = parseEnabledModules("gudang,laundry");
    expect(parsed.has("sales")).toBe(true);
    expect(parsed.has("manufacturing")).toBe(false);
  });

  it("token tak dikenal diabaikan, sisanya tetap berlaku, inti selalu ikut", () => {
    const parsed = parseEnabledModules("sales, unicorn ,cash_bank");
    expect([...parsed].sort()).toEqual(["cash_bank", "core_accounting", "sales"]);
  });

  it("menyimpan lalu membaca kembali menghasilkan himpunan yang sama", () => {
    const chosen: BusinessModule[] = ["sales", "purchasing", "cash_bank"];
    const stored = serializeEnabledModules(chosen);
    expect(stored).toBe("core_accounting,sales,purchasing,cash_bank");
    expect(parseEnabledModules(stored)).toEqual(new Set(["core_accounting", ...chosen]));
  });

  it("himpunan BAWAAN disimpan sebagai NULL — 'kosong = bawaan' tetap jujur", () => {
    const bawaan = BUSINESS_MODULES.filter((m) => !isOptInModule(m));
    expect(serializeEnabledModules(bawaan)).toBeNull();
    // Modul BIASA yang ditambahkan ke kode belakangan tetap ikut menyala sendiri.
    expect(parseEnabledModules(serializeEnabledModules(bawaan))).toEqual(new Set(bawaan));
  });

  it("menyalakan modul opt-in tersimpan EKSPLISIT, bukan NULL", () => {
    // Pilihannya adalah keputusan, bukan ketiadaan keputusan — dan NULL berarti
    // ketiadaan keputusan.
    const stored = serializeEnabledModules([...BUSINESS_MODULES]);
    expect(stored).not.toBeNull();
    expect(stored).toContain("manufacturing");
  });

  it("normalisasi: urut deklarasi, tanpa kembar, inti dipaksa ikut", () => {
    expect(normalizeEnabledModules(["tax_id", "sales", "sales"])).toEqual([
      "core_accounting",
      "sales",
      "tax_id",
    ]);
  });
});

describe("validasi saat menulis (penjaga terakhir di server)", () => {
  it("menerima usulan yang sah", () => {
    expect(validateEnabledModules(["core_accounting", "sales", "cash_bank"])).toEqual([]);
  });

  it("menolak modul yang tidak dikenal", () => {
    const errors = validateEnabledModules(["core_accounting", "kasir"]);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("kasir");
  });

  it("menolak modul kembar", () => {
    expect(validateEnabledModules(["core_accounting", "sales", "sales"])).toHaveLength(1);
  });

  it("MENOLAK usulan yang mematikan modul inti — anti-lockout di server", () => {
    const errors = validateEnabledModules(["sales", "purchasing"]);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/inti/i);
  });

  it("daftar kosong pun ditolak dengan alasan yang sama", () => {
    expect(validateEnabledModules([])).toHaveLength(1);
  });
});

describe("preset kategori usaha: hanya NILAI AWAL", () => {
  it("setiap kategori menyalakan modul inti", () => {
    for (const category of BUSINESS_CATEGORIES) {
      expect(modulesForCategory(category), category).toContain(CORE_MODULE);
    }
  });

  it("HANYA kategori manufaktur yang menyalakan modul opt-in", () => {
    /*
     * Dua sisi, dan keduanya penting.
     *
     * Aturannya semula "opt-in tidak ikut preset MANA PUN" — terlalu lebar:
     * orang yang memilih kategori bernama "Manufaktur" SEDANG MEMINTA modulnya,
     * dan menolaknya di situ berarti menyuruhnya menyalakan sendiri hal yang
     * baru saja ia sebutkan.
     *
     * Bunyi yang benar: opt-in tidak ikut preset yang TIDAK MENYEBUTNYA.
     */
    for (const kategori of ["commodity_trading", "distribution", "services", "custom"] as const) {
      expect(modulesForCategory(kategori), kategori).not.toContain("manufacturing");
    }
    expect(modulesForCategory("manufacturing")).toContain("manufacturing");
  });

  it("kategori manufaktur adalah SUPERSET perdagangan, bukan himpunan yang lebih sempit", () => {
    // Pabrik tetap membeli, menjual, bergudang, dan mengekspor — yang
    // membedakannya adalah ia MENGUBAH barang di antaranya.
    const dagang = modulesForCategory("commodity_trading");
    const pabrik = modulesForCategory("manufacturing");
    for (const m of dagang) expect(pabrik, m).toContain(m);
    expect(pabrik.length).toBe(dagang.length + 1);
  });

  it("jasa kini bisa mencatat retur — ia milik `sales`, bukan `trading`", () => {
    // Koreksi pemetaan: perusahaan jasa pun menerbitkan nota kredit atas
    // fakturnya. Surat jalan TETAP tidak ikut — ia milik `inventory`.
    const jasa = new Set(normalizeEnabledModules(modulesForCategory("services")));
    expect(isPermissionEnabled("return.write" as Permission, jasa)).toBe(true);
    expect(isPermissionEnabled("delivery_order.read" as Permission, jasa)).toBe(false);
  });

  it("distribusi kini bisa mengirim DAN menerima retur", () => {
    // Cacat yang diperbaiki: grosir bisa menerbitkan faktur tetapi tidak bisa
    // mengirim barangnya maupun mencatat yang dikembalikan pelanggannya.
    const grosir = new Set(normalizeEnabledModules(modulesForCategory("distribution")));
    expect(isPermissionEnabled("delivery_order.write" as Permission, grosir)).toBe(true);
    expect(isPermissionEnabled("return.write" as Permission, grosir)).toBe(true);
    // Kontrak berjangka & penerima barang pelabuhan tetap khas `trading`.
    expect(isPermissionEnabled("contract.read" as Permission, grosir)).toBe(false);
  });

  it("perdagangan komoditas menyalakan semua BAWAAN; jasa mematikan lapisan barang", () => {
    // Modul opt-in tidak pernah ikut preset mana pun: kalau ia ikut, "opt-in"
    // hanya berlaku bagi buku lama dan perusahaan baru tetap mendapatkannya
    // tanpa pernah meminta.
    expect(modulesForCategory("commodity_trading")).toEqual(
      BUSINESS_MODULES.filter((m) => !isOptInModule(m))
    );
    expect(modulesForCategory("commodity_trading")).not.toContain("manufacturing");

    const services = modulesForCategory("services");
    expect(services).not.toContain("trading");
    expect(services).not.toContain("inventory");
    expect(services).not.toContain("documents");
    expect(services).toContain("sales");
    expect(services).toContain("cash_bank");
  });

  it("distribusi: barang bergudang tanpa lapisan kontrak/ekspor", () => {
    const distribution = modulesForCategory("distribution");
    expect(distribution).toContain("inventory");
    expect(distribution).not.toContain("trading");
    expect(distribution).not.toContain("documents");
  });

  it("preset yang sah selalu lolos validasi server", () => {
    for (const category of BUSINESS_CATEGORIES) {
      expect(validateEnabledModules(modulesForCategory(category)), category).toEqual([]);
    }
  });
});

describe("pemuat + cache", () => {
  it("TTL-nya konstanta yang SAMA dengan matriks izin efektif", () => {
    // Perubahan modul & perubahan izin terasa dalam jendela yang sama —
    // dua angka berbeda berarti dua penjelasan berbeda untuk pengguna.
    expect(ENABLED_MODULES_TTL_MS).toBe(EFFECTIVE_MATRIX_TTL_MS);
  });

  it("membaca DB sekali saja selama masih segar", async () => {
    const fetchRaw = vi.fn().mockResolvedValue("sales");
    let clock = 1_000;
    const loader = createEnabledModulesLoader(fetchRaw, () => clock);

    await loader.get();
    clock += ENABLED_MODULES_TTL_MS - 1;
    const second = await loader.get();

    expect(fetchRaw).toHaveBeenCalledTimes(1);
    expect([...second].sort()).toEqual(["core_accounting", "sales"]);
  });

  it("membaca ulang setelah TTL lewat", async () => {
    const fetchRaw = vi.fn().mockResolvedValue("sales");
    let clock = 1_000;
    const loader = createEnabledModulesLoader(fetchRaw, () => clock);

    await loader.get();
    clock += ENABLED_MODULES_TTL_MS;
    await loader.get();

    expect(fetchRaw).toHaveBeenCalledTimes(2);
  });

  it("invalidasi eksplisit memaksa pembacaan ulang seketika (jendela penulisan)", async () => {
    const fetchRaw = vi.fn().mockResolvedValueOnce("sales").mockResolvedValueOnce("sales,trading");
    const loader = createEnabledModulesLoader(fetchRaw, () => 1_000);

    await loader.get();
    loader.invalidate();
    const after = await loader.get();

    expect(fetchRaw).toHaveBeenCalledTimes(2);
    expect(after.has("trading")).toBe(true);
  });

  it("gagal baca DB = semua modul aktif (dicatat, tidak disembunyikan)", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const loader = createEnabledModulesLoader(() => Promise.reject(new Error("db mati")));

    await expect(loader.get()).resolves.toEqual(ALL_MODULES);
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});
