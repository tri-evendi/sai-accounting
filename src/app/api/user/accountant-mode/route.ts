import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * Mode Akuntan toggle (issue #11).
 *
 * PATCH updates ONLY the current user's `accountant_mode` display preference.
 * The target row is always `session.user.id` — never a caller-supplied id — so a
 * user can only flip their OWN preference. `role` is never read from or written
 * to the body, so this can never escalate authorisation: a `ptg` user stays
 * `ptg`; this only changes what THEY see.
 */
const bodySchema = z.object({
  // true/false = explicit override; null = clear back to the role default.
  accountantMode: z.boolean().nullable(),
});

export async function PATCH(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const updated = await prisma.user.update({
    // Scoped to the authenticated user only. No id comes from the request body.
    where: { id: parseInt(session.user.id) },
    data: { accountantMode: parsed.data.accountantMode },
    select: { accountantMode: true },
  });

  return NextResponse.json({ accountantMode: updated.accountantMode });
}
