export const SCANNER_GAP_MS = 120;

export function extractCapid(raw) {
  const value = String(raw || '').trim();
  const exact = value.match(/^\d{6,8}$/);
  if (exact) return exact[0];
  const embedded = value.match(/(?:^|\D)(\d{6,8})(?:\D|$)/);
  return embedded?.[1] || '';
}

export function isFormControl(target) {
  const tag = String(target?.tagName || '').toLowerCase();
  return tag === 'input' || tag === 'textarea' || tag === 'select' || Boolean(target?.isContentEditable);
}

