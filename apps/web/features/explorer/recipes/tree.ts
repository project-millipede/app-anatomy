import { defineSlotRecipe } from '@pandacss/dev';

const nodeText = {
  display: 'block',
  minWidth: 0,
  overflow: 'hidden',
  whiteSpace: 'nowrap',
  textOverflow: 'ellipsis',
} as const;

const row = {
  display: 'flex',
  alignItems: 'flex-start',
  gap: '0.25rem',
  minWidth: 0,
  // Keep aligned with the viewport's rowHeight in ExplorerFileTree.
  blockSize: '32px',
  paddingBlock: 'var(--tree-row-padding)',
  color: 'text',
  cursor: 'pointer',
  userSelect: 'none',
  '&:focus-visible': { outline: 'none' },
  '&:not([data-disabled]):not([data-selected]) > [data-tree-content]:hover': {
    background:
      'color-mix(in srgb, var(--acw-colors-subtle) 45%, var(--acw-colors-surface))',
  },
  '&[data-selected] > [data-tree-content]': {
    color: 'accent',
    background: 'subtle',
    borderColor: 'accent',
  },
  '&[data-focus]:focus-visible > [data-tree-content]': {
    outline: '2px solid',
    outlineColor: 'accent',
    outlineOffset: '2px',
  },
  '&[data-disabled]': {
    color: 'muted',
    cursor: 'default',
    opacity: 0.5,
  },
} as const;

/** Ark owns interactions; nested gutters and compact surfaces own presentation. */
export const tree = defineSlotRecipe({
  className: 'acw-tree',
  slots: [
    'root',
    'label',
    'tree',
    'node',
    'connector',
    'branch',
    'branchControl',
    'branchTrigger',
    'branchIndicator',
    'branchText',
    'branchContent',
    'item',
    'itemText',
    'disclosureSpacer',
    'content',
    'icon',
  ],
  base: {
    root: {
      '--tree-indent': '1.25rem',
      '--tree-disclosure-size': '1rem',
      '--tree-icon-size': '1rem',
      '--tree-row-padding': '0.25rem',
      '--tree-content-padding': '0.125rem',
      '--tree-row-anchor':
        'calc(var(--tree-row-padding) + var(--tree-content-padding) + 1px + 0.5lh)',
      display: 'flex',
      flexDirection: 'column',
      flex: 1,
      minWidth: 0,
      minHeight: 0,
    },
    label: {
      minWidth: 0,
      margin: 0,
      color: 'text',
      fontSize: 'md',
      fontWeight: 600,
      overflowWrap: 'anywhere',
    },
    tree: {
      minWidth: 0,
      margin: 0,
      // Keep aligned with the viewport's padding in ExplorerFileTree.
      padding: '3px',
      fontSize: 'sm',
      lineHeight: 1.5,
    },
    node: {
      display: 'grid',
      gridTemplateColumns: 'var(--tree-indent) minmax(0, 1fr)',
      minWidth: 0,
      '&[data-root]': {
        gridTemplateColumns: '0 minmax(0, 1fr)',
      },
      '&[data-root] > [data-tree-connector]': { display: 'none' },
      '&[data-last] > [data-tree-connector]::before': {
        insetBlockEnd: 'auto',
        blockSize: 'var(--tree-row-anchor)',
      },
      '&[data-leaf] > [data-tree-connector]::after': {
        insetInlineEnd: 'calc(-1 * var(--tree-disclosure-size))',
      },
    },
    connector: {
      gridColumn: '1',
      gridRow: '1',
      position: 'relative',
      pointerEvents: 'none',
      '&::before, &::after': {
        content: '""',
        position: 'absolute',
        insetInlineStart: 'calc(var(--tree-disclosure-size) / 2)',
        borderColor:
          'color-mix(in srgb, var(--acw-colors-muted) 40%, var(--acw-colors-surface))',
      },
      '&::before': {
        insetBlock: 0,
        borderInlineStartWidth: '1px',
        borderInlineStartStyle: 'solid',
      },
      '&::after': {
        insetBlockStart: 'var(--tree-row-anchor)',
        insetInlineEnd: 0,
        borderBlockStartWidth: '1px',
        borderBlockStartStyle: 'solid',
      },
    },
    branch: { gridColumn: '2', gridRow: '1', minWidth: 0 },
    branchControl: row,
    branchTrigger: {
      display: 'inline-grid',
      placeItems: 'center',
      flexShrink: 0,
      width: 'var(--tree-disclosure-size)',
      height: 'var(--tree-disclosure-size)',
      marginBlockStart:
        'calc(var(--tree-row-anchor) - var(--tree-row-padding) - var(--tree-disclosure-size) / 2)',
      padding: 0,
      border: 0,
      borderRadius: '0.1875rem',
      color: 'muted',
      background: 'transparent',
      cursor: 'pointer',
      '&:hover:not([data-disabled])': { color: 'accent', background: 'subtle' },
      '&[data-disabled]': { cursor: 'default' },
    },
    branchIndicator: {
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: '0.75rem',
      height: '0.75rem',
      transform: 'rotate(0deg)',
      '&[data-state="open"]': { transform: 'rotate(90deg)' },
      '& svg': { width: '100%', height: '100%' },
    },
    branchText: nodeText,
    // Leave display to Ark's collapsible content, including its hidden state.
    branchContent: { minWidth: 0 },
    item: { ...row, gridColumn: '2', gridRow: '1' },
    itemText: nodeText,
    disclosureSpacer: {
      width: 'var(--tree-disclosure-size)',
      flexShrink: 0,
      pointerEvents: 'none',
    },
    content: {
      display: 'inline-flex',
      alignItems: 'flex-start',
      gap: '0.375rem',
      width: 'fit-content',
      maxWidth: '100%',
      minWidth: 0,
      paddingBlock: 'var(--tree-content-padding)',
      paddingInline: '0.25rem',
      border: '1px solid transparent',
      borderRadius: '0.375rem',
    },
    icon: {
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: 'var(--tree-icon-size)',
      height: 'var(--tree-icon-size)',
      marginBlockStart: 'calc((1lh - var(--tree-icon-size)) / 2)',
      flexShrink: 0,
      color: 'muted',
      '& svg': { width: '100%', height: '100%' },
    },
  },
});
