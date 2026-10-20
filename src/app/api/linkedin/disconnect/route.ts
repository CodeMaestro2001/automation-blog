import { NextResponse } from "next/server";
import { assertAdmin, clearLinkedInConnection } from "@/lib/session";
import { hasValidOrigin } from "@/lib/request";

export async function POST(request: Request) {
  if (!hasValidOrigin(request)) return NextResponse.json({ error: "Invalid origin." }, { status: 403 });
  try {
    await assertAdmin();
    await clearLinkedInConnection();
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
}
