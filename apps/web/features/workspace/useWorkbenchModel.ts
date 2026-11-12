'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  AsyncSession,
  InspectionOutcome,
  SelectionOutcome,
  SelectionState,
} from '@apple-code/browser/native';
import { DirectoryExpansionError } from './DirectoryExpansionError';
import type {
  DirectoryExpansion,
  OperationFeedback,
  Report,
  WorkbenchModel,
} from './types';

/** UI completion data; incomplete invocations have no published failure to reuse. */
type SelectionCompletion =
  | {
      /** A complete outcome was published for this invocation. */
      readonly status: 'outcome';
      /** Identity retained when the invocation was admitted. */
      readonly operation: object;
      /** Original generated selection outcome, including every failed step. */
      readonly outcome: SelectionOutcome;
    }
  | {
      /** A host rejection was published separately from Rust outcomes. */
      readonly status: 'host-error';
      /** Identity retained when the invocation was admitted. */
      readonly operation: object;
      /** Same host diagnostic supplied to the presentation. */
      readonly message: string;
    }
  | {
      /** The request was busy, unavailable or no longer current. */
      readonly status: 'incomplete';
      /** Original invocation identity, when a request was admitted. */
      readonly operation: object | null;
    };

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
  const [feedback, setFeedback] = useState<OperationFeedback>({
    operation: null,
    pending: false,
    outcome: null,
    hostError: null,
  });
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
    setFeedback({ operation, pending: true, outcome: null, hostError: null });
    return operation;
  }, []);

  /**
   * Update selection-dependent presentation from Rust's full outcome.
   * @param outcome Ordered step results from a selection request or query.
   * @returns Nothing; clears reports for a different or unavailable selection.
   */
  const applySelectionOutcome = useCallback((outcome: SelectionOutcome) => {
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
    setFeedback((current) => {
      if (current.operation !== operation) return current;
      return { ...current, pending: false };
    });
  }, []);

  /**
   * Present the completed steps of a selection operation from Rust.
   * @param request The selection operation exposed by the component binding.
   * @returns Published completion data, or the identity of an incomplete invocation.
   */
  const runSelection = useCallback(
    async (
      request: (session: AsyncSession) => Promise<SelectionOutcome>,
    ): Promise<SelectionCompletion> => {
      const operation = beginOperation();
      if (!operation)
        return { status: 'incomplete', operation: activeOperation.current };
      try {
        const session = await getNativeSession();
        if (!session || activeOperation.current !== operation)
          return { status: 'incomplete', operation };
        const outcome = await request(session);
        if (activeOperation.current !== operation)
          return { status: 'incomplete', operation };
        setFeedback({ operation, pending: true, outcome, hostError: null });
        applySelectionOutcome(outcome);
        return { status: 'outcome', operation, outcome };
      } catch (caught) {
        if (activeOperation.current !== operation)
          return { status: 'incomplete', operation };
        setSelectionState(null);
        setReport(null);
        const message =
          caught instanceof Error
            ? caught.message
            : 'Host execution failed without an error message.';
        setFeedback({
          operation,
          pending: true,
          outcome: null,
          hostError: message,
        });
        return { status: 'host-error', operation, message };
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
   * @param parentDirectory Explicit loaded parent; omit to use the current directory.
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

  /**
   * Load a directory and identify which UI boundary owns any rejection.
   * @param parentDirectory Observed parent directory resource.
   * @param entryId Entry identifier scoped to that parent listing.
   * @returns The loaded selection and its invocation identity.
   */
  const expandNativeDirectory = useCallback(
    async (
      parentDirectory: string,
      entryId: number,
    ): Promise<DirectoryExpansion> => {
      if (activeOperation.current)
        throw new DirectoryExpansionError(
          'Another operation is in progress. Try again.',
          activeOperation.current,
          'tree',
        );
      const completion = await runSelection((session) =>
        session.expandDirectory(parentDirectory, entryId),
      );
      if (completion.status === 'incomplete')
        throw new DirectoryExpansionError(
          'Directory expansion was not completed. Try again.',
          completion.operation,
          'tree',
        );
      if (completion.status === 'host-error')
        throw new DirectoryExpansionError(
          completion.message,
          completion.operation,
          'operation',
        );
      const { operation, outcome } = completion;
      for (const step of outcome.steps) {
        if (step.result.tag !== 'err') continue;
        throw new DirectoryExpansionError(
          step.result.val.message,
          operation,
          'operation',
        );
      }
      const state = selectionFromOutcome(outcome);
      if (state === null)
        throw new DirectoryExpansionError(
          'No loaded directory snapshot was returned. Try again.',
          operation,
          'tree',
        );
      const hasDirectoryListing = state.directories.some(
        (listing) =>
          listing.parent?.directory === parentDirectory &&
          listing.parent.entryId === entryId,
      );
      if (!hasDirectoryListing)
        throw new DirectoryExpansionError(
          'No loaded directory snapshot was returned. Try again.',
          operation,
          'tree',
        );
      return { selection: state, operation };
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
        setFeedback({ operation, pending: true, outcome, hostError: null });
        for (const step of outcome.steps) {
          if (step.result.tag !== 'ok') continue;
          setReport({ resource, name, analysis: step.result.val });
          return;
        }
      } catch (caught) {
        if (activeOperation.current !== operation) return;
        const message =
          caught instanceof Error
            ? caught.message
            : 'Host execution failed without an error message.';
        setFeedback({
          operation,
          pending: true,
          outcome: null,
          hostError: message,
        });
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
    feedback,
    operationPending: feedback.pending,
    outcome: feedback.outcome,
    hostError: feedback.hostError,
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
