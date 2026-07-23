import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcrypt";
import { prisma } from "@/lib/prisma";
import { loginSchema } from "@/lib/validations/auth";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { evaluateSession, shouldRecheckSession } from "@/lib/session-guard";

export const { handlers, signIn, signOut, auth } = NextAuth({
  // Required behind nginx/reverse proxy when env vars are not loaded at runtime
  trustHost: true,
  providers: [
    Credentials({
      credentials: {
        username: {},
        password: {},
      },
      async authorize(credentials) {
        const parsed = loginSchema.safeParse(credentials);
        if (!parsed.success) return null;

        // Rate limit by username
        const rateCheck = checkRateLimit(`login:${parsed.data.username}`, RATE_LIMITS.login);
        if (!rateCheck.allowed) {
          throw new Error("Too many login attempts. Please try again later.");
        }

        const user = await prisma.user.findUnique({
          where: { username: parsed.data.username },
        });

        if (!user) return null;

        const passwordMatch = await bcrypt.compare(
          parsed.data.password,
          user.password
        );

        if (!passwordMatch) return null;

        return {
          id: String(user.id),
          name: user.name || user.username,
          email: user.username,
          role: user.role,
          status: user.status,
          // issue #11 — carry the stored Mode Akuntan preference (may be null =
          // follow role default). Effective mode is derived, not stored.
          accountantMode: user.accountantMode,
          // audit RBAC fase 3 — versi sesi untuk pencabutan (lihat session-guard.ts).
          sessionVersion: user.sessionVersion,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user, trigger, session }) {
      if (user) {
        token.role = (user as { role: string }).role;
        token.status = (user as { status: number }).status;
        token.userId = user.id;
        // issue #11 — persist the Mode Akuntan preference into the JWT so both
        // client (sidebar/navbar) and server (page guards) read it from auth().
        token.accountantMode = (user as { accountantMode?: boolean | null }).accountantMode ?? null;
        // audit RBAC fase 3 — simpan versi sesi + stempel revalidasi.
        token.sessionVersion = (user as { sessionVersion?: number }).sessionVersion ?? 1;
        token.checkedAt = Date.now();
        return token;
      }
      // issue #11 — when the navbar toggle calls useSession().update({ accountantMode }),
      // reflect the new preference into the token without a re-login. This only
      // updates the DISPLAY preference; role/status are never touched here.
      if (trigger === "update" && session && typeof session === "object" && "accountantMode" in session) {
        const next = (session as { accountantMode?: boolean | null }).accountantMode;
        token.accountantMode = next === true || next === false ? next : null;
      }
      // ── audit RBAC fase 3 — revalidasi berkala ke DB ─────────────────────
      // Ganti peran / reset kata sandi menaikkan `sessionVersion` di DB;
      // pengguna yang dihapus kehilangan barisnya. Keduanya mematikan token
      // ini paling lama SESSION_RECHECK_MS setelahnya (return null = sesi
      // dicabut). Jalur "refresh" juga menyalin ulang peran/status dari DB,
      // jadi perubahan peran terasa tanpa menunggu login ulang.
      if (!token.userId) return null;
      if (shouldRecheckSession(token, Date.now())) {
        const dbUser = await prisma.user.findUnique({
          where: { id: parseInt(String(token.userId), 10) },
          select: { role: true, status: true, sessionVersion: true, accountantMode: true },
        });
        if (evaluateSession(token, dbUser) === "revoke") return null;
        token.role = dbUser!.role;
        token.status = dbUser!.status;
        token.accountantMode = dbUser!.accountantMode ?? null;
        token.sessionVersion = dbUser!.sessionVersion;
        token.checkedAt = Date.now();
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.userId as string;
        (session.user as { role: string }).role = token.role as string;
        (session.user as { status: number }).status = token.status as number;
        // issue #11 — expose the raw preference; effectiveAccountantMode() derives
        // the boolean the UI/guards act on.
        (session.user as { accountantMode?: boolean | null }).accountantMode =
          (token.accountantMode as boolean | null | undefined) ?? null;
      }
      return session;
    },
  },
  pages: {
    signIn: "/login",
  },
  session: {
    strategy: "jwt",
    maxAge: 24 * 60 * 60, // 24 hours
  },
});
