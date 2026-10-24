import { defineRecipe } from '@pandacss/dev';

export const button = defineRecipe({
  className: 'acw-button',
  staticCss: ['*'],
  base: {
    padding: '0.75rem 1rem',
    borderRadius: '0.45rem',
    fontSize: '0.875rem',
    fontWeight: 600,
    border: '1px solid',
    borderColor: 'border',
  },
  variants: {
    variant: {
      primary: {
        background: 'accent-fill',
        color: 'on-accent',
        borderColor: 'transparent',
        '&:hover:not(:disabled)': { filter: 'brightness(0.95)' },
      },
      secondary: {
        background: 'surface',
        color: 'text',
        '&:hover:not(:disabled)': { filter: 'brightness(0.95)' },
      },
      artifact: {
        width: '100%',
        textAlign: 'left',
        color: 'text',
        background: 'transparent',
        borderColor: 'transparent',
        borderRadius: '0.4rem',
        padding: '0.85rem 0.65rem',
        overflowWrap: 'anywhere',
        fontWeight: 400,
        '& small': {
          display: 'block',
          color: 'muted',
          fontSize: '0.75rem',
          marginTop: '0.4rem',
        },
        '&[aria-pressed="true"]': {
          background: 'subtle',
          borderColor: 'border',
        },
      },
    },
  },
  defaultVariants: { variant: 'secondary' },
});
