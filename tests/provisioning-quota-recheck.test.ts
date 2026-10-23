/**
 * PENJAGA: kuota PT diperiksa ULANG oleh pekerja `company.provision`, sebelum
 * basis data dibuat.
 *
 * Sejak penyediaan pindah ke antrean (#714) hitungan PT tenant bertambah saat
 * pekerjaannya SELESAI. N permintaan berslug berbeda yang antre sebelum yang
 * pertama selesai semuanya lolos pemeriksaan route — kuota terlampaui tanpa
 * galat. Penjaga ini menahan tiga hal: pemeriksaan di pekerja ADA dan berdiri
 * SEBELUM `provisionCompany`; route dan pekerja membaca lewat SATU fungsi
 * (dua salinan aturan kuota menyimpang tanpa galat); dan penolakannya
 * berujung kalimat pengguna, bukan `companies.errFailed`.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  decodeProvisionFailure,
  encodeProvisionFailure,
  provisionErrorMessage,
  ProvisionError,
} from "@/lib/company-provisioning-shared";
import { AKAR_REPO } from "./akar-sumber";

const baca = (rel: string) => readFileSync(join(AKAR_REPO, rel), "utf8");

describe("pekerja memeriksa ulang sebelum CREATE DATABASE", () => {
  const pekerja = baca("workers/company-provision.ts");

  it("memanggil provisioningVerdict SEBELUM provisionCompany(", () => {
    const cek = pekerja.indexOf("await provisioningVerdict(tenantId)");
    const buat = pekerja.indexOf("await provisionCompany(");
    expect(cek).toBeGreaterThan(-1);
    expect(buat).toBeGreaterThan(cek);
  });

  it("route dan pekerja memakai pembacaan yang SAMA", () => {
    const route = baca("src/app/api/companies/route.ts");
    expect(route).toMatch(/await provisioningVerdict\(result\.tenant\.tenantId\)/);
    /* Tidak ada salinan kedua aturan kuota di route. */
    expect(route).not.toMatch(/controlDb\.company\.count/);
  });
});

describe("penolakan di pekerja terbaca sebagai kalimat pengguna", () => {
  it.each([
    ["company_quota_reached", "errors.companyQuotaReached"],
    ["company_licence_limit_reached", "errors.companyLicenceLimitReached"],
    ["tenant_not_active", "errors.tenantNotActive"],
  ] as const)("%s → %s, juga sesudah menyeberang baris `jobs`", (kode, kunci) => {
    const e = new ProvisionError("ditolak", "validate", { code: kode, values: { max: 3 } });
    expect(provisionErrorMessage(e).key).toBe(kunci);
    const terurai = decodeProvisionFailure(encodeProvisionFailure(e));
    expect(terurai.code).toBe(kode);
    expect(terurai.values.max).toBe(3);
  });
});
