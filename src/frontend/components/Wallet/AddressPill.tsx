/**
 * AddressPill Component
 *
 * A compact, copyable address display with optional truncation.
 */

import React, { useState, useCallback } from 'react';

// ============================================================
// Types
// ============================================================

export interface AddressPillProps {
  /** The address to display */
  address: string;
  /** Number of characters to show at start and end */
  truncateChars?: number;
  /** Show full address on hover */
  showFullOnHover?: boolean;
  /** Enable hover interactions (disabled on mobile by default) */
  enableHover?: boolean;
  /** Additional CSS classes */
  className?: string;
  /** Size variant */
  size?: 'sm' | 'md' | 'lg';
  /** Show copy button */
  copyable?: boolean;
  /** Color variant */
  variant?: 'light' | 'dark' | 'neon';
}

// ============================================================
// Component
// ============================================================

export const AddressPill: React.FC<AddressPillProps> = ({
  address,
  truncateChars = 6,
  showFullOnHover = true,
  enableHover,
  className = '',
  size = 'md',
  copyable = true,
  variant = 'light',
}) => {
  const [copied, setCopied] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  // Detect mobile/touch devices
  React.useEffect(() => {
    const checkMobile = () => {
      const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
      const isSmallScreen = window.innerWidth < 768; // Tailwind md breakpoint
      setIsMobile(isTouchDevice || isSmallScreen);
    };

    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Determine if hover should be enabled
  const hoverEnabled = enableHover !== undefined ? enableHover : !isMobile;

  const truncated =
    address.length > truncateChars * 2 + 3
      ? `${address.slice(0, truncateChars)}...${address.slice(-truncateChars)}`
      : address;

  const displayAddress = showFullOnHover && hoverEnabled && isHovered ? address : truncated;

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      console.error('Failed to copy:', e);
    }
  }, [address]);

  const sizeClasses = {
    sm: 'text-xs px-2 py-1 gap-1',
    md: 'text-sm px-3 py-1.5 gap-2',
    lg: 'text-base px-4 py-2 gap-3',
  };

  const variantClasses = {
    light: 'bg-slate-100 text-slate-700 border-slate-200',
    dark: 'bg-slate-800 text-slate-300 border-slate-700',
    neon: 'bg-slate-900 text-green-300 border-green-700/40 shadow-lg',
  };

  const buttonVariantClasses = {
    light: 'text-slate-400 hover:text-slate-600',
    dark: 'text-slate-400 hover:text-slate-200',
    neon: 'text-green-400/70 hover:text-green-300',
  };

  // Hover event handlers
  const handleMouseEnter = hoverEnabled ? () => setIsHovered(true) : undefined;
  const handleMouseLeave = hoverEnabled ? () => setIsHovered(false) : undefined;

  return (
    <div
      className={`
        inline-flex items-center rounded-full font-mono border transition-all duration-200
        ${sizeClasses[size]} ${variantClasses[variant]} ${className}
        ${hoverEnabled && showFullOnHover ? 'cursor-default' : ''}
        ${variant === 'neon' ? 'hover:shadow-xl hover:shadow-green-500/20' : ''}
      `}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      style={variant === 'neon' ? {
        boxShadow: isHovered && hoverEnabled
          ? '0 0 25px rgba(34, 197, 94, 0.4), 0 8px 32px rgba(0, 0, 0, 0.3)'
          : '0 0 15px rgba(34, 197, 94, 0.2), 0 4px 16px rgba(0, 0, 0, 0.2)'
      } : undefined}
    >
      <span
        className={`
          font-medium transition-all duration-200 select-all
          ${variant === 'neon' && isHovered && hoverEnabled ? 'text-green-200' : ''}
        `}
      >
        {displayAddress}
      </span>

      {copyable && (
        <button
          onClick={handleCopy}
          className={`
            transition-all duration-200 p-1 rounded-md
            ${buttonVariantClasses[variant]}
            ${variant === 'neon' ? 'hover:bg-green-500/10 hover:shadow-sm' : ''}
          `}
          title={copied ? 'Copied!' : 'Copy address'}
          style={variant === 'neon' && copied ? {
            boxShadow: '0 0 12px rgba(34, 197, 94, 0.6)'
          } : undefined}
        >
          {copied ? (
            <svg className="w-4 h-4 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          ) : (
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
              />
            </svg>
          )}
        </button>
      )}
    </div>
  );
};

// ============================================================
// Source Code Export
// ============================================================

export const AddressPillSource = `
import React, { useState, useCallback } from 'react';
import { AddressPill } from '@wasserstoff/wstf-kit/components';

export const AddressPillExample: React.FC = () => {
  const address = "gc01024786b7860e08454315f1424806d42d6deddd0586";

  return (
    <div className="space-y-4">
      {/* Light variant (default) */}
      <AddressPill
        address={address}
        variant="light"
        size="md"
        truncateChars={6}
        showFullOnHover={true}
      />

      {/* Dark variant */}
      <AddressPill
        address={address}
        variant="dark"
        size="md"
      />

      {/* Neon variant (WSTF theme) */}
      <AddressPill
        address={address}
        variant="neon"
        size="lg"
        enableHover={true}
      />

      {/* Mobile-friendly (hover disabled) */}
      <AddressPill
        address={address}
        variant="neon"
        enableHover={false}
        truncateChars={8}
      />
    </div>
  );
};
`.trim();
