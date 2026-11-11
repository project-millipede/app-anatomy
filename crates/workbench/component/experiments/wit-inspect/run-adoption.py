#!/usr/bin/env python3
"""Exercise the real generated native and Wasm boundaries with five fixture seeds."""
import json
import os
from pathlib import Path
import subprocess

BASE = Path(__file__).resolve().parent
RESULTS = BASE / 'target/verification'
ENVIRONMENT = dict(os.environ, RUSTUP_TOOLCHAIN='1.95.0', CARGO_NET_OFFLINE='true')
SCENARIOS = ['success', 'selection-failure', 'metadata-failure', 'unsupported-image', 'read-failure']


def run(args, log_name, environment=ENVIRONMENT, output_name=None):
    process = subprocess.run([str(arg) for arg in args], cwd=BASE, env=environment, text=True, capture_output=True)
    (RESULTS / log_name).write_text('$ RUSTUP_TOOLCHAIN=1.95.0 ' + ' '.join(str(arg) for arg in args) + '\n' + process.stdout + process.stderr + '\nexit=' + str(process.returncode) + '\n')
    if process.returncode:
        raise RuntimeError('Command failed; see ' + log_name)
    if output_name:
        value = json.loads(process.stdout)
        (RESULTS / output_name).write_text(json.dumps(value, indent=2) + '\n')


RESULTS.mkdir(parents=True, exist_ok=True)
run(['cargo', 'test', '--locked', '--offline', '--features', 'host', '--lib', '--manifest-path', BASE / 'Cargo.toml'], 'native-tests.log')
for scenario in SCENARIOS:
    environment = dict(ENVIRONMENT, WIT_INSPECT_SCENARIO=scenario)
    run(['cargo', 'run', '--locked', '--offline', '--features', 'host', '--manifest-path', BASE / 'Cargo.toml', '--bin', 'native'], 'native-' + scenario + '.log', environment, 'native-' + scenario + '.json')
    run(['cargo', 'build', '--locked', '--offline', '--target', 'wasm32-wasip2', '--release', '--lib', '--manifest-path', BASE / 'Cargo.toml'], 'wasm-' + scenario + '.log', environment)
    run(['node', '--experimental-wasm-jspi', BASE / 'run-jco.mjs', BASE / 'target/wasm32-wasip2/release/wit_inspect_fidius_adoption.wasm', BASE / ('target/adoption-jco/' + scenario)], 'jco-' + scenario + '.log', environment, 'jco-' + scenario + '.json')
run(['node', BASE / 'verify-results.mjs'], 'verification.log')
print('Five generated native ABI and five generated guest/JSPI full-tree comparisons passed.')
