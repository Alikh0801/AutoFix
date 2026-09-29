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

/**
 * Two different vocabularies, and mixing them up is the whole trap.
 *
 * ResultCodes describe the API operation — "did the request get processed" —
 * and live in the envelope's `code`. Gateway values describe what the bank did
 * with the money and appear inside the payload. A request can be perfectly
 * well-formed (00000) and still carry a declined payment, which is exactly the
 * case that would forgive commission nobody collected.
 */
const RESULT_CODE_OK = new Set([
  '00000', // SUCCESS
  '01000', // WARNING — succeeded, but Payriff wants us to notice something
  // Not a documented ResultCode; tolerated because some endpoints have been
  // seen echoing the gateway's own "00" here. Accepting it costs nothing:
  // whether money moved is decided in chargeSavedCard, never from this code.
  '00',
]);

/** Payriff's documented ResultCodes, for logs that have to be read later. */
const RESULT_CODES: Record<string, string> = {
  '00000': 'SUCCESS',
  '01000': 'WARNING',
  '15000': 'ERROR — internal system error',
  '15400': 'INVALID_PARAMETERS',
  '14010': 'UNAUTHORIZED',
  '14013': 'TOKEN_NOT_PRESENT',
  '14014': 'INVALID_TOKEN',
  '14015': 'INVALID_ORIGIN',
  '666': 'CHECKING — invalid or unsupported procedure',
};

export function describeResultCode(code: string | undefined): string {
  return RESULT_CODES[(code ?? '').trim()] ?? `UNKNOWN (${code ?? '—'})`;
}

/** Whether the API call itself went through. Says nothing about the money. */
export function isSuccess(code: string): boolean {
  return RESULT_CODE_OK.has((code ?? '').trim());
}

/** The gateway's own approval values — these DO mean money moved. */
const GATEWAY_APPROVED = new Set(['00', 'APPROVED', 'PREAUTH-APPROVED']);

export function isGatewayApproved(value: string | undefined | null): boolean {
  return GATEWAY_APPROVED.has((value ?? '').trim().toUpperCase());
}

export class PayriffError extends Error {
  constructor(message: string, readonly code?: string) {
    super(message);
    this.name = 'PayriffError';
  }
}

async function call<T>(path: string, method: 'GET' | 'POST' | 'DELETE', body?: unknown): Promise<T> {
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
    throw new PayriffError(
      json.internalMessage || json.message || describeResultCode(json.code),
      json.code
    );
  }
  // 01000 still returns a payload, so the call goes on — but a warning we never
  // look at is a warning that only surfaces once it has cost something.
  if (json.code === '01000') {
    console.warn('Payriff WARNING', { path, message: json.message, internal: json.internalMessage });
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

export interface SavedCard {
  cardUuid: string;
  maskedPan?: string;
  cardBrand?: string;
  createdDate?: string;
}

/**
 * Every card Payriff currently holds for this customer.
 *
 * Only completed (REVERSED) saves appear here, which makes it the authority on
 * what can actually be charged. A card we still believe is usable but which is
 * missing from this list has gone — expired, or pulled by the bank — and would
 * fail mid-settlement if we kept it.
 *
 * No expiry date or status is returned, so there is no way to warn a provider
 * before a charge fails. That is why the failed-charge retry exists.
 */
export function listSavedCards(customerRef: string): Promise<SavedCard[]> {
  return call<SavedCard[]>(`/cards/save?customerRef=${encodeURIComponent(customerRef)}`, 'GET');
}

/** Irreversible: the token cannot be used for AutoPay afterwards. */
export async function deleteSavedCard(cardUuid: string): Promise<void> {
  await call<null>(`/cards/${encodeURIComponent(cardUuid)}`, 'DELETE');
}

/** The card is chargeable only in this one state. */
export function isCardReady(status: CardSaveStatus): boolean {
  return status === 'REVERSED';
}

/** States that will never progress — the provider has to start over. */
export function isCardSaveTerminal(status: CardSaveStatus): boolean {
  return status === 'REVERSED' || status === 'DECLINED' || status === 'EXPIRED';
}

// --- AutoPay ----------------------------------------------------------------

export interface AutoPayResult {
  orderId: string;
  amount: number;
  /** THE field that says whether money moved. See chargeSavedCard below. */
  paymentStatus: string;
  operationType?: string;
  currencyType?: string;
  createdDate?: string;
  transactionResponseDto?: {
    transactionResult?: {
      transactionResponse?: {
        status?: string;
        responseDescription?: string;
      };
    };
  };
}

/**
 * Three outcomes, not two.
 *
 * 'unresolved' is the one that is easy to leave out and expensive to leave
 * out. A status like PENDING or ACCEPTED means the payment has neither
 * completed nor been refused, so calling it a failure would block a provider
 * whose money may yet be taken, and calling it a success would forgive a debt
 * that was never collected. Neither is acceptable, so it gets its own state:
 * the settlement stays open and is decided later.
 */
export type ChargeResult = 'paid' | 'failed' | 'unresolved';

export interface ChargeOutcome {
  result: ChargeResult;
  orderId: string;
  /** Payriff's paymentStatus, verbatim, for the audit row. */
  gatewayStatus: string;
  reason?: string;
}

/**
 * Charges a saved card.
 *
 * The envelope lies about this one. Payriff's own documentation is explicit:
 * the top-level `code` and `message` report whether the API request was
 * processed, NOT whether the payment succeeded — their example returns
 * code "00000" and "Operation performed successfully" alongside a declined
 * transaction. Treating a success code as a successful charge would forgive
 * commission that was never actually collected.
 *
 * So the outcome is read from payload.paymentStatus, whose values are fixed by
 * the documented PaymentStatus enum.
 *
 * We send operation PURCHASE, and for a purchase exactly one value means the
 * money is ours: APPROVED.
 *
 * PREAUTH_APPROVED deliberately does NOT count. A preauthorization only holds
 * the funds; capturing them needs a separate COMPLETE operation, and without
 * one the hold lapses into PREAUTH_EXPIRED. Treating it as collected would
 * clear a provider's debt against money that later evaporates.
 *
 * Note the spelling: the enum is PREAUTH_APPROVED with an underscore. The
 * hyphenated PREAUTH-APPROVED belongs to the separate gateway-values table and
 * never appears in this field.
 */
const PAID_STATUSES = new Set(['APPROVED']);

/** Refused outright, with certainty that no money moved. */
const FAILED_STATUSES = new Set(['DECLINED', 'CANCELED', 'EXPIRED', 'PREAUTH_EXPIRED']);

export async function chargeSavedCard(input: {
  cardUuid: string;
  amount: number;
  description: string;
  callbackUrl: string;
}): Promise<ChargeOutcome> {
  const merchant = Deno.env.get('PAYRIFF_MERCHANT_ID');

  const payload = await call<AutoPayResult>('/autoPay', 'POST', {
    cardUuid: input.cardUuid,
    amount: input.amount,
    currency: 'AZN',
    description: input.description,
    callbackUrl: input.callbackUrl,
    operation: 'PURCHASE',
    ...(merchant ? { merchant } : {}),
  });

  // Enum values are case-sensitive and returned exactly as documented, so this
  // only guards against stray whitespace.
  const status = (payload.paymentStatus ?? '').trim();
  const inner = payload.transactionResponseDto?.transactionResult?.transactionResponse;

  let result: ChargeResult;
  if (PAID_STATUSES.has(status)) {
    result = 'paid';
  } else if (FAILED_STATUSES.has(status)) {
    result = 'failed';
  } else if (!status && isGatewayApproved(inner?.status)) {
    // No lifecycle status at all, but the bank said yes. The money moved.
    result = 'paid';
  } else {
    result = 'unresolved';
  }

  if (result !== 'paid') {
    console.warn(`autoPay ${result}`, {
      orderId: payload.orderId,
      paymentStatus: payload.paymentStatus,
      gateway: inner?.status,
      description: inner?.responseDescription,
    });
  }

  return {
    result,
    orderId: payload.orderId,
    gatewayStatus: payload.paymentStatus ?? 'UNKNOWN',
    reason:
      result === 'paid'
        ? undefined
        : inner?.responseDescription || inner?.status || payload.paymentStatus || 'Declined',
  };
}
