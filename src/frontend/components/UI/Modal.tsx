/**
 * Modal Component
 *
 * Modern modal dialog with WSTF neon green theme.
 * Supports customizable content, sizes, and animations.
 */

import React, { useEffect, useRef } from 'react';

// ============================================================
// Types
// ============================================================

export interface ModalProps {
  /** Whether the modal is open */
  isOpen: boolean;
  /** Callback when modal should close */
  onClose: () => void;
  /** Modal title */
  title?: string;
  /** Modal content */
  children: React.ReactNode;
  /** Modal size */
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full';
  /** Show close button */
  showCloseButton?: boolean;
  /** Close on overlay click */
  closeOnOverlay?: boolean;
  /** Close on escape key */
  closeOnEscape?: boolean;
  /** Additional CSS classes for modal content */
  className?: string;
  /** Custom footer content */
  footer?: React.ReactNode;
  /** Loading state */
  isLoading?: boolean;
}

// ============================================================
// Component
// ============================================================

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  children,
  size = 'md',
  showCloseButton = true,
  closeOnOverlay = true,
  closeOnEscape = true,
  className = '',
  footer,
  isLoading = false,
}) => {
  const overlayRef = useRef<HTMLDivElement>(null);

  // Size classes mapping
  const sizeClasses = {
    sm: 'max-w-md',
    md: 'max-w-lg',
    lg: 'max-w-2xl',
    xl: 'max-w-4xl',
    full: 'max-w-full mx-4',
  };

  // Handle escape key
  useEffect(() => {
    if (!isOpen || !closeOnEscape) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, closeOnEscape, onClose]);

  // Handle body scroll lock
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }

    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  // Handle overlay click
  const handleOverlayClick = (e: React.MouseEvent) => {
    if (closeOnOverlay && e.target === overlayRef.current) {
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
        backdropFilter: 'blur(8px)',
      }}
      onClick={handleOverlayClick}
    >
      {/* Modal Container */}
      <div
        className={`
          relative w-full ${sizeClasses[size]} max-h-[90vh]
          bg-gradient-to-br from-slate-900 to-slate-950
          border border-green-800/40 rounded-xl shadow-2xl
          transform transition-all duration-300 ease-out
          ${isOpen ? 'scale-100 opacity-100' : 'scale-95 opacity-0'}
          ${className}
        `}
        style={{
          boxShadow: '0 0 40px rgba(34, 197, 94, 0.2), 0 20px 40px rgba(0, 0, 0, 0.4)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Loading Overlay */}
        {isLoading && (
          <div className="absolute inset-0 bg-slate-900/80 backdrop-blur-sm rounded-xl flex items-center justify-center z-10">
            <div className="flex items-center gap-3 text-green-400">
              <svg className="w-6 h-6 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              <span className="text-sm font-medium">Loading...</span>
            </div>
          </div>
        )}

        {/* Header */}
        {(title || showCloseButton) && (
          <div className="flex items-center justify-between px-6 py-5 border-b border-green-700/30 bg-gradient-to-r from-slate-800/50 to-slate-900/50 rounded-t-xl">
            {title && (
              <h3 className="text-xl font-bold text-green-100 flex items-center gap-2">
                <div
                  className="w-2 h-2 rounded-full bg-green-400"
                  style={{ boxShadow: '0 0 8px rgba(34, 197, 94, 0.8)' }}
                />
                {title}
              </h3>
            )}

            {showCloseButton && (
              <button
                onClick={onClose}
                className="p-2 text-green-400 hover:text-green-300 hover:bg-green-950/30 rounded-lg transition-all duration-200 ml-auto"
                style={{ boxShadow: '0 0 10px rgba(34, 197, 94, 0.2)' }}
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
        )}

        {/* Content */}
        <div className="px-6 py-6 overflow-y-auto max-h-[60vh]">
          <div className="text-green-100">
            {children}
          </div>
        </div>

        {/* Footer */}
        {footer && (
          <div className="px-6 py-4 border-t border-green-700/30 bg-gradient-to-r from-slate-800/30 to-slate-900/30 rounded-b-xl">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
};

// ============================================================
// Confirmation Modal
// ============================================================

export interface ConfirmModalProps {
  /** Whether the modal is open */
  isOpen: boolean;
  /** Callback when modal should close */
  onClose: () => void;
  /** Callback when confirmed */
  onConfirm: () => void;
  /** Modal title */
  title: string;
  /** Confirmation message */
  message: string;
  /** Confirm button text */
  confirmText?: string;
  /** Cancel button text */
  cancelText?: string;
  /** Confirm button variant */
  variant?: 'danger' | 'warning' | 'success' | 'primary';
  /** Loading state */
  isLoading?: boolean;
}

export const ConfirmModal: React.FC<ConfirmModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  variant = 'primary',
  isLoading = false,
}) => {
  const variantClasses = {
    danger: 'from-red-600 to-red-700 hover:from-red-500 hover:to-red-600 border-red-500/30',
    warning: 'from-amber-600 to-amber-700 hover:from-amber-500 hover:to-amber-600 border-amber-500/30',
    success: 'from-green-600 to-green-700 hover:from-green-500 hover:to-green-600 border-green-500/30',
    primary: 'from-green-600 to-green-700 hover:from-green-500 hover:to-green-600 border-green-500/30',
  };

  const variantGlow = {
    danger: '0 0 20px rgba(239, 68, 68, 0.3)',
    warning: '0 0 20px rgba(245, 158, 11, 0.3)',
    success: '0 0 20px rgba(34, 197, 94, 0.3)',
    primary: '0 0 20px rgba(34, 197, 94, 0.3)',
  };

  const footer = (
    <div className="flex gap-3 justify-end">
      <button
        onClick={onClose}
        disabled={isLoading}
        className="px-4 py-2 border border-green-700/40 text-green-300 rounded-lg font-semibold hover:bg-green-950/30 hover:border-green-600/50 transition-all duration-200 disabled:opacity-50"
      >
        {cancelText}
      </button>
      <button
        onClick={onConfirm}
        disabled={isLoading}
        className={`px-4 py-2 bg-gradient-to-r text-white rounded-lg font-semibold transition-all duration-200 border disabled:opacity-50 ${variantClasses[variant]}`}
        style={{ boxShadow: !isLoading ? variantGlow[variant] : 'none' }}
      >
        {isLoading ? (
          <span className="flex items-center gap-2">
            <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            Loading...
          </span>
        ) : (
          confirmText
        )}
      </button>
    </div>
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      size="sm"
      footer={footer}
      closeOnOverlay={!isLoading}
      closeOnEscape={!isLoading}
    >
      <p className="text-green-200 leading-relaxed">
        {message}
      </p>
    </Modal>
  );
};

// ============================================================
// Source Code Export
// ============================================================

export const ModalSource = `
import React from 'react';
import { Modal, ConfirmModal } from '@wasserstoff/wstf-kit/components';

export const ExampleModal: React.FC = () => {
  const [isModalOpen, setIsModalOpen] = React.useState(false);
  const [isConfirmOpen, setIsConfirmOpen] = React.useState(false);

  return (
    <>
      <button onClick={() => setIsModalOpen(true)}>
        Open Modal
      </button>

      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="WSTF Modal"
        size="md"
      >
        <p>This is a beautiful WSTF-themed modal with neon green accents.</p>
      </Modal>

      <ConfirmModal
        isOpen={isConfirmOpen}
        onClose={() => setIsConfirmOpen(false)}
        onConfirm={() => {
          console.log('Confirmed!');
          setIsConfirmOpen(false);
        }}
        title="Confirm Action"
        message="Are you sure you want to proceed with this action?"
        variant="primary"
      />
    </>
  );
};
`.trim();