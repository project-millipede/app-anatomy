import { defineSlotRecipe } from '@pandacss/dev';

export const tabs = defineSlotRecipe({
  className: 'acw-tabs',
  slots: ['list', 'trigger', 'content'],
  base: {
    list: {
      display: 'flex',
      flexWrap: 'wrap',
      gap: '0.5rem',
      borderBottom: '1px solid',
      borderColor: 'border',
      marginTop: '2rem',
    },
    trigger: {
      minWidth: 0,
      overflowWrap: 'anywhere',
      background: 'transparent',
      color: 'muted',
      padding: '0.85rem 1rem',
      border: 0,
      borderBottom: '2px solid transparent',
      fontSize: '0.875rem',
      '&[data-selected]': {
        color: 'accent',
        borderBottomColor: 'accent',
      },
    },
    content: {
      paddingTop: '1.5rem',
      '& h3': {
        fontSize: '0.9375rem',
        marginTop: '1.75rem',
        fontWeight: 600,
      },
      '& > p': { fontSize: '0.875rem' },
    },
  },
});
