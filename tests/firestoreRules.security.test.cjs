const fs = require('node:fs')
const path = require('node:path')
const { after, before, beforeEach, test } = require('node:test')
const {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} = require('@firebase/rules-unit-testing')
const {
  deleteDoc,
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  updateDoc,
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
