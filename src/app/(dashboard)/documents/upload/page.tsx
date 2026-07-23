/**
 * Unggah dokumen — `bos` & `core` (issue #59: penjaga sisi-server).
 *
 * Pembungkus server tipis; API `/api/upload` tetap menegakkan peran juga.
 */
import { requirePagePermission } from "@/lib/page-auth";
import { UploadClient } from "./upload-client";

export const dynamic = "force-dynamic";

export default async function UploadDocumentPage() {
  await requirePagePermission("document.write");
  return <UploadClient />;
}
