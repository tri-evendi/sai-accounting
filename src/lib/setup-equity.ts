/**
 * Templat ekuitas untuk WISAYA PENYIAPAN (bentuk usaha, 24 Okt 2026).
 *
 * Wisaya mengirim bentuk usaha + daftar pemilik/sekutu; di sini keduanya
 * divalidasi, bentuk usaha di registry diselaraskan (hanya selama buku belum
 * punya akun), dan hasilnya menjadi `EquityTemplateInput` untuk
 * `seedCoaForModules`.
 */
import "server-only";

import { prisma } from "@/lib/prisma";
import { writeAuditLog } from "@/lib/audit";
import { currentCompanyId } from "@/lib/current-company";
import { getCompanyLegalForm, setCompanyLegalForm } from "@/lib/legal-form-server";
import { validatePartners, type PartnerIssue } from "@/lib/partners";
import type { EquityTemplateInput } from "@/lib/coa-template";
import type { SetupEquityPayload } from "@/lib/validations/legal-form";
import { equityModelFor, FULL_SHARE_BP } from "@sai/core/legal-form";

export type SetupEquityResult =
  | { ok: true; equity: EquityTemplateInput }
  | { ok: false; status: 400 | 409; issues: (PartnerIssue | "lockedAfterSeed")[] };

/**
 * `payload` kosong = klien lama / skrip: bentuk usaha dari registry, pemilik
 * bawaan untuk perorangan, dan CV/Firma TANPA sekutu ditolak (templatnya tidak
 * bisa dibuat tanpa nama dan porsi).
 */
export async function resolveSetupEquity(
  payload: SetupEquityPayload | undefined,
  actor: { userId: string; username: string },
  request?: Request
): Promise<SetupEquityResult> {
  const companyId = await currentCompanyId();
  const registered = await getCompanyLegalForm(companyId);
  const legalForm = payload?.legalForm ?? registered;

  if (legalForm !== registered) {
    /* Bentuk usaha boleh diganti DI WISAYA hanya selama templat belum
       diterapkan — begitu ada satu akun, bagan ekuitasnya sudah milik bentuk
       yang lama, dan menggantinya di sini akan meninggalkan dua templat
       bertumpuk. Sesudahnya: Pengaturan → Bentuk usaha (tanpa menyemai ulang). */
    if ((await prisma.account.count()) > 0) {
      return { ok: false, status: 409, issues: ["lockedAfterSeed"] };
    }
    await setCompanyLegalForm(companyId, legalForm);
    await writeAuditLog({
      userId: actor.userId,
      username: actor.username,
      action: "company.legal_form.update",
      entity: "company",
      entityId: companyId,
      details: { from: registered, to: legalForm, via: "setup" },
      request,
    });
  }

  let partners = (payload?.partners ?? []).map((p) => ({
    name: p.name.trim(),
    role: p.role ?? null,
    shareBp: p.shareBp,
  }));
  /* Usaha perorangan tanpa nama pemilik → "Pemilik" 100%. Satu-satunya kasus
     yang boleh ditebak: pemiliknya memang satu, porsinya memang seluruhnya. */
  if (equityModelFor(legalForm) === "sole_owner" && partners.length === 0) {
    partners = [{ name: "Pemilik", role: null, shareBp: FULL_SHARE_BP }];
  }
  if (equityModelFor(legalForm) === "retained_earnings") partners = [];

  /* Daftar sekutu yang SUDAH tersimpan (wisaya yang dipulihkan) tidak
     divalidasi ulang dari payload: penyemaian sekutu hanya berjalan bila
     tabelnya kosong (`seedEquityOwners`). */
  if (equityModelFor(legalForm) !== "retained_earnings" && (await prisma.companyPartner.count()) === 0) {
    const issues = validatePartners(legalForm, partners);
    if (issues.length > 0) return { ok: false, status: 400, issues };
  }
  return { ok: true, equity: { legalForm, partners } };
}
