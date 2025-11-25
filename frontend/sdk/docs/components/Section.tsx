/**
 * Section Component
 *
 * Content section wrapper for docs pages.
 */

import React from 'react';

// ============================================================
// Types
// ============================================================

export interface SectionProps {
  /** Section title */
  title: string;
  /** Optional description */
  description?: string;
  /** Section content */
  children: React.ReactNode;
  /** Additional CSS classes */
  className?: string;
}

// ============================================================
// Component
// ============================================================

export const Section: React.FC<SectionProps> = ({
  title,
  description,
  children,
  className = '',
}) => {
  return (
    <section className={`space-y-4 ${className}`}>
      <div>
        <h2 className="text-xl font-semibold text-white">{title}</h2>
        {description && <p className="mt-1 text-sm text-slate-400">{description}</p>}
      </div>
      <div>{children}</div>
    </section>
  );
};

// ============================================================
// Sub-components
// ============================================================

export interface SectionCardProps {
  children: React.ReactNode;
  className?: string;
}

export const SectionCard: React.FC<SectionCardProps> = ({ children, className = '' }) => {
  return (
    <div className={`rounded-lg border border-slate-800 bg-slate-900/50 p-4 ${className}`}>
      {children}
    </div>
  );
};

export interface SectionGridProps {
  children: React.ReactNode;
  cols?: 1 | 2 | 3;
  className?: string;
}

export const SectionGrid: React.FC<SectionGridProps> = ({ children, cols = 2, className = '' }) => {
  const colsClass = {
    1: 'grid-cols-1',
    2: 'grid-cols-1 lg:grid-cols-2',
    3: 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3',
  }[cols];

  return <div className={`grid gap-4 ${colsClass} ${className}`}>{children}</div>;
};
