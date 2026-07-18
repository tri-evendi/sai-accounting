import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Never cache or prerender — this must reflect live readiness.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    // Lightweight round-trip to confirm the database is reachable.
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ status: "ok" });
  } catch {
    return NextResponse.json(
      { status: "error", database: "unreachable" },
      { status: 503 }
    );
  }
}
