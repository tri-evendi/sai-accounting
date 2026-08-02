"use client";

/**
 * MENCATAT PERUSAHAAN YANG TERAKHIR DIBUKA ke sesi (issue #157, disusutkan #158).
 *
 * ══ APA YANG DULU IA KERJAKAN, DAN KENAPA TIDAK LAGI ═══════════════════════
 * Di #157 komponen ini adalah PENAHAN: selama cookie sesi belum menunjuk
 * perusahaan yang sama dengan jalur, ia tidak merender isi halaman sama sekali.
 * Alasannya nyata — route API waktu itu masih mengambil perusahaannya dari
 * sesi, jadi halaman `/t/acme/cv-maju/invoices` yang dibuka lewat tautan dalam
 * bisa MENAMPILKAN buku CV Maju sementara tombol "Simpan"-nya menulis ke PT
 * yang terakhir dibuka. Menahan tombolnya adalah satu-satunya cara jujur
 * menutup jeda itu: peringatan bisa diabaikan, tombol yang tidak ada tidak
 * bisa ditekan.
 *
 * Sejak #158 jedanya tidak ada lagi. Setiap panggilan API membawa perusahaannya
 * sendiri (`apiFetch` → header, atau jalur untuk unduhan), penjaga API
 * memvalidasinya ke keanggotaan pada permintaan itu juga, dan sesi TIDAK punya
 * suara sama sekali tentang buku mana yang ditulis. Menahan permukaan halaman
 * karena sebuah cookie belum menyusul kini hanya memperlambat setiap
 * perpindahan perusahaan demi keamanan yang sudah dijamin di tempat lain — dan
 * "loader sepersekian detik yang tidak menjaga apa-apa" adalah biaya yang
 * dibayar pengguna untuk ketenangan yang tidak ia butuhkan.
 *
 * ══ YANG TERSISA, DAN KENAPA MASIH ADA ═════════════════════════════════════
 * Sesi turun pangkat menjadi CATATAN "yang terakhir dibuka", dan catatan itu
 * masih dipakai tiga pihak yang tidak punya perusahaan di alamatnya:
 *   • `/dashboard` telanjang — tujuan bawaan seluruh aplikasi, yang harus
 *     memilih perusahaan mana yang dibuka;
 *   • `proxy.ts` — memantulkan jalur lama ke jalur kanonik dengan slug dari
 *     token (tanpa slug, tidak ada pantulan);
 *   • `/select-company` — menandai yang terakhir dibuka.
 * Karena itu komponen ini tetap menyamakan cookie dengan jalur — DIAM-DIAM, di
 * latar, tanpa menahan apa pun. Bila permintaannya diabaikan server (sesi untuk
 * PT yang bukan haknya), yang terjadi hanyalah catatan itu tidak diperbarui;
 * halamannya sendiri sudah dijaga 404 oleh `requirePagePermission`.
 */

import { useEffect, useRef } from "react";
import { useSession } from "next-auth/react";

export function CompanySessionSync({ companyId }: { companyId: number }) {
  const { data: session, status, update } = useSession();
  const requested = useRef<number | null>(null);

  const synced = (session?.user?.companyId ?? null) === companyId;

  useEffect(() => {
    if (status !== "authenticated" || synced) return;
    /*
     * Satu permintaan per perusahaan tujuan. Tanpa penjaga ini, `update()` yang
     * menerbitkan sesi baru akan memicu efek ini lagi, dan seterusnya — dan
     * bila keanggotaannya DITOLAK di server (callback `jwt` mengabaikan
     * permintaan untuk PT yang bukan haknya), sesi tidak akan pernah cocok:
     * loop tak berujung yang membombardir server.
     */
    if (requested.current === companyId) return;
    requested.current = companyId;
    void update({ companyId });
  }, [status, synced, companyId, update]);

  return null;
}
