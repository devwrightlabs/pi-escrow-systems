"use client";

import { useContext } from "react";
import { EscrowContext, type EscrowContextValue } from "./EscrowProvider";

/**
 * Reads the live escrow context and exposes the entire module suite to the app tree.
 */
export function useEscrow(): EscrowContextValue {
  const value = useContext(EscrowContext);

  if (!value) {
    throw new Error("useEscrow must be used within an EscrowProvider.");
  }

  return value;
}
