import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { signedUrl } from "@/lib/renter-api";

interface Doc {
  id: string; requirement_id: string; doc_type: string; applicant_index: number;
  storage_path: string | null; status: string; issues: { message: string; severity: string }[]; exif_flag: boolean; exif_reason: string | null;
}
interface App {
  id: string; program_id: string; status: string; applicant: { name?: string }; co_applicants: { name?: string }[];
  submitted_at: string | null; decided_at: string | null; packet_path: string | null;
}
interface Program { id: string; name: string; requirements: { id: string; name: string; perPerson: boolean }[] }

export const Route = createFileRoute("/_authenticated/applications/$id")({
  component: ReviewPage,
});

function ReviewPage() {
  const { id } = Route.useParams();
  const [app, setApp] = useState<App | null>(null);
  const [prog, setProg] = useState<Program | null>(null);
  const [docs, setDocs] = useState<Doc[]>([]);
  const [urls, setUrls] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    const { data: a } = await supabase.from("applications").select("*").eq("id", id).single();
    if (!a) return;
    setApp(a as App);
    const { data: p } = await supabase.from("programs").select("id,name,requirements").eq("id", a.program_id).single();
    setProg(p as Program);
    const { data: d } = await supabase.from("documents").select("*").eq("application_id", id).order("created_at");
    setDocs((d ?? []) as Doc[]);
    const newUrls: Record<string, string> = {};
    for (const doc of d ?? []) {
      if (doc.storage_path) {
        const u = await signedUrl(doc.storage_path);
        if (u) newUrls[doc.id] = u;
      }
    }
    setUrls(newUrls);
  }, [id]);
  useEffect(() => { load(); }, [load]);

  async function decide(newStatus: "approved" | "rejected" | "withdrawn") {
    if (!confirm(`Mark this application ${newStatus}? Uploaded images will be deleted.`)) return;
    const { data, error } = await supabase.rpc("manager_decide_application", { _app_id: id, _new_status: newStatus });
    if (error) return toast.error(error.message);
    const paths = (data as string[] | null) ?? [];
    if (paths.length) await supabase.storage.from("documents").remove(paths);
    toast.success("Decision recorded and images deleted.");
    await load();
  }

  if (!app || !prog) return <p className="text-sm text-muted-foreground">Loading…</p>;

  const people = [app.applicant, ...(app.co_applicants ?? [])];

  return (
    <div className="space-y-6">
      <div>
        <Link to="/programs/$id" params={{ id: app.program_id }} className="text-sm text-muted-foreground hover:underline">← Back to program</Link>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">{app.applicant?.name || "(unnamed applicant)"}</h1>
            <p className="text-sm text-muted-foreground">Status: {app.status}</p>
          </div>
          {app.status !== "approved" && app.status !== "rejected" && app.status !== "withdrawn" && (
            <div className="flex gap-2">
              <Button onClick={() => decide("approved")}>Approve</Button>
              <Button variant="outline" onClick={() => decide("rejected")}>Reject</Button>
              <Button variant="outline" onClick={() => decide("withdrawn")}>Withdraw</Button>
            </div>
          )}
        </div>
      </div>

      <div className="grid gap-3">
        {prog.requirements.map((req) =>
          people.map((_p, idx) => {
            if (!req.perPerson && idx > 0) return null;
            const d = docs.find((x) => x.requirement_id === req.id && x.applicant_index === idx);
            const person = people[idx]?.name || `Person ${idx + 1}`;
            return (
              <div key={`${req.id}-${idx}`} className="rounded-lg border border-border bg-card p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-medium">{req.name}</p>
                    {req.perPerson && <p className="text-xs text-muted-foreground">For {person}</p>}
                  </div>
                  {d && <StatusPill s={d.status} />}
                </div>
                {d?.exif_flag && (
                  <p className="mt-2 rounded-md bg-warning/15 p-2 text-sm text-warning-foreground">
                    Flagged for human review — editing software detected in metadata{d.exif_reason ? ` (${d.exif_reason})` : ""}. Not auto-rejected.
                  </p>
                )}
                {d?.issues?.length ? (
                  <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
                    {d.issues.map((i, k) => <li key={k}>• {i.message}</li>)}
                  </ul>
                ) : null}
                {d?.storage_path && urls[d.id] && (
                  <a href={urls[d.id]} target="_blank" rel="noreferrer" className="mt-3 inline-block">
                    <img src={urls[d.id]} alt={req.name} className="max-h-48 rounded-md border border-border" />
                  </a>
                )}
                {d?.storage_path === null && app.decided_at && (
                  <p className="mt-2 text-xs text-muted-foreground">Image deleted (application decided on {new Date(app.decided_at).toLocaleDateString()}).</p>
                )}
                {!d && <p className="mt-2 text-sm text-muted-foreground">Not uploaded yet.</p>}
              </div>
            );
          }),
        )}
      </div>
    </div>
  );
}

function StatusPill({ s }: { s: string }) {
  const cls = s === "pass" ? "status-pass" : s === "flagged" ? "status-flag" : "status-fail";
  return <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>{s.replace("_", " ")}</span>;
}
