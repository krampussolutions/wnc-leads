// src/app/api/stripe/webhook/route.ts
import { NextResponse } from "next/server";
import Stripe from "stripe";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function mapStripeStatusToAppStatus(status: string) {
  // You decide what counts as "paid user"
  // For publishing listings, I recommend treating trialing as active.
  switch (status) {
    case "active":
    case "trialing":
      return "active";
    case "canceled":
    case "unpaid":
      return "canceled";
    case "incomplete":
    case "incomplete_expired":
    case "past_due":
      return "incomplete";
    default:
      return status; // fallback
  }
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
    return NextResponse.json(
      { error: `Webhook signature verification failed: ${err?.message ?? "unknown"}` },
      { status: 400 }
    );
  }

  try {
    // 1) Checkout completed: store customer + subscription id (status may still be incomplete!)
    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;

      const customerId =
        typeof session.customer === "string" ? session.customer : session.customer?.id;

      const subscriptionId =
        typeof session.subscription === "string"
          ? session.subscription
          : session.subscription?.id;

      const userId = session.metadata?.supabase_user_id || null;

      if (userId) {
        await supabaseAdmin
          .from("profiles")
          .update({
            ...(customerId ? { stripe_customer_id: customerId } : {}),
            ...(subscriptionId ? { stripe_subscription_id: subscriptionId } : {}),
          })
          .eq("id", userId);
      }
    }

    // 2) Subscription lifecycle events: THIS is what should drive your "active/inactive"
    if (
      event.type === "customer.subscription.created" ||
      event.type === "customer.subscription.updated" ||
      event.type === "customer.subscription.deleted"
    ) {
      const sub = event.data.object as Stripe.Subscription;

      const customerId =
        typeof sub.customer === "string" ? sub.customer : sub.customer?.id;

      const subscriptionId = sub.id;
      const stripeStatus = event.type === "customer.subscription.deleted" ? "canceled" : sub.status;

      if (customerId) {
        await supabaseAdmin
          .from("profiles")
          .update({
            stripe_subscription_id: subscriptionId,
            subscription_status: mapStripeStatusToAppStatus(String(stripeStatus)),
            current_period_end: sub.current_period_end
              ? new Date(sub.current_period_end * 1000).toISOString()
              : null,
          })
          .eq("stripe_customer_id", customerId);
      }
    }

    // 3) If payment succeeds later, Stripe may flip incomplete -> active
    if (event.type === "invoice.payment_succeeded") {
      const invoice = event.data.object as Stripe.Invoice;

      const customerId =
        typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id;

      const subscriptionId =
        typeof invoice.subscription === "string"
          ? invoice.subscription
          : invoice.subscription?.id;

      if (customerId && subscriptionId) {
        // Pull the subscription to get authoritative status
        const sub = await stripe.subscriptions.retrieve(subscriptionId);
        await supabaseAdmin
          .from("profiles")
          .update({
            stripe_subscription_id: sub.id,
            subscription_status: mapStripeStatusToAppStatus(String(sub.status)),
            current_period_end: sub.current_period_end
              ? new Date(sub.current_period_end * 1000).toISOString()
              : null,
          })
          .eq("stripe_customer_id", customerId);
      }
    }

    if (event.type === "invoice.payment_failed") {
      const invoice = event.data.object as Stripe.Invoice;
      const customerId =
        typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id;

      if (customerId) {
        await supabaseAdmin
          .from("profiles")
          .update({ subscription_status: "incomplete" })
          .eq("stripe_customer_id", customerId);
      }
    }

    return NextResponse.json({ received: true });
  } catch (err: any) {
    console.error("Webhook handler error:", err);
    return NextResponse.json({ error: err?.message ?? "Webhook handler error" }, { status: 500 });
  }
}
