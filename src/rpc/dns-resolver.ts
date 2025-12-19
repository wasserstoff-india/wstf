/**
 * RPC DNS Resolver
 * 
 * Maps @usernames to network endpoints or local URLs.
 * Supports secure routing for modular backend transactions.
 */

export interface DnsRecord {
    username: string;
    endpoint: string; // URL
    publicKey?: string; // Base64 DER for Zk-encryption
    type: 'rpc' | 'gateway' | 'local';
}

export class DnsResolver {
    private records = new Map<string, DnsRecord>();

    /**
     * Register or update a DNS record for a username
     */
    register(record: DnsRecord) {
        const key = record.username.startsWith('@') ? record.username : `@${record.username}`;
        this.records.set(key, record);
    }

    /**
     * Resolve a username to its DNS record
     */
    resolve(username: string): DnsRecord | undefined {
        const key = username.startsWith('@') ? username : `@${username}`;
        return this.records.get(key);
    }

    /**
     * Get the endpoint for a username
     */
    getEndpoint(username: string): string | undefined {
        return this.resolve(username)?.endpoint;
    }
}

export const globalDns = new DnsResolver();
