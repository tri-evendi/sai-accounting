/**
 * PENJAGA TOKEN API (issue #389, F-10 lapis 1) — pintu `/api/v1/…`.
 *
 * ══ KENAPA PENJAGA TERSENDIRI, BUKAN `requireApiPermission` ════════════════
 * Penjaga pelanggan membaca SESI: cookie, JWT, pencabutan sesi, wajib-ganti-
 * kata-sandi. Tidak satu pun berlaku bagi mesin. Menyeret jalur token ke
 * dalamnya akan menambah cabang "kalau tidak ada sesi, coba token" di jalur
 * yang dilewati setiap permintaan manusia — cabang yang harus benar setiap kali
 * salah satu dari keduanya berubah.
 *
 * Yang DIPAKAI BERSAMA justru bagian yang penting: keputusan izinnya. Token
 * berperan sebagai sebuah PERAN, dan `canEffective` menjawabnya dengan matriks
 * yang sama — termasuk modul yang mati (#99) dan override per perusahaan (#73).
 * Tidak ada daftar cakupan kedua yang bisa menyimpang.
 *
 * ══ URUTANNYA DISENGAJA ════════════════════════════════════════════════════
 *   1. bentuk token   — sampah tidak pernah menghasilkan satu kueri pun;
 *   2. pembatas laju  — SEBELUM basis data disentuh;
 *   3. baris & rahasia;
 *   4. dicabut?;
 *   5. konteks perusahaan;
 *   6. izin.
 *
 * Membalik 1 dan 2 berarti membanjiri endpoint dengan sampah menjadi cara
 * membebani basis data KENDALI — yang dipakai setiap autentikasi di seluruh
 * aplikasi, manusia maupun mesin.
 *
 * ══ SATU JAWABAN UNTUK SEMUA KEGAGALAN KREDENSIAL ══════════════════════════
 * Token tidak ada, rahasianya salah, sudah dicabut, perusahaannya nonaktif —
 * semuanya `401` dengan kalimat yang sama. Membedakannya mengubah endpoint ini
 * menjadi alat menebak: "token ini pernah ada, hanya sudah dicabut" adalah
 * jawaban yang tidak berhak didapat penanyanya.
 *
 * Izin yang KURANG dijawab `403` — di situ kredensialnya sah, dan pemiliknya
 * berhak tahu bahwa yang kurang adalah haknya, bukan tokennya.
 */

import "server-only";

import { headers } from "next/headers";
import { NextResponse } from "next/server";

import { controlDb } from "@/lib/control-db";
import { enterCompanyContext } from "@/lib/company-context";
import { canEffective } from "@/lib/authz-effective";
import type { Permission } from "@/lib/authz";
import {
  bearerFrom,
  parseToken,
  secretMatches,
  shouldWriteLastUsed,
} from "@/lib/api-token";
import {
  PERSISTENT_RATE_LIMITS,
  checkPersistentRateLimit,
} from "@/lib/rate-limit-persistent";

export interface ApiTokenContext {
  tokenId: number;
  companyId: number;
  companySlug: string;
  role: string;
}

export type ApiTokenResult =
  | { authorized: true; context: ApiTokenContext }
  | { authorized: false; response: NextResponse };

/** Satu-satunya kalimat untuk setiap kegagalan kredensial. */
function unauthorized(): NextResponse {
  return NextResponse.json(
    { error: "Token tidak sah atau sudah dicabut." },
    { status: 401, headers: { "WWW-Authenticate": "Bearer" } }
  );
}

export async function requireApiToken(permission: Permission): Promise<ApiTokenResult> {
  const raw = bearerFrom((await headers()).get("authorization"));
  if (!raw) return { authorized: false, response: unauthorized() };

  // (1) Bentuk dulu — murni, tanpa I/O.
  const parsed = parseToken(raw);
  if (!parsed) return { authorized: false, response: unauthorized() };

  // (2) Pembatas laju SEBELUM basis data. Kuncinya id token, bukan IP: sebuah
  // integrasi hidup di satu alamat dan menariknya ribuan kali sehari — membatasi
  // per-IP akan menghukum pemakaian yang benar.
  const gate = await checkPersistentRateLimit(
    `apitoken:${parsed.id}`,
    PERSISTENT_RATE_LIMITS.apiToken
  );
  if (!gate.allowed) {
    return {
      authorized: false,
      response: NextResponse.json(
        { error: "Terlalu banyak permintaan. Coba lagi sebentar lagi." },
        { status: 429 }
      ),
    };
  }

  // (3) Baris + rahasia.
  const row = await controlDb.apiToken.findUnique({
    where: { id: parsed.id },
    select: {
      id: true,
      tokenHash: true,
      role: true,
      revokedAt: true,
      lastUsedAt: true,
      company: { select: { id: true, slug: true, databaseName: true, isActive: true } },
    },
  });
  if (!row) return { authorized: false, response: unauthorized() };
  if (!secretMatches(parsed.secret, row.tokenHash)) {
    return { authorized: false, response: unauthorized() };
  }

  // (4) Dicabut, atau perusahaannya dinonaktifkan.
  if (row.revokedAt || !row.company.isActive) {
    return { authorized: false, response: unauthorized() };
  }

  // (5) Konteks perusahaan — dari TOKENNYA, tidak pernah dari permintaan.
  // Doktrin #104: konteks yang hilang MELEMPAR, tidak pernah jatuh ke bawaan.
  enterCompanyContext({
    companyId: row.company.id,
    slug: row.company.slug,
    databaseName: row.company.databaseName,
  });

  // (6) Izin — matriks yang sama dengan manusia.
  const allowed = await canEffective({ role: row.role }, permission);
  if (!allowed) {
    return {
      authorized: false,
      response: NextResponse.json(
        { error: `Token ini tidak berhak: ${permission}.` },
        { status: 403 }
      ),
    };
  }

  /*
   * Jejak pemakaian, DIREDAM. Gagal menulisnya tidak boleh menggagalkan
   * permintaan yang sudah sah — ia catatan, bukan gerbang.
   */
  if (shouldWriteLastUsed(row.lastUsedAt)) {
    void controlDb.apiToken
      .update({ where: { id: row.id }, data: { lastUsedAt: new Date() } })
      .catch(() => {});
  }

  return {
    authorized: true,
    context: {
      tokenId: row.id,
      companyId: row.company.id,
      companySlug: row.company.slug,
      role: row.role,
    },
  };
}
