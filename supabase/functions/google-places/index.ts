// Supabase Edge Function — Google Places API (Text Search) lead extractor.
//
// Requires the GOOGLE_PLACES_API_KEY secret. Set it with:
//   supabase secrets set GOOGLE_PLACES_API_KEY=sua_chave
//
// Note: the Places API Text Search endpoint returns at most 20 results per request
// (no pagination is implemented here), so maxResults is clamped to 20 even if the
// frontend offers higher options like 50 or 100.

import { corsHeaders } from "../_shared/cors.ts";

const GOOGLE_PLACES_API_KEY = Deno.env.get("GOOGLE_PLACES_API_KEY")!;
const PLACES_API_MAX_RESULTS = 20;

interface SearchBody {
  query: string;
  city?: string;
  maxResults?: number;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { query, city, maxResults }: SearchBody = await req.json();
    if (!query) throw new Error("query is required");

    const textQuery = city ? `${query} em ${city}` : query;
    const maxResultCount = Math.min(maxResults ?? PLACES_API_MAX_RESULTS, PLACES_API_MAX_RESULTS);

    const response = await fetch("https://places.googleapis.com/v1/places:searchText", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": GOOGLE_PLACES_API_KEY,
        "X-Goog-FieldMask":
          "places.displayName,places.formattedAddress,places.nationalPhoneNumber,places.websiteUri,places.rating",
      },
      body: JSON.stringify({ textQuery, maxResultCount }),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Google Places API error: ${errText}`);
    }

    const result = await response.json();
    const places = result.places ?? [];

    const data = places.map((place: Record<string, any>) => ({
      name: place.displayName?.text ?? "",
      address: place.formattedAddress ?? "",
      phone: place.nationalPhoneNumber ?? "",
      website: place.websiteUri ?? "",
      rating: place.rating ?? null,
    }));

    return new Response(JSON.stringify({ ok: true, data }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ ok: false, error: String(error) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
