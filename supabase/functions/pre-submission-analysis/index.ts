// Supabase Edge Function: pre-submission-analysis
//
// Pulls all job data server-side, sends to Claude with an S500 + adjuster
// pushback prompt, returns structured findings grouped by section + severity.
//
// Deploy:
//   supabase functions deploy pre-submission-analysis --no-verify-jwt --project-ref alcyjrprmujjtmqxhgup
//
// Request:
//   { job_id: "uuid" }
//
// Response:
//   {
//     run_id: "uuid",          // for caching/tracking
//     summary: "1-2 sentence overall summary",
//     findings: [
//       {
//         severity: "critical" | "warning" | "pass",
//         section: "overall" | "rooms" | "readings" | "equipment" | "scope" | "photos" | "monitoring",
//         title: "Short title",
//         body: "Detailed explanation in 1-3 sentences",
//         fix: "Suggested action (optional)",
//         reference: "S500 section or pattern name (optional)"
//       }
//     ]
//   }

import "https://deno.land/x/xhr@0.1.0/mod.ts"
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

const SYSTEM_PROMPT = `You are an IICRC S500 compliance reviewer and insurance adjuster simulator for a water damage restoration contractor.

You will be given the full data set for one water mitigation job: customer/loss info, affected rooms (materials + actions + reasons), moisture readings, equipment placements, daily monitoring data, photos taken (with categories), scope of work, and estimate line items.

Your job is to:

1) CHECK S500 COMPLIANCE — Identify where the job either complies with or deviates from IICRC S500 standards. Focus on:
   - Water category declaration vs source/contamination level
   - Water class declaration vs square footage affected and material count
   - Equipment ratios appropriate for room size + class
   - Drying time appropriate for category
   - Required documentation (initial readings, daily monitoring, final dry, photos)
   - Antimicrobial application has contamination justification (Cat 2+)
   - Containment present for Cat 3
   - Material removal has supporting moisture readings

2) PREDICT ADJUSTER PUSHBACK — Adjusters routinely deny claims for these patterns. Identify which apply to THIS job:
   - Cat 1 job with extended equipment runtime (>3-4 days) needs explanation
   - Antimicrobial billed without contamination documentation
   - Class declaration inconsistent with material count (e.g. Class 3 but only 2 walls wet)
   - Material removal billed without moisture readings on that material
   - Carpet pad removal billed without pad-specific moisture readings
   - Excessive equipment ratios (e.g. 3+ air movers in 200sqft room)
   - Missing required photos (final dry, equipment placement, source)
   - Wall cavity drying billed without wall cavity readings
   - Hidden moisture (Class 4 areas) billed without specialty equipment justification
   - Inconsistent dry times between similar materials

3) GROUP findings by section: overall, rooms, readings, equipment, scope, photos, monitoring.

4) ASSIGN severity:
   - "critical" — likely claim denial or major reduction
   - "warning" — adjuster will probably question but might accept with documentation
   - "pass" — confirmed correct/compliant; include 2-4 of these to give the user wins

Return ONLY valid JSON in this format:

{
  "summary": "One-paragraph plain-English summary of the job's submission-readiness.",
  "findings": [
    {
      "severity": "critical",
      "section": "scope",
      "title": "Carpet pad removal billed but no pad moisture readings",
      "body": "The scope includes carpet pad removal in Master Bathroom, but no moisture readings exist for the pad itself. Adjusters routinely deny pad removal charges without saturation documentation.",
      "fix": "Add pad-specific moisture readings to Master Bathroom or remove the pad removal scope line.",
      "reference": "S500 Section 12.2 — Material removal justification"
    }
  ]
}

Rules:
- No markdown, no code fences, just JSON
- Maximum 12 findings total
- Always include at least 2-4 "pass" findings unless the job is truly bad
- Be specific — reference rooms by name, numbers by value
- Keep titles under 80 chars, bodies 1-3 sentences
- "fix" is optional but include when actionable
- "reference" is optional — use it when you can cite a specific S500 section
- DO NOT speculate beyond the data given. If data is missing to evaluate something, mark it as a warning ("Cannot evaluate X — Y data missing"), don't make up findings.

You are NOT a certified S500 consultant. The user understands these are AI suggestions for human review. Be direct and useful, not overly hedged.`

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  try {
    console.log("[pre-submission-analysis] request received")

    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY")
    if (!ANTHROPIC_API_KEY) {
      return new Response(
        JSON.stringify({ error: "Anthropic API key not configured." }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
      )
    }

    const { job_id } = await req.json()
    if (!job_id) {
      return new Response(
        JSON.stringify({ error: "job_id is required." }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      )
    }
    console.log("[pre-submission-analysis] job_id:", job_id)

    // ---------- Pull all job data server-side ----------
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return new Response(
        JSON.stringify({ error: "Supabase env not configured." }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
      )
    }
    const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    const [jobRes, roomsRes, readingsRes, equipmentRes, monitoringRes, photosRes, scopeRes, estimateRes] = await Promise.all([
      sb.from('jobs').select('*').eq('id', job_id).single(),
      sb.from('affected_rooms').select('*').eq('job_id', job_id),
      sb.from('moisture_readings').select('*').eq('job_id', job_id),
      sb.from('equipment_events').select('*').eq('job_id', job_id),
      sb.from('monitoring_visits').select('*').eq('job_id', job_id),
      sb.from('photos').select('id, category, caption, room_id, taken_at').eq('job_id', job_id),
      sb.from('work_items').select('*').eq('job_id', job_id),
      sb.from('estimate_lines').select('*').eq('job_id', job_id),
    ])

    if (jobRes.error) {
      return new Response(
        JSON.stringify({ error: `Job lookup failed: ${jobRes.error.message}` }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 404 }
      )
    }

    const data = {
      job: jobRes.data,
      affected_rooms: roomsRes.data || [],
      readings: readingsRes.data || [],
      equipment: equipmentRes.data || [],
      daily_monitoring: monitoringRes.data || [],
      photos: photosRes.data || [],
      work_items: scopeRes.data || [],
      estimate_lines: estimateRes.data || [],
    }

    // Compact some data so the prompt stays small
    const compact = {
      job_number: data.job.job_number,
      customer: data.job.customer?.name,
      loss_info: data.job.loss_info,                            // category, class, source, DOL
      status: data.job.status,
      rooms: data.affected_rooms.map(r => ({
        id: r.id,
        name: r.room_name,
        sqft: r.sqft,
        materials: r.materials,
        actions: r.actions,
        reasons: r.reasons,
      })),
      readings_summary: summarizeReadings(data.readings),
      equipment: data.equipment.map(e => ({
        id: e.id,
        type: e.equipment_type,
        asset_label: e.asset_label,
        room_id: e.room_id,
        event_type: e.event_type,
        event_at: e.event_at,
      })),
      monitoring_days: countUniqueDays(data.daily_monitoring),
      photo_counts_by_category: countByKey(data.photos, 'category'),
      photo_counts_by_room: countByKey(data.photos, 'room_id'),
      total_photos: data.photos.length,
      scope: data.work_items.map(w => ({
        work_type: w.work_type, description: w.description,
        room_id: w.room_id, quantity: w.quantity, unit: w.unit,
      })),
      estimate_totals: {
        line_count: data.estimate_lines.length,
        // Dollar amounts omitted intentionally so AI doesn't make pricing judgments
      },
    }

    console.log("[pre-submission-analysis] data compacted, calling Claude...")

    const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 4000,
        system: SYSTEM_PROMPT,
        messages: [{
          role: "user",
          content: `Here is the full data set for the job. Analyze it and return JSON only.\n\n${JSON.stringify(compact, null, 2)}`,
        }],
      }),
    })
    console.log("[pre-submission-analysis] claude status:", claudeRes.status)

    if (!claudeRes.ok) {
      const errorText = await claudeRes.text()
      console.error("[pre-submission-analysis] claude error:", errorText)
      return new Response(
        JSON.stringify({ error: `Anthropic API error: ${errorText}` }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: claudeRes.status }
      )
    }

    const claudeData = await claudeRes.json()
    const rawText = claudeData.content?.[0]?.text?.trim() || ""
    const cleaned = rawText.replace(/^```(?:json)?\s*/i, "").replace(/```$/, "").trim()

    let parsed
    try {
      parsed = JSON.parse(cleaned)
    } catch (e) {
      console.error("[pre-submission-analysis] JSON parse failed:", e.message)
      return new Response(
        JSON.stringify({ error: "Couldn't parse Claude's response as JSON.", raw: rawText }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 502 }
      )
    }

    // Persist the run (optional — handy for history/audit)
    const run_id = crypto.randomUUID()
    await sb.from('pre_submission_runs').insert({
      id: run_id,
      tenant_id: data.job.tenant_id,
      job_id,
      summary: parsed.summary || '',
      findings: parsed.findings || [],
    }).then(({ error }) => {
      if (error) console.warn("[pre-submission-analysis] couldn't persist run:", error.message)
    })

    return new Response(
      JSON.stringify({ run_id, ...parsed }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    )
  } catch (err) {
    console.error("[pre-submission-analysis] exception:", err.message, err.stack)
    return new Response(
      JSON.stringify({ error: err.message }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    )
  }
})

// Helpers
function countByKey(arr, key) {
  const m = {}
  for (const r of arr) {
    const v = r[key] || '__null__'
    m[v] = (m[v] || 0) + 1
  }
  return m
}

function summarizeReadings(readings) {
  // Group by room + material + meter_type
  const groups = {}
  for (const r of readings) {
    const key = `${r.room_id}|${r.material_key}|${r.meter_type}`
    if (!groups[key]) {
      groups[key] = { room_id: r.room_id, material: r.material_key, meter_type: r.meter_type, values: [], goal: r.drying_goal, statuses: [] }
    }
    if (r.value != null) groups[key].values.push(Number(r.value))
    if (r.status) groups[key].statuses.push(r.status)
  }
  return Object.values(groups).map(g => ({
    room_id: g.room_id, material: g.material, meter_type: g.meter_type, goal: g.goal,
    count: g.values.length,
    min: g.values.length ? Math.min(...g.values) : null,
    max: g.values.length ? Math.max(...g.values) : null,
    last: g.values.length ? g.values[g.values.length - 1] : null,
    last_status: g.statuses.length ? g.statuses[g.statuses.length - 1] : null,
  }))
}

function countUniqueDays(visits) {
  const days = new Set()
  for (const v of visits) {
    if (v.visit_at) days.add(new Date(v.visit_at).toISOString().slice(0, 10))
  }
  return days.size
}
