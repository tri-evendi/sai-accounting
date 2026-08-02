"use client";

/**
 * Sisi CLIENT dari identitas perusahaan.
 *
 * Komponen client tidak boleh menyentuh Prisma (lihat
 * `tests/server-only-boundary.test.ts` — persis kesalahan yang menggagalkan
 * build produksi 2026-07-26), jadi identitasnya diambil sekali lewat
 * `GET /api/company/identity` lalu dibagikan melalui context. Polanya meniru
 * sidebar yang mengambil `/api/user/permissions` saat dimuat.
 *
 * Sengaja BUKAN dibaca di server lalu dioper sebagai prop: pemakainya tersebar
 * (tombol PDF di banyak halaman, kulit halaman masuk, halaman pengaturan), dan
 * mengalirkan prop lewat semuanya berarti menyentuh berkas yang sedang
 * dikerjakan orang lain. Context menjaga perubahannya tetap sempit.
 *
 * Sebelum jawaban tiba — dan bila permintaannya gagal — yang dipakai adalah
 * nilai cadangan dari `constants.ts`, jadi tidak pernah ada layar kosong atau
 * dokumen tanpa kepala surat.
 */

import { createContext, useContext, useEffect, useState } from "react";
import { usePathname } from "next/navigation";

import { COMPANY_ADDRESS, COMPANY_NAME } from "@/lib/constants";
import { apiFetch } from "@/lib/api-fetch";
import { parseTenantPath } from "@/lib/tenant-routes";

export interface CompanyIdentity {
  name: string;
  address: string;
}

const FALLBACK: CompanyIdentity = { name: COMPANY_NAME, address: COMPANY_ADDRESS };

const CompanyIdentityContext = createContext<CompanyIdentity>(FALLBACK);

export function CompanyIdentityProvider({ children }: { children: React.ReactNode }) {
  const [identity, setIdentity] = useState<CompanyIdentity>(FALLBACK);
  const pathname = usePathname();
  const parsed = pathname ? parseTenantPath(pathname) : null;
  const scope = parsed ? `${parsed.tenantSlug}/${parsed.companySlug}` : "";

  /*
   * Dibaca ulang setiap kali PERUSAHAAN di alamat berganti (issue #158).
   *
   * Provider ini terpasang di tata letak, dan tata letak bertahan lintas
   * navigasi klien — dengan `[]` sebagai kebergantungan, nama & alamat PT yang
   * pertama dibuka akan tercetak di kepala dokumen PT berikutnya. Itu bukan
   * kesalahan tampilan: kepala surat yang salah pada faktur adalah dokumen yang
   * salah.
   */
  useEffect(() => {
    let active = true;
    apiFetch("/api/company/identity")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!active || !data) return;
        const name = typeof data.name === "string" ? data.name.trim() : "";
        const address = typeof data.address === "string" ? data.address.trim() : "";
        // Jawaban server dipakai APA ADANYA. Server sengaja mengirim alamat
        // KOSONG saat wizard perusahaan belum diisi (`pickIdentity`): alamat
        // di dokumen resmi bukan hiasan, dan menambal kekosongan itu dengan
        // konstanta pemasang pertama akan mencetak alamat PT lain di kepala
        // faktur PT ini. Cadangan konstanta hanya untuk permintaan yang GAGAL.
        setIdentity({
          name: name || FALLBACK.name,
          address,
        });
      })
      .catch(() => {
        /* Diamkan: nilai cadangan sudah terpasang sejak awal. */
      });
    return () => {
      active = false;
    };
  }, [scope]);

  return (
    <CompanyIdentityContext.Provider value={identity}>
      {children}
    </CompanyIdentityContext.Provider>
  );
}

/** Identitas perusahaan untuk komponen client. Selalu mengembalikan nilai. */
export function useCompanyIdentity(): CompanyIdentity {
  return useContext(CompanyIdentityContext);
}
