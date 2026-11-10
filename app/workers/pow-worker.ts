// Web Worker: solves the Proof-of-Work challenge off the main thread so the UI
// stays responsive while hashing. Posted `{ token, difficulty }`; replies
// `{ ok: true, nonce }` on success or `{ ok: false }` if the safety cap is hit.
import { solvePow } from "../lib/pow";

self.onmessage = (e: MessageEvent<{ token: string; difficulty: number }>) => {
  const { token, difficulty } = e.data;
  const result = solvePow(token, difficulty);
  if (result) {
    self.postMessage({ ok: true, nonce: result.nonce });
  } else {
    self.postMessage({ ok: false });
  }
};
