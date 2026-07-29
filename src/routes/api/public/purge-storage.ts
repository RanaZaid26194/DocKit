// Nightly storage purge, invoked by pg_cron via pg_net.http_post.
// Auth: uses the Supabase anon key as an `apikey` header (see
// schedule-jobs-options). Uses the service role internally to bypass RLS
// while removing objects.
//
// Behavior: for each application whose decision is older than the program's
// retention_days (or that has been idle beyond that window without a
// decision), list Storage objects under `${session_token}/${app_id}/` and
// remove any that are still around after storage_path was nulled.
import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";

export const Route = createFileRoute("/api/public/purge-storage")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // Basic apikey check — the same anon key the browser uses.
        const apikey = request.headers.get("apikey") ?? "";
        if (apikey !== process.env.SUPABASE_PUBLISHABLE_KEY) {
          return new Response("Unauthorized", { status: 401 });
        }
        const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
        if (!service) return new Response("Service role not configured", { status: 501 });
        const admin = createClient(process.env.SUPABASE_URL!, service, {
          auth: { persistSession: false, autoRefreshToken: false },
        });

        // Fetch applications joined with their program retention windows.
        const { data: rows, error } = await admin.rpc("purge_candidates" as never).select?.() ?? { data: null, error: null };
        // Fallback: read directly if the helper RPC doesn't exist.
        let candidates: { id: string; session_token: string; program_retention: number; decided_at: string | null; last_activity_at: string }[] = [];
        if (error || !rows) {
          const { data } = await admin
            .from("applications")
            .select("id, session_token, last_activity_at, decided_at, program:programs(retention_days)")
            .limit(1000);
          candidates = (data ?? []).map((r: unknown) => {
            const row = r as { id: string; session_token: string; last_activity_at: string; decided_at: string | null; program: { retention_days: number } | { retention_days: number }[] | null };
            const prog = Array.isArray(row.program) ? row.program[0] : row.program;
            return {
              id: row.id,
              session_token: row.session_token,
              program_retention: prog?.retention_days ?? 90,
              decided_at: row.decided_at,
              last_activity_at: row.last_activity_at,
            };
          });
        }
        const now = Date.now();
        let removed = 0;
        for (const app of candidates) {
          const ageDays = Math.floor(
            (now - new Date(app.decided_at ?? app.last_activity_at).getTime()) / 86400000,
          );
          if (ageDays < app.program_retention) continue;
          const prefix = `${app.session_token}/${app.id}`;
          const { data: list } = await admin.storage.from("documents").list(prefix, { limit: 1000 });
          if (!list?.length) continue;
          const paths = list.map((o) => `${prefix}/${o.name}`);
          const { error: rmErr } = await admin.storage.from("documents").remove(paths);
          if (!rmErr) removed += paths.length;
          // Null the storage_path on the documents rows so the review UI is honest.
          await admin.from("documents").update({ storage_path: null }).eq("application_id", app.id);
        }
        return new Response(JSON.stringify({ removed }), { headers: { "Content-Type": "application/json" } });
      },
    },
  },
});
