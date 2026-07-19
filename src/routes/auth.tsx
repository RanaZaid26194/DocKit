import { createFileRoute, useNavigate, redirect } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { verifyHCaptcha } from "@/lib/hcaptcha-verify.functions";
import { useServerFn } from "@tanstack/react-start";
import HCaptcha from "@hcaptcha/react-hcaptcha";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";

const searchSchema = z.object({
  mode: z.enum(["signin", "signup"]).optional().default("signin"),
});

export const Route = createFileRoute("/auth")({
  validateSearch: (s) => searchSchema.parse(s),
  head: () => ({
    meta: [
      { title: "Sign in — DocKit" },
      { name: "description", content: "Housing office sign in and account creation for DocKit." },
      { name: "robots", content: "noindex" },
    ],
  }),
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    if (data.session) throw redirect({ to: "/dashboard" });
  },
  component: AuthPage,
});

function AuthPage() {
  const { mode } = Route.useSearch();
  const navigate = useNavigate();
  const [tab, setTab] = useState<"signin" | "signup">(mode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [orgName, setOrgName] = useState("");
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const captchaRef = useRef<HCaptcha>(null);
  const verify = useServerFn(verifyHCaptcha);
  const siteKey = (import.meta.env.VITE_HCAPTCHA_SITE_KEY as string | undefined) ?? "";

  useEffect(() => { setTab(mode); }, [mode]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      // hCaptcha now gates BOTH sign-in and sign-up when configured, so
      // credential-stuffing scripts can't hammer the sign-in path either.
      if (siteKey) {
        if (!captchaToken) { toast.error("Please complete the check first."); return; }
        const res = await verify({ data: { token: captchaToken } });
        if (!res.ok) { toast.error("Bot check failed. Please try again."); captchaRef.current?.resetCaptcha(); setCaptchaToken(null); return; }
      }
      if (tab === "signup") {
        const { error } = await supabase.auth.signUp({
          email, password,
          options: {
            emailRedirectTo: `${window.location.origin}/dashboard`,
            data: { org_name: orgName },
          },
        });
        if (error) throw error;
        toast.success("Check your inbox to confirm your email.");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        navigate({ to: "/dashboard" });
      }
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-md px-6 py-16">
        <h1 className="text-2xl font-semibold">
          {tab === "signup" ? "Create a housing office account" : "Sign in"}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          For property managers and housing authority caseworkers.
        </p>

        <div className="mt-6 flex gap-1 rounded-md border border-border p-1">
          <button type="button" onClick={() => setTab("signin")}
            className={`flex-1 rounded px-3 py-2 text-sm ${tab === "signin" ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}>Sign in</button>
          <button type="button" onClick={() => setTab("signup")}
            className={`flex-1 rounded px-3 py-2 text-sm ${tab === "signup" ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}>Create account</button>
        </div>

        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          {tab === "signup" && (
            <div>
              <Label htmlFor="org">Organization name</Label>
              <Input id="org" value={orgName} onChange={(e) => setOrgName(e.target.value)} required maxLength={200} />
            </div>
          )}
          <div>
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required maxLength={255} />
          </div>
          <div>
            <Label htmlFor="password">Password</Label>
            <Input id="password" type="password" autoComplete={tab === "signin" ? "current-password" : "new-password"}
              value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} maxLength={200} />
          </div>
          {siteKey && (
            <HCaptcha sitekey={siteKey} ref={captchaRef} onVerify={setCaptchaToken} onExpire={() => setCaptchaToken(null)} />
          )}
          <Button type="submit" disabled={busy} className="w-full">
            {busy ? (
              <><Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />Please wait</>
            ) : tab === "signup" ? "Create account" : "Sign in"}
          </Button>
          {!siteKey && (
            <p className="text-xs text-muted-foreground">
              Bot check will activate once VITE_HCAPTCHA_SITE_KEY is configured (see SECRETS.md).
            </p>
          )}
        </form>
      </div>
    </div>
  );
}
