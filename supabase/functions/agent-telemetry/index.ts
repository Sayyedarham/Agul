import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, content-type" };
const hash = async (value: string) => { const b = new TextEncoder().encode(value); const d = await crypto.subtle.digest("SHA-256", b); return [...new Uint8Array(d)].map(x=>x.toString(16).padStart(2,"0")).join(""); };
Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", {headers:cors});
  const token = request.headers.get("authorization")?.replace("Bearer ", "");
  if (!token) return Response.json({error:"missing reporting token"}, {status:401,headers:cors});
  const body = await request.json().catch(() => ({}));
  const numeric = [body.cpu, body.ram, body.disk, body.uptime].every((value) => typeof value === "number" && Number.isFinite(value));
  if (!numeric || body.cpu < 0 || body.cpu > 100 || body.ram < 0 || body.ram > 100 || body.disk < 0 || body.disk > 100 || body.uptime < 0) {
    return Response.json({error:"invalid telemetry values"}, {status:400,headers:cors});
  }
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const {data: device} = await admin.from("devices").select("id, organization_id, status").eq("reporting_token_hash", await hash(token)).maybeSingle();
  if (!device || device.status === "pending") return Response.json({error:"unknown or unapproved device"}, {status:403,headers:cors});
  const collected = new Date().toISOString();
  await admin.from("telemetry").insert({device_id:device.id,cpu_percent:body.cpu,memory_percent:body.ram,disk_percent:body.disk,uptime_seconds:body.uptime,network_rx_bytes:body.networkRxBytes,network_tx_bytes:body.networkTxBytes,collected_at:collected});
  await admin.from("devices").update({cpu_percent:body.cpu,memory_percent:body.ram,disk_percent:body.disk,uptime_seconds:body.uptime,operating_system:body.os,status:"online",last_heartbeat_at:collected,updated_at:collected}).eq("id",device.id);
  const trigger = body.cpu >= 90 ? ["critical","high_cpu","CPU above 90%"] : body.ram >= 90 ? ["warning","high_memory","Memory above 90%"] : body.disk >= 90 ? ["warning","low_disk","Disk usage above 90%"] : null;
  if (trigger) {
    // One open incident per metric avoids an alert row every reporting minute.
    const { data: open } = await admin.from("incidents").select("id").eq("device_id", device.id).eq("kind", trigger[1]).is("resolved_at", null).maybeSingle();
    if (!open) {
      const { data: incident } = await admin.from("incidents").insert({organization_id:device.organization_id,device_id:device.id,severity:trigger[0],kind:trigger[1],message:trigger[2]}).select("id").single();
      if (incident) await admin.from("audit_events").insert({organization_id:device.organization_id,device_id:device.id,incident_id:incident.id,action:"incident.opened",entity_type:"incident",details:{kind:trigger[1]}});
    }
  }
  return Response.json({status:"accepted"}, {status:202,headers:cors});
});
