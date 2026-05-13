// Supabase Edge Function: extract-brand-colors
//
// Receives 5 dominant colors extracted from a logo (hex codes) along with
// the logo as base64 PNG/JPG. Sends them to Claude vision and asks Claude to
// identify and label them as:
//   primary       — main brand color (logo's most identity-defining color)
//   primary_dark  — a darker shade of primary, for hover states
//   primary_light — a lighter shade of primary, for backgrounds
//   accent        — the secondary/highlight color
//   accent_dark   — a darker shade of accent
//
// Claude may choose colors NOT in the extracted set if a derived shade
// (darker/lighter version) makes more sense for that role. The whole goal
// is "a palette that works", not "literally use these 5 colors."
//
// Deploy:
//   supabase functions deploy extract-brand-colors
//
// Request body:
//   {
//     "extracted_colors": ["#A82C1F", "#FFB73C", "#FFFFFF", "#222222", "#7C7C7C"],
//     "logo_base64": "iVBORw0KGgoAAAANSUhEUgA...",  (no data: prefix)
//     "logo_media_type": "image/png"
//   }
//
// Response:
//   {
//     "palette": {
//       "primary":       "#A82C1F",
//       "primary_dark":  "#7A1F15",
//       "primary_light": "#D55F50",
//       "accent":        "#FFB73C",
//       "accent_dark":   "#E69E2A"
//     },
//     "reasoning": "Short explanation of choices"
//   }

import "https://deno.land/x/xhr@0.1.0/mod.ts"
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

const SYSTEM_PROMPT = `You are a brand color analyst. The user uploads a company logo, and a color-extraction algorithm has pre-extracted the 5 most dominant colors from it.

Your job: look at the logo image AND the extracted colors, then return a 5-color brand palette suitable for use across a business application. The palette has these roles:

- primary: The brand's MAIN identity color. The one that says "this is X company." Usually the boldest, most prominent color in the logo. Avoid black, white, or grays unless the entire brand is monochrome.
- primary_dark: A noticeably darker shade of primary. Used for hover states. Reduce brightness by ~25-30%.
- primary_light: A noticeably lighter shade of primary. Used for subtle backgrounds and accents. Increase brightness toward (but not all the way to) white.
- accent: The brand's SECONDARY color — the contrast/highlight color. Usually the second most prominent color. Different hue from primary. Avoid black/white/gray.
- accent_dark: A darker shade of accent. Reduce brightness by ~15-20%.

Rules:
1. Pick from the extracted colors when they fit. Derive shades when needed — primary_dark, primary_light, and accent_dark are usually derived from primary/accent rather than picked literally.
2. Avoid pure black, pure white, and grays as primary or accent. They're not "brand colors", they're neutrals. Skip them unless the brand is truly monochrome.
3. Keep colors readable. Don't pick a primary so light that white text on it is illegible (test for that mentally).
4. Return ONLY valid JSON in this exact format:

{
  "palette": {
    "primary": "#RRGGBB",
    "primary_dark": "#RRGGBB",
    "primary_light": "#RRGGBB",
    "accent": "#RRGGBB",
    "accent_dark": "#RRGGBB"
  },
  "reasoning": "One short sentence explaining your color choices."
}

No markdown, no code fences, no preamble. Just the JSON object.`

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

    const { extracted_colors, logo_base64, logo_media_type } = await req.json()

    if (!Array.isArray(extracted_colors) || extracted_colors.length === 0) {
      return new Response(
        JSON.stringify({ error: "extracted_colors must be a non-empty array of hex strings." }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      )
    }
    if (!logo_base64 || !logo_media_type) {
      return new Response(
        JSON.stringify({ error: "logo_base64 and logo_media_type are required." }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      )
    }

    const userMessage = {
      role: "user",
      content: [
        {
          type: "image",
          source: {
            type: "base64",
            media_type: logo_media_type,
            data: logo_base64,
          },
        },
        {
          type: "text",
          text: `Here are the 5 dominant colors my algorithm extracted from this logo:\n\n${extracted_colors.map((c, i) => `${i + 1}. ${c}`).join("\n")}\n\nLook at the logo and pick the best 5-color brand palette.`,
        },
      ],
    }

    const anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 500,
        system: SYSTEM_PROMPT,
        messages: [userMessage],
      }),
    })

    if (!anthropicRes.ok) {
      const errorText = await anthropicRes.text()
      return new Response(
        JSON.stringify({ error: `Anthropic API error: ${errorText}` }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: anthropicRes.status }
      )
    }

    const anthropicData = await anthropicRes.json()
    const rawText = anthropicData.content?.[0]?.text?.trim() || ""

    // Defensive parse — strip code fences if Claude added any
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

    // Validate palette shape
    const p = parsed.palette || {}
    const requiredKeys = ["primary", "primary_dark", "primary_light", "accent", "accent_dark"]
    for (const k of requiredKeys) {
      if (!p[k] || !/^#[0-9A-Fa-f]{6}$/.test(p[k])) {
        return new Response(
          JSON.stringify({ error: `Palette missing or malformed key: ${k}`, raw: parsed }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 502 }
        )
      }
    }

    return new Response(
      JSON.stringify(parsed),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    )
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    )
  }
})
