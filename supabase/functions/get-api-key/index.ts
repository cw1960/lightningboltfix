// @deno-types="npm:@supabase/supabase-js"
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Allow both extension origins (old and new)
const ALLOWED_ORIGINS = [
  "chrome-extension://fakceibnakpdpifmapgjmjdkhelhpkae",
  "chrome-extension://flgjpomndiioeeiggcjkkiklnpdoejbl"
];
function getCorsHeaders(req) {
  const origin = req.headers.get("origin") || "";
  if (ALLOWED_ORIGINS.includes(origin)) {
    return {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
      "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
      "Content-Type": "application/json"
    };
  }
  // Block all other origins, but still include all keys
  return {
    "Access-Control-Allow-Origin": "null",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
    "Content-Type": "application/json"
  };
}

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: corsHeaders
    });
  }

  // Parse request body
  const { user_id } = await req.json();
  if (!user_id) {
    return new Response(JSON.stringify({
      error: 'Missing user_id'
    }), {
      status: 400,
      headers: corsHeaders
    });
  }

  // Get env vars for service role
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  // 1. Find the least-used API key(s)
  const { data: keys, error: keyError } = await supabase
    .from('api_key_pool')
    .select('api_key, assigned_count')
    .order('assigned_count', { ascending: true })
    .limit(1);

  if (keyError || !keys || keys.length === 0) {
    return new Response(JSON.stringify({ error: 'No API keys available' }), { status: 500, headers: corsHeaders });
  }

  // Find all keys with the lowest assigned_count
  const minCount = keys[0].assigned_count;
  const { data: allMinKeys, error: allMinKeysError } = await supabase
    .from('api_key_pool')
    .select('api_key, assigned_count')
    .eq('assigned_count', minCount);

  if (allMinKeysError || !allMinKeys || allMinKeys.length === 0) {
    return new Response(JSON.stringify({ error: 'No API keys available' }), { status: 500, headers: corsHeaders });
  }

  // Pick one at random if there are ties
  const chosenKey = allMinKeys[Math.floor(Math.random() * allMinKeys.length)].api_key;

  // 2. Update the user's default_llm in profiles
  const { error: profileError } = await supabase
    .from('profiles')
    .update({ default_llm: chosenKey })
    .eq('id', user_id);

  if (profileError) {
    return new Response(JSON.stringify({ error: 'Failed to update user profile' }), { status: 500, headers: corsHeaders });
  }

  // 2.5. Ensure a default LLM configuration exists for the user
  // Check if a default config exists
  const { data: existingConfig, error: configError } = await supabase
    .from('llm_user_configurations')
    .select('id')
    .eq('profile_id', user_id)
    .eq('is_default', true)
    .maybeSingle();

  if (configError) {
    return new Response(JSON.stringify({ error: 'Failed to check LLM config' }), { status: 500, headers: corsHeaders });
  }

  if (!existingConfig) {
    // Insert a default config for Google Gemini 2.0 Flash (Free Tier)
    const { error: insertError } = await supabase
      .from('llm_user_configurations')
      .insert({
        profile_id: user_id,
        provider_type: 'Google',
        model_name: 'Google Gemini 2.0 Flash (Free Tier)',
        api_key: chosenKey,
        api_endpoint: null,
        is_default: true
      });
    if (insertError) {
      return new Response(JSON.stringify({ error: 'Failed to insert default LLM config' }), { status: 500, headers: corsHeaders });
    }
  }

  // 3. Increment assigned_count for the chosen key
  const { error: updateKeyError } = await supabase
    .from('api_key_pool')
    .update({ assigned_count: minCount + 1 })
    .eq('api_key', chosenKey);

  if (updateKeyError) {
    return new Response(JSON.stringify({ error: 'Failed to increment assigned_count' }), { status: 500, headers: corsHeaders });
  }

  // 4. Return the assigned key string
  return new Response(JSON.stringify({ api_key: chosenKey }), { status: 200, headers: corsHeaders });
});
