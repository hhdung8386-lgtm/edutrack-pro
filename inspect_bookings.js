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
  const studentCode = 'HSKNRNTZ';
  console.log(`Searching for student with code ${studentCode}...`);
  const studentsSnap = await getDocs(query(collection(db, 'students'), where('code', '==', studentCode)));
  if (studentsSnap.empty) {
    console.log('Student not found');
    return;
  }
  const studentDoc = studentsSnap.docs[0];
  const student = { id: studentDoc.id, ...studentDoc.data() };
  console.log('Student details:', student);

  console.log(`Searching for booking requests for studentId: ${student.id}...`);
  const bookingsSnap = await getDocs(query(collection(db, 'bookingRequests'), where('studentId', '==', student.id)));
  console.log(`Found ${bookingsSnap.size} booking requests:`);
  bookingsSnap.forEach(d => {
    console.log(d.id, d.data());
  });
}

run().catch(console.error);
