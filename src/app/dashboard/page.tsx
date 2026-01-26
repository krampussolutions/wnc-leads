import Nav from "@/components/Nav";
import Link from "next/link";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { requireUser, getProfile } from "@/lib/auth";
import { createSupabaseServer } from "@/lib/supabase/server";
import ReviewsPanel from "./reviews-panel";


export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const user = await requireUser();
  const profile = await getProfile();

  const supabase = await createSupabaseServer();
  const { data: listing } = await supabase
    .from("listings")
    .select("id,slug,business_name,is_published")
    .eq("owner_id", user.id)
    .maybeSingle();

  const { data: quotes } = await supabase
    .from("quote_requests")
    .select("id,created_at,requester_name,requester_email,requester_phone,message,status,listing_id")
    .order("created_at", { ascending: false })
    .limit(20);

  const active = profile?.subscription_status === "active" || profile?.subscription_status === "trialing";

  return (
    <>
      <Nav />
      <main className="mx-auto max-w-6xl px-6 py-12">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="text-3xl font-semibold">Dashboard</h1>
            <p className="mt-2 text-slate-300">Manage your listing and view quote requests.</p>
          <div className="mt-6 flex gap-3"><a href="/dashboard/leads" className="inline-flex items-center rounded-md bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700">View leads</a></div>
</div>
          <div className="flex gap-2">
            <Link href="/account"><Button variant="secondary">Account</Button></Link>
            <Link href="/dashboard/listing"><Button>My listing</Button></Link>
          </div>
        </div>

        <div className="mt-8 grid gap-6 md:grid-cols-3">
          <Card>
            <div className="text-sm text-slate-400">Subscription</div>
            <div className="mt-2 text-xl font-semibold">{profile?.subscription_status ?? "none"}</div>
            {!active ? (
              <div className="mt-4">
                <Link href="/pricing"><Button>Subscribe to publish</Button></Link>
              </div>
            ) : (
              <p className="mt-3 text-sm text-slate-300">Active subscription — your listing can be published.</p>
            )}
          </Card>

          <Card>
            <div className="text-sm text-slate-400">Listing</div>
            <div className="mt-2 text-xl font-semibold">{listing?.business_name ?? "Not created"}</div>
            <div className="mt-1 text-sm text-slate-300">
              {listing ? (listing.is_published ? "Published" : "Draft") : "Create your listing to start."}
            </div>
            <div className="mt-4">
              <Link href="/dashboard/listing"><Button variant="secondary">{listing ? "Edit listing" : "Create listing"}</Button></Link>
            </div>
          </Card>

          <Card>
            <div className="text-sm text-slate-400">Latest quotes</div>
            <div className="mt-2 text-xl font-semibold">{quotes?.length ?? 0}</div>
            <p className="mt-1 text-sm text-slate-300">Latest 20 quote requests shown below.</p>
          </Card>
        </div>

        <div className="mt-10">
          <h2 className="text-xl font-semibold">Quote requests</h2>
          <div className="mt-4 grid gap-4">
            {(quotes ?? []).map((q) => (
              <Card key={q.id}>
                <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                  <div>
                    <div className="text-white font-semibold">{q.requester_name}</div>
                    <div className="text-sm text-slate-300">{q.requester_email}{q.requester_phone ? ` · ${q.requester_phone}` : ""}</div>
                    <div className="mt-3 whitespace-pre-wrap text-sm text-slate-200">{q.message}</div>
                  </div>
                  <div className="text-sm text-slate-400">{new Date(q.created_at).toLocaleString()}</div>
                </div>
              </Card>
            ))}
            {(!quotes || quotes.length === 0) && (
              <Card>
                <p className="text-slate-300">No quote requests yet.</p>
              </Card>
            )}

          </div>
        </div>
      </main>
    </>
  );
}
