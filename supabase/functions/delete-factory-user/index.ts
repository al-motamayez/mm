import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, x-client-info, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

function jsonResponse(body: Record<string, string>, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" }
  });
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return jsonResponse({ error: "Method not allowed." }, 405);

  const authorization = request.headers.get("Authorization");
  const token = authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return jsonResponse({ error: "Authentication is required." }, 401);

  const projectUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!projectUrl || !anonKey || !serviceRoleKey) {
    console.error("Required Supabase Edge Function environment variables are missing.");
    return jsonResponse({ error: "The account deletion service is not configured." }, 500);
  }

  const authenticatedClient = createClient(projectUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } }
  });
  const { data: { user }, error: authenticationError } = await authenticatedClient.auth.getUser(token);
  if (authenticationError || !user) return jsonResponse({ error: "The session is invalid or expired." }, 401);

  const adminClient = createClient(projectUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
  const { data: actor, error: actorError } = await adminClient
    .from("users")
    .select("role, status")
    .eq("id", user.id)
    .maybeSingle();
  if (actorError) {
    console.error("Could not verify the requesting factory administrator.", actorError);
    return jsonResponse({ error: "Could not verify administrator permissions." }, 500);
  }
  if (actor?.role !== "admin" || actor.status !== "active") {
    return jsonResponse({ error: "Only an active factory admin may delete accounts." }, 403);
  }

  let requestBody: { userId?: unknown };
  try {
    requestBody = await request.json();
  } catch {
    return jsonResponse({ error: "A valid JSON request body is required." }, 400);
  }
  const targetId = typeof requestBody.userId === "string" ? requestBody.userId : "";
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(targetId)) {
    return jsonResponse({ error: "A valid account ID is required." }, 400);
  }
  if (targetId === user.id) return jsonResponse({ error: "The current admin account cannot be deleted here." }, 400);

  const { data: target, error: targetError } = await adminClient
    .from("users")
    .select("role")
    .eq("id", targetId)
    .maybeSingle();
  if (targetError) {
    console.error("Could not read the account selected for deletion.", targetError);
    return jsonResponse({ error: "Could not verify the selected account." }, 500);
  }
  if (!target) return jsonResponse({ error: "The requested factory account does not exist." }, 404);
  if (target.role === "admin") return jsonResponse({ error: "Admin accounts cannot be deleted through this action." }, 403);

  const { error: deletionError } = await adminClient.auth.admin.deleteUser(targetId);
  if (deletionError) {
    console.error("Supabase Auth could not delete the selected account.", deletionError);
    return jsonResponse({ error: "Supabase Auth could not delete the selected account." }, 500);
  }
  return jsonResponse({ message: "The account was deleted." }, 200);
});
