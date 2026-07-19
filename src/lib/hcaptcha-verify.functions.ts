// Server-side hCaptcha verification. Called from the signup page after
// Supabase creates the auth account — if verification fails, we surface
// an error and prompt the user to re-solve. We can't block sign-up itself
// because Supabase Auth doesn't run our middleware, so this second step is
// how we enforce that a real human hit the form.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const InputSchema = z.object({ token: z.string().min(10).max(4000) });

export const verifyHCaptcha = createServerFn({ method: "POST" })
  .inputValidator((raw) => InputSchema.parse(raw))
  .handler(async ({ data }) => {
    const secret = process.env.HCAPTCHA_SECRET;
    // No secret configured in the current environment → treat as pass but
    // signal to the caller. Documented in SECRETS.md.
    if (!secret) return { ok: true, unconfigured: true };
    const body = new URLSearchParams({ secret, response: data.token });
    const res = await fetch("https://api.hcaptcha.com/siteverify", { method: "POST", body });
    const json = (await res.json()) as { success?: boolean };
    return { ok: !!json.success, unconfigured: false };
  });
