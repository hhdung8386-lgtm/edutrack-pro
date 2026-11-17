# Sửa lỗi không lưu được ưu đãi từ hồ sơ học viên

## Bản nền và nguyên nhân

Production trước bản sửa: commit `3297b8a4fd5768189f03ca1fed5cc18b6e443e57`, deployment `dpl_C6VfqrTc4kr87MojwqgDH1i488YJ`, domain `123english.edu.vn`.

Đã tái hiện lỗi từ **StudentDetailPage thật** nối Firebase Emulator và Rules hiện tại. Khóa có tổng 1.200 kim cương, đã dùng 18, còn 1.182; bộ đếm lưu là 47,28 buổi. Trang hồ sơ tạo `reconciledStudent` để hiển thị số buổi làm tròn xuống thành 47 rồi truyền object này vào form. Form so sánh nó với bản gốc trong transaction nên báo nhầm “Khóa học vừa thay đổi” dù chưa có ai cập nhật dữ liệu.

Bài kiểm tra trước chỉ mở form trực tiếp với dữ liệu gốc nên không phát hiện đường truyền object đã tính lại từ trang hồ sơ. Các lần tái hiện lỗi bị chặn trước lệnh ghi; dữ liệu giả lập được đối chiếu và không thay đổi.

## Thay đổi và invariant

- Form thêm/sửa nhận `student` gốc; các màn hình tổng hợp tiếp tục dùng dữ liệu hiển thị hiện hữu.
- Kiểm tra stale write so sánh toàn bộ giá trị, không phụ thuộc thứ tự key của Firestore map; vẫn giữ thứ tự mảng khóa/đợt thanh toán và phát hiện thay đổi thật.
- Sửa SALE/giáo trình/thông tin cùng khóa chỉ ghi mảng khóa từ snapshot mới nhất và `updatedAt`. Không tính lại tổng quỹ, số buổi, số đang giữ chỗ hoặc trạng thái cấp hồ sơ.
- Các trường tài chính của từng khóa được giữ từ snapshot transaction; đổi SALE không thay snapshot booking/lesson/payroll đã chốt. Giá VND thiếu trên gói legacy vẫn theo cơ chế bổ sung từ catalog đã có ở bản nền.
- Thêm khóa/chuyển môn tiếp tục đi qua nhánh cập nhật quỹ hiện hữu, với kiểm tra thay đổi đồng thời.
- Không chạy migration, không sửa dữ liệu học viên production, không sửa/deploy Firebase Rules/index/config hoặc backend.

Invariant cho sửa metadata: các trường `total/used/remaining Minutes/Sessions`, `minutesPerSession`, `heldMinutes`, `reservedMinutes`, trạng thái, đợt thanh toán và các khóa khác phải bằng giá trị trước khi lưu. Nếu có một cập nhật khóa thật giữa mở form và bấm lưu, phải từ chối transaction thay vì ghi đè.

## Ma trận ảnh hưởng và kiểm chứng

| Vai trò/luồng | Mức kiểm tra | Bằng chứng và kết quả |
|---|---|---|
| Admin/giáo vụ — sửa khóa từ hồ sơ | Đã kiểm thử browser + Firestore Emulator | Tái hiện thất bại ở bản nền; sau sửa lưu SALE 30% → 20%, tải lại và mở lại vẫn 20%; desktop 1440×1000 và mobile 390×844 |
| Quỹ khóa, tổng hồ sơ, giữ chỗ, trạng thái | Đã kiểm thử emulator + unit | Giữ số lẻ 47,28; giữ counter tổng legacy, trạng thái bảo lưu, hold 36, lịch sử đợt và khóa thứ hai cùng môn |
| Hai người thao tác đồng thời | Đã kiểm thử browser + emulator | Cập nhật attendance giả lập khi form đang mở: thao tác lưu SALE bị từ chối; used/remaining mới được giữ nguyên |
| So sánh snapshot, thêm đợt/xóa đợt, ledger | Đã kiểm thử unit | Thêm 5 regression tests; toàn bộ 304 frontend TypeScript tests đạt, gồm booking/approval/payroll/holds hiện hữu |
| Gia sư, kế toán | Chỉ static-audit cho hotfix; unit liên quan đạt | Không sửa đường điểm danh/duyệt/lương; không ghi lại các trường tài chính khi sửa SALE. Chưa dùng tài khoản thật trên production |
| Phụ huynh/học viên | Chỉ static-audit cho hotfix | Đọc cùng dữ liệu khóa sau listener cập nhật; không đổi API hoặc quyền. Chưa dùng tài khoản thật trên production |
| Public/backend/tác vụ nền | Chỉ static-audit, không đổi code | Không sửa public payload, callable, reminder hoặc tác vụ nền; không deploy backend trong hotfix |

`npm run build` và `git diff --check` đạt. Browser chạy chính trang hồ sơ, query/listener và transaction Firestore thật trong Emulator; không giả lập hàm lưu. Adapter Firebase/auth chỉ trỏ sang project demo, không có business write vào production.

Sau triển khai cần đối chiếu commit/deployment trên `123english.edu.vn` và mã JS được phục vụ. Production chỉ kiểm tra đọc; người dùng cần tải lại trang, mở lại form rồi lưu thay đổi mong muốn. Không tự đặt ưu đãi cho hồ sơ thật khi chưa có yêu cầu cụ thể cho hồ sơ đó.
