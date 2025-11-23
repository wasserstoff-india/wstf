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
import {
  // M8: Org/RBAC handlers
  handleORG_CREATE,
  handleORG_UPDATE,
  handleORG_ROLE_CREATE,
  handleORG_ROLE_UPDATE,
  handleORG_UNIT_CREATE,
  handleORG_UNIT_UPDATE,
  handleORG_MEMBER_ADD,
  handleORG_MEMBER_UPDATE,
  handleORG_MEMBER_REMOVE,
  handleORG_CHECK_PERM,
} from './sys-org';
import {
  // M8: Approval handlers
  handleAPPROVAL_POLICY_CREATE,
  handleAPPROVAL_POLICY_UPDATE,
  handleAPPROVAL_REQUEST,
  handleAPPROVAL_SIGN,
  handleAPPROVAL_REJECT,
  handleAPPROVAL_CANCEL,
  handleAPPROVAL_EXECUTE,
} from './sys-approval';
import { registerMarketModules } from './sys-market';

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

  // M8: Org/RBAC opcodes

  // ORG_CREATE - Create organization
  registerModule({
    creatorPkHash: SYS_CREATOR_PKHASH,
    moduleId: SYS_MODULE_ID,
    selector: SYS_SELECTORS.ORG_CREATE,
    handler: handleORG_CREATE
  });

  // ORG_UPDATE - Update organization
  registerModule({
    creatorPkHash: SYS_CREATOR_PKHASH,
    moduleId: SYS_MODULE_ID,
    selector: SYS_SELECTORS.ORG_UPDATE,
    handler: handleORG_UPDATE
  });

  // ORG_ROLE_CREATE - Create role in org
  registerModule({
    creatorPkHash: SYS_CREATOR_PKHASH,
    moduleId: SYS_MODULE_ID,
    selector: SYS_SELECTORS.ORG_ROLE_CREATE,
    handler: handleORG_ROLE_CREATE
  });

  // ORG_ROLE_UPDATE - Update role
  registerModule({
    creatorPkHash: SYS_CREATOR_PKHASH,
    moduleId: SYS_MODULE_ID,
    selector: SYS_SELECTORS.ORG_ROLE_UPDATE,
    handler: handleORG_ROLE_UPDATE
  });

  // ORG_UNIT_CREATE - Create org unit
  registerModule({
    creatorPkHash: SYS_CREATOR_PKHASH,
    moduleId: SYS_MODULE_ID,
    selector: SYS_SELECTORS.ORG_UNIT_CREATE,
    handler: handleORG_UNIT_CREATE
  });

  // ORG_UNIT_UPDATE - Update org unit
  registerModule({
    creatorPkHash: SYS_CREATOR_PKHASH,
    moduleId: SYS_MODULE_ID,
    selector: SYS_SELECTORS.ORG_UNIT_UPDATE,
    handler: handleORG_UNIT_UPDATE
  });

  // ORG_MEMBER_ADD - Add member to org
  registerModule({
    creatorPkHash: SYS_CREATOR_PKHASH,
    moduleId: SYS_MODULE_ID,
    selector: SYS_SELECTORS.ORG_MEMBER_ADD,
    handler: handleORG_MEMBER_ADD
  });

  // ORG_MEMBER_UPDATE - Update member roles
  registerModule({
    creatorPkHash: SYS_CREATOR_PKHASH,
    moduleId: SYS_MODULE_ID,
    selector: SYS_SELECTORS.ORG_MEMBER_UPDATE,
    handler: handleORG_MEMBER_UPDATE
  });

  // ORG_MEMBER_REMOVE - Remove member from org
  registerModule({
    creatorPkHash: SYS_CREATOR_PKHASH,
    moduleId: SYS_MODULE_ID,
    selector: SYS_SELECTORS.ORG_MEMBER_REMOVE,
    handler: handleORG_MEMBER_REMOVE
  });

  // ORG_CHECK_PERM - Check permission
  registerModule({
    creatorPkHash: SYS_CREATOR_PKHASH,
    moduleId: SYS_MODULE_ID,
    selector: SYS_SELECTORS.ORG_CHECK_PERM,
    handler: handleORG_CHECK_PERM
  });

  // M8: Approval opcodes

  // APPROVAL_POLICY_CREATE - Create approval policy
  registerModule({
    creatorPkHash: SYS_CREATOR_PKHASH,
    moduleId: SYS_MODULE_ID,
    selector: SYS_SELECTORS.APPROVAL_POLICY_CREATE,
    handler: handleAPPROVAL_POLICY_CREATE
  });

  // APPROVAL_POLICY_UPDATE - Update approval policy
  registerModule({
    creatorPkHash: SYS_CREATOR_PKHASH,
    moduleId: SYS_MODULE_ID,
    selector: SYS_SELECTORS.APPROVAL_POLICY_UPDATE,
    handler: handleAPPROVAL_POLICY_UPDATE
  });

  // APPROVAL_REQUEST - Create approval request
  registerModule({
    creatorPkHash: SYS_CREATOR_PKHASH,
    moduleId: SYS_MODULE_ID,
    selector: SYS_SELECTORS.APPROVAL_REQUEST,
    handler: handleAPPROVAL_REQUEST
  });

  // APPROVAL_SIGN - Sign approval
  registerModule({
    creatorPkHash: SYS_CREATOR_PKHASH,
    moduleId: SYS_MODULE_ID,
    selector: SYS_SELECTORS.APPROVAL_SIGN,
    handler: handleAPPROVAL_SIGN
  });

  // APPROVAL_REJECT - Reject approval
  registerModule({
    creatorPkHash: SYS_CREATOR_PKHASH,
    moduleId: SYS_MODULE_ID,
    selector: SYS_SELECTORS.APPROVAL_REJECT,
    handler: handleAPPROVAL_REJECT
  });

  // APPROVAL_CANCEL - Cancel approval
  registerModule({
    creatorPkHash: SYS_CREATOR_PKHASH,
    moduleId: SYS_MODULE_ID,
    selector: SYS_SELECTORS.APPROVAL_CANCEL,
    handler: handleAPPROVAL_CANCEL
  });

  // APPROVAL_EXECUTE - Execute approved action
  registerModule({
    creatorPkHash: SYS_CREATOR_PKHASH,
    moduleId: SYS_MODULE_ID,
    selector: SYS_SELECTORS.APPROVAL_EXECUTE,
    handler: handleAPPROVAL_EXECUTE
  });

  // Market/Orderbook modules
  registerMarketModules();
}
