/**
 * Unggah dokumen — `bos` & `core` (issue #59: penjaga sisi-server).
 *
 * Pembungkus server tipis; API `/api/upload` tetap menegakkan peran juga.
 */
import { requirePageSession } from "@/lib/page-auth";
import { UploadClient } from "./upload-client";

export const dynamic = "force-dynamic";

export default async function UploadDocumentPage() {
  await requirePageSession(["bos", "core"]);
  return <UploadClient />;
}
