/**
 * Unggah dokumen (B/L, PEB, packing list, faktur pindaian, …).
 *
 * ── Ke mana byte-nya ditulis, dan kenapa berubah (issue #367) ──────────────
 * Sampai issue itu berkasnya mendarat di `public/uploads/` — satu direktori
 * BERSAMA seluruh PT seluruh tenant — dengan nama yang mempertahankan nama asli
 * pengguna, lalu disajikan sebagai berkas statis yang tidak melewati satu pun
 * penjaga. Sekarang ia mendarat di `data/documents/<companyId>/<uuid>.<ext>`,
 * di luar `public/`, dan hanya bisa diambil lewat route bertenant
 * `/api/t/[tenantSlug]/[companySlug]/documents/[id]/file` (#489)
 * yang menuntut `document.read` DAN menemukan barisnya di basis data PT aktif.
 * Alasan lengkapnya di kepala `lib/document-storage.ts`.
 *
 * `companyId` datang dari konteks yang sudah dimasuki penjaga di bawah, bukan
 * dari klien — pola yang sama dengan `lib/audit.ts`.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiPermission } from "@/lib/auth-guard";
import { writeAuditLog } from "@/lib/audit";
import { currentCompanyId } from "@/lib/current-company";
import { newStorageKey, resolveDocumentPath } from "@/lib/document-storage";
import { DOCUMENT_TYPES, type DocumentType } from "@/lib/constants";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { getRequestI18n } from "@/lib/i18n/server";

const MAX_SIZE = 10 * 1024 * 1024; // 10MB

// Allowed extensions and their expected magic bytes
const ALLOWED_FILES: Record<string, number[][]> = {
  ".jpg": [[0xff, 0xd8, 0xff]],
  ".jpeg": [[0xff, 0xd8, 0xff]],
  ".png": [[0x89, 0x50, 0x4e, 0x47]],
  ".gif": [[0x47, 0x49, 0x46, 0x38]],
  ".pdf": [[0x25, 0x50, 0x44, 0x46]], // %PDF
};

function validateFileContent(buffer: Buffer, ext: string): boolean {
  const signatures = ALLOWED_FILES[ext.toLowerCase()];
  if (!signatures) return false;

  return signatures.some((sig) =>
    sig.every((byte, i) => buffer[i] === byte)
  );
}

export async function POST(request: Request) {
  const result = await requireApiPermission("document.write");
  if (!result.authorized) return result.response;

  const formData = await request.formData();
  const file = formData.get("file") as File | null;
  const contractId = formData.get("contractId") as string | null;
  const docType = formData.get("type") as string | null;

  if (!file) {
    const { t } = await getRequestI18n();
    return NextResponse.json({ error: t("errors.noFileSelected") }, { status: 400 });
  }

  // Validate file size
  if (file.size > MAX_SIZE) {
    const { t } = await getRequestI18n();
    return NextResponse.json(
      { error: t("errors.fileTooLarge", { max: "10 MB" }) },
      { status: 400 }
    );
  }

  // Validate extension
  const ext = path.extname(file.name).toLowerCase();
  if (!ALLOWED_FILES[ext]) {
    const { t } = await getRequestI18n();
    return NextResponse.json(
      { error: t("errors.fileTypeNotAllowed") },
      { status: 400 }
    );
  }

  // Read file bytes and validate magic bytes
  const bytes = await file.arrayBuffer();
  const buffer = Buffer.from(bytes);

  if (!validateFileContent(buffer, ext)) {
    const { t } = await getRequestI18n();
    return NextResponse.json(
      { error: t("errors.fileContentMismatch") },
      { status: 400 }
    );
  }

  // `type` masuk ke kolom enum-like — hanya nilai dari DOCUMENT_TYPES yang sah.
  if (docType && !DOCUMENT_TYPES.includes(docType as DocumentType)) {
    const { t } = await getRequestI18n();
    return NextResponse.json({ error: t("validation.invalidInput") }, { status: 400 });
  }

  // Validate contractId exists if provided
  if (contractId) {
    // `parseInt("abc")` = NaN dan Prisma melemparnya sebagai 500 — id wajib
    // murni digit sebelum menyentuh kueri.
    if (!/^\d+$/.test(contractId)) {
      const { t } = await getRequestI18n();
      return NextResponse.json({ error: t("validation.invalidInput") }, { status: 400 });
    }
    const contract = await prisma.contract.findUnique({
      where: { id: parseInt(contractId) },
    });
    if (!contract) {
      const { t } = await getRequestI18n();
      return NextResponse.json(
        { error: t("errors.contractNotFound") },
        { status: 400 }
      );
    }
  }

  /*
   * Kunci penyimpanan: `<companyId>/<uuid><ext>` — TANPA satu byte pun nama
   * asli. Nama aslinya tetap tersimpan di kolom `filename`; itulah yang
   * dipulangkan `Content-Disposition` saat berkasnya diambil. `resolveDocumentPath`
   * yang menyusun jalur absolutnya, jadi hanya ADA SATU tempat di repo ini yang
   * tahu di mana dokumen tinggal.
   */
  const storageKey = newStorageKey(await currentCompanyId(), ext);
  const filepath = resolveDocumentPath(storageKey)!;
  await mkdir(path.dirname(filepath), { recursive: true });
  await writeFile(filepath, buffer);

  const document = await prisma.document.create({
    data: {
      filename: file.name,
      filepath: storageKey,
      type: docType || null,
      contractId: contractId ? parseInt(contractId) : null,
    },
  });

  await writeAuditLog({
    userId: result.session.user.id,
    username: result.session.user.name,
    action: "document.upload",
    entity: "document",
    entityId: document.id,
    details: {
      filename: document.filename,
      filepath: document.filepath,
      type: document.type,
      contractId: document.contractId,
    },
    request,
  });

  return NextResponse.json(document, { status: 201 });
}
