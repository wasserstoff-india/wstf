/**
 * CodePreview Component
 *
 * Displays code snippets with syntax highlighting styling.
 */

import React, { useState, useCallback } from 'react';

// ============================================================
// Types
// ============================================================

export interface CodePreviewProps {
  /** The code to display */
  code: string;
  /** Language for syntax highlighting hint */
  language?: 'tsx' | 'typescript' | 'javascript' | 'bash' | 'json';
  /** Title for the code block */
  title?: string;
  /** Show line numbers */
  showLineNumbers?: boolean;
  /** Collapsible (default: true if code > 20 lines) */
  collapsible?: boolean;
  /** Initial collapsed state */
  defaultCollapsed?: boolean;
  /** Additional CSS classes */
  className?: string;
}

// ============================================================
// Component
// ============================================================

export const CodePreview: React.FC<CodePreviewProps> = ({
  code,
  language = 'tsx',
  title,
  showLineNumbers = true,
  collapsible,
  defaultCollapsed,
  className = '',
}) => {
  const lines = code.split('\n');
  const lineCount = lines.length;
  const shouldBeCollapsible = collapsible ?? lineCount > 20;
  const [isCollapsed, setIsCollapsed] = useState(defaultCollapsed ?? (shouldBeCollapsible && lineCount > 30));
  const [isCopied, setIsCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(code);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    } catch {
      // Fallback
      const textarea = document.createElement('textarea');
      textarea.value = code;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    }
  }, [code]);

  const displayedLines = isCollapsed ? lines.slice(0, 15) : lines;
  const hiddenCount = lineCount - 15;

  return (
    <div className={`rounded-lg overflow-hidden border border-green-900/50 bg-gradient-to-br from-slate-900 to-slate-950 shadow-lg ${className}`}
         style={{ boxShadow: '0 0 20px rgba(34, 197, 94, 0.15), 0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-slate-800/90 to-slate-900/90 border-b border-green-800/30">
        <div className="flex items-center gap-3">
          {/* Language Badge */}
          <span className="px-3 py-1 text-xs font-mono rounded-full bg-green-500/20 text-green-400 border border-green-500/30 font-medium">
            {language}
          </span>
          {title && (
            <span className="text-sm text-green-300/80 font-medium">{title}</span>
          )}
        </div>

        <div className="flex items-center gap-3">
          {/* Line Count */}
          <span className="text-xs text-green-400/70 bg-green-950/50 px-2 py-1 rounded">{lineCount} lines</span>

          {/* Copy Button */}
          <button
            onClick={handleCopy}
            className="flex items-center gap-2 px-3 py-1.5 text-xs rounded-md hover:bg-green-500/20 transition-all duration-200 text-green-400 hover:text-green-300 border border-green-500/30 hover:border-green-400/50 hover:shadow-sm"
            style={{ boxShadow: isCopied ? '0 0 8px rgba(34, 197, 94, 0.4)' : 'none' }}
          >
            {isCopied ? (
              <>
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span className="text-green-300">Copied!</span>
              </>
            ) : (
              <>
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                  />
                </svg>
                Copy
              </>
            )}
          </button>
        </div>
      </div>

      {/* Code Content */}
      <div className="bg-slate-950/80 overflow-x-auto">
        <pre className="p-4 text-sm leading-relaxed">
          <code className="text-green-100 font-mono">
            {displayedLines.map((line, index) => (
              <div key={index} className="flex hover:bg-green-950/30 transition-colors duration-150">
                {showLineNumbers && (
                  <span className="select-none w-10 pr-4 text-right text-green-600/60 text-xs font-medium">
                    {index + 1}
                  </span>
                )}
                <span className="flex-1 text-green-100">{line || ' '}</span>
              </div>
            ))}
          </code>
        </pre>

        {/* Collapsed indicator */}
        {isCollapsed && hiddenCount > 0 && (
          <button
            onClick={() => setIsCollapsed(false)}
            className="w-full px-4 py-3 text-sm text-green-400 hover:text-green-300 bg-green-950/40 hover:bg-green-950/60 transition-all duration-200 border-t border-green-800/40 hover:border-green-700/50"
          >
            <span className="flex items-center justify-center gap-2">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
              Show {hiddenCount} more lines...
            </span>
          </button>
        )}

        {/* Collapse button */}
        {!isCollapsed && shouldBeCollapsible && lineCount > 15 && (
          <button
            onClick={() => setIsCollapsed(true)}
            className="w-full px-4 py-3 text-sm text-green-400 hover:text-green-300 bg-green-950/40 hover:bg-green-950/60 transition-all duration-200 border-t border-green-800/40 hover:border-green-700/50"
          >
            <span className="flex items-center justify-center gap-2">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
              </svg>
              Collapse code
            </span>
          </button>
        )}
      </div>
    </div>
  );
};
