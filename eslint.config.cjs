const { buildESLintConfig } = require('@handy-common-utils/dev-dependencies-mocha');
const { defineConfig } = require('eslint/config');

const config = buildESLintConfig({ defaultSourceType: 'commonjs' });

module.exports = defineConfig([
  {
    ignores: ['lib', 'coverage', 'api-docs', 'dataflow'],
  },
  ...config,
]);
