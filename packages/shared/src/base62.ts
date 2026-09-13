export const BASE62_ALPHABET =
  "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

export const BASE62 = BASE62_ALPHABET.length;

export const DEFAULT_SHORT_CODE_LENGTH = 7;

export type ByteSource = (length: number) => Uint8Array;

const defaultByteSource: ByteSource = (length) =>
  globalThis.crypto.getRandomValues(new Uint8Array(length));

export function encodeBase62(value: number | bigint): string {
  let remaining = BigInt(value);
  if (remaining < 0n) {
    throw new RangeError("encodeBase62 expects a non-negative value");
  }
  if (remaining === 0n) {
    return BASE62_ALPHABET[0]!;
  }

  let encoded = "";
  const base = BigInt(BASE62);
  while (remaining > 0n) {
    const index = Number(remaining % base);
    encoded = BASE62_ALPHABET[index]! + encoded;
    remaining /= base;
  }
  return encoded;
}

export function decodeBase62(value: string): bigint {
  let decoded = 0n;
  const base = BigInt(BASE62);
  for (const char of value) {
    const index = BASE62_ALPHABET.indexOf(char);
    if (index === -1) {
      throw new RangeError(`Invalid base62 character: ${char}`);
    }
    decoded = decoded * base + BigInt(index);
  }
  return decoded;
}

/**
 * Generates a random base62 code.
 *
 * Uses rejection sampling so every character is uniformly distributed
 * (byte values >= 248 would otherwise bias the first 8 alphabet entries).
 */
export function randomShortCode(
  length: number = DEFAULT_SHORT_CODE_LENGTH,
  byteSource: ByteSource = defaultByteSource,
): string {
  if (!Number.isInteger(length) || length <= 0) {
    throw new RangeError("length must be a positive integer");
  }

  const maxUnbiasedByte = 256 - (256 % BASE62);
  const chars: string[] = [];

  while (chars.length < length) {
    const bytes = byteSource(length - chars.length);
    for (const byte of bytes) {
      if (byte >= maxUnbiasedByte) {
        continue;
      }
      chars.push(BASE62_ALPHABET[byte % BASE62]!);
      if (chars.length === length) {
        break;
      }
    }
  }

  return chars.join("");
}
