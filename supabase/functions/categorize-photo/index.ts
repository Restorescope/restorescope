// Supabase Edge Function: categorize-photo
//
// Receives a base64-encoded photo + job context, and asks Claude vision to
// classify it into one of the 21 PHOTO_CATEGORIES used in the app.
//
// Deploy:
//   supabase functions deploy categorize-photo --no-verify-jwt --project-ref alcyjrprmujjtmqxhgup
//
// Request body:
//   {
//     "photo_base64": "iVBORw0KGgo...",  (no data: prefix)
//     "photo_media_type": "image/jpeg",
//     "job_context": {
//       "screening_only": false,         // mold screening vs water mit job
//       "screening_enabled": false       // combo
//     }
//   }
//
// Response:
//   {
//     "category_key": "moisture_readings",
//     "confidence": "high" | "medium" | "low",
//     "reasoning": "Short explanation"
//   }
//
// Categories Claude must pick from: see PHOTO_CATEGORIES list below.

import "https://deno.land/x/xhr@0.1.0/mod.ts"
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

// IMPORTANT: keep this list in sync with src/lib/defaults.js PHOTO_CATEGORIES
const PHOTO_CATEGORIES = [
  { key: 'front_property',       label: 'Front of property', hint: 'Exterior shots, street view, building facade' },
  { key: 'source_area',          label: 'Source area', hint: 'The actual leak/water source — appliance, pipe, ceiling, etc.' },
  { key: 'affected_overview',    label: 'Affected area overview', hint: 'Wide shot of damaged room from doorway' },
  { key: 'moisture_readings',    label: 'Moisture meter readings', hint: 'Photo showing a moisture meter display, pin meter, pinless, RH probe' },
  { key: 'before_removal',       label: 'Before material removal', hint: 'Damaged drywall/baseboard/carpet visible, before being removed' },
  { key: 'removal_progress',     label: 'Removal in progress', hint: 'Actively cutting/removing materials, worker in shot' },
  { key: 'exposed_after',        label: 'Exposed materials after', hint: 'Cavity exposed after demo — studs, subfloor, joists visible' },
  { key: 'cleaning',             label: 'Cleaning / antimicrobial', hint: 'Spraying, wiping, antimicrobial application' },
  { key: 'equipment_placement',  label: 'Equipment placement', hint: 'Dehumidifier, air mover, HEPA filter shown in room' },
  { key: 'daily_monitoring',     label: 'Daily monitoring', hint: 'Reading log sheet, thermo-hygrometer in use, daily checks' },
  { key: 'final_dry',            label: 'Final dry readings', hint: 'Meter on dry material reading at goal' },
  { key: 'final_condition',      label: 'Final condition', hint: 'Cleaned, dried room ready for handoff' },
  { key: 'contents',             label: 'Contents / protection', hint: 'Furniture, belongings, contents wrapped or moved' },
  { key: 'containment',          label: 'Containment / barriers', hint: 'Plastic sheeting, zipwalls, dust barriers' },
  { key: 'debris',               label: 'Debris / load out', hint: 'Trash bags, removed materials, dumpster' },
  // Mold screening
  { key: 'screening_alert',      label: 'Screening — alert location', hint: 'Spore (the mold detection dog) alerting at a spot' },
  { key: 'screening_thermal',    label: 'Screening — thermal imaging', hint: 'Thermal/IR camera display showing temperature differential' },
  { key: 'screening_visible',    label: 'Screening — visible signs', hint: 'Visible mold growth, staining, water marks' },
  { key: 'screening_sample',     label: 'Screening — sample collected', hint: 'Sample cassette, swab, tape lift collection in progress' },
  { key: 'screening_general',    label: 'Screening — general', hint: 'General mold screening shot that doesn\'t fit other categories' },
]

const SYSTEM_PROMPT = `You are a photo classifier for a water damage restoration / mold inspection field app. Your job is to look at a photo and pick the single best category from a fixed list.

The categories cover the full workflow: arrival, source identification, demo, cleaning, drying setup, daily monitoring, final dry, and final condition. Plus mold screening specific categories.

You MUST pick exactly one category from the provided list. If unsure, choose the closest match and mark confidence as "low".

Return ONLY valid JSON in this format:

{
  "category_key": "moisture_readings",
  "confidence": "high",
  "reasoning": "One short sentence about why."
}

Valid confidence values: "high", "medium", "low".
No markdown, no code fences, no preamble. Just the JSON object.`

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  try {
    console.log("[categorize-photo] request received")

    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY")
    if (!ANTHROPIC_API_KEY) {
      return new Response(
        JSON.stringify({ error: "Anthropic API key not configured on the server." }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
      )
    }

    const { photo_base64, photo_media_type, job_context } = await req.json()
    if (!photo_base64 || !photo_media_type) {
      return new Response(
        JSON.stringify({ error: "photo_base64 and photo_media_type are required." }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      )
    }

    // Build category list with hints for Claude
    const categoryList = PHOTO_CATEGORIES
      .map(c => `- ${c.key} (${c.label}): ${c.hint}`)
      .join('\n')

    const jobTypeNote = job_context?.screening_only
      ? 'This is a MOLD SCREENING job — prefer screening_* categories.'
      : job_context?.screening_enabled
        ? 'This is a COMBO job (water mit + mold screening) — either category set is OK.'
        : 'This is a WATER MITIGATION job — prefer the standard water-mit categories.'

    const userMessage = {
      role: "user",
      content: [
        {
          type: "image",
          source: {
            type: "base64",
            media_type: photo_media_type,
            data: photo_base64,
          },
        },
        {
          type: "text",
          text: `Job context: ${jobTypeNote}\n\nPick exactly ONE category key from this list:\n\n${categoryList}\n\nRespond with JSON only.`,
        },
      ],
    }

    console.log("[categorize-photo] calling anthropic...")
    const anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 300,
        system: SYSTEM_PROMPT,
        messages: [userMessage],
      }),
    })
    console.log("[categorize-photo] anthropic status:", anthropicRes.status)

    if (!anthropicRes.ok) {
      const errorText = await anthropicRes.text()
      console.error("[categorize-photo] anthropic error:", errorText)
      return new Response(
        JSON.stringify({ error: `Anthropic API error: ${errorText}` }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: anthropicRes.status }
      )
    }

    const anthropicData = await anthropicRes.json()
    const rawText = anthropicData.content?.[0]?.text?.trim() || ""
    console.log("[categorize-photo] raw:", rawText)

    const cleaned = rawText.replace(/^```(?:json)?\s*/i, "").replace(/```$/, "").trim()
    let parsed
    try {
      parsed = JSON.parse(cleaned)
    } catch (e) {
      return new Response(
        JSON.stringify({ error: "Couldn't parse Claude's response as JSON.", raw: rawText }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 502 }
      )
    }

    // Validate response
    const validKeys = PHOTO_CATEGORIES.map(c => c.key)
    if (!validKeys.includes(parsed.category_key)) {
      return new Response(
        JSON.stringify({ error: `AI returned invalid category: ${parsed.category_key}`, raw: parsed }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 502 }
      )
    }

    return new Response(
      JSON.stringify(parsed),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    )
  } catch (err) {
    console.error("[categorize-photo] exception:", err.message)
    return new Response(
      JSON.stringify({ error: err.message }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    )
  }
})
