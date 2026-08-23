/**
 * Server surel MILIK TENANT — pembacaan, penyimpanan, dan penyelesaiannya.
 *
 * ══ MASALAH YANG DIBERESKANNYA ══════════════════════════════════════════════
 * Sampai sekarang hanya ada SATU konfigurasi surel untuk seluruh pemasangan
 * (`mail_settings` di `sai_platform`, #169). Itu benar untuk surel yang datang
 * DARI KAMI, dan salah untuk surel yang berangkat ATAS NAMA PELANGGAN: faktur
 * dan pengingat jatuh tempo yang dikirim PT pelanggan kepada pelanggannya
 * sendiri seharusnya keluar dari alamat PT itu, bukan dari `no-reply` kami.
 *
 * Akibat konkretnya bukan soal estetika. Surel tagihan yang tiba dari domain
 * pihak ketiga jauh lebih sering mendarat di folder spam, tidak bisa dibalas,
 * dan tidak menumpuk di percakapan yang sama dengan surat-surat sebelumnya
 * antara penjual dan pembelinya.
 *
 * ══ TIGA LAPIS, DAN URUTANNYA MENENTUKAN ═══════════════════════════════════
 *   1. **Tenant** (tabel ini) — dipakai surel yang berangkat atas nama
 *      pelanggan.
 *   2. **Penyedia** (`mail_settings`, platform) — cadangan bagi tenant yang
 *      belum mengisi apa pun, DAN satu-satunya jalur bagi surel milik kami.
 *   3. **Environment** — cadangan terakhir.
 *
 * ══ ⚠ CACHE DIKUNCI PER TENANT ═════════════════════════════════════════════
 * Ini bagian paling berbahaya di seluruh berkas. `mail-settings.ts` boleh
 * memakai satu cache global justru karena isinya milik PENYEDIA — dan
 * komentarnya mengatakan itu dengan tegas. Di sini isinya milik SATU penyewa,
 * jadi aturan cache #104 berlaku penuh: satu cache global di sini berarti
 * faktur tenant B berangkat lewat server surel tenant A, dengan alamat
 * pengirim tenant A — kebocoran identitas yang tidak menerbitkan satu galat
 * pun dan hanya terlihat oleh penerimanya.
 *
 * ══ KATA SANDI ═════════════════════════════════════════════════════════════
 * Yang tersimpan hanya segel AES-256-GCM. Kata sandi mentah hanya pernah ada
 * di dua tempat: isian form saat seseorang mengetiknya, dan memori proses saat
 * pesan dikirim. Ia tidak pernah keluar lewat `tenantMailView()`, tidak pernah
 * masuk jejak audit, dan tidak pernah ikut ke pesan galat.
 *
 * TANPA `server-only`: penjadwal `tsx` di luar Next mengirim pengingat, dan
 * karena itu harus bisa memuat modul ini (preseden `mailer-core.ts`).
 */

import { controlDb } from "@/lib/control-db";
import {
  EncryptionKeyError,
  openSecret,
  sealSecret,
  type SealedSecret,
} from "@/lib/settings-crypto";
import type { MailConfig } from "@/lib/mailer-core";
import type { MailTransport } from "@/lib/mail-settings";

/** Baris apa adanya — TERMASUK segel kata sandi. Internal. */
export interface TenantMailRow {
  transport: string;
  host: string | null;
  port: number | null;
  username: string | null;
  fromAddress: string | null;
  passwordCiphertext: string | null;
  passwordIv: string | null;
  passwordTag: string | null;
  archiveAddress: string | null;
  lastTestAt: Date | null;
  lastTestTo: string | null;
  lastTestStatus: string | null;
  lastTestMessage: string | null;
  updatedBy: string;
  updatedAt: Date;
}

/** Bentuk aman untuk layar & API — TANPA satu pun jejak kata sandi. */
export interface TenantMailView {
  transport: MailTransport;
  host: string;
  port: number | null;
  username: string;
  fromAddress: string;
  archiveAddress: string;
  /** Apakah ADA kata sandi tersimpan. Nilainya tidak pernah ikut. */
  hasPassword: boolean;
  lastTestAt: Date | null;
  lastTestTo: string | null;
  lastTestStatus: string | null;
  lastTestMessage: string | null;
}

function normalizeTransport(value: string | null | undefined): MailTransport {
  return value === "smtp" ? "smtp" : "file";
}

export function tenantMailView(row: TenantMailRow | null): TenantMailView {
  return {
    transport: normalizeTransport(row?.transport),
    host: row?.host ?? "",
    port: row?.port ?? null,
    username: row?.username ?? "",
    fromAddress: row?.fromAddress ?? "",
    archiveAddress: row?.archiveAddress ?? "",
    hasPassword: Boolean(row?.passwordCiphertext && row.passwordIv && row.passwordTag),
    lastTestAt: row?.lastTestAt ?? null,
    lastTestTo: row?.lastTestTo ?? null,
    lastTestStatus: row?.lastTestStatus ?? null,
    lastTestMessage: row?.lastTestMessage ?? null,
  };
}

/** Kata sandi tersimpan, dibuka. `null` = tidak ada / kunci enkripsi hilang. */
function storedPassword(row: TenantMailRow): string | null {
  if (!row.passwordCiphertext || !row.passwordIv || !row.passwordTag) return null;
  const sealed: SealedSecret = {
    ciphertext: row.passwordCiphertext,
    iv: row.passwordIv,
    tag: row.passwordTag,
  };
  try {
    return openSecret(sealed);
  } catch (error) {
    /* Kunci enkripsi yang berubah/hilang TIDAK boleh meruntuhkan jalur surel —
       ia hanya berarti kata sandi ini tak terbaca, dan pengirimannya akan
       gagal dengan pesan dari server SMTP-nya sendiri, yang justru lebih
       informatif daripada tumpukan galat kripto. */
    if (error instanceof EncryptionKeyError) return null;
    return null;
  }
}

/* ── Cache, DIKUNCI PER TENANT ──────────────────────────────────────────────── */

const TTL_MS = 60_000;

/**
 * Peta tenantId → baris. BUKAN satu variabel: lihat catatan di kepala berkas —
 * satu slot bersama adalah cara termudah faktur satu pelanggan berangkat lewat
 * server surel pelanggan lain.
 */
const cache = new Map<number, { at: number; row: TenantMailRow | null }>();

/** Buang cache satu tenant (dipanggil setelah menyimpan), atau seluruhnya. */
export function dropTenantMailCache(tenantId?: number): void {
  if (tenantId === undefined) cache.clear();
  else cache.delete(tenantId);
}

/**
 * Baris tenant, dengan cache pendek.
 *
 * MENELAN galat dan menjawab `null` — yang bagi penyelesai berarti "tenant ini
 * belum punya pengaturan", dan surelnya berangkat lewat jalur penyedia.
 * Basis data kendali yang tersendat tidak boleh berarti tidak ada faktur yang
 * bisa dikirim siapa pun.
 */
export async function cachedTenantMail(tenantId: number): Promise<TenantMailRow | null> {
  const hit = cache.get(tenantId);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.row;

  let row: TenantMailRow | null = null;
  try {
    row = (await controlDb.tenantMailSetting.findUnique({
      where: { tenantId },
    })) as TenantMailRow | null;
  } catch {
    row = null;
  }

  cache.set(tenantId, { at: Date.now(), row });
  return row;
}

/** Pembacaan yang MELEMPAR — dipakai layar pengaturan, yang harus bisa
 *  membedakan "belum diatur" dari "basisnya tak terjangkau". */
export async function readTenantMail(tenantId: number): Promise<TenantMailRow | null> {
  return (await controlDb.tenantMailSetting.findUnique({
    where: { tenantId },
  })) as TenantMailRow | null;
}

export interface TenantMailInput {
  transport: MailTransport;
  host: string | null;
  port: number | null;
  username: string | null;
  fromAddress: string | null;
  archiveAddress: string | null;
  /** Kata sandi BARU. `undefined` = jangan sentuh; `""` = hapus. */
  password?: string;
  updatedBy: string;
}

export async function saveTenantMail(tenantId: number, input: TenantMailInput): Promise<void> {
  const secret =
    input.password === undefined
      ? undefined
      : input.password === ""
        ? { ciphertext: null, iv: null, tag: null }
        : sealSecret(input.password);

  const base = {
    transport: input.transport,
    host: input.host,
    port: input.port,
    username: input.username,
    fromAddress: input.fromAddress,
    archiveAddress: input.archiveAddress,
    updatedBy: input.updatedBy,
    ...(secret
      ? {
          passwordCiphertext: secret.ciphertext,
          passwordIv: secret.iv,
          passwordTag: secret.tag,
        }
      : {}),
  };

  await controlDb.tenantMailSetting.upsert({
    where: { tenantId },
    create: { tenantId, ...base },
    update: base,
  });
  dropTenantMailCache(tenantId);
}

/** Catat hasil uji kirim — satu-satunya bukti konfigurasinya benar-benar hidup. */
export async function recordTenantMailTest(
  tenantId: number,
  result: { to: string; ok: boolean; message: string }
): Promise<void> {
  await controlDb.tenantMailSetting.update({
    where: { tenantId },
    data: {
      lastTestAt: new Date(),
      lastTestTo: result.to,
      lastTestStatus: result.ok ? "ok" : "error",
      lastTestMessage: result.message.slice(0, 2000),
    },
  });
  dropTenantMailCache(tenantId);
}

/* ── Penyelesaian ───────────────────────────────────────────────────────────── */

/**
 * Konfigurasi surel untuk pesan yang berangkat ATAS NAMA TENANT ini.
 *
 * `null` berarti tenant tidak punya konfigurasi yang layak pakai, dan pemanggil
 * harus jatuh ke jalur penyedia (`resolveMailConfig()`). Dua keadaan menghasilkan
 * `null`, dan keduanya disengaja:
 *
 *   • tidak ada barisnya sama sekali — tenant belum pernah mengaturnya;
 *   • `transport = smtp` TANPA host — pengaturan setengah jadi bukan
 *     konfigurasi, dan menjalankannya hanya akan gagal di tengah pengiriman
 *     alih-alih jatuh dengan tenang ke jalur yang bekerja.
 *
 * ⚠ `transport = file` DIHORMATI, tidak dianggap "belum diatur": tenant yang
 * sengaja menahan surelnya (mis. sedang menyiapkan domain) tidak boleh
 * diam-diam dialihkan mengirim lewat server penyedia.
 */
export async function resolveTenantMailConfig(tenantId: number): Promise<MailConfig | null> {
  const row = await cachedTenantMail(tenantId);
  if (!row) return null;

  const requested = normalizeTransport(row.transport);
  if (requested === "smtp" && !row.host) return null;

  /* Pengaman non-produksi yang sama dengan `mailer-core`: `smtp` di luar
     produksi selalu ditangkap ke berkas. Satu tenant yang salah setel di
     laptop pengembang tidak boleh mengirim surel sungguhan ke pelanggannya. */
  const transport: MailTransport =
    requested === "smtp" && process.env.NODE_ENV === "production" ? "smtp" : "file";

  return {
    transport,
    requestedTransport: requested,
    source: "tenant",
    from: row.fromAddress?.trim() || fallbackFrom(),
    archiveAddress: row.archiveAddress?.trim() || null,
    smtpUrl: null,
    smtp:
      requested === "smtp"
        ? {
            host: row.host as string,
            port: row.port ?? 587,
            secure: (row.port ?? 587) === 465,
            user: row.username,
            pass: storedPassword(row),
          }
        : null,
  };
}

/** Alamat pengirim cadangan bila tenant tidak menuliskannya sendiri. */
function fallbackFrom(): string {
  return process.env.MAIL_FROM ?? "SAI Accounting <no-reply@localhost>";
}

/** Cache companyId → tenantId. Pemetaan ini TIDAK PERNAH berubah selama sebuah
 *  perusahaan hidup, jadi ia aman disimpan tanpa TTL. */
const tenantOfCompany = new Map<number, number>();

/**
 * Konfigurasi surel yang berlaku untuk surel keluar sebuah PERUSAHAAN.
 *
 * `null` = pakai jalur penyedia. Perusahaan yang tidak ditemukan pun menjawab
 * `null` alih-alih melempar: kegagalan mencari tenant tidak boleh menjadi
 * kegagalan mengirim faktur, dan jalur penyedia adalah cadangan yang bekerja.
 */
export async function mailConfigForCompany(companyId: number): Promise<MailConfig | null> {
  let tenantId = tenantOfCompany.get(companyId);
  if (tenantId === undefined) {
    try {
      const row = await controlDb.company.findUnique({
        where: { id: companyId },
        select: { tenantId: true },
      });
      if (!row?.tenantId) return null;
      tenantId = row.tenantId;
      tenantOfCompany.set(companyId, tenantId);
    } catch {
      return null;
    }
  }
  return resolveTenantMailConfig(tenantId);
}
