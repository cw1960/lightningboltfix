// @deno-types="npm:@supabase/supabase-js"
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Allow both extension origins (old and new)
const ALLOWED_ORIGINS = [
  "chrome-extension://fakceibnakpdpifmapgjmjdkhelhpkae",
  "chrome-extension://flgjpomndiioeeiggcjkkiklnpdoejbl"
];
function getCorsHeaders(req: Request) {
  const origin = req.headers.get("origin") || "";
  if (ALLOWED_ORIGINS.includes(origin)) {
    return {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
      "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
      "Content-Type": "application/json"
    };
  }
  return {
    "Access-Control-Allow-Origin": "null",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
    "Content-Type": "application/json"
  };
}

serve(async (req: Request) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  let user_id: string | undefined;
  try {
    const body = await req.json();
    user_id = body.user_id;
  } catch (_) {}
  if (!user_id) {
    return new Response(JSON.stringify({ error: "Missing user_id" }), { status: 400, headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  // 1. Get the user's current default_llm (built-in key) from profile
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("default_llm, use_builtin_keys")
    .eq("id", user_id)
    .maybeSingle();

  if (profileError || !profile) {
    return new Response(JSON.stringify({ error: "Profile not found" }), { status: 404, headers: corsHeaders });
  }

  // 2. Get the user's default LLM configuration
  const { data: config, error: configError } = await supabase
    .from("llm_user_configurations")
    .select("id, api_key, provider_type, is_default")
    .eq("profile_id", user_id)
    .eq("is_default", true)
    .maybeSingle();

  if (configError) {
    return new Response(JSON.stringify({ error: "Failed to fetch LLM config" }), { status: 500, headers: corsHeaders });
  }

  // 3. Determine if the key is a built-in key (use_builtin_keys true, and config.api_key matches a pool key)
  let releasedKey: string | null = null;
  if (profile.use_builtin_keys && config && config.api_key) {
    // Check if the key is in the pool
    const { data: poolKey, error: poolError } = await supabase
      .from("api_key_pool")
      .select("api_key, assigned_count")
      .eq("api_key", config.api_key)
      .maybeSingle();
    if (!poolError && poolKey) {
      releasedKey = poolKey.api_key;
      // 4. Clear the key from profile and config
      await supabase.from("profiles").update({ default_llm: null }).eq("id", user_id);
      await supabase.from("llm_user_configurations").update({ api_key: null }).eq("id", config.id);
      // 5. Decrement assigned_count (floor at 0)
      const newCount = Math.max(0, (poolKey.assigned_count || 1) - 1);
      await supabase.from("api_key_pool").update({ assigned_count: newCount }).eq("api_key", releasedKey);
    }
  }

  return new Response(JSON.stringify({ released: !!releasedKey, releasedKey }), { status: 200, headers: corsHeaders });
}); 