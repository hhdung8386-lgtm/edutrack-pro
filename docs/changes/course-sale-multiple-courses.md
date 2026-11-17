# Ưu đãi theo khóa và nhiều khóa cùng môn

## Phạm vi và bản nền

- Production đã xác minh qua Vercel: `123english.edu.vn`, deployment `dpl_2ZxyVcytEysCMfoMCzv8J1E7uEGF`, commit `d6e002fdbd659db1f9db1bc096ee704e760ffe28`.
- Nhánh triển khai công việc: `codex/course-sale-multiple-packages`, tạo riêng từ đúng commit production. Các thay đổi chưa commit tại `D:/trackingplatium` được giữ nguyên.
- Chưa deploy, chưa push. Không sửa dữ liệu production, Rules, indexes, Storage Rules hay cấu hình Firebase. Không tạo tài khoản/mật khẩu.

## Hành vi

1. Form thêm/sửa khóa có SALE 10–50% theo các mức hiện có của xếp lớp thủ công. Không giảm = 0; khóa cũ thiếu field được hiểu là không giảm.
2. Chọn khóa trong Class Hunting/xếp lớp thủ công sẽ điền ưu đãi của khóa. Giáo vụ vẫn chọn mức khác hoặc lớp thường. Mức chọn thay thế mặc định, không cộng dồn hai lần.
3. Lịch đã đặt giữ nguyên snapshot kim cương và thù lao. Đổi ưu đãi của khóa không tính lại lịch đã chốt.
4. Thêm lại môn đã có tạo khóa riêng, hiển thị “Khóa 2”, “Khóa 3”… Mỗi khóa giữ riêng quỹ, đợt thanh toán, giáo trình, lịch đặt và lịch sử học.
5. “Thêm đợt thanh toán”/“Tặng buổi” trên khóa vẫn nạp vào đúng khóa đang chọn. Nạp qua gói danh mục của phụ huynh vẫn dùng khóa gốc theo hành vi hiện tại; không tự chuyển khoản nạp sang khóa phụ.
6. Form lưu bằng transaction, so với bản dữ liệu lúc mở form. Cập nhật đồng thời (kể cả listener đã đưa props mới về form) sẽ báo tải lại thay vì ghi đè quỹ. Hồ sơ legacy được vật chất hóa thành khóa cũ trước khi thêm khóa mới; không bỏ số dư legacy.
7. SALE tiếp tục dùng chính sách hiện hữu: khóa 1 kèm 1 có đơn giá VND; kim cương và thù lao giảm theo quy tắc làm tròn hiện tại.

## Danh tính khóa và tương thích

`StudentSubject.subjectId` tiếp tục là khóa quỹ được truyền xuyên suốt booking, lesson, approval, reversal, payroll và holds. Không đổi mã của dữ liệu cũ và không thêm đường phân bổ quỹ mơ hồ.

Khóa cùng môn bổ sung có mã `course__<32 hex>__<catalog ID>`. `getCatalogSubjectId` chỉ giải mã ở nơi đọc danh mục, kiểm tra môn gia sư, lọc theo môn hoặc tổng hợp báo cáo. Các thao tác tài chính luôn dùng toàn bộ mã khóa. Vì vậy mọi đường duyệt/hoàn/tính lại hiện hữu vẫn khớp đúng một dòng quỹ. Không tạo bản sao môn trong danh mục.

Helper phía browser/backend được kiểm tra nội dung đồng nhất. Mã có giới hạn 160 ký tự như API hiện hữu. Danh mục đổi tên vẫn giữ số thứ tự khóa. Chú thích gia sư dùng chung cache theo môn gốc.

Backend Class Hunting phân biệt: bỏ field ưu đãi = dùng mặc định khóa; `null` = lớp thường; số = mức giảm riêng. Lần đăng được ghi nhận để retry tiếp tục dùng snapshot đã lưu, kể cả mặc định khóa thay đổi sau đó. Không đổi cách claim/settle snapshot hiện có.

## Invariant số liệu

- Quỹ mỗi khóa: `còn lại = max(0, tổng − đã dùng)` theo sổ hiện có; không bù chéo khóa bị vượt quỹ.
- Tổng hồ sơ = tổng các quỹ thành phần; giữ chỗ dùng giá của booking đã chốt.
- Khả dụng khóa = còn lại khóa − hold của đúng mã khóa; đồng thời phải vượt qua kiểm tra khả dụng tổng hồ sơ hiện hữu.
- SALE chỉ thay giá tiêu thụ mỗi ca và snapshot thù lao; không tự nhân số kim cương đã mua.
- Phút học không thay đổi do SALE. Giá kim cương/25 phút làm tròn nguyên như chính sách hiện tại; ví dụ cơ sở 25, SALE 30% → 18, SALE 50% → 13.
- Sửa ưu đãi/metadata không đổi mã khóa, không xóa đợt thanh toán, không thay booking đã chốt.

## Ma trận ảnh hưởng và bằng chứng

| Dữ liệu/luồng | Nguồn tạo, cập nhật/xóa | Nơi đọc/quyền/tác vụ | Kết quả và kiểm chứng |
|---|---|---|---|
| `students.subjects`, ưu đãi, tổng quỹ | Form thêm/sửa, thêm đợt/tặng, sửa/xóa đợt, xóa khóa, nạp danh mục | Admin/giáo vụ, phụ huynh, đối soát, báo cáo | Browser + Firebase Emulator: thêm 3 khóa cùng môn, sửa SALE, giữ quỹ khác, chặn stale write; unit tests ledger/deletion/legacy |
| Class Hunting | Lookup/preview/publish/update/claim/cancel/retry | Giáo vụ, gia sư, backend giao dịch/notifications | Browser với lookup service giả lập: tự điền 20%/50%, override 35%, lớp thường; backend unit: default/override, exact fund, holds, curriculum, price; các test Class Hunting hiện hữu đạt |
| Xếp lớp thủ công, booking hold | Xếp mới/lặp/bù, hủy/nhả, pending rebook | Giáo vụ, gia sư, phụ huynh, lịch, reminder | Browser + Firebase Emulator/rules thật: lưu ca khóa phụ, override 50%, giá 13/25, snapshot 1.000 VND/phút, hold đúng một lần; unit booking/hold/release/settlement |
| Lesson/approval/reversal/payroll | Điểm danh, duyệt/hủy duyệt/tính lại | Gia sư, admin/kế toán, lịch sử phụ huynh, publicLessons | Static audit các đường đọc danh mục/ghi quỹ và unit regression; giá đọc từ môn gốc, quỹ vẫn khớp nguyên mã khóa |
| Đặt lịch từ profile phụ huynh | `createParentProfileBooking` | Phụ huynh, gia sư, xác nhận/từ chối/hoàn hold | Static audit + backend unit: qualifier dùng môn gốc, quota/booking dùng đúng mã khóa. Không thêm chính sách SALE mới cho đường tự đặt ngoài phạm vi yêu cầu |
| Môn/danh mục | Đổi tên, tạm dừng/xóa mềm | Bộ lọc học viên, chọn gia sư, notes, báo cáo và kiểm kê trước xóa môn | Giải mã chỉ ở catalog; rename giữ nhãn Khóa N; kiểm kê gom tất cả khóa của môn bằng query một trường, chia nhóm 10; không cần index mới |
| Public/background | publicLessons, reminders, notifications, payroll exports | Trang công khai, backend/tác vụ nền | Static audit; giữ nguyên snapshot tên và khóa quỹ. Bộ test backend gồm reminders/security/settlement đạt; không thêm tác vụ nền |

## Kiểm chứng đã chạy

- `npm run build`: kiểm tra TypeScript và build frontend đạt.
- `npm test` trong `functions`: build backend và **217 tests đạt**.
- `node --experimental-strip-types --test tests/*.test.ts`: **299 tests đạt**.
- Firestore Emulator dùng nguyên Rules hiện tại: **30 tests quyền đạt**, gồm admin/giáo vụ được lưu khóa phụ và SALE; gia sư/public bị từ chối sửa.
- Browser Edge headless, desktop 1440×1000 và mobile 390×844: form thêm/sửa/hủy, không tràn ngang trong modal, lưu ba khóa cùng môn, SALE 30%/50%, chỉnh ưu đãi giữ nguyên quỹ và mã, reject cập nhật stale. Không có browser exception trong các luồng này.
- Browser legacy/permission: giữ hồ sơ bảo lưu và quỹ legacy khi thêm khóa, sửa SALE giữ chuẩn buổi 50 phút, bổ sung giá thiếu từ danh mục cho SALE tương lai; lỗi quyền giữ nguyên mọi field và có thể thử lại/hủy.
- Browser Class Hunting dùng lookup/list giả lập tại ranh giới dịch vụ; browser manual scheduling dùng Firestore Emulator thật và Rules thật. Không gọi dịch vụ production.
- `git diff --check`: đạt.

| Vai trò | Mức kiểm tra | Giới hạn |
|---|---|---|
| Admin/giáo vụ | Đã kiểm thử browser + emulator và unit | Chưa thao tác production |
| Kế toán | Chỉ static-audit UI; unit payroll/approval đạt | Chưa kiểm thử thực tế bằng tài khoản kế toán |
| Gia sư | Chỉ static-audit UI; backend/unit/rules đạt | Chưa nhận lớp/điểm danh thực tế qua callable đã deploy |
| Phụ huynh/học viên | Chỉ static-audit UI; backend quota/booking unit/rules đạt | Chưa kiểm thử thực tế bằng tài khoản phụ huynh |
| Public | Chỉ static-audit; rules test đạt | Không đổi public payload; chưa kiểm thử production |
| Backend/tác vụ nền | Build + unit tests đạt | Chưa chạy callables/reminders trên production |

## Khi được yêu cầu triển khai

Đối chiếu lại production và diff trước khi release. Cần cập nhật backend trước frontend, đặc biệt `previewClassHunt`, `publishClassHunt`, `createParentProfileBooking`; kiểm tra toàn bộ exports dùng helper đã đổi khi lập lệnh deploy. Không deploy Rules/index/config. Sau đó dùng tài khoản thật kiểm tra thêm khóa, ưu đãi mặc định/override, claim, điểm danh/duyệt/hoàn và màn phụ huynh. Yêu cầu refresh các phiên frontend cũ vì chúng chưa biết cách đọc catalog từ mã khóa phụ.

Mọi thay đổi trong tài liệu này là mã nguồn đã chuẩn bị; không phải xác nhận đã triển khai production.
