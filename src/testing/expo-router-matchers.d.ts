// expo-router/testing-library registers these jest matchers at runtime
// (expo-router/build/testing-library/expect.js), but the shipped
// expect.d.ts is empty, so the type augmentation is declared here.
// remove when expo-router publishes the augmentation itself.
declare namespace jest {
  interface Matchers<R> {
    toHavePathname(pathname: string): R;
    toHavePathnameWithParams(pathname: string): R;
    toHaveSegments(segments: string[]): R;
    toHaveSearchParams(params: Record<string, string | string[]>): R;
    toHaveRouterState(state: Record<string, unknown>): R;
  }
}
