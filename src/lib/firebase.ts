import { getApp, getApps, initializeApp } from 'firebase/app';
import {
  GoogleAuthProvider,
  getAuth,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  type Unsubscribe,
  type User,
  type UserCredential,
} from 'firebase/auth';
import { doc, getDoc, getFirestore, serverTimestamp, setDoc } from 'firebase/firestore';

// Firebase web configuration is public app identification, not an admin credential.
export const firebaseConfig = {
  apiKey: 'AIzaSyAO1uqh_EbQ4mhSjzqFV8V0zxm_CJlHNKc',
  authDomain: 'guitar-juno.firebaseapp.com',
  projectId: 'guitar-juno',
  storageBucket: 'guitar-juno.firebasestorage.app',
  messagingSenderId: '309373361756',
  appId: '1:309373361756:web:8dcb2404134abd9a2ad099',
};

export const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

/** Call directly from a click event so browsers allow the Google popup. */
export function loginWithGoogle(): Promise<UserCredential> {
  return signInWithPopup(auth, googleProvider);
}

export function logout(): Promise<void> {
  return signOut(auth);
}

export function subscribeAuth(callback: (user: User | null) => void): Unsubscribe {
  return onAuthStateChanged(auth, callback);
}

function assertCurrentAccount(uid: string) {
  if (!uid || auth.currentUser?.uid !== uid) {
    throw new Error('로그인한 계정의 설정만 사용할 수 있습니다.');
  }
}

function preferencesDocument(uid: string) {
  assertCurrentAccount(uid);
  return doc(db, 'users', uid, 'preferences', 'main');
}

export async function loadPreferences(uid: string): Promise<Record<string, unknown> | null> {
  const snapshot = await getDoc(preferencesDocument(uid));
  // An account can change while the request is in flight. Never deliver the old
  // account's response to the caller after that transition.
  assertCurrentAccount(uid);
  if (!snapshot.exists()) return null;
  const settings: unknown = snapshot.data().settings;
  return settings && typeof settings === 'object' && !Array.isArray(settings)
    ? settings as Record<string, unknown>
    : null;
}

export async function savePreferences(uid: string, data: Record<string, unknown>): Promise<void> {
  // Persist preferences only. Audio never leaves the browser.
  // Do not merge the settings map: removed favorites/settings must also be removed.
  await setDoc(preferencesDocument(uid), {
    schemaVersion: 1,
    settings: JSON.parse(JSON.stringify(data)) as Record<string, unknown>,
    updatedAt: serverTimestamp(),
  });
}
