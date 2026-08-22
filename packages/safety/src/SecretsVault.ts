/**
 * SAFE-005 — SecretsVault interface + in-memory implementation.
 * Values must never be logged; toString/inspect stay opaque.
 */

import { createSafetyError, type SafetyResult } from './types';

/** Domain vault API — host may swap for vscode.SecretStorage later. */
export interface SecretsVault {
  set(key: string, value: string): Promise<void>;
  get(key: string): Promise<string | undefined>;
  delete(key: string): Promise<void>;
  has?(key: string): Promise<boolean>;
}

/**
 * In-memory vault for tests / early wiring.
 * Intentionally does not console.log secret values.
 */
export class InMemorySecretsVault implements SecretsVault {
  // Map holds plaintext only in-process; never serialize to logs.
  private readonly store = new Map<string, string>();

  async set(key: string, value: string): Promise<void> {
    if (!key) {
      throw new Error('SecretsVault.set: key must be non-empty');
    }
    this.store.set(key, value);
  }

  async get(key: string): Promise<string | undefined> {
    return this.store.get(key);
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key);
  }

  async has(key: string): Promise<boolean> {
    return this.store.has(key);
  }

  /** R-005 get that surfaces missing keys explicitly. */
  async getResult(key: string): Promise<SafetyResult<string>> {
    const value = await this.get(key);
    if (value === undefined) {
      return {
        ok: false,
        error: createSafetyError('SECRET_NOT_FOUND', `Secret not found: ${key}`, {
          key,
        }),
      };
    }
    return { ok: true, value };
  }

  /** Opaque debug — never include values. */
  toString(): string {
    return `InMemorySecretsVault(size=${this.store.size})`;
  }

  /** Node util.inspect / console.log safety net. */
  [Symbol.for('nodejs.util.inspect.custom')](): string {
    return this.toString();
  }
}
