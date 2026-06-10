import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyB-iN_Fb3-Q5yOWkYdv_1NHU8rVtIihjLs",
  authDomain: "edutrack-pro-78f59.firebaseapp.com",
  projectId: "edutrack-pro-78f59",
  storageBucket: "edutrack-pro-78f59.firebasestorage.app",
  messagingSenderId: "322037569883",
  appId: "1:322037569883:web:cdd3c15775092fb160227e",
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function run() {
  const subjectsSnap = await getDocs(collection(db, 'subjects'));
  console.log('--- ALL SUBJECTS ---');
  subjectsSnap.forEach(d => {
    console.log(d.id, d.data());
  });
}

run().catch(console.error);
