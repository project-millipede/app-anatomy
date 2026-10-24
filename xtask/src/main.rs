//! Download upstream WIT unchanged, then resolve it through wkg.

use anyhow::{Context, Result, bail, ensure};
use std::{collections::BTreeMap, fs, path::Path, process::Command};

// Latest upstream HEAD verified on 2026-09-27. Update deliberately, not per build.
const REVISION: &str = "736c46d8eb7eae6ff766e83a7401a4a36f5a9601";
const WIT_DIRECTORY: &str = "wkg/wit";
const LICENSE: &str = "LICENSE.polymorph-websocket";
// Upstream source path -> local dependency path. File contents are never edited.
const DOWNLOADS: &[(&str, &str)] = &[
    (
        "wit/websocket.wit",
        "polymorph-websocket-0.1.0/websocket.wit",
    ),
    ("LICENSE", LICENSE),
];

fn main() -> Result<()> {
    let root = Path::new(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .context("xtask must be directly inside the repository")?;
    let arguments: Vec<_> = std::env::args().skip(1).collect();
    match arguments.as_slice() {
        [group, action] if group == "wit" && action == "fetch" => fetch(root),
        [group, action] if group == "wit" && action == "check" => check(root),
        _ => bail!("usage: cargo run -p app-anatomy-xtask -- wit <fetch|check>"),
    }
}

fn fetch(root: &Path) -> Result<()> {
    let directory = root.join("wkg");
    let vendor = directory.join("vendor");
    let dependencies = root.join(WIT_DIRECTORY).join("deps");

    // Finish every download before replacing any local source files.
    let mut downloads = Vec::new();
    for (source, destination) in DOWNLOADS {
        let url = format!(
            "https://raw.githubusercontent.com/polymorph-components/polymorph-websocket/{REVISION}/{source}"
        );
        let response = Command::new("curl")
            .args([
                "--disable",
                "--fail",
                "--silent",
                "--show-error",
                "--location",
                "--max-time",
                "60",
                &url,
            ])
            .output()
            .with_context(|| format!("failed to download {url}; install curl"))?;
        ensure!(
            response.status.success(),
            "download failed for {url}: {}",
            String::from_utf8_lossy(&response.stderr)
        );
        downloads.push((destination, response.stdout));
    }

    for (destination, bytes) in &downloads {
        let path = vendor.join(destination);
        fs::create_dir_all(path.parent().context("download has no parent directory")?)?;
        fs::write(&path, bytes).with_context(|| format!("failed to write {}", path.display()))?;
    }

    // In wkg 0.16.0, this mode copies local WIT unchanged. `--type wit` reprints it.
    let status = Command::new("wkg")
        .args(["fetch", "wit", "--type", "wasm"])
        .current_dir(&directory)
        .status()
        .context("failed to run wkg; install with: cargo install wkg --version 0.16.0 --locked")?;
    ensure!(status.success(), "wkg fetch failed: {status}");
    fs::copy(vendor.join(LICENSE), dependencies.join(LICENSE))?;

    // Compare the compiler inputs against the actual HTTP response bytes.
    for (destination, bytes) in downloads {
        let path = dependencies.join(destination);
        ensure!(
            fs::read(&path).with_context(|| format!("failed to read {}", path.display()))? == bytes,
            "{} differs from the upstream download; refusing to build",
            path.display()
        );
    }

    println!("WIT matches upstream commit {REVISION} byte for byte.");
    Ok(())
}

fn check(root: &Path) -> Result<()> {
    let before = snapshot(root)?;
    fetch(root)?;
    ensure!(
        before == snapshot(root)?,
        "WIT dependencies changed; review the refreshed files and wkg/wkg.lock, then rerun wit:check"
    );
    println!("WIT dependencies are current.");
    Ok(())
}

fn snapshot(root: &Path) -> Result<BTreeMap<String, Vec<u8>>> {
    let mut files = BTreeMap::new();
    collect(root, &root.join(WIT_DIRECTORY).join("deps"), &mut files)?;
    let lock = root.join("wkg/wkg.lock");
    if lock.exists() {
        files.insert("wkg/wkg.lock".to_owned(), fs::read(lock)?);
    }
    Ok(files)
}

fn collect(root: &Path, directory: &Path, files: &mut BTreeMap<String, Vec<u8>>) -> Result<()> {
    if !directory.exists() {
        return Ok(());
    }
    for entry in fs::read_dir(directory)? {
        let path = entry?.path();
        if path.is_dir() {
            collect(root, &path, files)?;
            continue;
        }
        let name = path
            .strip_prefix(root)?
            .to_string_lossy()
            .replace(std::path::MAIN_SEPARATOR, "/");
        files.insert(name, fs::read(path)?);
    }
    Ok(())
}
