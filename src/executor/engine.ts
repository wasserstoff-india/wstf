import { decodeProgram } from '../instructions/abi';
import {
  ExecutionContext,
  ExecutionEffects,
  ModuleRegistration,
  ExecLog,
  PendingEventLog,
} from './types';
import { validateReads, checkAuthority } from './authority';

/**
 * Module registry (maps selector to handler)
 */
const moduleRegistry = new Map<string, ModuleRegistration>();

/**
 * Register a module handler
 */
export function registerModule(registration: ModuleRegistration): void {
  const key = `${registration.creatorPkHash.toString('hex')}-${registration.moduleId.toString('hex')}-${registration.selector}`;
  moduleRegistry.set(key, registration);
}

/**
 * Get module handler
 */
export function getModuleHandler(
  creatorPkHash: Buffer,
  moduleId: Buffer,
  selector: number
): ModuleRegistration | undefined {
  const key = `${creatorPkHash.toString('hex')}-${moduleId.toString('hex')}-${selector}`;
  return moduleRegistry.get(key);
}

/**
 * Main execution engine
 * Pure function: same inputs -> same outputs
 */
export async function executeProgram(
  ctx: ExecutionContext
): Promise<ExecutionEffects> {
  const effects: ExecutionEffects = {
    writes: [],
    logs: [],
    eventLogs: [],
    success: false,
  };

  try {
    // Step 1: Validate reads (optimistic concurrency)
    const readsCheck = await validateReads(ctx);
    if (!readsCheck.valid) {
      effects.error = readsCheck.reason;
      effects.logs.push({
        level: 'error',
        message: 'Read validation failed',
        data: { reason: readsCheck.reason }
      });
      return effects;
    }

    // Step 2: Decode program
    const irs = decodeProgram(ctx.program);

    // Step 3: Execute each instruction
    for (let i = 0; i < irs.length; i++) {
      const ir = irs[i];

      effects.logs.push({
        level: 'info',
        message: `Executing instruction ${i}`,
        data: { selector: ir.selector4.toString(16) }
      });

      // Find handler
      const registration = getModuleHandler(
        ir.creatorPkHash20,
        ir.moduleId16,
        ir.selector4
      );

      if (!registration) {
        effects.error = `No handler for instruction ${i}: selector 0x${ir.selector4.toString(16)}`;
        effects.logs.push({
          level: 'error',
          message: effects.error
        });
        return effects;
      }

      // Execute handler
      try {
        await registration.handler(ir, ctx, effects);
      } catch (err: any) {
        effects.error = `Instruction ${i} failed: ${err.message}`;
        effects.logs.push({
          level: 'error',
          message: effects.error,
          data: { error: err.message, stack: err.stack }
        });
        return effects;
      }
    }

    // Step 4: Success
    effects.success = true;
    effects.logs.push({
      level: 'info',
      message: `Program executed successfully: ${irs.length} instructions, ${effects.writes.length} writes`
    });

  } catch (err: any) {
    effects.error = `Execution failed: ${err.message}`;
    effects.logs.push({
      level: 'error',
      message: effects.error,
      data: { error: err.message, stack: err.stack }
    });
  }

  return effects;
}

/**
 * Helper to add a log entry
 */
export function addLog(
  effects: ExecutionEffects,
  level: 'info' | 'warning' | 'error',
  message: string,
  data?: any
): void {
  effects.logs.push({ level, message, data });
}

/**
 * Helper to add an event log
 */
export function addEventLog(
  effects: ExecutionEffects,
  event: PendingEventLog
): void {
  effects.eventLogs.push(event);
}
