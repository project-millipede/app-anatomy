// A temporary declaration edit measures regeneration; no domain field is changed.
import { spawnSync } from 'node:child_process';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { strictEqual } from 'node:assert';
const root = fileURLToPath(new URL('.', import.meta.url));
const dtoPath = join(root, 'schema/src/dto.rs');
const projectionPath = join(root, 'schema/src/project.rs');
const originalDto = await readFile(dtoPath, 'utf8');
const originalProjection = await readFile(projectionPath, 'utf8');
const originalWit = await readFile(join(root, 'guest/wit/native.wit'), 'utf8');
const log = [];
function run(args) {
  const result = spawnSync('cargo', args, {
    cwd: root,
    encoding: 'utf8',
    env: {
      ...process.env,
      RUSTUP_TOOLCHAIN: '1.95.0',
      WIT_INSPECT_SCENARIO: 'success',
    },
  });
  log.push(result.stdout + result.stderr);
  if (result.error) throw result.error;
  if (result.status !== 0)
    throw new Error(`cargo ${args.join(' ')} failed: ${result.status}`);
}
function generate() {
  run([
    'run',
    '--locked',
    '--offline',
    '-p',
    'linera-inspect-schema',
    '--',
    join(root, 'guest/wit'),
  ]);
}
function build() {
  run([
    'build',
    '--locked',
    '--offline',
    '-p',
    'linera-inspect-guest',
    '--release',
    '--target',
    'wasm32-unknown-unknown',
  ]);
}
try {
  const renamedDto = originalDto.replace(
    'pub byte_length: u64',
    'pub input_byte_length: u64',
  );
  const renamedProjection = originalProjection.replace(
    'byte_length: value.byte_length',
    'input_byte_length: value.byte_length',
  );
  if (renamedDto === originalDto || renamedProjection === originalProjection)
    throw new Error('Expected source declarations missing');
  await writeFile(dtoPath, renamedDto);
  await writeFile(projectionPath, renamedProjection);
  generate();
  const renamedWit = await readFile(join(root, 'guest/wit/native.wit'), 'utf8');
  strictEqual(renamedWit.includes('input-byte-length: u64'), true);
  strictEqual(renamedWit.includes('\n        byte-length: u64'), false);
  build();
  await mkdir(join(root, 'target', 'verification'), { recursive: true });
  await writeFile(
    join(root, 'target/verification/maintenance.json'),
    JSON.stringify(
      {
        change: 'Report.byte_length -> input_byte_length',
        authoredEdits: [
          'schema/src/dto.rs: field declaration',
          'schema/src/project.rs: projected field name',
        ],
        generatedChanges: ['guest/wit/native.wit: report field'],
        unchangedAuthoredBridge: [
          'guest/src/lib.rs: with mappings and Guest implementation',
        ],
        schemaRegeneration: 'passed',
        remappedGuestCompilation: 'passed',
        ordinaryRustResultChanged: false,
        limitation:
          'This does not establish automatic propagation from the separate ordinary Rust model into the component DTO',
      },
      null,
      2,
    ) + '\n',
  );
  await writeFile(
    join(root, 'target/verification/renamed-native.wit'),
    renamedWit,
  );
} finally {
  await writeFile(dtoPath, originalDto);
  await writeFile(projectionPath, originalProjection);
  generate();
  strictEqual(
    await readFile(join(root, 'guest/wit/native.wit'), 'utf8'),
    originalWit,
  );
  build();
  await writeFile(
    join(root, 'target/verification/maintenance.log'),
    log.join('\n'),
  );
}
console.log(
  'Two authored Rust edits regenerated the WIT and compiled guest; original sources and WIT restored.',
);
