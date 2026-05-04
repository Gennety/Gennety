import { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import GoogleProvider from "next-auth/providers/google";
import { prisma } from "@/lib/db";
import bcrypt from "bcryptjs";

// Cookie domain for cross-subdomain session sharing (e.g. ".gennety.com")
// Strip surrounding quotes to be safe across different env-file parsers
const cookieDomain = process.env.NEXTAUTH_COOKIE_DOMAIN?.replace(/^["']|["']$/g, "") || undefined;
const useSecureCookies = process.env.NEXTAUTH_URL?.startsWith("https://") ?? false;

// Log cookie config once on cold start (visible in Docker logs)
console.log(`[auth] cookie config — domain=${cookieDomain ?? "(auto)"} secure=${useSecureCookies} NEXTAUTH_URL=${process.env.NEXTAUTH_URL}`);

export const authOptions: NextAuthOptions = {
  debug: process.env.NODE_ENV === "development",
  session: { strategy: "jwt" },

  pages: {
    signIn: "/login",
  },

  cookies: cookieDomain
    ? {
        sessionToken: {
          name: useSecureCookies
            ? "__Secure-next-auth.session-token"
            : "next-auth.session-token",
          options: {
            httpOnly: true,
            sameSite: "lax",
            path: "/",
            secure: useSecureCookies,
            domain: cookieDomain,
          },
        },
        callbackUrl: {
          name: useSecureCookies
            ? "__Secure-next-auth.callback-url"
            : "next-auth.callback-url",
          options: {
            httpOnly: true,
            sameSite: "lax",
            path: "/",
            secure: useSecureCookies,
            domain: cookieDomain,
          },
        },
        csrfToken: {
          name: useSecureCookies
            ? "__Host-next-auth.csrf-token"
            : "next-auth.csrf-token",
          options: {
            httpOnly: true,
            sameSite: "lax",
            path: "/",
            secure: useSecureCookies,
          },
        },
      }
    : undefined,

  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID ?? "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
    }),

    CredentialsProvider({
      name: "Email",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        const owner = await prisma.owner.findUnique({
          where: { email: credentials.email },
        });

        if (!owner || !owner.passwordHash) return null;

        const valid = await bcrypt.compare(credentials.password, owner.passwordHash);
        if (!valid) return null;

        return {
          id: owner.id,
          email: owner.email,
          name: owner.name,
          image: owner.image,
          onboarded: owner.onboarded,
        };
      },
    }),
  ],

  events: {
    signIn: ({ user, account }) => {
      console.log(`[auth] signIn event — ${user.email} via ${account?.provider} — JWT cookie will be set`);
    },
  },

  callbacks: {
    async redirect({ url, baseUrl }) {
      // Explicit redirect callback with logging for production debugging
      if (url.startsWith("/")) {
        console.log(`[auth] redirect: "${url}" → "${baseUrl}${url}"`);
        return `${baseUrl}${url}`;
      }
      try {
        if (new URL(url).origin === baseUrl) {
          console.log(`[auth] redirect: same-origin "${url}"`);
          return url;
        }
      } catch { /* invalid URL, fall through */ }
      console.log(`[auth] redirect: fallback to baseUrl "${baseUrl}" (url was "${url}")`);
      return baseUrl;
    },

    async signIn({ user, account }) {
      if (account?.provider === "google") {
        try {
          // Link Google account to existing or new Owner
          const existing = await prisma.owner.findUnique({
            where: { email: user.email! },
          });

          if (existing) {
            // Update image/name if not set
            await prisma.owner.update({
              where: { id: existing.id },
              data: {
                emailVerified: new Date(),
                image: existing.image ?? user.image,
                name: existing.name ?? user.name,
              },
            });

            // Link Google account if not already linked
            const linked = await prisma.account.findFirst({
              where: {
                userId: existing.id,
                provider: "google",
              },
            });

            if (!linked) {
              await prisma.account.create({
                data: {
                  userId: existing.id,
                  type: account.type,
                  provider: account.provider,
                  providerAccountId: account.providerAccountId,
                  access_token: account.access_token as string | undefined,
                  refresh_token: account.refresh_token as string | undefined,
                  expires_at: account.expires_at as number | undefined,
                  token_type: account.token_type as string | undefined,
                  scope: account.scope as string | undefined,
                  id_token: account.id_token as string | undefined,
                },
              });
            }

            user.id = existing.id;
            user.onboarded = existing.onboarded;
          } else {
            // Create new Owner from Google profile
            const newOwner = await prisma.owner.create({
              data: {
                email: user.email!,
                name: user.name,
                image: user.image,
                emailVerified: new Date(),
                onboarded: false,
              },
            });

            await prisma.account.create({
              data: {
                userId: newOwner.id,
                type: account.type,
                provider: account.provider,
                providerAccountId: account.providerAccountId,
                access_token: account.access_token as string | undefined,
                refresh_token: account.refresh_token as string | undefined,
                expires_at: account.expires_at as number | undefined,
                token_type: account.token_type as string | undefined,
                scope: account.scope as string | undefined,
                id_token: account.id_token as string | undefined,
              },
            });

            user.id = newOwner.id;
            user.onboarded = false;
          }

        } catch (err) {
          console.error("[auth] Google signIn callback error:", err);
          return false;
        }
      }

      return true;
    },

    async jwt({ token, user, trigger, session }) {
      if (user) {
        token.id = user.id;
        token.email = user.email;
        token.onboarded = user.onboarded;
      }

      // Allow session update to refresh onboarded status
      if (trigger === "update" && session?.onboarded !== undefined) {
        token.onboarded = session.onboarded;
      }

      // Safety net: if JWT says not onboarded, verify from DB.
      // Handles the case where updateSession() fails (NextAuth v4 + App Router).
      // Only runs for non-onboarded users — once true, never queries again.
      if (!token.onboarded && token.id) {
        try {
          const owner = await prisma.owner.findUnique({
            where: { id: token.id as string },
            select: { onboarded: true },
          });
          if (owner?.onboarded) {
            token.onboarded = true;
          }
        } catch {
          // Ignore — next request will retry
        }
      }

      return token;
    },

    async session({ session, token }) {
      session.user.id = token.id;
      session.user.email = token.email;
      session.user.onboarded = token.onboarded;
      return session;
    },
  },
};
