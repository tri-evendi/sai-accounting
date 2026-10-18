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
 *
 * LOGO (migration company 0002): jawaban identitas memuat metadata logo
 * (`logo.version` = 16 karakter awal sidiknya). Gambarnya diambil SESUDAH itu
 * dari `/api/t/{tenant}/{company}/company-logo?v=...`, yang disajikan
 * `immutable`: satu unduhan per versi per peramban, bukan per muatan halaman.
 * Tombol PDF menerima logo itu lewat `company.logo` tanpa disentuh satu per
 * satu. Sebelum gambarnya tiba, PDF dicetak tanpa logo.
 *
 * Halaman pengaturan memanggil `useReloadCompanyIdentity()` sesudah menyimpan
 * nama atau logo, supaya dokumen berikutnya langsung memakai yang baru.
 */

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { usePathname } from "next/navigation";

import { COMPANY_ADDRESS, COMPANY_NAME } from "@sai/core/constants";
import { apiFetch } from "@/lib/api-fetch";
import { parseTenantPath } from "@sai/core/tenant-routes";
import type { PdfCompanyLogo } from "@/lib/pdf/company-header";

/** Metadata logo dari `/api/company/identity` — tanpa isi berkasnya. */
export interface CompanyLogoInfo {
  version: string;
  mimeType: string;
  width: number;
  height: number;
}

export interface CompanyIdentity {
  name: string;
  address: string;
  /** Metadata logo aktif, atau `null` bila PT belum mengunggah logo. */
  logoInfo: CompanyLogoInfo | null;
  /** Logo siap-cetak untuk PDF; `null` sampai gambarnya selesai dimuat. */
  logo: PdfCompanyLogo | null;
}

const FALLBACK: CompanyIdentity = { name: COMPANY_NAME, address: COMPANY_ADDRESS, logoInfo: null, logo: null };

const CompanyIdentityContext = createContext<CompanyIdentity>(FALLBACK);
const ReloadContext = createContext<() => void>(() => {});

/** URL gambar logo perusahaan untuk lingkup `tenant/company`. */
export function companyLogoUrl(scope: string, version: string): string {
  return `/api/t/${scope}/company-logo?v=${version}`;
}

function parseLogoInfo(raw: unknown): CompanyLogoInfo | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.version !== "string" || typeof o.mimeType !== "string") return null;
  if (typeof o.width !== "number" || typeof o.height !== "number") return null;
  return { version: o.version, mimeType: o.mimeType, width: o.width, height: o.height };
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

export function CompanyIdentityProvider({ children }: { children: React.ReactNode }) {
  const [identity, setIdentity] = useState<CompanyIdentity>(FALLBACK);
  const [generation, setGeneration] = useState(0);
  const pathname = usePathname();
  const parsed = pathname ? parseTenantPath(pathname) : null;
  const scope = parsed ? `${parsed.tenantSlug}/${parsed.companySlug}` : "";

  /*
   * Diambil ulang setiap kali LINGKUP berganti (pindah perusahaan) dan setiap
   * kali `reload()` dipanggil — bukan setiap navigasi. Logo diambil dalam
   * rantai yang sama, jadi jawaban lingkup lama tidak pernah menimpa yang baru.
   */
  useEffect(() => {
    let active = true;
    apiFetch("/api/company/identity")
      .then((res) => (res.ok ? res.json() : null))
      .then(async (data) => {
        if (!active || !data) return;
        const name = typeof data.name === "string" ? data.name.trim() : "";
        const address = typeof data.address === "string" ? data.address.trim() : "";
        const logoInfo = scope ? parseLogoInfo(data.logo) : null;
        const base = { name: name || FALLBACK.name, address, logoInfo };
        setIdentity({ ...base, logo: null });
        if (!logoInfo) return;
        const res = await apiFetch(companyLogoUrl(scope, logoInfo.version));
        if (!active || !res.ok) return;
        const dataUrl = await blobToDataUrl(await res.blob());
        if (!active) return;
        setIdentity({
          ...base,
          logo: {
            dataUrl,
            format: logoInfo.mimeType === "image/png" ? "PNG" : "JPEG",
            width: logoInfo.width,
            height: logoInfo.height,
          },
        });
      })
      .catch(() => {
        /* Diamkan: nilai cadangan sudah terpasang sejak awal, dan PDF tanpa logo tetap sah. */
      });
    return () => {
      active = false;
    };
  }, [scope, generation]);

  const reload = useCallback(() => setGeneration((g) => g + 1), []);

  return (
    <ReloadContext.Provider value={reload}>
      <CompanyIdentityContext.Provider value={identity}>{children}</CompanyIdentityContext.Provider>
    </ReloadContext.Provider>
  );
}

export function useCompanyIdentity(): CompanyIdentity {
  return useContext(CompanyIdentityContext);
}

/** Muat ulang identitas & logo — dipanggil sesudah pengaturan perusahaan disimpan. */
export function useReloadCompanyIdentity(): () => void {
  return useContext(ReloadContext);
}
