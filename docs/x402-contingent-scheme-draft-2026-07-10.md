# Scheme: `contingent` (EVM) — Draft 0

**Status:** Draft sketch against the x402 V2 scheme format. Companion to the contingent-delivery RFC. Not implemented; test vectors not yet pinned.

**One-line summary:** Settlement and delivery become one cryptographic event. The client's payment authorization is an *adaptor pre-signature*; the server completing it into a standard EIP-3009 signature simultaneously (a) settles on-chain through the existing rail unchanged and (b) reveals the decryption key for the already-delivered ciphertext. A failed or withheld response cannot be charged for — there is no escrow, no held state, and no refund path because no partial state can exist.

**Design constraint honored throughout:** zero on-chain changes. `transferWithAuthorization` receives a completed, standard ECDSA signature. All novelty lives in client construction, server completion, and facilitator verification.

---

## 1. Flow

The `exact` scheme is one round: authorize → verify → work → settle → respond. `contingent` inverts work and authorization, adding half a round trip:

```
1. Client  → GET /resource
2. Server  → 402 PaymentRequired            (quote: accepts[] carries scheme "contingent")
3. Client  → GET /resource + PAYMENT-SIGNATURE {phase: "request"}
4. Server  → executes the work NOW, then:
             402 PaymentRequired            (offer: ciphertext + key commitment + binding)
5. Client  → GET /resource + PAYMENT-SIGNATURE {phase: "accept", adaptor pre-signature}
6. Server  → completes pre-signature with t → facilitator /settle (standard EIP-3009 path)
           → 200 OK + PAYMENT-RESPONSE {transaction, completedSignature}
             (+ SHOULD include t and plaintext inline as fast path)
7. Client  → extracts t = Extract(completedSignature, preSignature), decrypts,
             checks keccak256(plaintext) == bindingCommitment
```

Step 4 responding `402` again is deliberate: the resource is still unpaid — the client holds a locked box. Step 6's on-chain settlement is the trustless delivery channel: even if the server goes silent after settling, the completed signature is visible in `transferWithAuthorization` calldata, and the client extracts `t` from chain data alone.

## 2. PaymentRequired (step 2 — quote)

```json
{
  "x402Version": 2,
  "resource": { "url": "https://api.example.com/analyze" },
  "accepts": [
    {
      "scheme": "contingent",
      "network": "eip155:8453",
      "amount": "10000",
      "asset": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
      "payTo": "0x1234...abcd",
      "maxTimeoutSeconds": 300,
      "extra": {
        "adaptor": "ecdsa-secp256k1-v1",
        "binding": "keccak256-plaintext",
        "quoteId": "q_7f3a9c...",
        "delivery": "inline"
      }
    }
  ]
}
```

`extra.adaptor` pins the exact adaptor-signature construction (see §6.1). `extra.quoteId` is the server's binding handle for this quote; it flows into the payment nonce (§4) so the authorization can never be replayed against a different quote, price, or recipient — when an origin manifest exists (`/.well-known/x402.json`, per x402-foundation#2582), `quoteId` SHOULD also commit to the manifest version, giving agents the invariant *"never authorize spend from a 402 body alone."*

## 3. The offer (step 4 — execute-then-lock)

Server executes the request, samples scalar `t`, and responds `402` with:

```json
{
  "x402Version": 2,
  "accepts": [ { "...": "same terms as quote, same quoteId" } ],
  "extensions": {
    "contingentOffer": {
      "quoteId": "q_7f3a9c...",
      "keyCommitment": "0x02a1b2...",
      "ciphertext": "base64...",
      "bindingCommitment": "0x9e8d...",
      "offerValidUntil": 1783123456
    }
  }
}
```

- `ciphertext = AEAD-Enc(HKDF(t), plaintextResponse)`
- `keyCommitment = t·G` on secp256k1
- `bindingCommitment = keccak256(plaintextResponse)` — the delivery contract. Richer bindings (schema hash, output-commitment trees) are an extension point.
- For large payloads, `delivery: "url"` replaces `ciphertext` with a fetch URL; the commitment covers the fetched bytes.

The server has now fully delivered — in locked form — and holds no claim on funds.

## 4. PaymentPayload (step 5 — accept)

```json
{
  "x402Version": 2,
  "accepted": { "scheme": "contingent", "...": "..." },
  "payload": {
    "preSignature": "0x...",
    "dleqProof": "0x...",
    "authorization": {
      "from": "0xClient...",
      "to": "0x1234...abcd",
      "value": "10000",
      "validAfter": "1783123000",
      "validBefore": "1783123456",
      "nonce": "0x..."
    }
  }
}
```

Two deltas from `exact`:

1. **`preSignature` replaces `signature`.** An ECDSA adaptor pre-signature over the EIP-712 typed data of the EIP-3009 authorization, locked to `keyCommitment`, with a DLEQ proof that it is well-formed and completable (§6.1).
2. **The nonce is a cryptographic binding, not a random value:**

```
nonce = keccak256(quoteId ‖ keyCommitment ‖ bindingCommitment ‖ resource.url ‖ chainId)
```

This single field enforces the quote-binding invariant end-to-end: the authorization is only completable for *this* offer, *this* price, *this* recipient, *this* resource. Any drift in price, payee, scope, or quote window produces a different nonce, and the pre-signature fails closed. EIP-3009's on-chain nonce consumption then guarantees at-most-once settlement with no additional infrastructure.

## 5. Settlement (step 6) and facilitator deltas

Server completes: `signature = Complete(preSignature, t)` — a **standard ECDSA signature** valid for `transferWithAuthorization`. From here the pipeline is the stock `exact` path.

**Facilitator `/verify` (new logic, scheme-scoped):** verify DLEQ + pre-signature completability against `keyCommitment`; recompute and check the nonce binding; then the standard checks (balance, amount ≤ quoted, time window).

**Facilitator `/settle` (one addition):** the `SettlementResponse` MUST echo the completed signature:

```json
{
  "success": true,
  "transaction": "0x...",
  "network": "eip155:8453",
  "extensions": { "contingent": { "completedSignature": "0x..." } }
}
```

This matters for **batch settlement** (May 2026): batching can aggregate transfers so individual signatures never appear in calldata, which would break chain-side key extraction. Echoing the completed signature in the settlement response keeps `contingent` batch-compatible; the chain remains the fallback when the server settles directly.

## 6. Security invariants & acceptance harness

Every case below MUST pin a conformance vector:

| # | Case | Required outcome |
|---|------|------------------|
| 1 | Happy path: offer → accept → settle | Settles exactly once (EIP-3009 nonce); client extracts `t` from completed signature; `keccak256(plaintext) == bindingCommitment`; receipt = tx hash |
| 2 | Upstream 5xx / timeout / crash before offer | No offer exists → no pre-signature exists → **nothing is settleable**. No discard step, no refund, no state |
| 3 | Pre-signature replayed against different path / amount / payee / quote | Nonce binding mismatch → completion invalid → rejected at /verify and on-chain |
| 4 | Server crash after receiving pre-signature | Nothing settled; authorization dies at `validBefore`; client re-requests under a fresh quote — idempotent by construction |
| 5 | Server settles but withholds `t` | Client extracts `t` from on-chain calldata or the echoed `completedSignature`. Silent-success is impossible: settled ⇒ key is public to the pre-signature holder |
| 6 | Offer expiry (`offerValidUntil`) passes before accept | Client MUST NOT sign; server MUST NOT complete a stale authorization (validBefore enforces on-chain) |
| 7 | Decrypted plaintext ≠ bindingCommitment | Provable misdelivery: client holds ciphertext, commitment, and settlement receipt — a self-contained evidence bundle for receipt/arbitration layers (#1195, #2001) |

### 6.1 Cryptographic dependencies — stated plainly

- **ECDSA adaptor signatures** are established (atomic-swap literature; Moreno-Sanchez et al., Aumayr et al.) but subtler than Schnorr: pre-signature validity requires a DLEQ proof, and known pitfalls exist in naive constructions. `extra.adaptor` therefore pins a versioned construction (`ecdsa-secp256k1-v1`), and the conformance vectors are the contract. A Schnorr variant is cleaner and should follow wherever the rail supports it.
- **Extraction privacy:** with ECDSA adaptors, `t` is recoverable only by holders of the pre-signature — i.e., the client — not by chain observers. Third parties learn nothing.
- **What this scheme does NOT provide:** correctness of the plaintext beyond the hash binding. A server can deliver a valid box containing a wrong answer. That failure class is deliberately left to the composable layers this repo already has — delivery receipts and arbitration — which case 7 feeds with clean evidence.

## 7. Known costs

- **+1 round trip** versus `exact` (quote → offer → accept). Sessions (V2) amortize this across calls to the same origin.
- **Server computes before payment is assured** — the griefing surface moves from buyer to seller. Mitigations are economic and already idiomatic: session-gated access, per-client rate limits, small quote fees for expensive routes. Note this is the same exposure servers accept today under `exact` with a facilitator `/verify`-then-work flow, shifted one step.
- **Client-side crypto:** producing adaptor pre-signatures + DLEQ is new SDK surface. It is signing-side only — no new on-chain interaction for the client.
