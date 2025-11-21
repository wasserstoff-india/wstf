import { registerModule } from '../engine';
import { SYS_CREATOR_PKHASH, SYS_MODULE_ID, SYS_SELECTORS } from '../../instructions/opcodes';
import {
  handleREG,
  handleINIT,
  handleRENT,
  handleUPDATE,
  handleSIGN,
  handleVERIFY,
  handleXVAL
} from './sys';

/**
 * Register all built-in SYS modules
 */
export function registerSystemModules(): void {
  // REG
  registerModule({
    creatorPkHash: SYS_CREATOR_PKHASH,
    moduleId: SYS_MODULE_ID,
    selector: SYS_SELECTORS.REG,
    handler: handleREG
  });

  // INIT
  registerModule({
    creatorPkHash: SYS_CREATOR_PKHASH,
    moduleId: SYS_MODULE_ID,
    selector: SYS_SELECTORS.INIT,
    handler: handleINIT
  });

  // RENT
  registerModule({
    creatorPkHash: SYS_CREATOR_PKHASH,
    moduleId: SYS_MODULE_ID,
    selector: SYS_SELECTORS.RENT,
    handler: handleRENT
  });

  // UPDATE
  registerModule({
    creatorPkHash: SYS_CREATOR_PKHASH,
    moduleId: SYS_MODULE_ID,
    selector: SYS_SELECTORS.UPDATE,
    handler: handleUPDATE
  });

  // SIGN
  registerModule({
    creatorPkHash: SYS_CREATOR_PKHASH,
    moduleId: SYS_MODULE_ID,
    selector: SYS_SELECTORS.SIGN,
    handler: handleSIGN
  });

  // VERIFY
  registerModule({
    creatorPkHash: SYS_CREATOR_PKHASH,
    moduleId: SYS_MODULE_ID,
    selector: SYS_SELECTORS.VERIFY,
    handler: handleVERIFY
  });

  // XVAL
  registerModule({
    creatorPkHash: SYS_CREATOR_PKHASH,
    moduleId: SYS_MODULE_ID,
    selector: SYS_SELECTORS.XVAL,
    handler: handleXVAL
  });
}
