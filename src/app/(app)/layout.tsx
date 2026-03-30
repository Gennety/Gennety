"use client";

import Link from "next/link";
import { useSession, signOut } from "next-auth/react";
import { usePathname } from "next/navigation";

const landingUrl = process.env.NEXT_PUBLIC_LANDING_URL ?? "";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { data: session } = useSession();
  const pathname = usePathname();

  // Don't show nav on onboarding — it has its own header
  if (pathname === "/onboarding") {
    return <>{children}</>;
  }

  return (
    <div className="min-h-screen bg-[#050505]">
      <nav className="sticky top-0 z-50 backdrop-blur-xl bg-[#050505]/80 border-b border-[#1a1a1a]">
        <div className="flex items-center justify-between px-6 h-14 max-w-3xl mx-auto">
          <a href={landingUrl || "/"} className="text-lg font-semibold text-white">
            Gennety
          </a>
          <div className="flex items-center gap-5">
            <NavLink href="/home" active={pathname === "/home"}>
              Home
            </NavLink>
            <NavLink href="/matches" active={pathname === "/matches"}>
              Matches
            </NavLink>
            <NavLink href="/profile" active={pathname === "/profile"}>
              Profile
            </NavLink>
            <NavLink href="/activity" active={pathname === "/activity"}>
              Feed
            </NavLink>
            <NavLink href="/notify" active={pathname === "/notify"}>
              Notifications
            </NavLink>
            {session?.user && (
              <button
                onClick={() => signOut({ callbackUrl: landingUrl || "/" })}
                className="text-sm text-neutral-500 hover:text-white transition-colors"
              >
                Sign out
              </button>
            )}
          </div>
        </div>
      </nav>
      {children}
    </div>
  );
}

function NavLink({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={`text-sm transition-colors ${
        active ? "text-white" : "text-neutral-500 hover:text-neutral-300"
      }`}
    >
      {children}
    </Link>
  );
}
