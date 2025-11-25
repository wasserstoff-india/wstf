/**
 * LpGridPreview Component
 *
 * Displays LP (Liquidity Provider) grid distribution preview.
 * Shows how liquidity is distributed across price levels.
 */

import React, { useMemo } from 'react';

// ============================================================
// Types
// ============================================================

export interface LpGridPreviewProps {
  /** Base asset (e.g., 'BTC') */
  baseAsset: string;
  /** Quote asset (e.g., 'USD') */
  quoteAsset: string;
  /** Current mid price */
  midPrice: number;
  /** Price range as percentage (e.g., 5 for +-5%) */
  rangePercent: number;
  /** Number of grid levels on each side */
  gridLevels: number;
  /** Total liquidity amount in base asset */
  totalLiquidity: number;
  /** Distribution type */
  distribution: 'uniform' | 'concentrated' | 'bell';
  /** Additional CSS classes */
  className?: string;
}

interface GridLevel {
  price: number;
  liquidity: number;
  side: 'bid' | 'ask';
  percentage: number;
}

// ============================================================
// Helpers
// ============================================================

function calculateGridLevels(
  midPrice: number,
  rangePercent: number,
  gridLevels: number,
  totalLiquidity: number,
  distribution: 'uniform' | 'concentrated' | 'bell'
): GridLevel[] {
  const levels: GridLevel[] = [];
  const priceStep = (midPrice * (rangePercent / 100)) / gridLevels;

  // Distribution weights
  const getWeight = (distanceFromMid: number): number => {
    switch (distribution) {
      case 'uniform':
        return 1;
      case 'concentrated':
        return 1 / (distanceFromMid + 1);
      case 'bell':
        return Math.exp(-0.5 * Math.pow(distanceFromMid / (gridLevels / 2), 2));
      default:
        return 1;
    }
  };

  // Calculate total weight for normalization
  let totalWeight = 0;
  for (let i = 1; i <= gridLevels; i++) {
    totalWeight += getWeight(i) * 2; // Both sides
  }

  // Generate bid levels (below mid)
  for (let i = gridLevels; i >= 1; i--) {
    const price = midPrice - priceStep * i;
    const weight = getWeight(i);
    const liquidity = (totalLiquidity * weight) / totalWeight;
    levels.push({
      price,
      liquidity,
      side: 'bid',
      percentage: (weight / totalWeight) * 100 * gridLevels,
    });
  }

  // Generate ask levels (above mid)
  for (let i = 1; i <= gridLevels; i++) {
    const price = midPrice + priceStep * i;
    const weight = getWeight(i);
    const liquidity = (totalLiquidity * weight) / totalWeight;
    levels.push({
      price,
      liquidity,
      side: 'ask',
      percentage: (weight / totalWeight) * 100 * gridLevels,
    });
  }

  return levels;
}

function formatNumber(num: number, decimals: number = 2): string {
  if (num >= 1000000) return (num / 1000000).toFixed(decimals) + 'M';
  if (num >= 1000) return (num / 1000).toFixed(decimals) + 'K';
  return num.toFixed(decimals);
}

// ============================================================
// Component
// ============================================================

export const LpGridPreview: React.FC<LpGridPreviewProps> = ({
  baseAsset,
  quoteAsset,
  midPrice,
  rangePercent,
  gridLevels,
  totalLiquidity,
  distribution,
  className = '',
}) => {
  const levels = useMemo(
    () =>
      calculateGridLevels(midPrice, rangePercent, gridLevels, totalLiquidity, distribution),
    [midPrice, rangePercent, gridLevels, totalLiquidity, distribution]
  );

  const maxPercentage = Math.max(...levels.map((l) => l.percentage));

  return (
    <div className={`bg-white border border-slate-200 rounded-lg ${className}`}>
      {/* Header */}
      <div className="px-4 py-3 border-b border-slate-200">
        <div className="flex items-center justify-between">
          <h3 className="font-medium text-slate-900">LP Grid Preview</h3>
          <span className="text-xs text-slate-500">
            {baseAsset}/{quoteAsset}
          </span>
        </div>
      </div>

      {/* Grid Summary */}
      <div className="px-4 py-3 bg-slate-50 border-b border-slate-200">
        <div className="grid grid-cols-4 gap-4 text-sm">
          <div>
            <p className="text-slate-500 text-xs">Mid Price</p>
            <p className="font-medium text-slate-900">${midPrice.toFixed(2)}</p>
          </div>
          <div>
            <p className="text-slate-500 text-xs">Range</p>
            <p className="font-medium text-slate-900">+-{rangePercent}%</p>
          </div>
          <div>
            <p className="text-slate-500 text-xs">Levels</p>
            <p className="font-medium text-slate-900">{gridLevels * 2}</p>
          </div>
          <div>
            <p className="text-slate-500 text-xs">Distribution</p>
            <p className="font-medium text-slate-900 capitalize">{distribution}</p>
          </div>
        </div>
      </div>

      {/* Price Range Visualization */}
      <div className="px-4 py-3 border-b border-slate-200">
        <div className="flex items-center justify-between text-xs text-slate-500 mb-2">
          <span>${(midPrice * (1 - rangePercent / 100)).toFixed(2)}</span>
          <span className="font-medium text-slate-700">${midPrice.toFixed(2)}</span>
          <span>${(midPrice * (1 + rangePercent / 100)).toFixed(2)}</span>
        </div>
        <div className="h-2 bg-slate-100 rounded-full overflow-hidden flex">
          <div className="flex-1 bg-gradient-to-r from-green-200 to-green-400" />
          <div className="w-px bg-slate-400" />
          <div className="flex-1 bg-gradient-to-r from-red-400 to-red-200" />
        </div>
      </div>

      {/* Grid Levels */}
      <div className="p-4">
        <div className="space-y-1">
          {levels.map((level, index) => (
            <div key={index} className="flex items-center gap-2">
              {/* Price */}
              <span
                className={`text-xs font-mono w-20 ${
                  level.side === 'bid' ? 'text-green-600' : 'text-red-600'
                }`}
              >
                ${level.price.toFixed(2)}
              </span>

              {/* Bar */}
              <div className="flex-1 h-4 bg-slate-100 rounded overflow-hidden">
                <div
                  className={`h-full transition-all ${
                    level.side === 'bid' ? 'bg-green-400' : 'bg-red-400'
                  }`}
                  style={{ width: `${(level.percentage / maxPercentage) * 100}%` }}
                />
              </div>

              {/* Liquidity */}
              <span className="text-xs text-slate-500 w-16 text-right">
                {formatNumber(level.liquidity)} {baseAsset}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Footer */}
      <div className="px-4 py-3 bg-slate-50 border-t border-slate-200">
        <div className="flex items-center justify-between text-sm">
          <span className="text-slate-500">Total Liquidity</span>
          <span className="font-medium text-slate-900">
            {formatNumber(totalLiquidity)} {baseAsset}
          </span>
        </div>
      </div>
    </div>
  );
};

// ============================================================
// Source Code Export
// ============================================================

export const LpGridPreviewSource = `
import React from 'react';

interface LpGridPreviewProps {
  midPrice: number;
  rangePercent: number;
  gridLevels: number;
  totalLiquidity: number;
  distribution: 'uniform' | 'concentrated' | 'bell';
}

export const LpGridPreview: React.FC<LpGridPreviewProps> = ({
  midPrice,
  rangePercent,
  gridLevels,
  totalLiquidity,
  distribution,
}) => {
  const priceStep = (midPrice * (rangePercent / 100)) / gridLevels;

  // Generate levels
  const levels = [];
  for (let i = -gridLevels; i <= gridLevels; i++) {
    if (i === 0) continue;
    const price = midPrice + priceStep * i;
    const weight = distribution === 'uniform' ? 1 : 1 / (Math.abs(i) + 1);
    levels.push({ price, side: i < 0 ? 'bid' : 'ask', weight });
  }

  return (
    <div className="bg-white border rounded-lg p-4">
      <h3 className="font-medium mb-4">LP Grid Preview</h3>

      <div className="space-y-1">
        {levels.map((level, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className={\`text-xs w-16 \${level.side === 'bid' ? 'text-green-600' : 'text-red-600'}\`}>
              \${level.price.toFixed(2)}
            </span>
            <div
              className={\`h-3 rounded \${level.side === 'bid' ? 'bg-green-400' : 'bg-red-400'}\`}
              style={{ width: \`\${level.weight * 100}%\` }}
            />
          </div>
        ))}
      </div>
    </div>
  );
};
`.trim();
