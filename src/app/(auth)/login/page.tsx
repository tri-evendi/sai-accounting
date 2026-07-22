"use client";

import { Suspense, useEffect, useState } from "react";
import { signIn, getSession, useSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { LogIn } from "lucide-react";
import { AuthShell } from "@/components/auth/auth-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";

function resolvePostLoginPath(status: number | undefined, callbackUrl: string | null) {
  if (status === 1) return "/change-password";
  if (callbackUrl && callbackUrl.startsWith("/") && !callbackUrl.startsWith("//")) {
    return callbackUrl;
  }
  return "/dashboard";
}

function formatSignInError(message: string | undefined) {
  if (!message || message === "CredentialsSignin") {
    return "Invalid username or password. Please try again.";
  }
  if (message.includes("Too many login attempts")) {
    return message;
  }
  return message;
}

function LoginLoading() {
  return (
    <AuthShell
      heading="Sign in"
      description="Use your company account to access dashboards, contracts, and inventory."
      icon={<LogIn className="h-5 w-5" aria-hidden />}
    >
      <p className="text-center text-sm text-muted-foreground">Loading…</p>
    </AuthShell>
  );
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { status: sessionStatus } = useSession();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const callbackUrl = searchParams.get("callbackUrl");

  useEffect(() => {
    if (sessionStatus !== "authenticated") return;

    getSession().then((session) => {
      const destination = resolvePostLoginPath(session?.user?.status, callbackUrl);
      router.replace(destination);
    });
  }, [sessionStatus, callbackUrl, router]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const formData = new FormData(e.currentTarget);
    const result = await signIn("credentials", {
      username: formData.get("username"),
      password: formData.get("password"),
      redirect: false,
    });

    if (result?.error) {
      setError(formatSignInError(result.error));
      setLoading(false);
      return;
    }

    const session = await getSession();
    router.push(resolvePostLoginPath(session?.user?.status, callbackUrl));
    router.refresh();
  }

  if (sessionStatus === "loading" || sessionStatus === "authenticated") {
    return (
      <AuthShell
        heading="Sign in"
        description="Use your company account to access dashboards, contracts, and inventory."
        icon={<LogIn className="h-5 w-5" aria-hidden />}
      >
        <p className="text-center text-sm text-muted-foreground">Checking your session…</p>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      heading="Sign in"
      description="Use your company account to access dashboards, contracts, and inventory."
      error={error}
      icon={<LogIn className="h-5 w-5" aria-hidden />}
      footer={
        <p className="text-center text-xs text-muted-foreground">
          Forgot your password? Contact your system administrator to reset access.
        </p>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-5">
        <Input
          id="username"
          name="username"
          label="Username"
          placeholder="your.username"
          autoComplete="username"
          required
          autoFocus
          disabled={loading}
          aria-invalid={error ? true : undefined}
        />
        <PasswordInput
          id="password"
          name="password"
          label="Password"
          placeholder="••••••••"
          autoComplete="current-password"
          required
          disabled={loading}
          aria-invalid={error ? true : undefined}
        />
        <Button type="submit" className="w-full" size="lg" disabled={loading}>
          {loading ? "Signing in…" : "Sign in"}
        </Button>
      </form>
    </AuthShell>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<LoginLoading />}>
      <LoginForm />
    </Suspense>
  );
}
