const fs = require('node:fs')
const path = require('node:path')
const { after, before, beforeEach, test } = require('node:test')
const {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} = require('@firebase/rules-unit-testing')
const {
  collection,
  deleteField,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} = require('firebase/firestore')

const PROJECT_ID = 'demo-edutrack-pro-rules'
const ADMIN_UID = 'admin-rules-test'
const STUDENT_MANAGER_UID = 'student-manager-rules-test'
const TEACHER_MANAGER_UID = 'teacher-manager-rules-test'
const TEACHER_UID = 'teacher-rules-test'
const INACTIVE_TEACHER_UID = 'inactive-teacher-rules-test'
const RESIGNED_TEACHER_UID = 'resigned-teacher-rules-test'
const LEGACY_RECOVERED_TEACHER_UID = 'legacy-recovered-teacher-rules-test'

let testEnvironment

before(async () => {
  testEnvironment = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: fs.readFileSync(path.resolve(__dirname, '..', 'firestore.rules'), 'utf8'),
    },
  })
})

beforeEach(async () => {
  await testEnvironment.clearFirestore()
  await testEnvironment.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore()
    await Promise.all([
      setDoc(doc(db, 'users', ADMIN_UID), {
        uid: ADMIN_UID,
        role: 'admin',
        email: 'admin@example.test',
        username: 'Admin',
      }),
      setDoc(doc(db, 'users', STUDENT_MANAGER_UID), {
        uid: STUDENT_MANAGER_UID,
        role: 'student_manager',
        email: 'student-manager@example.test',
        username: 'Student Manager',
      }),
      setDoc(doc(db, 'users', TEACHER_MANAGER_UID), {
        uid: TEACHER_MANAGER_UID,
        role: 'teacher_manager',
        email: 'teacher-manager@example.test',
        username: 'Teacher Manager',
      }),
      setDoc(doc(db, 'users', TEACHER_UID), {
        uid: TEACHER_UID,
        role: 'teacher',
        teacherId: 'teacher-a',
        email: 'teacher-a@edutrackpro.app',
        username: 'Teacher A',
      }),
      setDoc(doc(db, 'users', INACTIVE_TEACHER_UID), {
        uid: INACTIVE_TEACHER_UID,
        role: 'inactive_teacher',
        teacherId: 'teacher-a',
        email: 'teacher-old@edutrackpro.app',
        username: '',
        releasedUsername: 'Teacher Old',
      }),
      setDoc(doc(db, 'users', RESIGNED_TEACHER_UID), {
        uid: RESIGNED_TEACHER_UID,
        role: 'inactive_teacher',
        teacherId: 'teacher-resigned',
        email: 'teacher-resigned@edutrackpro.app',
        username: 'TeacherResigned',
      }),
      setDoc(doc(db, 'users', LEGACY_RECOVERED_TEACHER_UID), {
        uid: LEGACY_RECOVERED_TEACHER_UID,
        role: 'teacher',
        teacherId: 'teacher-legacy-recovered',
        email: 'legacy-recovered@edutrackpro.app',
        username: 'LegacyRecovered',
        name: 'Legacy Recovered',
        restoredBy: ADMIN_UID,
        restoredAt: new Date('2026-08-01T00:00:00.000Z'),
      }),
      setDoc(doc(db, 'teachers', 'teacher-a'), {
        code: 'TeacherA',
        name: 'Teacher A',
        status: 'active',
        loginAccountUid: TEACHER_UID,
      }),
      setDoc(doc(db, 'teachers', 'teacher-b'), {
        code: 'TeacherB',
        name: 'Teacher B',
        status: 'active',
        loginAccountUid: 'another-teacher-uid',
      }),
      setDoc(doc(db, 'teachers', 'teacher-resigned'), {
        code: '',
        name: 'Teacher Resigned',
        status: 'resigned',
        loginAccountUid: '',
      }),
      setDoc(doc(db, 'teachers', 'teacher-legacy-recovered'), {
        code: 'LegacyRecovered',
        name: 'Legacy Recovered',
        status: 'active',
        loginAccountUid: LEGACY_RECOVERED_TEACHER_UID,
      }),
    ])
  })
})

after(async () => {
  await testEnvironment?.cleanup()
})

async function seedBookingSecurityFixtures() {
  await testEnvironment.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore()
    const common = {
      studentId: 'student-a',
      studentCode: 'HS12AB34',
      subjectId: 'subject-a',
      requestedDate: '2026-09-09',
      requestedStart: '19:00',
      requestedEnd: '19:50',
      requestedMinutes: 50,
      requestedPoints: 50,
      pointsPer25Minutes: 25,
    }
    await Promise.all([
      setDoc(doc(db, 'bookingRequests', 'booking-response'), {
        ...common,
        teacherId: 'teacher-a',
        status: 'pending',
        teacherResponse: 'pending',
      }),
      setDoc(doc(db, 'bookingRequests', 'booking-response-tamper'), {
        ...common,
        teacherId: 'teacher-a',
        status: 'pending',
        teacherResponse: 'pending',
      }),
      setDoc(doc(db, 'bookingRequests', 'booking-link'), {
        ...common,
        teacherId: 'teacher-a',
        status: 'confirmed',
        teacherResponse: 'accepted',
      }),
      setDoc(doc(db, 'bookingRequests', 'booking-link-tamper'), {
        ...common,
        teacherId: 'teacher-a',
        status: 'confirmed',
        teacherResponse: 'accepted',
      }),
      setDoc(doc(db, 'bookingRequests', 'booking-link-batch'), {
        ...common,
        teacherId: 'teacher-a',
        status: 'confirmed',
        teacherResponse: 'accepted',
      }),
      setDoc(doc(db, 'bookingRequests', 'booking-link-merged'), {
        ...common,
        teacherId: 'teacher-a',
        status: 'confirmed',
        teacherResponse: 'accepted',
      }),
      setDoc(doc(db, 'bookingRequests', 'booking-unlink'), {
        ...common,
        teacherId: 'teacher-a',
        status: 'confirmed',
        teacherResponse: 'accepted',
        lessonId: 'lesson-cancelled',
      }),
      setDoc(doc(db, 'bookingRequests', 'booking-unlink-active'), {
        ...common,
        teacherId: 'teacher-a',
        status: 'confirmed',
        teacherResponse: 'accepted',
        lessonId: 'lesson-active',
      }),
      setDoc(doc(db, 'bookingRequests', 'booking-unlink-no-ref'), {
        ...common,
        teacherId: 'teacher-a',
        status: 'confirmed',
        teacherResponse: 'accepted',
        lessonId: 'lesson-cancelled-no-ref',
      }),
      setDoc(doc(db, 'bookingRequests', 'booking-foreign'), {
        ...common,
        teacherId: 'teacher-b',
        status: 'pending',
        teacherResponse: 'pending',
      }),
      setDoc(doc(db, 'bookingCancellationRequests', 'cancel-a'), {
        bookingId: 'booking-response',
        studentId: 'student-a',
        studentCode: 'HS12AB34',
        status: 'pending',
      }),
      setDoc(doc(db, 'lessons', 'lesson-cancelled'), {
        teacherId: 'teacher-a',
        studentId: 'student-a',
        status: 'cancelled',
        bookingRequestId: 'booking-unlink',
      }),
      setDoc(doc(db, 'lessons', 'lesson-active'), {
        teacherId: 'teacher-a',
        studentId: 'student-a',
        status: 'pending',
        bookingRequestId: 'booking-unlink-active',
      }),
      setDoc(doc(db, 'lessons', 'lesson-new'), {
        teacherId: 'teacher-a',
        studentId: 'student-a',
        subjectId: 'subject-a',
        date: '2026-09-09',
        status: 'pending',
        bookingRequestId: 'booking-link',
      }),
      setDoc(doc(db, 'lessons', 'lesson-forged'), {
        teacherId: 'teacher-a',
        studentId: 'student-a',
        subjectId: 'subject-a',
        date: '2026-09-09',
        status: 'pending',
        bookingRequestId: 'some-other-booking',
      }),
      setDoc(doc(db, 'lessons', 'lesson-wrong-teacher'), {
        teacherId: 'teacher-b',
        studentId: 'student-a',
        subjectId: 'subject-a',
        date: '2026-09-09',
        status: 'pending',
        bookingRequestId: 'booking-link-tamper',
      }),
      setDoc(doc(db, 'lessons', 'lesson-wrong-student'), {
        teacherId: 'teacher-a',
        studentId: 'student-b',
        subjectId: 'subject-a',
        date: '2026-09-09',
        status: 'pending',
        bookingRequestId: 'booking-link-tamper',
      }),
      setDoc(doc(db, 'lessons', 'lesson-wrong-subject'), {
        teacherId: 'teacher-a',
        studentId: 'student-a',
        subjectId: 'subject-b',
        date: '2026-09-09',
        status: 'pending',
        bookingRequestId: 'booking-link-tamper',
      }),
      setDoc(doc(db, 'lessons', 'lesson-wrong-date'), {
        teacherId: 'teacher-a',
        studentId: 'student-a',
        subjectId: 'subject-a',
        date: '2026-09-10',
        status: 'pending',
        bookingRequestId: 'booking-link-tamper',
      }),
      setDoc(doc(db, 'lessons', 'lesson-merged'), {
        teacherId: 'teacher-a',
        studentId: 'student-a',
        subjectId: 'subject-a',
        date: '2026-09-09',
        status: 'pending',
        bookingRequestId: 'booking-primary',
        bookingRequestIds: ['booking-primary', 'booking-link-merged'],
      }),
      setDoc(doc(db, 'lessons', 'lesson-cancelled-no-ref'), {
        teacherId: 'teacher-a',
        studentId: 'student-a',
        status: 'cancelled',
        bookingRequestId: 'some-other-booking',
      }),
      setDoc(doc(db, 'students', 'student-a'), {
        code: 'HS12AB34',
        status: 'active',
        remainingMinutes: 100,
      }),
    ])
  })
}

test('gia sư chuẩn chỉ được đồng bộ metadata đăng nhập không cấp quyền', async () => {
  const db = testEnvironment.authenticatedContext(TEACHER_UID).firestore()
  await assertSucceeds(updateDoc(doc(db, 'users', TEACHER_UID), {
    email: 'teacher-a-updated@edutrackpro.app',
    username: 'Teacher A Updated',
    updatedAt: serverTimestamp(),
  }))
})

test('gia sư không thể đổi teacherId, role hoặc thêm trường quyền', async () => {
  const db = testEnvironment.authenticatedContext(TEACHER_UID).firestore()
  await assertFails(updateDoc(doc(db, 'users', TEACHER_UID), {
    teacherId: 'teacher-b',
    updatedAt: serverTimestamp(),
  }))
  await assertFails(updateDoc(doc(db, 'users', TEACHER_UID), {
    role: 'admin',
    updatedAt: serverTimestamp(),
  }))
  await assertFails(updateDoc(doc(db, 'users', TEACHER_UID), {
    accessScope: 'all',
    updatedAt: serverTimestamp(),
  }))
})

test('UID gia sư không khớp liên kết chuẩn không thể ghi dữ liệu gia sư', async () => {
  await testEnvironment.withSecurityRulesDisabled(async (context) => {
    await updateDoc(doc(context.firestore(), 'teachers', 'teacher-a'), {
      loginAccountUid: 'another-teacher-uid',
    })
  })

  const db = testEnvironment.authenticatedContext(TEACHER_UID).firestore()
  await assertFails(updateDoc(doc(db, 'users', TEACHER_UID), {
    username: 'Forged Teacher',
    updatedAt: serverTimestamp(),
  }))
  await assertFails(updateDoc(doc(db, 'teachers', 'teacher-a'), {
    bio: 'Không được ghi bằng UID cũ',
  }))
})

test('user teacher giả tồn tại từ rule cũ không thể dùng teacherId để chiếm dữ liệu khác', async () => {
  const forgedUid = 'forged-legacy-teacher-uid'
  await testEnvironment.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore()
    await Promise.all([
      setDoc(doc(db, 'users', forgedUid), {
        uid: forgedUid,
        role: 'teacher',
        teacherId: 'teacher-a',
        email: 'forged@example.test',
        username: 'Forged',
      }),
      setDoc(doc(db, 'payroll', 'payroll-teacher-a'), {
        teacherId: 'teacher-a',
        amount: 100000,
      }),
      setDoc(doc(db, 'bookingRequests', 'booking-teacher-a'), {
        teacherId: 'teacher-a',
        studentId: 'student-a',
        status: 'confirmed',
      }),
      setDoc(doc(db, 'teacherAvailability', 'teacher-a'), {
        slots: [],
      }),
    ])
  })

  const db = testEnvironment.authenticatedContext(forgedUid).firestore()
  await assertFails(getDoc(doc(db, 'payroll', 'payroll-teacher-a')))
  await assertFails(updateDoc(doc(db, 'bookingRequests', 'booking-teacher-a'), { status: 'completed' }))
  await assertFails(updateDoc(doc(db, 'teacherAvailability', 'teacher-a'), { slots: ['08:00'] }))
  await assertFails(setDoc(doc(db, 'contracts', 'forged-contract'), {
    teacherId: 'teacher-a',
    content: 'forged',
  }))
  await assertFails(setDoc(doc(db, 'evaluations', 'forged-evaluation'), {
    teacherId: 'teacher-a',
    teacherName: 'Teacher A',
    studentName: 'Student',
    type: 'english',
    skills: {},
    formType: 'adult_comm',
    evaluationResult: 'direct',
    status: 'pending',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }))
})

test('gia sư chỉ sửa nội dung phiếu chưa duyệt, không sửa/xóa dữ liệu thưởng', async () => {
  await testEnvironment.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore()
    await Promise.all([
      setDoc(doc(db, 'evaluations', 'evaluation-pending'), {
        teacherId: 'teacher-a',
        teacherName: 'Teacher A',
        studentName: 'Student Pending',
        type: 'english',
        skills: { speaking: 5 },
        formType: 'adult_comm',
        evaluationResult: 'direct',
        status: 'pending',
        createdAt: new Date('2026-08-28T00:00:00.000Z'),
        updatedAt: new Date('2026-08-28T00:00:00.000Z'),
      }),
      setDoc(doc(db, 'evaluations', 'evaluation-approved'), {
        teacherId: 'teacher-a',
        teacherName: 'Teacher A',
        studentName: 'Student Approved',
        type: 'english',
        skills: { speaking: 5 },
        formType: 'adult_comm',
        evaluationResult: 'direct',
        status: 'approved',
        rewardPayrollId: 'evaluation-base-approved',
        rewardAmount: 25000,
        approvedAt: new Date('2026-08-28T01:00:00.000Z'),
        approvedBy: ADMIN_UID,
        createdAt: new Date('2026-08-28T00:00:00.000Z'),
        updatedAt: new Date('2026-08-28T01:00:00.000Z'),
      }),
    ])
  })

  const db = testEnvironment.authenticatedContext(TEACHER_UID).firestore()
  await assertSucceeds(updateDoc(doc(db, 'evaluations', 'evaluation-pending'), {
    studentName: 'Student Pending Updated',
    updatedAt: serverTimestamp(),
  }))
  await assertFails(updateDoc(doc(db, 'evaluations', 'evaluation-pending'), {
    status: 'approved',
    rewardAmount: 99999999,
    updatedAt: serverTimestamp(),
  }))
  await assertFails(updateDoc(doc(db, 'evaluations', 'evaluation-approved'), {
    studentName: 'Tampered',
    updatedAt: serverTimestamp(),
  }))
  await assertFails(deleteDoc(doc(db, 'evaluations', 'evaluation-approved')))
  await assertSucceeds(deleteDoc(doc(db, 'evaluations', 'evaluation-pending')))
})

test('hồ sơ legacy chưa có loginAccountUid vẫn hoạt động đến khi Admin khôi phục liên kết', async () => {
  const legacyUid = 'legacy-teacher-rules-test'
  await testEnvironment.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore()
    await setDoc(doc(db, 'users', legacyUid), {
      uid: legacyUid,
      role: 'teacher',
      teacherId: 'teacher-legacy',
      email: 'legacy@edutrackpro.app',
      username: 'Legacy',
    })
    await setDoc(doc(db, 'teachers', 'teacher-legacy'), {
      name: 'Legacy Teacher',
      status: 'active',
    })
  })

  const db = testEnvironment.authenticatedContext(legacyUid).firestore()
  await assertSucceeds(updateDoc(doc(db, 'teachers', 'teacher-legacy'), {
    country: 'VN',
  }))
})

test('thông báo học viên vẫn đọc công khai nhưng thông báo gia sư cần UID chuẩn', async () => {
  await testEnvironment.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore()
    await Promise.all([
      setDoc(doc(db, 'notifications', 'student-notice'), {
        targetType: 'students',
        title: 'Thông báo học viên',
      }),
      setDoc(doc(db, 'notifications', 'teacher-notice'), {
        targetType: 'teachers',
        title: 'Thông báo gia sư',
      }),
    ])
  })

  const anonymousDb = testEnvironment.unauthenticatedContext().firestore()
  await assertSucceeds(getDoc(doc(anonymousDb, 'notifications', 'student-notice')))
  await assertFails(getDoc(doc(anonymousDb, 'notifications', 'teacher-notice')))

  const teacherDb = testEnvironment.authenticatedContext(TEACHER_UID).firestore()
  await assertSucceeds(getDoc(doc(teacherDb, 'notifications', 'teacher-notice')))
})

test('tài khoản Auth bất kỳ không thể tự tạo hồ sơ gia sư', async () => {
  const attackerUid = 'attacker-rules-test'
  const db = testEnvironment.authenticatedContext(attackerUid).firestore()
  await assertFails(setDoc(doc(db, 'users', attackerUid), {
    uid: attackerUid,
    role: 'teacher',
    teacherId: 'teacher-a',
    email: 'attacker@example.test',
    username: 'Attacker',
  }))
})

test('gia sư không thể xóa hồ sơ để tạo lại liên kết quyền', async () => {
  const db = testEnvironment.authenticatedContext(TEACHER_UID).firestore()
  await assertFails(deleteDoc(doc(db, 'users', TEACHER_UID)))
})

test('quản lý học viên không thể tạo, sửa, xóa hoặc tự nâng quyền users', async () => {
  const db = testEnvironment.authenticatedContext(STUDENT_MANAGER_UID).firestore()
  await assertFails(updateDoc(doc(db, 'users', STUDENT_MANAGER_UID), { role: 'admin' }))
  await assertFails(setDoc(doc(db, 'users', 'forged-admin'), {
    uid: 'forged-admin',
    role: 'admin',
    email: 'forged-admin@example.test',
    username: 'Forged Admin',
  }))
  await assertFails(updateDoc(doc(db, 'users', TEACHER_UID), { role: 'admin' }))
  await assertFails(deleteDoc(doc(db, 'users', TEACHER_UID)))
  await assertFails(updateDoc(doc(db, 'teachers', 'teacher-a'), { name: 'Chiếm hồ sơ' }))
  await assertFails(setDoc(doc(db, 'teachers', 'forged-teacher-profile'), {
    name: 'Forged Teacher',
    status: 'active',
    loginAccountUid: 'forged-teacher-uid',
  }))
})

test('quản lý học viên chỉ cập nhật được bộ đếm duyệt và revision xếp lịch của gia sư', async () => {
  const db = testEnvironment.authenticatedContext(STUDENT_MANAGER_UID).firestore()
  const teacherRef = doc(db, 'teachers', 'teacher-a')

  await assertSucceeds(updateDoc(teacherRef, {
    totalApprovedMinutes: 50,
  }))
  // A teaching report marked absent-with-permission contributes zero minutes,
  // but its approval transaction still writes the unchanged aggregate.
  await assertSucceeds(updateDoc(teacherRef, {
    totalApprovedMinutes: 50,
  }))
  await assertFails(updateDoc(teacherRef, {
    totalApprovedMinutes: 0,
  }))
  await assertFails(updateDoc(teacherRef, {
    totalApprovedMinutes: 1000,
  }))

  await assertSucceeds(updateDoc(teacherRef, {
    bookingScheduleRevision: 1,
    bookingScheduleUpdatedAt: serverTimestamp(),
  }))
  await assertFails(updateDoc(teacherRef, {
    bookingScheduleRevision: 3,
    bookingScheduleUpdatedAt: serverTimestamp(),
  }))
  await assertFails(updateDoc(teacherRef, {
    name: 'Không được sửa hồ sơ',
  }))
})

test('quản lý gia sư không thể tự nâng quyền hoặc đụng tài khoản quản trị', async () => {
  const db = testEnvironment.authenticatedContext(TEACHER_MANAGER_UID).firestore()
  await assertFails(updateDoc(doc(db, 'users', TEACHER_MANAGER_UID), { role: 'admin' }))
  await assertFails(updateDoc(doc(db, 'users', ADMIN_UID), { username: 'Taken over' }))
  await assertFails(deleteDoc(doc(db, 'users', ADMIN_UID)))
  await assertFails(setDoc(doc(db, 'users', 'forged-manager'), {
    uid: 'forged-manager',
    role: 'teacher_manager',
    email: 'forged-manager@example.test',
    username: 'Forged Manager',
  }))
  await assertFails(updateDoc(doc(db, 'users', TEACHER_UID), {
    accessScope: 'all',
    updatedAt: serverTimestamp(),
  }))
  await assertFails(updateDoc(doc(db, 'users', TEACHER_UID), {
    role: 'inactive_teacher',
    loginDisabledAt: serverTimestamp(),
    loginDisabledReason: 'non_atomic_disable',
    updatedAt: serverTimestamp(),
  }))
})

test('quản lý gia sư tạo tài khoản và hồ sơ liên kết chuẩn trong cùng batch', async () => {
  const db = testEnvironment.authenticatedContext(TEACHER_MANAGER_UID).firestore()
  const managedUid = 'managed-teacher-uid'
  const teacherId = 'teacher-managed'
  const batch = writeBatch(db)
  batch.set(doc(db, 'teachers', teacherId), {
    code: 'ManagedTeacher',
    name: 'Managed Teacher',
    status: 'active',
    loginAccountUid: managedUid,
    createdAt: serverTimestamp(),
  })
  batch.set(doc(db, 'users', managedUid), {
    uid: managedUid,
    role: 'teacher',
    teacherId,
    email: 'managed-teacher@edutrackpro.app',
    username: 'ManagedTeacher',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
  await assertSucceeds(batch.commit())

  const teacherSnapshot = await getDoc(doc(db, 'teachers', teacherId))
  const userSnapshot = await getDoc(doc(db, 'users', managedUid))
  if (!teacherSnapshot.exists() || !userSnapshot.exists()) {
    throw new Error('Batch hợp lệ không tạo đủ liên kết hai chiều')
  }
})

test('quản lý gia sư không thể tạo tài khoản teacher không có liên kết chuẩn', async () => {
  const db = testEnvironment.authenticatedContext(TEACHER_MANAGER_UID).firestore()
  await assertFails(setDoc(doc(db, 'users', 'orphan-teacher-uid'), {
    uid: 'orphan-teacher-uid',
    role: 'teacher',
    teacherId: 'teacher-a',
    email: 'orphan@edutrackpro.app',
    username: 'OrphanTeacher',
    createdAt: serverTimestamp(),
  }))
})

test('quản lý gia sư đổi UID đăng nhập bằng batch nguyên tử và vô hiệu UID cũ', async () => {
  const db = testEnvironment.authenticatedContext(TEACHER_MANAGER_UID).firestore()
  const replacementUid = 'teacher-replacement-uid'
  const batch = writeBatch(db)
  batch.update(doc(db, 'teachers', 'teacher-a'), {
    loginAccountUid: replacementUid,
    loginAccountUpdatedAt: serverTimestamp(),
  })
  batch.update(doc(db, 'users', TEACHER_UID), {
    role: 'inactive_teacher',
    loginDisabledAt: serverTimestamp(),
    loginDisabledReason: 'nickname_changed',
    updatedAt: serverTimestamp(),
  })
  batch.set(doc(db, 'users', replacementUid), {
    uid: replacementUid,
    role: 'teacher',
    teacherId: 'teacher-a',
    email: 'teacher-replacement@edutrackpro.app',
    username: 'TeacherReplacement',
    createdAt: serverTimestamp(),
    loginDisabledAt: null,
    loginDisabledReason: '',
    updatedAt: serverTimestamp(),
  })
  await assertSucceeds(batch.commit())
})

test('quản lý gia sư vẫn cập nhật được tài khoản recovery legacy nhưng không sửa trường lịch sử', async () => {
  const db = testEnvironment.authenticatedContext(TEACHER_MANAGER_UID).firestore()
  const legacyUserRef = doc(db, 'users', LEGACY_RECOVERED_TEACHER_UID)

  await assertSucceeds(updateDoc(legacyUserRef, {
    username: 'LegacyRecoveredUpdated',
    updatedAt: serverTimestamp(),
  }))
  await assertFails(updateDoc(legacyUserRef, {
    restoredBy: TEACHER_MANAGER_UID,
    updatedAt: serverTimestamp(),
  }))

  const batch = writeBatch(db)
  batch.update(doc(db, 'teachers', 'teacher-legacy-recovered'), {
    status: 'resigned',
    loginAccountUid: '',
  })
  batch.update(legacyUserRef, {
    role: 'inactive_teacher',
    loginDisabledAt: serverTimestamp(),
    loginDisabledReason: 'teacher_resigned',
    updatedAt: serverTimestamp(),
  })
  await assertSucceeds(batch.commit())
})

test('quản lý gia sư không thể tạo tài khoản mới kèm trường recovery legacy', async () => {
  const db = testEnvironment.authenticatedContext(TEACHER_MANAGER_UID).firestore()
  const managedUid = 'managed-teacher-with-legacy-fields'
  const teacherId = 'teacher-managed-with-legacy-fields'
  const batch = writeBatch(db)
  batch.set(doc(db, 'teachers', teacherId), {
    code: 'ManagedLegacyFields',
    name: 'Managed Legacy Fields',
    status: 'active',
    loginAccountUid: managedUid,
  })
  batch.set(doc(db, 'users', managedUid), {
    uid: managedUid,
    role: 'teacher',
    teacherId,
    email: 'managed-legacy-fields@edutrackpro.app',
    username: 'ManagedLegacyFields',
    name: 'Injected Legacy Name',
    restoredBy: TEACHER_MANAGER_UID,
    restoredAt: serverTimestamp(),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
  await assertFails(batch.commit())
})

test('quản lý gia sư chỉ xóa được tài khoản inactive_teacher', async () => {
  const db = testEnvironment.authenticatedContext(TEACHER_MANAGER_UID).firestore()
  await assertFails(deleteDoc(doc(db, 'users', TEACHER_UID)))
  await assertSucceeds(deleteDoc(doc(db, 'users', INACTIVE_TEACHER_UID)))
})

test('quản lý gia sư sửa hồ sơ canonical nhưng không được xóa hồ sơ đang hoạt động', async () => {
  const db = testEnvironment.authenticatedContext(TEACHER_MANAGER_UID).firestore()
  await assertSucceeds(updateDoc(doc(db, 'teachers', 'teacher-a'), {
    name: 'Teacher A Updated By Manager',
  }))
  await assertFails(deleteDoc(doc(db, 'teachers', 'teacher-a')))
})

test('kích hoạt lại gia sư bắt buộc khôi phục liên kết UID trong cùng batch', async () => {
  const db = testEnvironment.authenticatedContext(TEACHER_MANAGER_UID).firestore()
  await assertFails(updateDoc(doc(db, 'teachers', 'teacher-resigned'), {
    status: 'active',
  }))

  const batch = writeBatch(db)
  batch.update(doc(db, 'teachers', 'teacher-resigned'), {
    code: 'TeacherResigned',
    status: 'active',
    loginAccountUid: RESIGNED_TEACHER_UID,
    loginAccountUpdatedAt: serverTimestamp(),
  })
  batch.update(doc(db, 'users', RESIGNED_TEACHER_UID), {
    role: 'teacher',
    loginDisabledAt: null,
    loginDisabledReason: '',
    updatedAt: serverTimestamp(),
  })
  await assertSucceeds(batch.commit())
})

test('Admin hệ thống vẫn quản lý được toàn bộ vòng đời hồ sơ users', async () => {
  const db = testEnvironment.authenticatedContext(ADMIN_UID).firestore()
  const target = doc(db, 'users', 'managed-teacher')
  await assertSucceeds(setDoc(target, {
    uid: 'managed-teacher',
    role: 'teacher',
    teacherId: 'teacher-a',
    email: 'managed@example.test',
    username: 'Managed Teacher',
  }))
  await assertSucceeds(updateDoc(target, { teacherId: 'teacher-b' }))
  await assertSucceeds(deleteDoc(target))
})

test('khách ẩn danh không thể đọc hoặc ghi booking và yêu cầu hủy thô', async () => {
  await seedBookingSecurityFixtures()
  const db = testEnvironment.unauthenticatedContext().firestore()

  await assertFails(getDoc(doc(db, 'bookingRequests', 'booking-response')))
  await assertFails(getDocs(query(
    collection(db, 'bookingRequests'),
    where('teacherId', '==', 'teacher-a'),
  )))
  await assertFails(setDoc(doc(db, 'bookingRequests', 'anonymous-booking'), {
    teacherId: 'teacher-a',
    studentId: 'student-a',
    studentCode: 'HS12AB34',
    status: 'pending',
  }))
  await assertFails(updateDoc(doc(db, 'bookingRequests', 'booking-response'), {
    teacherResponse: 'accepted',
    teacherRespondedAt: serverTimestamp(),
    teacherRespondedBy: 'anonymous',
  }))
  await assertFails(deleteDoc(doc(db, 'bookingRequests', 'booking-response')))

  await assertFails(getDoc(doc(db, 'bookingCancellationRequests', 'cancel-a')))
  await assertFails(setDoc(doc(db, 'bookingCancellationRequests', 'cancel-anonymous'), {
    bookingId: 'booking-response',
    studentId: 'student-a',
    studentCode: 'HS12AB34',
    status: 'pending',
  }))
  await assertFails(updateDoc(doc(db, 'bookingCancellationRequests', 'cancel-a'), { status: 'resolved' }))
  await assertFails(deleteDoc(doc(db, 'bookingCancellationRequests', 'cancel-a')))
})

test('Admin quản lý booking đầy đủ và quản lý yêu cầu hủy nhưng không xóa ledger hủy', async () => {
  await seedBookingSecurityFixtures()
  const db = testEnvironment.authenticatedContext(ADMIN_UID).firestore()

  await assertSucceeds(getDoc(doc(db, 'bookingRequests', 'booking-response')))
  await assertSucceeds(getDocs(collection(db, 'bookingRequests')))
  const bookingRef = doc(db, 'bookingRequests', 'booking-admin')
  await assertSucceeds(setDoc(bookingRef, {
    teacherId: 'teacher-a',
    studentId: 'student-a',
    studentCode: 'HS12AB34',
    status: 'pending',
  }))
  await assertSucceeds(updateDoc(bookingRef, { status: 'confirmed' }))
  await assertSucceeds(deleteDoc(bookingRef))

  const cancellationRef = doc(db, 'bookingCancellationRequests', 'cancel-admin')
  await assertSucceeds(setDoc(cancellationRef, {
    bookingId: 'booking-response',
    studentId: 'student-a',
    studentCode: 'HS12AB34',
    status: 'pending',
  }))
  await assertSucceeds(getDoc(cancellationRef))
  await assertSucceeds(updateDoc(cancellationRef, { status: 'resolved' }))
  await assertFails(deleteDoc(cancellationRef))
})

test('gia sư canonical chỉ đọc được booking của mình qua truy vấn có ràng buộc', async () => {
  await seedBookingSecurityFixtures()
  const db = testEnvironment.authenticatedContext(TEACHER_UID).firestore()

  await assertSucceeds(getDoc(doc(db, 'bookingRequests', 'booking-response')))
  await assertFails(getDoc(doc(db, 'bookingRequests', 'booking-foreign')))

  const ownSnapshot = await assertSucceeds(getDocs(query(
    collection(db, 'bookingRequests'),
    where('teacherId', '==', 'teacher-a'),
  )))
  if (ownSnapshot.docs.some((row) => row.data().teacherId !== 'teacher-a')) {
    throw new Error('Truy vấn booking của gia sư trả về dữ liệu ngoài phạm vi')
  }
  await assertFails(getDocs(query(
    collection(db, 'bookingRequests'),
    where('teacherId', '==', 'teacher-b'),
  )))
  await assertFails(getDocs(collection(db, 'bookingRequests')))
  await assertFails(getDoc(doc(db, 'bookingCancellationRequests', 'cancel-a')))
})

test('gia sư canonical không thể né callable để phản hồi booking trực tiếp', async () => {
  await seedBookingSecurityFixtures()
  const db = testEnvironment.authenticatedContext(TEACHER_UID).firestore()
  const responseRef = doc(db, 'bookingRequests', 'booking-response')

  await assertFails(updateDoc(responseRef, {
    teacherResponse: 'accepted',
    teacherRespondedAt: serverTimestamp(),
    teacherRespondedBy: TEACHER_UID,
  }))
  await assertFails(updateDoc(responseRef, {
    teacherResponse: 'declined',
    teacherRespondedAt: serverTimestamp(),
    teacherRespondedBy: TEACHER_UID,
  }))
  await assertFails(updateDoc(doc(db, 'bookingRequests', 'booking-response-tamper'), {
    teacherResponse: 'accepted',
    teacherRespondedAt: serverTimestamp(),
    teacherRespondedBy: TEACHER_UID,
    studentId: 'student-b',
  }))
  await assertFails(updateDoc(doc(db, 'bookingRequests', 'booking-foreign'), {
    teacherResponse: 'accepted',
    teacherRespondedAt: serverTimestamp(),
    teacherRespondedBy: TEACHER_UID,
  }))
})

test('gia sư canonical chỉ gắn lessonId vào booking confirmed và không thể sửa tiền hoặc vòng đời', async () => {
  await seedBookingSecurityFixtures()
  const db = testEnvironment.authenticatedContext(TEACHER_UID).firestore()

  await assertSucceeds(updateDoc(doc(db, 'bookingRequests', 'booking-link'), {
    lessonId: 'lesson-new',
  }))
  await assertFails(updateDoc(doc(db, 'bookingRequests', 'booking-link-tamper'), {
    lessonId: 'lesson-forged',
  }))
  for (const invalidLessonId of [
    'lesson-missing',
    'lesson-wrong-teacher',
    'lesson-wrong-student',
    'lesson-wrong-subject',
    'lesson-wrong-date',
  ]) {
    await assertFails(updateDoc(doc(db, 'bookingRequests', 'booking-link-tamper'), {
      lessonId: invalidLessonId,
    }))
  }
  await assertFails(updateDoc(doc(db, 'bookingRequests', 'booking-link-tamper'), {
    lessonId: 'lesson-forged',
    requestedPoints: 0,
  }))
  await assertFails(updateDoc(doc(db, 'bookingRequests', 'booking-link-tamper'), {
    lessonId: 'x'.repeat(161),
  }))
  await assertFails(updateDoc(doc(db, 'bookingRequests', 'booking-response-tamper'), {
    lessonId: 'lesson-on-pending-booking',
  }))
  await assertSucceeds(updateDoc(doc(db, 'bookingRequests', 'booking-link-merged'), {
    lessonId: 'lesson-merged',
  }))

  const batch = writeBatch(db)
  batch.set(doc(db, 'lessons', 'lesson-created-with-link'), {
    teacherId: 'teacher-a',
    studentId: 'student-a',
    subjectId: 'subject-a',
    date: '2026-09-09',
    minutes: 50,
    status: 'pending',
    bookingRequestId: 'booking-link-batch',
  })
  batch.update(doc(db, 'bookingRequests', 'booking-link-batch'), {
    lessonId: 'lesson-created-with-link',
  })
  await assertSucceeds(batch.commit())
})

test('gia sư canonical chỉ tháo lessonId khi lesson liên kết đã hủy và không thể tamper', async () => {
  await seedBookingSecurityFixtures()
  const db = testEnvironment.authenticatedContext(TEACHER_UID).firestore()

  await assertSucceeds(updateDoc(doc(db, 'bookingRequests', 'booking-unlink'), {
    lessonId: deleteField(),
    updatedAt: serverTimestamp(),
  }))
  await assertFails(updateDoc(doc(db, 'bookingRequests', 'booking-unlink-active'), {
    lessonId: deleteField(),
    updatedAt: serverTimestamp(),
  }))
  await assertFails(updateDoc(doc(db, 'bookingRequests', 'booking-unlink-no-ref'), {
    lessonId: deleteField(),
    updatedAt: serverTimestamp(),
  }))

  await testEnvironment.withSecurityRulesDisabled(async (context) => {
    const adminDb = context.firestore()
    await setDoc(doc(adminDb, 'bookingRequests', 'booking-unlink-tamper'), {
      teacherId: 'teacher-a',
      studentId: 'student-a',
      studentCode: 'HS12AB34',
      requestedDate: '2026-09-09',
      requestedStart: '19:00',
      requestedEnd: '19:50',
      requestedMinutes: 50,
      requestedPoints: 50,
      status: 'confirmed',
      lessonId: 'lesson-cancelled',
    })
  })
  await assertFails(updateDoc(doc(db, 'bookingRequests', 'booking-unlink-tamper'), {
    lessonId: deleteField(),
    updatedAt: serverTimestamp(),
    requestedPoints: 0,
  }))
})
