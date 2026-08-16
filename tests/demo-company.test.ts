/**
 * Perusahaan CONTOH (issue #355) — dua lapis, dan keduanya wajib.
 *
 * Penjaga menjaga BUKUNYA: setiap izin tulis ditolak, di halaman maupun di API.
 * Spanduk menjaga PENGGUNANYA: laporan buku contoh tidak boleh dipercaya
 * sebagai pembukuan sungguhan. Di aplikasi akuntansi lapis kedua justru yang
 * lebih berbahaya bila hilang — tulisan yang ditolak menimbulkan galat yang
 * terlihat, sedangkan angka yang salah dipercaya tidak menimbulkan apa pun, dan
 * bisa dibawa ke rapat, ke bank, atau ke kantor pajak.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { demoWriteRefusal, isWritePermission } from "@/lib/subscription-lifecycle";

const read = (rel: string) => readFileSync(join(__dirname, "..", rel), "utf8");
const src = (rel: string) => read(join("src", rel));
const code = (rel: string) =>
  src(rel).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

describe("penolakan tulis pada buku contoh", () => {
  it("menolak izin TULIS", () => {
    expect(demoWriteRefusal(true, "invoice.write")).not.toBeNull();
    expect(demoWriteRefusal(true, "invoice.write")?.code).toBe("demo_company");
  });

  /*
   * Seluruh guna buku contoh adalah dilihat-lihat — dan pengguna yang ingin
   * membuktikan laporannya sungguhan justru harus bisa MENGEKSPORNYA.
   */
  it("membiarkan baca & ekspor lewat", () => {
    for (const p of ["report.read", "invoice.read", "report.export"]) {
      expect(demoWriteRefusal(true, p), p).toBeNull();
      expect(isWritePermission(p), `${p} seharusnya bukan izin tulis`).toBe(false);
    }
  });

  it("perusahaan biasa tidak tersentuh sama sekali", () => {
    for (const flag of [false, null, undefined]) {
      expect(demoWriteRefusal(flag, "invoice.write"), String(flag)).toBeNull();
    }
  });

  /*
   * Kalimatnya adalah alasan fungsi ini ada, bukan mekanismenya: menumpang
   * `readOnlyRefusal` akan menampilkan "langganan Anda ditangguhkan" pada
   * perusahaan yang justru dibuat untuk menyambut pengguna baru — kalimat yang
   * salah, pada orang yang salah, di menit pertama mereka memakai produknya.
   */
  it("kalimatnya tidak menyebut langganan atau penangguhan", () => {
    const message = demoWriteRefusal(true, "invoice.write")?.message ?? "";
    expect(message.toLowerCase()).not.toContain("ditangguhkan");
    expect(message.toLowerCase()).not.toContain("tagihan");
    expect(message.toLowerCase()).toContain("contoh");
  });
});

describe("kedua penjaga memasang gerbangnya", () => {
  /*
   * WAJIB di kedua tempat. Menutup halamannya saja hanya memindahkan pintu:
   * sebuah POST yang dirakit tangan akan menulis ke buku contoh dengan mulus.
   */
  it("penjaga halaman dan penjaga API sama-sama memanggilnya", () => {
    for (const rel of ["lib/page-auth.ts", "lib/auth-guard.ts"]) {
      expect(code(rel), rel).toContain("demoWriteRefusal(");
      expect(code(rel), rel).toContain("getCompany(");
    }
  });

  /* Di DALAM cabang `isWritePermission`, jadi izin baca tidak membayar query. */
  it("dibaca hanya pada permintaan tulis", () => {
    for (const rel of ["lib/page-auth.ts", "lib/auth-guard.ts"]) {
      const body = code(rel);
      const gate = body.indexOf("isWritePermission(permission)");
      const call = body.indexOf("demoWriteRefusal(");
      expect(gate, rel).toBeGreaterThan(-1);
      expect(call, `${rel}: demoWriteRefusal di luar cabang tulis`).toBeGreaterThan(gate);
    }
  });
});

describe("registry & skema membawa flagnya", () => {
  it("CompanyRecord punya isDemo, dan ketiga query memilihnya", () => {
    const registry = src("lib/company-registry.ts");
    expect(registry).toContain("isDemo: boolean");
    // getCompany + companiesForUser + membershipFor
    expect(registry.match(/isDemo: true/g)?.length ?? 0).toBeGreaterThanOrEqual(3);
  });

  it("kolomnya default FALSE — baris lama tidak berubah arti", () => {
    const schema = read("prisma/control/schema.prisma");
    expect(schema).toContain("isDemo Boolean @default(false) @map(\"is_demo\")");
    const migration = read("prisma/control/migrations/0011_companies_is_demo/migration.sql");
    expect(migration).toContain("NOT NULL DEFAULT FALSE");
  });
});

describe("spanduk di layar", () => {
  it("dirender di TATA LETAK perusahaan, bukan per halaman", () => {
    const layout = src("app/(app)/(dashboard)/t/[tenantSlug]/[companySlug]/layout.tsx");
    expect(layout).toContain("DemoCompanyBanner");
  });

  /*
   * Dibaca dari registry, BUKAN dari sesi: sesi menyimpan keadaan yang bisa
   * basi — perusahaan yang berhenti menjadi demo akan tetap berspanduk sampai
   * token penggunanya diperbarui, dan arah sebaliknya lebih buruk lagi.
   */
  it("membaca registry, tidak menyentuh sesi", () => {
    const banner = code("components/layout/demo-company-banner.tsx");
    expect(banner).toContain("getCompany(");
    expect(banner).not.toContain("auth()");
    expect(banner).not.toContain("session");
  });

  it("perusahaan biasa tidak merender apa pun", () => {
    expect(code("components/layout/demo-company-banner.tsx")).toContain("return null");
  });

  /* `status`, bukan `alert`: keadaan yang berlaku terus-menerus, bukan
     peristiwa mendesak — `alert` akan menyela pembaca layar di setiap
     perpindahan halaman di dalam buku ini. */
  it("dikabarkan sebagai status, bukan alert", () => {
    const banner = code("components/layout/demo-company-banner.tsx");
    expect(banner).toContain('role="status"');
    expect(banner).not.toContain('role="alert"');
  });
});

describe("skrip seed menandai perusahaannya", () => {
  const seed = read("scripts/seed-demo.ts");

  it("menyetel isDemo SETELAH isinya jadi", () => {
    expect(seed).toContain("isDemo: true");
    expect(seed.indexOf("runWithCompany(company")).toBeLessThan(seed.indexOf("isDemo: true"));
  });
});
