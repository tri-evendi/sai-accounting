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
import { usePathname } from "next/navigation";

import { apiFetch } from "@/lib/api-fetch";
import { parseTenantPath } from "@/lib/tenant-routes";

/**
 * Satu permintaan dipakai bersama — DIKUNCI PER PERUSAHAAN (issue #158).
 *
 * Sidebar dan palet perintah ter-mount bersamaan di layout yang sama, jadi tanpa
 * ini setiap pemuatan halaman menembak `/api/user/permissions` dua kali untuk
 * jawaban yang identik. Promise-nya disimpan, bukan hasilnya: pemanggil kedua
 * yang datang saat permintaan masih terbang ikut menunggu yang sama.
 *
 * Kuncinya perusahaan, bukan sekadar "ada permintaan terbang": izin efektif
 * adalah nilai PER PERUSAHAAN (peran berbeda, modul berbeda, override berbeda).
 * Satu promise bersama tanpa kunci akan menyerahkan jawaban PT A kepada tab yang
 * sedang membuka PT B — aturan cache per-companyId di docs/MULTI-COMPANY.md,
 * hanya saja di sisi klien.
 *
 * Sengaja TIDAK di-cache selamanya — entrinya dibuang setelah selesai supaya
 * navigasi berikutnya (mis. sesudah izin diubah di /permissions) tetap membaca
 * keadaan terbaru, seirama dengan TTL 60 detik matriks efektif di server.
 */
const inFlight = new Map<string, Promise<ReadonlySet<string> | undefined>>();

function fetchEffectivePermissions(scope: string): Promise<ReadonlySet<string> | undefined> {
  const pending = inFlight.get(scope);
  if (pending) return pending;

  const request = apiFetch("/api/user/permissions")
    .then((res) => (res.ok ? res.json() : null))
    .then((data: { permissions?: string[] } | null) =>
      Array.isArray(data?.permissions) ? (new Set(data.permissions) as ReadonlySet<string>) : undefined
    )
    .catch(() => undefined)
    .finally(() => {
      inFlight.delete(scope);
    });

  inFlight.set(scope, request);
  return request;
}

export function useEffectivePermissions(role: string): ReadonlySet<string> | undefined {
  const [allowed, setAllowed] = useState<ReadonlySet<string> | undefined>(undefined);
  const pathname = usePathname();
  const parsed = pathname ? parseTenantPath(pathname) : null;
  const scope = parsed ? `${parsed.tenantSlug}/${parsed.companySlug}` : "";

  /*
   * `scope` ikut menentukan kapan dibaca ulang. Peran saja tidak cukup:
   * seseorang bisa `staff` di dua PT sekaligus, dan tanpa `scope` di sini
   * berpindah antar keduanya tidak memicu pembacaan apa pun — menu PT lama
   * bertahan di layar PT baru, menawarkan pintu yang penjaganya akan tolak.
   */
  useEffect(() => {
    let cancelled = false;
    fetchEffectivePermissions(scope).then((next) => {
      if (!cancelled && next) setAllowed(next);
    });
    return () => {
      cancelled = true;
    };
  }, [role, scope]);

  return allowed;
}
