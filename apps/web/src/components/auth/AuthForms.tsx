"use client";

import { FormEvent, useState } from "react";
import { createClient, getSupabaseEnvError } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const envError = getSupabaseEnvError();

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
        redirectTo: `${window.location.origin}/auth/callback?next=/dashboard`,
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
      <input
        className="w-full rounded-md border border-cyan-500/25 bg-black/35 px-3 py-2"
        placeholder="Password"
        type="password"
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        required
      />
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
        redirectTo: `${window.location.origin}/auth/callback?next=/dashboard`,
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
    const { error: signupError } = await supabase.auth.signUp({
      email,
      password,
    });
    setLoading(false);

    if (signupError) {
      setError(signupError.message);
      return;
    }

    router.push("/dashboard");
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
      <input
        className="w-full rounded-md border border-cyan-500/25 bg-black/35 px-3 py-2"
        placeholder="Password"
        type="password"
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        required
      />
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
    </form>
  );
}
