/**
 * useWstfClient Hook
 *
 * Access the WSTF RPC client.
 */

import { useWstf } from '../WstfProvider';
import type { WstfClient } from '../../core/client';

/**
 * Get the WSTF client instance
 */
export function useWstfClient(): WstfClient {
  const { client } = useWstf();
  return client;
}
