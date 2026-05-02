import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/Button'
import { Home } from 'lucide-react'

export function NotFoundPage() {
  const navigate = useNavigate()
  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center">
      <div className="text-center">
        <p className="text-8xl font-black text-slate-700 mb-4">404</p>
        <h1 className="text-2xl font-bold text-slate-300 mb-2">Trang không tồn tại</h1>
        <p className="text-slate-500 mb-8">Đường dẫn bạn tìm kiếm không tồn tại hoặc đã bị xóa</p>
        <Button onClick={() => navigate('/')}>
          <Home className="w-4 h-4" />
          Về trang chủ
        </Button>
      </div>
    </div>
  )
}
