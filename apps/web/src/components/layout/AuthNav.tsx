"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createClient, getSupabaseEnvError } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

export function AuthNav() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [ready, setReady] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const envError = getSupabaseEnvError();
    if (envError) {
      setReady(true);
      setIsAuthenticated(false);
      return;
    }

    const supabase = createClient();

    void supabase.auth.getSession().then(({ data }) => {
      setIsAuthenticated(Boolean(data.session));
      setReady(true);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setIsAuthenticated(Boolean(session));
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const onLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    setIsAuthenticated(false);
    router.push("/login");
    router.refresh();
  };

  return (
    <nav className="flex items-center gap-2 text-xs text-cyan-100/80 sm:gap-4 sm:text-sm">
      <Link href="/pricing" className="hover:text-cyan-200">
        Pricing
      </Link>
      {!ready ? (
        <span className="text-cyan-100/50">...</span>
      ) : isAuthenticated ? (
        <>
          <Link href="/dashboard" className="hover:text-cyan-200">
            Dashboard
          </Link>
          <button
            type="button"
            onClick={onLogout}
            className="cyber-btn whitespace-nowrap px-2.5 py-1.5 sm:px-3"
          >
            Logout
          </button>
        </>
      ) : (
        <>
          <Link href="/login" className="hover:text-cyan-200">
            Login
          </Link>
          <Link
            href="/signup"
            className="cyber-btn-primary whitespace-nowrap px-2.5 py-1.5 sm:px-3"
          >
            Sign up
          </Link>
        </>
      )}
    </nav>
  );
}
