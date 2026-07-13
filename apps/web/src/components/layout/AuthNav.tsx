"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCurrentUser } from "@/lib/hooks/useCurrentUser";
import { CreditsPill } from "@/components/layout/CreditsPill";
import { ProfileMenu } from "@/components/layout/ProfileMenu";

export function AuthNav() {
  const router = useRouter();
  const {
    ready,
    isAuthenticated,
    userId,
    email,
    userMetadata,
    me,
    meLoading,
    updateProfile,
    signOut,
    deleteAccount,
  } = useCurrentUser();

  const onLogout = async () => {
    await signOut();
    router.push("/login");
    router.refresh();
  };

  const onAccountDeleted = async () => {
    router.push("/");
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
          <CreditsPill me={me} loading={meLoading} />
          <ProfileMenu
            userId={userId}
            email={email}
            userMetadata={userMetadata}
            updateProfile={updateProfile}
            deleteAccount={deleteAccount}
            onLogout={onLogout}
            onAccountDeleted={onAccountDeleted}
          />
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
