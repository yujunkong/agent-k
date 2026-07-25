/**
 * HARB acceptance tests runner (Mocha + tsx)
 * Usage: npm run test:harness
 */
import Mocha from 'mocha';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pattern = path.join(repoRoot, 'tests/acceptance/harness/**/*.spec.ts');

function collectSpecs(dir: string, acc: string[]): void {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collectSpecs(full, acc);
    } else if (entry.name.endsWith('.spec.ts')) {
      acc.push(full);
    }
  }
}

const specs: string[] = [];
collectSpecs(path.join(repoRoot, 'tests/acceptance/harness'), specs);

const mocha = new Mocha({ timeout: 60_000, color: true });
for (const file of specs.sort()) {
  mocha.addFile(file);
}

mocha.run((failures) => {
  process.exit(failures ? 1 : 0);
});
