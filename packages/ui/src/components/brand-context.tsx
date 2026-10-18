"use client";

/**
 * Alamat logo produk unggahan untuk `BrandMark`. Diisi root layout (server)
 * lewat `RootDocument`: ia membaca metadata logo aktif sekali per permintaan
 * (`@sai/platform/brand-assets`, ber-cache 60 detik, gagal-lunak) dan
 * meneruskannya ke sini, jadi setiap chrome yang memakai `BrandMark` ikut
 * berganti tanpa disentuh satu per satu.
 *
 * `null` = belum ada unggahan, atau platform tak terjangkau: lambang bawaan.
 */
import { createContext, useContext } from "react";

const BrandMarkContext = createContext<string | null>(null);

export function BrandMarkProvider({ src, children }: { src: string | null; children: React.ReactNode }) {
  return <BrandMarkContext.Provider value={src}>{children}</BrandMarkContext.Provider>;
}

export function useBrandMarkSrc(): string | null {
  return useContext(BrandMarkContext);
}
