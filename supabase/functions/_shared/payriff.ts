// Payriff Gateway API v3 — the calls this project makes.
//
// Nothing here trusts a callback. Payriff signs neither its payment nor its
// card-save callbacks, so a callback is only ever a nudge to re-read the real
// state from these endpoints.

const BASE_URL = Deno.env.get('PAYRIFF_BASE_URL') ?? 'https://api.payriff.com/api/v3';
const SECRET_KEY = Deno.env.get('PAYRIFF_SECRET_KEY') ?? '';

interface Envelope<T> {
  code: string;
  message: string;
  route?: string;
  responseId?: string;
  responseDetails?: unknown;
  internalMessage?: string | null;
  payload: T;
}

/** Payriff reports success under more than one code depending on the call. */
const SUCCESS_CODES = new Set(['00000', '00', 'APPROVED', 'PREAUTH-APPROVED']);

export function isSuccess(code: string): boolean {
  return SUCCESS_CODES.has((code ?? '').toUpperCase());
}

export class PayriffError extends Error {
  constructor(message: string, readonly code?: string) {
    super(message);
    this.name = 'PayriffError';
  }
}

async function call<T>(path: string, method: 'GET' | 'POST', body?: unknown): Promise<T> {
  if (!SECRET_KEY) throw new PayriffError('PAYRIFF_SECRET_KEY is not set on this project');

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      // Payriff takes the raw key — no "Bearer" prefix.
      Authorization: SECRET_KEY,
      'Content-Type': 'application/json',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const text = await res.text();
  let json: Envelope<T>;
  try {
    json = JSON.parse(text);
  } catch {
    throw new PayriffError(`Payriff returned non-JSON (HTTP ${res.status}): ${text.slice(0, 200)}`);
  }

  if (!isSuccess(json.code)) {
    throw new PayriffError(json.internalMessage || json.message || `Payriff error ${json.code}`, json.code);
  }
  return json.payload;
}

// --- Card save --------------------------------------------------------------

/**
 * Payriff's own lifecycle names, kept verbatim. Only REVERSED means the card
 * can be charged: VERIFIED still has the 0.01 AZN verification outstanding.
 */
export type CardSaveStatus =
  | 'CREATED'
  | 'VERIFIED'
  | 'REVERSED'
  | 'REVERSE_FAILED'
  | 'DECLINED'
  | 'EXPIRED';

export interface StartedCardSave {
  cardSaveId: string;
  orderId: string;
  sessionId?: string;
  paymentUrl: string;
  amount: number;
  currency: string;
  status: CardSaveStatus;
}

export interface CardSaveState {
  cardSaveId: string;
  orderId: string;
  status: CardSaveStatus;
  /** Only issued once verification got far enough; required by AutoPay and delete. */
  cardUuid?: string | null;
  maskedPan?: string | null;
  cardBrand?: string | null;
  customerRef?: string;
  amount?: number;
  currency?: string;
  createdDate?: string;
  verifiedDate?: string;
}

/**
 * Begins a card save. Costs the provider nothing — the 0.01 AZN is a
 * verification that Payriff reverses on its own.
 *
 * `customerRef` is the provider's profiles.id: Payriff groups saved cards by
 * it, so their listing and ours line up without a lookup table.
 */
export function startCardSave(input: {
  customerRef: string;
  callbackUrl: string;
  description: string;
  language?: 'AZ' | 'EN' | 'RU';
}): Promise<StartedCardSave> {
  return call<StartedCardSave>('/cards/save', 'POST', {
    customerRef: input.customerRef,
    callbackUrl: input.callbackUrl,
    language: input.language ?? 'AZ', // must be set explicitly
    description: input.description,
  });
}

export function getCardSave(cardSaveId: string): Promise<CardSaveState> {
  return call<CardSaveState>(`/cards/save/${encodeURIComponent(cardSaveId)}`, 'GET');
}

/** The card is chargeable only in this one state. */
export function isCardReady(status: CardSaveStatus): boolean {
  return status === 'REVERSED';
}

/** States that will never progress — the provider has to start over. */
export function isCardSaveTerminal(status: CardSaveStatus): boolean {
  return status === 'REVERSED' || status === 'DECLINED' || status === 'EXPIRED';
}
