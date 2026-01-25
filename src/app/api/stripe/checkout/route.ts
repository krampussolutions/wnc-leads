import { NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe";
import { createSupabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    // 1) Read env safely (no "!" crashes)
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL;
    const priceId =
      process.env.STRIPE_PRICE_ID || process.env.STRIPE_PRICE_SUBSCRIPTION;

    if (!priceId) {
      return NextResponse.json(
        { error: "Missing STRIPE_PRICE_ID (or STRIPE_PRICE_SUBSCRIPTION)" },
        { status: 500 }
      );
    }

    if (
      !baseUrl ||
      (!baseUrl.startsWith("https://") && !baseUrl.startsWith("http://localhost"))
    ) {
      return NextResponse.json(
        { error: "NEXT_PUBLIC_SITE_URL must be https:// (or localhost for dev)" },
        { status: 500 }
      );
    }

    // 2) Stripe client (this can throw if STRIPE_SECRET_KEY is wrong/missing)
    const stripe = getStripe();

    // 3) Require authenticated user (POST comes from /pricing)
    const supabase = await createSupabaseServer();
    const { data: auth, error: authErr } = await supabase.auth.getUser();

    if (authErr) {
      console.error("supabase.auth.getUser error:", authErr);
      return NextResponse.json({ error: authErr.message }, { status: 401 });
    }

    if (!auth?.user) {
      return NextResponse.json(
        { error: "Not authenticated. Please log in first." },
        { status: 401 }
      );
    }

    const userId = auth.user.id;

    // 4) Ensure profile exists
    const { data: profile, error: profileErr } = await supabaseAdmin
      .from("profiles")
      .select("id,email,stripe_customer_id")
      .eq("id", userId)
      .maybeSingle();

    if (profileErr) {
      console.error("profiles select error:", profileErr);
      return NextResponse.json({ error: profileErr.message }, { status: 500 });
    }

    if (!profile?.email) {
      return NextResponse.json(
        { error: "Profile not found or missing email. Run migration + sign up again." },
        { status: 500 }
      );
    }

    // 5) Create Stripe customer if missing
    let customerId = (profile.stripe_customer_id as string | null) ?? null;

    if (!customerId) {
      const customer = await stripe.customers.create({
        email: profile.email,
        metadata: { supabase_user_id: userId },
      });

      customerId = customer.id;

      const { error: updErr } = await supabaseAdmin
        .from("profiles")
        .update({ stripe_customer_id: customerId })
        .eq("id", userId);

      if (updErr) {
        console.error("profiles update error:", updErr);
        return NextResponse.json({ error: updErr.message }, { status: 500 });
      }
    }

    // 6) Create Checkout session
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      allow_promotion_codes: true,
      success_url: `${baseUrl}/dashboard?checkout=success`,
      cancel_url: `${baseUrl}/pricing?checkout=cancel`,
      subscription_data: { metadata: { supabase_user_id: userId } },
      metadata: { supabase_user_id: userId },
    });

    if (!session.url) {
      return NextResponse.json(
        { error: "Stripe session created but missing session.url" },
        { status: 500 }
      );
    }

    // Return URL for fetch-based flows OR redirect for form POST
    return NextResponse.redirect(session.url, { status: 303 });
  } catch (e: any) {
    console.error("Checkout route fatal error:", e);
    return NextResponse.json(
      { error: e?.message ?? "Unknown error" },
      { status: 500 }
    );
  }
}
