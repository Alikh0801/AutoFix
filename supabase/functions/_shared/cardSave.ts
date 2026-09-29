// Reading a card save's real state from Payriff and writing it down.
//
// Two things need this: the callback Payriff fires, and the app polling while
// the payment page closes. Both go through here so there is one definition of
// "what actually happened", and neither of them trusts a callback body.

import { createClient, SupabaseClient } from 'jsr:@supabase/supabase-js@2';
import { getCardSave, type CardSaveStatus } from './payriff.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

export function serviceClient(): SupabaseClient {
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
}

export interface SyncResult {
  status: CardSaveStatus;
  maskedPan?: string | null;
  cardBrand?: string | null;
}

/** Fetches the authoritative state and records it. Safe to call repeatedly:
 *  settle_card_save ignores anything already in a terminal state. */
export async function syncCardSave(cardSaveId: string): Promise<SyncResult> {
  const state = await getCardSave(cardSaveId);

  const { error } = await serviceClient().rpc('settle_card_save', {
    p_card_save_id: cardSaveId,
    p_status: state.status,
    p_card_uuid: state.cardUuid ?? null,
    p_masked_pan: state.maskedPan ?? null,
    p_card_brand: state.cardBrand ?? null,
  });
  if (error) throw new Error(error.message);

  return { status: state.status, maskedPan: state.maskedPan, cardBrand: state.cardBrand };
}

/**
 * The exact callback shape is undocumented, so accept the variants a gateway
 * plausibly sends rather than guessing one and breaking on first delivery.
 */
export function extractCardSaveId(body: unknown, url: URL): string | null {
  const fromQuery = url.searchParams.get('cardSaveId') ?? url.searchParams.get('card_save_id');
  if (fromQuery) return fromQuery;

  if (body && typeof body === 'object') {
    const b = body as Record<string, any>;
    const candidates = [
      b.cardSaveId,
      b.card_save_id,
      b.payload?.cardSaveId,
      b.payload?.card_save_id,
      b.data?.cardSaveId,
      b.data?.card_save_id,
    ];
    for (const c of candidates) {
      if (typeof c === 'string' && c.length > 0) return c;
    }
  }
  return null;
}

export async function readBody(req: Request): Promise<unknown> {
  const contentType = req.headers.get('content-type') ?? '';
  try {
    if (contentType.includes('application/json')) return await req.json();
    if (contentType.includes('form')) {
      const form = await req.formData();
      return Object.fromEntries([...form.entries()]);
    }
    // Unknown type — try JSON anyway; gateways are not always honest about it.
    const text = await req.text();
    return text ? JSON.parse(text) : {};
  } catch {
    return {};
  }
}
