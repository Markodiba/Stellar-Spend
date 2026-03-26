"use client";

import { cn } from "@/lib/cn";
import type { RecentOfframpRow } from "@/types/stellaramp";

// ---------------------------------------------------------------------------
// Mock data — replaced by real TransactionStorage rows when wired up
// ---------------------------------------------------------------------------

const MOCK_ROWS: RecentOfframpRow[] = [
  { txHash: "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2", usdc: "120.00", naira: "₦192,000", status: "COMPLETE" },
  { txHash: "f9e8d7c6b5a4f9e8d7c6b5a4f9e8d7c6b5a4f9e8d7c6b5a4f9e8d7c6b5a4f9e8", usdc: "50.50",  naira: "₦80,800",  status: "SETTLING" },
  { txHash: "1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef12", usdc: "200.00", naira: "₦320,000", status: "COMPLETE" },
];

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface RecentOfframpsTableProps {
  rows?: ReadonlyArray<RecentOfframpRow>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function truncateTxHash(hash: string): string {
  if (hash.length <= 12) return hash;
  return `${hash.slice(0, 6)}...${hash.slice(-6)}`;
}

function StatusBadge({ status }: { status: RecentOfframpRow["status"] }) {
  return (
    <span
      className={cn(
        "inline-block px-2.5 py-0.5 text-[10px] tracking-widest uppercase font-semibold",
        status === "SETTLING"
          ? "bg-[#c9a962] text-[#0a0a0a]"
          : "border border-white text-white bg-transparent"
      )}
    >
      {status}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function RecentOfframpsTable({ rows = MOCK_ROWS }: RecentOfframpsTableProps) {
  return (
    <div
      data-testid="RecentOfframpsTable"
      className="border border-[#333333] bg-[#111111]"
    >
      {/* Section header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-[#333333]">
        <span className="text-[10px] tracking-[0.2em] text-[#777777] uppercase">
          Recent Offramps
        </span>
        <button
          className={cn(
            "text-[10px] tracking-widest uppercase text-[#c9a962] border border-[#c9a962] px-3 py-1",
            "hover:bg-[#c9a962] hover:text-[#0a0a0a] transition-colors duration-150",
            "focus:outline-none focus-visible:ring-1 focus-visible:ring-[#c9a962]"
          )}
        >
          View All
        </button>
      </div>

      {/* Horizontally scrollable table */}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] border-collapse">
          {/* Gold header row */}
          <thead>
            <tr className="bg-[#c9a962]">
              {["TX HASH", "USDC", "NAIRA", "STATUS"].map((col) => (
                <th
                  key={col}
                  className="px-5 py-2.5 text-left text-[10px] tracking-[0.18em] font-semibold text-[#0a0a0a] uppercase whitespace-nowrap"
                >
                  {col}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={4}
                  className="px-5 py-8 text-center text-xs text-[#555555] tracking-wider"
                >
                  No transactions yet
                </td>
              </tr>
            ) : (
              rows.map((row, i) => (
                <tr
                  key={row.txHash}
                  className={cn(
                    "border-b border-[#222222] transition-colors duration-100",
                    i % 2 === 0 ? "bg-[#111111]" : "bg-[#0f0f0f]",
                    "hover:bg-[#1a1a1a]"
                  )}
                >
                  <td className="px-5 py-3 text-xs text-[#777777] font-mono whitespace-nowrap">
                    {truncateTxHash(row.txHash)}
                  </td>
                  <td className="px-5 py-3 text-xs text-white tabular-nums whitespace-nowrap">
                    {row.usdc} USDC
                  </td>
                  <td className="px-5 py-3 text-xs text-white tabular-nums whitespace-nowrap">
                    {row.naira}
                  </td>
                  <td className="px-5 py-3 whitespace-nowrap">
                    <StatusBadge status={row.status} />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
