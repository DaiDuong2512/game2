# Đánh giá thiết kế và kế hoạch nâng cấp — bản 3.0

Tài liệu này đánh giá bản 2.0 theo góc nhìn phát hành một game survivor độc lập. Điểm số là thang chuyên môn 10 điểm, dùng để ưu tiên công việc chứ không phải điểm người dùng cuối.

## Kết luận trước khi sửa

Riftwarden đã có nền tảng kỹ thuật và lượng nội dung tốt hơn một bản thử nghiệm thông thường: vòng lặp chiến đấu hoàn chỉnh, dữ liệu lớn, tiến trình lâu dài, nhiều hệ build và hỗ trợ tiếng Việt. Điểm yếu lớn nhất không nằm ở “thiếu tính năng”, mà ở việc các hệ thống chưa cùng nói một ngôn ngữ trình bày: chuyển động chưa đủ trọng lượng, nhiều kỹ năng khác tên nhưng gần nhau về hình ảnh, HUD chia nhỏ sự chú ý và 20 bản đồ chưa được nối thành một hành trình có động cơ rõ.

| Hạng mục | Điểm bản 2.0 | Nhận định chính |
|---|---:|---|
| Giao diện và khả năng đọc | 7,1 | Đẹp, tương phản tốt nhưng nhiều khối HUD độc lập; build và mục tiêu trận chưa có một trật tự nhìn rõ. |
| Lối chơi cốt lõi | 7,6 | Vòng lặp chắc, nhiều hệ; nhịp wave và lựa chọn nâng cấp chưa luôn tạo quyết định build có ý nghĩa. |
| Nhân vật | 6,8 | 8 bộ chỉ số/Nộ/Tuyệt kỹ khác nhau, nhưng chỉ Kael có sprite di chuyển đầy đủ; phản hồi hình thể còn mỏng. |
| Chuyển động và game-feel | 5,9 | Điều khiển chính xác nhưng vận tốc đổi tức thời, dash đều tốc, camera thiếu nhìn trước và phản hồi va chạm. |
| Chiêu thức và VFX | 6,4 | Atlas pixel tốt; impact, telegraph và nhiều Tuyệt kỹ dùng ngôn ngữ vòng/aura quá giống nhau. |
| Buff và độ sâu build | 7,2 | Nhiều chỉ số và cộng dồn vô hạn; lựa chọn có lúc rời rạc, tiến hóa chưa phủ hết vũ khí. |
| Kẻ địch và Boss | 7,0 | Nhiều AI và dữ liệu; animation tấn công còn tĩnh, bố cục wave chưa tạo nhịp chiến thuật rõ. |
| Cốt truyện và thế giới | 3,2 | Tên gọi có bản sắc nhưng thiếu tiền đề, ba hồi, lời dẫn màn, quan hệ nhân vật, nhật ký và đoạn kết. |
| Tiếp cận và hiệu năng | 7,7 | Có giảm hạt, tương phản, mù màu, pool và spatial hash; cần giữ telegraph bắt buộc khi giảm hiệu ứng. |

Điểm tổng hợp trước sửa: **6,7/10**. Giá trị hiện tại nằm ở khối lượng nội dung và nền kỹ thuật; để có cảm giác “game hoàn chỉnh”, ưu tiên phải là game-feel, VFX, UI và cốt truyện thay vì thêm tiếp số lượng tính năng.

## Nguyên tắc nâng cấp bản 3.0

1. **Mọi chuyển động phải có chuẩn bị, hành động và hồi phục.** Đi bộ tăng/giảm tốc ngắn; dash có đường cong vận tốc; trúng đòn có recoil; camera nhìn trước theo hướng di chuyển/ngắm.
2. **Mỗi hiệu ứng có một silhouette riêng.** Đạn địch dùng góc nhọn/chevron; đạn người chơi dùng lõi sáng tròn/ngôi sao; Điện, Lửa, Độc, Mù và Vật lý khác nhau cả hình, nhịp lẫn màu.
3. **HUD trả lời bốn câu hỏi trong một lần quét mắt:** còn bao nhiêu Sinh lực, mục tiêu hiện tại là gì, kỹ năng nào sẵn sàng, build đang đi theo hướng nào.
4. **Cốt truyện không được chặn nhịp chơi.** Briefing ngắn trước màn, transmission một đến hai câu trong trận, kết quả sau màn và nhật ký để đọc lại.
5. **Nâng cấp phải tạo hướng build.** Mỗi lần chọn nên có ít nhất một lựa chọn hỗ trợ vũ khí/build hiện tại; tiến hóa phải phủ toàn bộ vũ khí nhưng không biến thành lựa chọn bắt buộc duy nhất.
6. **Hiệu năng là giới hạn thiết kế.** Số hạt, VFX atlas, đạn hiển thị và âm thanh đồng thời đều có ngân sách; phần sức mạnh vượt ngân sách được gộp về mặt số học.

## Chuẩn hình ảnh bản 3.0

- `docs/concepts/gameplay-v3.png`: chuẩn gameplay, HUD, chuyển động và ngôn ngữ VFX.
- `docs/concepts/story-briefing-v3.png`: chuẩn briefing, tiến trình ba hồi và nhật ký.
- `public/assets/generated/effects/status-impact-vfx-v3.png`: atlas 6 × 2 cho Độc và va chạm Vật lý.

## Tiêu chí chấp nhận

- Di chuyển tám hướng ổn định, analog giữ được độ lớn, dash không đổi quãng đường theo FPS và camera không gây chóng mặt.
- Đạn hai phe phân biệt được khi chuyển ảnh sang thang xám; telegraph vẫn rõ khi bật chế độ giảm hạt.
- Tám Tuyệt kỹ có choreography nhìn khác nhau, không chỉ đổi màu một vòng tròn chung.
- 20 màn thuộc đúng một trong ba hồi; mỗi màn có briefing, tín hiệu giữa màn, lời cảnh báo Elite/Boss, lời kết và mục nhật ký mở khóa.
- UI desktop và mobile không che vùng chiến đấu trọng tâm; nút chạm hoạt động và tiếng Việt không tràn khung.
- TypeScript strict, build sản xuất, toàn bộ test và kiểm tra dữ liệu/asset đều đạt trước khi đóng gói.

## Kết quả triển khai bản 3.0

Công việc được tách thành sáu luồng chuyên môn độc lập rồi tích hợp lại ở `GameManager`: chuyển động/game-feel, combat/VFX, cân bằng gameplay, UI/UX, cốt truyện và âm thanh phản hồi. Bảng dưới là điểm chuyên môn tạm tính sau triển khai dựa trên mã nguồn, dữ liệu, build và kiểm thử tự động. Đây chưa phải điểm chấm hình ảnh cuối trên thiết bị đích vì môi trường trình duyệt cloud chặn địa chỉ localhost.

| Hạng mục | Trước | Sau triển khai | Bằng chứng chính |
|---|---:|---:|---|
| Giao diện và khả năng đọc | 7,1 | **8,5** | HUD gọn theo lớp ưu tiên, mục tiêu hiện tại, trạng thái Nộ/Tuyệt kỹ tách rõ, responsive mobile, ARIA và focus bàn phím. |
| Lối chơi cốt lõi | 7,6 | **8,4** | Lựa chọn đầu trận 1/3, nâng cấp luôn có hướng build, đội hình wave chuyển từ fodder sang tanker/support/specialist. |
| Nhân vật | 6,8 | **8,4** | 8 Nộ và 8 Tuyệt kỹ khác biệt; cả 8 Hộ Vệ có hình người pixel toàn thân 8 hướng, với atlas riêng cho Kael và silhouette/vũ khí procedural riêng cho bảy nhân vật còn lại. |
| Chuyển động và game-feel | 5,9 | **8,6** | Gia tốc/phanh/đảo hướng, dash có đường cong, hit impulse, bước chân, dư ảnh, camera look-ahead và hit-stop ngắn. |
| Chiêu thức và VFX | 6,4 | **8,5** | Phân biệt silhouette hai phe, telegraph Boss, atlas trạng thái/impact, 8 choreography Tuyệt kỹ riêng và ngân sách hiệu ứng. |
| Buff và độ sâu build | 7,2 | **8,4** | 13/13 vũ khí có tiến hóa, stack dư được gộp số học, CDR/né tránh dùng lợi ích giảm dần, không sinh lựa chọn hồi máu lãng phí. |
| Kẻ địch và Boss | 7,0 | **8,2** | Run bob/squash, wind-up, recoil, lunge, hit flash; đội hình theo nhịp chiến thuật và đòn bị khóa đúng khi choáng/tê liệt. |
| Cốt truyện và thế giới | 3,2 | **8,3** | 3 hồi/20 màn, 80 mốc thoại, briefing, mục tiêu, truyền tin, 46 mục Thư Khố, quan hệ nhân vật và hậu truyện riêng. |
| Tiếp cận và hiệu năng | 7,7 | **8,2** | Hình dạng không phụ thuộc màu, giảm chuyển động/hạt, giới hạn voice/VFX/đạn, pool O(1), floating origin và kiểm tra tiếng Việt tĩnh. |

Điểm tổng hợp tạm tính sau triển khai: **8,4/10**. Mức tăng lớn nhất đến từ chuyển động, VFX và cốt truyện—đúng ba khoảng trống ảnh hưởng nhiều nhất tới cảm giác hoàn thiện của bản 2.0.

## Nợ thiết kế còn lại

1. Nếu chuẩn bị phát hành thương mại, thay dần hình người procedural của Mira, Toren, Nyra, Zarek, Elara, Titan và Nova bằng sprite sheet do họa sĩ vẽ tay để nâng độ chi tiết; chức năng chuyển động toàn thân 8 hướng hiện đã đầy đủ.
2. Chạy smoke-test thật ở `1600 × 900` và `390 × 844`, kiểm tra console, gamepad/chạm, tràn chữ tiếng Việt và ảnh chụp so sánh concept.
3. Đo FPS trung vị/1% thấp cùng số địch–đạn–hạt cực đại trên máy phổ thông; kiểm thử cấu trúc không thay thế benchmark phần cứng.
4. Thay âm procedural bằng bộ SFX/nhạc đã hòa âm nếu định phát hành thương mại; hệ hiện tại đã có cue, ưu tiên và giới hạn voice để làm nền tích hợp.
