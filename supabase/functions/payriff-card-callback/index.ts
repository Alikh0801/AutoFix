// payriff-card-callback — fired by Payriff when a card save finishes.
//
// SECURITY: the callback carries no signature, so anyone who learns this URL
// can POST to it. Nothing here trusts the body beyond pulling a cardSaveId
// out of it; the status and the card token come from Payriff's own API. A
// forged callback at worst makes us re-read a save that is still pending.
//
// Deploy without JWT verification — Payriff sends no Supabase token:
//   supabase functions deploy payriff-card-callback --no-verify-jwt

import { extractCardSaveId, readBody, syncCardSave } from '../_shared/cardSave.ts';
import { PayriffError } from '../_shared/payriff.ts';

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const body = await readBody(req);
  const cardSaveId = extractCardSaveId(body, url);

  if (!cardSaveId) {
    // 200 so the gateway stops retrying something we can never interpret;
    // logged so a shape change is visible instead of silent.
    console.error('Card callback with no cardSaveId', {
      body: JSON.stringify(body).slice(0, 500),
    });
    return new Response('no card save id', { status: 200 });
  }

  try {
    const { status } = await syncCardSave(cardSaveId);
    return new Response(`ok: ${status}`, { status: 200 });
  } catch (e) {
    if (e instanceof Error && e.message.includes('Unknown card save')) {
      // Belongs to another integration on the same merchant account.
      console.warn('Card callback for a save we did not start', { cardSaveId });
      return new Response('unknown card save', { status: 200 });
    }
    const detail = e instanceof PayriffError ? e.message : String(e);
    console.error('Card callback verification failed', { cardSaveId, detail });
    // Payriff was unreachable or answered oddly. The sync is idempotent, so a
    // retry costs nothing.
    return new Response('verification failed', { status: 500 });
  }
});
