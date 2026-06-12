export function getCallableError(error) {
  if (!error) return 'Request failed';
  if (typeof error.message === 'string' && error.message) return error.message;
  if (error.details) return String(error.details);
  return 'Request failed';
}
