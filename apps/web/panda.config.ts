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
    semanticTokens: {
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
