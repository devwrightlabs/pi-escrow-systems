"use client";

import { createContext, useEffect, useMemo, useRef, useState, type PropsWithChildren } from "react";
import { EscrowEngine } from "../core/EscrowEngine";
import { PiBarterGraph } from "../commerce/pi-barter-graph";
import { PiFractionalCart } from "../commerce/pi-fractional-cart";
import { PiMilestoneRelease } from "../commerce/pi-milestone-release";
import { PiReputationBond } from "../commerce/pi-reputation-bond";
import { PiYieldLock } from "../commerce/pi-yield-lock";
import { PiArbitrationPackager } from "../trust/pi-arbitration-packager";
import { PiAutoArbitrator } from "../trust/pi-auto-arbitrator";
import { PiEscrowChat } from "../trust/pi-escrow-chat";
import { PiGpsHandshake } from "../trust/pi-gps-handshake";
import { PiPhotoProof } from "../trust/pi-photo-proof";
import { PiTimeDecayRefund } from "../trust/pi-time-decay-refund";
import { PiZkKycGate } from "../trust/pi-zk-kyc-gate";
import type { EscrowEngineConfig, EscrowSnapshot } from "../types/escrow";

export interface EscrowModuleSuite {
  fractionalCart: PiFractionalCart;
  milestoneRelease: PiMilestoneRelease;
  yieldLock: PiYieldLock;
  barterGraph: PiBarterGraph;
  reputationBond: PiReputationBond;
  photoProof: PiPhotoProof;
  gpsHandshake: PiGpsHandshake;
  escrowChat: PiEscrowChat;
  autoArbitrator: PiAutoArbitrator;
  timeDecayRefund: PiTimeDecayRefund;
  zkKycGate: PiZkKycGate;
  arbitrationPackager: PiArbitrationPackager;
}

export interface EscrowContextValue {
  engine: EscrowEngine;
  modules: EscrowModuleSuite;
  snapshot: EscrowSnapshot;
}

export interface EscrowProviderProps extends PropsWithChildren {
  config?: EscrowEngineConfig;
}

const initialEngine = new EscrowEngine();
const initialModules: EscrowModuleSuite = {
  fractionalCart: new PiFractionalCart(),
  milestoneRelease: new PiMilestoneRelease(),
  yieldLock: new PiYieldLock(),
  barterGraph: new PiBarterGraph(),
  reputationBond: new PiReputationBond(),
  photoProof: new PiPhotoProof(),
  gpsHandshake: new PiGpsHandshake(),
  escrowChat: new PiEscrowChat(),
  autoArbitrator: new PiAutoArbitrator(),
  timeDecayRefund: new PiTimeDecayRefund(),
  zkKycGate: new PiZkKycGate(),
  arbitrationPackager: new PiArbitrationPackager()
};

/**
 * React context carrying the escrow engine, live snapshot, and feature modules.
 */
export const EscrowContext = createContext<EscrowContextValue>({
  engine: initialEngine,
  modules: initialModules,
  snapshot: initialEngine.getSnapshot()
});

/**
 * Provider that instantiates the escrow engine and mirrors updates over a browser BroadcastChannel.
 */
export function EscrowProvider({ children, config }: EscrowProviderProps) {
  const engine = useMemo(() => new EscrowEngine(config), [config]);
  const modules = useMemo<EscrowModuleSuite>(
    () => ({
      fractionalCart: new PiFractionalCart(),
      milestoneRelease: new PiMilestoneRelease(),
      yieldLock: new PiYieldLock(),
      barterGraph: new PiBarterGraph(),
      reputationBond: new PiReputationBond(),
      photoProof: new PiPhotoProof(),
      gpsHandshake: new PiGpsHandshake(),
      escrowChat: new PiEscrowChat(),
      autoArbitrator: new PiAutoArbitrator(),
      timeDecayRefund: new PiTimeDecayRefund(),
      zkKycGate: new PiZkKycGate(),
      arbitrationPackager: new PiArbitrationPackager()
    }),
    []
  );
  const [snapshot, setSnapshot] = useState<EscrowSnapshot>(engine.getSnapshot());
  const channelRef = useRef<BroadcastChannel | null>(null);

  useEffect(() => {
    const unsubscribe = engine.subscribe((nextSnapshot) => {
      setSnapshot(nextSnapshot);
      channelRef.current?.postMessage(nextSnapshot);
    });

    if (typeof BroadcastChannel !== "undefined") {
      const channel = new BroadcastChannel(config?.broadcastChannelName ?? "devright-pi-escrow-live");
      channel.onmessage = (event: MessageEvent<EscrowSnapshot>) => {
        setSnapshot(event.data);
      };
      channelRef.current = channel;
    }

    return () => {
      unsubscribe();
      channelRef.current?.close();
      channelRef.current = null;
    };
  }, [config?.broadcastChannelName, engine]);

  const value = useMemo<EscrowContextValue>(
    () => ({
      engine,
      modules,
      snapshot
    }),
    [engine, modules, snapshot]
  );

  return <EscrowContext.Provider value={value}>{children}</EscrowContext.Provider>;
}
