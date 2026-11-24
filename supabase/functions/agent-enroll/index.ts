import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, content-type" };
const hash = async (value: string) => {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map(x => x.toString(16).padStart(2, "0")).join("");
};

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: cors });
  const body = await request.json().catch(() => ({}));
  if (!body.hostname || !body.enrollmentToken) return Response.json({ error: "hostname and enrollmentToken required" }, { status: 400, headers: cors });
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const tokenHash = await hash(body.enrollmentToken);
  const { data: enrollment } = await admin.from("enrollment_tokens").select("*").eq("token_hash", tokenHash).is("used_at", null).gt("expires_at", new Date().toISOString()).maybeSingle();
  if (!enrollment) return Response.json({ error: "invalid or expired enrollment token" }, { status: 401, headers: cors });
  const reportingToken = crypto.randomUUID() + crypto.randomUUID();
  const { data: device, error } = await admin.from("devices").insert({
    organization_id: enrollment.organization_id, hostname: body.hostname, operating_system: body.operatingSystem,
    ip_address: body.ipAddress || null, mac_address: body.macAddress || null, reporting_token_hash: await hash(reportingToken)
  }).select("id, hostname, status").single();
  if (error) return Response.json({ error: error.message }, { status: 400, headers: cors });
  await admin.from("enrollment_tokens").update({ used_at: new Date().toISOString() }).eq("id", enrollment.id);
  await admin.from("audit_events").insert({
    organization_id: enrollment.organization_id, device_id: device.id, action: "device.enrolled",
    entity_type: "enrollment", details: { hostname: device.hostname }
  });
  return Response.json({ device, reportingToken }, { status: 201, headers: cors });
});
