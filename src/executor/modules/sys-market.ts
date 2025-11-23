/**
 * SYS Market Module Registration
 *
 * Registers all SYS.MKT_* handlers with the executor engine.
 */

import { registerModule } from '../engine';
import { SYS_CREATOR_PKHASH, SYS_MODULE_ID, SYS_SELECTORS } from '../../instructions/opcodes';
import {
  handleMKT_CREATE,
  handleMKT_ORDER_PLACE,
  handleMKT_ORDER_CANCEL,
  handleMKT_ORDER_MATCH,
  handleMKT_GRID_CREATE,
  handleMKT_GRID_CANCEL,
  handleMKT_GET_MARKET,
  handleMKT_GET_BOOK,
} from '../../markets/exec';

/**
 * Register all market/orderbook modules
 */
export function registerMarketModules(): void {
  // MKT_CREATE - Create new market
  registerModule({
    creatorPkHash: SYS_CREATOR_PKHASH,
    moduleId: SYS_MODULE_ID,
    selector: SYS_SELECTORS.MKT_CREATE,
    handler: handleMKT_CREATE
  });

  // MKT_ORDER_PLACE - Place limit order
  registerModule({
    creatorPkHash: SYS_CREATOR_PKHASH,
    moduleId: SYS_MODULE_ID,
    selector: SYS_SELECTORS.MKT_ORDER_PLACE,
    handler: handleMKT_ORDER_PLACE
  });

  // MKT_ORDER_CANCEL - Cancel order
  registerModule({
    creatorPkHash: SYS_CREATOR_PKHASH,
    moduleId: SYS_MODULE_ID,
    selector: SYS_SELECTORS.MKT_ORDER_CANCEL,
    handler: handleMKT_ORDER_CANCEL
  });

  // MKT_ORDER_MATCH - Execute matching (bounded loop)
  registerModule({
    creatorPkHash: SYS_CREATOR_PKHASH,
    moduleId: SYS_MODULE_ID,
    selector: SYS_SELECTORS.MKT_ORDER_MATCH,
    handler: handleMKT_ORDER_MATCH
  });

  // MKT_GRID_CREATE - Create liquidity grid
  registerModule({
    creatorPkHash: SYS_CREATOR_PKHASH,
    moduleId: SYS_MODULE_ID,
    selector: SYS_SELECTORS.MKT_GRID_CREATE,
    handler: handleMKT_GRID_CREATE
  });

  // MKT_GRID_CANCEL - Cancel liquidity grid
  registerModule({
    creatorPkHash: SYS_CREATOR_PKHASH,
    moduleId: SYS_MODULE_ID,
    selector: SYS_SELECTORS.MKT_GRID_CANCEL,
    handler: handleMKT_GRID_CANCEL
  });

  // MKT_GET_MARKET - Get market info (read-only)
  registerModule({
    creatorPkHash: SYS_CREATOR_PKHASH,
    moduleId: SYS_MODULE_ID,
    selector: SYS_SELECTORS.MKT_GET_MARKET,
    handler: handleMKT_GET_MARKET
  });

  // MKT_GET_BOOK - Get orderbook (read-only)
  registerModule({
    creatorPkHash: SYS_CREATOR_PKHASH,
    moduleId: SYS_MODULE_ID,
    selector: SYS_SELECTORS.MKT_GET_BOOK,
    handler: handleMKT_GET_BOOK
  });
}
