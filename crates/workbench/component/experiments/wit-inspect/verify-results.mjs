// Verification only: compare complete trees against the unchanged production oracle.
// These adaptations account for Fidius's enum/result ABI and native Serde spelling;
// no missing report/diagnostic field is reconstructed or discarded.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const results = new URL('./target/verification/', import.meta.url);
const baseline = JSON.parse(
  await readFile(
    new URL('./src/fixtures/expected-baseline.json', import.meta.url),
    'utf8',
  ),
);
const pascal = (name) =>
  name
    .split('-')
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join('');

function enumTag(value) {
  assert.deepStrictEqual(Object.keys(value).sort(), ['tag']);
  return value.tag;
}

function report(value) {
  return {
    ...value,
    container: enumTag(value.container),
    containerEndianness: enumTag(value.containerEndianness),
    scope: enumTag(value.scope),
    images: value.images.map((image) => ({
      ...image,
      headerFormat: enumTag(image.headerFormat),
      endianness: enumTag(image.endianness),
    })),
  };
}

function failure(value) {
  return {
    ...value,
    details: value.details.map((detail) =>
      detail.tag === 'source'
        ? {
            ...detail,
            val: { ...detail.val, operation: enumTag(detail.val.operation) },
          }
        : detail,
    ),
  };
}

function normalizeJco(outcome) {
  return {
    ...outcome,
    steps: outcome.steps.map(({ kind, stepResult, ...rest }) => {
      assert.deepStrictEqual(Object.keys(stepResult).sort(), ['tag', 'val']);
      assert(['success', 'failure'].includes(stepResult.tag));
      return {
        ...rest,
        kind: enumTag(kind),
        result:
          stepResult.tag === 'success'
            ? { tag: 'ok', val: report(stepResult.val) }
            : { tag: 'err', val: failure(stepResult.val) },
      };
    }),
  };
}

const enumFields = new Set([
  'kind',
  'container',
  'containerEndianness',
  'scope',
  'headerFormat',
  'endianness',
  'operation',
]);

// Match native observation serialization after the actual generated Fidius ABI call.
function baselineAsNative(value, field) {
  if (Array.isArray(value)) return value.map((item) => baselineAsNative(item));
  if (value !== null && typeof value === 'object') {
    if ('$u64' in value) {
      const number = Number(value.$u64);
      assert(
        Number.isSafeInteger(number),
        'native JSON observation requires a safe fixture integer',
      );
      return number;
    }
    if ('$undefined' in value) return null;
    if ('tag' in value) {
      const tag =
        field === 'result'
          ? { ok: 'Success', err: 'Failure' }[value.tag]
          : pascal(value.tag);
      return 'val' in value ? { [tag]: baselineAsNative(value.val) } : tag;
    }
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key === 'result'
          ? 'step_result'
          : key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`),
        baselineAsNative(item, key),
      ]),
    );
  }
  return typeof value === 'string' && enumFields.has(field)
    ? pascal(value)
    : value;
}

for (const [scenario, expected] of Object.entries(baseline)) {
  const native = JSON.parse(
    await readFile(new URL(`native-${scenario}.json`, results), 'utf8'),
  );
  const jco = JSON.parse(
    await readFile(new URL(`jco-${scenario}.json`, results), 'utf8'),
  );
  assert.deepStrictEqual(
    native,
    baselineAsNative(expected),
    `${scenario}: native generated ABI`,
  );
  assert.deepStrictEqual(
    normalizeJco(jco),
    expected,
    `${scenario}: jco/JSPI complete tree`,
  );
  console.log(
    `PASS ${scenario}: native generated ABI and jco/JSPI match the complete production oracle`,
  );
}
