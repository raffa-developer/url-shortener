/**
 * True for loopback, link-local and RFC1918 addresses (IPv4 and IPv6).
 * Used to keep server-side fetches away from internal networks.
 */
export function isPrivateIp(ip: string | null | undefined): boolean {
  if (!ip) {
    return true;
  }

  const normalized = ip.startsWith("::ffff:") ? ip.slice("::ffff:".length) : ip;

  if (normalized === "::1" || normalized === "127.0.0.1") {
    return true;
  }
  if (
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    normalized.startsWith("fe80:")
  ) {
    return true; // IPv6 unique-local / link-local
  }

  const parts = normalized.split(".");
  if (parts.length !== 4) {
    return false;
  }

  const [a, b] = parts.map(Number);
  if (a === undefined || b === undefined || Number.isNaN(a) || Number.isNaN(b)) {
    return true;
  }

  return (
    a === 10 ||
    a === 127 ||
    a === 0 ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 169 && b === 254)
  );
}
