# x402-Quantum

## Settlement-Bound Computation: A Ledgerless, Registryless Paradigm for Autonomous Agent Commerce

**Status:** Speculative design essay — Draft 0. This document composes *known* cryptographic primitives (contingent payments in the zkCP lineage, Schnorr adaptor signatures, Chaum-style blind signatures, FHE, VDFs, PSI) into an unbuilt architecture. It is not an implemented protocol, not peer-reviewed, and its performance envelope rests on open research problems named in §5. Read §5 before quoting §1–4.

**Category:** Experimental / Paradigm Definition
**Targets for obsolescence (by design intent):** HTTP 402 edge gateways, payment-token passing, escrow contracts, agent registries, DNS-mediated service discovery, clearinghouse middleware

---

### Abstract

Every deployed M2M commerce stack — Stripe's shared payment tokens, Mastercard Agent Pay, Cloudflare's 402 gateway, FHE-shielded settlement à la x402z — shares one inherited defect: **payment, computation, and routing are separate state machines synchronized by messages.** Synchronization is where every failure lives: the paid-for-500, the escrow that needs a timeout, the registry that needs governance, the token that needs revocation. This document abandons synchronization entirely. It specifies **Settlement-Bound Computation (SBC)**: a paradigm in which the query, the funds, the route, and the answer are a *single cryptographic object*, and the protocol defines **no operation** that advances one without advancing all of them.

---

## 1. The Paradigm Shift: Settlement-Bound Computation

**Core Axiom — the Conservation of Consideration:**

> *In every reachable state of the system, value and its consideration are one indivisible mathematical object. No operation exists — not in the protocol, not in any adversarial composition of its primitives — that separates them.*

Today's architectures enforce fairness *procedurally*: hold funds, check the response, release or roll back. SBC enforces fairness *ontologically*: the state in which "payment happened but delivery didn't" is not a forbidden state — it is a **non-existent** state, the way a state violating conservation of charge is non-existent in electrodynamics. There is nothing to roll back because the invalid state cannot be constructed.

Four substitutions define the paradigm:

| Legacy concept | SBC replacement |
|---|---|
| Trust (reputation, history, KYC) | **Atomicity** — cheating is not punished; it is unconstructible |
| Identity (accounts, credentials, OAuth) | **Capability** — you are what you can compute, proven by computing it |
| Routing (DNS, registries, edge gateways) | **Resonance** — offers diffuse; capable nodes condense them |
| Settlement (ledgers, escrows, clearing) | **Measurement** — one scalar's publication collapses payment, delivery, and every relay fee on the path, simultaneously |

The atomic object is called a **tessera** (after the Roman *tessera hospitalis*, the token that was itself the contract). The rest of this specification defines the tessera and the single operation permitted on it.

---

## 2. The Unified Cryptographic State: the Tessera

The tessera collapses the three legacy layers into one sealed object.

### 2.1 Authorization becomes bearer mathematics (the fiat rails, demoted)

Stripe and Mastercard do not authorize *transactions* in SBC. They are demoted to **blind mints**. An emitter agent presents fiat once, out of band, and receives a **mandate**:

```
M = BlindSig_rail( Commit(v_max), epoch e, nullifier n )
```

`M` proves "this object is funded up to `v_max` in epoch `e`" to any verifier, reveals nothing about the holder, and is single-spend (the nullifier `n` burns at redemption). OAuth, shared payment tokens, and credential vaults collapse into this one signature: **authorization is no longer a property of a session; it is a property of the ciphertext.** A tessera carries its own money the way a banknote does — except the banknote can only be cashed by an act that simultaneously delivers the goods (§4).

### 2.2 Execution becomes a dual-lock envelope (FHE, promoted)

The emitter's query `q` is encrypted under its own FHE key: `E = FHE.Enc(pk_C, q)`, with evaluation keys attached. The serving node computes **blind** — it never sees the query, the answer, or the price band. Critically, the response will be wrapped in a *second*, outer lock whose key **is the payment scalar itself** (§4). FHE thus does double duty:

- **Inner lock:** privacy — only the emitter can ever read the plaintext answer.
- **Inner computation:** the service itself runs inside the encrypted state, so *serving the request* and *being able to serve the request* are the same act.

Payment verification and decryption are not linked by the protocol; they are the **same scalar**. Computation and payment become cryptographically indistinguishable — an observer of the wire cannot classify a message as "inference traffic" or "settlement traffic," because no such distinction exists in the object model.

### 2.3 Routing becomes settlement entanglement (the edge, absorbed)

Relays (the role Cloudflare's gateway used to play) do not gate, meter, or fire 402s. They forward tesserae and attach **fee pre-signatures locked to the same scalar as the terminal payment** (§4.4). A relay is paid if and only if the path it participated in terminates in a successful measurement. Routing incentive, delivery, and settlement are entangled into one event. There is no edge billing plane to operate, attack, or reconcile.

### 2.4 The assembled object

```
T = ⟨ E,          # FHE-encrypted query + eval keys        (execution)
      A,          # aptitude pre-circuit                    (discovery, §3)
      Φ,          # VDF price ramp: v_eff(τ) = v₀ + Δ·τ     (negotiation, §3.3)
      M, π_M,     # blind mandate + funding proof           (authorization)
      addr ⟩      # one-time ephemeral rendezvous point     (reply channel)
```

No field names a counterparty. No field references a registry. The tessera is emitted into the network and *the network's response to it* is the topology.

---

## 3. Zero-Registry Fluid Topology: Capability Resonance

### 3.1 There is no lookup

Tesserae are flooded into an unstructured gossip fabric — the **froth** — of anonymous, ephemeral nodes. Nothing resolves a name to an address, because the paradigm inverts the question: instead of *"who can do this?"* (a registry query), the tessera asks *"can you make progress on me?"* (a mathematical predicate any node evaluates locally, against itself, in private).

### 3.2 Discovery = the ability to compute

The aptitude pre-circuit `A` is a millisecond-cheap homomorphic match between the tessera's (encrypted) capability requirement and the node's committed capability vector — a PSI-style intersection whose result even the node learns only as a resonance bit. Nodes that resonate MAY speculatively evaluate the full workload. **Capability is proven by exercising it**: the only way to "claim" a tessera is to produce the evaluation proof of §4.2. Impersonation is not forbidden; it is *pointless* — a node without the model weights cannot produce the proof, and a node with them doesn't need an identity.

Trust with zero shared history is achieved by making trust unnecessary: §4 guarantees that the worst any anonymous stranger can do is waste its own compute.

### 3.3 Negotiation without messages

There is no price negotiation round-trip. The price is a **boundary condition of the object**: the VDF ramp `Φ` makes the effective offer rise deterministically and unforgeably with the tessera's verifiable age — a Dutch auction run in reverse by the passage of provable time. A node whose cost floor exceeds `v_eff(now)` stays silent; the first node for which the ramp crosses its floor computes and answers. Market clearing emerges from silence and timing. Expired tesserae decay inertly — the mandate epoch lapses, and nothing anywhere needs cleanup.

---

## 4. The Acceptance Vector

The handshake below is the protocol's *only* interactive sequence, and it contains exactly one trust decision — which is a proof verification, not a judgment.

Let `G` generate a prime-order group; Schnorr adaptor signatures are assumed.

### 4.1 Emission
Emitter **C** floods tessera `T` into the froth.

### 4.2 Resonance & blind evaluation
Node **S** resonates (§3.2), then computes homomorphically:

```
Y  = FHE.Eval(f, E)                 # the answer, still under C's inner lock
t ←$ Zq ;  P_t = t·G                # the payment scalar and its public point
Z  = SymEnc( KDF(t), Y )            # outer lock: key IS the payment scalar
π  = Prove{ Y = Eval(f,E)  ∧  f ∈ predicate(T)  ∧  Z = SymEnc(KDF(t),Y)  ∧  P_t = t·G }
```

`π` is the **unified state proof**: one object welding execution correctness, encryption binding, and payment lock into a single verifiable statement. S sends `(Z, π, P_t)` to `addr`. Note what S has *not* done: revealed the answer, or acquired any claim on funds.

### 4.3 Acceptance
C verifies `π`. If it verifies, C constructs a Schnorr **adaptor pre-signature** over the mandate redemption:

```
σ′ = PreSign( M → S, v_eff(τ), adaptor point P_t )
```

`σ′` is not a payment. It is an incomplete signature that becomes valid *only* under knowledge of `t`. C sends `σ′` and goes silent. C's role is finished.

### 4.4 Measurement — the atomic event
S completes and redeems:

```
σ = Complete(σ′, t)        # the ONLY way S can ever touch the money
```

The instant `σ` appears at the rail (or any ledger, or any relay's gossip horizon), adaptor extractability makes the scalar public to every path participant:

```
t = Extract(σ, σ′)
```

And in that single event, with no further messages:

1. **S is paid** — `σ` is a valid redemption of the mandate; nullifier `n` burns.
2. **C is delivered** — C computes `KDF(t)`, opens `Z`, and decrypts `Y` under its FHE secret key. The act by which the server takes the money **is** the act that hands the client the key.
3. **Every relay is paid** — each relay's fee pre-signature was adapted to the *same point* `P_t`; each completes its own fee claim with the now-public `t`. One measurement collapses the entire path's settlement. (Privacy holds throughout: `t` unlocks only the outer envelope; the plaintext stays under C's inner FHE lock.)

### 4.5 The failure physics: why "paid for a 500" cannot be expressed

Walk every failure through the object model:

- **S crashes mid-inference / returns garbage / lies about the model:** no valid `π` exists → C never emits `σ′` → there is no incomplete signature to complete → **value transfer is unconstructible.** Nothing was held, so nothing is released or rolled back. The tessera decays by ramp expiry.
- **S produces `Z` unbound to the real answer:** excluded by `π` itself — the proof spans `E → Y → Z → P_t` as one statement.
- **S receives `σ′` and withholds:** S is voluntarily declining money; the mandate epoch bounds the limbo, after which `σ′` is void. Symmetric inertness, zero cleanup.
- **C receives `(Z, π)` and ghosts:** C holds a locked box it cannot open and S wasted one inference — the paradigm's residual griefing surface, priced in §5.

There is no escrow because there is no interval during which funds are "held." There is no rollback because no partial state is ever constructed. Failure in SBC is not *compensated*; it is **inert**.

---

## 5. Security Considerations & Load-Bearing Conjectures

An honest clean sheet names its own foundations. Prior art first: the "payment completion reveals the decryption key" mechanism is the **zero-knowledge contingent payment (zkCP)** pattern from the Bitcoin literature (Maxwell, concept 2011; executed on-chain 2016), generalized here via adaptor signatures; blind mandates are Chaumian ecash (1982). Closest contemporary work: **A402** (arXiv:2603.01179, 2026) independently binds x402 payments to service execution using TEE-assisted (AMD SEV-SNP) Schnorr adaptor signatures over "atomic service channels" — the same witness-reveal atomicity as §4, traded against hardware trust for practical throughput. What this document adds is the *composition* — welding contingent delivery to blind FHE execution (no TEE), VDF-clocked Dutch auctions, registryless capability resonance, blind-mint fiat mandates, and single-scalar path settlement — not the individual mechanisms.

Three conjectures are load-bearing:

1. **Verifiable FHE at inference scale.** Every primitive in §4 exists today (Schnorr adaptors, blind signatures, VDFs, PSI, TFHE/CKKS evaluation). The unified proof `π` over a full LLM inference trace does not — current proof systems over FHE evaluation are orders of magnitude too slow. `π` over a *committed-weights partial trace with sampled audit openings* is the pragmatic waypoint; full succinct verifiable FHE is the paradigm's critical-path research bet. Stated plainly: **x402-Quantum's atomicity argument is sound; its performance envelope is conjecture.**
2. **Speculative-evaluation waste.** Resonance means racing; racing means losers burn compute. For expensive inference this is economically severe. The aptitude pre-circuit and VDF backoff bound the waste, but it is a genuine thermodynamic cost of registryless discovery — the price of having no directory is that the network *searches by working*.
3. **Emission griefing.** Tesserae whose emitters never accept are the residual attack. Mitigation is economic, not procedural: mandates carry a small non-refundable *emission burn*, and blind rate-limit tokens cap per-mint emission velocity — enforced by the mints, invisible to the froth.

What requires **no** defense, because the states do not exist: double-payment, delivery-without-payment, payment-without-delivery, relay-fee disputes, escrow theft, registry poisoning, and credential replay.

---

## 6. Closing Position

HTTP asked *"where is the service?"* and bolted payment on as an error code. Blockchains asked *"what does the ledger say?"* and bolted computation on as a contract. x402-Quantum asks neither. It emits a self-funding, self-routing, self-settling object into an anonymous medium, and defines a universe in which the only expressible history is the fair one.

The 402 status code is not answered here. The design goal is to render it unaskable.
