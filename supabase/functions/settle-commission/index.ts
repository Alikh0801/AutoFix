// settle-commission — collects what a provider owes.
//
// Called by the provider's own app: right after a job completes, and again
// from the block screen's retry. Both are the same operation, so there is one
// endpoint rather than a normal path and a repair path that could drift apart.
//
// The card is charged BEFORE the database is touched. A card charge cannot be
// rolled back and a transaction can, so this order is what makes "if the card
// fails, the balance is untouched too" actually hold.

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { corsHeaders, json } from '../_shared/cors.ts';
import { chargeSavedCard, PayriffError } from '../_shared/payriff.ts';
import { resolveSettlement } from '../_shared/settlement.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

interface BeginRow {
  settlement_id: string;
  amount: number;
  from_balance: number;
  from_card: number;
  card_uuid: string | null;
  /** Set when an earlier attempt reached Payriff but never resolved. */
  pending_order_id: string | null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return json({ error: 'Not signed in' }, 401);

  const asUser = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });

  // Works out the split and reserves it. Nothing has moved yet. An attempt
  // already in flight comes back instead of a second one, so a double tap
  // cannot charge twice.
  const { data, error } = await asUser.rpc('begin_settlement');
  if (error) {
    // "Nothing to settle" and "not due yet" are ordinary outcomes, not faults.
    const benign = /nothing to settle|not due yet/i.test(error.message);
    return json({ error: error.message, settled: false }, benign ? 200 : 400);
  }

  const row: BeginRow | undefined = (data ?? [])[0];
  if (!row) return json({ settled: false, error: 'Nothing to settle' });

  // An earlier attempt reached Payriff and we never learned the result. Ask
  // them what happened rather than charging again — a second autoPay could
  // take the money twice, and no idempotency key is available to make that
  // safe.
  if (row.pending_order_id) {
    return await reconcile(row, row.pending_order_id);
  }

  // The balance covered it all — no card involved.
  if (Number(row.from_card) <= 0) {
    return await finish(row, true, null, 'BALANCE_ONLY', null);
  }

  if (!row.card_uuid) {
    return await finish(row, false, null, 'NO_CARD', 'Kart tapılmadı');
  }

  let outcome;
  try {
    outcome = await chargeSavedCard({
      cardUuid: row.card_uuid,
      amount: Number(row.from_card),
      description: 'AutoFix komissiya',
      callbackUrl: `${SUPABASE_URL}/functions/v1/payriff-payment-callback`,
    });
  } catch (e) {
    // The request itself failed, so no charge was made. Fail the settlement
    // rather than leaving it pending forever; the provider can retry.
    const detail = e instanceof PayriffError ? e.message : String(e);
    console.error('autoPay request failed', { settlementId: row.settlement_id, detail });
    return await finish(row, false, null, 'REQUEST_FAILED', detail);
  }

  // Neither collected nor refused. Deciding either way here would be a guess
  // with money on it, so the attempt is left open with its order id and the
  // provider is told to wait — crucially, they are NOT blocked for it.
  if (outcome.result === 'unresolved') {
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    const { error: markError } = await admin.rpc('mark_settlement_unresolved', {
      p_settlement_id: row.settlement_id,
      p_order_id: outcome.orderId,
      p_gateway_status: outcome.gatewayStatus,
    });
    if (markError) {
      // The order id is the only handle on a charge that may have taken money.
      console.error('UNRESOLVED CHARGE NOT RECORDED', {
        settlementId: row.settlement_id,
        orderId: outcome.orderId,
        gatewayStatus: outcome.gatewayStatus,
        error: markError.message,
      });
    }
    return json({
      settled: false,
      awaitingResult: true,
      gatewayStatus: outcome.gatewayStatus,
    });
  }

  return await finish(
    row,
    outcome.result === 'paid',
    outcome.orderId,
    outcome.gatewayStatus,
    outcome.reason ?? null
  );
});

/**
 * Decides an attempt whose result we never saw. The work itself lives in
 * _shared/settlement.ts, because the callback reaches the same conclusion by
 * the same route and two copies of a money decision would eventually differ.
 */
async function reconcile(row: BeginRow, orderId: string): Promise<Response> {
  let verdict;
  try {
    verdict = await resolveSettlement({
      id: row.settlement_id,
      fromCard: Number(row.from_card),
      orderId,
    });
  } catch {
    // Already logged where it happened.
    return json({ error: 'Ödəniş qeydə alınmadı', settled: false }, 500);
  }

  if (verdict === 'unresolved') {
    return json({ settled: false, awaitingResult: true });
  }

  return json({
    settled: verdict === 'paid',
    amount: Number(row.amount),
    fromBalance: Number(row.from_balance),
    fromCard: Number(row.from_card),
    reason: verdict === 'paid' ? undefined : 'Ödəniş baş tutmadı',
  });
}

/** Commits or fails the reserved settlement. Service role, because this is the
 *  call that forgives debt. */
async function finish(
  row: BeginRow,
  charged: boolean,
  orderId: string | null,
  gatewayStatus: string,
  reason: string | null
): Promise<Response> {
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  const { error } = await admin.rpc('complete_settlement', {
    p_settlement_id: row.settlement_id,
    p_charged: charged,
    p_order_id: orderId,
    p_gateway_status: gatewayStatus,
    p_failure_reason: reason,
  });

  if (error) {
    // Worst case: money left the card but the debt is still recorded. Loud,
    // because only reconciliation can put this right.
    console.error(charged ? 'CHARGED BUT NOT RECORDED' : 'complete_settlement failed', {
      settlementId: row.settlement_id,
      orderId,
      error: error.message,
    });
    return json({ error: 'Ödəniş qeydə alınmadı', settled: false }, 500);
  }

  return json({
    settled: charged,
    amount: Number(row.amount),
    fromBalance: Number(row.from_balance),
    fromCard: Number(row.from_card),
    reason: charged ? undefined : reason,
  });
}
