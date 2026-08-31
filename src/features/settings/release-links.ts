// validated https release links; a development build carries none, and the
// spec requires an explicit missing-link state instead of a dead tap.
// production validation fails when a required value is absent.

export type ReleaseLinkKey =
  | 'feedback'
  | 'appStoreReview'
  | 'moreProducts'
  | 'privacyPolicy'
  | 'termsOfUse';

const RELEASE_LINKS: Record<ReleaseLinkKey, string | null> = {
  feedback: null,
  appStoreReview: null,
  moreProducts: null,
  privacyPolicy: null,
  termsOfUse: null,
};

export function releaseLink(
  key: ReleaseLinkKey,
  links: Record<ReleaseLinkKey, string | null> = RELEASE_LINKS,
): string | null {
  const value = links[key];
  if (value !== null && !value.startsWith('https://')) {
    return null;
  }
  return value;
}
