// start-card-save — begins saving a provider's card.
//
// Payriff is called first and the row written after: unlike a payment, there
// is no money at risk if the write fails. An orphaned save process at Payriff
// simply expires, and the provider can try again.

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { corsHeaders, json } from '../_shared/cors.ts';
import { PayriffError, startCardSave } from '../_shared/payriff.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return json({ error: 'Not signed in' }, 401);

  // Passing the caller's JWT through means the RPCs below run as that user,
  // so auth.uid() and RLS behave exactly as they do from the app.
  const supabase = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: userData, error: userError } = await supabase.auth.getUser();
  const uid = userData?.user?.id;
  if (userError || !uid) return json({ error: 'Not signed in' }, 401);

  let started;
  try {
    started = await startCardSave({
      // Payriff groups saved cards under this reference, so the provider's own
      // id is what makes their listing match ours.
      customerRef: uid,
      callbackUrl: `${SUPABASE_URL}/functions/v1/payriff-card-callback`,
      description: 'AutoFix komissiya kartı',
    });
  } catch (e) {
    console.error('startCardSave failed', { uid, error: String(e) });
    const message = e instanceof PayriffError ? e.message : 'Kart bağlanmadı';
    return json({ error: message }, 502);
  }

  const { error: recordError } = await supabase.rpc('record_card_save', {
    p_card_save_id: started.cardSaveId,
  });
  if (recordError) {
    console.error('record_card_save failed', {
      uid,
      cardSaveId: started.cardSaveId,
      error: recordError.message,
    });
    return json({ error: recordError.message }, 400);
  }

  return json({ cardSaveId: started.cardSaveId, paymentUrl: started.paymentUrl });
});
