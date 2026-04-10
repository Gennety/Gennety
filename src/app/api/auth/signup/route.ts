import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";
import bcrypt from "bcryptjs";
import { z } from "zod";

const SignupSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  name: z.string().optional(),
});

export async function POST(request: NextRequest) {
  const rateLimited = rateLimit(request, { maxRequests: 5, windowMs: 60_000, keyPrefix: "signup" });
  if (rateLimited) return rateLimited;

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = SignupSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 }
    );
  }

  const { email, password, name } = parsed.data;

  const existing = await prisma.owner.findUnique({ where: { email } });
  if (existing) {
    return NextResponse.json(
      { error: "An account with this email already exists. Try signing in." },
      { status: 409 }
    );
  }

  const passwordHash = await bcrypt.hash(password, 12);

  await prisma.owner.create({
    data: {
      email,
      name: name || null,
      passwordHash,
      onboarded: false,
    },
  });

  return NextResponse.json({ ok: true });
}
