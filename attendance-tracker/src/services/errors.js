export function getCallableError(error) {
  if (!error) return 'Request failed';
  const code = error.code || '';
  const message = error.message || error.details;
  if (
    code === 'permission-denied' ||
    code === 'PERMISSION_DENIED' ||
    /missing or insufficient permissions/i.test(String(message))
  ) {
    return 'Permission denied. Firestore security rules may need to be deployed — ask an admin to run: firebase deploy --only firestore:rules';
  }
  if (code === 'functions/internal' || message === 'internal') {
    return 'Server error. Cloud Functions may be unavailable — try again or contact an admin.';
  }
  if (typeof message === 'string' && message) {
    return message.replace(/^Firebase:\s*/i, '').replace(/\s*\([^)]*\)\.?$/g, '').trim() || message;
  }
  return 'Request failed';
}
