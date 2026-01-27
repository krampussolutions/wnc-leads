import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const form = await req.formData();
  const full_name = String(form.get("full_name") || "").trim();
  const account_type = String(form.get("account_type") || "contractor").trim();
  const email = String(form.get("email") || "").trim();
  const password = String(form.get("password") || "");

  if (!email || !password || !full_name) {
    return NextResponse.redirect(
      new URL("/signup?error=Missing%20required%20fields", req.url),
      { status: 303 }
    );
  }

  const supabase = await createSupabaseServer();

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { full_name, account_type },
    },
  });

  if (error) {
    return NextResponse.redirect(
      new URL(`/signup?error=${encodeURIComponent(error.message)}`, req.url),
      { status: 303 }
    );
  }

  // ✅ If email confirmations are ON, data.session will be null → show "check email" ON signup page
  if (!data.session) {
    return NextResponse.redirect(
      new URL(`/signup?check_email=1&email=${encodeURIComponent(email)}`, req.url),
      { status: 303 }
    );
  }

  // If confirmations are OFF, session exists immediately
  return NextResponse.redirect(new URL("/dashboard", req.url), { status: 303 });
}
