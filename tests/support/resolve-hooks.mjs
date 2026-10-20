// Resolution hooks that let Node's ESM loader run the app's modules directly,
// the way webpack does inside Next.js: extensionless relative imports and the
// "@/..." alias (jsconfig.json) both resolve to files under src/.
import { existsSync, statSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const SRC = path.resolve(fileURLToPath(new URL('../../src/', import.meta.url)));
const EXTENSIONS = ['.js', '.mjs', '.jsx'];

function withExtension(filePath) {
  if (existsSync(filePath) && statSync(filePath).isFile()) return filePath;
  for (const ext of EXTENSIONS) {
    if (existsSync(filePath + ext)) return filePath + ext;
  }
  for (const ext of EXTENSIONS) {
    const index = path.join(filePath, `index${ext}`);
    if (existsSync(index)) return index;
  }
  return null;
}

// The app's .js files are ES modules (webpack treats them so); say so up
// front instead of letting Node guess and warn on every file.
function asModule(found, context, nextResolve) {
  return nextResolve(pathToFileURL(found).href, context).then((result) =>
    found.startsWith(SRC) && found.endsWith('.js') ? { ...result, format: 'module' } : result
  );
}

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('@/')) {
    const found = withExtension(path.join(SRC, specifier.slice(2)));
    if (found) return asModule(found, context, nextResolve);
  }
  if ((specifier.startsWith('./') || specifier.startsWith('../')) && context.parentURL?.startsWith('file:')) {
    const base = path.dirname(fileURLToPath(context.parentURL));
    const found = withExtension(path.resolve(base, specifier));
    if (found) return asModule(found, context, nextResolve);
  }
  return nextResolve(specifier, context);
}
