// In-app messaging (suggested feature #3). A bounded, threaded note log per
// application. Managers read/write with their session; renters read/write
// through token-scoped SECURITY DEFINER RPCs.
import { supabase } from "@/integrations/supabase/client";

export interface AppMessage {
  id: string;
  application_id: string;
  document_id: string | null;
  author_role: "manager" | "renter";
  author_name: string;
  body: string;
  created_at: string;
}

/* ---------- manager side ---------- */

export async function listMessages(applicationId: string): Promise<AppMessage[]> {
  const { data, error } = await supabase
    .from("application_messages")
    .select("*")
    .eq("application_id", applicationId)
    .order("created_at");
  if (error) throw error;
  return (data ?? []) as unknown as AppMessage[];
}

export async function postManagerMessage(
  applicationId: string,
  body: string,
  documentId: string | null,
  authorName: string,
) {
  const { error } = await supabase.from("application_messages").insert({
    application_id: applicationId,
    document_id: documentId,
    author_role: "manager",
    author_name: authorName,
    body,
  } as never);
  if (error) throw error;
}

/* ---------- renter side ---------- */

export async function renterListMessages(token: string): Promise<AppMessage[]> {
  const { data, error } = await supabase.rpc("renter_list_messages", { _token: token });
  if (error) throw error;
  return (data as unknown as AppMessage[]) ?? [];
}

export async function renterPostMessage(token: string, body: string, documentId?: string | null) {
  const { error } = await supabase.rpc("renter_post_message", {
    _token: token,
    _body: body,
    _document_id: documentId ?? null,
  });
  if (error) throw error;
}
