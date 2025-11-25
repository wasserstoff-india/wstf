/**
 * Cross-Chain Bridge Instruction Opcodes
 *
 * Defines the binary IR opcodes for bridge operations.
 * These get compiled into deterministic instructions that emit events
 * for bridge runners to process off-chain.
 */

import {
  Instruction,
  InstructionOpcode,
  InstructionResult,
  InstructionContext
} from '../types';
import {
  BridgeRoute,
  BridgeRequest,
  BridgeResult,
  RegisterRouteData,
  UpdateRouteData,
  BridgeRequestData,
  BridgeResultData,
  BridgeDisputeData,
  BridgeRequestEvent,
  BridgeResultEvent,
  RouteUpdateEvent,
  generateRequestId,
  validateBridgeRequest,
  BRIDGE_CONFIG
} from './types';

/**
 * Cross-chain bridge instruction opcodes
 */
export enum XChainOpcode {
  BRIDGE_REGISTER_ROUTE = 0x50,    // Register a new bridge route
  BRIDGE_UPDATE_ROUTE = 0x51,      // Update existing route parameters
  BRIDGE_REQUEST = 0x52,           // Request cross-chain bridge
  BRIDGE_RESULT = 0x53,            // Report bridge execution result
  BRIDGE_DISPUTE = 0x54,           // Dispute a bridge result
  BRIDGE_CANCEL = 0x55,            // Cancel pending bridge request
  BRIDGE_PROVIDER_REGISTER = 0x56, // Register as bridge provider
  BRIDGE_PROVIDER_UPDATE = 0x57,   // Update provider information
}

/**
 * Bridge provider registration data
 */
export interface BridgeProviderRegistration {
  provider: string;          // WSTF address
  name: string;             // Provider name
  description: string;      // Provider description
  website?: string;         // Provider website
  supportedChains: string[]; // Chain IDs this provider supports
  minimumStake: bigint;     // Required stake amount
  contactInfo: {
    email?: string;
    telegram?: string;
    discord?: string;
  };
  emergencyContact: string; // Emergency contact address
  slaCommitments: {
    maxConfirmationTime: number; // Seconds
    uptimeGuarantee: number;     // Percentage (95 = 95%)
    refundPolicy: string;        // Description of refund policy
  };
}

/**
 * Execute BRIDGE_REGISTER_ROUTE instruction
 */
export function executeBridgeRegisterRoute(
  instruction: Instruction,
  context: InstructionContext
): InstructionResult {
  try {
    const data = instruction.data as RegisterRouteData;
    const route = data.route;

    // Validate route data
    if (!route.routeId || !route.provider || !route.srcChainId || !route.dstChainId) {
      return {
        success: false,
        error: 'Invalid route data: missing required fields'
      };
    }

    // Validate provider is the instruction sender
    if (route.provider !== context.sender) {
      return {
        success: false,
        error: 'Route provider must match instruction sender'
      };
    }

    // Validate fee is reasonable
    if (route.feeBps > BRIDGE_CONFIG.MAX_FEE_BPS) {
      return {
        success: false,
        error: `Fee exceeds maximum of ${BRIDGE_CONFIG.MAX_FEE_BPS / 100}%`
      };
    }

    // Validate amount constraints
    if (route.minAmount >= route.maxAmount) {
      return {
        success: false,
        error: 'Minimum amount must be less than maximum amount'
      };
    }

    // TODO: Verify provider has minimum stake (check account balance)
    // TODO: Verify signature over route data

    // Store route in state (this would be implemented in your state system)
    // For now, just emit event for indexing
    const routeEvent = {
      module: 'XCHAIN.BRIDGE',
      key: 'ROUTE_REGISTERED',
      topics: [
        route.routeId,
        route.provider,
        route.srcChainId,
        route.dstChainId
      ],
      data: route
    };

    return {
      success: true,
      events: [routeEvent],
      result: {
        routeId: route.routeId,
        provider: route.provider,
        registered: true
      }
    };

  } catch (error) {
    return {
      success: false,
      error: `Bridge route registration failed: ${error}`
    };
  }
}

/**
 * Execute BRIDGE_REQUEST instruction
 */
export function executeBridgeRequest(
  instruction: Instruction,
  context: InstructionContext
): InstructionResult {
  try {
    const data = instruction.data as BridgeRequestData;
    const request = data.request;

    // Validate basic request data
    const validation = validateBridgeRequest(request);
    if (!validation.valid) {
      return {
        success: false,
        error: `Invalid bridge request: ${validation.errors.join(', ')}`
      };
    }

    // Validate sender matches client
    if (request.client !== context.sender) {
      return {
        success: false,
        error: 'Request client must match instruction sender'
      };
    }

    // TODO: Verify route exists and is active
    // TODO: Verify user signature over request data
    // TODO: Check if user has sufficient balance for amount + fees

    // Generate deterministic request ID
    const requestId = generateRequestId(
      request.client,
      request.routeId,
      request.clientNonce,
      BigInt(context.timestamp)
    );

    // Create the bridge request event for bridge runners to pick up
    const requestEvent: BridgeRequestEvent = {
      requestId,
      routeId: request.routeId,
      client: request.client,
      provider: '', // Will be filled from route lookup
      srcChainId: request.srcChainId,
      dstChainId: request.dstChainId,
      amount: request.amount,
      deadline: request.deadline
    };

    const event = {
      module: 'XCHAIN.BRIDGE',
      key: 'BRIDGE_REQUEST',
      topics: [
        requestId,
        request.routeId,
        request.client,
        request.srcChainId
      ],
      data: { ...request, requestId }
    };

    return {
      success: true,
      events: [event],
      result: {
        requestId,
        status: 'pending',
        estimatedConfirmationTime: 300 // 5 minutes default
      }
    };

  } catch (error) {
    return {
      success: false,
      error: `Bridge request failed: ${error}`
    };
  }
}

/**
 * Execute BRIDGE_RESULT instruction
 */
export function executeBridgeResult(
  instruction: Instruction,
  context: InstructionContext
): InstructionResult {
  try {
    const data = instruction.data as BridgeResultData;
    const result = data.result;

    // Validate provider is the instruction sender
    if (result.provider !== context.sender) {
      return {
        success: false,
        error: 'Result provider must match instruction sender'
      };
    }

    // TODO: Verify request exists and provider is authorized for this route
    // TODO: Verify provider signature over result data
    // TODO: For successful results, verify transaction hashes are valid

    const resultEvent: BridgeResultEvent = {
      requestId: result.requestId,
      provider: result.provider,
      status: result.status,
      srcTxHash: result.srcTxHash,
      dstTxHash: result.dstTxHash,
      actualDstAmount: result.actualDstAmount
    };

    const event = {
      module: 'XCHAIN.BRIDGE',
      key: 'BRIDGE_RESULT',
      topics: [
        result.requestId,
        result.provider,
        result.status
      ],
      data: result
    };

    return {
      success: true,
      events: [event],
      result: {
        requestId: result.requestId,
        status: result.status,
        updated: true
      }
    };

  } catch (error) {
    return {
      success: false,
      error: `Bridge result update failed: ${error}`
    };
  }
}

/**
 * Execute BRIDGE_UPDATE_ROUTE instruction
 */
export function executeBridgeUpdateRoute(
  instruction: Instruction,
  context: InstructionContext
): InstructionResult {
  try {
    const data = instruction.data as UpdateRouteData;

    // TODO: Verify route exists and sender owns it
    // TODO: Verify signature over update data
    // TODO: Apply updates to route in state

    const event = {
      module: 'XCHAIN.BRIDGE',
      key: 'ROUTE_UPDATED',
      topics: [
        data.routeId,
        context.sender
      ],
      data: data.updates
    };

    return {
      success: true,
      events: [event],
      result: {
        routeId: data.routeId,
        version: data.newVersion,
        updated: true
      }
    };

  } catch (error) {
    return {
      success: false,
      error: `Route update failed: ${error}`
    };
  }
}

/**
 * Execute BRIDGE_DISPUTE instruction
 */
export function executeBridgeDispute(
  instruction: Instruction,
  context: InstructionContext
): InstructionResult {
  try {
    const data = instruction.data as BridgeDisputeData;

    // TODO: Verify request exists and sender is the original requester
    // TODO: Verify dispute is within dispute window
    // TODO: Validate dispute evidence

    const event = {
      module: 'XCHAIN.BRIDGE',
      key: 'BRIDGE_DISPUTE',
      topics: [
        data.requestId,
        context.sender,
        data.disputeType
      ],
      data: data
    };

    return {
      success: true,
      events: [event],
      result: {
        requestId: data.requestId,
        disputeId: `dispute_${Date.now()}`,
        status: 'under_review'
      }
    };

  } catch (error) {
    return {
      success: false,
      error: `Bridge dispute failed: ${error}`
    };
  }
}

/**
 * Execute BRIDGE_PROVIDER_REGISTER instruction
 */
export function executeBridgeProviderRegister(
  instruction: Instruction,
  context: InstructionContext
): InstructionResult {
  try {
    const data = instruction.data as BridgeProviderRegistration;

    // Validate provider is the instruction sender
    if (data.provider !== context.sender) {
      return {
        success: false,
        error: 'Provider address must match instruction sender'
      };
    }

    // TODO: Verify minimum stake requirement
    // TODO: Validate contact information format
    // TODO: Check if provider is already registered

    const event = {
      module: 'XCHAIN.BRIDGE',
      key: 'PROVIDER_REGISTERED',
      topics: [
        data.provider,
        data.name
      ],
      data: data
    };

    return {
      success: true,
      events: [event],
      result: {
        provider: data.provider,
        registered: true,
        supportedChains: data.supportedChains
      }
    };

  } catch (error) {
    return {
      success: false,
      error: `Provider registration failed: ${error}`
    };
  }
}

/**
 * Main instruction executor for cross-chain bridge operations
 */
export function executeXChainInstruction(
  instruction: Instruction,
  context: InstructionContext
): InstructionResult {
  const opcode = instruction.opcode as XChainOpcode;

  switch (opcode) {
    case XChainOpcode.BRIDGE_REGISTER_ROUTE:
      return executeBridgeRegisterRoute(instruction, context);

    case XChainOpcode.BRIDGE_UPDATE_ROUTE:
      return executeBridgeUpdateRoute(instruction, context);

    case XChainOpcode.BRIDGE_REQUEST:
      return executeBridgeRequest(instruction, context);

    case XChainOpcode.BRIDGE_RESULT:
      return executeBridgeResult(instruction, context);

    case XChainOpcode.BRIDGE_DISPUTE:
      return executeBridgeDispute(instruction, context);

    case XChainOpcode.BRIDGE_PROVIDER_REGISTER:
      return executeBridgeProviderRegister(instruction, context);

    default:
      return {
        success: false,
        error: `Unknown cross-chain bridge opcode: ${opcode}`
      };
  }
}

/**
 * Helper function to compile high-level bridge requests into binary instructions
 */
export function compileBridgeRequest(request: BridgeRequest): Instruction {
  const data: BridgeRequestData = {
    request,
    userSignature: '' // Would be computed by SDK
  };

  return {
    opcode: XChainOpcode.BRIDGE_REQUEST,
    data,
    sender: request.client,
    timestamp: Number(request.createdAt)
  };
}

export function compileBridgeRouteRegistration(route: BridgeRoute): Instruction {
  const data: RegisterRouteData = {
    route,
    signature: '' // Would be computed by SDK
  };

  return {
    opcode: XChainOpcode.BRIDGE_REGISTER_ROUTE,
    data,
    sender: route.provider,
    timestamp: Number(route.createdAt)
  };
}

export function compileBridgeResult(result: BridgeResult): Instruction {
  const data: BridgeResultData = {
    result,
    providerSignature: '' // Would be computed by bridge runner
  };

  return {
    opcode: XChainOpcode.BRIDGE_RESULT,
    data,
    sender: result.provider,
    timestamp: Date.now()
  };
}