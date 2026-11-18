// src/utils/platformFee.ts — mobile copy of web src/utils/platformFee.js.
// Unis's fee on song sales and direct support: the "break-even gate".
// Mirrors backend PlatformFees.java exactly; change all three together.
//
//   fee = 10% of the payment, or Stripe's card fee (2.9% rounded up + 30¢) + 1¢,
//         whichever is higher
//
//   $0.94 → artist $0.60   $1.99 → artist $1.62   $10.00 → artist $9.00

export const MIN_SONG_PRICE_CENTS = 94; // 5¢ under the iTunes Store's 99¢ tier
export const MIN_SUPPORT_CENTS = 100;

const DEFAULT_PERCENT = 0.1;
const STRIPE_PERCENT_PER_THOUSAND = 29; // 2.9%
const STRIPE_FIXED_CENTS = 30;
const MIN_MARGIN_CENTS = 1;

/** Stripe's card fee on a payment, rounded up to the cent. */
export function stripeCardFeeCents(amountCents: number | string): number {
  const cents = Math.floor(Number(amountCents) || 0);
  if (cents <= 0) return 0;
  return Math.floor((cents * STRIPE_PERCENT_PER_THOUSAND + 999) / 1000) + STRIPE_FIXED_CENTS;
}

/** Unis's fee on a song sale or support payment. */
export function platformFeeCents(amountCents: number | string): number {
  const cents = Math.floor(Number(amountCents) || 0);
  if (cents <= 0) return 0;
  const share = Math.round(cents * DEFAULT_PERCENT);
  return Math.min(cents, Math.max(share, stripeCardFeeCents(cents) + MIN_MARGIN_CENTS));
}

/** What the artist receives from a payment. */
export function artistReceivesCents(amountCents: number | string): number {
  const cents = Math.floor(Number(amountCents) || 0);
  return Math.max(0, cents - platformFeeCents(cents));
}

/** "$1.99" style price → cents, or null when it isn't a number. */
export function dollarsToCents(value: any): number | null {
  const n = parseFloat(value);
  return Number.isFinite(n) ? Math.round(n * 100) : null;
}

export const formatCents = (cents: number | null | undefined): string => `$${(Number(cents || 0) / 100).toFixed(2)}`;

/** The hint under a price box: what the artist takes home at that price. */
export function priceHint(value: any): string {
  const cents = dollarsToCents(value);
  const min = `minimum ${formatCents(MIN_SONG_PRICE_CENTS)}`;
  if (cents == null || cents < MIN_SONG_PRICE_CENTS) {
    return `Set your price (${min}). You receive the price minus Unis's fee, paid directly to your Stripe account.`;
  }
  const fee = platformFeeCents(cents);
  return (
    `Set your price (${min}). At ${formatCents(cents)} you receive ${formatCents(cents - fee)}, ` +
    `paid directly to your Stripe account. Unis's fee is 10%, or just its card-processing cost + 1¢ on smaller prices.`
  );
}
