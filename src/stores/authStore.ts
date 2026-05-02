import { create } from 'zustand'
import { User } from 'firebase/auth'
import { onAuthStateChanged } from 'firebase/auth'
import { doc, onSnapshot } from 'firebase/firestore'
import { auth, db } from '@/lib/firebase'

interface AuthState {
  user: User | null
  role: 'admin' | 'teacher' | null
  teacherId: string | null
  loading: boolean
  initialized: boolean
  setUser: (user: User | null, role: 'admin' | 'teacher' | null, teacherId?: string | null) => void
  setLoading: (loading: boolean) => void
  initAuth: () => () => void
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  role: null,
  teacherId: null,
  loading: true,
  initialized: false,
  setUser: (user, role, teacherId = null) => set({ user, role, teacherId }),
  setLoading: (loading) => set({ loading }),
  initAuth: () => {
    let unsubUser: (() => void) | null = null

    const unsubAuth = onAuthStateChanged(auth, (user) => {
      if (unsubUser) {
        unsubUser()
        unsubUser = null
      }

      if (user) {
        unsubUser = onSnapshot(doc(db, 'users', user.uid), (snap) => {
          if (snap.exists()) {
            const data = snap.data()
            set({
              user,
              role: data.role,
              teacherId: data.teacherId || null,
              loading: false,
              initialized: true,
            })
          } else {
            set({ user: null, role: null, teacherId: null, loading: false, initialized: true })
          }
        })
      } else {
        set({ user: null, role: null, teacherId: null, loading: false, initialized: true })
      }
    })

    return () => {
      unsubAuth()
      if (unsubUser) unsubUser()
    }
  },
}))
