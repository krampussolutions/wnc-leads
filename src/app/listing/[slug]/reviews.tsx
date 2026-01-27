import { createSupabaseServer } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export const dynamic = "force-dynamic";

async function submitReview(formData: FormData) {
  "use server";

  const slug = String(formData.get("slug") || "");
  const ratingRaw = Number(formData.get("rating") || 5);
  const rating = Math.min(5, Math.max(1, Number.isFinite(ratingRaw) ? ratingRaw : 5));
  const title = String(formData.get("title") || "");
  const body = String(formData.get("body") || "");
  const reviewer_name = String(formData.get("reviewer_name") || "");
  const reviewer_email = String(formData.get("reviewer_email") || "");

  if (!slug || !body) return;

  const supabase = await createSupabaseServer();
  

  // Find published listing
  const { data: listing } = await supabase
    .from("listings")
    .select("id")
    .eq("slug", slug)
    .eq("is_published", true)
    .maybeSingle();

  if (!listing) return;

  // Insert review (pending by default)
  await supabase.from("reviews").insert({
    listing_id: listing.id,
    rating,
    title: title || null,
    body,
    reviewer_name: reviewer_name || null,
    reviewer_email: reviewer_email || null,
    is_approved: false, // ✅ FIX
  });

  revalidatePath(`/listing/${slug}`);
}

export default async function ReviewsSection({ slug }: { slug: string }) {
  const supabase = await createSupabaseServer();

  // We need listing_id to fetch reviews
  const { data: listing } = await supabase
    .from("listings")
    .select("id")
    .eq("slug", slug)
    .eq("is_published", true)
    .maybeSingle();

  if (!listing) return null;

  // Public only sees approved (RLS should enforce this too)
  const { data: approvedReviews, error: reviewsErr } = await supabase
  .from("reviews")
  .select("id,rating,title,body,reviewer_name,created_at")
  .eq("listing_id", listing.id)
  .eq("is_approved", true)
  .order("created_at", { ascending: false })
  .limit(50);

console.log("REVIEWS_ERR:", reviewsErr);
console.log("REVIEWS_DATA:", approvedReviews);


  return (
    <div className="mt-4">
      {!approvedReviews?.length ? (
        <p className="mt-3 text-slate-400">No approved reviews yet.</p>
      ) : (
        <div className="mt-4 grid gap-4">
          {approvedReviews.map((r) => (
            <div key={r.id} className="rounded-xl border border-slate-800 bg-slate-950 p-4">
              <div className="flex items-center justify-between">
                <div className="text-slate-200">
                  <span className="font-semibold">{r.reviewer_name || "Anonymous"}</span>
                  <span className="ml-2 text-slate-400">
                    • {new Date(r.created_at).toLocaleDateString()}
                  </span>
                </div>
                <div className="text-slate-200">⭐ {r.rating}/5</div>
              </div>
              {r.title ? <div className="mt-2 font-semibold text-white">{r.title}</div> : null}
              <div className="mt-2 whitespace-pre-wrap text-slate-300">{r.body}</div>
            </div>
          ))}
        </div>
      )}

      {/* Submit form */}
      <form action={submitReview} className="mt-8 rounded-xl border border-slate-800 bg-slate-950 p-4">
        <input type="hidden" name="slug" value={slug} />

        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="text-sm text-slate-300">Your name (optional)</label>
            <input
              name="reviewer_name"
              className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2"
            />
          </div>
          <div>
            <label className="text-sm text-slate-300">Email (optional)</label>
            <input
              name="reviewer_email"
              type="email"
              className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2"
            />
          </div>
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div>
            <label className="text-sm text-slate-300">Rating</label>
            <select
              name="rating"
              defaultValue="5"
              className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2"
            >
              <option value="5">5</option>
              <option value="4">4</option>
              <option value="3">3</option>
              <option value="2">2</option>
              <option value="1">1</option>
            </select>
          </div>
          <div>
            <label className="text-sm text-slate-300">Title (optional)</label>
            <input
              name="title"
              className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2"
            />
          </div>
        </div>

        <div className="mt-4">
          <label className="text-sm text-slate-300">Review</label>
          <textarea
            name="body"
            required
            rows={5}
            className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2"
          />
        </div>

        <button
          type="submit"
          className="mt-4 rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white"
        >
          Submit review
        </button>

        <p className="mt-2 text-xs text-slate-400">Reviews require approval before appearing publicly.</p>
      </form>
    </div>
  );
}
