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

## Bổ sung 19/11 (chị Trang, đợt 2)

- **Ô chọn khóa ở Lịch sử buổi học** hiện giá SALE (vd CAP3 Khóa 2 SALE -40%: 1.333 → 800đ/phút); đổi buổi sang khóa SALE tính lương theo giá đó.
- **Cột Lương buổi** (trang học viên + trang gia sư trong admin): buổi SALE hiện lương giá gốc gạch ngang, lương đã giảm và nhãn SALE -X%. % lấy từ ca ưu đãi của buổi (Class Hunting / xếp lớp SALE), hoặc từ khóa SALE khi buổi đã tính theo giá khóa.
- **Chỉnh sửa khóa học** (khóa đang/đã là SALE) có 2 ô tick, mặc định tick khi đổi mức SALE:
  1. Giảm kim cương theo SALE: mỗi đợt giữ số phút, kim cương = phút quy theo mức trừ mỗi ca (1.500 → 1.080 khi -30%). Đợt từ giao dịch nạp tự động giữ nguyên.
  2. Áp SALE cho các ca đã xếp tay giá thường chưa duyệt (ca đang giữ + ca của buổi chờ duyệt/bị từ chối): cùng snapshot như Xếp lớp nhanh có giảm giá (`classHuntId manual-promo-…`, kim cương/25' và lương giảm %); số kim cương đang giữ giảm theo. Không đụng ca Class Hunting, ca đã có ưu đãi, buổi đã duyệt.
  Không chặn khi lịch đang giữ vượt quỹ mới (giáo vụ xử lý ở đối soát quỹ buổi). Một transaction, log `REPRICE_COURSE_SALE`.
- Kiểm chứng: build đạt, 310/310 test; harness: khóa 1.500 KC + 4 ca giữ + 1 ca buổi bị từ chối + 1 ca Class Hunting + 1 ca buổi đã duyệt → ghi quỹ 1.080, giữ 100 → 72, đúng 5 ca 18 KC & 583đ/phút, log đầy đủ.

## Bổ sung 19/11 (đợt 3): trang gia sư vẫn hiện lương cũ

- Nguyên nhân: (1) khóa Phuong Thuy (HSYMNEQA) đã là SALE -50% nhưng 30 ca đã xếp tay vẫn giá thường (25 KC, 833đ/phút) — chưa ai áp SALE cho ca; (2) trang gia sư ước lương buổi chưa duyệt theo giá ghi trên buổi, kể cả khi ca đã có snapshot SALE.
- Sửa: trang gia sư ước lương buổi chưa duyệt theo snapshot ca ưu đãi (đúng số sẽ chốt khi duyệt) → hiện giá gốc gạch ngang + SALE. Trang học viên có thanh đỏ "khóa SALE còn N ca tính giá thường" + nút "Áp SALE cho các ca này" (mở Sửa khóa, ô áp SALE cho ca mặc định tick). Chạy thử chỉ đọc trên dữ liệu thật Phuong Thuy: 30 ca → 13 KC & 417đ/phút, giữ chỗ 600 → 312.
