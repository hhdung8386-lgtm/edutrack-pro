import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, query, limit, startAfter } from 'firebase/firestore';

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
  console.log('Fetching subjects...');
  const subjectsSnap = await getDocs(collection(db, 'subjects'));
  const subjectsMap = {};
  subjectsSnap.forEach(d => {
    subjectsMap[d.id] = { id: d.id, ...d.data() };
  });
  console.log(`Fetched ${Object.keys(subjectsMap).length} subjects.`);

  console.log('Fetching students...');
  const studentsSnap = await getDocs(collection(db, 'students'));
  const studentsMap = {};
  studentsSnap.forEach(d => {
    studentsMap[d.id] = { id: d.id, ...d.data() };
  });
  console.log(`Fetched ${Object.keys(studentsMap).length} students.`);

  console.log('Fetching lessons (paginated)...');
  const lessons = [];
  let lastVisible = null;
  let hasMore = true;
  const batchSize = 100;

  while (hasMore) {
    let q = query(collection(db, 'lessons'), limit(batchSize));
    if (lastVisible) {
      q = query(collection(db, 'lessons'), startAfter(lastVisible), limit(batchSize));
    }
    const snap = await getDocs(q);
    if (snap.empty) {
      hasMore = false;
    } else {
      snap.forEach(d => {
        lessons.push({ id: d.id, ...d.data() });
      });
      lastVisible = snap.docs[snap.docs.length - 1];
      console.log(`Fetched ${lessons.length} lessons...`);
    }
  }

  let totalDesync = 0;
  console.log('--- FINDING DESYNC LESSONS ---');
  lessons.forEach(lesson => {
    const student = studentsMap[lesson.studentId];
    if (!student) {
      return;
    }

    const expectedSubjectId = student.subjectId;
    const expectedSubjectName = student.subjectName;
    const expectedRate = subjectsMap[expectedSubjectId]?.pricePerMinute || 0;

    const hasSubjectMismatch = lesson.subjectId !== expectedSubjectId;
    const hasRateMismatch = lesson.pricePerMinute !== expectedRate;

    if (hasSubjectMismatch || hasRateMismatch) {
      totalDesync++;
      if (totalDesync <= 30) {
        console.log(`Mismatch #${totalDesync}: Lesson ${lesson.id}`);
        console.log(`  Student: ${student.name} (Code: ${student.code})`);
        console.log(`  Lesson date: ${lesson.date}, status: ${lesson.status}`);
        console.log(`  Lesson stored subject: ${lesson.subjectName} (${lesson.subjectId}), rate: ${lesson.pricePerMinute}`);
        console.log(`  Student current subject: ${expectedSubjectName} (${expectedSubjectId}), rate: ${expectedRate}`);
      }
    }
  });

  console.log(`\nTotal desynchronized lessons found: ${totalDesync} / ${lessons.length}`);
  console.log('Finished. Exiting...');
  process.exit(0);
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
