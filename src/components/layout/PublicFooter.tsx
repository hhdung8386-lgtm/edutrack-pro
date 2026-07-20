import React from 'react'

export function PublicFooter() {
  const currentYear = new Date().getFullYear()

  return (
    <footer className="w-full border-t border-slate-100 bg-white py-6 text-center text-xs font-medium text-slate-400">
      <div className="mx-auto max-w-7xl px-4">
        <p>© {currentYear} EduTrack Pro. All rights reserved.</p>
      </div>
    </footer>
  )
}
