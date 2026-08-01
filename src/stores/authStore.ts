import { create } from 'zustand'
import { User } from 'firebase/auth'
import { onAuthStateChanged } from 'firebase/auth'
import { collection, doc, getDocFromServer, getDocsFromServer, onSnapshot, query, where } from 'firebase/firestore'
import { auth, db } from '@/lib/firebase'

export type AuthRole = 'admin' | 'teacher' | 'inactive_teacher' | 'guest' | 'student_manager' | 'teacher_manager'
export type AuthProfileStatus = 'idle' | 'loading' | 'ready' | 'missing' | 'error'

interface AuthState {
  user: User | null
  role: AuthRole | null
  teacherId: string | null
  loading: boolean
  initialized: boolean
  profileStatus: AuthProfileStatus
  setLoading: (loading: boolean) => void
  initAuth: () => () => void
}

const AUTH_ROLES: AuthRole[] = ['admin', 'teacher', 'inactive_teacher', 'guest', 'student_manager', 'teacher_manager']

function isAuthRole(value: unknown): value is AuthRole {
  return typeof value === 'string' && AUTH_ROLES.includes(value as AuthRole)
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  role: null,
  teacherId: null,
  loading: true,
  initialized: false,
  profileStatus: 'idle',
  setLoading: (loading) => set({ loading }),
  initAuth: () => {
    let unsubUser: (() => void) | null = null
    let profileTimeout: ReturnType<typeof setTimeout> | null = null
    let profileReadVersion = 0

    const clearProfileTimeout = () => {
      if (profileTimeout) {
        clearTimeout(profileTimeout)
        profileTimeout = null
      }
    }

    const armProfileTimeout = (uid: string, expectedReadVersion: number) => {
      clearProfileTimeout()
      profileTimeout = setTimeout(() => {
        profileTimeout = null
        const current = useAuthStore.getState()
        if (
          expectedReadVersion === profileReadVersion
          && current.user?.uid === uid
          && current.profileStatus === 'loading'
        ) {
          profileReadVersion += 1
          // Giữ lỗi ổn định cho tới khi người dùng chủ động thử lại; snapshot đến
          // muộn không được phép đổi màn lỗi sang route thật và tạo thêm một lần nháy.
          if (unsubUser) {
            const stopUserListener = unsubUser
            unsubUser = null
            stopUserListener()
          }
          set({ loading: false, profileStatus: 'error' })
        }
      }, 12_000)
    }

    const unsubAuth = onAuthStateChanged(auth, (user) => {
      profileReadVersion += 1
      clearProfileTimeout()
      if (unsubUser) {
        unsubUser()
        unsubUser = null
      }

      if (user) {
        // Giữ route ở trạng thái tải ổn định trong lúc hồ sơ quyền được đồng bộ.
        // Không tái sử dụng role/teacherId của phiên trước khi Firebase đổi user.
        set({ user, role: null, teacherId: null, loading: true, initialized: true, profileStatus: 'loading' })

        // Firestore có thể chỉ trả cache và không gọi error khi thiết bị đang offline.
        // Mỗi vòng xác minh server đều có timeout riêng, không để spinner vô hạn.
        armProfileTimeout(user.uid, profileReadVersion)

        unsubUser = onSnapshot(
          doc(db, 'users', user.uid),
          { includeMetadataChanges: true },
          (snap) => {
            // Không dùng cache để cấp quyền. Chờ server xác nhận role hiện tại nhằm
            // tránh hiển thị route cũ khi Admin vừa khóa hoặc đổi quyền tài khoản.
            if (snap.metadata.fromCache) {
              const current = useAuthStore.getState()
              // Cache không được hạ cấp một trạng thái đã được server xác nhận;
              // nếu đang xác minh ban đầu thì timeout hiện hành vẫn tiếp tục chạy.
              if (current.user?.uid === user.uid
                && (current.profileStatus === 'ready' || current.profileStatus === 'error')) return
              set({ user, role: null, teacherId: null, loading: true, initialized: true, profileStatus: 'loading' })
              return
            }

            if (snap.exists()) {
              const data = snap.data()
              const nextRole = isAuthRole(data.role) ? data.role : null
              const nextTeacherId = typeof data.teacherId === 'string' && data.teacherId ? data.teacherId : null

              if (nextRole === 'teacher' && nextTeacherId) {
                // Quyền gia sư cần khớp cả users/{uid} và UID đăng nhập chuẩn trên
                // teachers/{teacherId}. Không mở route trong khoảng giữa hai lần đọc.
                const readVersion = ++profileReadVersion
                set({ user, role: null, teacherId: null, loading: true, initialized: true, profileStatus: 'loading' })
                armProfileTimeout(user.uid, readVersion)
                void getDocFromServer(doc(db, 'teachers', nextTeacherId)).then(async (teacherSnap) => {
                  if (readVersion !== profileReadVersion || useAuthStore.getState().user?.uid !== user.uid) return
                  const teacherData = teacherSnap.exists() ? teacherSnap.data() : null
                  const canonicalLoginUid = typeof teacherData?.loginAccountUid === 'string'
                    ? teacherData.loginAccountUid
                    : ''
                  let legacyAccountMismatch = false
                  if (teacherData && !canonicalLoginUid) {
                    // Tương thích hồ sơ cũ chưa backfill canonical, nhưng chỉ khi
                    // server xác nhận đúng một UID active và đó chính là phiên hiện tại.
                    const activeUsersSnap = await getDocsFromServer(query(
                      collection(db, 'users'),
                      where('teacherId', '==', nextTeacherId),
                      where('role', '==', 'teacher'),
                    ))
                    if (readVersion !== profileReadVersion || useAuthStore.getState().user?.uid !== user.uid) return
                    legacyAccountMismatch = activeUsersSnap.size !== 1 || activeUsersSnap.docs[0].id !== user.uid
                  }
                  clearProfileTimeout()
                  const isCanonicalMismatch = !!canonicalLoginUid && canonicalLoginUid !== user.uid
                  const isInactiveTeacher = !teacherData
                    || teacherData.status === 'resigned'
                    || isCanonicalMismatch
                    || legacyAccountMismatch
                  set({
                    user,
                    role: isInactiveTeacher ? 'inactive_teacher' : 'teacher',
                    teacherId: nextTeacherId,
                    loading: false,
                    initialized: true,
                    profileStatus: 'ready',
                  })
                }).catch((error) => {
                  if (readVersion !== profileReadVersion || useAuthStore.getState().user?.uid !== user.uid) return
                  clearProfileTimeout()
                  console.error('Unable to validate canonical teacher account:', error)
                  set({ user, role: null, teacherId: null, loading: false, initialized: true, profileStatus: 'error' })
                })
                return
              }

              profileReadVersion += 1
              clearProfileTimeout()
              set({
                user,
                role: nextRole,
                teacherId: nextTeacherId,
                loading: false,
                initialized: true,
                profileStatus: 'ready',
              })
              return
            }

            // Server xác nhận hồ sơ quyền thực sự chưa tồn tại.
            profileReadVersion += 1
            clearProfileTimeout()
            set({ user, role: null, teacherId: null, loading: false, initialized: true, profileStatus: 'missing' })
          },
          (error) => {
            profileReadVersion += 1
            clearProfileTimeout()
            console.error('Unable to load authenticated user profile:', error)
            set({ user, role: null, teacherId: null, loading: false, initialized: true, profileStatus: 'error' })
          },
        )
      } else {
        set({ user: null, role: null, teacherId: null, loading: false, initialized: true, profileStatus: 'idle' })
      }
    }, (error) => {
      profileReadVersion += 1
      clearProfileTimeout()
      console.error('Unable to initialize Firebase authentication:', error)
      set({ user: null, role: null, teacherId: null, loading: false, initialized: true, profileStatus: 'error' })
    })

    return () => {
      profileReadVersion += 1
      clearProfileTimeout()
      unsubAuth()
      if (unsubUser) unsubUser()
    }
  },
}))

export function waitForAuthProfile(
  uid: string,
  expectedRole: AuthRole,
  expectedTeacherId?: string,
  timeoutMs = 15_000,
) {
  return new Promise<void>((resolve, reject) => {
    let settled = false
    let unsubscribe = () => {}

    const finish = (error?: Error) => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      unsubscribe()
      if (error) reject(error)
      else resolve()
    }

    const inspect = (state: AuthState) => {
      if (state.user?.uid !== uid) return
      if (state.profileStatus === 'ready') {
        if (state.role !== expectedRole) {
          finish(new Error('Tài khoản không có quyền truy cập phù hợp'))
          return
        }

        if (expectedRole === 'teacher') {
          // Hồ sơ cũ có thể nhận snapshot role=teacher trước snapshot tự phục hồi teacherId.
          // Không mở route ở trạng thái trung gian đó vì ProtectedRoute sẽ hiện lỗi rồi nháy sang trang thật.
          if (!expectedTeacherId) {
            finish(new Error('Không xác định được hồ sơ gia sư cần đăng nhập'))
          } else if (state.teacherId && state.teacherId !== expectedTeacherId) {
            finish(new Error('Tài khoản gia sư không khớp hồ sơ'))
          } else if (state.teacherId === expectedTeacherId) {
            finish()
          } else {
            finish(new Error('Tài khoản gia sư chưa được Admin liên kết đầy đủ với hồ sơ'))
          }
          return
        }

        finish()
      } else if (state.profileStatus === 'missing') {
        finish(new Error('Tài khoản chưa được khởi tạo đầy đủ. Vui lòng liên hệ Admin.'))
      } else if (state.profileStatus === 'error') {
        finish(new Error('Không thể xác nhận quyền truy cập từ máy chủ. Vui lòng kiểm tra kết nối và thử lại.'))
      }
    }

    const timeout = setTimeout(() => {
      finish(new Error('Quá thời gian xác nhận quyền truy cập. Vui lòng kiểm tra kết nối và thử lại.'))
    }, timeoutMs)

    unsubscribe = useAuthStore.subscribe(inspect)
    inspect(useAuthStore.getState())
  })
}
