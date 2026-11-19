# Khóa SALE: kim cương tự giảm + nhắc tải lại bản mới

## Báo lỗi (19/11/2026)

- Chị Trân: lớp Vy Kim (HS0NKTDT) đăng Class Hunting giảm 30% nhưng buổi 13/11 trừ đủ 50 KC và lương gia sư không giảm.
- Chị Trang Dâu: ở "Thêm khóa học mới" cho ô tổng kim cương lên trên ưu đãi, chọn ưu đãi thì kim cương tự giảm; Class Hunting phải tự điền % theo khóa.

## Gốc lỗi Vy Kim (đã đối chiếu dữ liệu production, chỉ đọc)

- Lớp Class Hunting `hunt_p05P2q9Y0o3018kYrvPcLEtb` đúng là SALE 30%: 12 ca, mỗi ca 18 KC, lương 817đ/phút.
- Sáng 13/11 giáo vụ huỷ 2 ca 18:00/18:30 ngày 13/11 (và ca 18/12 18:30), tối 13/11 xếp tay "học bù trong quá khứ" 19:00 + 19:30 với **giảm giá = không** → 2 ca mới 25 KC, không có snapshot lương ưu đãi.
- Buổi `ehfwCYSt9UO8MzXN0q3x` (50 phút) đã duyệt: trừ 50 KC (đúng là 36), lương 58.350đ (đúng là 40.850đ). Lệch: học viên +14 KC, gia sư +17.500đ.
- Luồng Class Hunting vẫn tính đúng: mọi buổi khác của các khóa SALE nối với ca Class Hunting đều trừ 18/15/13 KC và lương đã giảm.
- Log xếp lịch 17–18/11 của cùng giáo vụ không có trường `promoDiscountPercent` → tab trình duyệt vẫn chạy bản **trước 13/11**, nên ô giảm giá/tự điền SALE không có tác dụng.

Ca xếp tay giá thường còn đang chờ trên khóa SALE (chưa sửa, cần quyết định): HS23JB5C 2 ca 19/11 21:00/21:30; HSZ900VR 2 ca 18/11 19:30/20:00 (buổi đang bị từ chối).

## Thay đổi

1. **Thêm khóa học mới**: "Tổng số kim cương (giá gốc)" nằm trên "Ưu đãi của khóa học". Chọn SALE → hiện kim cương sau ưu đãi (vd 300 → 216). Lưu: quỹ khóa = kim cương đã giảm, đợt 1 ghi `learningMinutes` = số gốc, `diamonds` = số đã giảm (giống cách giáo vụ đang tính tay).
   Công thức `courseSaleDiamonds`: gốc × round(25 × (100−%)/100) / 25, làm tròn nguyên — khớp đúng mức trừ mỗi ca nên số phút giữ nguyên.
2. **Sửa khóa**: đổi SALE không tự đổi quỹ (giữ nguyên như trước) — có dòng nhắc rõ.
3. **Cộng thêm quyền học** trên khóa SALE: mặc định kim cương đã giảm + nút "SALE -X%".
4. **Class Hunting / Xếp lớp nhanh**: vẫn tự điền % theo khóa (có từ 17/11); thêm dòng "Đã tự điền theo ưu đãi của khóa" và cảnh báo + nút "Dùng SALE -X% của khóa" khi giáo vụ chọn mức khác.
5. **Nhắc tải lại**: build sinh `/version.json`; tab đã đăng nhập kiểm tra mỗi 5 phút/khi quay lại tab, có bản mới thì hiện thanh "Tải lại" (không tự tải để khỏi mất dữ liệu đang nhập).

Không đổi Cloud Functions, Rules, index, không sửa dữ liệu production.

## Kiểm chứng

- `npm run build` đạt; `node --experimental-strip-types --test tests/*.test.ts`: 305/305 đạt (thêm test `courseSaleDiamonds` khớp 5 khóa giáo vụ đã tính tay).
- Harness giao diện (Firestore giả lập): thêm khóa 300 KC + SALE 30% → ghi 216 KC, đợt 300 phút/216 KC; cộng quyền học mặc định 250 phút/180 KC; Class Hunting tự điền 50%, chọn "Lớp thông thường" hiện cảnh báo, bấm nút về lại 50%; mobile 375px không tràn ngang.
