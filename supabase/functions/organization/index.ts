// @ts-nocheck
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers":
        "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

serve(async (req) => {
    // CORS preflight
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
    }

    try {
        // Required headers (KEEP — this is why it works)
        const auth = req.headers.get("authorization");
        const apikey = req.headers.get("apikey");

        if (!auth || !apikey) {
            return new Response(
                JSON.stringify({ error: "Missing authorization or apikey" }),
                { status: 401, headers: corsHeaders }
            );
        }

        // DB client (server-side only)
        const supabaseUrl = Deno.env.get("SUPABASE_URL");
        const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

        if (!supabaseUrl || !supabaseKey) {
            console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
            return new Response(
                JSON.stringify({ error: "Server configuration error: Missing environment variables" }),
                { status: 500, headers: corsHeaders }
            );
        }

        const supabase = createClient(supabaseUrl, supabaseKey);

        // GET organization settings
        if (req.method === "GET") {
            const { data, error } = await supabase
                .from("organization_settings")
                .select("*")
                .single();

            if (error && error.code !== "PGRST116") {
                console.error("Supabase error:", error);
                return new Response(JSON.stringify({ error: error.message }), {
                    status: 500,
                    headers: corsHeaders,
                });
            }

            return new Response(JSON.stringify(data || {}), {
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
        }

        // POST (save/update organization settings)
        if (req.method === "POST") {
            const body = await req.json();

            // MERGED: Include ALL fields from the frontend
            const { name, address, city, state, zip, phone, website, logo_url, primary_contact_id } = body;

            if (!name) {
                return new Response(
                    JSON.stringify({ error: "Name is required" }),
                    { status: 400, headers: corsHeaders }
                );
            }

            const { data, error } = await supabase
                .from("organization_settings")
                .upsert(
                    {
                        id: 1,
                        name,
                        address,
                        city,
                        state,
                        zip,
                        phone,
                        website,
                        logo_url,
                        primary_contact_id,
                        updated_at: new Date().toISOString(),
                    },
                    { onConflict: "id" }
                )
                .select()
                .single();

            if (error) {
                console.error("Supabase upsert error:", error);
                return new Response(JSON.stringify({ error: error.message }), {
                    status: 500,
                    headers: corsHeaders,
                });
            }

            return new Response(JSON.stringify(data), {
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
        }

        return new Response("Method Not Allowed", {
            status: 405,
            headers: corsHeaders,
        });

    } catch (err) {
        console.error("Unexpected error:", err);
        return new Response(JSON.stringify({
            error: "Internal Server Error",
            details: err instanceof Error ? err.message : String(err),
            stack: err instanceof Error ? err.stack : undefined
        }), {
            status: 500,
            headers: corsHeaders,
        });
    }
});
