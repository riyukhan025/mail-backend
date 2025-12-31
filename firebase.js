import firebase from 'firebase/compat/app';
import 'firebase/compat/auth';
import 'firebase/compat/database';
import 'firebase/compat/storage';
import { getDatabase } from 'firebase/database';

// Your Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyDgHoYSwGv03sr_gk_xpwSlqUKrruMwSkA",
  authDomain: "spacesolutions2-89738.firebaseapp.com",
  databaseURL: "https://spacesolutions2-89738-default-rtdb.firebaseio.com",
  projectId: "spacesolutions2-89738",
  storageBucket: "spacesolutions2-89738.appspot.com",
  messagingSenderId: "579229154553",
  appId: "1:579229154553:web:8fe908a402100d5b57f628",
};

// Initialize Firebase only once
let app;
if (!firebase.apps.length) {
  app = firebase.initializeApp(firebaseConfig);
} else {
  app = firebase.app();
}

const db = getDatabase(app);

// Optional: Connect to Firebase emulators for local development
// if (__DEV__) {
//   try {
//     const host = Platform.OS === 'android' ? '10.0.2.2' : 'localhost';
//     // For physical devices, replace with your local machine IP, e.g., '192.168.1.7'
    
//     const db = firebase.database();
//     db.useEmulator(host, 9000);

//     const storage = firebase.storage();
//     const auth = firebase.auth();
//     auth.useEmulator(`http://${host}:9099`);
//     storage.useEmulator(host, 9199);
//   } catch (e) {
//     console.log("Emulator connection error. A full app restart might be needed.", e);
//   }
// }

export { db };
export default firebase;