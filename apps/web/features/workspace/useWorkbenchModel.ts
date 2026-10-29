'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  AsyncSession,
  InspectionOutcome,
  SelectionOutcome,
  SelectionState,
} from '@apple-code/browser/native';
import type { Outcome, Report, WorkbenchModel } from './types';

/**
 * Read selection data from a successful step without inventing an empty selection.
 * @param outcome Ordered selection steps returned by Rust.
 * @returns Native selection data, or null when the query did not succeed.
 */
function selectionFromOutcome(
  outcome: SelectionOutcome,
): SelectionState | null {
  for (const step of outcome.steps) {
    if (step.result.tag !== 'ok') continue;
    if (step.result.val !== undefined) return step.result.val;
  }
  return null;
}

/**
 * Own shared presentation state and coordinate UI invocations.
 * useNativeSession owns the component runtime; Rust owns native selection.
 * @param getNativeSession Accessor for the existing component's generated WIT session.
 * @returns Rust outcomes, the current report and presentation actions.
 */
export function useWorkbenchModel(
  getNativeSession: () => Promise<AsyncSession | null>,
): WorkbenchModel {
  const activeOperation = useRef<object | null>(null);
  // Unavailable selection data differs from a successful empty native selection.
  const [selectionState, setSelectionState] = useState<SelectionState | null>(
    null,
  );
  const [operationPending, setOperationPending] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [hostError, setHostError] = useState<string | null>(null);
  const [report, setReport] = useState<Report | null>(null);
  const [selectedSliceIndex, setSelectedSliceIndex] = useState(0);
  const selectedFile = selectionState?.file;
  const nativeDirectory = selectionState?.directory
    ? { name: selectionState.directory.name, entries: selectionState.entries }
    : null;

  /**
   * Prevent overlapping invocations before React renders the pending state.
   * @returns A fresh object for this invocation, or null while the workbench is busy.
   */
  const beginOperation = useCallback((): object | null => {
    if (activeOperation.current) return null;
    const operation = {};
    activeOperation.current = operation;
    setOperationPending(true);
    setOutcome(null);
    setHostError(null);
    return operation;
  }, []);

  /**
   * Retain Rust's full outcome and update selection-dependent presentation.
   * @param outcome Ordered step results from a selection request or query.
   * @returns Nothing; clears reports for a different or unavailable selection.
   */
  const applySelectionOutcome = useCallback((outcome: SelectionOutcome) => {
    setOutcome(outcome);
    const state = selectionFromOutcome(outcome);
    setSelectionState(state);
    if (state === null) {
      setReport(null);
      return;
    }
    // Names can repeat; only Rust's resource identity associates a result with selection.
    setReport((current) =>
      current?.resource === state.file?.resource ? current : null,
    );
  }, []);

  /**
   * Clear the pending state when the matching invocation finishes.
   * @param operation The object retained when this invocation started.
   * @returns Nothing; ignores completions that no longer belong to the active invocation.
   */
  const finishOperation = useCallback((operation: object) => {
    if (activeOperation.current !== operation) return;
    activeOperation.current = null;
    setOperationPending(false);
  }, []);

  /**
   * Present the completed steps of a selection operation from Rust.
   * @param request The selection operation exposed by the component binding.
   * @returns Completion of UI handling, or immediately when the workbench is busy.
   */
  const runSelection = useCallback(
    async (request: (session: AsyncSession) => Promise<SelectionOutcome>) => {
      const operation = beginOperation();
      if (!operation) return;
      try {
        const session = await getNativeSession();
        if (!session || activeOperation.current !== operation) return;
        const outcome = await request(session);
        if (activeOperation.current !== operation) return;
        applySelectionOutcome(outcome);
        return outcome;
      } catch (caught) {
        if (activeOperation.current !== operation) return;
        setSelectionState(null);
        setReport(null);
        setHostError(
          caught instanceof Error
            ? caught.message
            : 'Host execution failed without an error message.',
        );
      } finally {
        finishOperation(operation);
      }
    },
    [applySelectionOutcome, beginOperation, finishOperation, getNativeSession],
  );

  /**
   * Start the initial selection query for this mounted workbench.
   * @returns Cleanup immediately to prevent late results from updating the workbench.
   */
  const initializeWorkbench = useCallback((): (() => void) => {
    runSelection((session) => session.querySelection());

    return () => {
      // Ignore late UI results without cancelling native work.
      activeOperation.current = null;
    };
  }, [runSelection]);

  useEffect(initializeWorkbench, [initializeWorkbench]);

  /**
   * Ask Rust to open the native file dialog.
   * @returns Completion of the request's presentation updates, or immediately when busy.
   */
  const chooseNativeFile = useCallback(async () => {
    await runSelection((session) => session.chooseFile());
  }, [runSelection]);

  /**
   * Ask Rust to open the native folder dialog.
   * @returns Completion of the request's presentation updates, or immediately when busy.
   */
  const chooseNativeDirectory = useCallback(async () => {
    await runSelection((session) => session.chooseFolder());
  }, [runSelection]);

  const chooseNativeApplication = useCallback(async () => {
    await runSelection((session) => session.chooseApplication());
  }, [runSelection]);

  const chooseNativeBinary = useCallback(async () => {
    await runSelection((session) => session.chooseBinary());
  }, [runSelection]);

  /**
   * Forward an observed entry choice; Rust validates its directory and resource.
   * @param entryId Identifier from the last observed directory listing.
   * @returns Completion, or immediately for a missing/unsupported entry or busy view.
   */
  const openNativeEntry = useCallback(
    async (entryId: number, parentDirectory?: string) => {
      const directory = parentDirectory ?? selectionState?.directory?.resource;
      if (!directory) return;
      const entries = parentDirectory
        ? selectionState?.directories.find(
            (listing) => listing.directory.resource === directory,
          )?.entries
        : selectionState?.entries;
      const entry = entries?.find((entry) => entry.id === entryId);
      if (!entry) return;

      if (entry.kind === 'directory') {
        await runSelection((session) =>
          session.openDirectory(directory, entry.id),
        );
      } else if (entry.kind === 'file') {
        await runSelection((session) => session.openFile(directory, entry.id));
      }
    },
    [runSelection, selectionState],
  );

  const expandNativeDirectory = useCallback(
    async (
      parentDirectory: string,
      entryId: number,
    ): Promise<SelectionState> => {
      if (activeOperation.current)
        throw new Error('Another operation is in progress. Try again.');
      const observed = await runSelection((session) =>
        session.expandDirectory(parentDirectory, entryId),
      );
      if (!observed)
        throw new Error('Directory expansion was not completed. Try again.');
      const failed = observed.steps.find((step) => step.result.tag === 'err');
      if (failed?.result.tag === 'err')
        throw new Error(failed.result.val.message);
      const state = selectionFromOutcome(observed);
      const listing = state?.directories.find(
        (listing) =>
          listing.parent?.directory === parentDirectory &&
          listing.parent.entryId === entryId,
      );
      if (!listing)
        throw new Error(
          'No loaded directory snapshot was returned. Try again.',
        );
      return state!;
    },
    [runSelection],
  );

  /**
   * Present an inspection outcome for the observed file using the shared guard.
   * @param request Generated-session operation to invoke for the retained resource.
   * @returns Completion, or immediately when busy or without an observed file.
   */
  const runInspection = useCallback(
    async (
      request: (
        session: AsyncSession,
        resource: string,
      ) => Promise<InspectionOutcome>,
    ) => {
      if (!selectedFile) return;
      const operation = beginOperation();
      if (!operation) return;
      const { name, resource } = selectedFile;
      setReport(null);
      setSelectedSliceIndex(0);
      try {
        const session = await getNativeSession();
        if (!session || activeOperation.current !== operation) return;
        // Rust validates the resource; presentation never substitutes another file.
        const outcome = await request(session, resource);
        if (activeOperation.current !== operation) return;
        setOutcome(outcome);
        for (const step of outcome.steps) {
          if (step.result.tag !== 'ok') continue;
          setReport({ resource, name, analysis: step.result.val });
          return;
        }
      } catch (caught) {
        if (activeOperation.current !== operation) return;
        setHostError(
          caught instanceof Error
            ? caught.message
            : 'Host execution failed without an error message.',
        );
      } finally {
        finishOperation(operation);
      }
    },
    [beginOperation, finishOperation, getNativeSession, selectedFile],
  );

  const inspectNative = useCallback(
    () => runInspection((session, resource) => session.inspect(resource)),
    [runInspection],
  );

  const inspectNativeDependencies = useCallback(
    () =>
      runInspection((session, resource) =>
        session.inspectDependencies(resource),
      ),
    [runInspection],
  );

  return {
    operationPending,
    outcome,
    hostError,
    selectedFile,
    nativeDirectory,
    nativeWorkspace: selectionState,
    report,
    selectedSliceIndex,
    chooseNativeFile,
    chooseNativeDirectory,
    chooseNativeApplication,
    chooseNativeBinary,
    openNativeEntry,
    expandNativeDirectory,
    inspectNative,
    inspectNativeDependencies,
    selectSlice: setSelectedSliceIndex,
  };
}
