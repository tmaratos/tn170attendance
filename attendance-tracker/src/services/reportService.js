import { callFunction } from './firebase';

export async function exportReport({ actorCapid, actorPin, meetingId, format = 'csv' }) {
  const fn = callFunction('exportReport');
  const result = await fn({
    actorCapid: String(actorCapid),
    actorPin,
    meetingId: meetingId || null,
    format,
  });
  return result.data;
}

export function downloadReportContent({ content, filename, mimeType }) {
  const blob = new Blob([content], { type: mimeType || 'text/csv' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export async function exportAndDownload({ actorCapid, actorPin, meetingId, format }) {
  const data = await exportReport({ actorCapid, actorPin, meetingId, format });
  downloadReportContent({
    content: data.content,
    filename: data.filename,
    mimeType: data.mimeType,
  });
  return data;
}
