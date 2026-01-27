import Nav from "@/components/Nav";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import Link from "next/link";

export default function SignupPage({ searchParams }: { searchParams: { error?: string } }) {
  return (
    <>
      <Nav />
      <main className="mx-auto max-w-md px-6 py-12">
        <Card>
          <h1 className="text-2xl font-semibold">Create account</h1>
          {searchParams?.error ? (
            <p className="mt-3 rounded-md border border-rose-800 bg-rose-950/40 px-3 py-2 text-sm text-rose-200">
              {searchParams.error}
            </p>
          ) : null}

          <form action="/auth/signup" method="post" className="mt-6 grid gap-4">
            <div>
              <label className="text-sm text-slate-300">Full name</label>
              <input name="full_name" required className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2" />
            </div>

            <div>
              <label className="text-sm text-slate-300">Account type</label>
              <select name="account_type" className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2">
                <option value="contractor">Contractor</option>
                <option value="realtor">Realtor</option>
              </select>
            </div>

            <div>
              <label className="text-sm text-slate-300">Email</label>
              <input name="email" type="email" required className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2" />
            </div>

            <div>
              <label className="text-sm text-slate-300">Password</label>
              <input name="password" type="password" required minLength={8} className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2" />
              <p className="mt-1 text-xs text-slate-400">Minimum 8 characters.</p>
            </div>

            <Button type="submit">Create account</Button>
          </form>

          <p className="mt-6 text-sm text-slate-300">
  <span className="block">Check Email To Verify</span>
  <span className="block">
    Already have an account? <Link href="/login">Login</Link>
  </span>
</p>

        </Card>
      </main>
    </>
  );
}
