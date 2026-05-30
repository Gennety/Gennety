"use client";

import { useCallback, useEffect, useState } from "react";
import {
  POLICY_VERSION,
  CONSENT_STORAGE_KEY,
  SESSION_STORAGE_KEY,
} from "@/constants/consent";

export interface ConsentCategories {
  necessary: boolean;
  analytics: boolean;
  marketing: boolean;
  functional: boolean;
}

type ConsentAction = "accepted" | "rejected" | "partial" | "withdrawn";

interface StoredConsent {
  version: string;
  action: ConsentAction;
  consents: ConsentCategories;
  sessionId?: string;
  eventId?: string;
  serverRecorded?: boolean;
  pending?: boolean;
  updatedAt?: string;
}

function randomId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (c) =>
    (
      Number(c) ^
      (Math.floor(Math.random() * 256) & (15 >> (Number(c) / 4)))
    ).toString(16)
  );
}

function getSessionId(): string {
  if (typeof window === "undefined") return "";
  try {
    let id = localStorage.getItem(SESSION_STORAGE_KEY);
    if (!id) {
      id = randomId();
      localStorage.setItem(SESSION_STORAGE_KEY, id);
    }
    return id;
  } catch {
    return randomId();
  }
}

function getStoredConsent(): StoredConsent | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(CONSENT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredConsent;
    if (parsed.version !== POLICY_VERSION) return null;
    return parsed;
  } catch {
    return null;
  }
}

function getConsentSource(): "website" | "app" {
  if (typeof window === "undefined") return "website";
  return window.location.hostname === "app.gennety.com" ? "app" : "website";
}

function getPageUrl(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.location.href;
  } catch {
    return null;
  }
}

function writeStoredConsent(entry: StoredConsent) {
  try {
    localStorage.setItem(CONSENT_STORAGE_KEY, JSON.stringify(entry));
  } catch {
    // localStorage unavailable
  }
}

function makeConsentEntry(action: ConsentAction, consents: ConsentCategories): StoredConsent {
  return {
    version: POLICY_VERSION,
    action,
    consents,
    sessionId: getSessionId(),
    eventId: randomId(),
    serverRecorded: false,
    pending: true,
    updatedAt: new Date().toISOString(),
  };
}

async function recordConsent(entry: StoredConsent): Promise<boolean> {
  const response = await fetch("/api/consent", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      eventId: entry.eventId,
      action: entry.action,
      consents: entry.consents,
      sessionId: entry.sessionId,
      pageUrl: getPageUrl(),
      source: getConsentSource(),
    }),
  });
  return response.ok;
}

function markServerRecorded(eventId: string | undefined) {
  if (!eventId) return;
  const stored = getStoredConsent();
  if (!stored || stored.eventId !== eventId) return;
  writeStoredConsent({
    ...stored,
    serverRecorded: true,
    pending: false,
    updatedAt: new Date().toISOString(),
  });
}

function getInitialConsentState() {
  const stored = getStoredConsent();
  return {
    hasConsented: Boolean(stored && stored.action !== "withdrawn"),
    currentConsents: stored?.consents ?? null,
  };
}

export function useCookieConsent() {
  const [consentState, setConsentState] = useState(getInitialConsentState);

  useEffect(() => {
    const stored = getStoredConsent();
    if (!stored?.pending || stored.serverRecorded || !stored.eventId) return;
    let cancelled = false;

    recordConsent(stored)
      .then((success) => {
        if (!cancelled && success) markServerRecorded(stored.eventId);
      })
      .catch(() => {
        // Keep pending entry for the next page load.
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const submitConsent = useCallback(
    async (
      action: "accepted" | "rejected" | "partial",
      consents: ConsentCategories
    ) => {
      const entry = makeConsentEntry(action, consents);
      writeStoredConsent(entry);
      setConsentState({
        hasConsented: true,
        currentConsents: consents,
      });

      try {
        if (await recordConsent(entry)) markServerRecorded(entry.eventId);
      } catch {
        // Keep pending entry for the next page load.
      }
    },
    []
  );

  const withdrawConsent = useCallback(async () => {
    const consents: ConsentCategories = {
      necessary: true,
      analytics: false,
      marketing: false,
      functional: false,
    };
    const entry = makeConsentEntry("withdrawn", consents);
    writeStoredConsent(entry);
    setConsentState({
      hasConsented: false,
      currentConsents: null,
    });

    try {
      if (await recordConsent(entry)) markServerRecorded(entry.eventId);
    } catch {
      // Keep pending entry for the next page load.
    }
  }, []);

  return {
    hasConsented: consentState.hasConsented,
    currentConsents: consentState.currentConsents,
    submitConsent,
    withdrawConsent,
  };
}
