import { NextResponse } from "next/server";
import { getAuthenticatedOwner } from "@/lib/auth";
import { listMyCommunities } from "@/lib/services/community";

export async function GET() {
  const auth = await getAuthenticatedOwner();
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const communities = await listMyCommunities(auth.ownerId);
  return NextResponse.json({ communities });
}
