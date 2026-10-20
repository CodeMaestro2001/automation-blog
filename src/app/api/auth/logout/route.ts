import { NextResponse } from "next/server";
import { clearAdminSession } from "@/lib/session";
import { hasValidOrigin } from "@/lib/request";

export async function POST(request: Request) {
  if (!hasValidOrigin(request)) return NextResponse.json({ error: "Invalid origin." }, { status: 403 });
  await clearAdminSession();
  return NextResponse.json({ ok: true });
}
