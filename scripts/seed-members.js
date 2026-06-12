/**
 * Seed TN-170 squadron roster into Firestore.
 *
 * Usage:
 *   FIREBASE_PROJECT_ID=your-project-id npm run seed:members
 *
 * Requires Application Default Credentials:
 *   firebase login
 *   gcloud auth application-default login
 * Or set GOOGLE_APPLICATION_CREDENTIALS to a service account key path.
 */

import { initializeApp, applicationDefault, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

const PIN_RESET_CAPIDS = new Set([
  '326320', // Maj Steven C Mellard
  '249023', // 1st Lt Ernest E Burchell
  '757794', // 2d Lt Tonya M Osborne
  '702226', // 1st Lt Mel W Osborne
  '740617', // 2d Lt Tyler M Thomas
  '729204', // 2d Lt Tristan G Maratos
]);

const ROSTER_LINES = `
362254 Maj Lemont T Adrian
706279 2d Lt Janelle C Allison
712652 C/CMSgt Seth Aubre Beers
754819 C/SrA Jordan Gavin Botts
249023 1st Lt Ernest E Burchell
775740 CADET Isaac T Cannon
743307 C/SrA Karlie Chase
744144 2d Lt Rebecca J Chretien
744143 2d Lt Everett J Chretien
721598 C/SrA Lily Grace Cole
759751 C/A1C Aiden Bryce Cooper
766637 SM Guy R Cooper
743923 C/A1C Ethan Moses Corey
764706 SM Andrew Diaz
763051 CADET Adalynn Calli Duncan
735120 2d Lt Margaret A Durgin
731444 C/SrA Alexis Mahalia Hackworth
766638 SM Amanda L Harvey
759756 C/A1C Cali Mae Harvey
759753 C/A1C Madelyn Pearl Harvey
760274 C/Amn Owen Grant Hunt
411177 1st Lt Zachary D Johnson Jr
711242 C/CMSgt Hope Mariah Johnson
450227 Maj Clarence M Juneau
725171 C/A1C Emma Rose Kirby
778674 CADET Lucas Joseph Manuel
729204 2d Lt Tristan G Maratos
326320 Maj Steven C Mellard
736465 SM Desiree Morse
750086 C/SrA Matthew A Newman
757794 2d Lt Tonya M Osborne
702226 1st Lt Mel W Osborne
776446 CADET Lillionya Lamae Pinkerton
719566 C/SMSgt Marley Amaris Puska
621484 SM Sandra L Puska
754798 C/A1C Silas Rivers Puska
739522 C/SrA Andrew Schwartzenberger
744012 C/SrA Jocelyn Elizabeth Slagle
712573 C/SrA Angelina Kylie Smith
735480 C/CMSgt Thomas Morgan Stratton
577946 1st Lt Annabelle Thomas
740617 2d Lt Tyler M Thomas
778696 CADET Joshua-jaden Thomas
735602 C/SrA Logan Allen Viars
270831 Maj Timothy S Waddell
744650 C/SrA Gideon Michael Zeal Waldroup
743315 C/SrA Reagan Rockwell Waldroup
657945 2d Lt Anthony A Warthan
662670 2d Lt Colleen J Warthan
702416 C/TSgt Garrett Tage Warthan
738555 SM Jesse W Wilkie
734587 C/MSgt Tucker Reed Wilkie
`.trim().split('\n').map((l) => l.trim()).filter(Boolean);

function parseGradeAndName(tokens) {
  let gradeEnd = 1;
  if ((tokens[1] === '1st' || tokens[1] === '2d') && tokens[2] === 'Lt') {
    gradeEnd = 3;
  }
  const grade = tokens.slice(1, gradeEnd).join(' ');
  const nameTokens = tokens.slice(gradeEnd);
  const firstName = nameTokens[0] || '';
  const lastName = nameTokens.length > 1 ? nameTokens[nameTokens.length - 1] : firstName;
  const middleName = nameTokens.length > 2 ? nameTokens.slice(1, -1).join(' ') : '';
  const fullName = nameTokens.join(' ');
  const displayName = middleName
    ? `${firstName} ${middleName} ${lastName}`
    : `${firstName} ${lastName}`;
  return { grade, firstName, middleName, lastName, fullName, displayName };
}

function parseRole(grade) {
  const upper = grade.toUpperCase();
  if (upper.startsWith('C/') || upper === 'CADET') {
    return { role: 'Cadet', isCadet: true, isSeniorMember: false };
  }
  return { role: 'Senior Member', isCadet: false, isSeniorMember: true };
}

function parseRosterLine(line) {
  const tokens = line.split(/\s+/);
  const capid = tokens[0];
  const { grade, firstName, middleName, lastName, fullName, displayName } = parseGradeAndName(tokens);
  const roleInfo = parseRole(grade);
  const isSenior = roleInfo.isSeniorMember;

  return {
    capid,
    grade,
    firstName,
    middleName,
    lastName,
    fullName,
    displayName,
    ...roleInfo,
    hasPin: false,
    pinResetRequired: false,
    canResetPins: PIN_RESET_CAPIDS.has(capid),
    canExportReports: isSenior,
    active: true,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  };
}

function initAdmin() {
  const projectId = process.env.FIREBASE_PROJECT_ID || process.env.GCLOUD_PROJECT;
  if (!projectId) {
    console.error('Set FIREBASE_PROJECT_ID to your Firebase project ID.');
    process.exit(1);
  }

  const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (credPath && existsSync(credPath)) {
    const serviceAccount = JSON.parse(readFileSync(credPath, 'utf8'));
    initializeApp({ credential: cert(serviceAccount), projectId });
  } else {
    initializeApp({ credential: applicationDefault(), projectId });
  }

  return getFirestore();
}

async function seedMembers() {
  const db = initAdmin();
  const batch = db.batch();
  const members = ROSTER_LINES.map(parseRosterLine);

  console.log(`Seeding ${members.length} members...`);

  for (const member of members) {
    const ref = db.collection('members').doc(member.capid);
    batch.set(ref, member, { merge: true });
  }

  const settingsRef = db.collection('settings').doc('squadron');
  batch.set(settingsRef, {
    squadronName: 'Oak Ridge Composite Squadron',
    squadronDesignator: 'TN-170',
    motto: 'Not Without Effort',
    meetingDay: 'Tuesday',
    meetingStart: '18:30',
    meetingEnd: '21:30',
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });

  await batch.commit();

  const seniors = members.filter((m) => m.isSeniorMember).length;
  const cadets = members.filter((m) => m.isCadet).length;
  const pinResetters = members.filter((m) => m.canResetPins).length;

  console.log('Seed complete.');
  console.log(`  Total: ${members.length}`);
  console.log(`  Senior Members: ${seniors}`);
  console.log(`  Cadets: ${cadets}`);
  console.log(`  PIN reset authorized: ${pinResetters}`);
}

seedMembers().catch((err) => {
  console.error('Seed failed:', err.message);
  process.exit(1);
});
