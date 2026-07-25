/**
 * SecretsVault — SecretStorage 관리 + 환경별 프로파일 UI (C7-T26)
 *
 * 평문 금지: 값은 항상 SecretStorage에 저장, UI에는 마스킹 표시
 */
import * as vscode from 'vscode';

export interface SecretProfile {
  name: string;
  keys: string[];
  createdAt: number;
}

export class SecretsVault {
  private secretStorage: vscode.SecretStorage;
  private readonly PREFIX = 'agent-k.vault.';

  constructor(secretStorage: vscode.SecretStorage) {
    this.secretStorage = secretStorage;
  }

  /**
   * Store a secret (always goes to SecretStorage, never plaintext)
   */
  async store(key: string, value: string): Promise<void> {
    await this.secretStorage.store(this.PREFIX + key, value);
  }

  /**
   * Retrieve a secret
   */
  async get(key: string): Promise<string | undefined> {
    return await this.secretStorage.get(this.PREFIX + key);
  }

  /**
   * Delete a secret
   */
  async delete(key: string): Promise<void> {
    await this.secretStorage.delete(this.PREFIX + key);
  }

  /**
   * List all secret keys
   */
  async list(): Promise<string[]> {
    // SecretStorage doesn't support listing — maintain a separate keys index
    const keysJson = await this.secretStorage.get(this.PREFIX + '_keys');
    if (!keysJson) return [];
    return JSON.parse(keysJson) as string[];
  }

  /**
   * Save profile (set of keys for a specific environment)
   */
  async saveProfile(profile: SecretProfile): Promise<void> {
    await this.secretStorage.store(
      this.PREFIX + '_profile_' + profile.name,
      JSON.stringify(profile)
    );

    // Update profile index
    const profiles = await this.listProfiles();
    if (!profiles.find(p => p.name === profile.name)) {
      profiles.push(profile);
      await this.secretStorage.store(
        this.PREFIX + '_profiles',
        JSON.stringify(profiles.map(p => p.name))
      );
    }
  }

  /**
   * List all profiles
   */
  async listProfiles(): Promise<SecretProfile[]> {
    const profileNamesJson = await this.secretStorage.get(this.PREFIX + '_profiles');
    if (!profileNamesJson) return [];

    const names = JSON.parse(profileNamesJson) as string[];
    const profiles: SecretProfile[] = [];

    for (const name of names) {
      const data = await this.secretStorage.get(this.PREFIX + '_profile_' + name);
      if (data) {
        profiles.push(JSON.parse(data));
      }
    }

    return profiles;
  }

  /**
   * Load a profile's secrets into memory for use
   */
  async loadProfile(name: string): Promise<Map<string, string>> {
    const profile = (await this.listProfiles()).find(p => p.name === name);
    if (!profile) throw new Error(`Profile not found: ${name}`);

    const secrets = new Map<string, string>();
    for (const key of profile.keys) {
      const value = await this.get(key);
      if (value) secrets.set(key, value);
    }

    return secrets;
  }

  /**
   * Mask a value for display (show last 4 chars)
   */
  mask(value: string): string {
    if (value.length <= 8) return '****';
    return '****' + value.slice(-4);
  }

  /**
   * Check if a key exists
   */
  async exists(key: string): Promise<boolean> {
    const value = await this.get(key);
    return value !== undefined;
  }

  private async updateKeysIndex(key: string, add: boolean): Promise<void> {
    const keys = await this.list();
    const updated = add
      ? [...new Set([...keys, key])]
      : keys.filter(k => k !== key);

    await this.secretStorage.store(this.PREFIX + '_keys', JSON.stringify(updated));
  }
}
