use super::*;

type ExpandedPath = (String, Option<ImageId>, Option<&'static str>);

pub(super) fn normalize(path: &str) -> Option<String> {
    if !path.starts_with('/') || path.contains('\0') {
        return None;
    }
    let mut parts = Vec::new();
    for part in path.split('/') {
        match part {
            "" | "." => {}
            ".." => {
                parts.pop();
            }
            value => parts.push(value),
        }
    }
    Some(format!("/{}", parts.join("/")))
}

pub(super) fn parent(path: &str) -> &str {
    path.rsplit_once('/')
        .map(|(head, _)| if head.is_empty() { "/" } else { head })
        .unwrap_or("/")
}

fn join(base: &str, value: &str) -> Option<String> {
    normalize(&if value.starts_with('/') {
        value.to_owned()
    } else {
        format!("{base}/{value}")
    })
}

impl Inventory {
    /// Evaluate only supplied inventory facts, returning all exact-CPU candidates.
    ///
    /// Absolute, @loader_path, @executable_path and explicit ordered @rpath
    /// contexts are supported. Subtype compatibility, environment overrides,
    /// shared caches and runtime loader policy are deliberately unqualified.
    pub fn resolve(
        &self,
        id: RelationshipId,
        context: &ResolutionContext,
    ) -> Result<Resolution, InventoryError> {
        self.validate_context(context)?;
        let relation = self
            .relationship(id)
            .ok_or_else(|| InventoryError("relationship is missing or foreign".into()))?;
        let mut result = Resolution {
            relationship: id,
            status: ResolutionStatus::Unresolved,
            candidates: Vec::new(),
            attempts: Vec::new(),
            note: None,
        };
        let unsupported = |mut result: Resolution, message: &str| {
            result.status = ResolutionStatus::Unsupported;
            result.note = Some(message.into());
            result
        };
        if relation
            .source_image
            .and_then(|id| self.image(id))
            .is_some_and(|image| image.cpu != context.architecture)
        {
            return Ok(unsupported(
                result,
                "referring image does not match the exact requested CPU identity",
            ));
        }
        let dependency = matches!(&relation.evidence, Evidence::Dependency { .. });
        let expanded = match &relation.evidence {
            Evidence::Dependency { install_name, .. } => {
                let Ok(name) = std::str::from_utf8(install_name) else {
                    return Ok(unsupported(
                        result,
                        "non-UTF-8 install-name path interpretation is unsupported",
                    ));
                };
                self.expand_dependency(name, relation.source_image, context)
            }
            Evidence::Alias { .. } => Ok(vec![(
                self.entry(relation.source).unwrap().path.clone(),
                None,
                None,
            )]),
            Evidence::ResourcePath { path, base } => join(&self.entry(*base).unwrap().path, path)
                .map(|path| vec![(path, None, None)])
                .ok_or("resource path contains unsupported characters"),
            Evidence::ResourceString { value, base } => {
                join(&self.entry(*base).unwrap().path, value)
                    .map(|path| vec![(path, None, None)])
                    .ok_or("resource mention contains unsupported characters")
            }
        };
        let paths = match expanded {
            Ok(paths) => paths,
            Err(message) => return Ok(unsupported(result, message)),
        };
        for (path, runpath_owner, unsupported_note) in paths {
            if let Some(note) = unsupported_note {
                result.attempts.push(Attempt {
                    final_path: path.clone(),
                    path,
                    runpath_owner,
                    outcome: AttemptOutcome::Unsupported,
                    aliases: Vec::new(),
                    note: Some(note.into()),
                });
                continue;
            }
            let (final_path, aliases, error) = self.follow_aliases(&path);
            let outcome = if let Some(error) = error {
                error
            } else if let Some(entry) = self.paths.get(&final_path).copied() {
                if dependency {
                    let matches: Vec<_> = self
                        .images
                        .iter()
                        .filter(|image| image.entry == entry && image.cpu == context.architecture)
                        .collect();
                    if matches.is_empty() {
                        AttemptOutcome::ArchitectureMismatch
                    } else {
                        for image in matches {
                            if !result.candidates.iter().any(|candidate| {
                                candidate.entry == entry && candidate.image == Some(image.id)
                            }) {
                                result.candidates.push(Candidate {
                                    entry,
                                    image: Some(image.id),
                                    path: final_path.clone(),
                                    aliases: aliases.clone(),
                                });
                            }
                        }
                        AttemptOutcome::Matched
                    }
                } else {
                    if !result
                        .candidates
                        .iter()
                        .any(|candidate| candidate.entry == entry && candidate.aliases == aliases)
                    {
                        result.candidates.push(Candidate {
                            entry,
                            image: None,
                            path: final_path.clone(),
                            aliases: aliases.clone(),
                        });
                    }
                    AttemptOutcome::Matched
                }
            } else if aliases.is_empty() {
                AttemptOutcome::Missing
            } else {
                AttemptOutcome::BrokenAlias
            };
            result.attempts.push(Attempt {
                path,
                final_path,
                runpath_owner,
                outcome,
                aliases,
                note: (outcome == AttemptOutcome::AliasLimitExceeded).then(|| format!(
                    "alias evaluation reached its {MAX_ALIAS_EXPANSIONS}-expansion budget; no repeated traversal state proved a cycle"
                )),
            });
        }
        result.status = if !result.candidates.is_empty() {
            ResolutionStatus::Candidates
        } else if result
            .attempts
            .iter()
            .any(|attempt| attempt.outcome == AttemptOutcome::AliasLimitExceeded)
            || (!result.attempts.is_empty()
                && result
                    .attempts
                    .iter()
                    .all(|attempt| attempt.outcome == AttemptOutcome::Unsupported))
        {
            ResolutionStatus::Unsupported
        } else if !result.attempts.is_empty()
            && result
                .attempts
                .iter()
                .all(|attempt| attempt.outcome == AttemptOutcome::External)
        {
            ResolutionStatus::External
        } else {
            ResolutionStatus::Unresolved
        };
        Ok(result)
    }

    fn image_directory(&self, image: ImageId) -> &str {
        parent(&self.entry(self.image(image).unwrap().entry).unwrap().path)
    }

    fn expand_simple(
        &self,
        path: &str,
        loader: Option<ImageId>,
        executable: Option<ImageId>,
    ) -> Result<String, &'static str> {
        if path.starts_with('/') {
            return normalize(path).ok_or("path contains unsupported characters");
        }
        for (token, image) in [("@loader_path", loader), ("@executable_path", executable)] {
            if path == token
                || path
                    .strip_prefix(token)
                    .is_some_and(|tail| tail.starts_with('/'))
            {
                let image = image.ok_or("path requires an explicit image context")?;
                return join(
                    self.image_directory(image),
                    path.strip_prefix(token).unwrap().trim_start_matches('/'),
                )
                .ok_or("path contains unsupported characters");
            }
        }
        Err("relative install names and unknown path tokens are unsupported")
    }

    fn expand_dependency(
        &self,
        path: &str,
        loader: Option<ImageId>,
        context: &ResolutionContext,
    ) -> Result<Vec<ExpandedPath>, &'static str> {
        if let Some(tail) = path.strip_prefix("@rpath/") {
            if context.runpaths.is_empty() {
                return Err("@rpath requires an explicit ordered runpath context");
            }
            let mut paths = Vec::new();
            for runpath in &context.runpaths {
                match self
                    .expand_simple(&runpath.path, Some(runpath.owner), context.executable)
                    .and_then(|base| {
                        join(&base, tail).ok_or("path contains unsupported characters")
                    }) {
                    Ok(path) => paths.push((path, Some(runpath.owner), None)),
                    Err(note) => paths.push((
                        format!("{}/{tail}", runpath.path),
                        Some(runpath.owner),
                        Some(note),
                    )),
                }
            }
            Ok(paths)
        } else {
            self.expand_simple(path, loader, context.executable)
                .map(|path| vec![(path, None, None)])
        }
    }

    fn follow_aliases(&self, initial: &str) -> (String, Vec<EntryId>, Option<AttemptOutcome>) {
        let mut path = initial.to_owned();
        let mut aliases = Vec::new();
        let mut visited_states = HashSet::new();
        loop {
            if !self.contains(&path) {
                return (path, aliases, Some(AttemptOutcome::External));
            }
            let alias = self
                .entries
                .iter()
                .filter(|entry| {
                    entry.kind == EntryKind::Alias
                        && (path == entry.path
                            || path
                                .strip_prefix(&entry.path)
                                .is_some_and(|tail| tail.starts_with('/')))
                })
                .max_by_key(|entry| entry.path.len());
            let Some(alias) = alias else {
                return (path, aliases, None);
            };
            if !visited_states.insert(path.clone()) {
                return (path, aliases, Some(AttemptOutcome::AliasCycle));
            }
            if aliases.len() == MAX_ALIAS_EXPANSIONS {
                return (path, aliases, Some(AttemptOutcome::AliasLimitExceeded));
            }
            aliases.push(alias.id);
            let target = &self.aliases[&alias.id];
            let Some(target) = join(parent(&alias.path), target) else {
                return (path, aliases, Some(AttemptOutcome::BrokenAlias));
            };
            let suffix = &path[alias.path.len()..];
            let Some(next) = normalize(&format!("{target}{suffix}")) else {
                return (path, aliases, Some(AttemptOutcome::BrokenAlias));
            };
            path = next;
        }
    }
}
