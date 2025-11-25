/**
 * BridgeForm - Component for creating cross-chain bridge transactions
 *
 * Provides a form interface for users to bridge tokens between chains.
 */

import React, { useState, useEffect } from 'react';
import { useBridgeRoutes, useBridgeQuote } from '../hooks/useBridge';
import { useWallet } from '../hooks';
import type {
  ChainId,
  BridgeFormData,
  BridgeRoute,
  ComponentStyleProps,
  RouteSelectionPriority,
} from '../types';

export interface BridgeFormProps extends ComponentStyleProps {
  /** Available source chains */
  supportedSrcChains?: ChainId[];

  /** Available destination chains */
  supportedDstChains?: ChainId[];

  /** Available tokens */
  supportedTokens?: string[];

  /** Default route selection priority */
  defaultPriority?: RouteSelectionPriority;

  /** Callback when bridge is initiated */
  onBridgeSubmit?: (data: BridgeFormData & { routeId: string }) => Promise<void>;

  /** Custom validation */
  validate?: (data: BridgeFormData) => string | null;
}

/**
 * Bridge form component
 */
export function BridgeForm({
  supportedSrcChains = ['bsc', 'polygon', 'eth'],
  supportedDstChains = ['bsc', 'polygon', 'eth'],
  supportedTokens = ['USDT', 'USDC', 'ETH', 'BNB'],
  defaultPriority = 'balanced',
  onBridgeSubmit,
  validate,
  className = '',
  style,
}: BridgeFormProps) {
  const { account } = useWallet();

  // Form state
  const [formData, setFormData] = useState<BridgeFormData>({
    srcChain: supportedSrcChains[0],
    dstChain: supportedDstChains[1],
    token: supportedTokens[0],
    amount: '',
    dstAddress: '',
  });

  const [priority, setPriority] = useState<RouteSelectionPriority>(defaultPriority);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Parse amount as bigint
  const amountBigInt = formData.amount
    ? BigInt(Math.floor(parseFloat(formData.amount) * 1_000_000))
    : undefined;

  // Fetch available routes
  const {
    data: routes,
    loading: routesLoading,
    error: routesError,
    pickBest,
  } = useBridgeRoutes({
    srcChain: formData.srcChain,
    dstChain: formData.dstChain,
    token: formData.token,
    minAmount: amountBigInt,
    enabled: !!(formData.srcChain && formData.dstChain && formData.token),
  });

  // Get best route
  const bestRoute = routes && amountBigInt ? pickBest(priority, amountBigInt) : null;

  // Get quote for best route
  const {
    data: quote,
    loading: quoteLoading,
  } = useBridgeQuote(bestRoute?.routeId, amountBigInt, !!bestRoute);

  // Update form data
  const updateFormData = (updates: Partial<BridgeFormData>) => {
    setFormData(prev => ({ ...prev, ...updates }));
    setError(null);
  };

  // Validate form
  const validateForm = (): string | null => {
    if (!formData.srcChain) return 'Please select source chain';
    if (!formData.dstChain) return 'Please select destination chain';
    if (formData.srcChain === formData.dstChain) return 'Source and destination chains must be different';
    if (!formData.token) return 'Please select token';
    if (!formData.amount || parseFloat(formData.amount) <= 0) return 'Please enter a valid amount';
    if (!formData.dstAddress) return 'Please enter destination address';
    if (!account?.address) return 'Please connect wallet';
    if (!bestRoute) return 'No available routes found';

    // Custom validation
    if (validate) {
      const customError = validate(formData);
      if (customError) return customError;
    }

    return null;
  };

  // Submit form
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const validationError = validateForm();
    if (validationError) {
      setError(validationError);
      return;
    }

    if (!bestRoute || !onBridgeSubmit) return;

    try {
      setSubmitting(true);
      setError(null);

      await onBridgeSubmit({
        ...formData,
        routeId: bestRoute.routeId,
      });

      // Reset form on success
      setFormData({
        srcChain: supportedSrcChains[0],
        dstChain: supportedDstChains[1],
        token: supportedTokens[0],
        amount: '',
        dstAddress: '',
      });

    } catch (err) {
      setError(String(err));
    } finally {
      setSubmitting(false);
    }
  };

  const displayError = error || routesError;

  return (
    <div className={`max-w-md mx-auto p-6 bg-white rounded-lg shadow-lg ${className}`} style={style}>
      <h2 className="text-xl font-bold text-gray-900 mb-6">Cross-Chain Bridge</h2>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Source Chain */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            From Chain
          </label>
          <select
            value={formData.srcChain}
            onChange={(e) => updateFormData({ srcChain: e.target.value as ChainId })}
            className="w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-blue-500 focus:border-blue-500"
          >
            {supportedSrcChains.map(chain => (
              <option key={chain} value={chain}>
                {chain.toUpperCase()}
              </option>
            ))}
          </select>
        </div>

        {/* Destination Chain */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            To Chain
          </label>
          <select
            value={formData.dstChain}
            onChange={(e) => updateFormData({ dstChain: e.target.value as ChainId })}
            className="w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-blue-500 focus:border-blue-500"
          >
            {supportedDstChains
              .filter(chain => chain !== formData.srcChain)
              .map(chain => (
                <option key={chain} value={chain}>
                  {chain.toUpperCase()}
                </option>
              ))}
          </select>
        </div>

        {/* Token */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Token
          </label>
          <select
            value={formData.token}
            onChange={(e) => updateFormData({ token: e.target.value })}
            className="w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-blue-500 focus:border-blue-500"
          >
            {supportedTokens.map(token => (
              <option key={token} value={token}>
                {token}
              </option>
            ))}
          </select>
        </div>

        {/* Amount */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Amount
          </label>
          <input
            type="number"
            step="0.000001"
            value={formData.amount}
            onChange={(e) => updateFormData({ amount: e.target.value })}
            placeholder="0.0"
            className="w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>

        {/* Destination Address */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Destination Address
          </label>
          <input
            type="text"
            value={formData.dstAddress}
            onChange={(e) => updateFormData({ dstAddress: e.target.value })}
            placeholder="0x742d35Cc6634C0532925a3b8D0123456789abcdef"
            className="w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>

        {/* Route Priority */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Route Priority
          </label>
          <select
            value={priority}
            onChange={(e) => setPriority(e.target.value as RouteSelectionPriority)}
            className="w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="cost">Lowest Cost</option>
            <option value="speed">Fastest</option>
            <option value="trust">Most Trusted</option>
            <option value="balanced">Balanced</option>
          </select>
        </div>

        {/* Quote Information */}
        {bestRoute && (
          <div className="p-3 bg-gray-50 rounded-md">
            <h4 className="text-sm font-medium text-gray-900 mb-2">Best Route</h4>
            <div className="text-xs text-gray-600 space-y-1">
              <div>Provider: {bestRoute.providerName}</div>
              <div>Fee: {(bestRoute.feeBps / 100).toFixed(2)}%</div>
              <div>Estimated Time: {Math.ceil(bestRoute.estimatedTimeSec / 60)} minutes</div>
              <div>Trust Score: {bestRoute.trustScore}/1000</div>
              {quote && (
                <div>You will receive: {(Number(quote.outputAmount) / 1_000_000).toFixed(6)} {formData.token}</div>
              )}
            </div>
          </div>
        )}

        {/* Error Display */}
        {displayError && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-md">
            <div className="text-sm text-red-600">{displayError}</div>
          </div>
        )}

        {/* Submit Button */}
        <button
          type="submit"
          disabled={submitting || routesLoading || quoteLoading || !bestRoute || !account}
          className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {submitting
            ? 'Creating Bridge...'
            : routesLoading
            ? 'Finding Routes...'
            : !account
            ? 'Connect Wallet'
            : !bestRoute
            ? 'No Routes Available'
            : `Bridge ${formData.token}`}
        </button>
      </form>
    </div>
  );
}

/**
 * Component source code for copy-paste usage
 */
export const BridgeFormSource = `
import React from 'react';
import { BridgeForm } from '@wasserstoff/wstf-kit';

function MyBridgeApp() {
  const handleBridge = async (bridgeData) => {
    console.log('Initiating bridge:', bridgeData);
    // Implement your bridge logic here
  };

  return (
    <BridgeForm
      supportedSrcChains={['bsc', 'polygon', 'eth']}
      supportedDstChains={['bsc', 'polygon', 'eth']}
      supportedTokens={['USDT', 'USDC']}
      defaultPriority="balanced"
      onBridgeSubmit={handleBridge}
    />
  );
}
`;