export { APP_VERSION, APP_NAME, APP_DESCRIPTION } from '@shelvarr/services/constants';

export const BUILD_VERSION = process.env.NEXT_PUBLIC_BUILD_VERSION || 'dev';

const frameworkVersion = process.env.NEXT_PUBLIC_FRAMEWORK_VERSION || '';

// "Next.js 16.2.11" once Next has injected the installed version; bare
// "Next.js" outside a Next build (unit tests, tooling).
export const FRAMEWORK = frameworkVersion
  ? `Next.js ${frameworkVersion}`
  : 'Next.js';

export const REPOSITORY_URL = 'https://github.com/markcipolla/Shelvarr';
