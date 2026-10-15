import { ArrowUpRight } from 'lucide-react'

/*
  Bài báo viết về 123English. Chỉ giữ tiêu đề, tóm tắt ngắn tự viết và ảnh đại diện
  (ảnh tư liệu của 123English dùng trong bài), bấm thẻ để đọc bài gốc trên trang báo.
*/
const PRESS_ARTICLES = [
  {
    outlet: 'Gia Đình Mới',
    date: '15/10/2026',
    title: 'Học viên 123English khám phá Sài Gòn, thực hành tiếng Anh qua chương trình EXPLORE & SPEAK',
    summary:
      'Buổi ngoại khóa ngày 10/10: học viên từ 6 tuổi tham quan các địa điểm văn hóa, lịch sử ở trung tâm TP.HCM và luyện nói tiếng Anh cùng giáo viên.',
    image: '/press/explore-speak.webp',
    imageAlt: 'Học viên 123English chụp ảnh lưu niệm tại Bưu điện Thành phố trong chương trình EXPLORE & SPEAK',
    url: 'https://giadinhmoi.vn/hoc-vien-123english-kham-pha-sai-gon-thuc-hanh-tieng-anh-qua-chuong-trinh-explore-speak-d100208.html',
  },
  {
    outlet: 'Dân trí',
    date: '07/10/2026',
    title: '123English và hành trình đồng hành cùng gia đình Việt trong việc học tiếng Anh',
    summary:
      'Nhu cầu học thêm tiếng Anh của mỗi gia đình mỗi khác, và cách 123English tổ chức học trực tuyến 1 kèm 1 để theo sát từng học viên.',
    image: '/press/top-brand-2026.webp',
    imageAlt: 'Đại diện 123English nhận giải Thương hiệu mạnh quốc gia 2026',
    url: 'https://dantri.com.vn/giao-duc/123english-va-hanh-trinh-dong-hanh-cung-gia-dinh-viet-trong-viec-hoc-tieng-anh-20261007190153654.htm',
  },
  {
    outlet: 'Kenh14',
    date: '03/10/2026',
    title: '123English đồng hành cùng các gia đình Việt trong việc học tiếng Anh',
    summary:
      'Nhìn lại chặng đường hoạt động trong giáo dục trực tuyến và cách phụ huynh cùng con theo dõi quá trình học tại nhà.',
    image: '/press/dong-hanh-gia-dinh.webp',
    imageAlt: 'Phụ huynh cùng con học tiếng Anh trên máy tính bảng',
    url: 'https://kenh14.vn/123english-va-hanh-trinh-dong-hanh-cung-hon-10000-gia-dinh-viet-trong-viec-hoc-tieng-anh-215261003111359685.chn',
  },
  {
    outlet: 'Cafe Đầu tư',
    date: '03/10/2026',
    title: 'Làn sóng EdTech tại Việt Nam: Khi công nghệ đi sâu hơn vào hoạt động giáo dục',
    summary:
      'Bài viết về công nghệ trong giáo dục, nhắc đến mô hình 1 giáo viên – 1 học viên và hệ thống quản lý lịch học, điểm danh, bài tập của 123English.',
    image: '/press/edtech-1-kem-1.webp',
    imageAlt: 'Một buổi học tiếng Anh trực tuyến 1 kèm 1 tại 123English',
    url: 'https://cafedautu.vn/lan-song-edtech-tai-viet-nam-khi-cong-nghe-di-sau-hon-vao-hoat-dong-giao-duc-d15650.html',
  },
]

export function PressCoverage() {
  return (
    <section className="press-coverage" aria-labelledby="press-coverage-title">
      <div className="press-coverage-inner">
        <div className="press-coverage-heading">
          <h2 id="press-coverage-title" className="landing-section-title">Báo chí nói về 123English</h2>
          <p>Các bài viết về hoạt động của 123English trên báo điện tử. Bấm vào từng bài để đọc bản gốc.</p>
        </div>

        <div className="press-coverage-grid" role="list">
          {PRESS_ARTICLES.map((article) => (
            <a
              key={article.url}
              role="listitem"
              href={article.url}
              target="_blank"
              rel="noopener noreferrer"
              className="press-card"
              aria-label={`${article.title} – đọc trên ${article.outlet} (mở tab mới)`}
            >
              <div className="press-card-media">
                <img src={article.image} alt={article.imageAlt} loading="lazy" decoding="async" width={960} height={720} />
                <span className="press-card-outlet">{article.outlet}</span>
              </div>
              <div className="press-card-body">
                <time>{article.date}</time>
                <h3>{article.title}</h3>
                <p>{article.summary}</p>
                <span className="press-card-link">
                  Đọc trên {article.outlet}
                  <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
                </span>
              </div>
            </a>
          ))}
        </div>
      </div>
    </section>
  )
}
