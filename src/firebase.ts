import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getDatabase } from 'firebase/database';

const firebaseConfig = {
  apiKey: "AIzaSyDh1mutPmoOoigDDIiZxvGoqmrA18zlABE",
  authDomain: "fftournament-bv.firebaseapp.com",
  databaseURL: "https://fftournament-bv-default-rtdb.firebaseio.com",
  projectId: "fftournament-bv",
  storageBucket: "fftournament-bv.firebasestorage.app",
  messagingSenderId: "532121731428",
  appId: "1:532121731428:web:f89b9222a5f32ef4c17a71",
  measurementId: "G-3HSHY93ZCC"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getDatabase(app);
export default app;
