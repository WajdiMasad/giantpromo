import Link from "next/link";
import { ShieldCheck, Lock, ArrowRight } from "lucide-react";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; domain?: string }>;
}) {
  const params = await searchParams;
  const error = params.error;
  const blockedDomain = params.domain;

  return (
    <div className="min-h-[82vh] flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-2xl border border-slate-200/80 shadow-sm p-8">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-11 h-11 rounded-xl bg-amber-500 flex items-center justify-center text-slate-950 font-black text-lg shadow-sm">
            GP
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-900">Giant Promotions OS</h1>
            <p className="text-xs text-slate-500">Halifax Sign, Print & Rental Platform</p>
          </div>
        </div>

        <h2 className="text-xl font-black text-slate-900 mb-1.5">
          Sign in with Google Workspace
        </h2>
        <p className="text-xs text-slate-500 mb-6 leading-relaxed">
          Access is restricted to verified <span className="font-mono font-semibold text-slate-700">@giantpro.ca</span> and{" "}
          <span className="font-mono font-semibold text-slate-700">@giantpro.com</span> company accounts.
        </p>

        {error && (
          <div className="mb-5 p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800">
            {error === "domain_not_allowed" ? (
              <>
                <p className="font-bold">Domain Not Authorized ({blockedDomain || "personal email"})</p>
                <p className="mt-0.5 text-rose-700">
                  Please sign in using your @giantpro.ca or @giantpro.com Google Workspace account.
                </p>
              </>
            ) : error === "oauth_not_configured" ? (
              <>
                <p className="font-bold">Google OAuth Credentials Pending</p>
                <p className="mt-0.5 text-rose-700">
                  Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env.local (or Railway Variables) to enable live Google login.
                </p>
              </>
            ) : (
              <p className="font-bold">Sign-in error: {error}</p>
            )}
          </div>
        )}

        <a
          href="/api/auth/google"
          className="w-full flex items-center justify-center gap-2.5 bg-slate-900 hover:bg-slate-800 text-white font-bold text-sm py-3 px-4 rounded-xl transition-colors shadow-sm"
        >
          <Lock className="w-4 h-4 text-amber-400" />
          Continue with Google Workspace
        </a>

        <div className="mt-6 pt-5 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
          <span className="inline-flex items-center gap-1.5 text-emerald-700 font-medium">
            <ShieldCheck className="w-4 h-4" />
            Role-based access (Admin / Office / Installer)
          </span>
          <Link
            href="/"
            className="inline-flex items-center gap-1 font-semibold text-slate-700 hover:text-slate-900"
          >
            Dashboard <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>
    </div>
  );
}
