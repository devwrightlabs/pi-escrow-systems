# @devright/pi-bazaar-escrow

`@devright/pi-bazaar-escrow` is a strictly typed TypeScript escrow and decentralized commerce engine designed for the native Pi Network mobile webview container. It is optimized for React and Next.js App Router applications that need deterministic escrow state handling, Pi-native smart contract payload generation, milestone releases, dispute tooling, and live UI integration.

## Installation

```bash
npm install @devright/pi-bazaar-escrow react react-dom
```

## Core capabilities

- Strict TypeScript-first escrow contracts and state transitions
- Protocol v23 smart contract payload compilation for native Rust WASM bindings
- Group-buying escrow thresholds and milestone-based releases
- Yield bridging, barter-cycle detection, and reputation-backed fast releases
- Photo proof, GPS meetup validation, encrypted escrow chat, AI dispute suggestions, and arbitration packaging
- React provider, hook, and enterprise status card ready for client components

## Build and typecheck

```bash
npm run typecheck
npm run build
```

## Smart contract bindings

The `PiSmartContractAdapter` converts a typed `EscrowContractBinding` into a deterministic `EscrowWasmPayload` shaped for Protocol v23 execution:

- `INIT_ESCROW` seeds the escrow amount, threshold, and asset
- `SET_RELEASE_POLICY` defines single-release or milestone-based settlements
- `SET_DISPUTE_POLICY` configures AI pre-screening before CLAP escalation
- `SET_PARTICIPANTS` binds buyer and seller wallets
- `SET_MILESTONES` seals the milestone digest when phased releases are enabled

This library intentionally keeps the adapter deterministic and serialization-safe so host apps can forward the payload to native Pi wallet, Rust WASM, or server-side signing infrastructure without re-deriving contract state.

## Quick start

```tsx
"use client";

import { EscrowProvider, EscrowStatusCard, useEscrow } from "@devright/pi-bazaar-escrow";

function DemoEscrow() {
  const { engine, snapshot, modules } = useEscrow();

  const escrow =
    snapshot.escrows[0] ??
    modules.fractionalCart.createGroupCart(engine, {
      title: "Vintage camera sale",
      amount: 125,
      buyerWallet: "buyer_pi_wallet",
      sellerWallet: "seller_pi_wallet",
      contributors: [{ walletAddress: "buyer_pi_wallet", amount: 125, role: "BUYER" }]
    });

  return <EscrowStatusCard escrow={escrow} />;
}

export default function Page() {
  return (
    <EscrowProvider>
      <DemoEscrow />
    </EscrowProvider>
  );
}
```

## Module guide

### Core

1. `EscrowEngine`  
   Master state machine for creating, validating, locking, releasing, disputing, refunding, and packaging Pi escrows.

2. `PiSmartContractAdapter`  
   Deterministic compiler from TypeScript escrow bindings into Rust WASM payloads.

### Commerce

3. `PiFractionalCart`  
   Aggregates funds from multiple wallets and locks only when the threshold is met.

4. `PiMilestoneRelease`  
   Approves milestone phases sequentially and releases percentage-based payouts.

5. `PiYieldLock`  
   Tracks micro-yield accrual while funds remain locked for delivery windows.

6. `PiBarterGraph`  
   Finds directed barter cycles and surfaces simultaneous swap opportunities.

7. `PiReputationBond`  
   Stakes seller collateral to support faster release flows for trusted merchants.

### Trust, verification, and disputes

8. `PiPhotoProof`  
   Accepts only live camera captures, timestamps them, and stores a digest on the escrow.

9. `PiGpsHandshake`  
   Requires buyer and seller geolocation pings to match before auto-release can occur.

10. `PiEscrowChat`  
    Encrypts escrow-scoped messages and supports post-release retention windows.

11. `PiAutoArbitrator`  
    Generates an AI-style refund split suggestion from escrow chat signals.

12. `PiTimeDecayRefund`  
    Gradually refunds the buyer when the seller remains unresponsive past 48 hours.

13. `PiZkKycGate`  
    Stores zero-knowledge style KYC proofs without exposing identity attributes.

14. `PiArbitrationPackager`  
    Seals dispute evidence into an immutable JSON payload for CLAP review.

### React integration

15. `EscrowProvider`  
    Initializes the engine and mirrors live snapshots through a browser broadcast channel.

16. `useEscrow`  
    Exposes the engine, snapshot, and every module instance to client components.

17. `EscrowStatusCard`  
    A premium card UI using Devright Labs colors (`#0A0A0F` canvas and `#F0C040` timeline accents).

## API notes

- All public modules are exported from `src/index.ts`
- No `any` types are used in the escrow type surface
- React-facing files opt into client rendering with `"use client";`
- The library ships dual ESM/CJS bundles with declaration files through `tsup`

## Intended environments

- React 18+ and 19+
- Next.js App Router
- Pi Network mobile webview containers
- Node-based build pipelines that need bundled ESM/CJS output
