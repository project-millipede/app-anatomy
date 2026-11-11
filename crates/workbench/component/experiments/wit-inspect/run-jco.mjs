// Node harness: bind the unmodified generated component and capture its full return tree.
import { transpile } from '@bytecodealliance/jco';
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const [componentPath, outputPath] = process.argv.slice(2);
if (!componentPath || !outputPath)
  throw new Error('Provide component and output directory');
const outDir = resolve(outputPath);
// WASI providers are already installed as jco's dependencies; resolve them there
// without changing the application's package manifest or node_modules tree.
const requireFromJco = createRequire(
  import.meta.resolve('@bytecodealliance/jco'),
);
const map = Object.fromEntries(
  ['cli', 'clocks', 'io', 'random'].map((group) => [
    `wasi:${group}/*`,
    `${pathToFileURL(requireFromJco.resolve(`@bytecodealliance/preview2-shim/${group}`)).href}#*`,
  ]),
);
const { files } = await transpile(await readFile(componentPath), {
  name: 'inspection',
  outDir,
  wasiShim: true,
  map,
  nodejsCompat: true,
  base64Cutoff: 0,
  namespacedExports: false,
  asyncMode: 'jspi',
  asyncExports: ['fidius:inspection/inspection@0.1.0#inspect'],
});
for (const [path, bytes] of Object.entries(files)) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, bytes);
}
const component = await import(pathToFileURL(resolve(outDir, 'inspection.js')));
const pending = component.inspection.inspect('a'.repeat(64));
assert(
  pending instanceof Promise,
  'The selected inspection export must use JSPI',
);
const outcome = await pending;
console.log(
  JSON.stringify(
    outcome,
    (_, value) => {
      if (typeof value === 'bigint') return { $u64: value.toString() };
      if (value === undefined) return { $undefined: true };
      return value;
    },
    2,
  ),
);
