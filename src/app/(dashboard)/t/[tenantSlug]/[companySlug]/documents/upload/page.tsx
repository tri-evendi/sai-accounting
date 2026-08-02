/**
 * Unggah dokumen — `bos` & `core` (issue #59: penjaga sisi-server).
 *
 * Pembungkus server tipis; API `/api/upload` tetap menegakkan peran juga.
 */
import { requirePagePermission } from "@/lib/page-auth";
import type { TenantScopedParams } from "@/lib/tenant-routes";
import { UploadClient } from "./upload-client";

export const dynamic = "force-dynamic";

export default async function UploadDocumentPage({
  params,
}: {
  params: Promise<TenantScopedParams>;
}) {
  await requirePagePermission("document.write", params);
  return <UploadClient />;
}
