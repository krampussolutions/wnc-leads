import Nav from "@/components/Nav";
import { createSupabaseServer } from "@/lib/supabase/server";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { revalidatePath } from "next/cache";
import ReviewsSection from "./reviews";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ slug: string }> | { slug: string };
};

async function resolve<T>(v: T | Promise<T>): Promise<T> {
  return v && typeof (v as any)?.then === "function" ? await (v as any) : (v as any);
}

async function submitQuote(formData: FormData) {
  "use server";

  const slug = String(formData.get("slug") || "").trim();
  const name = String(formData.get("name") || "").trim();
  const email = String(formData.get("email") || "").trim();
  const phone = String(formData.get("phone") || "").trim();
  const message = String(formData.get("message") || "").trim();

  if (!slug || !name || !email || !message) return;

  const supabase = await createSupabaseServer();

  // IMPORTANT: your schema uses is_published (not published)
  const { data: listing, error: listingErr } = await supabase
    .from("listings")
    .select("id")
    .eq("slug", slug)
    .eq("is_published", true)
    .maybeSingle();

  if (listingErr || !listing) return;

  const { error: insertErr } = await supabase.from("quote_requests").insert({
    listing_id: listing.id,
    requester_name: name,
    requester_email: email,
    requester_phone: phone || null,
    message,
  });

  if (insertErr) return;

  revalidatePath(`/listing/${slug}`);
}

export default async function ListingPage(props: PageProps) {
  const { slug } = await resolve(props.params);

  const supabase = await createSupabaseServer();
  const { data: listing, error } = await supabase
    .from("listings")
    .select(
      `
      id,
      owner_id,
      slug,
      business_name,
      category,
      city,
      state,
      service_area,
      headline,
      description,
      phone,
      website,
      email_public,
      is_published,
      county,
      account_type,
      logo_url,
      cover_url,
      is_featured,
      latitude,
      longitude,
      created_at,
      updated_at
    `
    )
    .eq("slug", slug)
    .eq("is_published", true)
    .maybeSingle();

  if (error || !listing) {
    return (
      <>
        <Nav />
        <main className="mx-auto max-w-4xl px-6 py-12">
          <Card>
            <h1 className="text-xl font-semibold">Listing not found</h1>
            <p className="mt-2 text-slate-300">This listing may be unpublished or removed.</p>
            <p className="mt-2 text-xs text-slate-500">Slug: {slug}</p>
          </Card>
        </main>
      </>
    );
  }

  return (
    <>
      <Nav />
      <main className="mx-auto max-w-4xl px-6 py-12">
        <div className="flex flex-col gap-6">
          <Card>
            {listing.cover_url ? (
              <img
                src={listing.cover_url}
                alt=""
                className="mb-6 h-44 w-full rounded-xl border border-slate-800 object-cover"
              />
            ) : null}

            <div className="flex items-start gap-4">
              {listing.logo_url ? (
                <img
                  src={listing.logo_url}
                  alt=""
                  className="h-16 w-16 rounded-xl border border-slate-800 object-cover"
                />
              ) : (
                <div className="h-16 w-16 rounded-xl border border-slate-800 bg-slate-950" />
              )}

              <div className="min-w-0">
                <h1 className="text-3xl font-semibold text-white">{listing.business_name}</h1>

                <div className="mt-2 text-slate-300">
                  {listing.category}
                  {listing.account_type ? ` · ${listing.account_type}` : ""}
                  {listing.is_featured ? ` · Featured` : ""}
                </div>

                <div className="mt-2 text-slate-400">
                  {listing.city}, {listing.state}
                  {listing.county ? ` · ${listing.county} County` : ""}
                  {listing.service_area ? ` · ${listing.service_area}` : ""}
                </div>
              </div>
            </div>

            {listing.headline ? <p className="mt-4 text-slate-200">{listing.headline}</p> : null}

            {listing.description ? (
              <p className="mt-4 whitespace-pre-wrap text-slate-300">{listing.description}</p>
            ) : null}

            <div className="mt-6 grid gap-3 text-sm text-slate-300 md:grid-cols-2">
              {listing.phone ? (
                <div>
                  <span className="text-slate-400">Phone:</span> {listing.phone}
                </div>
              ) : null}

              {listing.website ? (
                <div className="truncate">
                  <span className="text-slate-400">Website:</span>{" "}
                  <a
                    className="underline underline-offset-4 hover:text-white"
                    href={listing.website}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {listing.website}
                  </a>
                </div>
              ) : null}

              {listing.email_public ? (
                <div className="truncate">
                  <span className="text-slate-400">Email:</span> {listing.email_public}
                </div>
              ) : null}
            </div>
          </Card>

          <Card>
            <h2 className="text-xl font-semibold">Request a quote</h2>
            <p className="mt-1 text-sm text-slate-300">
              Send a message to this business. Your request will appear in their dashboard.
            </p>

            <form action={submitQuote} className="mt-6 grid gap-4">
              <input type="hidden" name="slug" value={listing.slug} />

              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="text-sm text-slate-300">Name</label>
                  <input
                    name="name"
                    required
                    className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2"
                  />
                </div>

                <div>
                  <label className="text-sm text-slate-300">Email</label>
                  <input
                    name="email"
                    type="email"
                    required
                    className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2"
                  />
                </div>
              </div>

              <div>
                <label className="text-sm text-slate-300">Phone (optional)</label>
                <input
                  name="phone"
                  className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2"
                />
              </div>

              <div>
                <label className="text-sm text-slate-300">Message</label>
                <textarea
                  name="message"
                  required
                  rows={5}
                  className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2"
                />
              </div>

              <div>
                <Button type="submit">Send request</Button>
              </div>
            </form>
          </Card>

          <Card>
            <h2 className="text-xl font-semibold">Reviews</h2>
            <p className="mt-1 text-sm text-slate-300">Reviews are visible after approval.</p>
            <ReviewsSection slug={listing.slug} />
          </Card>
        </div>
      </main>
    </>
  );
}
