import { NextResponse } from "next/server";
import { createAdminSession } from "@/lib/session";
import { hasValidOrigin } from "@/lib/request";
import { safeEqual } from "@/lib/crypto";

export async function POST(request: Request) {
  if (!hasValidOrigin(request)) return NextResponse.json({ error: "Invalid origin." }, { status: 403 });
  const configured = process.env.PUBLISHER_PASSWORD;
  if (!configured) return NextResponse.json({ error: "PUBLISHER_PASSWORD is not configured." }, { status: 503 });
  const body = (await request.json()) as { password?: string };
  if (!body.password || !safeEqual(body.password, configured)) {
    return NextResponse.json({ error: "That password is not correct." }, { status: 401 });
  }
  await createAdminSession();
  return NextResponse.json({ ok: true });
}
