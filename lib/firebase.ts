import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyAPPi-UxUxyMvoNeaBLUOPOls63dEDLUmI",
  authDomain: "volunserve-3aa5b.firebaseapp.com",
  projectId: "volunserve-3aa5b",
  storageBucket: "volunserve-3aa5b.firebasestorage.app",
  messagingSenderId: "233201250762",
  appId: "1:233201250762:web:c50ff914c6107b1f68df33",
};

const app = initializeApp(firebaseConfig);

export const db = getFirestore(app);
export const auth = getAuth(app);