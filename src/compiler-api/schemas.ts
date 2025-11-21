/**
 * Canonical CBOR Schemas for system instructions
 */
import { SchemaDefinition } from './types';

/**
 * System schemas
 */
export const SYSTEM_SCHEMAS: Map<string, SchemaDefinition> = new Map([
  ['SYS.REG@v1', {
    id: 'SYS.REG@v1',
    version: 1,
    cborTag: 100,
    description: 'Register a new address with signature algorithm',
    fields: [
      { name: 'address', type: 'bytes', required: true, description: 'Raw address payload (22 bytes)' },
      { name: 'publicKey', type: 'bytes', required: true, description: 'Public key in DER format' },
      { name: 'sigAlg', type: 'u64', required: true, description: 'Signature algorithm ID' },
      { name: 'mappingAlg', type: 'u64', required: true, description: 'Address mapping algorithm ID' },
    ],
  }],

  ['SYS.INIT@v1', {
    id: 'SYS.INIT@v1',
    version: 1,
    cborTag: 101,
    description: 'Initialize a new state',
    fields: [
      { name: 'stateId', type: 'bytes', required: true, description: 'State ID (32 bytes)' },
      { name: 'owner', type: 'bytes', required: true, description: 'Owner address' },
      { name: 'data', type: 'bytes', required: true, description: 'Initial state data' },
      { name: 'schema', type: 'string', required: false, description: 'Schema reference' },
    ],
  }],

  ['SYS.UPDATE@v1', {
    id: 'SYS.UPDATE@v1',
    version: 1,
    cborTag: 102,
    description: 'Update existing state',
    fields: [
      { name: 'stateId', type: 'bytes', required: true, description: 'State ID to update' },
      { name: 'expectedVersion', type: 'bytes', required: true, description: 'Expected version for OCC' },
      { name: 'patch', type: 'struct', required: true, description: 'Patch operation', nested: [
        { name: 'op', type: 'string', required: true, description: 'Operation: put|merge|delete' },
        { name: 'kv', type: 'array', required: false, description: 'Key-value pairs' },
      ]},
      { name: 'lockWrites', type: 'bool', required: false, description: 'Lock state for exclusive write' },
    ],
  }],

  ['SYS.VERIFY@v1', {
    id: 'SYS.VERIFY@v1',
    version: 1,
    cborTag: 103,
    description: 'Verify a signature',
    fields: [
      { name: 'digest', type: 'bytes', required: true, description: 'Message digest (32 bytes)' },
      { name: 'signature', type: 'bytes', required: true, description: 'Signature bytes' },
      { name: 'publicKey', type: 'bytes', required: true, description: 'Public key in DER format' },
      { name: 'algo', type: 'string', required: true, description: 'Algorithm: ed25519|secp256k1' },
    ],
  }],

  ['SYS.SIGN@v1', {
    id: 'SYS.SIGN@v1',
    version: 1,
    cborTag: 104,
    description: 'Record a signature event',
    fields: [
      { name: 'digest', type: 'bytes', required: true, description: 'Message digest' },
      { name: 'signer', type: 'bytes', required: true, description: 'Signer address' },
    ],
  }],

  ['SYS.TRANSFER@v1', {
    id: 'SYS.TRANSFER@v1',
    version: 1,
    cborTag: 105,
    description: 'Transfer balance between addresses',
    fields: [
      { name: 'from', type: 'bytes', required: true, description: 'Source address' },
      { name: 'to', type: 'bytes', required: true, description: 'Destination address' },
      { name: 'amount', type: 'u64', required: true, description: 'Amount to transfer' },
    ],
  }],

  ['SYS.GAS@v1', {
    id: 'SYS.GAS@v1',
    version: 1,
    cborTag: 106,
    description: 'Gas schedule state',
    fields: [
      { name: 'base', type: 'u64', required: true, description: 'Base gas cost' },
      { name: 'perByte', type: 'u64', required: true, description: 'Gas per byte' },
      { name: 'ops', type: 'map', required: true, description: 'Per-operation gas costs' },
    ],
  }],

  ['SYS.RENT@v1', {
    id: 'SYS.RENT@v1',
    version: 1,
    cborTag: 107,
    description: 'Rent record for storage economy',
    fields: [
      { name: 'stateId', type: 'bytes', required: true, description: 'State ID' },
      { name: 'payer', type: 'bytes', required: true, description: 'Rent payer address' },
      { name: 'perBlock', type: 'u64', required: true, description: 'Rent per block' },
      { name: 'active', type: 'bool', required: true, description: 'Is rent active' },
    ],
  }],
]);

/**
 * Get schema by ID
 */
export function getSchema(id: string): SchemaDefinition | null {
  return SYSTEM_SCHEMAS.get(id) || null;
}

/**
 * List all schema IDs
 */
export function listSchemas(): string[] {
  return Array.from(SYSTEM_SCHEMAS.keys());
}

/**
 * Validate data against schema
 */
export function validateAgainstSchema(schemaId: string, data: any): { valid: boolean; errors: string[] } {
  const schema = SYSTEM_SCHEMAS.get(schemaId);
  if (!schema) {
    return { valid: false, errors: [`Schema not found: ${schemaId}`] };
  }

  const errors: string[] = [];

  for (const field of schema.fields) {
    if (field.required && !(field.name in data)) {
      errors.push(`Missing required field: ${field.name}`);
    }
  }

  return { valid: errors.length === 0, errors };
}
