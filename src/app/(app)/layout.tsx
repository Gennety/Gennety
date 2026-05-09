"use client";

import Link from "next/link";
import { useSession, signOut } from "next-auth/react";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { UnreadProvider, useUnread } from "@/contexts/unread-context";

const landingUrl = process.env.NEXT_PUBLIC_LANDING_URL ?? "";

/* ── Types ── */

interface ProfileBrief {
  name: string | null;
  image: string | null;
  context: {
    ownerName: string | null;
    ownerProfession: string | null;
    ownerDomain: string | null;
    ownerLocation: string | null;
    expertise: string[];
    freshnessState: string;
    currentWork: string;
  } | null;
  reputation: {
    score: number;
    completedMatches: number;
  };
}

/* ── Layout ── */

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { data: session } = useSession();
  const pathname = usePathname();
  const t = useTranslations();

  if (pathname.startsWith("/onboarding")) {
    return <>{children}</>;
  }

  return (
    <UnreadProvider>
      <div className="min-h-screen bg-[#050505]">
        <header className="sticky top-0 z-50 flex h-12 items-center justify-between border-b border-[#1a1a1a] bg-[#050505]/80 px-4 backdrop-blur-xl lg:hidden">
          <a href={landingUrl || "/"} className="text-base font-bold text-white">
            Gennety
          </a>
          <Link
            href="/settings"
            className={`rounded-lg p-2 transition-colors ${
              pathname === "/settings" ? "text-white" : "text-neutral-500 hover:text-white"
            }`}
          >
            <SettingsIcon />
          </Link>
        </header>

        <div
          className="mx-auto min-h-[calc(100vh-3rem)] lg:grid lg:min-h-screen lg:max-w-[1280px]"
          style={{ gridTemplateColumns: "minmax(0, 1fr) minmax(0, 2.5fr) minmax(0, 0.75fr)" }}
        >
          <aside className="sticky top-0 hidden h-screen min-w-0 flex-col border-r border-[#1a1a1a] px-5 py-6 lg:flex">
            <a
              href={landingUrl || "/"}
              className="mb-10 px-3 text-xl font-bold text-white"
            >
              Gennety
            </a>

            <nav className="flex flex-1 flex-col gap-1">
              <SidebarLink href="/home" active={pathname === "/home"}>
                <HomeIcon />
                {t("nav.home")}
              </SidebarLink>
              <SidebarLink href="/activity" active={pathname === "/activity"}>
                <FeedIcon />
                {t("nav.feed")}
              </SidebarLink>
              <SidebarLink href="/communities" active={pathname === "/communities" || pathname.startsWith("/communities/")}>
                <CommunityIcon />
                {t("nav.communities")}
              </SidebarLink>
              <SidebarLink href="/matches" active={pathname === "/matches"}>
                <MatchesIcon />
                {t("nav.matches")}
              </SidebarLink>
              <ChatsSidebarLink active={pathname === "/chats" || pathname.startsWith("/chat/")} />
              <SidebarLink
                href="/notify"
                active={pathname === "/notify"}
              >
                <BellIcon />
                {t("nav.notifications")}
              </SidebarLink>
              <SidebarLink href="/settings" active={pathname === "/settings"}>
                <SettingsIcon />
                {t("nav.settings")}
              </SidebarLink>
            </nav>
          </aside>

          <main className="min-w-0 lg:border-r lg:border-[#1a1a1a]">
            {children}
          </main>

          <aside className="sticky top-0 hidden h-screen min-w-0 flex-col overflow-hidden px-5 py-6 lg:flex">
            <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden pr-1">
              <ProfileSidebar />
            </div>
            <div
              id="app-right-sidebar-slot"
              className="mt-4 shrink-0 flex flex-col items-stretch justify-start"
            />
            <div className="mt-4">
              {session?.user && (
                <button
                  onClick={() => signOut({ callbackUrl: landingUrl || "/" })}
                  className="w-full rounded-lg border border-neutral-800 py-2.5 text-sm text-neutral-500 transition-colors hover:border-neutral-600 hover:text-white"
                >
                  {t("common.signOut")}
                </button>
              )}
            </div>
          </aside>
        </div>

        <nav className="sticky bottom-0 z-50 flex h-14 items-center justify-around border-t border-[#1a1a1a] bg-[#050505]/90 backdrop-blur-xl lg:hidden">
          <MobileNavLink href="/home" active={pathname === "/home"}>
            <HomeIcon />
          </MobileNavLink>
          <MobileNavLink href="/activity" active={pathname === "/activity"}>
            <FeedIcon />
          </MobileNavLink>
          <MobileNavLink href="/communities" active={pathname === "/communities" || pathname.startsWith("/communities/")}>
            <CommunityIcon />
          </MobileNavLink>
          <MobileNavLink href="/matches" active={pathname === "/matches"}>
            <MatchesIcon />
          </MobileNavLink>
          <ChatsMobileLink active={pathname === "/chats" || pathname.startsWith("/chat/")} />
          <MobileNavLink href="/notify" active={pathname === "/notify"}>
            <BellIcon />
          </MobileNavLink>
          <MobileNavLink href="/profile" active={pathname === "/profile"}>
            <ProfileIcon />
          </MobileNavLink>
        </nav>
      </div>
    </UnreadProvider>
  );
}

/* ── Chats Sidebar Link with Badge ── */

function ChatsSidebarLink({ active }: { active: boolean }) {
  const { unreadCount } = useUnread();
  const t = useTranslations();
  return (
    <Link
      href="/chats"
      className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
        active
          ? "bg-neutral-800/70 text-white"
          : "text-neutral-400 hover:bg-neutral-800/40 hover:text-white"
      }`}
    >
      <div className="relative">
        <ChatIcon />
        {unreadCount > 0 && (
          <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 px-1 flex items-center justify-center bg-blue-500 text-white text-[10px] font-bold rounded-full">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </div>
      {t("nav.chats")}
    </Link>
  );
}

/* ── Chats Mobile Link with Badge ── */

function ChatsMobileLink({ active }: { active: boolean }) {
  const { unreadCount } = useUnread();
  return (
    <Link
      href="/chats"
      className={`relative flex items-center justify-center w-12 h-12 transition-colors ${
        active ? "text-white" : "text-neutral-500"
      }`}
    >
      <ChatIcon />
      {unreadCount > 0 && (
        <span className="absolute top-1 right-0 min-w-[16px] h-4 px-1 flex items-center justify-center bg-blue-500 text-white text-[10px] font-bold rounded-full">
          {unreadCount > 99 ? "99+" : unreadCount}
        </span>
      )}
    </Link>
  );
}

/* ── Sidebar Nav Link ── */

function SidebarLink({
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
      className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
        active
          ? "bg-neutral-800/70 text-white"
          : "text-neutral-400 hover:bg-neutral-800/40 hover:text-white"
      }`}
    >
      {children}
    </Link>
  );
}

/* ── Mobile Nav Link ── */

function MobileNavLink({
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
      className={`flex items-center justify-center w-12 h-12 transition-colors ${
        active ? "text-white" : "text-neutral-500"
      }`}
    >
      {children}
    </Link>
  );
}

/* ── Profile Sidebar ── */

function ProfileSidebar() {
  const { data: session, status: sessionStatus } = useSession();
  const [profile, setProfile] = useState<ProfileBrief | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const t = useTranslations();

  useEffect(() => {
    if (sessionStatus !== "authenticated") return;
    fetch("/api/profile")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data) {
          setProfile(data);
          setAvatarUrl(data.image ?? null);
        }
      })
      .catch(() => {});
  }, [sessionStatus]);

  const ctx = profile?.context;
  const name = ctx?.ownerName ?? profile?.name ?? session?.user?.name ?? null;

  const handleAvatarUpload = useCallback(async (file: File) => {
    setUploading(true);
    try {
      const form = new FormData();
      form.append("avatar", file);
      const res = await fetch("/api/profile/avatar", { method: "POST", body: form });
      if (res.ok) {
        const data = await res.json();
        setAvatarUrl(data.image);
      }
    } catch {
      // Silently fail — user can retry
    } finally {
      setUploading(false);
    }
  }, []);

  const onFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleAvatarUpload(file);
    e.target.value = "";
  }, [handleAvatarUpload]);

  const hasPhoto = !!avatarUrl;

  return (
    <div className="flex flex-col gap-3">
      {/* Profile card */}
      <Link
        href="/profile"
        className="block rounded-xl border border-neutral-800 bg-neutral-900/50 p-4 hover:border-neutral-700 transition-colors"
      >
        {/* Avatar */}
        {avatarUrl ? (
          <img
            src={avatarUrl}
            alt={name ?? "Profile"}
            className="w-10 h-10 rounded-full object-cover mb-3"
          />
        ) : (
          <div className="w-10 h-10 rounded-full bg-neutral-800 flex items-center justify-center text-sm font-semibold text-neutral-400 mb-3">
            {name ? name.charAt(0).toUpperCase() : "?"}
          </div>
        )}

        {/* Name & profession */}
        <p className="text-sm font-semibold text-white truncate">
          {name ?? t("profile.title")}
        </p>
        {ctx?.ownerProfession && (
          <p className="text-xs text-neutral-500 truncate mt-0.5">
            {ctx.ownerProfession}
            {ctx.ownerDomain ? ` · ${ctx.ownerDomain}` : ""}
          </p>
        )}
        {ctx?.ownerLocation && (
          <p className="text-xs text-neutral-600 mt-0.5">{ctx.ownerLocation}</p>
        )}

        {/* Stats row */}
        {profile && (
          <div className="flex gap-4 mt-3 pt-3 border-t border-neutral-800">
            <div>
              <span className="text-sm font-semibold text-white">
                {profile.reputation.completedMatches}
              </span>
              <span className="text-[11px] text-neutral-500 ml-1">{t("sidebar.matches")}</span>
            </div>
            <div>
              <span className="text-sm font-semibold text-white">
                {profile.reputation.score.toFixed(0)}
              </span>
              <span className="text-[11px] text-neutral-500 ml-1">{t("sidebar.score")}</span>
            </div>
          </div>
        )}

        {/* Freshness */}
        {ctx?.freshnessState && (
          <div className="mt-3">
            <FreshnessDot state={ctx.freshnessState} />
          </div>
        )}
      </Link>


      {/* Recommended step — add photo */}
      {profile && !hasPhoto && (
        <div className="animate-rec-slide-in rounded-xl border border-neutral-800 bg-gradient-to-br from-neutral-900/80 to-neutral-900/40 p-4">
          <div className="flex items-center gap-2 mb-2">
            <span className="flex items-center justify-center w-5 h-5 rounded-full bg-blue-500/15 text-blue-400">
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M1 12.5l3.5-3.5a1.5 1.5 0 012.12 0L9 11.38l1.88-1.88a1.5 1.5 0 012.12 0L15 11.5" />
                <rect x="1" y="2" width="14" height="12" rx="2" />
                <circle cx="5" cy="6" r="1.25" />
              </svg>
            </span>
            <span className="text-[11px] font-semibold text-blue-400 uppercase tracking-wider">
              {t("sidebar.recommended")}
            </span>
          </div>

          <p className="text-[13px] text-neutral-300 leading-snug mb-3">
            {t("sidebar.addPhotoDesc")}
          </p>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            className="hidden"
            onChange={onFileChange}
          />

          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="w-full py-2 text-[13px] font-medium text-white bg-blue-600/20 hover:bg-blue-600/30 border border-blue-500/25 rounded-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {uploading ? (
              <span className="flex items-center justify-center gap-2">
                <span className="w-3.5 h-3.5 border-2 border-blue-400/30 border-t-blue-400 rounded-full animate-spin" />
                {t("sidebar.uploading")}
              </span>
            ) : (
              t("sidebar.addPhoto")
            )}
          </button>
        </div>
      )}
    </div>
  );
}

/* ── Freshness Dot ── */

function FreshnessDot({ state }: { state: string }) {
  const t = useTranslations("freshness");
  const config: Record<string, { color: string; label: string }> = {
    ACTIVE: { color: "bg-green-400", label: t("active") },
    AGING: { color: "bg-yellow-400", label: t("aging") },
    STALE: { color: "bg-amber-400", label: t("stale") },
    INACTIVE: { color: "bg-neutral-500", label: t("inactive") },
  };
  const c = config[state] ?? config.INACTIVE!;
  return (
    <span className="flex items-center gap-1.5 text-[11px] text-neutral-500">
      <span className={`w-1.5 h-1.5 rounded-full ${c.color}`} />
      {c.label}
    </span>
  );
}

/* ── Icons (20×20) ── */

function HomeIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 7.5L10 2l7 5.5V17a1 1 0 01-1 1h-4v-5H8v5H4a1 1 0 01-1-1V7.5z" />
    </svg>
  );
}

function FeedIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 5h14M3 10h10M3 15h7" />
    </svg>
  );
}

function MatchesIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="7" cy="8" r="3" />
      <circle cx="13" cy="8" r="3" />
      <path d="M2 17c0-2.5 2-4 5-4 .7 0 1.4.1 2 .3M11 13.3c.6-.2 1.3-.3 2-.3 3 0 5 1.5 5 4" />
    </svg>
  );
}

function CommunityIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 8.5a3 3 0 106 0 3 3 0 00-6 0z" />
      <path d="M2.5 16.5c.9-2.4 3.1-3.7 6.5-3.7s5.6 1.3 6.5 3.7" />
      <path d="M14.2 5.2a2.4 2.4 0 11.9 4.6M17.2 16.2c-.4-1.4-1.3-2.4-2.8-3" />
    </svg>
  );
}

function BellIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 2a6 6 0 00-6 6v3.586l-.707.707A1 1 0 004 14h12a1 1 0 00.707-1.707L16 11.586V8a6 6 0 00-6-6z" />
      <path d="M8 14v1a2 2 0 004 0v-1" />
    </svg>
  );
}

function ProfileIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="10" cy="7" r="3.5" />
      <path d="M3 18c0-3 3-5 7-5s7 2 7 5" />
    </svg>
  );
}

function ChatIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 4h12a2 2 0 012 2v7a2 2 0 01-2 2H8l-4 3v-3H3a1 1 0 01-1-1V6a2 2 0 012-2z" />
      <path d="M7 9h6M7 12h3" />
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 01-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
    </svg>
  );
}
