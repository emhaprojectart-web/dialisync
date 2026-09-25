import { initializeApp, getApps, getApp } from 'firebase/app';
import { initializeFirestore, getFirestore, Firestore, doc, getDocFromServer } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import firebaseConfig from '../firebase-applet-config.json';

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

const dbId =
  firebaseConfig.firestoreDatabaseId && firebaseConfig.firestoreDatabaseId !== '(default)'
    ? firebaseConfig.firestoreDatabaseId
    : undefined;

let firestoreInstance: Firestore;
try {
  firestoreInstance = initializeFirestore(
    app,
    {
      experimentalForceLongPolling: true,
    },
    dbId
  );
} catch {
  firestoreInstance = dbId ? getFirestore(app, dbId) : getFirestore(app);
}

export const db: Firestore = firestoreInstance;
export const auth = getAuth(app);
export { app };

// Test connection on boot according to skill specifications
async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && (
      error.message.includes('the client is offline') || 
      error.message.includes('unavailable') ||
      error.message.includes('resource-exhausted') ||
      error.message.includes('quota')
    )) {
      console.warn('[Firebase] Operating in offline mode or waiting for connection / quota reset.');
    }
  }
}
testConnection();

