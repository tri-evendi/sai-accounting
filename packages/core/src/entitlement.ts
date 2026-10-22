/**
 * ENTITLEMENT: SATU PINTU, DUA SUMBER (lihat docs/arsitektur/01-ARSITEKTUR.md §8).
 *
 * Tiga lapis memutuskan apakah seseorang boleh melakukan sesuatu, dan
 * ketiganya menjawab pertanyaan yang BERBEDA:
 *
 *   1. **Dibeli?**              — lapis ini. Milik PEMASANGAN.
 *   2. **Dipakai perusahaan ini?** — modul usaha (#99), per perusahaan.
 *   3. **Boleh oleh orang ini?**   — matriks izin efektif (#73), per peran/pengguna.
 *
 * Yang membuat lapis 1 berdiri sendiri: ia tidak tahu apa-apa tentang
 * perusahaan maupun pengguna, dan jawabannya sama untuk seluruh pemasangan.
 * Menggabungkannya ke lapis 2 akan membuat "tidak dibeli" dan "dimatikan
 * perusahaan ini" tidak bisa dibedakan — dua keadaan dengan tindakan
 * perbaikan yang sama sekali berbeda (hubungi SAI vs nyalakan di pengaturan).
 *
 * ══ DUA SUMBER, SATU BENTUK ════════════════════════════════════════════════
 * SaaS membacanya dari snapshot paket di basis data KENDALI (`tenants.plan_key`,
 * `max_companies`, `max_users`) — bukan dari `sai_platform`, sebab lapis ini
 * dibaca di jalur panas dan doktrin #137 melarang jalur panas bergantung pada
 * basis data penagihan. On-premise membacanya dari berkas lisensi bertanda
 * tangan. Keduanya menghasilkan bentuk yang sama, jadi pemanggilnya tidak
 * pernah bercabang atas profil.
 *
 * ══ `modules: "all"` ADALAH JALUR SaaS HARI INI ════════════════════════════
 * Paket SaaS membawa BATAS (perusahaan, pengguna), bukan daftar modul: tenant
 * mana pun boleh menyalakan modul mana pun. Karena itu sumber SaaS selalu
 * menjawab `"all"`, dan lapis ini terbukti tidak mengubah perilaku SaaS satu
 * pun — sifat yang disengaja, supaya celah on-premise tidak dibayar dengan
 * risiko di sisi yang sudah berjalan.
 *
 * MURNI: tanpa Prisma, tanpa IO, tanpa `next/*`. Pembacaan berkas dan basis
 * datanya ada di pemanggil.
 */

import type { Licence } from "./licence";

export interface Entitlement {
  /** Dari mana jawabannya datang — dipajang di diagnostik, bukan untuk bercabang. */
  source: "saas" | "licence";
  /** `"all"` = tidak dibatasi daftar. */
  modules: "all" | readonly string[];
  maxCompanies: number;
  maxUsers: number;
  /** ISO-8601 atau `null`. Lewatnya tanggal ini TIDAK memblokir apa pun. */
  supportEndsAt: string | null;
  maxVersion: string | null;
}

/** Entitlement pemasangan SaaS, dari snapshot paket di basis data kendali. */
export function entitlementFromPlan(tenant: {
  maxCompanies: number;
  maxUsers: number;
}): Entitlement {
  return {
    source: "saas",
    modules: "all",
    maxCompanies: tenant.maxCompanies,
    maxUsers: tenant.maxUsers,
    supportEndsAt: null,
    maxVersion: null,
  };
}

/** Entitlement pemasangan on-premise, dari berkas lisensi yang SUDAH diverifikasi. */
export function entitlementFromLicence(licence: Licence): Entitlement {
  return {
    source: "licence",
    modules: licence.modules,
    maxCompanies: licence.maxCompanies,
    maxUsers: licence.maxUsers,
    supportEndsAt: licence.supportEndsAt,
    maxVersion: licence.maxVersion,
  };
}

/**
 * Irisan modul AKTIF perusahaan dengan modul yang DILISENSIKAN.
 *
 * Masukannya himpunan yang sudah diurai pemanggil — bukan nilai mentah kolom,
 * dan bukan `null`. Itu disengaja: aturan "kosong berarti apa" milik lapis
 * modul (#99, termasuk modul opt-in yang TIDAK ikut bawaan), dan menyalinnya ke
 * sini akan melahirkan dua tempat yang memutuskan hal yang sama. Lisensi hanya
 * boleh MENYEMPITKAN apa yang sudah aktif, tidak pernah menambah — pemasangan
 * yang lisensinya memuat sebuah modul opt-in tetap harus menyalakannya sendiri.
 *
 * @returns daftar modul efektif, selalu subset dari `aktif`.
 */
export function intersectModules(
  entitlement: Entitlement,
  aktif: readonly string[]
): readonly string[] {
  if (entitlement.modules === "all") return aktif;
  const dilisensikan = new Set(entitlement.modules);
  return aktif.filter((m) => dilisensikan.has(m));
}

/** Apakah satu modul dicakup lisensi/paket pemasangan ini? */
export function moduleLicensed(entitlement: Entitlement, module: string): boolean {
  return entitlement.modules === "all" || entitlement.modules.includes(module);
}

/**
 * Apakah batas pemasangan sudah terlampaui?
 *
 * Dilaporkan, TIDAK ditegakkan dengan memblokir. Pemasangan yang melewati batas
 * biasanya melewatinya karena tumbuh, dan membuat PT ke-empat gagal dibuat di
 * tengah hari kerja — di produk yang pembukuannya sudah berjalan — mengubah
 * urusan dagang menjadi pemadaman. Penegakan yang benar terjadi di titik
 * PEMBUATAN, dengan pesan yang menyebut angka dan menawarkan jalan keluar.
 */
export function overLimit(
  entitlement: Entitlement,
  pakai: { companies: number; users: number }
): { companies: boolean; users: boolean } {
  return {
    companies: pakai.companies > entitlement.maxCompanies,
    users: pakai.users > entitlement.maxUsers,
  };
}

/**
 * Batas yang berlaku di titik PEMBUATAN perusahaan / pengguna baru.
 *
 * Satu pintu untuk dua sumber, dan keduanya menjawab pertanyaan yang sama
 * dengan lingkup berbeda:
 *
 *   • **SaaS** — snapshot paket di baris tenant itu sendiri (`tenants.max_*`),
 *     dihitung PER TENANT. Persis perilaku sebelum pintu ini ada; angka paket
 *     di `Entitlement` SaaS diabaikan, sebab ia dibaca dari satu baris tenant
 *     sembarang dan bukan milik tenant yang sedang membuat.
 *   • **Lisensi (on-premise)** — angka lisensi, dihitung atas SELURUH
 *     pemasangan: lisensi dijual per mesin, bukan per baris tenant. Angka
 *     `tenants.max_*` di sana sisa pendaftaran dan tidak berarti apa-apa.
 *
 * Yang dibatasi hanya PEMBUATAN yang baru. Perusahaan dan pengguna yang sudah
 * ada tidak pernah disentuh — lihat `overLimit` dan kepala `licence.ts`.
 */
export interface CreationQuota {
  maxCompanies: number;
  maxUsers: number;
  /** `tenant` = hitung milik tenant ini; `installation` = hitung semua. */
  scope: "tenant" | "installation";
  source: Entitlement["source"];
}

export function creationQuota(
  entitlement: Entitlement,
  tenant: { maxCompanies: number; maxUsers: number }
): CreationQuota {
  if (entitlement.source === "saas") {
    return {
      maxCompanies: tenant.maxCompanies,
      maxUsers: tenant.maxUsers,
      scope: "tenant",
      source: "saas",
    };
  }
  return {
    maxCompanies: entitlement.maxCompanies,
    maxUsers: entitlement.maxUsers,
    scope: "installation",
    source: "licence",
  };
}
