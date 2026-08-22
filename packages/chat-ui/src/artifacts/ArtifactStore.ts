/**
 * ArtifactStore — 스크린샷/데모/diff 카드 저장 + 갤러리 (C7-T16)
 */
import * as fs from 'fs';
import * as path from 'path';

export type ArtifactType = 'screenshot' | 'demo' | 'diff' | 'text';

export interface Artifact {
  id: string;
  type: ArtifactType;
  title: string;
  description: string;
  data: string; // base64 for images, markdown for text
  filePath: string;
  timestamp: number;
  tags: string[];
}

export class ArtifactStore {
  private artifacts: Artifact[] = [];
  private storeDir: string;

  constructor(storeDir: string) {
    this.storeDir = storeDir;
    if (!fs.existsSync(storeDir)) {
      fs.mkdirSync(storeDir, { recursive: true });
    }
    this.load();
  }

  /**
   * Save an artifact
   */
  save(artifact: Omit<Artifact, 'id' | 'timestamp'>): Artifact {
    const entry: Artifact = {
      ...artifact,
      id: `art-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      timestamp: Date.now()
    };

    this.artifacts.push(entry);
    this.persist(entry);

    return entry;
  }

  /**
   * Save screenshot artifact
   */
  saveScreenshot(base64Data: string, title: string, description?: string): Artifact {
    return this.save({
      type: 'screenshot',
      title,
      description: description ?? '',
      data: base64Data,
      filePath: `screenshots/${title.replace(/[^a-zA-Z0-9]/g, '_')}.png`,
      tags: ['screenshot']
    });
  }

  /**
   * Save diff artifact
   */
  saveDiff(diffContent: string, title: string): Artifact {
    return this.save({
      type: 'diff',
      title,
      description: `Diff: ${title}`,
      data: diffContent,
      filePath: `diffs/${title.replace(/[^a-zA-Z0-9]/g, '_')}.diff`,
      tags: ['diff']
    });
  }

  /**
   * Get all artifacts
   */
  getAll(): Artifact[] {
    return [...this.artifacts].sort((a, b) => b.timestamp - a.timestamp);
  }

  /**
   * Get artifacts by type
   */
  getByType(type: ArtifactType): Artifact[] {
    return this.artifacts.filter(a => a.type === type);
  }

  /**
   * Get artifact by ID
   */
  get(id: string): Artifact | undefined {
    return this.artifacts.find(a => a.id === id);
  }

  /**
   * Delete an artifact
   */
  delete(id: string): void {
    const idx = this.artifacts.findIndex(a => a.id === id);
    if (idx >= 0) {
      const removed = this.artifacts.splice(idx, 1)[0];
      const filePath = path.join(this.storeDir, `${removed.id}.json`);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }
  }

  /**
   * Clear all artifacts
   */
  clear(): void {
    this.artifacts = [];
    const files = fs.readdirSync(this.storeDir).filter(f => f.endsWith('.json'));
    for (const f of files) {
      fs.unlinkSync(path.join(this.storeDir, f));
    }
  }

  /**
   * Get total count
   */
  get count(): number {
    return this.artifacts.length;
  }

  /**
   * Export artifact gallery as markdown
   */
  exportGallery(): string {
    if (this.artifacts.length === 0) return 'No artifacts yet.';

    const lines = ['## Artifact Gallery', ''];
    for (const art of this.artifacts.slice(0, 20)) {
      const date = new Date(art.timestamp).toISOString().slice(0, 10);
      lines.push(`- **${art.title}** (${art.type}) — ${date}`);
      if (art.description) lines.push(`  ${art.description}`);
    }
    if (this.artifacts.length > 20) {
      lines.push(`\n... and ${this.artifacts.length - 20} more`);
    }
    return lines.join('\n');
  }

  private persist(artifact: Artifact): void {
    const filePath = path.join(this.storeDir, `${artifact.id}.json`);
    fs.writeFileSync(filePath, JSON.stringify(artifact, null, 2));
  }

  private load(): void {
    if (!fs.existsSync(this.storeDir)) return;
    const files = fs.readdirSync(this.storeDir).filter(f => f.endsWith('.json'));
    for (const file of files) {
      try {
        const data = fs.readFileSync(path.join(this.storeDir, file), 'utf-8');
        this.artifacts.push(JSON.parse(data));
      } catch { /* skip corrupted */ }
    }
  }
}
