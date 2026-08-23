import { initializeApp, getApps, cert, App } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';

export function getAdminApp(): App {
  const apps = getApps();
  if (apps.length > 0) {
    return apps[0];
  }

  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!serviceAccountJson) {
    throw new Error('Missing FIREBASE_SERVICE_ACCOUNT_JSON');
  }

  const credential = cert(JSON.parse(serviceAccountJson));
  return initializeApp({
    credential,
  });
}

export function getAdminDb() {
  const app = getAdminApp();
  const dbId = process.env.FIREBASE_FIRESTORE_DATABASE_ID;
  if (!dbId) {
    throw new Error('Missing FIREBASE_FIRESTORE_DATABASE_ID');
  }
  return getFirestore(app, dbId);
}

export function getAdminMessaging() {
  return getMessaging(getAdminApp());
}
