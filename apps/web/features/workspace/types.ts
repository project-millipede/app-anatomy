import type { Report as AnalysisReport } from '@apple-code/browser';
import type {
  DirectoryEntry,
  InspectionOutcome,
  SelectionOutcome,
  SelectedResource,
} from '@apple-code/browser/native';

/** Complete generated result of a native invocation. */
export type Outcome = SelectionOutcome | InspectionOutcome;

/** Presentation selected by the workbench page's view query parameter. */
export type WorkbenchView = 'base' | 'ark' | 'compare';

/** Display projection of the last observed native directory and its entries. */
export type NativeDirectoryListing = {
  /** Directory display name used as the listing's heading. */
  name: string;
  /** Immediate entries returned by Rust, including kinds the UI cannot open. */
  entries: readonly DirectoryEntry[];
};

/**
 * Native outcomes, selection data and actions for the workbench.
 * Rust owns native selection; these properties describe its presentation.
 *
 * Async action promises settle after UI handling, including handled failures or
 * ignored requests. Resolution does not establish native success.
 */
export type NativeInteraction = {
  /**
   * Whether the workbench is awaiting an operation, including loading and state queries.
   * Disables operation controls in every presentation.
   */
  operationPending: boolean;
  /**
   * Rust's complete outcome, with ordered step results and display-ready errors.
   * Cleared by the next admitted invocation; pending and host failures stay separate.
   */
  outcome: Outcome | null;
  /**
   * Message from component loading or invocation rejection, separate from declared
   * Rust results. Cleared on the next admitted invocation; non-Error rejections
   * receive a host-only fallback.
   */
  hostError: string | null;
  /**
   * Last observed file, absent when no file is selected or selection is unavailable.
   * Rust still validates the observed resource before analysis.
   */
  selectedFile?: SelectedResource;
  /** Last observed directory listing, or null when none is selected or known. */
  nativeDirectory: NativeDirectoryListing | null;

  /**
   * Request the native file dialog and present Rust's operation and selection results.
   *
   * @returns Completion of request handling, or immediately if the workbench is busy.
   */
  chooseNativeFile(): Promise<void>;
  /**
   * Request the native folder dialog and present Rust's operation and selection results.
   *
   * @returns Completion of request handling, or immediately if the workbench is busy.
   */
  chooseNativeDirectory(): Promise<void>;
  /**
   * Request selection of a file or directory from the observed native listing.
   * Rust validates that the directory and entry still belong to the current selection.
   *
   * @param entryId Identifier from nativeDirectory.entries.
   * @returns Completion of request handling, or immediately when busy or when
   * the observed entry is missing or has an unsupported kind.
   */
  openNativeEntry(entryId: number): Promise<void>;
  /**
   * Analyze the observed native file through Rust, replacing the displayed result.
   *
   * @returns Completion, or immediately when busy or no file has been observed.
   */
  inspectNative(): Promise<void>;
};

/** Observed file, pending state and actions used by the native-access controls. */
export type NativeControlsProps = Pick<
  NativeInteraction,
  | 'operationPending'
  | 'selectedFile'
  | 'chooseNativeFile'
  | 'chooseNativeDirectory'
  | 'inspectNative'
>;

/** Entry presentation and selection intent; directory ownership remains in Rust. */
export type DirectoryListingProps = Pick<
  NativeInteraction,
  'operationPending' | 'openNativeEntry'
> & {
  /** Observed listing to display; the workbench omits this component when absent. */
  directory: NativeDirectoryListing;
};

/** One inspection result for the last observed native file, held in the shared workbench model. */
export type Report = {
  /** Rust resource identifier used to match this result to observed selection. */
  resource: string;
  /** File display name captured when the inspection was requested. */
  name: string;
  /** Rust analysis result used to render binary details and architecture tabs. */
  analysis: AnalysisReport;
};

/** The displayed inspection result and its architecture-tab selection. */
export type ReportPresentation = {
  /**
   * Latest successful result, or null before success, during re-analysis, or after
   * observing a different, empty or unavailable native selection.
   */
  report: Report | null;
  /** Zero-based architecture index in the displayed result; reset on analysis start. */
  selectedSliceIndex: number;

  /**
   * Change the architecture tab in the displayed report.
   *
   * @param index Zero-based index into the report's images; bounds are not checked here.
   * @returns Nothing; updates the shared model's architecture-tab selection.
   */
  selectSlice(index: number): void;
};

/**
 * Presentation state and actions owned by the application.
 * All presentations receive this model without owning its component runtime.
 */
export type WorkbenchModel = NativeInteraction & ReportPresentation;

/** Model and layout options consumed by either workbench presentation. */
export type WorkbenchProps = {
  /** Shared state and actions supplied by the application owner. */
  model: WorkbenchModel;
  /**
   * Render inside a containing page without a standalone header, introduction or footer.
   * Defaults to false; embedding affects layout only.
   */
  embedded?: boolean;
};
