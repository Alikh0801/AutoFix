// Deciding a commission charge whose result we never saw.
//
// Two things need this: the provider tapping "check again", and the callback
// Payriff fires when the payment finishes. Both go through here so there is
// one definition of "what actually happened" — and neither trusts a callback
// body, because Payriff signs nothing. The callback only tells us which order
// to ask about; the answer comes from Payriff's own API.

import { createClient, SupabaseClient } from 'jsr:@supabase/supabase-js@2';
import { classifyPaymentStatus, getOrder, PayriffError, type ChargeResult } from './payriff.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

function admin(): SupabaseClient {
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
}

export interface OpenSettlement {
  id: string;
  /** What the card was supposed to be charged. */
  fromCard: number;
  orderId: string;
}

/** The still-open settlement behind an order id, if it is one of ours. */
export async function findOpenSettlement(orderId: string): Promise<OpenSettlement | null> {
  const { data, error } = await admin()
    .from('commission_settlements')
    .select('id, from_card, order_id')
    .eq('order_id', orderId)
    .eq('status', 'pending')
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return null;
  return { id: data.id, fromCard: Number(data.from_card), orderId: data.order_id };
}

/**
 * Asks Payriff about the order and closes the settlement if the answer is
 * definite.
 *
 * Only a definite answer closes it. Anything still in progress — or any status
 * we do not recognise — leaves the row open and the provider unblocked,
 * because the alternative is acting on a guess about money.
 */
export async function resolveSettlement(s: OpenSettlement): Promise<ChargeResult> {
  let order;
  try {
    order = await getOrder(s.orderId);
  } catch (e) {
    const detail = e instanceof PayriffError ? e.message : String(e);
    console.error('order lookup failed', { settlementId: s.id, orderId: s.orderId, detail });
    return 'unresolved';
  }

  let verdict = classifyPaymentStatus(order.paymentStatus);

  // A paid order for the wrong amount is not this settlement being paid. Most
  // likely a partial capture; either way it needs a human, not a cleared debt.
  if (verdict === 'paid' && Math.abs(Number(order.amount) - s.fromCard) > 0.009) {
    console.error('AMOUNT MISMATCH on reconcile', {
      settlementId: s.id,
      orderId: s.orderId,
      expected: s.fromCard,
      actual: order.amount,
    });
    verdict = 'unresolved';
  }

  if (verdict === 'unresolved') {
    console.warn('order still unresolved', {
      settlementId: s.id,
      orderId: s.orderId,
      paymentStatus: order.paymentStatus,
    });
    return 'unresolved';
  }

  const { error } = await admin().rpc('complete_settlement', {
    p_settlement_id: s.id,
    p_charged: verdict === 'paid',
    p_order_id: s.orderId,
    p_gateway_status: order.paymentStatus,
    p_failure_reason: verdict === 'paid' ? null : 'Ödəniş baş tutmadı',
  });

  if (error) {
    // Money moved but the books do not say so. Only reconciliation fixes this.
    console.error(verdict === 'paid' ? 'CHARGED BUT NOT RECORDED' : 'complete_settlement failed', {
      settlementId: s.id,
      orderId: s.orderId,
      error: error.message,
    });
    throw new Error(error.message);
  }

  console.info('settlement reconciled', {
    settlementId: s.id,
    orderId: s.orderId,
    verdict,
    paymentStatus: order.paymentStatus,
  });
  return verdict;
}

/**
 * The exact callback shape is undocumented, so accept the variants a gateway
 * plausibly sends rather than guessing one and breaking on first delivery.
 */
export function extractOrderId(body: unknown, url: URL): string | null {
  const fromQuery = url.searchParams.get('orderId') ?? url.searchParams.get('order_id');
  if (fromQuery) return fromQuery;

  if (body && typeof body === 'object') {
    const b = body as Record<string, any>;
    const candidates = [
      b.orderId,
      b.order_id,
      b.payload?.orderId,
      b.payload?.order_id,
      b.data?.orderId,
      b.data?.order_id,
    ];
    for (const c of candidates) {
      if (typeof c === 'string' && c.length > 0) return c;
    }
  }
  return null;
}
