"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { createClient, getSupabaseEnvError } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import {
  PASSWORD_REQUIREMENTS_HINT,
  getPasswordRequirementError,
} from "@/lib/auth/password";

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const envError = getSupabaseEnvError();
  const authRedirectTo =
    typeof window === "undefined"
      ? undefined
      : `${window.location.origin}/auth/callback`;

  const onGoogleSignIn = async () => {
    setError(null);

    if (envError) {
      setError(envError);
      return;
    }

    setLoading(true);
    const supabase = createClient();
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: authRedirectTo,
      },
    });

    if (oauthError) {
      setLoading(false);
      setError(oauthError.message);
    }
  };

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);

    if (envError) {
      setError(envError);
      return;
    }

    setLoading(true);
    const supabase = createClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    setLoading(false);

    if (signInError) {
      setError(signInError.message);
      return;
    }

    router.push("/dashboard");
    router.refresh();
  };

  return (
    <form
      onSubmit={onSubmit}
      className="glass mx-auto mt-10 max-w-md space-y-4 rounded-xl p-6"
    >
      <h1 className="cyber-heading text-2xl font-semibold text-cyan-50">
        Login
      </h1>
      <input
        className="w-full rounded-md border border-cyan-500/25 bg-black/35 px-3 py-2"
        placeholder="Email"
        type="email"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        required
      />
      <div className="space-y-1">
        <input
          className="w-full rounded-md border border-cyan-500/25 bg-black/35 px-3 py-2"
          placeholder="Password"
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
        />
        <div className="text-right">
          <Link
            href="/forgot-password"
            className="text-xs text-cyan-300 hover:text-cyan-200"
          >
            Forgot password?
          </Link>
        </div>
      </div>
      {envError ? <p className="text-sm text-danger">{envError}</p> : null}
      {error ? <p className="text-sm text-danger">{error}</p> : null}
      <button
        type="button"
        onClick={onGoogleSignIn}
        className="cyber-btn w-full font-medium"
        disabled={loading || Boolean(envError)}
      >
        Continue with Google
      </button>
      <div className="h-px w-full bg-cyan-500/20" />
      <button
        className="cyber-btn-primary w-full font-medium"
        disabled={loading || Boolean(envError)}
      >
        {loading ? "Signing in..." : "Login"}
      </button>
      <p className="text-center text-sm text-cyan-100/70">
        Don&apos;t have an account?{" "}
        <Link href="/signup" className="text-cyan-300 hover:text-cyan-200">
          Sign up
        </Link>
      </p>
    </form>
  );
}

export function SignupForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const envError = getSupabaseEnvError();
  const authRedirectTo =
    typeof window === "undefined"
      ? undefined
      : `${window.location.origin}/auth/callback`;

  const onGoogleSignIn = async () => {
    setError(null);

    if (envError) {
      setError(envError);
      return;
    }

    setLoading(true);
    const supabase = createClient();
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: authRedirectTo,
      },
    });

    if (oauthError) {
      setLoading(false);
      setError(oauthError.message);
    }
  };

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);

    if (envError) {
      setError(envError);
      return;
    }

    const passwordError = getPasswordRequirementError(password);
    if (passwordError) {
      setError(passwordError);
      return;
    }

    setLoading(true);
    const supabase = createClient();
    const { error: signupError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: authRedirectTo,
      },
    });
    setLoading(false);

    if (signupError) {
      setError(signupError.message);
      return;
    }

    router.push("/dashboard");
    router.refresh();
  };

  return (
    <form
      onSubmit={onSubmit}
      className="glass mx-auto mt-10 max-w-md space-y-4 rounded-xl p-6"
    >
      <h1 className="cyber-heading text-2xl font-semibold text-cyan-50">
        Sign up
      </h1>
      <input
        className="w-full rounded-md border border-cyan-500/25 bg-black/35 px-3 py-2"
        placeholder="Email"
        type="email"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        required
      />
      <div className="space-y-1">
        <input
          className="w-full rounded-md border border-cyan-500/25 bg-black/35 px-3 py-2"
          placeholder="Password"
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          minLength={8}
          required
        />
        <p className="text-xs text-cyan-100/60">{PASSWORD_REQUIREMENTS_HINT}</p>
      </div>
      {envError ? <p className="text-sm text-danger">{envError}</p> : null}
      {error ? <p className="text-sm text-danger">{error}</p> : null}
      <button
        type="button"
        onClick={onGoogleSignIn}
        className="cyber-btn w-full font-medium"
        disabled={loading || Boolean(envError)}
      >
        Continue with Google
      </button>
      <div className="h-px w-full bg-cyan-500/20" />
      <button
        className="cyber-btn-primary w-full font-medium"
        disabled={loading || Boolean(envError)}
      >
        {loading ? "Creating account..." : "Create account"}
      </button>
      <p className="text-center text-sm text-cyan-100/70">
        Already have an account?{" "}
        <Link href="/login" className="text-cyan-300 hover:text-cyan-200">
          Login
        </Link>
      </p>
    </form>
  );
}

export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const envError = getSupabaseEnvError();

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);

    if (envError) {
      setError(envError);
      return;
    }

    setLoading(true);
    const supabase = createClient();
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(
      email,
      {
        redirectTo: `${window.location.origin}/auth/callback?next=/reset-password`,
      },
    );
    setLoading(false);

    if (resetError) {
      setError(resetError.message);
      return;
    }

    setSent(true);
  };

  if (sent) {
    return (
      <div className="glass mx-auto mt-10 max-w-md space-y-4 rounded-xl p-6 text-center">
        <h1 className="cyber-heading text-2xl font-semibold text-cyan-50">
          Check your email
        </h1>
        <p className="text-sm text-cyan-100/80">
          If an account exists for <strong>{email}</strong>, we&apos;ve sent a
          link to reset your password.
        </p>
        <Link
          href="/login"
          className="block text-sm text-cyan-300 hover:text-cyan-200"
        >
          Back to login
        </Link>
      </div>
    );
  }

  return (
    <form
      onSubmit={onSubmit}
      className="glass mx-auto mt-10 max-w-md space-y-4 rounded-xl p-6"
    >
      <h1 className="cyber-heading text-2xl font-semibold text-cyan-50">
        Forgot password
      </h1>
      <p className="text-sm text-cyan-100/70">
        Enter your email and we&apos;ll send you a link to reset your
        password.
      </p>
      <input
        className="w-full rounded-md border border-cyan-500/25 bg-black/35 px-3 py-2"
        placeholder="Email"
        type="email"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        required
      />
      {envError ? <p className="text-sm text-danger">{envError}</p> : null}
      {error ? <p className="text-sm text-danger">{error}</p> : null}
      <button
        className="cyber-btn-primary w-full font-medium"
        disabled={loading || Boolean(envError)}
      >
        {loading ? "Sending..." : "Send reset link"}
      </button>
      <p className="text-center text-sm text-cyan-100/70">
        <Link href="/login" className="text-cyan-300 hover:text-cyan-200">
          Back to login
        </Link>
      </p>
    </form>
  );
}

export function ResetPasswordForm() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [sessionReady, setSessionReady] = useState(false);
  const [hasSession, setHasSession] = useState(false);
  const envError = getSupabaseEnvError();

  useEffect(() => {
    if (envError) {
      setSessionReady(true);
      return;
    }

    const supabase = createClient();
    void supabase.auth.getSession().then(({ data }) => {
      setHasSession(Boolean(data.session));
      setSessionReady(true);
    });
  }, [envError]);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);

    if (envError) {
      setError(envError);
      return;
    }

    const passwordError = getPasswordRequirementError(password);
    if (passwordError) {
      setError(passwordError);
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    const supabase = createClient();
    const { error: updateError } = await supabase.auth.updateUser({
      password,
    });
    setLoading(false);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    setDone(true);
  };

  if (done) {
    return (
      <div className="glass mx-auto mt-10 max-w-md space-y-4 rounded-xl p-6 text-center">
        <h1 className="cyber-heading text-2xl font-semibold text-cyan-50">
          Password updated
        </h1>
        <p className="text-sm text-cyan-100/80">
          Your password has been changed.
        </p>
        <button
          type="button"
          onClick={() => router.push("/dashboard")}
          className="cyber-btn-primary w-full font-medium"
        >
          Go to dashboard
        </button>
      </div>
    );
  }

  if (sessionReady && !hasSession && !envError) {
    return (
      <div className="glass mx-auto mt-10 max-w-md space-y-4 rounded-xl p-6 text-center">
        <h1 className="cyber-heading text-2xl font-semibold text-cyan-50">
          Link expired
        </h1>
        <p className="text-sm text-cyan-100/80">
          This password reset link is invalid or has expired.
        </p>
        <Link
          href="/forgot-password"
          className="block text-sm text-cyan-300 hover:text-cyan-200"
        >
          Request a new link
        </Link>
      </div>
    );
  }

  return (
    <form
      onSubmit={onSubmit}
      className="glass mx-auto mt-10 max-w-md space-y-4 rounded-xl p-6"
    >
      <h1 className="cyber-heading text-2xl font-semibold text-cyan-50">
        Set a new password
      </h1>
      <div className="space-y-1">
        <input
          className="w-full rounded-md border border-cyan-500/25 bg-black/35 px-3 py-2"
          placeholder="New password"
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          minLength={8}
          required
        />
        <p className="text-xs text-cyan-100/60">{PASSWORD_REQUIREMENTS_HINT}</p>
      </div>
      <input
        className="w-full rounded-md border border-cyan-500/25 bg-black/35 px-3 py-2"
        placeholder="Confirm new password"
        type="password"
        value={confirmPassword}
        onChange={(event) => setConfirmPassword(event.target.value)}
        minLength={8}
        required
      />
      {envError ? <p className="text-sm text-danger">{envError}</p> : null}
      {error ? <p className="text-sm text-danger">{error}</p> : null}
      <button
        className="cyber-btn-primary w-full font-medium"
        disabled={loading || Boolean(envError)}
      >
        {loading ? "Updating..." : "Update password"}
      </button>
    </form>
  );
}
