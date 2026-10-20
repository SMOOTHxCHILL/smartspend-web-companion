/*
 * GET /api/app/download — logged-in users only.
 * Sends the browser to a short-lived signed link for the APK stored in
 * the private Supabase Storage bucket "apk".
 */
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/supabaseServer";

const APK_BUCKET = "apk";
const APK_PATH = "smartspend.apk";

export async function GET(request: Request) {
  const auth = await requireUser(request);
  if (auth instanceof NextResponse) {
    return NextResponse.redirect(new URL("/login?next=/account", request.url));
  }

  const { data, error } = await auth.supabase.storage
    .from(APK_BUCKET)
    .createSignedUrl(APK_PATH, 120, { download: "SmartSpend.apk" });

  if (error || !data?.signedUrl) {
    return NextResponse.json(
      { error: "The Android app hasn't been uploaded yet." },
      { status: 404 },
    );
  }

  return NextResponse.redirect(data.signedUrl, { status: 303 });
}
