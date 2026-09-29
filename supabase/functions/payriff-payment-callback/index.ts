// payriff-payment-callback — fired by Payriff when a commission charge
// finishes.
//
// This closes the loop on the one case autoPay cannot settle by itself: the
// request reached Payriff, money may have moved, and the reply never came back
// to us. Without this the settlement sits open until the provider happens to
// open the earnings screen and tap "check again".
//
// SECURITY: the callback carries no signature, so anyone who learns this URL
// can POST to it. Nothing here trusts the body beyond pulling an orderId out
// of it — the verdict comes from Payriff's own API, and only for an order that
// matches a settlement we opened ourselves. A forged callback at worst makes
// us re-read an order that is still pending.
//
// Deploy without JWT verification — Payriff sends no Supabase token:
//   supabase functions deploy payriff-payment-callback --no-verify-jwt

import { readBody } from '../_shared/cardSave.ts';
import { extractOrderId, findOpenSettlement, resolveSettlement } from '../_shared/settlement.ts';

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const body = await readBody(req);
  const orderId = extractOrderId(body, url);

  if (!orderId) {
    // 200 so the gateway stops retrying something we can never interpret;
    // logged so a shape change is visible instead of silent.
    console.error('Payment callback with no orderId', {
      body: JSON.stringify(body).slice(0, 500),
    });
    return new Response('no order id', { status: 200 });
  }

  let open;
  try {
    open = await findOpenSettlement(orderId);
  } catch (e) {
    console.error('settlement lookup failed', { orderId, error: String(e) });
    return new Response('lookup failed', { status: 500 });
  }

  if (!open) {
    // Already decided, or an order from another flow on the same merchant
    // account. Either way there is nothing to do, and a 200 stops Payriff
    // retrying forever.
    //
    // One race hides here: if this callback beats the autoPay response, the
    // order id is not on the row yet and nothing matches. That costs the
    // automatic resolution, not the money — the settlement stays open and the
    // provider's "check again" still resolves it. Retrying instead would mean
    // retrying every foreign order forever, which is the worse trade.
    console.info('Payment callback with no open settlement', { orderId });
    return new Response('no open settlement', { status: 200 });
  }

  try {
    const verdict = await resolveSettlement(open);
    return new Response(`ok: ${verdict}`, { status: 200 });
  } catch (e) {
    // resolveSettlement already logged the detail. A retry is safe:
    // complete_settlement ignores anything no longer pending.
    console.error('Payment callback could not resolve', { orderId, error: String(e) });
    return new Response('resolve failed', { status: 500 });
  }
});
