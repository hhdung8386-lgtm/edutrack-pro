import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, doc, setDoc, deleteDoc, query, where, limit, startAfter } from 'firebase/firestore';

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
  console.log('Fetching all approved lessons from lessons collection...');
  const lessons = [];
  let lastVisible = null;
  let hasMore = true;
  const batchSize = 200;

  while (hasMore) {
    let q = query(
      collection(db, 'lessons'),
      where('status', '==', 'approved'),
      limit(batchSize)
    );
    if (lastVisible) {
      q = query(
        collection(db, 'lessons'),
        where('status', '==', 'approved'),
        startAfter(lastVisible),
        limit(batchSize)
      );
    }
    const snap = await getDocs(q);
    if (snap.empty) {
      hasMore = false;
    } else {
      snap.forEach(d => {
        lessons.push({ id: d.id, ...d.data() });
      });
      lastVisible = snap.docs[snap.docs.length - 1];
      console.log(`Fetched ${lessons.length} approved lessons...`);
    }
  }

  console.log(`\nFound ${lessons.length} approved lessons in total.`);

  console.log('Writing approved lessons to publicLessons in batches of 50...');
  const chunkSize = 50;
  for (let i = 0; i < lessons.length; i += chunkSize) {
    const chunk = lessons.slice(i, i + chunkSize);
    console.log(`Processing batch ${Math.floor(i / chunkSize) + 1} / ${Math.ceil(lessons.length / chunkSize)} (${chunk.length} items)...`);

    await Promise.all(chunk.map(async lesson => {
      const publicLessonRef = doc(db, 'publicLessons', lesson.id);
      await setDoc(publicLessonRef, {
        id: lesson.id,
        studentId: lesson.studentId,
        studentCode: lesson.studentCode,
        studentName: lesson.studentName,
        teacherId: lesson.teacherId,
        teacherCode: lesson.teacherCode || '',
        teacherName: lesson.teacherName || '',
        subjectId: lesson.subjectId,
        subjectName: lesson.subjectName || '',
        date: lesson.date,
        minutes: lesson.minutes,
        comment: lesson.comment || '',
        homework: lesson.homework || '',
        book: lesson.book || '',
        imageURLs: lesson.imageURLs || [],
        status: 'approved',
        createdAt: lesson.createdAt || null,
        approvedAt: lesson.approvedAt || null,
      });
    }));

    // Brief sleep to avoid hitting rate limits
    await new Promise(r => setTimeout(r, 100));
  }

  console.log('\nFetching all publicLessons to clean up orphaned/unapproved lessons...');
  const publicLessonsSnap = await getDocs(collection(db, 'publicLessons'));
  const approvedLessonIds = new Set(lessons.map(l => l.id));
  const orphans = [];
  publicLessonsSnap.forEach(d => {
    if (!approvedLessonIds.has(d.id)) {
      orphans.push(d.id);
    }
  });

  if (orphans.length > 0) {
    console.log(`Cleaning up ${orphans.length} orphaned/unapproved publicLessons...`);
    for (let i = 0; i < orphans.length; i += chunkSize) {
      const chunk = orphans.slice(i, i + chunkSize);
      await Promise.all(chunk.map(async id => {
        await deleteDoc(doc(db, 'publicLessons', id));
      }));
      await new Promise(r => setTimeout(r, 100));
    }
  }

  console.log('\nSynchronization complete!');
  process.exit(0);
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
