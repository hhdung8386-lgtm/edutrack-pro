import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, query, where } from 'firebase/firestore';

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
  const dates = ['2026-05-23', '2026-05-19'];
  for (const date of dates) {
    console.log(`\n--- LESSONS ON ${date} ---`);
    const q = query(collection(db, 'lessons'), where('studentName', '==', 'TRIAL STUDENT'), where('date', '==', date));
    const snap = await getDocs(q);
    snap.forEach(d => {
      console.log(d.id, d.data());
    });
  }
}

run().catch(console.error);
