import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/Button'
import { Home } from 'lucide-react'
import { useL } from '@/stores/languageStore'

export function NotFoundPage() {
  const navigate = useNavigate()
  const L = useL()
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center">
      <div className="text-center">
        <p className="text-8xl font-black text-slate-700 mb-4">404</p>
        <h1 className="text-2xl font-bold text-slate-600 mb-2">{L('Trang không tồn tại', 'Page not found')}</h1>
        <p className="text-slate-500 mb-8">{L('Đường dẫn bạn tìm kiếm không tồn tại hoặc đã bị xóa', 'The page you are looking for does not exist or has been removed')}</p>
        <Button onClick={() => navigate('/')}>
          <Home className="w-4 h-4" />
          {L('Về trang chủ', 'Back to home')}
        </Button>
      </div>
    </div>
  )
}
