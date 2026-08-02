"use client";

/**
 * MENJAGA SESI SEJALAN DENGAN URL (issue #157) — dan kenapa ia harus ada
 * SEKARANG, bukan nanti bersama #158.
 *
 * Setelah issue ini, HALAMAN mengambil perusahaannya dari jalur URL. ROUTE API
 * belum: `/api/invoices` masih menanyakannya ke sesi, dan itu baru berubah di
 * #158. Selama jeda itu ada satu keadaan yang berbahaya justru karena ia tidak
 * terlihat:
 *
 *   Halaman `/t/acme/cv-maju/invoices` dibuka lewat tautan yang dibagikan,
 *   sementara sesi orang itu terakhir membuka `pt-sejahtera`. Yang TERBACA di
 *   layar adalah buku CV Maju — server merendernya dari jalur, dan itu benar.
 *   Tapi tombol "Simpan" di halaman yang sama memanggil `/api/invoices`, yang
 *   membaca sesi, dan menulis ke buku PT Sejahtera.
 *
 * Itu persis kegagalan yang dilarang docs/MULTI-COMPANY.md — hanya saja ia
 * masuk lewat antarmuka. MEMINDAHKAN perusahaan ke URL tanpa menutup jeda ini
 * bukan perbaikan, melainkan pemindahan letak salahnya.
 *
 * ══ CARANYA: MENAHAN, BUKAN MEMPERINGATKAN ═════════════════════════════════
 * Komponen ini menyamakan cookie sesi dengan perusahaan di jalur, dan SELAMA
 * keduanya belum sama ia TIDAK MERENDER isi halaman. Bukan spanduk peringatan,
 * bukan tulisan kecil: tidak ada tombol, tidak ada formulir, tidak ada satu pun
 * elemen yang bisa ditekan sebelum sesinya benar. Peringatan bisa diabaikan;
 * tombol yang tidak ada tidak bisa ditekan.
 *
 * Render SERVER halaman ini tidak menunggu apa pun — penjaga sudah menambal
 * peran & konteks dari jalur (`page-auth.ts`), jadi yang tertahan hanyalah
 * kemunculan permukaan INTERAKTIF-nya, sepersekian detik sekali per perpindahan.
 *
 * ══ KENAPA DI SINI, DI `src/components` ════════════════════════════════════
 * Ia membaca `session.user.companyId` — satu-satunya pembacaan yang justru
 * TUGASNYA membandingkan sesi dengan kebenaran, bukan mempercayainya. Ia tidak
 * pernah dipakai untuk query; nilainya hanya dibandingkan dengan angka dari
 * jalur, lalu ditimpa.
 *
 * Setelah #158 mendarat (route API mengambil perusahaan dari jalurnya sendiri),
 * penahanan ini tidak lagi menjaga apa-apa dan komponen ini boleh menyusut
 * menjadi penyegar cookie biasa — atau hilang sama sekali.
 */

import { useEffect, useRef } from "react";
import { useSession } from "next-auth/react";

import { PageLoader } from "@/components/ui/loading";
import { useT } from "@/lib/i18n/client";

export function CompanySessionSync({
  companyId,
  children,
}: {
  companyId: number;
  children: React.ReactNode;
}) {
  const { data: session, status, update } = useSession();
  const t = useT();
  const requested = useRef<number | null>(null);

  const active = session?.user?.companyId ?? null;
  const synced = active === companyId;

  useEffect(() => {
    if (status !== "authenticated" || synced) return;
    /*
     * Satu permintaan per perusahaan tujuan. Tanpa penjaga ini, `update()` yang
     * menerbitkan sesi baru akan memicu efek ini lagi, dan seterusnya — dan
     * bila keanggotaannya DITOLAK di server (callback `jwt` mengabaikan
     * permintaan untuk PT yang bukan haknya), sesi tidak akan pernah cocok:
     * loop tak berujung yang membombardir server. Kalau permintaannya diabaikan,
     * yang benar adalah tetap menahan — halaman itu memang bukan haknya, dan
     * penjaga server sudah menjawabnya 404 pada muat berikutnya.
     */
    if (requested.current === companyId) return;
    requested.current = companyId;
    void update({ companyId });
  }, [status, synced, companyId, update]);

  if (!synced) return <PageLoader message={t("common.enteringCompany")} />;

  return <>{children}</>;
}
