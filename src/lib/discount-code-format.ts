// Discount code format: the pure, environment-free half of the discount system, shared by the
// server (lib/discounts.ts) and the generator (scripts/discount-codes.mjs) so the two cannot
// disagree about what a code looks like or how it is hashed.
//
// A code is "RW-" + 16 characters from a 31-symbol alphabet with no look-alikes (no 0/O, 1/I/L):
// about 79 bits of randomness, so guessing one is infeasible even before rate limiting. Guests may
// type it in any case, with or without the dashes or spaces.
import { createHash, randomInt } from 'node:crypto';

export const CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
export const CODE_BODY_LENGTH = 16;
const PREFIX = 'RW';
const WELL_FORMED = new RegExp(`^${PREFIX}[${CODE_ALPHABET}]{${CODE_BODY_LENGTH}}$`);

// Upper-case, and drop everything that is not a letter or digit (spaces, dashes, stray dots).
export function normaliseCode(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

// Cheap shape check before any database work, so junk input never costs a query.
export function isWellFormed(normalised: string): boolean {
  return WELL_FORMED.test(normalised);
}

// What is stored: a SHA-256 of the normalised code. A fast hash is right here: the input is
// ~79 random bits, not a human password, so there is nothing for a slow hash to protect.
export function hashCode(normalised: string): string {
  return createHash('sha256').update(normalised).digest('hex');
}

// The last 4 characters, stored in the clear so support can identify a code a guest mentions.
export function codeHint(normalised: string): string {
  return normalised.slice(-4);
}

// A new random code, normalised (no dashes). randomInt is uniform, so there is no modulo bias.
export function generateCode(): string {
  let body = '';
  for (let i = 0; i < CODE_BODY_LENGTH; i++) body += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return PREFIX + body;
}

// "RWABCD..." -> "RW-ABCD-EFGH-JKMN-PQRS", for handing out.
export function formatCode(normalised: string): string {
  const body = normalised.slice(PREFIX.length);
  return [PREFIX, ...(body.match(/.{1,4}/g) ?? [])].join('-');
}
