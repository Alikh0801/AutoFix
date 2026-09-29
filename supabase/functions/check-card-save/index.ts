// check-card-save — lets the app ask for the real state while the payment
// page is closing, instead of waiting on a callback that may lag.
//
// Ownership is checked first through a function scoped to auth.uid(), so a
// signed-in provider can only poll their own save.

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { corsHeaders, json } from '../_shared/cors.ts';
import { syncCardSave } from '../_shared/cardSave.ts';
import { PayriffError } from '../_shared/payriff.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return json({ error: 'Not signed in' }, 401);

  let cardSaveId: string;
  try {
    const body = await req.json();
    cardSaveId = String(body?.cardSaveId ?? '');
  } catch {
    return json({ error: 'Invalid request body' }, 400);
  }
  if (!cardSaveId) return json({ error: 'cardSaveId is required' }, 400);

  const supabase = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });

  // Returns a row only when this save belongs to the caller.
  const { data, error } = await supabase.rpc('my_card_save_status', {
    p_card_save_id: cardSaveId,
  });
  if (error) return json({ error: error.message }, 400);
  if (!data || data.length === 0) return json({ error: 'Card save not found' }, 404);

  try {
    const result = await syncCardSave(cardSaveId);
    return json(result);
  } catch (e) {
    const detail = e instanceof PayriffError ? e.message : String(e);
    console.error('check-card-save failed', { cardSaveId, detail });
    // Fall back to whatever we already recorded rather than failing the poll.
    return json({ status: String(data[0].status ?? '').toUpperCase(), stale: true });
  }
});
