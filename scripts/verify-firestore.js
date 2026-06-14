/** Quick verify script — not for commit */
import { readFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

const cfg = JSON.parse(readFileSync(join(homedir(), '.config/configstore/firebase-tools.json'), 'utf8'));
const body = new URLSearchParams({
  client_id: '563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com',
  client_secret: 'j9iVZfS8kkCEFUPaAeJV0sAi',
  refresh_token: cfg.tokens.refresh_token,
  grant_type: 'refresh_token',
});
const token = await fetch('https://oauth2.googleapis.com/token', {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body,
}).then((r) => r.json());

const auth = { Authorization: `Bearer ${token.access_token}` };
const val = (f) => f?.stringValue ?? f?.booleanValue ?? f?.integerValue ?? f?.timestampValue;

const cadet = await fetch(
  'https://firestore.googleapis.com/v1/projects/tn170-attendance/databases/(default)/documents/members/754819',
  { headers: auth },
).then((r) => r.json());

const admin = await fetch(
  'https://firestore.googleapis.com/v1/projects/tn170-attendance/databases/(default)/documents/members/326320',
  { headers: auth },
).then((r) => r.json());

const settings = await fetch(
  'https://firestore.googleapis.com/v1/projects/tn170-attendance/databases/(default)/documents/settings/squadron',
  { headers: auth },
).then((r) => r.json());

const list = await fetch(
  'https://firestore.googleapis.com/v1/projects/tn170-attendance/databases/(default)/documents/members?pageSize=100',
  { headers: auth },
).then((r) => r.json());

console.log('memberCount:', list.documents?.length ?? 0);
console.log('cadet sample:', val(cadet.fields?.grade), val(cadet.fields?.role), val(cadet.fields?.isCadet));
console.log('admin sample:', val(admin.fields?.fullName), val(admin.fields?.isAdmin));
console.log('settings:', val(settings.fields?.squadronName), val(settings.fields?.squadronDesignator), val(settings.fields?.meetingStart));
