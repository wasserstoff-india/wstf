import { registerModule } from '../engine';
import { SYS_CREATOR_PKHASH, SYS_MODULE_ID, SYS_SELECTORS } from '../../instructions/opcodes';
import {
  handleREG,
  handleINIT,
  handleRENT,
  handleUPDATE,
  handleSIGN,
  handleVERIFY,
  handleXVAL,
  // M6: Event & Instruction Runner handlers
  handleEVENT,
  handleCALL_LOCAL,
  handleCALL_RESULT,
} from './sys';
import {
  // M7: Program Registry handlers
  handlePROG_REGISTER,
  handlePROG_UPDATE,
  handlePROG_QUERY,
  handlePROG_CHECK_ACCESS,
  handlePROG_RECORD_CALL,
} from './sys-prog';

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

  // M6: Event & Instruction Runner opcodes

  // EVENT - Emit event log
  registerModule({
    creatorPkHash: SYS_CREATOR_PKHASH,
    moduleId: SYS_MODULE_ID,
    selector: SYS_SELECTORS.EVENT,
    handler: handleEVENT
  });

  // CALL_LOCAL - Request local program execution
  registerModule({
    creatorPkHash: SYS_CREATOR_PKHASH,
    moduleId: SYS_MODULE_ID,
    selector: SYS_SELECTORS.CALL_LOCAL,
    handler: handleCALL_LOCAL
  });

  // CALL_RESULT - Log result of local execution
  registerModule({
    creatorPkHash: SYS_CREATOR_PKHASH,
    moduleId: SYS_MODULE_ID,
    selector: SYS_SELECTORS.CALL_RESULT,
    handler: handleCALL_RESULT
  });

  // M7: Program Registry opcodes

  // PROG_REGISTER - Register a new program
  registerModule({
    creatorPkHash: SYS_CREATOR_PKHASH,
    moduleId: SYS_MODULE_ID,
    selector: SYS_SELECTORS.PROG_REGISTER,
    handler: handlePROG_REGISTER
  });

  // PROG_UPDATE - Update program metadata/policy
  registerModule({
    creatorPkHash: SYS_CREATOR_PKHASH,
    moduleId: SYS_MODULE_ID,
    selector: SYS_SELECTORS.PROG_UPDATE,
    handler: handlePROG_UPDATE
  });

  // PROG_QUERY - Query program registration
  registerModule({
    creatorPkHash: SYS_CREATOR_PKHASH,
    moduleId: SYS_MODULE_ID,
    selector: SYS_SELECTORS.PROG_QUERY,
    handler: handlePROG_QUERY
  });

  // PROG_CHECK_ACCESS - Check caller access
  registerModule({
    creatorPkHash: SYS_CREATOR_PKHASH,
    moduleId: SYS_MODULE_ID,
    selector: SYS_SELECTORS.PROG_CHECK_ACCESS,
    handler: handlePROG_CHECK_ACCESS
  });

  // PROG_RECORD_CALL - Record program call stats
  registerModule({
    creatorPkHash: SYS_CREATOR_PKHASH,
    moduleId: SYS_MODULE_ID,
    selector: SYS_SELECTORS.PROG_RECORD_CALL,
    handler: handlePROG_RECORD_CALL
  });
}
