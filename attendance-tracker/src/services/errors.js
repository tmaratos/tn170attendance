export function getCallableError(error) {
  if (!error) return 'Request failed';
  const message = error.message || error.details;
  if (typeof message === 'string' && message) {
    return message.replace(/^Firebase:\s*/i, '').replace(/\s*\([^)]*\)\.?$/g, '').trim() || message;
  }
  return 'Request failed';
}
