import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcrypt";
import { prisma } from "@/lib/prisma";
import { loginSchema } from "@/lib/validations/auth";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";

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
      }
      // issue #11 — when the navbar toggle calls useSession().update({ accountantMode }),
      // reflect the new preference into the token without a re-login. This only
      // updates the DISPLAY preference; role/status are never touched here.
      if (trigger === "update" && session && typeof session === "object" && "accountantMode" in session) {
        const next = (session as { accountantMode?: boolean | null }).accountantMode;
        token.accountantMode = next === true || next === false ? next : null;
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
