// src/app/api/stripe/webhook/route.ts
import { NextResponse } from "next/server";
import Stripe from "stripe";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function idOf(v: any): string | null {
  if (!v) return null;
  if (typeof v === "string") return v;
  if (v?.id && typeof v.id === "string") return v.id;
  return null;
}

function normalizeStripeStatus(status: string): string {
  // Store the real Stripe status (recommended).
  // Your UI can treat active+trialing as paid.
  return status;
}

export async function POST(req: Request) {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!secretKey) return NextResponse.json({ error: "Missing STRIPE_SECRET_KEY" }, { status: 500 });
  if (!webhookSecret) return NextResponse.json({ error: "Missing STRIPE_WEBHOOK_SECRET" }, { status: 500 });

  const stripe = new Stripe(secretKey, { apiVersion: "2024-06-20" });

  const rawBody = await req.text();
  const sig = req.headers.get("stripe-signature");
  if (!sig) return NextResponse.json({ error: "Missing stripe-signature" }, { status: 400 });

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
  } catch (err: any) {
    return NextResponse.json({ error: `Bad signature: ${err?.message ?? "unknown"}` }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;

        const customerId = idOf(session.customer);
        const subscriptionId = idOf(session.subscription);
        const userId = (session.metadata?.supabase_user_id as string | undefined) ?? null;

        if (userId) {
          await supabaseAdmin
            .from("profiles")
            .update({
              ...(customerId ? { stripe_customer_id: customerId } : {}),
              ...(subscriptionId ? { stripe_subscription_id: subscriptionId } : {}),
            })
            .eq("id", userId);
        }
        break;
      }

      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;

        const customerId = idOf(sub.customer);
        const subscriptionId = sub.id;

        const stripeStatus =
          event.type === "customer.subscription.deleted" ? "canceled" : String(sub.status);

        // Update by subscription id first (best), then fallback by customer id
        const { data: bySub } = await supabaseAdmin
          .from("profiles")
          .update({
            stripe_subscription_id: subscriptionId,
            subscription_status: normalizeStripeStatus(stripeStatus),
            current_period_end: sub.current_period_end
              ? new Date(sub.current_period_end * 1000).toISOString()
              : null,
          })
          .eq("stripe_subscription_id", subscriptionId)
          .select("id")
          .maybeSingle();

        if (!bySub && customerId) {
          await supabaseAdmin
            .from("profiles")
            .update({
              stripe_customer_id: customerId,
              stripe_subscription_id: subscriptionId,
              subscription_status: normalizeStripeStatus(stripeStatus),
              current_period_end: sub.current_period_end
                ? new Date(sub.current_period_end * 1000).toISOString()
                : null,
            })
            .eq("stripe_customer_id", customerId);
        }

        break;
      }

      case "invoice.paid": {
        const invoice = event.data.object as Stripe.Invoice;
        const customerId = idOf(invoice.customer);
        const subscriptionId = idOf(invoice.subscription);

        // If invoice is paid, subscription is effectively "good"
        // You can store "active" here, but I recommend relying on subscription.updated for true status.
        if (subscriptionId) {
          await supabaseAdmin
            .from("profiles")
            .update({ subscription_status: "active" })
            .eq("stripe_subscription_id", subscriptionId);
        } else if (customerId) {
          await supabaseAdmin
            .from("profiles")
            .update({ subscription_status: "active" })
            .eq("stripe_customer_id", customerId);
        }
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        const subscriptionId = idOf(invoice.subscription);
        const customerId = idOf(invoice.customer);

        if (subscriptionId) {
          await supabaseAdmin
            .from("profiles")
            .update({ subscription_status: "past_due" })
            .eq("stripe_subscription_id", subscriptionId);
        } else if (customerId) {
          await supabaseAdmin
            .from("profiles")
            .update({ subscription_status: "past_due" })
            .eq("stripe_customer_id", customerId);
        }
        break;
      }

      default:
        break;
    }

    return NextResponse.json({ received: true });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? "Webhook handler error" }, { status: 500 });
  }
}
