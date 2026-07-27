/**
 * Peran sebagai DATA (tabel `roles`, migration 0031) — akses baca + label.
 *
 * Sumber kebenaran daftar peran kini DB, bukan enum `ROLE_VALUES` di kode.
 * `ROLE_VALUES`/`ROLE_LABELS` tinggal fallback untuk peran SISTEM
 * dan untuk konteks yang belum async (mis. tes murni). UI (kolom /permissions,
 * pemilih peran user & approver) membaca dari sini agar peran kustom muncul.
 *
 * CRUD peran + guard-nya (tak boleh hapus peran sistem / peran yang masih
 * dipakai) hidup di fase berikutnya; modul ini fokus baca.
 */
import { prisma } from "@/lib/prisma";
import { ROLE_LABELS } from "@/lib/constants";

export interface RoleRecord {
  key: string;
  label: string;
  isSystem: boolean;
  isActive: boolean;
}

/** Semua peran (aktif & nonaktif), urut sistem-dulu lalu abjad label. */
export async function getRoles(client = prisma): Promise<RoleRecord[]> {
  const rows = await client.role.findMany({
    select: { key: true, label: true, isSystem: true, isActive: true },
    // Peran sistem dulu (urut pembuatan: managing_director, finance_manager,
    // warehouse_head, administrator), lalu peran kustom
    // urut pembuatan — tata urut yang stabil & familiar bagi pengguna.
    orderBy: [{ isSystem: "desc" }, { id: "asc" }],
  });
  return rows;
}

/** Peran AKTIF saja — untuk pemilih peran (buat/ubah user, approver). */
export async function getActiveRoles(client = prisma): Promise<RoleRecord[]> {
  return (await getRoles(client)).filter((r) => r.isActive);
}

/** Kunci peran aktif — untuk validasi (mis. role saat membuat user). */
export async function activeRoleKeys(client = prisma): Promise<string[]> {
  return (await getActiveRoles(client)).map((r) => r.key);
}

/**
 * Label satu peran dari daftar yang sudah dimuat; fallback ke `ROLE_LABELS`
 * (peran sistem) lalu ke key mentah. Sinkron — beri `roles` hasil `getRoles()`.
 */
export function roleLabelFrom(roles: RoleRecord[], key: string): string {
  return roles.find((r) => r.key === key)?.label ?? ROLE_LABELS[key] ?? key;
}
