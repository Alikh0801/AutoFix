// delete-card — removes a saved card, at Payriff and here.
//
// Deleting at Payriff is irreversible, so the rules that could refuse the
// removal are checked FIRST. begin_forget_card validates and hands back the
// token; only then does the gateway call happen; forget_card commits.
//
// Getting that order wrong would leave a provider holding a row that points
// at a token which no longer exists — a card that looks fine until the moment
// commission is due.

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { corsHeaders, json } from '../_shared/cors.ts';
import { deleteSavedCard, PayriffError } from '../_shared/payriff.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return json({ error: 'Not signed in' }, 401);

  let cardId: string;
  try {
    const body = await req.json();
    cardId = String(body?.cardId ?? '');
  } catch {
    return json({ error: 'Invalid request body' }, 400);
  }
  if (!cardId) return json({ error: 'cardId is required' }, 400);

  const supabase = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });

  // Ownership, the last-card rule and any settlement in flight are all
  // enforced here, before anything irreversible happens.
  const { data: cardUuid, error: beginError } = await supabase.rpc('begin_forget_card', {
    p_card_id: cardId,
  });
  if (beginError) return json({ error: beginError.message }, 400);

  // A card whose save never completed has no token at the gateway; there is
  // nothing to delete there, only the row here.
  if (cardUuid) {
    try {
      await deleteSavedCard(cardUuid);
    } catch (e) {
      const detail = e instanceof PayriffError ? e.message : String(e);
      console.error('deleteSavedCard failed', { cardId, detail });
      return json({ error: 'Kart silinmədi. Bir azdan yenidən cəhd et.' }, 502);
    }
  }

  const { error: forgetError } = await supabase.rpc('forget_card', { p_card_id: cardId });
  if (forgetError) {
    // The token is gone at Payriff but the row survived. Loud: this row now
    // describes a card that can never be charged.
    console.error('forget_card failed after gateway delete — ORPHAN ROW', {
      cardId,
      error: forgetError.message,
    });
    return json({ error: forgetError.message }, 500);
  }

  return json({ removed: true });
});
