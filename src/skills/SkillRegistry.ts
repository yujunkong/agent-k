/**
 * SkillRegistry — Skills / Pinned Skills 관리 (C7-T19, PRD-28)
 *
 * skills/*.md 로드·리로드, 핀한 스킬 주입, 핀 해제 즉시 중단,
 * Tier A 캡 초과 경고, 시크릿 평문 거부/마스킹
 */
import * as fs from 'fs';
import * as path from 'path';

export interface SkillDefinition {
  name: string;
  filePath: string;
  content: string;
  description: string;
  pinned: boolean;
  loadedAt: number;
}

export class SkillRegistry {
  private skills: Map<string, SkillDefinition> = new Map();
  private skillsDir: string;
  private pinnedSkills: Set<string> = new Set();
  private readonly MAX_CONTENT_LENGTH = 32000; // 32KB max per skill
  private readonly MAX_TIER_A_CONTENT_LENGTH = 4000; // Tier A cap warning

  constructor(skillsDir: string) {
    this.skillsDir = skillsDir;
    if (!fs.existsSync(skillsDir)) {
      fs.mkdirSync(skillsDir, { recursive: true });
    }
  }

  /**
   * Load all skills from skills directory
   */
  loadAll(): SkillDefinition[] {
    this.skills.clear();

    if (!fs.existsSync(this.skillsDir)) return [];

    const files = fs.readdirSync(this.skillsDir).filter(f => f.endsWith('.md'));
    for (const file of files) {
      try {
        const filePath = path.join(this.skillsDir, file);
        const content = fs.readFileSync(filePath, 'utf-8');
        const name = file.replace(/\.md$/, '');

        // Extract description from first line
        const firstLine = content.split('\n')[0] || '';
        const description = firstLine.replace(/^#\s*/, '').trim() || name;

        const skill: SkillDefinition = {
          name,
          filePath,
          content: content.slice(0, this.MAX_CONTENT_LENGTH),
          description,
          pinned: this.pinnedSkills.has(name),
          loadedAt: Date.now()
        };

        // Check for secrets-in-plaintext
        this.scanSecrets(skill);

        this.skills.set(name, skill);
      } catch { /* skip invalid files */ }
    }

    return this.getAll();
  }

  /**
   * Reload a single skill file
   */
  reload(name: string): SkillDefinition | null {
    const filePath = path.join(this.skillsDir, `${name}.md`);
    if (!fs.existsSync(filePath)) {
      this.skills.delete(name);
      return null;
    }

    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const skill = this.skills.get(name);
      const updated: SkillDefinition = {
        name,
        filePath,
        content: content.slice(0, this.MAX_CONTENT_LENGTH),
        description: content.split('\n')[0]?.replace(/^#\s*/, '').trim() || name,
        pinned: this.pinnedSkills.has(name),
        loadedAt: Date.now()
      };

      this.scanSecrets(updated);
      this.skills.set(name, updated);
      return updated;
    } catch {
      return null;
    }
  }

  /**
   * Pin a skill (will be auto-injected into prompts)
   */
  pin(name: string): boolean {
    if (!this.skills.has(name)) return false;
    this.pinnedSkills.add(name);
    this.skills.get(name)!.pinned = true;
    return true;
  }

  /**
   * Unpin a skill (injection stops immediately)
   */
  unpin(name: string): void {
    this.pinnedSkills.delete(name);
    const skill = this.skills.get(name);
    if (skill) skill.pinned = false;
  }

  /**
   * Get all pinned skills
   */
  getPinnedSkills(): SkillDefinition[] {
    return Array.from(this.skills.values()).filter(s => s.pinned);
  }

  /**
   * Get all skills
   */
  getAll(): SkillDefinition[] {
    return Array.from(this.skills.values());
  }

  /**
   * Get a specific skill by name
   */
  get(name: string): SkillDefinition | undefined {
    return this.skills.get(name);
  }

  /**
   * Inject pinned skills content into a prompt
   */
  injectPinnedSkills(prompt: string, tierA: boolean = false): { prompt: string; injected: boolean; warnings: string[] } {
    const pinned = this.getPinnedSkills();
    if (pinned.length === 0) return { prompt, injected: false, warnings: [] };

    const warnings: string[] = [];
    const blocks: string[] = [];

    for (const skill of pinned) {
      let content = skill.content;

      // Tier A cap check
      if (tierA && content.length > this.MAX_TIER_A_CONTENT_LENGTH) {
        warnings.push(`⚠️ Pinned skill "${skill.name}" exceeds Tier A content cap (${content.length} > ${this.MAX_TIER_A_CONTENT_LENGTH} chars). Truncating.`);
        content = content.slice(0, this.MAX_TIER_A_CONTENT_LENGTH) + '\n\n... (truncated for Tier A)';
      }

      blocks.push(content);
    }

    const injection = [
      '',
      '---',
      '### Pinned Skills',
      '',
      ...blocks.map((b, i) => `<skill name="${pinned[i].name}">\n${b}\n</skill>`),
      '---',
      ''
    ].join('\n');

    return {
      prompt: prompt + injection,
      injected: true,
      warnings
    };
  }

  /**
   * Count pinned skills
   */
  get pinnedCount(): number {
    return this.pinnedSkills.size;
  }

  /**
   * Check if a skill is pinned
   */
  isPinned(name: string): boolean {
    return this.pinnedSkills.has(name);
  }

  /**
   * Clear all skills
   */
  clear(): void {
    this.skills.clear();
    this.pinnedSkills.clear();
  }

  private scanSecrets(skill: SkillDefinition): void {
    // Simple pattern-based secret detection
    const secretPatterns = [
      /(?:api[_-]?key|apikey|secret|password|token)[\s]*[:=][\s]*['"].+['"]/i,
      /sk-[a-zA-Z0-9]{20,}/, // OpenAI-style keys
      /ghp_[a-zA-Z0-9]{36,}/, // GitHub PATs
      /-----BEGIN (?:RSA |EC )?PRIVATE KEY-----/
    ];

    for (const pattern of secretPatterns) {
      const match = skill.content.match(pattern);
      if (match) {
        console.warn(`[SkillRegistry] Secret detected in skill "${skill.name}": ${match[0].slice(0, 20)}...`);
        // Replace with masked version
        const masked = match[0].replace(/['"][^'"]+['"]/, '"[REDACTED]"')
          .replace(/(sk-|ghp_)[a-zA-Z0-9]+/, '$1[REDACTED]')
          .replace(/-----BEGIN .+ KEY-----.*-----END .+ KEY-----/s, '[REDACTED KEY]');
        skill.content = skill.content.replace(match[0], masked);
      }
    }
  }
}

/** Extension / AgentLoop 공유 SkillRegistry 싱글톤 (RW-C7-07) */
let _skillRegistry: SkillRegistry | null = null;

export function getSkillRegistry(skillsDir?: string): SkillRegistry {
  if (!_skillRegistry) {
    const dir =
      skillsDir ||
      path.join(process.cwd(), 'skills');
    _skillRegistry = new SkillRegistry(dir);
    _skillRegistry.loadAll();
  }
  return _skillRegistry;
}

export function resetSkillRegistryForTests(): void {
  _skillRegistry = null;
}
