/**
 * Webview-side shims for Node builtins pulled in transitively by extension-host-only
 * modules. Call sites are guarded / never invoked in the browser realm.
 */
function unavailable(mod: string, name: string): never {
  throw new Error(`node:${mod}.${name} is unavailable in the webview`);
}

export const execFileSync = () => unavailable('child_process', 'execFileSync');
export const execFile = () => unavailable('child_process', 'execFile');
export const execSync = () => unavailable('child_process', 'execSync');
export const exec = () => unavailable('child_process', 'exec');
export const spawn = () => unavailable('child_process', 'spawn');
export const spawnSync = () => unavailable('child_process', 'spawnSync');

export const existsSync = () => unavailable('fs', 'existsSync');
export const accessSync = () => unavailable('fs', 'accessSync');
export const constants = { F_OK: 0, R_OK: 4, W_OK: 2, X_OK: 1 };
export const readFileSync = () => unavailable('fs', 'readFileSync');
export const writeFileSync = () => unavailable('fs', 'writeFileSync');
export const readdirSync = () => unavailable('fs', 'readdirSync');
export const mkdirSync = () => unavailable('fs', 'mkdirSync');
export const statSync = () => unavailable('fs', 'statSync');

export const join = (...parts: string[]) => parts.filter(Boolean).join('/');
export const resolve = (...parts: string[]) => parts.filter(Boolean).join('/');
export const dirname = (p: string) => {
  const i = p.replace(/\\/g, '/').lastIndexOf('/');
  return i >= 0 ? p.slice(0, i) : '.';
};
export const basename = (p: string) => p.replace(/\\/g, '/').split('/').pop() || '';
export const extname = (p: string) => {
  const b = p.replace(/\\/g, '/').split('/').pop() || '';
  const i = b.lastIndexOf('.');
  return i > 0 ? b.slice(i) : '';
};

export default {
  execFileSync,
  execFile,
  execSync,
  exec,
  spawn,
  spawnSync,
  existsSync,
  accessSync,
  constants,
  readFileSync,
  writeFileSync,
  readdirSync,
  mkdirSync,
  statSync,
  join,
  resolve,
  dirname,
  basename,
  extname,
};
