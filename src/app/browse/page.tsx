import Nav from "@/components/Nav";
import Link from "next/link";
import { createSupabaseServer } from "@/lib/supabase/server";
import { Card } from "@/components/Card";

export const dynamic = "force-dynamic";

export default async function BrowsePage({ searchParams }: { searchParams: any }) {
  const q = (searchParams?.q ?? "").toString().trim();
  const category = (searchParams?.category ?? "").toString().trim();
  const city = (searchParams?.city ?? "").toString().trim();
  const county = (searchParams?.county ?? "").toString().trim();
  const type = (searchParams?.type ?? "").toString().trim(); // contractor|realtor

  const supabase = await createSupabaseServer();

  let query = supabase
    .from("listings")
    .select(
      "id,slug,business_name,category,city,county,state,service_area,headline,created_at,account_type,logo_url,is_featured"
    )
    .eq("is_published", true)
    .order("is_featured", { ascending: false })
    .order("created_at", { ascending: false });

  if (category) query = query.ilike("category", `%${category}%`);
  if (city) query = query.ilike("city", `%${city}%`);
  if (county) query = query.ilike("county", `%${county}%`);
  if (type) query = query.eq("account_type", type);

  if (q) {
    // search across columns (works even if you don't select those columns)
    query = query.or(
      `business_name.ilike.%${q}%,headline.ilike.%${q}%,description.ilike.%${q}%,service_area.ilike.%${q}%,category.ilike.%${q}%`
    );
  }

  const { data: listings, error } = await query;

  return (
    <>
      <Nav />
      <main className="mx-auto max-w-6xl px-6 py-12">
        <h1 className="text-3xl font-semibold">Browse listings</h1>
        <p className="mt-2 text-slate-300">Contractors and realtors serving Western North Carolina.</p>

        <form
          method="get"
          className="mt-6 grid gap-3 rounded-xl border border-slate-800 bg-slate-900/40 p-4 md:grid-cols-5"
        >
          <input
            name="q"
            defaultValue={q}
            placeholder="Search…"
            className="rounded-md border border-slate-700 bg-slate-950 px-3 py-2"
          />
          <input
            name="category"
            defaultValue={category}
            placeholder="Category"
            className="rounded-md border border-slate-700 bg-slate-950 px-3 py-2"
          />
          <input
            name="city"
            defaultValue={city}
            placeholder="City"
            className="rounded-md border border-slate-700 bg-slate-950 px-3 py-2"
          />
          <input
            name="county"
            defaultValue={county}
            placeholder="County"
            className="rounded-md border border-slate-700 bg-slate-950 px-3 py-2"
          />
          <select
            name="type"
            defaultValue={type}
            className="rounded-md border border-slate-700 bg-slate-950 px-3 py-2"
          >
            <option value="">All</option>
            <option value="contractor">Contractors</option>
            <option value="realtor">Realtors</option>
          </select>

          <button className="md:col-span-5 rounded-md bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-500">
            Apply filters
          </button>
        </form>

        {error ? (
          <div className="mt-6 rounded-xl border border-red-900 bg-red-950/40 p-4 text-sm text-red-200">
            Query error:
            <pre className="mt-2 whitespace-pre-wrap">{JSON.stringify(error, null, 2)}</pre>
          </div>
        ) : null}

        <div className="mt-8 grid gap-6 md:grid-cols-2">
          {(listings ?? []).map((l: any) => {
            const rawKey =
              typeof l.slug === "string" && l.slug.trim().length > 0 ? l.slug.trim() : l.id;

            const href = `/listing/${encodeURIComponent(rawKey)}`;

            return (
              <Link key={l.id} href={href}>
                <Card>
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex gap-4">
                      {l.logo_url ? (
                        <img
                          src={l.logo_url}
                          alt=""
                          className="h-12 w-12 rounded-lg border border-slate-800 object-cover"
                        />
                      ) : (
                        <div className="h-12 w-12 rounded-lg border border-slate-800 bg-slate-950" />
                      )}
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <div className="truncate text-lg font-semibold text-white">
                            {l.business_name}
                          </div>
                          {l.is_featured ? (
                            <span className="rounded-md border border-slate-700 px-2 py-0.5 text-xs text-slate-300">
                              Featured
                            </span>
                          ) : null}
                        </div>
                        <div className="mt-1 text-sm text-slate-300">
                          {l.category}
                          {l.account_type ? ` · ${l.account_type}` : ""}
                        </div>
                        <div className="mt-1 text-sm text-slate-400">
                          {l.city}, {l.state}
                          {l.county ? ` · ${l.county} County` : ""} · {l.service_area}
                        </div>
                        {l.headline ? (
                          <div className="mt-3 text-sm text-slate-200">{l.headline}</div>
                        ) : null}
                      </div>
                    </div>

                    <div className="text-sm text-sky-400">View →</div>
                  </div>
                </Card>
              </Link>
            );
          })}

          {(!listings || listings.length === 0) && (
            <Card>
              <p className="text-slate-300">No listings match your filters.</p>
            </Card>
          )}
        </div>
      </main>
    </>
  );
}
