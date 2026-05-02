import { initializeApp } from 'firebase/app'
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
} from 'firebase/auth'
import {
  getFirestore,
  collection,
  doc,
  setDoc,
  getDocs,
  query,
  where,
  Timestamp,
  writeBatch,
} from 'firebase/firestore'

const firebaseConfig = {
  apiKey: process.env.VITE_FIREBASE_API_KEY || 'AIzaSyB4Z2nW0_test',
  authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN || 'edutrack-test.firebaseapp.com',
  projectId: process.env.VITE_FIREBASE_PROJECT_ID || 'edutrack-test',
  storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET || 'edutrack-test.appspot.com',
  messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '123456789',
  appId: process.env.VITE_FIREBASE_APP_ID || '1:123456789:web:abc123',
}

const app = initializeApp(firebaseConfig)
const auth = getAuth(app)
const db = getFirestore(app)

const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'

function randomCode(len: number): string {
  let result = ''
  for (let i = 0; i < len; i++) {
    result += CHARS.charAt(Math.floor(Math.random() * CHARS.length))
  }
  return result
}

function generateStudentCode(): string {
  return 'HS' + randomCode(6)
}

function generateTeacherCode(): string {
  return 'GV' + randomCode(6)
}

interface Subject {
  id: string
  name: string
  pricePerMinute: number
  status: 'active' | 'inactive'
  createdAt: Timestamp
}

interface Teacher {
  id: string
  code: string
  name: string
  uid?: string
  subjectIds: string[]
  level: number
  bio: string
  photoURL: string
  status: 'active' | 'inactive'
  createdAt: Timestamp
}

interface Student {
  id: string
  code: string
  name: string
  parentPhone: string
  subjectId: string
  totalSessions: number
  usedSessions: number
  remainingSessions: number
  status: 'active' | 'inactive' | 'expired'
  createdAt: Timestamp
  updatedAt: Timestamp
}

async function seedDatabase() {
  console.log('🌱 Starting database seed...')

  try {
    // Create admin account
    console.log('\n📝 Creating admin account...')
    try {
      const adminUser = await createUserWithEmailAndPassword(auth, 'admin@edutrackpro.app', 'Admin@123')
      const adminDocRef = doc(db, 'users', adminUser.user.uid)
      await setDoc(adminDocRef, {
        uid: adminUser.user.uid,
        email: 'admin@edutrackpro.app',
        role: 'admin',
        displayName: 'Admin EduTrack',
        createdAt: Timestamp.now(),
      })
      console.log('✅ Admin account created:', adminUser.user.email)
      await signOut(auth)
    } catch (err: any) {
      if (err.code === 'auth/email-already-in-use') {
        console.log('⚠️  Admin account already exists')
      } else {
        throw err
      }
    }

    // Sign in as admin for creating other docs
    await signInWithEmailAndPassword(auth, 'admin@edutrackpro.app', 'Admin@123')

    // Create subjects
    console.log('\n📚 Creating subjects...')
    const subjects: Subject[] = [
      {
        id: 'subj_english',
        name: 'Tiếng Anh',
        pricePerMinute: 2500,
        status: 'active',
        createdAt: Timestamp.now(),
      },
      {
        id: 'subj_ielts',
        name: 'IELTS',
        pricePerMinute: 4000,
        status: 'active',
        createdAt: Timestamp.now(),
      },
      {
        id: 'subj_math',
        name: 'Toán',
        pricePerMinute: 2000,
        status: 'active',
        createdAt: Timestamp.now(),
      },
    ]

    for (const subject of subjects) {
      await setDoc(doc(db, 'subjects', subject.id), subject)
    }
    console.log('✅ Created', subjects.length, 'subjects')

    // Create teachers
    console.log('\n👨‍🏫 Creating teachers...')
    const teachers: Teacher[] = [
      {
        id: 'teacher_1',
        code: 'GV' + randomCode(6),
        name: 'Nguyễn Văn An',
        subjectIds: ['subj_english', 'subj_ielts'],
        level: 1.0,
        bio: 'Giáo viên Tiếng Anh với 5 năm kinh nghiệm giảng dạy',
        photoURL: '',
        status: 'active',
        createdAt: Timestamp.now(),
      },
      {
        id: 'teacher_2',
        code: 'GV' + randomCode(6),
        name: 'Trần Thị Bình',
        subjectIds: ['subj_ielts'],
        level: 1.2,
        bio: 'Chuyên gia IELTS, đạt 8.5 band score',
        photoURL: '',
        status: 'active',
        createdAt: Timestamp.now(),
      },
      {
        id: 'teacher_3',
        code: 'GV' + randomCode(6),
        name: 'Lê Văn Chi',
        subjectIds: ['subj_math', 'subj_english'],
        level: 1.5,
        bio: 'Giáo viên Toán cấp 2 và 3',
        photoURL: '',
        status: 'active',
        createdAt: Timestamp.now(),
      },
    ]

    for (const teacher of teachers) {
      // Create teacher account
      try {
        const teacherEmail = `${teacher.code.toLowerCase()}@edutrackpro.app`
        const teacherUser = await createUserWithEmailAndPassword(auth, teacherEmail, teacher.code)
        const userDocRef = doc(db, 'users', teacherUser.user.uid)
        await setDoc(userDocRef, {
          uid: teacherUser.user.uid,
          email: teacherEmail,
          role: 'teacher',
          teacherId: teacher.id,
          displayName: teacher.name,
          createdAt: Timestamp.now(),
        })
        teacher.uid = teacherUser.user.uid

        // Create teacher document
        await setDoc(doc(db, 'teachers', teacher.id), {
          id: teacher.id,
          code: teacher.code,
          name: teacher.name,
          uid: teacherUser.user.uid,
          subjectIds: teacher.subjectIds,
          level: teacher.level,
          bio: teacher.bio,
          photoURL: teacher.photoURL,
          status: teacher.status,
          createdAt: teacher.createdAt,
        })
      } catch (err: any) {
        if (err.code === 'auth/email-already-in-use') {
          console.log(`⚠️  Teacher ${teacher.code} account already exists, skipping creation`)
          // Still create teacher doc if it doesn't exist
          try {
            await setDoc(
              doc(db, 'teachers', teacher.id),
              {
                id: teacher.id,
                code: teacher.code,
                name: teacher.name,
                subjectIds: teacher.subjectIds,
                level: teacher.level,
                bio: teacher.bio,
                photoURL: teacher.photoURL,
                status: teacher.status,
                createdAt: teacher.createdAt,
              },
              { merge: true }
            )
          } catch (e) {
            console.log(`⚠️  Could not create teacher doc for ${teacher.code}`)
          }
        } else {
          throw err
        }
      }
    }
    console.log('✅ Created', teachers.length, 'teachers')
    await signOut(auth)

    // Create students
    console.log('\n👨‍🎓 Creating students...')
    const students: Student[] = [
      {
        id: 'student_1',
        code: generateStudentCode(),
        name: 'Phạm Văn Duy',
        parentPhone: '0987654321',
        subjectId: 'subj_english',
        totalSessions: 10,
        usedSessions: 3,
        remainingSessions: 7,
        status: 'active',
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      },
      {
        id: 'student_2',
        code: generateStudentCode(),
        name: 'Hoàng Thị Em',
        parentPhone: '0976543210',
        subjectId: 'subj_ielts',
        totalSessions: 20,
        usedSessions: 15,
        remainingSessions: 5,
        status: 'active',
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      },
      {
        id: 'student_3',
        code: generateStudentCode(),
        name: 'Trương Văn Phú',
        parentPhone: '0965432109',
        subjectId: 'subj_math',
        totalSessions: 15,
        usedSessions: 15,
        remainingSessions: 0,
        status: 'expired',
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      },
      {
        id: 'student_4',
        code: generateStudentCode(),
        name: 'Ngô Thị Giang',
        parentPhone: '0954321098',
        subjectId: 'subj_english',
        totalSessions: 8,
        usedSessions: 2,
        remainingSessions: 6,
        status: 'active',
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      },
      {
        id: 'student_5',
        code: generateStudentCode(),
        name: 'Đặng Văn Hùng',
        parentPhone: '0943210987',
        subjectId: 'subj_ielts',
        totalSessions: 12,
        usedSessions: 0,
        remainingSessions: 12,
        status: 'active',
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      },
    ]

    for (const student of students) {
      await setDoc(doc(db, 'students', student.id), student)
    }
    console.log('✅ Created', students.length, 'students')

    // Create lessons
    console.log('\n📖 Creating lessons...')
    const today = new Date()
    const lessons = [
      {
        id: 'lesson_1',
        studentId: 'student_1',
        studentCode: students[0]!.code,
        studentName: students[0]!.name,
        teacherId: 'teacher_1',
        teacherCode: teachers[0]!.code,
        teacherName: teachers[0]!.name,
        subjectId: 'subj_english',
        subjectName: 'Tiếng Anh',
        date: today.toISOString().split('T')[0],
        minutes: 50,
        comment: 'Học viên phát âm rất tốt, tiếp tục luyện tập từ vựng',
        homework: 'Làm bài tập về Present Perfect',
        imageURLs: [],
        status: 'pending' as const,
        sessionsBeforeApproval: 7,
        sessionsAfterApproval: 6,
        salary: 0,
        createdAt: Timestamp.now(),
      },
      {
        id: 'lesson_2',
        studentId: 'student_2',
        studentCode: students[1]!.code,
        studentName: students[1]!.name,
        teacherId: 'teacher_2',
        teacherCode: teachers[1]!.code,
        teacherName: teachers[1]!.name,
        subjectId: 'subj_ielts',
        subjectName: 'IELTS',
        date: new Date(today.getTime() - 1 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        minutes: 75,
        comment: 'Luyện tập speaking, trả lời tốt phần Part 1 và 2',
        homework: 'Chuẩn bị cho Part 3 của speaking',
        imageURLs: [],
        status: 'approved' as const,
        sessionsBeforeApproval: 6,
        sessionsAfterApproval: 5,
        salary: 4500,
        createdAt: Timestamp.now(),
        approvedAt: Timestamp.now(),
        approvedBy: 'admin_uid',
      },
      {
        id: 'lesson_3',
        studentId: 'student_1',
        studentCode: students[0]!.code,
        studentName: students[0]!.name,
        teacherId: 'teacher_1',
        teacherCode: teachers[0]!.code,
        teacherName: teachers[0]!.name,
        subjectId: 'subj_english',
        subjectName: 'Tiếng Anh',
        date: new Date(today.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        minutes: 50,
        comment: 'Học viên cần cải thiện listening',
        homework: 'Nghe podcast tiếng Anh 30 phút/ngày',
        imageURLs: [],
        status: 'approved' as const,
        sessionsBeforeApproval: 8,
        sessionsAfterApproval: 7,
        salary: 2500,
        createdAt: Timestamp.now(),
        approvedAt: Timestamp.now(),
        approvedBy: 'admin_uid',
      },
    ]

    const batch = writeBatch(db)
    for (const lesson of lessons) {
      batch.set(doc(db, 'lessons', lesson.id), lesson)
    }
    await batch.commit()
    console.log('✅ Created', lessons.length, 'lessons')

    // Create payroll for approved lessons
    console.log('\n💰 Creating payroll records...')
    const payrollRecords = [
      {
        id: 'payroll_1',
        teacherId: 'teacher_1',
        teacherName: teachers[0]!.name,
        lessonId: 'lesson_3',
        amount: 2500,
        minutes: 50,
        pricePerMinute: 2500,
        level: 1.0,
        month: today.toISOString().slice(0, 7),
        createdAt: Timestamp.now(),
      },
      {
        id: 'payroll_2',
        teacherId: 'teacher_2',
        teacherName: teachers[1]!.name,
        lessonId: 'lesson_2',
        amount: 4500,
        minutes: 75,
        pricePerMinute: 4000,
        level: 1.2,
        month: today.toISOString().slice(0, 7),
        createdAt: Timestamp.now(),
      },
    ]

    for (const payroll of payrollRecords) {
      await setDoc(doc(db, 'payroll', payroll.id), payroll)
    }
    console.log('✅ Created', payrollRecords.length, 'payroll records')

    console.log('\n✨ Database seed completed successfully!')
    console.log('\n📋 Test Accounts:')
    console.log('  Admin: admin@edutrackpro.app / Admin@123')
    console.log(`  Teacher 1: ${teachers[0]!.code.toLowerCase()}@edutrackpro.app / ${teachers[0]!.code}`)
    console.log(`  Teacher 2: ${teachers[1]!.code.toLowerCase()}@edutrackpro.app / ${teachers[1]!.code}`)
    console.log(`  Teacher 3: ${teachers[2]!.code.toLowerCase()}@edutrackpro.app / ${teachers[2]!.code}`)
    console.log('\n📍 Student Codes (for tracking):')
    students.forEach((s) => {
      console.log(`  ${s.name}: ${s.code}`)
    })
  } catch (error) {
    console.error('❌ Error seeding database:', error)
    process.exit(1)
  }

  process.exit(0)
}

seedDatabase()
