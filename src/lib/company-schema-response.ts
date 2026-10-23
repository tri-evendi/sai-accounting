/**
 * Jawaban API untuk buku yang ditutup gerbang skema (09 §6,
 * `company-schema-gate.ts`) — SATU bentuk untuk penjaga sesi dan penjaga
 * token.
 *
 * 503 + `Retry-After`, bukan 500: keadaannya sementara, hilang sendiri begitu
 * migration buku itu sampai, dan klien (termasuk integrasi `/api/v1`) yang
 * mengulang dengan jeda akan berhasil tanpa campur tangan siapa pun. `code`
 * membedakannya dari 503 kendali yang mati.
 */
import "server-only";

import { NextResponse } from "next/server";

import { companySchemaVerdict, RETRY_MS, type CompanySchemaTarget } from "@/lib/company-schema-gate";

export async function companySchemaRefusal(target: CompanySchemaTarget): Promise<NextResponse | null> {
  const verdict = await companySchemaVerdict(target);
  if (verdict.serve) return null;
  return NextResponse.json(
    {
      error: "Buku perusahaan ini sedang diperbarui. Coba lagi sebentar lagi.",
      code: "book_schema_updating",
    },
    { status: 503, headers: { "Retry-After": String(Math.ceil(RETRY_MS / 1000)) } }
  );
}
