import type { Config } from '@jest/types';

const config: Config.InitialOptions = {
  verbose: true,
  preset: 'ts-jest',
  testEnvironment: 'node',
  transform: {
    '^.+\\.(ts|tsx)$': 'ts-jest',
  },
  projects: [
    {
      testPathIgnorePatterns: ['<rootDir>/node_modules/'],
      preset: 'ts-jest',
      displayName: 'e2e',
      testMatch: ['<rootDir>/src/**/*.spec.ts'],
      moduleFileExtensions: ['js', 'json', 'ts'],
      testEnvironment: 'node',
    }
  ],
};
export default config;
