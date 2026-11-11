#!/usr/bin/env python3
"""Build and qualify the generated-schema/manual-bridge path against production."""

import json
import os
from pathlib import Path
import shutil
import subprocess

BASE = Path(__file__).resolve().parent
REPOSITORY = BASE.parents[4]
TARGET = BASE / "target"
RESULTS = TARGET / "verification"
WIT = BASE / "wit/inspection.wit"
EXPECTED = BASE / "src/fixtures/expected-baseline.json"
SCENARIOS = [
    "success",
    "selection-failure",
    "metadata-failure",
    "unsupported-image",
    "read-failure",
]
ENVIRONMENT = os.environ.copy()
ENVIRONMENT.update(
    RUSTUP_TOOLCHAIN="1.95.0", CARGO_NET_OFFLINE="true", CARGO_TARGET_DIR=str(TARGET)
)
GENERATOR = os.environ.get(
    "WITGENSTEIN_BIN", "/private/tmp/witgenstein-f915331-tool/bin/witgenstein-rs"
)


def run(arguments, log_name, environment=ENVIRONMENT, expected=0):
    """Record the exact invocation and retain its complete diagnostic output."""
    with (RESULTS / log_name).open("w") as log:
        log.write("$ " + " ".join(str(value) for value in arguments) + "\n")
        log.flush()
        process = subprocess.run(
            [str(value) for value in arguments],
            cwd=REPOSITORY,
            env=environment,
            stdout=log,
            stderr=subprocess.STDOUT,
        )
        log.write(f"exit={process.returncode}\n")
    if process.returncode != expected:
        raise RuntimeError(f"Unexpected exit {process.returncode}; see {log_name}")


RESULTS.mkdir(parents=True, exist_ok=True)
run(
    ["cargo", "test", "--locked", "--manifest-path", BASE / "Cargo.toml"],
    "native-five-scenarios.log",
)
run(
    [GENERATOR, "generate", "--package", "apple-code:analysis@0.5.0", "--output", WIT, BASE],
    "generate.log",
)
# Preseed only a dependency lockfile, never generated Rust or WIT source.
wrapper = BASE / "target/witgenstein/component"
wrapper.mkdir(parents=True, exist_ok=True)
shutil.copyfile(BASE / "support/stock-wrapper.lock", wrapper / "Cargo.lock")
run(
    [GENERATOR, "build", "--package", "apple-code:analysis@0.5.0", BASE],
    "shipped-build.log",
    expected=1,
)
diagnostic = (RESULTS / "shipped-build.log").read_text()
if "error[E0425]" not in diagnostic or "InspectionOutcome" not in diagnostic:
    raise RuntimeError("The shipped build failed before the recorded delegate error.")
shutil.copyfile(wrapper / "src/lib.rs", RESULTS / "shipped-wrapper.rs")
shutil.copyfile(wrapper / "Cargo.toml", RESULTS / "shipped-wrapper-Cargo.toml")
statuses = []
for scenario in SCENARIOS:
    environment = ENVIRONMENT.copy()
    environment["WIT_INSPECT_SCENARIO"] = scenario
    run(
        ["cargo", "run", "--locked", "--manifest-path", BASE / "native-control/Cargo.toml"],
        f"native-control-{scenario}.log",
        environment,
    )
    run(
        ["cargo", "build", "--locked", "--manifest-path", BASE / "bridge/Cargo.toml", "--target", "wasm32-unknown-unknown", "--release"],
        f"bridge-{scenario}.log",
        environment,
    )
    component = RESULTS / f"{scenario}.wasm"
    run(
        ["wasm-tools", "component", "new", TARGET / "wasm32-unknown-unknown/release/wit_inspect_witgenstein_bridge.wasm", "-o", component],
        f"component-{scenario}.log",
        environment,
    )
    run(
        ["node", "--experimental-wasm-jspi", BASE / "run-component.mjs", component, RESULTS / f"jco-{scenario}", RESULTS / f"{scenario}.json", EXPECTED, scenario],
        f"jco-{scenario}.log",
        environment,
    )
    statuses.append({"scenario": scenario, "fullTreeMatched": True})
(RESULTS / "full-payload-comparison.json").write_text(json.dumps(statuses, indent=2) + "\n")
print("Native facade and jco/JSPI full payload comparison passed for all five scenarios.")
