// @ts-check
import eslint from '@eslint/js';
import eslintPluginPrettierRecommended from 'eslint-plugin-prettier/recommended';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const src = path.join(__dirname, 'src');
const modulesDir = path.join(src, 'modules');

// Every bounded-context folder under src/modules.
const contextNames = [
  'identity',
  'clinic-content',
  'publishing',
  'care-coordination',
  'client-patient-records',
  'commerce',
  'pharmacy-authorisation',
  'care-messaging',
  'notifications',
  'operations',
];

/**
 * Boundary guard (§10): build one no-restricted-imports block per context that
 * forbids importing any *other* context's internals, and forbids `shared/`
 * from importing any module.
 */
const boundaryRules = contextNames.flatMap((ctx) => {
  const otherContexts = contextNames.filter((c) => c !== ctx).map((c) => `${c}/*`);
  return [
    {
      files: [path.join(modulesDir, ctx, '**', '*.ts')],
      rules: {
        'no-restricted-imports': [
          'error',
          {
            patterns: [
              {
                group: otherContexts,
                message:
                  'Cross-context imports are forbidden (§10). Use the target context\'s facade port or an integration event.',
              },
            ],
          },
        ],
      },
    },
  ];
});

export default tseslint.config(
  {
    ignores: ['eslint.config.mjs', 'src/generated/**'],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  eslintPluginPrettierRecommended,
  {
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.jest,
      },
      sourceType: 'commonjs',
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-floating-promises': 'warn',
      '@typescript-eslint/no-unsafe-argument': 'warn',
      "prettier/prettier": ["error", { endOfLine: "auto" }],
    },
  },
  // §10 rule 6 — shared/ is dependency-free; it must never import a module.
  {
    files: [path.join(src, 'shared', '**', '*.ts')],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [path.join(src, 'modules', '*').replace(/\\/g, '/')],
              message:
                'shared/ must never import from modules/ (§10 rule 6). It is dependency-free infrastructure.',
            },
          ],
        },
      ],
    },
  },
  // §10 rule 5 — prisma client access is limited to repositories, src/prisma,
  // and the generated output itself.
  {
    files: [path.join(src, 'modules', '**', '*.ts')],
    ignores: [path.join(modulesDir, '**', 'infrastructure', 'repositories', '**', '*.ts')],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/generated/prisma/**', '../../generated/**', '../../../generated/**'],
              message:
                'Prisma may only be imported inside infrastructure/repositories/ (§10 rule 5).',
            },
          ],
        },
      ],
    },
  },
  ...boundaryRules,
);
