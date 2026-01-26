import { NextResponse } from "next/server";
import Stripe from "stripe";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function normalizeStatus(stripeStatus: string) {
  // Decide what your app considers "active"
  if (stripeStatus === "active" || stripeStatus === "trialing") return "active";
  if (stripeStatus === "canceled") return "canceled";
  // incomplete, incomplete_expired, past_due, unpaid, paused...
  return "inactive";
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
    return NextResponse.json({ error: `Webhook signature verification failed: ${err?.message ?? "unknown"}` }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;

        const customerId = typeof session.customer === "string" ? session.customer : session.customer?.id;
        const subscriptionId = typeof session.subscription === "string" ? session.subscription : session.subscription?.id;
        const userId = session.metadata?.supabase_user_id;

        if (userId && customerId) {
          await supabaseAdmin
            .from("profiles")
            .update({
              stripe_customer_id: customerId,
              stripe_subscription_id: subscriptionId ?? null,
              // Don't force active here; let subscription/invoice events confirm it
            })
            .eq("id", userId);
        }
        break;
      }

      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer?.id;
        const stripeStatus = event.type === "customer.subscription.deleted" ? "canceled" : sub.status;

        if (customerId) {
          await supabaseAdmin
            .from("profiles")
            .update({
              stripe_subscription_id: sub.id,
              subscription_status: normalizeStatus(stripeStatus),
            })
            .eq("stripe_customer_id", customerId);
        }
        break;
      }

      case "invoice.paid": {
        const invoice = event.data.object as Stripe.Invoice;
        const customerId = typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id;

        if (customerId) {
          await supabaseAdmin
            .from("profiles")
            .update({ subscription_status: "active" })
            .eq("stripe_customer_id", customerId);
        }
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        const customerId = typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id;

        if (customerId) {
          await supabaseAdmin
            .from("profiles")
            .update({ subscription_status: "inactive" })
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
