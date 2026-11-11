// Build tooling and ABI assertions only. Rust owns inspection and projection.
import { spawnSync } from 'node:child_process';
import { deepStrictEqual } from 'node:assert';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { transpile } from '@bytecodealliance/jco';

const root = fileURLToPath(new URL('.', import.meta.url));
const resultsDir = join(root, 'target', 'verification');
const scenarios = [
  'success',
  'selection-failure',
  'metadata-failure',
  'unsupported-image',
  'read-failure',
];
await mkdir(resultsDir, { recursive: true });
function run(command, args, env = process.env) {
  const result = spawnSync(command, args, { cwd: root, env, encoding: 'utf8' });
  if (result.error) throw result.error;
  process.stdout.write(result.stdout);
  process.stderr.write(result.stderr);
  if (result.status !== 0)
    throw new Error(`${command} failed: ${result.status}`);
  return result.stdout + result.stderr;
}
const env = { ...process.env, RUSTUP_TOOLCHAIN: '1.95.0' };
let log = run(
  'cargo',
  [
    'run',
    '--locked',
    '--offline',
    '--manifest-path',
    join(root, 'Cargo.toml'),
    '-p',
    'linera-inspect-schema',
    '--',
    join(root, 'guest/wit'),
  ],
  env,
);
log += run(
  'cargo',
  [
    'test',
    '--locked',
    '--offline',
    '--manifest-path',
    join(root, 'Cargo.toml'),
    '-p',
    'linera-inspect-schema',
  ],
  env,
);
const results = {};
for (const scenario of scenarios) {
  log += run(
    'cargo',
    [
      'build',
      '--locked',
      '--offline',
      '--release',
      '--target',
      'wasm32-unknown-unknown',
      '--manifest-path',
      join(root, 'Cargo.toml'),
      '-p',
      'linera-inspect-guest',
    ],
    { ...env, WIT_INSPECT_SCENARIO: scenario },
  );
  const generated = join(root, 'target', 'roundtrip', scenario);
  await mkdir(generated, { recursive: true });
  const component = join(generated, 'inspection.wasm');
  log += run('wasm-tools', [
    'component',
    'new',
    join(
      root,
      'target/wasm32-unknown-unknown/release/linera_inspect_guest.wasm',
    ),
    '-o',
    component,
  ]);
  const { files } = await transpile(await readFile(component), {
    name: 'inspection',
    outDir: generated,
    instantiation: 'async',
    wasiShim: false,
    nodejsCompat: false,
    base64Cutoff: 0,
    namespacedExports: false,
    noComponentErrorWrapping: true,
    asyncMode: 'jspi',
    asyncExports: ['wit-inspect:linera/native#inspect'],
  });
  for (const [path, bytes] of Object.entries(files)) {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, bytes);
  }
  const binding = await import(
    pathToFileURL(join(generated, 'inspection.js')).href
  );
  const exports = await binding.instantiate(
    async (path) => WebAssembly.compile(await readFile(join(generated, path))),
    {},
  );
  const pending = exports.native.inspect(
    'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  );
  if (!(pending instanceof Promise))
    throw new Error('JSPI export must return a Promise');
  results[scenario] = await pending;
}
function encode(value) {
  return JSON.parse(
    JSON.stringify(value, (_key, entry) => {
      if (typeof entry === 'bigint') return { $u64: entry.toString() };
      if (entry === undefined) return { $undefined: true };
      return entry;
    }),
  );
}
const encoded = encode(results);
await writeFile(
  join(resultsDir, 'jco-results.json'),
  JSON.stringify(encoded, null, 2) + '\n',
);
const baseline = JSON.parse(
  await readFile(join(root, 'support', 'expected-baseline.json'), 'utf8'),
);
const normalized = structuredClone(encoded);
for (const scenario of scenarios) {
  for (const step of normalized[scenario].steps) {
    step.result = step.stepResult;
    delete step.stepResult;
  }
  deepStrictEqual(normalized[scenario], baseline[scenario]);
  console.log(
    `${scenario}: complete returned tree matches original component baseline`,
  );
}
await writeFile(join(resultsDir, 'build.log'), log);
await writeFile(
  join(resultsDir, 'comparison.json'),
  JSON.stringify(
    {
      scenarios,
      completePayloadMatches: 5,
      normalization:
        'Only stepResult key renamed to result; all fields including undefined options and u64 values compared',
      exactContract: false,
    },
    null,
    2,
  ) + '\n',
);
