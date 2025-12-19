/**
 * Wallet Manager
 *
 * Multi-algorithm wallet management for the browser.
 * Supports Ed25519, secp256k1, and Passkey (WebAuthn) signers.
 */

import type {
  FrontendSigner,
  FrontendSigAlg,
  StoredWalletMeta,
  WalletExportMeta,
  WalletEventHandler,
  WalletEvent,
  RelayTxPayload,
} from './types';
import { StandardMethodId } from './types';
import { hasWebCrypto, hasPasskeySupport, hasIndexedDB } from './config';

// ============================================================
// Constants
// ============================================================

const STORAGE_KEY = 'wstf_wallets';
const WALLET_DB_NAME = 'wstf_wallet_db';
const WALLET_STORE_NAME = 'encrypted_keys';

// ============================================================
// Crypto Utilities
// ============================================================

/**
 * Generate random bytes using WebCrypto
 */
function getRandomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return bytes;
}

/**
 * Derive encryption key from password using PBKDF2
 */
async function deriveKeyFromPassword(
  password: string,
  salt: Uint8Array
): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const passwordKey = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveBits', 'deriveKey']
  );

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations: 100000,
      hash: 'SHA-256',
    },
    passwordKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Encrypt data with AES-GCM
 */
async function encryptData(
  data: Uint8Array,
  key: CryptoKey
): Promise<{ ciphertext: Uint8Array; iv: Uint8Array }> {
  const iv = getRandomBytes(12);
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    data
  );
  return { ciphertext: new Uint8Array(ciphertext), iv };
}

/**
 * Decrypt data with AES-GCM
 */
async function decryptData(
  ciphertext: Uint8Array,
  iv: Uint8Array,
  key: CryptoKey
): Promise<Uint8Array> {
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    ciphertext
  );
  return new Uint8Array(plaintext);
}

/**
 * Convert bytes to hex string
 */
function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Convert hex string to bytes
 */
function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  }
  return bytes;
}

/**
 * Generate unique wallet ID
 */
function generateWalletId(): string {
  return bytesToHex(getRandomBytes(16));
}

// ============================================================
// Address Derivation (matching backend SDK)
// ============================================================

const SIG_ALG_MAP: Record<FrontendSigAlg, number> = {
  ed25519: 0x01,
  secp256k1: 0x02,
  passkey: 0x03, // Reserved for future WebAuthn support
};

const MAPPING_ALG_SIMPLE_HASH = 0x01;
const ADDRESS_PREFIX = 'gc';

/**
 * Derive address from public key (matches backend SDK)
 */
async function deriveAddress(
  publicKey: Uint8Array,
  sigAlg: FrontendSigAlg
): Promise<string> {
  // Hash the public key with SHA-256 and take first 20 bytes
  const hashBuffer = await crypto.subtle.digest('SHA-256', publicKey);
  const pkHash = new Uint8Array(hashBuffer).slice(0, 20);

  // Build 22-byte payload: mappingAlgId (1) + sigAlgId (1) + pkHash (20)
  const payload = new Uint8Array(22);
  payload[0] = MAPPING_ALG_SIMPLE_HASH;
  payload[1] = SIG_ALG_MAP[sigAlg];
  payload.set(pkHash, 2);

  // Base58Check encode with prefix
  // For now, return hex-based address (full Base58Check would need bs58check import)
  const prefixBytes = new TextEncoder().encode(ADDRESS_PREFIX);
  const combined = new Uint8Array(prefixBytes.length + payload.length);
  combined.set(prefixBytes, 0);
  combined.set(payload, prefixBytes.length);

  // Simple base58-like encoding for browser (without checksum for now)
  // In production, use proper bs58check
  return `gc${bytesToHex(payload)}`;
}

// ============================================================
// Hash Configuration for Noble Libraries
// ============================================================

/**
 * Configure Noble libraries with hash functions
 */
async function configureNobleHashes() {
  // Configure ed25519 with hash functions
  const ed25519 = await import('@noble/ed25519');
  if (!ed25519.etc.sha512Sync) {
    const { sha512 } = await import('@noble/hashes/sha512');
    ed25519.etc.sha512Sync = (...messages: Uint8Array[]) => {
      const hasher = sha512.create();
      for (const message of messages) {
        hasher.update(message);
      }
      return hasher.digest();
    };
    ed25519.etc.sha512Async = async (...messages: Uint8Array[]) => {
      return ed25519.etc.sha512Sync(...messages);
    };
  }
}

// ============================================================
// Local Keypair Signer (Ed25519 / secp256k1)
// ============================================================

class LocalKeypairSigner implements FrontendSigner {
  address: string;
  sigAlg: FrontendSigAlg;
  publicKey: Uint8Array;
  private privateKey: Uint8Array;
  private meta: StoredWalletMeta;

  constructor(
    privateKey: Uint8Array,
    publicKey: Uint8Array,
    address: string,
    sigAlg: FrontendSigAlg,
    meta: StoredWalletMeta
  ) {
    this.privateKey = privateKey;
    this.publicKey = publicKey;
    this.address = address;
    this.sigAlg = sigAlg;
    this.meta = meta;
  }

  async sign(data: Uint8Array): Promise<Uint8Array> {
    // Ensure hash functions are configured
    await configureNobleHashes();

    if (this.sigAlg === 'ed25519') {
      // Use @noble/ed25519 for signing
      const { sign } = await import('@noble/ed25519');
      return sign(data, this.privateKey.slice(0, 32));
    } else if (this.sigAlg === 'secp256k1') {
      // Use @noble/secp256k1 for signing
      const { sign } = await import('@noble/secp256k1');
      const signature = sign(data, this.privateKey);
      return signature.toCompactRawBytes();
    }
    throw new Error(`Unsupported signature algorithm: ${this.sigAlg}`);
  }

  async exportMeta(): Promise<WalletExportMeta> {
    return {
      address: this.address,
      publicKeyHex: bytesToHex(this.publicKey),
      sigAlg: this.sigAlg,
      createdAt: this.meta.createdAt,
    };
  }

  getMeta(): StoredWalletMeta {
    return { ...this.meta };
  }

  /**
   * Clear private key from memory
   */
  destroy(): void {
    this.privateKey.fill(0);
  }
}

// ============================================================
// Multi-Curve Identity
// ============================================================

export class MultiCurveIdentity {
  constructor(
    public username: string,
    public signers: Map<FrontendSigAlg, FrontendSigner> = new Map()
  ) { }

  addSigner(signer: FrontendSigner) {
    this.signers.set(signer.sigAlg, signer);
  }

  async sign(data: Uint8Array, preferredAlg?: FrontendSigAlg): Promise<{ signature: Uint8Array; alg: FrontendSigAlg }> {
    const keys = Array.from(this.signers.keys());
    if (keys.length === 0) throw new Error('No signers available');

    const alg = preferredAlg || (this.signers.has('passkey') ? 'passkey' : keys[0]);
    const signer = this.signers.get(alg);
    if (!signer) throw new Error(`No signer for algorithm: ${alg}`);

    const signature = await signer.sign(data);
    return { signature, alg };
  }
}

interface EncryptedWalletData {
  id: string;
  salt: string; // hex
  iv: string; // hex
  ciphertext: string; // hex
  meta: StoredWalletMeta;
}

class WalletStorage {
  private useIndexedDB: boolean;

  constructor() {
    this.useIndexedDB = hasIndexedDB();
  }

  async saveWallet(
    id: string,
    privateKey: Uint8Array,
    meta: StoredWalletMeta,
    password: string
  ): Promise<void> {
    const salt = getRandomBytes(16);
    const key = await deriveKeyFromPassword(password, salt);
    const { ciphertext, iv } = await encryptData(privateKey, key);

    const data: EncryptedWalletData = {
      id,
      salt: bytesToHex(salt),
      iv: bytesToHex(iv),
      ciphertext: bytesToHex(ciphertext),
      meta,
    };

    if (this.useIndexedDB) {
      await this.saveToIndexedDB(id, data);
    } else {
      this.saveToLocalStorage(id, data);
    }
  }

  async loadWallet(id: string, password: string): Promise<Uint8Array | null> {
    const data = this.useIndexedDB
      ? await this.loadFromIndexedDB(id)
      : this.loadFromLocalStorage(id);

    if (!data) return null;

    const salt = hexToBytes(data.salt);
    const iv = hexToBytes(data.iv);
    const ciphertext = hexToBytes(data.ciphertext);

    const key = await deriveKeyFromPassword(password, salt);
    try {
      return await decryptData(ciphertext, iv, key);
    } catch {
      return null; // Wrong password
    }
  }

  async deleteWallet(id: string): Promise<void> {
    if (this.useIndexedDB) {
      await this.deleteFromIndexedDB(id);
    } else {
      this.deleteFromLocalStorage(id);
    }
  }

  listWallets(): StoredWalletMeta[] {
    if (this.useIndexedDB) {
      // For now, keep metadata in localStorage for quick access
      const metaList = localStorage.getItem(`${STORAGE_KEY}_meta`);
      return metaList ? JSON.parse(metaList) : [];
    }

    const wallets = localStorage.getItem(STORAGE_KEY);
    if (!wallets) return [];

    const data: Record<string, EncryptedWalletData> = JSON.parse(wallets);
    return Object.values(data).map((w) => w.meta);
  }

  saveMetaList(metas: StoredWalletMeta[]): void {
    localStorage.setItem(`${STORAGE_KEY}_meta`, JSON.stringify(metas));
  }

  // LocalStorage methods
  private saveToLocalStorage(id: string, data: EncryptedWalletData): void {
    const wallets = localStorage.getItem(STORAGE_KEY);
    const all: Record<string, EncryptedWalletData> = wallets ? JSON.parse(wallets) : {};
    all[id] = data;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  }

  private loadFromLocalStorage(id: string): EncryptedWalletData | null {
    const wallets = localStorage.getItem(STORAGE_KEY);
    if (!wallets) return null;
    const all: Record<string, EncryptedWalletData> = JSON.parse(wallets);
    return all[id] || null;
  }

  private deleteFromLocalStorage(id: string): void {
    const wallets = localStorage.getItem(STORAGE_KEY);
    if (!wallets) return;
    const all: Record<string, EncryptedWalletData> = JSON.parse(wallets);
    delete all[id];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  }

  // IndexedDB methods
  private async getDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(WALLET_DB_NAME, 1);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(WALLET_STORE_NAME)) {
          db.createObjectStore(WALLET_STORE_NAME, { keyPath: 'id' });
        }
      };
    });
  }

  private async saveToIndexedDB(id: string, data: EncryptedWalletData): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(WALLET_STORE_NAME, 'readwrite');
      const store = tx.objectStore(WALLET_STORE_NAME);
      const request = store.put(data);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }

  private async loadFromIndexedDB(id: string): Promise<EncryptedWalletData | null> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(WALLET_STORE_NAME, 'readonly');
      const store = tx.objectStore(WALLET_STORE_NAME);
      const request = store.get(id);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result || null);
    });
  }

  private async deleteFromIndexedDB(id: string): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(WALLET_STORE_NAME, 'readwrite');
      const store = tx.objectStore(WALLET_STORE_NAME);
      const request = store.delete(id);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }
}

// ============================================================
// Wallet Manager
// ============================================================

export class WalletManager {
  private storage: WalletStorage;
  private eventHandlers: Set<WalletEventHandler> = new Set();

  /** Currently active signer */
  current?: FrontendSigner;

  constructor() {
    if (!hasWebCrypto()) {
      throw new Error('WebCrypto API is required for wallet operations');
    }
    this.storage = new WalletStorage();
  }

  // ============================================================
  // Wallet Creation
  // ============================================================

  /**
   * Create a new local wallet with Ed25519 or secp256k1
   */
  async createLocalWallet(options: {
    sigAlg: 'ed25519' | 'secp256k1';
    label?: string;
    password: string;
  }): Promise<FrontendSigner> {
    // Configure hash functions for Noble libraries
    await configureNobleHashes();

    let privateKey: Uint8Array;
    let publicKey: Uint8Array;

    if (options.sigAlg === 'ed25519') {
      const { utils, getPublicKey } = await import('@noble/ed25519');
      privateKey = utils.randomPrivateKey();
      publicKey = await getPublicKey(privateKey);
    } else {
      const { utils, getPublicKey } = await import('@noble/secp256k1');
      privateKey = utils.randomPrivateKey();
      publicKey = getPublicKey(privateKey, true); // compressed
    }

    const address = await deriveAddress(publicKey, options.sigAlg);
    const id = generateWalletId();

    const meta: StoredWalletMeta = {
      id,
      label: options.label,
      sigAlg: options.sigAlg,
      address,
      createdAt: Date.now(),
      storage: 'local_encrypted',
    };

    // Save encrypted
    await this.storage.saveWallet(id, privateKey, meta, options.password);

    // Update meta list
    const metas = this.storage.listWallets();
    metas.push(meta);
    this.storage.saveMetaList(metas);

    // Create signer
    const signer = new LocalKeypairSigner(privateKey, publicKey, address, options.sigAlg, meta);
    this.current = signer;

    this.emit({ type: 'connected', address });
    return signer;
  }

  /**
   * Create a passkey-based wallet (WebAuthn)
   */
  async createPasskeyWallet(options: {
    rpId: string;
    userName: string;
    label?: string;
  }): Promise<FrontendSigner> {
    if (!hasPasskeySupport()) {
      throw new Error('Passkeys (WebAuthn) are not supported in this browser');
    }

    // WebAuthn credential creation
    const challenge = getRandomBytes(32);
    const credential = await navigator.credentials.create({
      publicKey: {
        challenge,
        rp: { id: options.rpId, name: 'WSTF Wallet' },
        user: {
          id: getRandomBytes(16),
          name: options.userName,
          displayName: options.userName,
        },
        pubKeyCredParams: [
          { alg: -7, type: 'public-key' }, // ES256 (P-256)
          { alg: -8, type: 'public-key' }, // EdDSA
        ],
        authenticatorSelection: {
          residentKey: 'required',
          userVerification: 'required',
        },
        timeout: 60000,
      },
    }) as PublicKeyCredential | null;

    if (!credential) {
      throw new Error('Passkey creation was cancelled');
    }

    const response = credential.response as AuthenticatorAttestationResponse;
    const publicKey = new Uint8Array(response.getPublicKey()!);

    // For now, passkey wallets use a placeholder address
    // Full integration requires chain support for WebAuthn signatures
    const address = await deriveAddress(publicKey, 'passkey');
    const id = credential.id;

    const meta: StoredWalletMeta = {
      id,
      label: options.label,
      sigAlg: 'passkey',
      address,
      createdAt: Date.now(),
      storage: 'passkey',
    };

    // Update meta list (no private key to store for passkeys)
    const metas = this.storage.listWallets();
    metas.push(meta);
    this.storage.saveMetaList(metas);

    // Create passkey signer (placeholder implementation)
    const signer: FrontendSigner = {
      address,
      sigAlg: 'passkey',
      publicKey,
      sign: async (data: Uint8Array) => {
        const assertion = await navigator.credentials.get({
          publicKey: {
            challenge: data,
            rpId: options.rpId,
            allowCredentials: [{ id: credential.rawId, type: 'public-key' }],
            userVerification: 'required',
            timeout: 60000,
          },
        }) as PublicKeyCredential | null;

        if (!assertion) {
          throw new Error('Passkey authentication was cancelled');
        }

        const assertionResponse = assertion.response as AuthenticatorAssertionResponse;
        // The signature here is the full WebAuthn signature (DER encoded)
        // In a real implementation, we might want to parse this or keep it as is
        return new Uint8Array(assertionResponse.signature);
      },
      exportMeta: async () => ({
        address,
        publicKeyHex: bytesToHex(publicKey),
        sigAlg: 'passkey',
        createdAt: meta.createdAt,
      }),
      getMeta: () => ({ ...meta }),
    };

    this.current = signer;
    this.emit({ type: 'connected', address });
    return signer;
  }

  // ============================================================
  // Wallet Management
  // ============================================================

  /**
   * List all stored wallets
   */
  listWallets(): StoredWalletMeta[] {
    return this.storage.listWallets();
  }

  /**
   * Assemble a Relay Transaction (Method-Target-Data)
   * This is the core modular backend transaction format.
   */
  async assembleRelayTx(params: {
    methodId: StandardMethodId | number;
    to: string; // @username or address
    data: any;  // JSON or string
    signer?: FrontendSigner;
  }): Promise<RelayTxPayload> {
    const activeSigner = params.signer || this.current;
    if (!activeSigner) throw new Error('No active signer');

    const dataString = typeof params.data === 'string' ? params.data : JSON.stringify(params.data);

    return {
      methodId: params.methodId,
      to: params.to,
      data: dataString,
    };
  }

  /**
   * Helper to deploy a new token
   */
  async deployToken(params: {
    to: string;
    name: string;
    symbol: string;
    supply: bigint;
    signer?: FrontendSigner;
  }): Promise<RelayTxPayload> {
    return this.assembleRelayTx({
      methodId: StandardMethodId.TOK_DEPLOY,
      to: params.to,
      data: {
        name: params.name,
        symbol: params.symbol,
        supply: params.supply.toString(),
      },
      signer: params.signer,
    });
  }

  /**
   * Helper to mint tokens
   */
  async mintToken(params: {
    to: string;
    tokenId: string;
    amount: bigint;
    recipient: string;
    protected?: boolean;
    signer?: FrontendSigner;
  }): Promise<RelayTxPayload> {
    return this.assembleRelayTx({
      methodId: params.protected ? StandardMethodId.TOK_MINT_PROTECTED : StandardMethodId.TOK_MINT,
      to: params.to,
      data: {
        tokenId: params.tokenId,
        amount: params.amount.toString(),
        recipient: params.recipient,
      },
      signer: params.signer,
    });
  }

  /**
   * Select and unlock a wallet
   */
  async selectWallet(id: string, password: string): Promise<FrontendSigner | null> {
    // Configure hash functions for Noble libraries
    await configureNobleHashes();

    const metas = this.storage.listWallets();
    const meta = metas.find((m) => m.id === id);
    if (!meta) return null;

    if (meta.storage === 'passkey') {
      // Passkeys don't need password
      throw new Error('Use selectPasskeyWallet for passkey wallets');
    }

    const privateKey = await this.storage.loadWallet(id, password);
    if (!privateKey) return null;

    let publicKey: Uint8Array;
    if (meta.sigAlg === 'ed25519') {
      const { getPublicKey } = await import('@noble/ed25519');
      publicKey = await getPublicKey(privateKey);
    } else {
      const { getPublicKey } = await import('@noble/secp256k1');
      publicKey = getPublicKey(privateKey, true);
    }

    const signer = new LocalKeypairSigner(
      privateKey,
      publicKey,
      meta.address,
      meta.sigAlg as 'ed25519' | 'secp256k1',
      meta
    );

    this.current = signer;
    this.emit({ type: 'connected', address: meta.address });
    return signer;
  }

  /**
   * Delete a wallet
   */
  async deleteWallet(id: string): Promise<void> {
    await this.storage.deleteWallet(id);

    const metas = this.storage.listWallets().filter((m) => m.id !== id);
    this.storage.saveMetaList(metas);

    if (this.current?.getMeta().id === id) {
      this.disconnect();
    }
  }

  /**
   * Disconnect current wallet
   */
  disconnect(): void {
    if (this.current && 'destroy' in this.current) {
      (this.current as LocalKeypairSigner).destroy();
    }
    const address = this.current?.address;
    this.current = undefined;
    if (address) {
      this.emit({ type: 'disconnected', address });
    }
  }

  // ============================================================
  // Events
  // ============================================================

  /**
   * Subscribe to wallet events
   */
  on(handler: WalletEventHandler): () => void {
    this.eventHandlers.add(handler);
    return () => this.eventHandlers.delete(handler);
  }

  private emit(event: WalletEvent): void {
    for (const handler of this.eventHandlers) {
      try {
        handler(event);
      } catch (e) {
        console.error('Wallet event handler error:', e);
      }
    }
  }
}

// ============================================================
// Factory Function
// ============================================================

/**
 * Create a new wallet manager instance
 */
export function createWalletManager(): WalletManager {
  return new WalletManager();
}
