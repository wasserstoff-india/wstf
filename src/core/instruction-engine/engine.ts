/**
 * Instruction Execution Engine
 *
 * Core engine that processes bridge instructions on WSTFChain.
 * This is the "brain" that actually executes the deterministic logic.
 */

import {
  Instruction,
  InstructionContext,
  InstructionResult,
  Event
} from '../types/instruction';
import { XChainOpcode, executeXChainInstruction } from '../../instructions/xchain/opcodes';
import { BridgeRoute, BridgeRequest } from '../../instructions/xchain/types';

/**
 * Instruction execution context
 */
export interface ExecutionContext extends InstructionContext {
  blockHeight: bigint;
  blockTime: bigint;
  chainId: string;
  gasLimit: bigint;
  gasUsed: bigint;
}

/**
 * Instruction validation result
 */
export interface ValidationResult {
  valid: boolean;
  errors: string[];
  gasEstimate?: bigint;
}

/**
 * State change from instruction execution
 */
export interface StateChange {
  key: string;
  oldValue?: any;
  newValue: any;
  operation: 'create' | 'update' | 'delete';
}

/**
 * Instruction execution result with state changes
 */
export interface ExecutionResult {
  success: boolean;
  error?: string;
  events: Event[];
  stateChanges: StateChange[];
  gasUsed: bigint;
  result?: any;
}

/**
 * Main instruction execution engine
 */
export class InstructionEngine {
  private state: Map<string, any> = new Map();
  private eventLog: Event[] = [];
  private gasTracker: bigint = 0n;

  /**
   * Execute a single instruction
   */
  async executeInstruction(
    instruction: Instruction,
    context: ExecutionContext
  ): Promise<ExecutionResult> {
    try {
      // Reset gas tracker
      this.gasTracker = 0n;
      const initialState = new Map(this.state);

      // Validate instruction
      const validation = await this.validateInstruction(instruction, context);
      if (!validation.valid) {
        return {
          success: false,
          error: `Validation failed: ${validation.errors.join(', ')}`,
          events: [],
          stateChanges: [],
          gasUsed: 50000n // Base gas for failed validation
        };
      }

      // Check gas limit
      if (validation.gasEstimate && validation.gasEstimate > context.gasLimit) {
        return {
          success: false,
          error: 'Insufficient gas limit',
          events: [],
          stateChanges: [],
          gasUsed: 50000n
        };
      }

      // Execute based on instruction type
      let result: InstructionResult;

      if (this.isXChainInstruction(instruction.opcode)) {
        result = executeXChainInstruction(instruction, context);
      } else {
        return {
          success: false,
          error: `Unknown instruction opcode: 0x${instruction.opcode.toString(16)}`,
          events: [],
          stateChanges: [],
          gasUsed: 50000n
        };
      }

      // Process result
      if (!result.success) {
        return {
          success: false,
          error: result.error,
          events: result.events || [],
          stateChanges: [],
          gasUsed: this.gasTracker + 100000n // Gas for failed execution
        };
      }

      // Apply state changes and emit events
      const stateChanges = this.calculateStateChanges(initialState, this.state);

      if (result.events) {
        this.eventLog.push(...result.events);
      }

      return {
        success: true,
        events: result.events || [],
        stateChanges,
        gasUsed: this.gasTracker + 200000n, // Base execution gas
        result: result.result
      };

    } catch (error) {
      return {
        success: false,
        error: `Execution error: ${error instanceof Error ? error.message : String(error)}`,
        events: [],
        stateChanges: [],
        gasUsed: this.gasTracker + 150000n
      };
    }
  }

  /**
   * Validate instruction before execution
   */
  async validateInstruction(
    instruction: Instruction,
    context: ExecutionContext
  ): Promise<ValidationResult> {
    const errors: string[] = [];
    let gasEstimate = 200000n; // Base gas

    // Basic validation
    if (!instruction.opcode) {
      errors.push('Missing opcode');
    }

    if (!instruction.sender) {
      errors.push('Missing sender');
    }

    if (!instruction.data) {
      errors.push('Missing instruction data');
    }

    // Timestamp validation
    const currentTime = Number(context.blockTime);
    const instrTime = instruction.timestamp;

    if (Math.abs(currentTime - instrTime) > 5 * 60 * 1000) { // 5 minutes
      errors.push('Instruction timestamp too old or too far in future');
    }

    // Gas estimation based on instruction type
    if (this.isXChainInstruction(instruction.opcode)) {
      gasEstimate += this.estimateXChainGas(instruction);
    }

    // Custom validation for specific instruction types
    if (instruction.opcode === XChainOpcode.BRIDGE_REQUEST) {
      const bridgeErrors = await this.validateBridgeRequest(instruction);
      errors.push(...bridgeErrors);
      gasEstimate += 300000n; // Bridge requests are expensive
    }

    return {
      valid: errors.length === 0,
      errors,
      gasEstimate
    };
  }

  /**
   * Simulate instruction execution without state changes
   */
  async simulateInstruction(
    instruction: Instruction,
    context: ExecutionContext
  ): Promise<ExecutionResult> {
    // Create a copy of current state
    const originalState = new Map(this.state);
    const originalEventLog = [...this.eventLog];
    const originalGasTracker = this.gasTracker;

    try {
      // Execute instruction
      const result = await this.executeInstruction(instruction, context);

      // Restore original state (simulation doesn't persist)
      this.state = originalState;
      this.eventLog = originalEventLog;
      this.gasTracker = originalGasTracker;

      return {
        ...result,
        // Mark as simulation
        result: {
          ...result.result,
          simulation: true
        }
      };

    } catch (error) {
      // Restore state even on error
      this.state = originalState;
      this.eventLog = originalEventLog;
      this.gasTracker = originalGasTracker;
      throw error;
    }
  }

  /**
   * Batch execute multiple instructions
   */
  async executeBatch(
    instructions: Instruction[],
    context: ExecutionContext
  ): Promise<ExecutionResult[]> {
    const results: ExecutionResult[] = [];
    let totalGasUsed = 0n;

    for (const instruction of instructions) {
      // Update context with cumulative gas
      const instrContext = {
        ...context,
        gasLimit: context.gasLimit - totalGasUsed
      };

      const result = await this.executeInstruction(instruction, instrContext);
      results.push(result);

      totalGasUsed += result.gasUsed;

      // Stop if we hit gas limit or error (depending on batch strategy)
      if (totalGasUsed >= context.gasLimit) {
        break;
      }

      if (!result.success) {
        // Could implement different strategies: stop-on-error vs continue
        break;
      }
    }

    return results;
  }

  /**
   * Get current state value
   */
  getState(key: string): any {
    return this.state.get(key);
  }

  /**
   * Set state value (used by instruction handlers)
   */
  setState(key: string, value: any): void {
    this.state.set(key, value);
    this.gasTracker += 5000n; // Gas cost for state write
  }

  /**
   * Delete state key
   */
  deleteState(key: string): void {
    this.state.delete(key);
    this.gasTracker += 3000n; // Gas cost for state deletion
  }

  /**
   * Get all events since last reset
   */
  getEvents(): Event[] {
    return [...this.eventLog];
  }

  /**
   * Clear event log
   */
  clearEvents(): void {
    this.eventLog = [];
  }

  /**
   * Get current gas usage
   */
  getGasUsed(): bigint {
    return this.gasTracker;
  }

  /**
   * Check if opcode is cross-chain instruction
   */
  private isXChainInstruction(opcode: number): boolean {
    return Object.values(XChainOpcode).includes(opcode);
  }

  /**
   * Estimate gas for cross-chain operations
   */
  private estimateXChainGas(instruction: Instruction): bigint {
    switch (instruction.opcode) {
      case XChainOpcode.BRIDGE_REGISTER_ROUTE:
        return 500000n; // Route registration is expensive
      case XChainOpcode.BRIDGE_REQUEST:
        return 300000n; // Bridge requests need validation
      case XChainOpcode.BRIDGE_RESULT:
        return 200000n; // Result reporting
      case XChainOpcode.BRIDGE_DISPUTE:
        return 400000n; // Disputes require more validation
      default:
        return 150000n; // Default cross-chain gas
    }
  }

  /**
   * Validate bridge request instruction
   */
  private async validateBridgeRequest(instruction: Instruction): Promise<string[]> {
    const errors: string[] = [];

    try {
      const data = instruction.data as any;
      const request = data.request as BridgeRequest;

      // Check if route exists
      const routeKey = `bridge_routes:${request.routeId}`;
      const route = this.getState(routeKey) as BridgeRoute;

      if (!route) {
        errors.push(`Bridge route ${request.routeId} not found`);
      } else {
        // Validate amount constraints
        if (request.amount < route.minAmount) {
          errors.push(`Amount ${request.amount} below minimum ${route.minAmount}`);
        }

        if (request.amount > route.maxAmount) {
          errors.push(`Amount ${request.amount} above maximum ${route.maxAmount}`);
        }

        // Check if route is active
        if (!route.isActive) {
          errors.push(`Route ${request.routeId} is not active`);
        }

        // Validate deadline
        if (request.deadline < Date.now()) {
          errors.push('Bridge request deadline has passed');
        }
      }

    } catch (error) {
      errors.push(`Failed to validate bridge request: ${error instanceof Error ? error.message : String(error)}`);
    }

    return errors;
  }

  /**
   * Calculate state changes between two state snapshots
   */
  private calculateStateChanges(
    oldState: Map<string, any>,
    newState: Map<string, any>
  ): StateChange[] {
    const changes: StateChange[] = [];

    // Check for new and updated keys
    for (const [key, newValue] of newState) {
      const oldValue = oldState.get(key);

      if (!oldState.has(key)) {
        changes.push({
          key,
          newValue,
          operation: 'create'
        });
      } else if (JSON.stringify(oldValue) !== JSON.stringify(newValue)) {
        changes.push({
          key,
          oldValue,
          newValue,
          operation: 'update'
        });
      }
    }

    // Check for deleted keys
    for (const [key, oldValue] of oldState) {
      if (!newState.has(key)) {
        changes.push({
          key,
          oldValue,
          newValue: undefined,
          operation: 'delete'
        });
      }
    }

    return changes;
  }
}

/**
 * Global instruction engine instance
 */
export const instructionEngine = new InstructionEngine();