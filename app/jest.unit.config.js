module.exports = {
  roots: ['<rootDir>/src/', '<rootDir>/test/'],
  transform: {
    '^.+\\.tsx?$': 'ts-jest',
    '\\.m?jsx?$': '<rootDir>/test/esm-transformer.js',
  },
  resolver: `<rootDir>/test/resolver.js`,
  testMatch: ['**/unit/**/*-test.ts{,x}'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  setupFiles: ['<rootDir>/test/globals.ts', '<rootDir>/test/unit-test-env.ts'],
  setupFilesAfterEnv: ['<rootDir>/test/setup-test-framework.ts'],
  reporters: ['default', '<rootDir>../script/jest-actions-reporter.js'],
  // ESM-only Node modules (e.g. @github, uuid, mem) must be transformed to CJS by esm-transformer
  transformIgnorePatterns: [
    'node_modules/(?!(@github|dexie|fake-indexeddb|uuid|strip-ansi|ansi-regex|p-limit|yocto-queue|quick-lru|untildify|mem|mimic-function|mimic-fn|marked|chalk|compare-versions))',
  ],
  testEnvironment: 'jsdom',
}
