/**
 * Credentials & Secrets Store
 * Manages encrypted credentials for workflow integrations
 *
 * Note: Uses simple XOR + base64 encoding for obfuscation.
 * For production use with sensitive data, consider using Web Crypto API
 * or a proper secrets management service.
 */

export interface Credential {
  /** Unique credential ID */
  id: string;
  /** Credential name for display */
  name: string;
  /** Credential type (e.g., 'oauth2', 'api-key', 'basic-auth') */
  type: string;
  /** Encrypted credential data */
  data: Record<string, unknown>;
  /** Creation timestamp */
  createdAt: Date;
  /** Last updated timestamp */
  updatedAt: Date;
}

export interface CredentialStoreOptions {
  /** Encryption key - should come from env */
  encryptionKey?: string;
  /** In-memory mode (no persistence) */
  inMemory?: boolean;
}

/**
 * Convert string to base64
 */
function toBase64(str: string): string {
  if (typeof btoa === "function") {
    return btoa(encodeURIComponent(str));
  }
  // Fallback for environments without btoa
  return str;
}

/**
 * Convert base64 to string
 */
function fromBase64(str: string): string {
  if (typeof atob === "function") {
    try {
      return decodeURIComponent(atob(str));
    } catch {
      return str;
    }
  }
  return str;
}

/**
 * Simple XOR obfuscation with key
 */
function xorString(str: string, key: string): string {
  let result = "";
  for (let i = 0; i < str.length; i++) {
    result += String.fromCharCode(
      str.charCodeAt(i) ^ key.charCodeAt(i % key.length),
    );
  }
  return result;
}

/**
 * Simple credential store with basic obfuscation
 */
export class CredentialStore {
  private credentials: Map<string, Credential> = new Map();
  private encryptionKey: string;

  constructor(options: CredentialStoreOptions = {}) {
    // Get encryption key from options or use default
    this.encryptionKey =
      options.encryptionKey ?? "dev-key-change-in-production-32b";
  }

  /**
   * Encrypt sensitive data (XOR + base64)
   */
  private encrypt(data: string): string {
    const xored = xorString(data, this.encryptionKey);
    return "enc:" + toBase64(xored);
  }

  /**
   * Decrypt sensitive data
   */
  private decrypt(encrypted: string): string {
    if (!encrypted.startsWith("enc:")) {
      return encrypted;
    }
    const base64Part = encrypted.slice(4);
    const xored = fromBase64(base64Part);
    return xorString(xored, this.encryptionKey);
  }

  /**
   * Store a credential
   */
  set(credential: Omit<Credential, "createdAt" | "updatedAt">): Credential {
    const now = new Date();
    const existing = this.credentials.get(credential.id);

    // Encrypt sensitive data fields
    const encryptedData: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(credential.data)) {
      if (typeof value === "string") {
        encryptedData[key] = this.encrypt(value);
      } else {
        encryptedData[key] = value;
      }
    }

    const stored: Credential = {
      ...credential,
      data: encryptedData,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };

    this.credentials.set(credential.id, stored);
    return stored;
  }

  /**
   * Get a credential by ID (returns decrypted data)
   */
  get(id: string): Credential | undefined {
    const credential = this.credentials.get(id);
    if (!credential) return undefined;

    // Decrypt sensitive data
    const decryptedData: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(credential.data)) {
      if (typeof value === "string" && value.startsWith("enc:")) {
        try {
          decryptedData[key] = this.decrypt(value);
        } catch {
          decryptedData[key] = value;
        }
      } else {
        decryptedData[key] = value;
      }
    }

    return {
      ...credential,
      data: decryptedData,
    };
  }

  /**
   * Check if credential exists
   */
  has(id: string): boolean {
    return this.credentials.has(id);
  }

  /**
   * Delete a credential
   */
  delete(id: string): boolean {
    return this.credentials.delete(id);
  }

  /**
   * List all credential IDs and names (no sensitive data)
   */
  list(): Array<{ id: string; name: string; type: string }> {
    return Array.from(this.credentials.values()).map((cred) => ({
      id: cred.id,
      name: cred.name,
      type: cred.type,
    }));
  }

  /**
   * Clear all credentials
   */
  clear(): void {
    this.credentials.clear();
  }

  /**
   * Get credential data for a specific key
   */
  getValue(credentialId: string, key: string): unknown {
    const credential = this.get(credentialId);
    return credential?.data[key];
  }
}

// Global credential store instance
let globalStore: CredentialStore | null = null;

/**
 * Get or create global credential store
 */
export function getCredentialStore(
  options?: CredentialStoreOptions,
): CredentialStore {
  if (!globalStore) {
    globalStore = new CredentialStore(options);
  }
  return globalStore;
}

/**
 * Reset global credential store (mainly for testing)
 */
export function resetCredentialStore(): void {
  globalStore = null;
}
