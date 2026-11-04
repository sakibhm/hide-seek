
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously } from 'firebase/auth';
import { getDatabase } from 'firebase/database';

const firebaseConfig = {
  apiKey: "AIzaSyCJnk_ShA3MXhaVBEV_qTKsWCfVH45xUMc",
  authDomain: "hide-seek-f4380.firebaseapp.com",
  projectId: "hide-seek-f4380",
  storageBucket: "hide-seek-f4380.firebasestorage.app",
  messagingSenderId: "433275744729",
  appId: "1:433275744729:web:a8c8ee5bd7df5c39ce29c8",
  measurementId: "G-LQ92Y19E32"
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getDatabase(
  app,
  'https://hide-seek-f4380-default-rtdb.asia-southeast1.firebasedatabase.app'
);

export async function initializePlayer() {
  const result = await signInAnonymously(auth);
  return result.user;
}
