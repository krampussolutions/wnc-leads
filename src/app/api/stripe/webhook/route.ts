// src/app/api/stripe/webhook/route.ts
import { NextResponse } from "next/server";
import Stripe from "stripe";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function asStringId(v: unknown): string | null {
  if (!v) return null;
  if (typeof v === "string") return v;
  // Stripe sometimes expands objects
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const anyV = v as any;
  if (anyV?.id && typeof anyV.id === "string") return anyV.id;
  return null;
}

function mapStatusToApp(status: string): "active" | "trialing" | "canceled" | "incomplete" | "past_due" | "unpaid" | "paused" {
  // Normalize Stripe statuses to what you store in profiles.subscription_status
  // You can change this mapping, but DO NOT write "pending" anywhere.
  switch (status) {
    case "active":
      return "active";
    case "trialing":
      return "trialing";
    case "canceled":
      return "canceled";
    case "incomplete":
    case "incomplete_expired":
      return "incomplete";
    case "past_due":
      return "past_due";
    case "unpaid":
      return "unpaid";
    case "paused":
      return "paused";
    default:
      // fallback: treat unknown as incomplete
      return "incomplete";
  }
}

export async function POST(req: Request) {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!secretKey) {
    return NextResponse.json({ error: "Missing STRIPE_SECRET_KEY" }, { status: 500 });
  }
  if (!webhookSecret) {
    return NextResponse.json({ error: "Missing STRIPE_WEBHOOK_SECRET" }, { status: 500 });
  }

  const stripe = new Stripe(secretKey, { apiVersion: "2024-06-20" });

  // IMPORTANT: must use raw body for Stripe signature verification
  const body = await req.text();
  const sig = req.headers.get("stripe-signature");
  if (!sig) {
    return NextResponse.json({ error: "Missing stripe-signature" }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, webhookSecret);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "unknown";
    return NextResponse.json({ error: `Webhook signature verification failed: ${message}` }, { status: 400 });
  }

  try {
    switch (event.type) {
      // 1) Checkout finished (we get customer + subscription + metadata)
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;

        const customerId = asStringId(session.customer);
        const subscriptionId = asStringId(session.subscription);

        // We set this in checkout:
        // metadata: { supabase_user_id: userId }
        const userId = (session.metadata?.supabase_user_id as string | undefined) ?? null;

        // If your checkout used a different key earlier, keep this fallback:
        const userIdFallback = (session.metadata?.user_id as string | undefined) ?? null;
        const finalUserId = userId ?? userIdFallback;

        if (finalUserId) {
          await supabaseAdmin
            .from("profiles")
            .update({
              stripe_customer_id: customerId,
              stripe_subscription_id: subscriptionId,
              subscription_status: "active",
            })
            .eq("id", finalUserId);
        }

        break;
      }

      // 2) Subscription changes (the TRUE source of subscription state)
      // These keep you synced if payment fails, user cancels, etc.
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;

        const customerId = asStringId(sub.customer);
        const subscriptionId = sub.id;

        const stripeStatus =
          event.type === "customer.subscription.deleted" ? "canceled" : sub.status;

        const appStatus = mapStatusToApp(stripeStatus);

        // Try match by subscription id first (most precise)
        const { data: matchedBySub } = await supabaseAdmin
          .from("profiles")
          .update({
            stripe_customer_id: customerId,
            stripe_subscription_id: subscriptionId,
            subscription_status: appStatus,
          })
          .eq("stripe_subscription_id", subscriptionId)
          .select("id")
          .maybeSingle();

        // If no row matched (e.g., first time), fallback to customer id
        if (!matchedBySub && customerId) {
          await supabaseAdmin
            .from("profiles")
            .update({
              stripe_customer_id: customerId,
              stripe_subscription_id: subscriptionId,
              subscription_status: appStatus,
            })
            .eq("stripe_customer_id", customerId);
        }

        break;
      }

      // 3) Optional: If you use invoice payment as activation gate, handle this too
      // This can flip someone from incomplete/past_due -> active after payment succeeds.
      case "invoice.paid":
      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;

        const customerId = asStringId(invoice.customer);
        const subscriptionId = asStringId(invoice.subscription);

        if (!customerId && !subscriptionId) break;

        const newStatus =
          event.type === "invoice.paid" ? "active" : "past_due";

        // Prefer subscription id if present
        if (subscriptionId) {
          const { data: bySub } = await supabaseAdmin
            .from("profiles")
            .update({ subscription_status: newStatus })
            .eq("stripe_subscription_id", subscriptionId)
            .select("id")
            .maybeSingle();

          if (!bySub && customerId) {
            await supabaseAdmin
              .from("profiles")
              .update({ subscription_status: newStatus })
              .eq("stripe_customer_id", customerId);
          }
        } else if (customerId) {
          await supabaseAdmin
            .from("profiles")
            .update({ subscription_status: newStatus })
            .eq("stripe_customer_id", customerId);
        }

        break;
      }

      default:
        // Ignore other events
        break;
    }

    return NextResponse.json({ received: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "unknown";
    return NextResponse.json({ error: `Webhook handler error: ${message}` }, { status: 500 });
  }
}
