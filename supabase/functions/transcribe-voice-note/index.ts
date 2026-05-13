// Supabase Edge Function: transcribe-voice-note
//
// Receives base64 audio + job/room context. Two-step process:
//   1. Transcribe the audio (audio → text)
//   2. Send the transcript + context to Claude, ask it to:
//      - Clean up the transcript (grammar, fillers)
//      - Pull out structured field values where possible
//
// For step 1 we use Anthropic's text models since they don't support audio
// natively yet. So we use OpenAI Whisper for transcription — that's the
// industry standard and very cheap (~$0.006/minute).
//
// Set both env vars:
//   supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
//   supabase secrets set OPENAI_API_KEY=sk-...
//
// Deploy:
//   supabase functions deploy transcribe-voice-note --no-verify-jwt --project-ref alcyjrprmujjtmqxhgup
//
// Request body:
//   {
//     "audio_base64": "...",
//     "audio_mime_type": "audio/webm",
//     "context": {
//       "job_type": "water_mit" | "screening" | "combo",
//       "room_name": "Master bathroom",  // optional
//       "scope": "moisture_reading" | "general_notes" | "room_walkthrough" | "scope_entry"
//     }
//   }
//
// Response:
//   {
//     "transcript": "Clean text version of what was said.",
//     "structured": {
//       // shape depends on context.scope, but examples:
//       // for moisture_reading: { material, value, unit, notes }
//       // for room_walkthrough: { materials_affected[], actions[], reasons[], notes }
//     },
//     "summary": "One-sentence summary of what was recorded."
//   }

import "https://deno.land/x/xhr@0.1.0/mod.ts"
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

const SYSTEM_PROMPT = `You are a field-notes assistant for a water damage restoration / mold inspection tech.

The tech speaks a voice note. You receive the raw transcript along with context about what kind of note this is (moisture reading, room walkthrough, general notes, scope entry).

Your job:
1. Return a cleaned-up "transcript" — fix grammar, remove fillers ("um", "uh", "you know"), keep the tech's actual content. Don't editorialize.
2. Return a "structured" object with whatever fields you can extract from the speech. Shape depends on the scope.
3. Return a "summary" — one sentence describing what was said.

For scope="moisture_reading", structured should have:
  { material: string (e.g. "drywall", "carpet"), value: number, unit: "%MC" | "REL" | "WME", notes: string }

For scope="room_walkthrough", structured should have:
  {
    materials_affected: string[],  // e.g. ["drywall", "baseboard"]
    actions: string[],             // e.g. ["removed", "treated"]
    reasons: string[],             // e.g. ["contamination", "non-salvageable"]
    notes: string                  // anything else useful
  }

For scope="scope_entry", structured should have:
  {
    work_items: string[],
    quantities: string[],
    notes: string
  }

For scope="general_notes" or unknown scope, structured should have:
  { notes: string, observations: string[] }

If you can't extract a value confidently, leave that field out. Don't make up data.

Return ONLY valid JSON in this format:

{
  "transcript": "cleaned-up text",
  "structured": { ... shape per scope ... },
  "summary": "one sentence"
}

No markdown, no code fences, no preamble. Just JSON.`

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  try {
    console.log("[transcribe-voice-note] request received")

    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY")
    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY")

    if (!ANTHROPIC_API_KEY) {
      return new Response(
        JSON.stringify({ error: "Anthropic API key not configured." }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
      )
    }
    if (!OPENAI_API_KEY) {
      return new Response(
        JSON.stringify({ error: "OpenAI API key not configured — needed for audio transcription. Run: supabase secrets set OPENAI_API_KEY=sk-..." }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
      )
    }

    const { audio_base64, audio_mime_type, context } = await req.json()
    if (!audio_base64 || !audio_mime_type) {
      return new Response(
        JSON.stringify({ error: "audio_base64 and audio_mime_type are required." }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      )
    }

    // ---- STEP 1: Transcribe with Whisper ----
    console.log("[transcribe-voice-note] decoding audio, calling Whisper...")

    // Decode base64 to bytes for the multipart form
    const audioBytes = Uint8Array.from(atob(audio_base64), c => c.charCodeAt(0))
    const audioBlob = new Blob([audioBytes], { type: audio_mime_type })

    const form = new FormData()
    form.append('file', audioBlob, `note.${audio_mime_type.split('/')[1] || 'webm'}`)
    form.append('model', 'whisper-1')
    form.append('response_format', 'text')

    const whisperRes = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: form,
    })
    console.log("[transcribe-voice-note] whisper status:", whisperRes.status)

    if (!whisperRes.ok) {
      const errorText = await whisperRes.text()
      console.error("[transcribe-voice-note] whisper error:", errorText)
      return new Response(
        JSON.stringify({ error: `Whisper API error: ${errorText}` }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: whisperRes.status }
      )
    }

    const rawTranscript = await whisperRes.text()
    console.log("[transcribe-voice-note] transcribed length:", rawTranscript.length)

    // If transcript is empty (silent audio), bail early
    if (!rawTranscript.trim()) {
      return new Response(
        JSON.stringify({
          transcript: '',
          structured: {},
          summary: 'No speech detected in the recording.',
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }

    // ---- STEP 2: Send transcript to Claude for cleanup + structure ----
    console.log("[transcribe-voice-note] calling claude for structure...")

    const ctxNote = context
      ? `Context: job_type=${context.job_type || 'unknown'}, scope=${context.scope || 'general_notes'}${context.room_name ? `, room=${context.room_name}` : ''}.`
      : 'No additional context.'

    const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 800,
        system: SYSTEM_PROMPT,
        messages: [{
          role: "user",
          content: `${ctxNote}\n\nRaw transcript from the tech:\n"${rawTranscript.trim()}"\n\nReturn JSON only.`,
        }],
      }),
    })
    console.log("[transcribe-voice-note] claude status:", claudeRes.status)

    if (!claudeRes.ok) {
      const errorText = await claudeRes.text()
      console.error("[transcribe-voice-note] claude error:", errorText)
      // Even if structuring fails, return the raw transcript as a fallback
      return new Response(
        JSON.stringify({
          transcript: rawTranscript.trim(),
          structured: {},
          summary: 'Transcribed but couldn\'t structure: ' + errorText,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }

    const claudeData = await claudeRes.json()
    const rawClaudeText = claudeData.content?.[0]?.text?.trim() || ""
    const cleaned = rawClaudeText.replace(/^```(?:json)?\s*/i, "").replace(/```$/, "").trim()

    let parsed
    try {
      parsed = JSON.parse(cleaned)
    } catch (e) {
      // If JSON parse fails, still return the raw transcript so the user gets value
      return new Response(
        JSON.stringify({
          transcript: rawTranscript.trim(),
          structured: {},
          summary: 'Transcribed but Claude returned non-JSON.',
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }

    // Fill in any missing fields
    if (!parsed.transcript) parsed.transcript = rawTranscript.trim()
    if (!parsed.structured) parsed.structured = {}
    if (!parsed.summary) parsed.summary = ''

    return new Response(
      JSON.stringify(parsed),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    )
  } catch (err) {
    console.error("[transcribe-voice-note] exception:", err.message)
    return new Response(
      JSON.stringify({ error: err.message }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    )
  }
})
