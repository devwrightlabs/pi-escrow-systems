"use client";

import type { CSSProperties } from "react";
import type { EscrowRecord } from "../types/escrow";

export interface EscrowStatusCardProps {
  escrow: EscrowRecord;
}

const colors = {
  canvas: "#0A0A0F",
  gold: "#F0C040",
  text: "#F7F7FA",
  muted: "#A2A6B5",
  panel: "rgba(255,255,255,0.04)",
  success: "#46D39A",
  warning: "#F7AE4A",
  danger: "#F56A6A"
} as const;

const cardStyle: CSSProperties = {
  background: `radial-gradient(circle at top right, rgba(240,192,64,0.12), transparent 35%), ${colors.canvas}`,
  border: `1px solid rgba(240,192,64,0.24)`,
  borderRadius: 20,
  color: colors.text,
  padding: 24,
  boxShadow: "0 22px 50px rgba(0, 0, 0, 0.35)",
  width: "100%",
  maxWidth: 460,
  fontFamily: 'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
};

const statusColor = (state: EscrowRecord["state"]): string => {
  switch (state) {
    case "RELEASED":
      return colors.success;
    case "DISPUTED":
      return colors.danger;
    case "REFUNDING":
    case "REFUNDED":
      return colors.warning;
    default:
      return colors.gold;
  }
};

/**
 * Enterprise status card for real-time Pi escrow funds and milestone progress.
 */
export function EscrowStatusCard({ escrow }: EscrowStatusCardProps) {
  return (
    <section style={cardStyle} aria-live="polite">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16 }}>
        <div>
          <div style={{ color: colors.muted, fontSize: 12, letterSpacing: 1.4, textTransform: "uppercase" }}>Pi Bazaar Escrow</div>
          <h2 style={{ margin: "8px 0 0", fontSize: 24 }}>{escrow.title}</h2>
        </div>
        <div
          style={{
            background: `${statusColor(escrow.state)}22`,
            color: statusColor(escrow.state),
            border: `1px solid ${statusColor(escrow.state)}44`,
            borderRadius: 999,
            padding: "8px 14px",
            fontWeight: 700,
            fontSize: 12,
            letterSpacing: 0.6
          }}
        >
          {escrow.state}
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
          gap: 12,
          marginTop: 24
        }}
      >
        {[
          { label: "Funded", value: `${escrow.fundedAmount.toFixed(2)} ${escrow.assetSymbol}` },
          { label: "Locked", value: `${escrow.heldAmount.toFixed(2)} ${escrow.assetSymbol}` },
          { label: "Released", value: `${escrow.releasedAmount.toFixed(2)} ${escrow.assetSymbol}` }
        ].map((metric) => (
          <div key={metric.label} style={{ background: colors.panel, borderRadius: 16, padding: 14 }}>
            <div style={{ color: colors.muted, fontSize: 12 }}>{metric.label}</div>
            <div style={{ marginTop: 8, fontWeight: 700, fontSize: 18 }}>{metric.value}</div>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 24 }}>
        <div style={{ color: colors.muted, fontSize: 12, textTransform: "uppercase", letterSpacing: 1.2 }}>Timeline</div>
        <div style={{ position: "relative", marginTop: 18, paddingLeft: 18 }}>
          <div
            style={{
              position: "absolute",
              left: 4,
              top: 0,
              bottom: 0,
              width: 2,
              background: `linear-gradient(180deg, ${colors.gold}, rgba(240,192,64,0.15))`
            }}
          />
          {(escrow.milestones.length > 0
            ? escrow.milestones
            : [{ id: "single-release", label: "Escrow Release", percentage: 100, status: escrow.state === "RELEASED" ? "RELEASED" : "PENDING", releasedAmount: escrow.releasedAmount }]
          ).map((milestone) => (
            <div key={milestone.id} style={{ position: "relative", paddingBottom: 18, paddingLeft: 20 }}>
              <div
                style={{
                  position: "absolute",
                  left: -1,
                  top: 6,
                  width: 12,
                  height: 12,
                  borderRadius: 999,
                  background: milestone.status === "RELEASED" ? colors.gold : "transparent",
                  border: `2px solid ${colors.gold}`
                }}
              />
              <div style={{ fontWeight: 600 }}>{milestone.label}</div>
              <div style={{ color: colors.muted, fontSize: 13, marginTop: 4 }}>
                {milestone.percentage}% · {milestone.status}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
