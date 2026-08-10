---
name: rulehd
description: Quy ước bắt buộc bảo vệ 123English khi thay đổi giao diện, chức năng, dữ liệu hoặc triển khai. Dùng khi người dùng gọi /ruleHD, yêu cầu chỉnh sửa 123English, hoặc yêu cầu kiểm tra trước khi deploy.
---

# Rule HD — Quy ước an toàn cho 123English

Áp dụng toàn bộ quy ước dưới đây trước khi phân tích, chỉnh sửa, kiểm tra hoặc triển khai. Mục tiêu là giữ nguyên phiên bản đang chạy tốt, chỉ bổ sung đúng phần được yêu cầu và không làm mất dữ liệu hay hỏng chức năng cũ.

## 1. Phiên bản chuẩn và phạm vi thay đổi

- Xem phiên bản production hiện tại được người dùng xác nhận là phiên bản chuẩn. Mọi thay đổi mới phải bắt đầu từ đúng mã nguồn/nhánh của phiên bản đó.
- Chỉ sửa các trang, route, component, dữ liệu và chức năng có liên quan trực tiếp đến yêu cầu. Không tự ý đổi giao diện, cấu trúc, màu sắc, text hoặc logic của các trang không liên quan.
- Trước khi sửa, kiểm tra trạng thái Git và phần thay đổi hiện có. Không ghi đè, xóa, stash, reset hoặc gộp nhầm thay đổi do người khác tạo.
- Khi Codex và Claude cùng làm dự án: chỉ một bên được quyền chỉnh code hoặc triển khai tại một thời điểm. Bên tiếp nhận phải đọc diff, nhánh hiện tại và thay đổi chưa lưu trước khi làm tiếp.
- Nếu không xác định được bản chuẩn, nhánh đang dùng, hoặc phạm vi của thay đổi, dừng lại để báo rõ thay vì đoán.

## 2. Logic, liên kết và dữ liệu

- Phân tích đầy đủ luồng dữ liệu trước khi sửa: nguồn dữ liệu, kiểu dữ liệu, quyền truy cập, trạng thái, các trang gửi dữ liệu và các trang nhận/hiển thị dữ liệu.
- Các trang liên quan phải dùng cùng logic và cùng định nghĩa dữ liệu. Khi một thao tác thay đổi trạng thái ở trang A, trang B/C liên quan phải hiển thị đúng dữ liệu mới.
- Không chỉ làm phần nhìn. Mọi nút bấm, lọc, tìm kiếm, chọn hàng loạt, lưu, hủy, điều hướng và trạng thái tải/lỗi phải hoạt động đúng.
- Không thay đổi schema, xóa trường, ghi đè mảng, xóa dữ liệu hoặc chạy cập nhật hàng loạt nếu chưa đánh giá tương thích dữ liệu cũ và có phương án an toàn.
- Luôn giữ tương thích dữ liệu cũ: dùng giá trị mặc định, kiểm tra null/undefined và hiển thị trạng thái trống phù hợp khi dữ liệu chưa có.

## 3. Firebase và quyền dữ liệu

- Không tự ý chỉnh hoặc triển khai Firebase Security Rules, Storage Rules, Firestore Indexes hoặc cấu hình Firebase.
- Nếu một chức năng cần thay đổi Firebase, phải báo người dùng trước khi làm và nêu rõ lý do, thay đổi dự kiến và đúng path để người dùng tự cập nhật thủ công:
  - `D:\trackingplatium\firestore.rules`
  - `D:\trackingplatium\storage.rules`
  - `D:\trackingplatium\firestore.indexes.json`
  - `D:\trackingplatium\firebase.json`
- Không coi việc build thành công là bằng chứng quyền Firebase đúng. Phải kiểm tra các luồng đọc/ghi liên quan và cảnh báo nếu có khả năng cần index hoặc quyền mới.

## 4. Giao diện và trải nghiệm

- Không sử dụng emoji làm icon trong giao diện. Dùng hệ icon nhất quán của dự án, ưu tiên icon vector rõ nghĩa và có nhãn/tooltip khi cần.
- Với trang mới hoặc phần giao diện quan trọng, dùng skill UI/taste phù hợp của dự án để rà soát bố cục, typography, màu sắc, trạng thái nút và khoảng cách. Có thể tham khảo repo hoặc giao diện mẫu, nhưng không sao chép thiếu kiểm soát.
- Bố cục phải rõ hành động chính, ưu tiên thao tác thường dùng, tránh nút quá nhỏ hoặc đặt xa nội dung liên quan. Nút nguy hiểm phải có xác nhận phù hợp.
- Thiết kế và kiểm tra cả desktop lẫn mobile. Desktop cần tận dụng không gian, mobile cần chạm dễ, không tràn ngang, không che nội dung bằng bottom bar/modal, và có trạng thái responsive cho bảng dữ liệu.
- Không phá vỡ nhận diện đang dùng của khu vực liên quan. Nếu cần đồng bộ màu/font theo một trải nghiệm đã có, tái sử dụng token/component hiện hữu trước khi tạo style mới.

## 5. Kiểm tra trước khi kết thúc

- Kiểm tra diff để chắc rằng chỉ các file đúng phạm vi mới bị thay đổi. Nêu rõ mọi file ngoài phạm vi nếu có.
- Chạy kiểm tra kiểu dữ liệu và build trước khi giao việc triển khai. Không tiếp tục deploy nếu bất kỳ kiểm tra nào lỗi.
- Thử các luồng bị tác động trên desktop và mobile: mở trang, điều hướng, lưu/hủy, tải lại, dữ liệu trống, lỗi quyền và thao tác chọn hàng loạt nếu có.
- Khi phần thay đổi có thể ảnh hưởng chức năng cũ, thực hiện kiểm tra hồi quy tương ứng, gồm các luồng liên quan đến đặt lịch/kim cương, ca quá hạn, nhận xét, duyệt buổi, tính lại, lương và báo cáo.
- Không tuyên bố "không có lỗi" tuyệt đối. Chỉ báo những gì đã kiểm tra, kết quả, giới hạn chưa thể kiểm tra và rủi ro còn lại.

## 6. Quy tắc triển khai

- Không deploy khi người dùng chưa yêu cầu triển khai rõ ràng.
- Không deploy mã nguồn đang dở dang, thay đổi chưa được đối soát, hoặc thay đổi do nhiều agent thực hiện mà chưa kiểm tra lại.
- Trước khi deploy: xác định đúng nhánh/bản chuẩn, kiểm tra Git diff, commit và push thay đổi đã được duyệt, chạy kiểm tra kiểu dữ liệu và build thành công.
- Không dùng deploy thủ công để ghi đè một deployment khác khi chưa biết commit nguồn. Bảo toàn khả năng quay lại bản chuẩn.
- Sau deploy: kiểm tra phiên bản production/custom domain và thử các luồng vừa sửa. Báo lại chính xác phạm vi đã thay đổi, các kiểm tra đã chạy, kết quả và mọi việc Firebase người dùng cần cập nhật thủ công.
- Nếu không thể xác minh an toàn, không deploy. Báo nguyên nhân và phương án xử lý thay vì mạo hiểm.

## 7. Cách báo cáo trong mỗi nhiệm vụ

- Trước khi thực hiện: nêu phạm vi, giả định và phần nào sẽ không đụng tới.
- Sau khi thực hiện: nêu file/chức năng đã thay đổi, liên kết dữ liệu đã kiểm tra, desktop/mobile đã kiểm tra, và việc Firebase/deploy nếu có.
- Nếu phát hiện yêu cầu có thể làm mất dữ liệu hoặc phá luồng cũ, dừng để xin xác nhận có hiểu biết trước khi thực hiện.

## 8. Theo dõi chi phí data sau tối ưu

- Khi người dùng nhập câu `kiểm tra chi phí data sau khi chỉnh sửa` hoặc một câu có cùng ý nghĩa, tự động thực hiện quy trình kiểm tra chi phí data của 123English theo chế độ chỉ đọc; không yêu cầu người dùng chỉ lại từng màn hình hoặc query.
- Mốc so sánh mặc định là từ ngày đầu tháng hiện tại đến thời điểm kiểm tra. Nếu người dùng nói không tính phần đầu tháng trước khi chỉnh sửa, tách rõ giai đoạn trước và sau deploy, đồng thời ưu tiên tốc độ reads/ngày của giai đoạn sau deploy để dự phóng.
- Thu thập tối thiểu: tổng Firestore document reads theo ngày, tỷ trọng QUERY/LOOKUP/NOT_FOUND nếu có, số ngày quan sát, tốc độ trung bình sau deploy, dự phóng cả tháng và ước tính phần chi phí document reads. Nêu rõ mọi thành phần chưa tính như storage, network, hosting, thuế, credits hoặc tỷ giá.
- So sánh kết quả với mục tiêu vận hành 600.000–800.000 VND/tháng và với baseline gần nhất đã được xác nhận. Không cam kết mức tiết kiệm khi chưa có ít nhất 72 giờ dữ liệu sau deploy; báo riêng kết quả 24/48/72 giờ nếu thời gian quan sát chưa đủ.
- Dùng Query Insights hoặc nguồn tương đương khi có phiên đăng nhập để xác định normalized query gây tải cao. Nếu không truy cập được, kết hợp Cloud Monitoring, số lượng document production và static audit mã nguồn để xếp hạng listener toàn cục, truy vấn lấy toàn bộ rồi lọc, N+1, reconnect reads và query thiếu giới hạn.
- Khi phát hiện bất thường, trước tiên chỉ báo cáo nguyên nhân, phạm vi và phương án xử lý. Không chạy migration, cập nhật hàng loạt, xóa dữ liệu, thay Rules/index/config hoặc deploy thêm nếu người dùng chưa cấp quyền rõ ràng.
- Báo cáo phải có: kỳ đo chính xác, số liệu nguồn, giả định tính tiền, thay đổi so với baseline, các query/luồng nghi vấn, mức độ tin cậy, giới hạn quan sát và đề xuất tiếp theo.
