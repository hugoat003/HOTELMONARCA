// Lint del código compartido y del servidor (el frontend tiene su propia configuración).
// Usa las dependencias ya instaladas en frontend/ para no duplicarlas en la raíz.
import js from './frontend/node_modules/@eslint/js/src/index.js';
import globals from './frontend/node_modules/globals/index.js';

export default [
  { ignores: ['frontend/**', 'docs/**', '**/node_modules/**', 'backend/data/**'] },
  js.configs.recommended,
  {
    files: ['shared/**/*.js', 'backend/**/*.js', 'eslint.config.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: { ...globals.node, ...globals.browser },
    },
    rules: {
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', ignoreRestSiblings: true }],
    },
  },
];
