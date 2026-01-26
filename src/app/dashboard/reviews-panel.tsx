import { createSupabaseServer } from "@/lib/supabase/server";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { revalidatePath } from "next/cache";

export const dynamic = "force-dynamic";

async function approveReview(formData: FormData) {
  "use server";
  const reviewId = String(formData.get("review_id") || "");
  if (!reviewId) return;

  const supabase = await createSupabaseServer();
  await supabase.from("reviews").update({ is_approved: true }).eq("id", reviewId);
  revalidatePath("/dashboard");
}

export default async function ReviewsPanel() {
  const supabase = await createSupabaseServer();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: listing } = await supabase
    .from("listings")
    .select("id")
    .eq("owner_id", user.id)
    .maybeSingle();

  if (!listing?.id) {
    return <Card>No listing found.</Card>;
  }

  const { data: reviews } = await supabase
    .from("reviews")
    .select("*")
    .eq("listing_id", listing.id)
    .order("created_at", { ascending: false });

  return (
    <Card>
      <h2 className="text-xl font-semibold">Reviews</h2>

      {!reviews?.length ? (
        <p className="mt-2 text-slate-300">No reviews yet.</p>
      ) : (
        <div className="mt-4 grid gap-3">
          {reviews.map((r) => (
            <div key={r.id} className="border p-3 rounded-lg">
              <div className="text-sm text-slate-400">
                {r.reviewer_name || "Anon"} · {r.rating}★
              </div>
              <p className="mt-1 text-slate-200">{r.body}</p>

              {!r.is_approved && (
                <form action={approveReview} className="mt-2">
                  <input type="hidden" name="review_id" value={r.id} />
                  <Button type="submit">Approve</Button>
                </form>
              )}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
