import { NextResponse } from "next/server";
import { requireApiPermission } from "@/lib/auth-guard";
import { readAuditLogs } from "@/lib/audit";

export async function GET(request: Request) {
  const result = await requireApiPermission("audit.read");
  if (!result.authorized) return result.response;

  const { searchParams } = new URL(request.url);
  // `parseInt("abc")` adalah NaN, dan NaN yang lolos ke slice() membuat daftar
  // berisi tampak kosong — URL bisa diedit tangan, jadi disanitasi di sini.
  const rawPage = parseInt(searchParams.get("page") || "1");
  const page = Number.isFinite(rawPage) && rawPage >= 1 ? rawPage : 1;
  const rawPerPage = parseInt(searchParams.get("perPage") || "20");
  const perPage = Number.isFinite(rawPerPage) && rawPerPage >= 1 ? rawPerPage : 20;
  const action = searchParams.get("action");

  const data = await readAuditLogs({ page, perPage, action });

  return NextResponse.json(data);
}
