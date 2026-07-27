"use client";

/**
 * Izin EFEKTIF milik pengguna, untuk penyaringan tampilan di sisi client.
 *
 * Diangkat keluar dari `sidebar.tsx` (dulu privat di sana) begitu palet perintah
 * ikut membutuhkannya. Alasannya bukan kerapian: kalau palet menyalin logikanya
 * sendiri, suatu saat ia akan menampilkan halaman yang tak ada di menu — atau
 * sebaliknya — dan ketidakcocokan seperti itu justru paling membingungkan
 * (pengguna menemukan pintu yang tak pernah terlihat, lalu dipantulkan penjaga).
 * Satu sumber, dua pemakai.
 *
 * TAMPILAN SAJA. Halaman tujuan tetap dijaga `requirePagePermission` di server;
 * ini hanya menentukan apa yang PANTAS DITAWARKAN. Sebelum jawabannya tiba —
 * atau bila permintaannya gagal — nilainya `undefined` dan pemanggil jatuh ke
 * matriks bawaan `can()`, persis perilaku lama.
 */

import { useEffect, useState } from "react";

/**
 * Satu permintaan dipakai bersama.
 *
 * Sidebar dan palet perintah ter-mount bersamaan di layout yang sama, jadi tanpa
 * ini setiap pemuatan halaman menembak `/api/user/permissions` dua kali untuk
 * jawaban yang identik. Promise-nya disimpan, bukan hasilnya: pemanggil kedua
 * yang datang saat permintaan masih terbang ikut menunggu yang sama.
 *
 * Sengaja TIDAK di-cache selamanya — `null` dipulihkan setelah selesai supaya
 * navigasi berikutnya (mis. sesudah izin diubah di /permissions) tetap membaca
 * keadaan terbaru, seirama dengan TTL 60 detik matriks efektif di server.
 */
let inFlight: Promise<ReadonlySet<string> | undefined> | null = null;

function fetchEffectivePermissions(): Promise<ReadonlySet<string> | undefined> {
  inFlight ??= fetch("/api/user/permissions")
    .then((res) => (res.ok ? res.json() : null))
    .then((data: { permissions?: string[] } | null) =>
      Array.isArray(data?.permissions) ? (new Set(data.permissions) as ReadonlySet<string>) : undefined
    )
    .catch(() => undefined)
    .finally(() => {
      inFlight = null;
    });

  return inFlight;
}

export function useEffectivePermissions(role: string): ReadonlySet<string> | undefined {
  const [allowed, setAllowed] = useState<ReadonlySet<string> | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    fetchEffectivePermissions().then((next) => {
      if (!cancelled && next) setAllowed(next);
    });
    return () => {
      cancelled = true;
    };
  }, [role]);

  return allowed;
}
