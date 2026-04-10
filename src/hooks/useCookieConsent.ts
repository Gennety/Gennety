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

interface StoredConsent {
  version: string;
  action: string;
  consents: ConsentCategories;
}

function getSessionId(): string {
  if (typeof window === "undefined") return "";
  try {
    let id = localStorage.getItem(SESSION_STORAGE_KEY);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(SESSION_STORAGE_KEY, id);
    }
    return id;
  } catch {
    return crypto.randomUUID();
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

export function useCookieConsent() {
  const [hasConsented, setHasConsented] = useState(true); // default true to avoid flash
  const [currentConsents, setCurrentConsents] =
    useState<ConsentCategories | null>(null);

  useEffect(() => {
    const stored = getStoredConsent();
    if (stored) {
      setHasConsented(true);
      setCurrentConsents(stored.consents);
    } else {
      setHasConsented(false);
    }
  }, []);

  const submitConsent = useCallback(
    async (
      action: "accepted" | "rejected" | "partial",
      consents: ConsentCategories
    ) => {
      const sessionId = getSessionId();
      try {
        await fetch("/api/consent", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            session_id: sessionId,
            policy_version: POLICY_VERSION,
            action,
            consents,
          }),
        });
      } catch {
        // Silently fail — localStorage still records choice for UX
      }

      try {
        const entry: StoredConsent = {
          version: POLICY_VERSION,
          action,
          consents,
        };
        localStorage.setItem(CONSENT_STORAGE_KEY, JSON.stringify(entry));
      } catch {
        // localStorage unavailable (incognito, quota) — still update state
      }
      setHasConsented(true);
      setCurrentConsents(consents);
    },
    []
  );

  const withdrawConsent = useCallback(async () => {
    const sessionId = getSessionId();
    const consents: ConsentCategories = {
      necessary: true,
      analytics: false,
      marketing: false,
      functional: false,
    };
    try {
      await fetch("/api/consent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: sessionId,
          policy_version: POLICY_VERSION,
          action: "withdrawn",
          consents,
        }),
      });
    } catch {
      // Silently fail
    }

    try {
      localStorage.removeItem(CONSENT_STORAGE_KEY);
    } catch {
      // localStorage unavailable
    }
    setHasConsented(false);
    setCurrentConsents(null);
  }, []);

  return { hasConsented, currentConsents, submitConsent, withdrawConsent };
}
