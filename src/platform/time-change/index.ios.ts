import RipplesAppleModule from '../../../modules/ripples-apple/src/RipplesAppleModule';

export function addSignificantTimeChangeListener(listener: () => void): () => void {
  const subscription = RipplesAppleModule?.addListener('onSignificantTimeChange', listener);
  return () => subscription?.remove();
}
