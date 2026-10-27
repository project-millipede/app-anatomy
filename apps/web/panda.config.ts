import { defineConfig } from '@pandacss/dev';
import { button } from './features/workspace/ark/recipes/button';
import { tabs } from './features/workspace/ark/recipes/tabs';
import { tree } from './features/explorer/recipes/tree';

export default defineConfig({
  preflight: false,
  presets: ['@pandacss/preset-base'],
  include: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './features/**/*.{ts,tsx}',
  ],
  exclude: [],
  outdir: 'styled-system',
  prefix: { cssVar: 'acw' },
  cssVarRoot: '.ark-theme',
  theme: {
    tokens: {
      // Compact font scale shared by Explorer styles and recipes.
      fontSizes: {
        '3xs': { value: '0.5625rem' },
        '2xs': { value: '0.625rem' },
        xs: { value: '0.6875rem' },
        sm: { value: '0.75rem' },
        md: { value: '0.8125rem' },
        lg: { value: '1.0625rem' },
        xl: { value: '1.125rem' },
        '2xl': { value: '1.25rem' },
      },
    },
    semanticTokens: {
      borders: {
        divider: { value: '1px solid {colors.border}' },
      },
      colors: {
        background: { value: 'light-dark(#f5f7fa, #10141b)' },
        surface: { value: 'light-dark(#ffffff, #171e28)' },
        subtle: { value: 'light-dark(#edf1f6, #202a37)' },
        text: { value: 'light-dark(#162338, #e6edf7)' },
        muted: { value: 'light-dark(#526078, #a5b2c7)' },
        border: { value: 'light-dark(#dce3ec, #344154)' },
        accent: { value: 'light-dark(#2657d5, #93b6ff)' },
        'accent-fill': { value: 'light-dark(#244fbc, #9abbff)' },
        'on-accent': { value: 'light-dark(#fff, #102144)' },
        error: { value: 'light-dark(#9f2828, #ffaaaa)' },
      },
    },
    recipes: { button },
    slotRecipes: { tabs, tree },
  },
});
