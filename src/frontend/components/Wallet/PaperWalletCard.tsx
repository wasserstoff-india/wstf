/**
 * PaperWalletCard Component
 *
 * Displays wallet recovery phrase/secret key for backup purposes.
 * Used during wallet creation for secure backup.
 */

import React, { useState, useCallback } from 'react';

// ============================================================
// Types
// ============================================================

export interface PaperWalletCardProps {
  /** The mnemonic phrase or secret key to display */
  secret: string;
  /** Type of secret being displayed */
  secretType: 'mnemonic' | 'privateKey';
  /** Wallet address for reference */
  address: string;
  /** Signature algorithm used */
  sigAlg: 'ed25519' | 'secp256k1';
  /** Optional wallet label */
  label?: string;
  /** Additional CSS classes */
  className?: string;
  /** Callback when user confirms backup */
  onBackupConfirmed?: () => void;
}

// ============================================================
// Component
// ============================================================

export const PaperWalletCard: React.FC<PaperWalletCardProps> = ({
  secret,
  secretType,
  address,
  sigAlg,
  label,
  className = '',
  onBackupConfirmed,
}) => {
  const [isRevealed, setIsRevealed] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  const [isConfirmed, setIsConfirmed] = useState(false);

  const words = secretType === 'mnemonic' ? secret.split(' ') : [];

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(secret);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    } catch {
      // Fallback for older browsers
      const textarea = document.createElement('textarea');
      textarea.value = secret;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    }
  }, [secret]);

  const handleConfirm = useCallback(() => {
    setIsConfirmed(true);
    onBackupConfirmed?.();
  }, [onBackupConfirmed]);

  return (
    <div className={`bg-white border border-slate-200 rounded-lg shadow-sm ${className}`}>
      {/* Header */}
      <div className="px-6 py-4 border-b border-slate-200">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-slate-900">
            {secretType === 'mnemonic' ? 'Recovery Phrase' : 'Private Key'}
          </h3>
          <span className="text-xs text-slate-400 uppercase">{sigAlg}</span>
        </div>
        {label && <p className="text-sm text-slate-500 mt-1">{label}</p>}
      </div>

      {/* Warning Banner */}
      <div className="px-6 py-3 bg-amber-50 border-b border-amber-100">
        <div className="flex items-start gap-3">
          <svg
            className="w-5 h-5 text-amber-500 mt-0.5 flex-shrink-0"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
          <div>
            <p className="text-sm font-medium text-amber-800">
              Never share this {secretType === 'mnemonic' ? 'phrase' : 'key'}
            </p>
            <p className="text-xs text-amber-700 mt-1">
              Anyone with access can control your funds. Store it securely offline.
            </p>
          </div>
        </div>
      </div>

      {/* Secret Display */}
      <div className="px-6 py-4">
        {!isRevealed ? (
          <button
            onClick={() => setIsRevealed(true)}
            className="w-full py-12 border-2 border-dashed border-slate-200 rounded-lg hover:border-slate-300 transition-colors"
          >
            <div className="flex flex-col items-center gap-2">
              <svg
                className="w-8 h-8 text-slate-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                />
              </svg>
              <span className="text-sm font-medium text-slate-600">
                Click to reveal {secretType === 'mnemonic' ? 'recovery phrase' : 'private key'}
              </span>
            </div>
          </button>
        ) : secretType === 'mnemonic' ? (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-2">
              {words.map((word, index) => (
                <div
                  key={index}
                  className="flex items-center gap-2 px-3 py-2 bg-slate-50 rounded-lg"
                >
                  <span className="text-xs text-slate-400 w-4">{index + 1}.</span>
                  <span className="text-sm font-mono font-medium text-slate-700">{word}</span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="p-4 bg-slate-50 rounded-lg">
              <p className="text-sm font-mono break-all text-slate-700">{secret}</p>
            </div>
          </div>
        )}

        {/* Address Reference */}
        {isRevealed && (
          <div className="mt-4 pt-4 border-t border-slate-100">
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-500">Address</span>
              <span className="text-xs font-mono text-slate-600">
                {address.slice(0, 12)}...{address.slice(-8)}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Actions */}
      {isRevealed && (
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200">
          <div className="flex gap-3">
            <button
              onClick={handleCopy}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2 border border-slate-300 text-slate-700 rounded-lg font-medium hover:bg-white transition-colors"
            >
              {isCopied ? (
                <>
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                  Copied
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
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
            <button
              onClick={handleConfirm}
              disabled={isConfirmed}
              className={`flex-1 px-4 py-2 rounded-lg font-medium transition-colors ${
                isConfirmed
                  ? 'bg-green-100 text-green-700 cursor-default'
                  : 'bg-blue-600 text-white hover:bg-blue-700'
              }`}
            >
              {isConfirmed ? 'Backup Confirmed' : "I've Saved This"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

// ============================================================
// Source Code Export
// ============================================================

export const PaperWalletCardSource = `
import React, { useState } from 'react';

interface PaperWalletCardProps {
  secret: string;
  secretType: 'mnemonic' | 'privateKey';
  address: string;
  sigAlg: 'ed25519' | 'secp256k1';
}

export const PaperWalletCard: React.FC<PaperWalletCardProps> = ({
  secret,
  secretType,
  address,
  sigAlg,
}) => {
  const [isRevealed, setIsRevealed] = useState(false);
  const words = secretType === 'mnemonic' ? secret.split(' ') : [];

  const handleCopy = () => {
    navigator.clipboard.writeText(secret);
  };

  return (
    <div className="bg-white border rounded-lg p-6">
      <div className="flex justify-between mb-4">
        <h3 className="font-semibold">
          {secretType === 'mnemonic' ? 'Recovery Phrase' : 'Private Key'}
        </h3>
        <span className="text-xs text-slate-400">{sigAlg}</span>
      </div>

      {!isRevealed ? (
        <button
          onClick={() => setIsRevealed(true)}
          className="w-full py-8 border-2 border-dashed rounded-lg"
        >
          Click to reveal
        </button>
      ) : (
        <>
          {secretType === 'mnemonic' ? (
            <div className="grid grid-cols-3 gap-2">
              {words.map((word, i) => (
                <div key={i} className="px-3 py-2 bg-slate-50 rounded">
                  <span className="text-slate-400">{i + 1}.</span> {word}
                </div>
              ))}
            </div>
          ) : (
            <p className="font-mono break-all bg-slate-50 p-4 rounded">
              {secret}
            </p>
          )}
          <button onClick={handleCopy} className="mt-4 px-4 py-2 border rounded">
            Copy
          </button>
        </>
      )}
    </div>
  );
};
`.trim();
