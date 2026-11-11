// Environment harness: jco supplies the component ABI; Rust performs inspection.
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { transpile } from '@bytecodealliance/jco';

const [componentPath, outputDirectory, resultPath, baselinePath, scenario] =
  process.argv.slice(2);
assert(
  componentPath && outputDirectory && resultPath,
  'Provide component, output directory and result path.',
);
assert.equal(
  typeof WebAssembly.promising,
  'function',
  'Run Node with --experimental-wasm-jspi.',
);
const output = resolve(outputDirectory);
const { files, exports } = await transpile(await readFile(componentPath), {
  name: 'inspection',
  outDir: output,
  instantiation: 'async',
  wasiShim: false,
  nodejsCompat: false,
  base64Cutoff: 0,
  namespacedExports: false,
  noComponentErrorWrapping: true,
  asyncMode: 'jspi',
  asyncExports: [
    'apple-code:analysis/wit-inspect-witgenstein@0.5.0#[method]session.inspect',
  ],
});
for (const [path, bytes] of Object.entries(files)) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, bytes);
}
const { instantiate } = await import(
  pathToFileURL(join(output, 'inspection.js')).href
);
const root = await instantiate(
  (path) =>
    readFile(join(output, path)).then((bytes) => WebAssembly.compile(bytes)),
  {},
);
const api = Object.values(root).find(
  (value) => typeof value?.Session === 'function',
);
assert(api, 'Expected the generated session resource export.');
const session = new api.Session();
const survivor = new api.Session();
assert.equal(typeof session[Symbol.dispose], 'function');
try {
  const pending = session.inspect(
    'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  );
  assert(pending instanceof Promise, 'jco must wrap inspect with JSPI.');
  const outcome = await pending;
  const encoded = JSON.stringify(
    outcome,
    (_key, value) => {
      if (typeof value === 'bigint') return { $u64: value.toString() };
      if (value === undefined) return { $undefined: true };
      return value;
    },
    2,
  );
  await writeFile(resultPath, `${encoded}\n`);
  if (baselinePath) {
    assert(scenario, 'Provide the baseline scenario name.');
    const baseline = JSON.parse(await readFile(baselinePath, 'utf8'));
    const actual = JSON.parse(encoded);
    // The candidate's concrete declaration renames only the step-result field.
    // Compare every nested field, case, value and list against production output.
    const normalized = {
      ...actual,
      steps: actual.steps.map(({ stepResult, ...step }) => ({
        ...step,
        result: stepResult,
      })),
    };
    assert.deepStrictEqual(normalized, baseline[scenario]);
  }
  session[Symbol.dispose]();
  const survivorOutcome = await survivor.inspect(
    'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  );
  assert.deepStrictEqual(
    survivorOutcome,
    outcome,
    'Dropping one resource must preserve the other session.',
  );
  const repeatedOutcome = await survivor.inspect(
    'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  );
  assert.deepStrictEqual(
    repeatedOutcome,
    outcome,
    'A retained session must support another inspection.',
  );
  console.log(
    JSON.stringify({
      exports,
      methodReturnedPromise: true,
      resultPath,
      baselineMatched: Boolean(baselinePath),
      secondResourceSurvivedDrop: true,
      repeatedInspectionMatched: true,
    }),
  );
} finally {
  session[Symbol.dispose]?.();
  survivor[Symbol.dispose]?.();
}
