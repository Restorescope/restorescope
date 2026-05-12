// Supabase Edge Function: generate-screening-recommendations
//
// Receives screening data (alerts, samples, intake) and calls Anthropic's
// Claude API to generate IICRC-aligned recommendations. Keeps the API key
// server-side so it never reaches the browser.
//
// Deploy:
//   supabase functions deploy generate-screening-recommendations
//
// Set the secret:
//   supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
//
// Request body shape:
//   {
//     "intake": { reason_for_screening, customer_concerns, reported_history, scope },
//     "alerts": [{ room_name, alert_strength, alert_location, visible_signs,
//                  moisture_value, moisture_unit, thermal_observation,
//                  wall_cavity_test_result, notes }],
//     "samples": [{ sample_id_label, sample_type, location_label, status,
//                   result_summary, result_notes }]
//   }
//
// Response shape:
//   { "recommendations": "plain text recommendations, one per line" }

import "https://deno.land/x/xhr@0.1.0/mod.ts"
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  try {
    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY")
    if (!ANTHROPIC_API_KEY) {
      return new Response(
        JSON.stringify({ error: "Anthropic API key not configured on the server." }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
      )
    }

    const { intake, alerts, samples } = await req.json()

    // Build the prompt
    const promptParts = []
    promptParts.push("You are an experienced indoor air quality professional reviewing a canine-assisted mold screening conducted by a certified mold detection dog handler. Generate professional recommendations for the customer based on the screening findings below.")
    promptParts.push("")
    promptParts.push("REQUIREMENTS:")
    promptParts.push("- Follow IICRC S520 (mold remediation) and S500 (water damage) standards.")
    promptParts.push("- Write in plain language a homeowner can understand. Avoid jargon, or if you must use a term, briefly define it.")
    promptParts.push("- Be specific: reference the actual rooms and findings from the screening, not generic advice.")
    promptParts.push("- Prioritize: most urgent or impactful recommendations first.")
    promptParts.push("- Be honest about limitations: canine screening is presumptive, lab sampling confirms.")
    promptParts.push("")
    promptParts.push("STRICT RULES ABOUT MOISTURE READINGS:")
    promptParts.push("- DO NOT interpret moisture values yourself.")
    promptParts.push("- DO NOT say whether a moisture reading is 'high', 'low', 'elevated', 'within normal range', 'indicates moisture problem', or anything similar.")
    promptParts.push("- DO NOT compare moisture readings to any standard or assumed normal value.")
    promptParts.push("- Instead, if a moisture reading was recorded at an alert location, ADD a recommendation reminding the inspector and customer to verify the moisture reading against the dry standard for that material, and to compare it against unaffected reference readings in the same property.")
    promptParts.push("- Example acceptable phrasing: 'Verify the recorded moisture reading at the alert location against the established dry standard for the affected material, and compare against unaffected reference readings in the property to determine whether moisture levels are elevated.'")
    promptParts.push("")
    promptParts.push("OUTPUT FORMAT:")
    promptParts.push("- Bullet points, one recommendation per line, starting each line with a hyphen.")
    promptParts.push("- No headers, no introduction, no conclusion, no preamble.")
    promptParts.push("- Aim for 4-8 actionable recommendations total.")
    promptParts.push("")

    promptParts.push("SCREENING DATA:")
    promptParts.push("")

    if (intake) {
      promptParts.push("Intake context:")
      if (intake.reason_for_screening) promptParts.push(`- Reason for screening: ${intake.reason_for_screening}`)
      if (intake.customer_concerns)    promptParts.push(`- Customer concerns: ${intake.customer_concerns}`)
      if (intake.reported_history)     promptParts.push(`- Property history: ${intake.reported_history}`)
      if (intake.scope)                promptParts.push(`- Inspection scope: ${intake.scope}`)
      promptParts.push("")
    }

    if (alerts && alerts.length > 0) {
      promptParts.push(`Alerts recorded (${alerts.length} total):`)
      alerts.forEach((a, i) => {
        const parts = []
        parts.push(`Alert #${i+1}`)
        if (a.room_name) parts.push(`Room: ${a.room_name}`)
        if (a.alert_strength) parts.push(`Strength: ${a.alert_strength}`)
        if (a.alert_location) parts.push(`Location: ${a.alert_location}`)
        if (a.visible_signs) parts.push(`Visible signs: ${a.visible_signs}`)
        if (a.moisture_value != null) {
          parts.push(`Raw moisture reading (DO NOT INTERPRET — only remind user to verify against dry standard): ${a.moisture_value} ${a.moisture_unit || ''}`)
        }
        if (a.thermal_observation) parts.push(`Thermal: ${a.thermal_observation}`)
        if (a.wall_cavity_test_result) parts.push(`Wall cavity: ${a.wall_cavity_test_result}`)
        if (a.notes) parts.push(`Notes: ${a.notes}`)
        promptParts.push("- " + parts.join("; "))
      })
      promptParts.push("")
    } else {
      promptParts.push("Alerts recorded: NONE — the canine did not alert in any inspected area.")
      promptParts.push("")
    }

    if (samples && samples.length > 0) {
      const withResults = samples.filter((s) => s.result_summary || s.result_notes)
      promptParts.push(`Lab samples taken: ${samples.length} total, ${withResults.length} with results.`)
      withResults.forEach((s) => {
        promptParts.push(`- ${s.sample_id_label || 'Unlabeled'} (${s.sample_type}) at ${s.location_label}: ${s.result_summary || s.result_notes}`)
      })
      if (samples.length - withResults.length > 0) {
        promptParts.push(`- ${samples.length - withResults.length} sample(s) are still pending lab results.`)
      }
      promptParts.push("")
    } else {
      promptParts.push("Lab samples taken: NONE.")
      promptParts.push("")
    }

    promptParts.push("Generate the recommendations now. Bullet points only, no preamble.")

    const prompt = promptParts.join("\n")

    // Call Anthropic
    const anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1024,
        messages: [{ role: "user", content: prompt }],
      }),
    })

    if (!anthropicRes.ok) {
      const errText = await anthropicRes.text()
      return new Response(
        JSON.stringify({ error: `Anthropic API error: ${anthropicRes.status} — ${errText}` }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 502 }
      )
    }

    const anthropicData = await anthropicRes.json()
    const textBlock = (anthropicData.content || []).find((b) => b.type === "text")
    const recommendations = textBlock?.text || ""

    return new Response(
      JSON.stringify({ recommendations }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    )
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message || "Unknown server error" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    )
  }
})
