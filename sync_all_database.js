import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, doc, updateDoc, query, limit, startAfter, where } from 'firebase/firestore';

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
  console.log(`Loaded ${Object.keys(subjectsMap).length} subjects.`);

  console.log('Fetching students...');
  const studentsSnap = await getDocs(collection(db, 'students'));
  const studentsMap = {};
  studentsSnap.forEach(d => {
    studentsMap[d.id] = { id: d.id, ...d.data() };
  });
  console.log(`Loaded ${Object.keys(studentsMap).length} students.`);

  console.log('Fetching all lessons (paginated)...');
  const lessons = [];
  let lastVisible = null;
  let hasMore = true;
  const batchSize = 200;

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

  // 4. Find all mismatched lessons
  const mismatchedLessons = [];
  lessons.forEach(lesson => {
    const student = studentsMap[lesson.studentId];
    if (!student) return;

    const expectedSubjectId = student.subjectId;
    const expectedSubjectName = student.subjectName;
    const expectedRate = subjectsMap[expectedSubjectId]?.pricePerMinute || 0;

    const hasSubjectMismatch = lesson.subjectId !== expectedSubjectId;
    const hasRateMismatch = lesson.pricePerMinute !== expectedRate;

    if (hasSubjectMismatch || hasRateMismatch) {
      mismatchedLessons.push({
        lessonId: lesson.id,
        lesson,
        student,
        expectedSubjectId,
        expectedSubjectName,
        expectedRate
      });
    }
  });

  console.log(`\nFound ${mismatchedLessons.length} desynchronized lessons to fix!`);

  if (mismatchedLessons.length === 0) {
    console.log('No desynchronized lessons found. Finished!');
    process.exit(0);
  }

  console.log('Starting parallel database migration in chunks of 50...');
  
  const chunkSize = 50;
  for (let i = 0; i < mismatchedLessons.length; i += chunkSize) {
    const chunk = mismatchedLessons.slice(i, i + chunkSize);
    console.log(`Processing batch ${Math.floor(i / chunkSize) + 1} / ${Math.ceil(mismatchedLessons.length / chunkSize)} (${chunk.length} items)...`);

    await Promise.all(chunk.map(async item => {
      const { lessonId, lesson, student, expectedSubjectId, expectedSubjectName, expectedRate } = item;
      
      const minutes = Number(lesson.minutes) || 0;
      const teacherLevel = Number(lesson.teacherLevel) || 1;
      // Recalculate salary for approved lessons based on corrected rate and teacher level multiplier
      const newSalary = lesson.status === 'approved' ? Math.round(minutes * expectedRate * teacherLevel) : 0;

      // 1. Update lesson document
      const lessonRef = doc(db, 'lessons', lessonId);
      await updateDoc(lessonRef, {
        subjectId: expectedSubjectId,
        subjectName: expectedSubjectName,
        pricePerMinute: expectedRate,
        salary: newSalary,
      });

      // 2. Query and update unpaid payroll entries associated with this lesson
      const payrollQ = query(collection(db, 'payroll'), where('lessonId', '==', lessonId));
      const payrollSnap = await getDocs(payrollQ);
      
      for (const pDoc of payrollSnap.docs) {
        const payroll = pDoc.data();
        if (!payroll.paid && !payroll.voided) {
          await updateDoc(doc(db, 'payroll', pDoc.id), {
            amount: newSalary,
            pricePerMinute: expectedRate,
            level: teacherLevel,
          });
        }
      }
    }));
    
    // Brief sleep between chunks to let Firestore breathe
    await new Promise(r => setTimeout(r, 100));
  }

  console.log('\nMigration complete! Successfully synchronized all lessons and payrolls.');
  process.exit(0);
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
