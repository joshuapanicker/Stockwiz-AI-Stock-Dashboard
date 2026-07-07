import { useState } from "react";

// Consistent palette colors per symbol (hashes symbol chars to pick a color)
const PALETTE = [
  "#00c896", // teal-green
  "#805ad5", // violet
  "#3fa9f5", // sky blue
  "#f6a623", // amber
  "#34d399", // mint
  "#f74b6d", // rose
  "#f6d125", // gold
  "#ff7f50", // coral
];

function letterColor(symbol: string): string {
  const index = symbol.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0) % PALETTE.length;
  return PALETTE[index];
}

interface Props {
  symbol: string;
  size?: number;
  className?: string;
}

export default function TickerLogo({ symbol, size = 40, className = "" }: Props) {
  const [failed, setFailed] = useState(false);
  const color = letterColor(symbol.toUpperCase());
  const radius = Math.round(size * 0.28);

  if (!failed) {
    return (
      <img
        src={`https://assets.parqet.com/logos/symbol/${symbol.toUpperCase()}?format=jpg`}
        alt={symbol}
        onError={() => setFailed(true)}
        className={className}
        style={{
          width: size,
          height: size,
          borderRadius: radius,
          objectFit: "cover",
          flexShrink: 0,
          display: "block",
        }}
      />
    );
  }

  // Letter avatar fallback
  const letters = symbol.slice(0, 2).toUpperCase();
  return (
    <div
      className={className}
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        background: `${color}18`,
        border: `1px solid ${color}38`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
        fontFamily: "monospace",
        fontWeight: 700,
        fontSize: size * 0.34,
        color,
      }}
    >
      {letters}
    </div>
  );
}
