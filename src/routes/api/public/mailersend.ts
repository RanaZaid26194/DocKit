// ⚠️ EMAIL SENDING IS DISABLED IN THIS BUILD.
//
// Per the round-5 brief, no mail provider needs to be configured to run
// DocKit. The full MailerSend implementation is preserved verbatim below,
// commented out. To re-enable: delete the stub route, uncomment the block,
// and set MAILERSEND_API_TOKEN / MAIL_FROM_ADDRESS / MAIL_FROM_NAME.
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/mailersend")({
  server: {
    handlers: {
      POST: async () =>
        new Response(
          JSON.stringify({ ok: false, disabled: true, reason: "Email sending is disabled in this build." }),
          { status: 501, headers: { "Content-Type": "application/json" } },
        ),
    },
  },
});

/* ---------------------------------------------------------------------------
ORIGINAL IMPLEMENTATION (disabled)

// MailerSend transactional send endpoint. Called from the client after a
// manager decides an application or invites a teammate. The `/api/public/*`
// prefix bypasses site auth; we still verify the caller has a valid Supabase
// session and access to the referenced application/program before sending.
import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";

interface Payload {
  kind: "team_invite" | "decision";
  to: string;
  subject: string;
  html: string;
  text: string;
  applicationId?: string;
  programId?: string;
}

async function verifyCaller(request: Request, body: Payload): Promise<boolean> {
  const auth = request.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) return false;
  const supa = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: u } = await supa.auth.getUser();
  if (!u.user) return false;
  if (body.programId) {
    const { data } = await supa.from("programs").select("id").eq("id", body.programId).maybeSingle();
    return !!data;
  }
  if (body.applicationId) {
    const { data } = await supa.from("applications").select("id").eq("id", body.applicationId).maybeSingle();
    return !!data;
  }
  return false;
}

export const Route = createFileRoute("/api/public/mailersend")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const token = process.env.MAILERSEND_API_TOKEN;
        if (!token) return new Response("MailerSend not configured", { status: 501 });
        const body = (await request.json()) as Payload;
        if (!body?.to || !body?.subject) return new Response("Bad request", { status: 400 });
        if (!(await verifyCaller(request, body))) return new Response("Unauthorized", { status: 401 });

        const res = await fetch("https://api.mailersend.com/v1/email", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${token}`,
          },
          body: JSON.stringify({
            from: {
              email: process.env.MAIL_FROM_ADDRESS ?? "no-reply@example.com",
              name: process.env.MAIL_FROM_NAME ?? "DocKit",
            },
            to: [{ email: body.to }],
            subject: body.subject,
            html: body.html,
            text: body.text,
          }),
        });
        if (!res.ok) {
          const errText = await res.text();
          return new Response(errText, { status: 502 });
        }
        return new Response("ok");
      },
    },
  },
});

--------------------------------------------------------------------------- */
