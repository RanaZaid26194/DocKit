import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { getProgramByToken, startApplication } from "@/lib/renter-api";
import { Button } from "@/components/ui/button";
import { useLang, useT, type Lang } from "@/lib/i18n";
import logo from "/logo.png?url";
import { toast } from "sonner";

export const Route = createFileRoute("/r/$token")({
  head: () => ({
    meta: [
      { title: "Start your application — DocKit" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: RenterLanding,
});

function RenterLanding() {
  const { token } = Route.useParams();
  const navigate = useNavigate();
  const t = useT();
  const { lang, setLang } = useLang();
  const [program, setProgram] = useState<{ name: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getProgramByToken(token).then((p) => {
      if (!p) toast.error("This link is not valid.");
      else setProgram(p);
    });
  }, [token]);

  async function begin() {
    setBusy(true);
    try {
      // Resume if we've seen this program on this device before.
      const existing = localStorage.getItem(`rd:app:${token}`);
      if (existing) {
        navigate({ to: "/a/$appToken", params: { appToken: existing } });
        return;
      }
      const appTok = await startApplication(token);
      localStorage.setItem(`rd:app:${token}`, appTok);
      navigate({ to: "/a/$appToken", params: { appToken: appTok } });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const existing = typeof window !== "undefined" ? localStorage.getItem(`rd:app:${token}`) : null;

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <img src={logo} alt="" width={28} height={28} />
            <span className="font-semibold">DocKit</span>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">{t("intro.language")}</span>
            <select value={lang} onChange={(e) => setLang(e.target.value as Lang)}
              className="rounded-md border border-input bg-background px-2 py-1 text-sm">
              <option value="en">English</option>
              <option value="es">Español</option>
            </select>
          </label>
        </div>
      </header>
      <main className="mx-auto max-w-2xl px-4 py-10">
        <h1 className="text-3xl font-semibold">{t("intro.title")}</h1>
        {program && <p className="mt-2 text-sm text-muted-foreground">{program.name}</p>}
        <p className="mt-4 text-base">{t("intro.body")}</p>
        <p className="mt-4 rounded-md bg-muted p-3 text-sm">{t("intro.privacy")}</p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Button onClick={begin} disabled={busy || !program} className="text-base">
            {busy ? "…" : existing ? t("intro.resume") : t("intro.start")}
          </Button>
        </div>
        <p className="mt-10 text-xs text-muted-foreground">{t("footer.notLegal")}</p>
      </main>
    </div>
  );
}
