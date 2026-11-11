#!/usr/bin/env python3
"""Rename one boundary field, qualify propagation, then restore the original source."""

import difflib
import hashlib
import json
import os
from pathlib import Path
import subprocess

base = Path(__file__).resolve().parent
target = base / "target"
results = target / "verification"
results.mkdir(parents=True, exist_ok=True)
environment = os.environ.copy()
environment.update(
    RUSTUP_TOOLCHAIN="1.95.0", CARGO_NET_OFFLINE="true", WIT_INSPECT_SCENARIO="success",
    CARGO_TARGET_DIR=str(target),
)
generator = os.environ.get(
    "WITGENSTEIN_BIN", "/private/tmp/witgenstein-f915331-tool/bin/witgenstein-rs"
)
dto = base / "src/dto.rs"
projection = base / "src/project.rs"
wit = base / "wit/inspection.wit"
original = {path: path.read_bytes() for path in [dto, projection, wit]}

with (results / "maintenance-field-rename.log").open("w") as log:

    def run(arguments):
        log.write("$ " + " ".join(str(value) for value in arguments) + "\n")
        log.flush()
        result = subprocess.run(
            [str(value) for value in arguments],
            env=environment,
            stdout=log,
            stderr=subprocess.STDOUT,
        )
        log.write(f"exit={result.returncode}\n")
        log.flush()
        if result.returncode:
            raise RuntimeError("Maintenance command failed; see retained log.")

    generate = [
        generator, "generate", "--package", "apple-code:analysis@0.5.0",
        "--output", wit, base,
    ]
    try:
        text = dto.read_text()
        assert text.count("pub byte_length: u64,") == 1
        dto.write_text(text.replace("pub byte_length: u64,", "pub input_byte_length: u64,"))
        text = projection.read_text()
        assert text.count("byte_length: value.byte_length,") == 1
        projection.write_text(text.replace("byte_length: value.byte_length,", "input_byte_length: value.byte_length,"))
        run(generate)
        changed = wit.read_text()
        assert "input-byte-length: u64" in changed and "    byte-length: u64" not in changed
        (results / "maintenance-generated-wit.diff").write_text("".join(difflib.unified_diff(
            original[wit].decode().splitlines(True), changed.splitlines(True),
            fromfile="generated.wit", tofile="renamed-generated.wit",
        )))
        run(["cargo", "build", "--locked", "--manifest-path", base / "bridge/Cargo.toml", "--target", "wasm32-unknown-unknown", "--release"])
        component = results / "maintenance.wasm"
        run(["wasm-tools", "component", "new", target / "wasm32-unknown-unknown/release/wit_inspect_witgenstein_bridge.wasm", "-o", component])
        run(["node", "--experimental-wasm-jspi", base / "run-component.mjs", component, results / "jco-maintenance", results / "maintenance-result.json"])
        actual = json.loads((results / "maintenance-result.json").read_text())
        expected = json.loads((base / "src/fixtures/expected-baseline.json").read_text())["success"]
        report = expected["steps"][0]["result"]["val"]
        report["inputByteLength"] = report.pop("byteLength")
        normalized = {"steps": [{"kind": step["kind"], "result": step["stepResult"]} for step in actual["steps"]]}
        assert normalized == expected
        log.write("Full success payload matched after only the intentional byteLength->inputByteLength rename.\n")
    finally:
        dto.write_bytes(original[dto])
        projection.write_bytes(original[projection])
        run(generate)
        assert wit.read_bytes() == original[wit]
        log.write("Restored both Rust files byte-for-byte; regenerated WIT matches its original bytes.\n")
        log.write("Restored WIT sha256=" + hashlib.sha256(wit.read_bytes()).hexdigest() + "\n")

print("Field rename propagated through jco; source and generated WIT restored.")
