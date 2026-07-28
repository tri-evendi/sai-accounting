/**
 * Direktori pengguna — SATU-SATUNYA jembatan dari kode perusahaan ke basis data
 * kendali (issue #104).
 *
 * Sejak `users` pindah ke basis data kendali, kode yang dulu menulis
 * `prisma.user.…` tidak bisa lagi berbuat begitu: `prisma` menunjuk basis data
 * PERUSAHAAN, dan di sana tabel itu sudah tidak ada (migration 0042). Modul ini
 * yang menggantikannya, dan sengaja dijadikan satu pintu supaya jelas di mana
 * saja batas antar-basis-data itu dilewati.
 *
 * ══ SETIAP OPERASI SADAR PERUSAHAAN ════════════════════════════════════════
 * "Daftar pengguna" tidak pernah berarti seluruh pengguna pemasangan. Ia berarti
 * ANGGOTA perusahaan yang sedang dibuka — orang yang punya `membership` aktif di
 * sana. Tanpa aturan ini, halaman Pengguna PT A akan memperlihatkan seluruh
 * karyawan PT B, lengkap dengan nama dan perannya.
 *
 * ══ PERAN MILIK KEANGGOTAAN ════════════════════════════════════════════════
 * `role` yang dikembalikan selalu peran DI PERUSAHAAN INI. Orang yang sama bisa
 * Direktur Utama di satu PT dan Kepala Gudang di PT lain, dan kedua kenyataan
 * itu memang harus hidup berdampingan.
 */

import "server-only";

import { controlDb } from "@/lib/control-db";
import { currentCompanyId } from "@/lib/current-company";

export interface CompanyUser {
  id: number;
  username: string;
  name: string | null;
  /** Peran DI PERUSAHAAN INI (dari `memberships.role`). */
  role: string;
  mustChangePassword: boolean;
  /** Preferensi Mode Akuntan untuk perusahaan ini. NULL = ikut bawaan peran. */
  accountantMode: boolean | null;
  createdAt: Date;
}

function activeCompanyId(): Promise<number> {
  return currentCompanyId();
}

/** Anggota perusahaan yang sedang dibuka, terbaru dulu. */
export async function listCompanyUsers(): Promise<CompanyUser[]> {
  const memberships = await controlDb.membership.findMany({
    where: { companyId: await activeCompanyId(), isActive: true },
    select: {
      role: true,
      accountantMode: true,
      createdAt: true,
      user: { select: { id: true, username: true, name: true, mustChangePassword: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return memberships.map((m) => ({
    id: m.user.id,
    username: m.user.username,
    name: m.user.name,
    role: m.role,
    mustChangePassword: m.user.mustChangePassword,
    accountantMode: m.accountantMode,
    createdAt: m.createdAt,
  }));
}

/** Satu anggota perusahaan ini, atau `null` bila ia bukan anggota. */
export async function findCompanyUser(userId: number): Promise<CompanyUser | null> {
  const membership = await controlDb.membership.findUnique({
    where: { userId_companyId: { userId, companyId: await activeCompanyId() } },
    select: {
      role: true,
      accountantMode: true,
      createdAt: true,
      isActive: true,
      user: { select: { id: true, username: true, name: true, mustChangePassword: true } },
    },
  });
  if (!membership || !membership.isActive) return null;

  return {
    id: membership.user.id,
    username: membership.user.username,
    name: membership.user.name,
    role: membership.role,
    mustChangePassword: membership.user.mustChangePassword,
    accountantMode: membership.accountantMode,
    createdAt: membership.createdAt,
  };
}

/**
 * Nama untuk ditampilkan, dicari sekaligus untuk banyak id.
 *
 * Dipakai layar yang menyebut "ditutup oleh" atau "diminta oleh": kolomnya
 * menyimpan id pengguna GLOBAL tanpa foreign key (FK tak bisa menyeberangi
 * basis data), jadi namanya harus diambil dari sini. Id yang penggunanya sudah
 * dihapus TIDAK muncul di peta hasil — pemanggil menampilkannya sebagai "—",
 * bukan sebagai galat.
 */
export async function userNamesByIds(ids: readonly number[]): Promise<Map<number, string>> {
  const unique = [...new Set(ids.filter((id) => Number.isInteger(id)))];
  if (unique.length === 0) return new Map();

  const users = await controlDb.user.findMany({
    where: { id: { in: unique } },
    select: { id: true, name: true, username: true },
  });

  return new Map(users.map((u) => [u.id, u.name ?? u.username]));
}

/** Nama satu pengguna, atau `null` bila id-nya kosong/tak dikenal. */
export async function userDisplayName(id: number | null | undefined): Promise<string | null> {
  if (id == null) return null;
  return (await userNamesByIds([id])).get(id) ?? null;
}

/** Berapa anggota perusahaan ini yang memegang sebuah peran. */
export async function countUsersWithRole(role: string): Promise<number> {
  return controlDb.membership.count({
    where: { companyId: await activeCompanyId(), role, isActive: true },
  });
}

/** Pindahkan semua anggota perusahaan ini dari satu peran ke peran lain. */
export async function reassignRole(from: string, to: string): Promise<number> {
  const result = await controlDb.membership.updateMany({
    where: { companyId: await activeCompanyId(), role: from },
    data: { role: to },
  });
  return result.count;
}

/** Sudah ada orang dengan username ini di SELURUH pemasangan? */
export async function findUserByUsername(
  username: string
): Promise<{ id: number; username: string; name: string | null } | null> {
  return controlDb.user.findUnique({
    where: { username },
    select: { id: true, username: true, name: true },
  });
}

/**
 * Buat akun baru DAN keanggotaannya di perusahaan yang sedang dibuka.
 *
 * Satu transaksi: akun tanpa keanggotaan adalah akun yang bisa masuk lalu
 * ditolak setiap halaman — keadaan yang membingungkan dan tidak ada gunanya.
 */
export async function createCompanyUser(input: {
  username: string;
  passwordHash: string;
  name?: string | null;
  role: string;
}): Promise<CompanyUser> {
  const companyId = await activeCompanyId();

  const created = await controlDb.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        username: input.username,
        password: input.passwordHash,
        name: input.name ?? null,
        mustChangePassword: true, // akun baru selalu wajib ganti sandi
      },
      select: { id: true, username: true, name: true, mustChangePassword: true },
    });
    const membership = await tx.membership.create({
      data: { userId: user.id, companyId, role: input.role },
      select: { role: true, accountantMode: true, createdAt: true },
    });
    return { user, membership };
  });

  return {
    id: created.user.id,
    username: created.user.username,
    name: created.user.name,
    role: created.membership.role,
    mustChangePassword: created.user.mustChangePassword,
    accountantMode: created.membership.accountantMode,
    createdAt: created.membership.createdAt,
  };
}

/**
 * Tambahkan orang YANG SUDAH ADA sebagai anggota perusahaan ini.
 *
 * Ini jalur yang membuat satu login benar-benar mencakup banyak PT: orangnya
 * tetap satu akun dengan satu kata sandi, hanya keanggotaannya yang bertambah.
 * Keanggotaan yang pernah dinonaktifkan dihidupkan lagi dengan peran baru.
 */
export async function addExistingUserToCompany(
  userId: number,
  role: string
): Promise<CompanyUser | null> {
  const companyId = await activeCompanyId();
  await controlDb.membership.upsert({
    where: { userId_companyId: { userId, companyId } },
    create: { userId, companyId, role },
    update: { role, isActive: true },
  });
  return findCompanyUser(userId);
}

/**
 * Ubah anggota: `name`/`password` menyentuh IDENTITAS (berlaku di semua PT),
 * `role` menyentuh KEANGGOTAAN (hanya PT ini). Perbedaan itu penting dan
 * sengaja dibuat kelihatan di tanda tangan fungsinya.
 *
 * Ganti peran atau reset kata sandi menaikkan `sessionVersion` → sesi berjalan
 * orang itu dicabut pada revalidasi berikutnya (audit RBAC fase 3).
 */
export async function updateCompanyUser(
  userId: number,
  changes: { name?: string | null; passwordHash?: string; role?: string }
): Promise<CompanyUser | null> {
  const companyId = await activeCompanyId();
  const membership = await controlDb.membership.findUnique({
    where: { userId_companyId: { userId, companyId } },
    select: { role: true },
  });
  if (!membership) return null;

  const roleChanged = changes.role !== undefined && changes.role !== membership.role;
  const revokeSessions = roleChanged || changes.passwordHash !== undefined;

  await controlDb.$transaction(async (tx) => {
    if (changes.name !== undefined || changes.passwordHash !== undefined || revokeSessions) {
      await tx.user.update({
        where: { id: userId },
        data: {
          ...(changes.name !== undefined ? { name: changes.name } : {}),
          ...(changes.passwordHash !== undefined
            ? { password: changes.passwordHash, mustChangePassword: true, passDate: null }
            : {}),
          ...(revokeSessions ? { sessionVersion: { increment: 1 } } : {}),
        },
      });
    }
    if (changes.role !== undefined) {
      await tx.membership.update({
        where: { userId_companyId: { userId, companyId } },
        data: { role: changes.role },
      });
    }
  });

  return findCompanyUser(userId);
}

/**
 * Keluarkan seseorang dari perusahaan ini.
 *
 * Yang dihapus adalah KEANGGOTAANNYA, bukan orangnya: ia mungkin masih memegang
 * PT lain, dan menghapus identitasnya dari layar Pengguna satu perusahaan akan
 * mencabut aksesnya ke perusahaan yang sama sekali tidak ada hubungannya —
 * tindakan yang tidak pernah diminta siapa pun. Sesi berjalannya di PT ini mati
 * pada revalidasi berikutnya (`evaluateSession` → `clearCompany`).
 */
export async function removeCompanyUser(
  userId: number
): Promise<{ username: string; role: string } | null> {
  const companyId = await activeCompanyId();
  const membership = await controlDb.membership.findUnique({
    where: { userId_companyId: { userId, companyId } },
    select: { role: true, user: { select: { username: true } } },
  });
  if (!membership) return null;

  await controlDb.membership.delete({
    where: { userId_companyId: { userId, companyId } },
  });

  return { username: membership.user.username, role: membership.role };
}

/** Preferensi Mode Akuntan untuk (pengguna, perusahaan ini). */
export async function setAccountantMode(
  userId: number,
  accountantMode: boolean | null
): Promise<void> {
  await controlDb.membership.update({
    where: { userId_companyId: { userId, companyId: await activeCompanyId() } },
    data: { accountantMode },
  });
}
