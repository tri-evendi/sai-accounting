/**
 * Pencabutan token API (issue #389, F-10).
 *
 * ══ DICABUT, BUKAN DIHAPUS ═════════════════════════════════════════════════
 * `revoked_at` diisi; barisnya tetap. Token yang pernah menarik data pelanggan
 * harus tetap bisa dijawab "siapa yang menerbitkannya, kapan terakhir dipakai,
 * dan kapan dicabut" — dan baris yang hilang tidak bisa menjawab apa pun.
 *
 * Itu sebabnya metodenya tetap DELETE: dari sisi pemakainya, mencabut memang
 * berarti "hilangkan kredensial ini". Yang tidak hilang adalah catatannya.
 *
 * ══ MENCABUT DUA KALI BUKAN GALAT ══════════════════════════════════════════
 * Token yang sudah dicabut dijawab 200, bukan 404 atau 409. Yang diminta
 * pemakainya adalah KEADAAN ("token ini tidak boleh dipakai lagi"), dan keadaan
 * itu sudah tercapai. Menjawab galat memaksa layar menangani perbedaan yang
 * tidak berarti apa-apa baginya.
 */
import { NextResponse } from "next/server";

import { controlDb } from "@/lib/control-db";
import { requireApiPermission } from "@/lib/auth-guard";
import { currentCompanyId } from "@/lib/current-company";
import { writeAuditLog } from "@/lib/audit";

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const result = await requireApiPermission("user.manage");
  if (!result.authorized) return result.response;

  const raw = (await context.params).id;
  if (!/^\d+$/.test(raw)) return new Response(null, { status: 404 });

  /*
   * Disaring `companyId` — kepemilikan dibuktikan kueri, bukan perbandingan
   * yang ditulis tangan sesudahnya. Token milik PT lain karena itu tidak
   * ditemukan, dan jawabannya 404: sama persis dengan id yang memang tidak ada,
   * jadi tidak ada yang bisa disimpulkan tentang keberadaannya.
   */
  const companyId = await currentCompanyId();
  const token = await controlDb.apiToken.findFirst({
    where: { id: Number(raw), companyId },
    select: { id: true, name: true, revokedAt: true },
  });
  if (!token) return new Response(null, { status: 404 });

  if (!token.revokedAt) {
    await controlDb.apiToken.update({
      where: { id: token.id },
      data: { revokedAt: new Date() },
    });

    await writeAuditLog({
      userId: result.session.user.id,
      username: result.session.user.name ?? result.session.user.email ?? result.session.user.id,
      role: result.session.user.role,
      action: "api_token.revoke",
      entity: "api_token",
      entityId: token.id,
      details: { name: token.name },
      request,
    });
  }

  return NextResponse.json({ ok: true });
}
