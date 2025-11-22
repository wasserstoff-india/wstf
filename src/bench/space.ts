/**
 * Space/Bloat Estimation Utilities
 *
 * Estimates memory usage and storage costs for:
 * - Token deployments and state
 * - Variable store records
 * - Namespace ACLs
 */

import { TokenId, TokenType, FungibleToken, NFTCollection, SFTCollection } from '../tokens/types';
import { VarValueType, VarNamespace, NamespaceType } from '../vars/types';

// ============================================================================
// Size Constants (in bytes)
// ============================================================================

/** Base overhead for JavaScript object */
const JS_OBJECT_OVERHEAD = 56;

/** Base overhead for Map entry */
const MAP_ENTRY_OVERHEAD = 32;

/** BigInt size per value */
const BIGINT_SIZE = 16;

/** String size per character (UTF-16) */
const STRING_CHAR_SIZE = 2;

/** Base string overhead */
const STRING_OVERHEAD = 32;

// ============================================================================
// Token Size Estimation
// ============================================================================

export interface TokenSizeEstimate {
  /** Total estimated size in bytes */
  totalBytes: number;
  /** Breakdown by component */
  breakdown: {
    tokenRecord: number;
    balanceRecords: number;
    allowanceRecords: number;
    instanceRecords?: number;
    classRecords?: number;
  };
  /** Monthly storage cost estimate (in hypothetical units) */
  monthlyCostEstimate: number;
}

export interface TokenSizeParams {
  type: TokenType;
  /** Number of unique holders */
  holderCount: number;
  /** Number of allowances (FT) */
  allowanceCount?: number;
  /** Number of NFT instances */
  instanceCount?: number;
  /** Number of SFT classes */
  classCount?: number;
  /** Average metadata size in bytes */
  avgMetadataSize?: number;
}

function estimateStringSize(s: string | undefined): number {
  if (!s) return 0;
  return STRING_OVERHEAD + s.length * STRING_CHAR_SIZE;
}

function estimateFTRecordSize(): number {
  // tokenId, type, standard, name, symbol, decimals, totalSupply, maxSupply,
  // creator, owner, mintable, burnable, paused, createdAt, version, metadata
  return JS_OBJECT_OVERHEAD +
    estimateStringSize('tok_1234567890123456') + // tokenId
    4 + // type enum
    estimateStringSize('WSTF-FT-V1') + // standard
    estimateStringSize('Token Name Here') + // name (avg)
    estimateStringSize('SYMBOL') + // symbol
    8 + // decimals
    BIGINT_SIZE * 4 + // totalSupply, maxSupply, createdAt, version
    estimateStringSize('0x' + '0'.repeat(40)) * 2 + // creator, owner
    3; // mintable, burnable, paused (booleans)
}

function estimateNFTRecordSize(): number {
  return estimateFTRecordSize() +
    estimateStringSize('https://example.com/metadata/') + // baseUri
    4 + // royaltyBps
    estimateStringSize('0x' + '0'.repeat(40)); // royaltyReceiver
}

function estimateSFTRecordSize(): number {
  return estimateFTRecordSize() +
    estimateStringSize('https://example.com/metadata/'); // baseUri
}

function estimateFTBalanceSize(): number {
  return JS_OBJECT_OVERHEAD +
    estimateStringSize('tok_1234567890123456') + // tokenId
    estimateStringSize('0x' + '0'.repeat(40)) + // holder
    BIGINT_SIZE * 3; // balance, locked, version
}

function estimateFTAllowanceSize(): number {
  return JS_OBJECT_OVERHEAD +
    estimateStringSize('tok_1234567890123456') + // tokenId
    estimateStringSize('0x' + '0'.repeat(40)) * 2 + // owner, spender
    BIGINT_SIZE * 3; // amount, expiresAt, version
}

function estimateNFTInstanceSize(metadataSize: number): number {
  return JS_OBJECT_OVERHEAD +
    estimateStringSize('tok_1234567890123456') + // tokenId
    estimateStringSize('inst_1234567890123456') + // instanceId
    estimateStringSize('0x' + '0'.repeat(40)) * 2 + // owner, mintedBy
    estimateStringSize('https://example.com/nft/1') + // tokenUri
    BIGINT_SIZE * 2 + // mintedAt, version
    1 + // locked
    metadataSize;
}

function estimateSFTClassSize(metadataSize: number): number {
  return JS_OBJECT_OVERHEAD +
    estimateStringSize('tok_1234567890123456') + // tokenId
    estimateStringSize('cls_1234567890123456') + // classId
    estimateStringSize('Class Name') + // name
    BIGINT_SIZE * 3 + // totalSupply, maxSupply, createdAt, version
    1 + // fungible
    metadataSize;
}

function estimateSFTBalanceSize(): number {
  return JS_OBJECT_OVERHEAD +
    estimateStringSize('tok_1234567890123456') + // tokenId
    estimateStringSize('cls_1234567890123456') + // classId
    estimateStringSize('0x' + '0'.repeat(40)) + // holder
    BIGINT_SIZE * 3; // balance, locked, version
}

export function estimateTokenSize(params: TokenSizeParams): TokenSizeEstimate {
  const avgMetadata = params.avgMetadataSize ?? 256;

  let tokenRecord: number;
  let balanceRecords: number;
  let allowanceRecords = 0;
  let instanceRecords = 0;
  let classRecords = 0;

  switch (params.type) {
    case 'FT':
      tokenRecord = estimateFTRecordSize() + avgMetadata;
      balanceRecords = params.holderCount * (estimateFTBalanceSize() + MAP_ENTRY_OVERHEAD);
      allowanceRecords = (params.allowanceCount ?? 0) * (estimateFTAllowanceSize() + MAP_ENTRY_OVERHEAD);
      break;

    case 'NFT':
      tokenRecord = estimateNFTRecordSize() + avgMetadata;
      balanceRecords = 0; // NFT doesn't use balance records
      instanceRecords = (params.instanceCount ?? 0) * (estimateNFTInstanceSize(avgMetadata) + MAP_ENTRY_OVERHEAD);
      break;

    case 'SFT':
      tokenRecord = estimateSFTRecordSize() + avgMetadata;
      classRecords = (params.classCount ?? 1) * (estimateSFTClassSize(avgMetadata) + MAP_ENTRY_OVERHEAD);
      balanceRecords = params.holderCount * (params.classCount ?? 1) * (estimateSFTBalanceSize() + MAP_ENTRY_OVERHEAD);
      break;
  }

  const totalBytes = tokenRecord + balanceRecords + allowanceRecords + instanceRecords + classRecords;

  // Estimate monthly cost: 0.01 units per KB per month
  const monthlyCostEstimate = (totalBytes / 1024) * 0.01;

  return {
    totalBytes,
    breakdown: {
      tokenRecord,
      balanceRecords,
      allowanceRecords,
      instanceRecords: instanceRecords || undefined,
      classRecords: classRecords || undefined,
    },
    monthlyCostEstimate,
  };
}

// ============================================================================
// Variable Store Size Estimation
// ============================================================================

export interface VarSizeEstimate {
  /** Total estimated size in bytes */
  totalBytes: number;
  /** Breakdown by component */
  breakdown: {
    namespaceACL: number;
    variableRecords: number;
  };
  /** Monthly storage cost estimate */
  monthlyCostEstimate: number;
}

export interface VarSizeParams {
  /** Number of variables */
  variableCount: number;
  /** Average value size in bytes */
  avgValueSize: number;
  /** Average key length */
  avgKeyLength?: number;
  /** Number of permission grants */
  grantCount?: number;
  /** Average tag count per variable */
  avgTagCount?: number;
}

function estimateVarRecordSize(keyLength: number, valueSize: number, tagCount: number): number {
  return JS_OBJECT_OVERHEAD +
    estimateStringSize('ns:' + 'x'.repeat(44)) + // namespace
    STRING_OVERHEAD + keyLength * STRING_CHAR_SIZE + // key
    valueSize + // value buffer
    estimateStringSize('string') + // type
    BIGINT_SIZE * 3 + // createdAt, updatedAt, version
    estimateStringSize('0x' + '0'.repeat(40)) + // createdBy
    estimateStringSize('description text') + // description
    tagCount * estimateStringSize('tag_name'); // tags
}

function estimateNamespaceACLSize(grantCount: number): number {
  const baseSize = JS_OBJECT_OVERHEAD +
    estimateStringSize('0x' + '0'.repeat(40)) + // owner
    8; // publicReadable + default permissions

  const grantsSize = grantCount * (
    JS_OBJECT_OVERHEAD +
    estimateStringSize('0x' + '0'.repeat(40)) + // grantee
    estimateStringSize('address') + // granteeType
    8 + // permissions object
    BIGINT_SIZE // expiresAt
  );

  return baseSize + grantsSize;
}

export function estimateVarSize(params: VarSizeParams): VarSizeEstimate {
  const avgKeyLength = params.avgKeyLength ?? 20;
  const avgTagCount = params.avgTagCount ?? 2;
  const grantCount = params.grantCount ?? 3;

  const variableRecords = params.variableCount * (
    estimateVarRecordSize(avgKeyLength, params.avgValueSize, avgTagCount) +
    MAP_ENTRY_OVERHEAD
  );

  const namespaceACL = estimateNamespaceACLSize(grantCount);

  const totalBytes = namespaceACL + variableRecords;
  const monthlyCostEstimate = (totalBytes / 1024) * 0.01;

  return {
    totalBytes,
    breakdown: {
      namespaceACL,
      variableRecords,
    },
    monthlyCostEstimate,
  };
}

// ============================================================================
// Bloat Analysis
// ============================================================================

export interface BloatAnalysis {
  /** Current estimated size */
  currentSize: number;
  /** Projected size at growth rate */
  projectedSize1Month: number;
  projectedSize1Year: number;
  /** Warning thresholds */
  warnings: string[];
  /** Recommendations */
  recommendations: string[];
}

export interface BloatParams {
  /** Current variable count */
  currentVarCount: number;
  /** Current token count */
  currentTokenCount: number;
  /** Current total holders across all tokens */
  currentHolderCount: number;
  /** Daily growth rate for variables (e.g., 0.05 = 5%) */
  varGrowthRateDaily: number;
  /** Daily growth rate for token holders */
  holderGrowthRateDaily: number;
  /** Average variable value size */
  avgVarValueSize?: number;
}

export function analyzeBloat(params: BloatParams): BloatAnalysis {
  const avgValueSize = params.avgVarValueSize ?? 256;

  // Current size - variables + (per-token state * token count)
  const varEstimate = estimateVarSize({
    variableCount: params.currentVarCount,
    avgValueSize,
  });

  const tokenEstimate = estimateTokenSize({
    type: 'FT',
    holderCount: params.currentHolderCount,
    allowanceCount: Math.floor(params.currentHolderCount * 0.1),
  });

  const currentSize = varEstimate.totalBytes + tokenEstimate.totalBytes * params.currentTokenCount;

  // Project growth
  const varGrowth1Month = Math.pow(1 + params.varGrowthRateDaily, 30);
  const varGrowth1Year = Math.pow(1 + params.varGrowthRateDaily, 365);
  const holderGrowth1Month = Math.pow(1 + params.holderGrowthRateDaily, 30);
  const holderGrowth1Year = Math.pow(1 + params.holderGrowthRateDaily, 365);

  const projectedVars1Month = params.currentVarCount * varGrowth1Month;
  const projectedHolders1Month = params.currentHolderCount * holderGrowth1Month;
  const projectedVars1Year = params.currentVarCount * varGrowth1Year;
  const projectedHolders1Year = params.currentHolderCount * holderGrowth1Year;

  const projected1Month = estimateVarSize({
    variableCount: Math.floor(projectedVars1Month),
    avgValueSize,
  }).totalBytes + estimateTokenSize({
    type: 'FT',
    holderCount: Math.floor(projectedHolders1Month),
    allowanceCount: Math.floor(projectedHolders1Month * 0.1),
  }).totalBytes * params.currentTokenCount;

  const projected1Year = estimateVarSize({
    variableCount: Math.floor(projectedVars1Year),
    avgValueSize,
  }).totalBytes + estimateTokenSize({
    type: 'FT',
    holderCount: Math.floor(projectedHolders1Year),
    allowanceCount: Math.floor(projectedHolders1Year * 0.1),
  }).totalBytes * params.currentTokenCount;

  const warnings: string[] = [];
  const recommendations: string[] = [];

  // Check for potential issues
  const sizeInMB = currentSize / (1024 * 1024);
  const projected1YearMB = projected1Year / (1024 * 1024);

  if (sizeInMB > 100) {
    warnings.push(`Current state size (${sizeInMB.toFixed(1)}MB) exceeds 100MB threshold`);
  }

  if (projected1YearMB > 1000) {
    warnings.push(`Projected 1-year size (${projected1YearMB.toFixed(1)}MB) exceeds 1GB`);
    recommendations.push('Consider implementing state pruning for inactive variables');
    recommendations.push('Implement archive storage for historical token states');
  }

  if (params.varGrowthRateDaily > 0.1) {
    warnings.push(`High variable growth rate (${(params.varGrowthRateDaily * 100).toFixed(1)}%/day)`);
    recommendations.push('Review variable creation patterns for abuse');
  }

  if (params.currentVarCount > 10000 && avgValueSize > 1024) {
    recommendations.push('Consider compression for large variable values');
  }

  if (warnings.length === 0) {
    recommendations.push('State size is within acceptable limits');
  }

  return {
    currentSize,
    projectedSize1Month: Math.floor(projected1Month),
    projectedSize1Year: Math.floor(projected1Year),
    warnings,
    recommendations,
  };
}

// ============================================================================
// Formatting Utilities
// ============================================================================

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function formatSpaceReport(
  tokenEstimate: TokenSizeEstimate,
  varEstimate: VarSizeEstimate,
  bloatAnalysis?: BloatAnalysis
): string {
  const lines: string[] = [];

  lines.push('═══════════════════════════════════════════════════════════════════════════');
  lines.push('                        SPACE ESTIMATION REPORT                            ');
  lines.push('═══════════════════════════════════════════════════════════════════════════');
  lines.push('');

  lines.push('Token Storage:');
  lines.push(`  Token record:        ${formatBytes(tokenEstimate.breakdown.tokenRecord)}`);
  lines.push(`  Balance records:     ${formatBytes(tokenEstimate.breakdown.balanceRecords)}`);
  if (tokenEstimate.breakdown.allowanceRecords) {
    lines.push(`  Allowance records:   ${formatBytes(tokenEstimate.breakdown.allowanceRecords)}`);
  }
  if (tokenEstimate.breakdown.instanceRecords) {
    lines.push(`  NFT instances:       ${formatBytes(tokenEstimate.breakdown.instanceRecords)}`);
  }
  if (tokenEstimate.breakdown.classRecords) {
    lines.push(`  SFT classes:         ${formatBytes(tokenEstimate.breakdown.classRecords)}`);
  }
  lines.push(`  TOTAL:               ${formatBytes(tokenEstimate.totalBytes)}`);
  lines.push(`  Monthly cost:        ${tokenEstimate.monthlyCostEstimate.toFixed(4)} units`);
  lines.push('');

  lines.push('Variable Storage:');
  lines.push(`  Namespace ACL:       ${formatBytes(varEstimate.breakdown.namespaceACL)}`);
  lines.push(`  Variable records:    ${formatBytes(varEstimate.breakdown.variableRecords)}`);
  lines.push(`  TOTAL:               ${formatBytes(varEstimate.totalBytes)}`);
  lines.push(`  Monthly cost:        ${varEstimate.monthlyCostEstimate.toFixed(4)} units`);
  lines.push('');

  if (bloatAnalysis) {
    lines.push('Bloat Analysis:');
    lines.push(`  Current size:        ${formatBytes(bloatAnalysis.currentSize)}`);
    lines.push(`  Projected (1 month): ${formatBytes(bloatAnalysis.projectedSize1Month)}`);
    lines.push(`  Projected (1 year):  ${formatBytes(bloatAnalysis.projectedSize1Year)}`);
    lines.push('');

    if (bloatAnalysis.warnings.length > 0) {
      lines.push('Warnings:');
      for (const warning of bloatAnalysis.warnings) {
        lines.push(`  ⚠ ${warning}`);
      }
      lines.push('');
    }

    lines.push('Recommendations:');
    for (const rec of bloatAnalysis.recommendations) {
      lines.push(`  • ${rec}`);
    }
  }

  return lines.join('\n');
}
