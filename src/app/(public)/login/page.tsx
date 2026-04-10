"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Suspense } from "react";
import { useTranslations } from "next-intl";

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#050505]" />}>
      <LoginContent />
    </Suspense>
  );
}

const landingUrl = process.env.NEXT_PUBLIC_LANDING_URL ?? "";

function LoginContent() {
  const t = useTranslations();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") ?? "/home";
  const authError = searchParams.get("error");

  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(
    authError === "OAuthAccountNotLinked"
      ? t("auth.oauthConflict")
      : authError
        ? t("auth.oauthError")
        : null
  );

  async function handleCredentials(e: React.FormEvent) {
    e.preventDefault();
    if (!email || !password) return;
    setLoading(true);
    setError(null);

    const isSignup = mode === "signup";

    if (isSignup) {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, name: name || undefined }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Signup failed");
        setLoading(false);
        return;
      }
    }

    const result = await signIn("credentials", {
      email,
      password,
      redirect: false,
    });

    if (result?.error) {
      setError(
        mode === "login"
          ? t("auth.invalidCredentials")
          : t("auth.signupFailed")
      );
      setLoading(false);
      return;
    }

    window.location.href = callbackUrl;
  }

  function handleGoogle() {
    signIn("google", { callbackUrl });
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-[#050505]">
      <div className="w-full max-w-sm">
        {/* Header */}
        <div className="mb-10 text-center">
          <a
            href={landingUrl || "/"}
            className="text-3xl font-bold tracking-tight text-white hover:text-neutral-300 transition-colors"
          >
            {t("common.gennety")}
          </a>
          <p className="mt-2 text-sm text-neutral-500">
            {mode === "login" ? t("auth.welcomeBack") : t("auth.createAccount")}
          </p>
        </div>

        {/* Google */}
        <button
          onClick={handleGoogle}
          className="w-full flex items-center justify-center gap-3 py-3 rounded-lg border border-neutral-700 text-sm font-medium text-white hover:border-neutral-500 hover:bg-neutral-900 transition-colors"
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24">
            <path
              fill="#4285F4"
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
            />
            <path
              fill="#34A853"
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            />
            <path
              fill="#FBBC05"
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
            />
            <path
              fill="#EA4335"
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
            />
          </svg>
          {t("auth.signInGoogle")}
        </button>

        {/* Divider */}
        <div className="flex items-center gap-4 my-6">
          <div className="flex-1 border-t border-neutral-800" />
          <span className="text-xs text-neutral-600">{t("common.or")}</span>
          <div className="flex-1 border-t border-neutral-800" />
        </div>

        {/* Form */}
        <form onSubmit={handleCredentials} className="space-y-3">
          {mode === "signup" && (
            <input
              type="text"
              placeholder={t("auth.namePlaceholder")}
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full p-3 rounded-lg bg-neutral-900 border border-neutral-800 text-white placeholder-neutral-600 text-sm focus:outline-none focus:border-neutral-600"
            />
          )}
          <input
            type="email"
            placeholder={t("auth.emailPlaceholder")}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="w-full p-3 rounded-lg bg-neutral-900 border border-neutral-800 text-white placeholder-neutral-600 text-sm focus:outline-none focus:border-neutral-600"
          />
          <input
            type="password"
            placeholder={mode === "signup" ? t("auth.passwordSignupPlaceholder") : t("auth.passwordPlaceholder")}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={mode === "signup" ? 8 : undefined}
            className="w-full p-3 rounded-lg bg-neutral-900 border border-neutral-800 text-white placeholder-neutral-600 text-sm focus:outline-none focus:border-neutral-600"
          />

          {mode === "login" && (
            <div className="flex justify-end">
              <Link
                href={`/forgot-password${email ? `?email=${encodeURIComponent(email)}` : ""}`}
                className="text-xs text-neutral-500 hover:text-white transition-colors"
              >
                {t("auth.forgotPassword")}
              </Link>
            </div>
          )}

          {error && (
            <p className="text-sm text-red-400 text-center">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 rounded-lg bg-white text-black font-medium text-sm hover:bg-neutral-200 transition-colors disabled:opacity-50"
          >
            {loading
              ? mode === "signup"
                ? t("auth.creatingAccount")
                : t("auth.signingIn")
              : mode === "signup"
              ? t("auth.createAccountBtn")
              : t("auth.signIn")}
          </button>
        </form>

        {/* Toggle mode */}
        <p className="mt-6 text-center text-sm text-neutral-500">
          {mode === "login" ? (
            <>
              {t("auth.noAccount")}{" "}
              <button
                onClick={() => { setMode("signup"); setError(null); }}
                className="text-white hover:underline"
              >
                {t("auth.signUp")}
              </button>
            </>
          ) : (
            <>
              {t("auth.alreadyHaveAccount")}{" "}
              <button
                onClick={() => { setMode("login"); setError(null); }}
                className="text-white hover:underline"
              >
                {t("auth.signIn")}
              </button>
            </>
          )}
        </p>
      </div>
    </div>
  );
}
