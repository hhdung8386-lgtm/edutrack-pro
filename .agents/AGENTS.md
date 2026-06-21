# Hướng dẫn Phát triển & Triển khai (Developer Rules)

Tài liệu này chứa các quy tắc bắt buộc áp dụng cho toàn bộ các tác vụ lập trình và triển khai ứng dụng **Edutrack Pro** lên Vercel. Mọi AI Agent tham gia phát triển dự án này cần tuân thủ nghiêm ngặt các điều khoản dưới đây.

---

## 1. Quy trình Triển khai (Deployment Checklist)

### ⚠️ BẮT BUỘC: Không Deploy code khi chưa Commit & Push Git
* **Không chạy lệnh deploy (`vercel --prod`) trực tiếp từ code local chưa lưu.**
* Mọi tính năng mới hoặc bản sửa lỗi phải được **commit và push đầy đủ lên GitHub** trước. Tránh việc mất đồng bộ mã nguồn giữa Vercel Auto-deploy (qua Git integration) và deploy thủ công tại local.

### 🔍 Kiểm tra Kiểu dữ liệu & Build thử nghiệm trước khi Deploy
Trước khi deploy hoặc kết thúc tác vụ, bắt buộc phải chạy các lệnh kiểm tra sau tại thư mục gốc:
1. `npx tsc --noEmit` (Kiểm tra lỗi kiểu dữ liệu TypeScript).
2. `npm run build` (Biên dịch thử nghiệm ứng dụng).
*Tuyệt đối không đẩy code lên nhánh chính nếu hai lệnh trên báo lỗi.*

---

## 2. Quy tắc Lập trình & Truy vấn Dữ liệu (Coding & Queries)

### 📁 Nhất quán tên File & Import (Phân biệt chữ hoa/chữ thường)
* Vercel build trên môi trường Linux (phân biệt chữ hoa/chữ thường), trong khi phát triển local có thể chạy trên Windows.
* **Quy tắc**: Tên component viết PascalCase (ví dụ: `TeacherFormModal.tsx`), tên hàm/tiện ích viết camelCase. Kiểm tra kỹ đường dẫn import để tránh lỗi `Module not found` khi deploy.

### ⚡ Tối ưu hóa Firestore & Tránh lỗi Index
* **Tránh lỗi Composite Index**: Đối với các câu truy vấn lọc/sắp xếp phức tạp kết hợp nhiều trường (ví dụ: vừa lọc trạng thái vừa lọc ngày), hãy kiểm định cẩn thận. Ưu tiên lọc đơn giản kết hợp xử lý client-side hoặc sử dụng `getCountFromServer` cho các truy vấn đếm.
* **Phòng vệ dữ liệu**: Luôn dùng toán tử optional chaining `?.` hoặc cung cấp giá trị mặc định cho dữ liệu trả về từ Firebase (đặc biệt là trường thời gian `createdAt` có thể bị `null` tạm thời khi ghi offline).
