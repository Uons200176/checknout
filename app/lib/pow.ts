// Proof-of-Work spec, shared by the browser (solver) and mirrored by the DB
// (verifier in the create_order RPC). A solution is a `nonce` such that
// sha256hex(`${token}:${nonce}`) begins with `difficulty` zero hex characters.
// Leading-hex-zeros (not bit-counting) is used so JS and Postgres agree exactly.
import { sha256hex } from "./sha256";

export function powDigestHex(token: string, nonce: number): string {
  return sha256hex(`${token}:${nonce}`);
}

export function meetsDifficulty(hex: string, difficulty: number): boolean {
  for (let i = 0; i < difficulty; i++) {
    if (hex[i] !== "0") return false;
  }
  return true;
}

/**
 * Brute-forces a nonce meeting `difficulty`. At difficulty 4 (~65k expected
 * hashes) this is sub-second; `maxIter` is a safety cap so it can never spin
 * forever if difficulty is misconfigured too high.
 */
export function solvePow(
  token: string,
  difficulty: number,
  maxIter = 50_000_000,
): { nonce: number; hash: string } | null {
  for (let nonce = 0; nonce < maxIter; nonce++) {
    const hash = powDigestHex(token, nonce);
    if (meetsDifficulty(hash, difficulty)) return { nonce, hash };
  }
  return null;
}
