// sync-cards — reconciles our card list with Payriff's.
//
// Payriff lists only cards whose save completed, so anything we still hold as
// usable but which is missing there has gone away on their side. Those rows
// are dropped, because the alternative is discovering it mid-settlement when
// the charge fails and the provider gets blocked for a card we should have
// known was dead.
//
// The provider's own app calls this — on the cards screen, and before a
// settlement retry.

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { corsHeaders, json } from '../_shared/cors.ts';
import { listSavedCards, PayriffError } from '../_shared/payriff.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return json({ error: 'Not signed in' }, 401);

  const supabase = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: userData, error: userError } = await supabase.auth.getUser();
  const uid = userData?.user?.id;
  if (userError || !uid) return json({ error: 'Not signed in' }, 401);

  let cards;
  try {
    // customerRef is the provider's own id, which is what the saves were
    // created under.
    cards = await listSavedCards(uid);
  } catch (e) {
    const detail = e instanceof PayriffError ? e.message : String(e);
    console.error('listSavedCards failed', { uid, detail });
    // A failed sync is not a failed screen — the app falls back to what we
    // already hold.
    return json({ synced: false, removed: 0 });
  }

  const uuids = cards.map((c) => c.cardUuid).filter(Boolean);

  // An empty list would delete every card we hold. That is a legitimate
  // outcome, but it is also exactly what a changed payload shape or a wrong
  // customerRef looks like — and getting it wrong wipes a working card. The
  // failed-charge path already handles a dead card safely, so refuse the
  // sweeping case and say so in the logs.
  if (uuids.length === 0) {
    console.warn('listSavedCards returned nothing — skipping reconcile', { uid });
    return json({ synced: false, removed: 0 });
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const { data: removed, error } = await admin.rpc('reconcile_cards', {
    p_provider_id: uid,
    p_card_uuids: uuids,
  });
  if (error) {
    console.error('reconcile_cards failed', { uid, error: error.message });
    return json({ synced: false, removed: 0 });
  }

  return json({ synced: true, removed: Number(removed ?? 0), total: uuids.length });
});
