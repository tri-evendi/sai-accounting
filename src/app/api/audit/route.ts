import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";
import { readAuditLogs } from "@/lib/audit";

export async function GET(request: Request) {
  const result = await requireAuth(["bos"]);
  if (!result.authorized) return result.response;

  const { searchParams } = new URL(request.url);
  const page = parseInt(searchParams.get("page") || "1");
  const perPage = parseInt(searchParams.get("perPage") || "20");
  const action = searchParams.get("action");

  const data = await readAuditLogs({ page, perPage, action });

  return NextResponse.json(data);
}
