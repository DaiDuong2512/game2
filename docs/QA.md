# Quy trình QA — Riftwarden: Echo Siege 4.0

Tài liệu này là checklist kiểm thử cho đúng gói phát hành 4.0. Không kế thừa trạng thái “đạt” của bản dựng cũ. Mọi kết quả cuối phải được ghi lại sau khi chạy lệnh và luồng trình duyệt trên bản dựng mới nhất.

## Trạng thái phát hành

| Hạng mục | Trạng thái | Bằng chứng cần lưu |
|---|---|---|
| TypeScript strict | **ĐẠT** | `npm --offline run check` hoàn tất không lỗi TypeScript ngày 2026-09-02 |
| Build sản xuất | **ĐẠT** | `dist/build-info.json` xác nhận phiên bản 4.0.2 |
| Bộ test Node | **ĐẠT — 148/148** | Toàn bộ kiểm thử dữ liệu, cơ chế, UI, VFX, âm thanh, neo vũ khí, ánh xạ Q/E/R và phát hành đều đạt |
| Luồng trình duyệt desktop | **ĐẠT LUỒNG KHÓI** | Chrome 1363 × 936, DPR 1; menu → nhân vật → bản đồ → briefing → cấp 1 → gameplay → buff cấp 2; 0 lỗi/cảnh báo từ game |
| Luồng trình duyệt mobile/chạm | **ĐẠT TĨNH / CHỜ THIẾT BỊ** | CSS và hợp đồng đầu vào đã kiểm thử; chưa chụp/xác nhận thao tác thật ở 390 × 844 |
| Cơ chế chiến đấu 4.0 | **ĐẠT TỰ ĐỘNG + KHÓI** | Vũ khí chính/phụ, mốc cấp, Bom Khói Độc, Q/E/R, vùng sinh quái, VFX và âm thanh |
| Hiệu năng mật độ cao | CHỜ ĐO TRÊN MÁY ĐÍCH | Ghi FPS, 1% thấp, số địch/đạn/hạt và bộ nhớ ổn định |
| Rà soát tiếng Việt | **ĐẠT TĨNH + LUỒNG KHÓI** | Không có ký tự thay thế; menu, lựa chọn, briefing, HUD, nâng cấp cấp 2 và ARIA đã kiểm tra trực quan |

## 1. Kiểm tra tự động

Chạy từ thư mục gốc dự án:

```bash
npm install
npm run typecheck
npm test
npm run build
```

Tiêu chí:

- Không có lỗi TypeScript strict.
- Build dừng an toàn nếu biên dịch lỗi và không phá bản `dist/` tốt gần nhất.
- Tất cả test đều đạt; báo cáo phải ghi số lượng thực tế, không sao chép con số từ phiên bản cũ.
- `dist/build-info.json` mang phiên bản `4.0.2`.
- Dữ liệu JSON tải được và mọi liên kết nhân vật, vũ khí, nội tại, tiến hóa, quái, bản đồ đều hợp lệ.

## 2. Luồng trình duyệt bắt buộc

Dùng URL có seed cố định:

```text
http://localhost:4173/?qa=1&seed=1337
```

Kiểm tra theo thứ tự:

1. Màn hình chính hiển thị tiếng Việt, không có lớp loading che vĩnh viễn.
2. Chọn Kael Orin.
3. Chọn Rìa Cõi Thủy Tinh.
4. Bảng nhiệm vụ xuất hiện trước trận, hiển thị đúng hồi truyện, phần dẫn nhập và đủ 3 mục tiêu; bấm `Mở Nhật ký`, sau đó bấm `Đóng Nhật ký` để quay lại bảng nhiệm vụ.
5. Màn hình trang bị đầu trận đưa ra đúng 3 lựa chọn không trùng. Xác nhận đây là mốc vũ khí cấp 1, mỗi gói có một vũ khí phụ và một buff nhỏ ngẫu nhiên; ba buff trong lượt không trùng nhau.
6. Chọn một gói và xác nhận trận bắt đầu với một vũ khí chính theo nhân vật cùng một vũ khí phụ; HUD hiển thị mục tiêu, ô chính và đủ ba ô phụ.
7. Di chuyển đủ 8 hướng với từng Hộ Vệ; nhân vật phải đổi đúng hàng atlas, hoạt ảnh chân không bị trượt, không lộ nền ô caro, khớp chân dung và đúng vũ khí chính. Xác nhận Renderer không vẽ chồng thêm một vũ khí procedural lên sprite V2.
8. Dùng `Space`, `Q`, nạp rồi dùng `E`, nạp rồi dùng `R`; HUD phải phản ánh hồi chiêu/thanh năng lượng. Xác nhận chỉ có ba ô kỹ năng lớn `Q`/`E`/`R`, còn Lướt `Space` là tài nguyên di chuyển riêng và `W` chỉ di chuyển lên. Nhấn `Tab` để mở/đóng bảng chỉ số, kiểm tra đủ nhóm Tấn công, Sinh tồn, Cơ động và tài nguyên.
9. Xác nhận các hộp truyền tin xuất hiện đúng mốc tiến độ nhưng không khóa điều khiển lâu; nội dung và chân dung khớp nhân vật.
10. Lên cấp, chọn nâng cấp, dùng đổi lựa chọn/bỏ qua/loại bỏ rồi tiếp tục trận. Ở cấp 5, 10, 15, 20… chỉ được thấy vũ khí/tăng cường chuyên biệt; ở cấp khác chỉ được thấy tăng cường đa dụng hoặc chỉ số.
11. Hạ Elite/Boss, quan sát telegraph, đạn địch, lời cảnh báo cốt truyện và các giai đoạn Boss.
12. Kết thúc chiến thắng; lời kết màn xuất hiện trước bảng thống kê và các mục Thư Khố vừa mở được liệt kê bằng tên tiếng Việt.
13. Xác nhận nhận 10 điểm ngẫu nhiên và màn hình có đúng 3 lựa chọn vĩnh viễn; chọn một mục rồi tải lại trang để kiểm tra lưu.
14. Trở về menu, mở Thư Khố; mục khóa/mở phải khớp màn đã hoàn thành, nội dung đọc được và không lộ nội dung sớm.
15. Ở nhiệm vụ 20, xác nhận đoạn kết chiến dịch và hậu truyện riêng của nhân vật xuất hiện rồi nút `Xem kết quả trận` chuyển đúng sang bảng tổng kết.
16. Trở về menu, mở Cài đặt và kiểm tra các chế độ tương phản/mù màu.
17. Trong trận, kiểm tra `canvas#game-canvas[data-render-backend="webgl2-compositor"][data-render-status="ready"]`; nếu trình duyệt không hỗ trợ WebGL2, xác nhận fallback Canvas2D vẫn hiển thị đầy đủ.

Chạy ít nhất hai viewport:

- Desktop: `1600 × 900`.
- Mobile dọc: `390 × 844` hoặc kích thước tương đương.

Trên thiết bị chạm, xác nhận cần di chuyển ảo và các nút Lướt/Kỹ năng/Nộ/Tuyệt kỹ xuất hiện, không đè lên HUD và gọi đúng hành động. Nếu bản UI hiện tại chưa dựng các nút này, đánh dấu **KHÔNG ĐẠT** thay vì chỉ kiểm tra API đầu vào.

## 3. Kiểm thử cơ chế 4.0

### Cân bằng và kiến trúc vũ khí

- Sau khi áp dụng chỉ số nhân vật/meta, người chơi nhận hệ số `damage ×1,12` và `attackSpeed ×1,08`.
- Địch được sinh với `baseDamage ×0,82` và `speed ×0,90` trước scaling.
- Gói khởi đầu là lựa chọn vũ khí cấp 1 và không được chọn trùng vũ khí đang có.
- Chọn gói chỉ áp dụng đúng một lần và xóa danh sách đang chờ.
- Mỗi nhân vật có đúng một vũ khí chính. Các vũ khí phụ tự đánh, ăn theo sát thương hiện tại của nhân vật và không vượt quá ba ô.
- Khi đã đủ ba vũ khí phụ, mọi lựa chọn vũ khí mới phải bị loại; các mốc vũ khí chỉ được nâng cấp, tiến hóa hoặc tinh thông vũ khí đang sở hữu.
- Ở cấp 5, 10, 15, 20… danh sách chỉ có vũ khí mới/tăng cường chuyên biệt. Ở các cấp còn lại, danh sách chỉ có tăng cường đa dụng hoặc chỉ số toàn bộ vũ khí.
- Nếu tất cả vũ khí đã đạt cấp/tiến hóa tối đa, tinh thông lặp lại vẫn phải tạo đủ lựa chọn hợp lệ mà không đưa ra vũ khí phụ thứ tư.

### Dấu ấn vũ khí và Bom Khói Độc

- Lưỡi Đao Khe Nứt gây Chảy máu 1,5% HP hiện tại mỗi giây trong 3 giây; Cung Vọng Âm làm chậm 20% trong 1 giây; cấu hình phép gây Choáng 0,3 giây.
- Các hiệu ứng cùng loại trên một mục tiêu làm mới thời gian hoặc giữ phiên bản mạnh hơn, không nhân chồng vô hạn.
- Bom Khói Độc có hồi chiêu cơ bản 5 giây và chọn hướng ném theo cụm địch đông nhất trong vùng gần người chơi, không khóa bừa một mục tiêu lẻ ở xa.
- Đám khói tồn tại từ 3 giây ở cấp 1 đến 5 giây ở cấp 8. Mỗi giây, mỗi mục tiêu trong/đang lưu Độc nhận 3% HP **hiện tại** cộng 90% sát thương hiện tại của nhân vật.
- Khi nhiễm Độc, mục tiêu chậm 20%. Rời vùng không xóa ngay trạng thái; bộ đếm lưu Độc kéo dài đúng 3 giây.
- Kiểm tra riêng quái thường, Elite và Boss: Bom Khói Độc giữ đủ làm chậm 20% và lưu Độc 3 giây trên cả ba nhóm; không được đổi phần trăm HP hiện tại thành HP tối đa. Kháng thời lượng chỉ áp dụng cho các dấu ấn khống chế khác theo cấu hình.
- Pha bay, nảy, nổ, vòng lặp mây và nhịp sát thương sử dụng đúng atlas 4 × 2, ô 444 pixel; có phương án hiển thị dự phòng nếu ảnh chưa tải.

### Chí mạng

- Mọi nhân vật bắt đầu với 10% chí mạng, hệ số 1,8.
- Chí mạng thường bỏ qua 40% Giáp mục tiêu.
- Không có nâng cấp vĩnh viễn nào tăng crit chance/crit damage.
- Trước khi có mảnh siêu hiếm, kỹ năng chủ động/Tuyệt kỹ không thể chí mạng kỹ năng.
- Sau một mảnh: tỉ lệ 10%, hệ số 2,0, bỏ qua 50% Giáp; mỗi mảnh thêm tăng hệ số 0,5.

### Mảnh rơi và May mắn

- Xác suất nền của mảnh chí mạng kỹ năng là `0.00012` (0,012%) cho quái cỡ vừa/lớn và Boss; test xác suất nên dùng RNG giả lập, không chờ rơi thủ công.
- May mắn phải làm tăng cơ hội rơi mảnh chỉ số và vật phẩm phụ.
- Mảnh chỉ số chỉ tồn tại trong trận; mảnh hồi máu hồi ngay nhưng không vượt HP tối đa.
- Số mảnh thường và mảnh chí mạng kỹ năng được ghi riêng trong thống kê trận.

### Va chạm đạn

- Một đạn nhanh đi xuyên đoạn giữa hai khung hình vẫn trúng mục tiêu nằm trên đoạn quét.
- Mục tiêu được xử lý theo thứ tự thời gian va chạm; `pierce` cho phép số lần trúng chính xác.
- Đạn không cần đang khóa mục tiêu mới gây sát thương khi chạm.
- Đạn hết tuổi/tầm vẫn xử lý đoạn di chuyển cuối đúng một lần.
- Đạn địch dùng cùng nguyên tắc quét với người chơi.
- Vùng tồn tại lâu giữ nhịp tick và không gây thêm tick sau khi hết tuổi.

### Hiệu ứng trạng thái

- Lửa tick đều mỗi 0,25 giây, có phần theo HP tối đa, hết hiệu lực sau 4 giây và giảm 30% hồi máu/hút máu trong thời gian cháy.
- Sét làm chậm và tê liệt; thời gian tê liệt ngắn hơn trên Elite/Boss.
- Khi đang choáng/tê liệt, quái không được gây sát thương tiếp xúc và Boss không được bắt đầu lượt tung chiêu mới.
- Mù kéo dài 0,8–3 giây và đặt cooldown 8 giây theo từng mục tiêu. Trong thời gian mù, kiểm tra riêng từng đường gây sát thương: tiếp xúc, quái phát nổ, đạn thường/sniper/mage, loạt đạn Elite, đạn Boss và telegraph Boss; tất cả phải vô hại với người chơi.
- Telegraph đã được tạo trước khi Boss bị mù/choáng/tê liệt cũng không được gây sát thương khi nổ trong lúc chủ sở hữu còn bị khống chế.
- Khổng lồ tăng hình thể, HP và tầm đánh; chặn phẳng được trừ trước giảm sát thương từ Giáp.
- Kháng hiệu ứng của người chơi dùng đường cong lợi ích giảm dần và giảm lực hất lùi/độ giật từ đòn đánh địch.

### Bộ ba kỹ năng `Q`/`E`/`R`

- Cả 8 nhân vật có trường `active`, `rage` và `ultimate` hợp lệ trong dữ liệu.
- `Q` lấy vũ khí chính của nhân vật làm nguồn ra chiêu và có hành vi đặc hiệu, không phải một đòn nổ chung đổi màu.
- `E` chỉ tiêu hao thanh Nộ đầy; `R` chỉ tiêu hao năng lượng Tuyệt kỹ đầy. `W` không được kích hoạt kỹ năng.
- Mọi Nộ kéo dài 5 giây, tăng tốc đánh lên 3 lần và nhân sát thương với 0,9; thưởng riêng là thêm tia/linh thể hoặc miễn hiệu ứng bất lợi.
- Mọi Tuyệt kỹ trong 5 giây đều cộng 10% sát thương cơ bản và mỗi giây hồi 10% lượng Sinh lực đang thiếu, đồng thời giữ vùng sát thương/hiệu ứng riêng theo nhân vật.
- Tên, mô tả, thời lượng, hình ảnh và hành vi phải khớp từng nhân vật, không chỉ đổi nhãn của một hiệu ứng chung.
- Chí mạng kỹ năng và xuyên Giáp được tính đúng cho cả Kỹ năng chủ động lẫn Tuyệt kỹ.

Ma trận hành vi bắt buộc:

| Nhân vật | `Q` cần xác nhận | Thưởng riêng khi Nộ | Tuyệt kỹ cần xác nhận |
|---|---|---|---|
| Kael | Quét Lưỡi Đao và hút lại Sinh lực có giới hạn. | Miễn hiệu ứng bất lợi. | Bão kiếm diện rộng có nhịp chém riêng. |
| Mira | Chín tên hình quạt, xuyên và tự hiệu chỉnh nhẹ. | Thêm một tia mỗi loạt. | Mưa tên vật lý xuyên thấu trên vùng rộng. |
| Toren | Lập tức phát xung làm choáng và nhận miễn sát thương 1,6 giây. | Miễn hiệu ứng bất lợi. | Địa Chấn dùng Lửa và gây choáng. |
| Nyra | Sóng Lửa nối Băng Hoại, làm chậm sâu/tê cứng. | Thêm một tia mỗi phép. | Luân phiên Lửa → Băng → Sét → Độc. |
| Zarek | Đầu độc, giảm hồi máu và hút lại Sinh lực. | Miễn hiệu ứng bất lợi. | Dịch Độc diện rộng, giảm hồi máu 30%. |
| Elara | Sáu linh thể tự tìm mục tiêu và xuyên địch. | Thêm một linh thể mỗi đợt. | Quân Đoàn tấn công mọi hướng. |
| Titan | Nổ Trọng Lực, hất văng và làm choáng quanh người. | Miễn hiệu ứng bất lợi. | Cú nện lớn cùng các dư chấn Vật lý. |
| Nova | Nếp Gấp kéo địch về tâm và gây Mù. | Thêm một tia mỗi tân tinh. | Sụp Đổ làm chậm và kéo mục tiêu. |

### Bản đồ và floating origin

- Không có va chạm tường biên vô hình khi đi xa.
- Khi `|x|` hoặc `|y|` vượt 32.768, người chơi, địch, đạn, vật phẩm, hạt, telegraph, chữ nổi và camera cùng được dịch một offset; khoảng cách tương đối không đổi.
- Sau rebase, ngắm, va chạm, spawn và camera không giật/nhảy.
- EXP/vàng cũ ở xa được tự thu gom sau thời gian quy định; vật phẩm khác được giải phóng để không rò pool.
- Quái mới chỉ sinh trong vành elip theo viewport: bán trục trong tương đương 1/3 kích thước màn hình và bán trục ngoài tương đương 1/2. Kiểm tra ở cả 1600 × 900 và 390 × 844.
- Không quái nào sinh ngay sát nhân vật hoặc quá xa ngoài màn hình. Khi đổi kích thước cửa sổ, vành sinh phải cập nhật mà không tạo cụm bất thường.

### Buff cộng dồn

- Kiểm tra ít nhất 1.000 cấp giả lập cho từng nhóm vô hạn: sát thương, số tia, tốc đánh, hồi phục, HP, Giáp, xuyên giáp, tốc chạy, kháng hiệu ứng, hút máu, kích thước/tầm đánh/chặn.
- Giá trị không thành `NaN`/`Infinity`, cooldown không âm và ngân sách đạn/hạt không bị phá.
- Hút máu, xuyên giáp và kháng hiệu ứng tăng đơn điệu nhưng có lợi ích giảm dần.

### Thưởng vĩnh viễn

- Chỉ chiến thắng mới tạo thưởng.
- Tổng 10 lần phân phối ngẫu nhiên bằng đúng 10 điểm vào 6 nhóm hợp lệ.
- Có đúng 3 lựa chọn khác nhau; nhận một lựa chọn cộng đúng số điểm mô tả và xóa trạng thái chờ.
- Đóng/tải lại trang trước khi chọn không làm mất danh sách đang chờ và không cộng 10 điểm lần thứ hai.

## 4. Rà soát tiếng Việt

Phạm vi: `index.html`, toàn bộ màn hình trong `UIManager.ts`, toast/cảnh báo từ gameplay, ARIA/noscript/loading, cùng tất cả trường hiển thị trong `public/data/*.json`.

Tiêu chí:

- `html lang="vi"`.
- Không còn câu tiếng Anh hiển thị cho người chơi ở menu, HUD, cài đặt, màn chọn, tạm dừng, nâng cấp, kết quả và lỗi khởi động.
- Dấu tiếng Việt hiển thị đúng; không có ký tự lỗi `�`, chuỗi cắt tràn hoặc font thiếu glyph.
- Tên riêng được phép giữ nguyên. ID, tên lớp, biến và file kỹ thuật không thuộc phạm vi bản địa hóa.
- Dùng tìm kiếm tĩnh để lập danh sách nghi vấn, sau đó xác minh từng mục trong trình duyệt vì từ khóa có thể chỉ nằm trong mã kỹ thuật.

Gợi ý rà soát:

```bash
rg -n "Start|Settings|Upgrade|Wave|Level|Damage|Loading|Victory|Defeat|Pause|Resume|Retry|Main Menu|Next Stage" index.html src public/data
rg -n "�" index.html src public/data README.md docs
```

## 5. Kiểm tra hình ảnh và trợ năng

- So sánh bản chạy với `docs/concepts/gameplay-rift-relic-v4.png`: phiến di vật bất đối xứng, nền sạch, cyan chủ đạo, hổ phách có tiết chế, giá một vũ khí chính + ba phụ, đúng ba ấn `Q`/`E`/`R` và khoảng thở quanh nhân vật. Concept chỉ xác lập bố cục ba ấn; nhãn phím của bản chạy 4.0.2 mới là chuẩn nghiệm thu.
- So sánh màn chọn với `docs/concepts/weapon-choice-rift-relic-v4.png`: ba phiến lựa chọn, thông tin cấp/mốc rõ, bộ hiện tại luôn nhìn thấy và không xuất hiện vũ khí thứ tư khi ba ô phụ đã đầy.
- Chụp ảnh desktop cho: menu, chọn nhân vật, chọn bản đồ, chọn trang bị đầu trận, gameplay, lên cấp, Nộ, Tuyệt kỹ, Boss, tóm tắt và thưởng vĩnh viễn.
- Chụp ít nhất một ảnh mobile có joystick và toàn bộ nút hành động.
- Bật lần lượt tương phản cao, deuteranopia, protanopia và tritanopia; nhân vật/quái/Elite/Boss/đạn nguy hiểm vẫn phải phân biệt bằng cả màu lẫn hình/viền.
- Xác nhận telegraph không dùng duy nhất màu đỏ–xanh để truyền đạt nguy hiểm.
- Ở hiệu ứng dày, nhân vật và đạn địch quan trọng không bị che hoàn toàn.
- Bom Khói Độc chỉ dùng xanh độc; Chảy máu dùng nhịp khía đỏ, Làm chậm dùng lam nhạt, Choáng dùng ký hiệu trắng–lam, Lửa dùng cam–đỏ và sát thương phép dùng hình vỡ huyền thuật. Chuyển ảnh sang thang xám vẫn phải phân biệt được bằng hình/nhịp.

### Kiểm tra âm thanh phản hồi

- Chém/Chảy máu, cung/Làm chậm, phép/Choáng, Lửa, Sét và Độc có cao độ, bao âm hoặc nhịp khác nhau; người chơi có thể nhận biết nhóm hiệu ứng mà không cần nhìn chữ sát thương.
- Bom Khói Độc có tín hiệu ném, nổ, nhịp độc và hết trạng thái trên mục tiêu sau thời gian lưu; không phát chồng từng mục tiêu đến mức rè hoặc quá lớn.
- `Q`, kích hoạt/kết thúc Nộ và Tuyệt kỹ có tín hiệu riêng. Bộ giới hạn tiếng đồng thời và ưu tiên phải giữ cảnh báo nguy hiểm nghe rõ khi mật độ cao.
- Tắt tiếng, mức âm lượng và khởi tạo Web Audio sau thao tác người dùng hoạt động đúng; không có âm bật bất ngờ khi tải trang.

Lưu ảnh đã xác nhận vào:

```text
docs/qa-latest/
```

## 6. Hiệu năng và độ ổn định

Chạy mật độ thường và stress trong ít nhất 60 giây mỗi cấu hình. Ghi lại môi trường (trình duyệt, CPU, độ phân giải, DPR), số địch/đạn/hạt tối đa, FPS trung vị/1% thấp và lỗi console.

Tiêu chí tối thiểu:

- Không có uncaught exception, console error hoặc promise rejection.
- Pool không vượt sức chứa đã định và không tăng bộ nhớ liên tục sau khi mật độ ổn định.
- Spatial hash không trả kết quả bị ghi đè khi truy vấn lồng nhau.
- Chế độ giảm hạt tạo khác biệt rõ ràng về số hạt nhưng không xóa telegraph quan trọng.
- Floating-origin rebase không tạo spike kéo dài hoặc nhân đôi thực thể.
- Kiểm tra trên máy yếu phải ưu tiên độ rõ và phản hồi điều khiển; không dùng số FPS của môi trường CI làm cam kết cho mọi thiết bị.

## 7. Mẫu ghi kết quả cuối

Sau khi hoàn tất, thay trạng thái ở bảng đầu và ghi:

```text
Ngày/giờ:
Commit hoặc mã gói:
Trình duyệt:
Viewport / DPR:
Typecheck:
Build:
Tests:
Lỗi console:
FPS stress (trung vị / 1% thấp):
Số địch / đạn / hạt cực đại:
Lỗi còn lại và mức độ:
Người xác nhận:
```

## Kết quả bản dựng 4.1.0 — 2026-09-05

Typecheck và 252/252 test đạt. Chrome tự động kiểm tra 8 nhân vật với Q/E/R, 20 map, 4 boss × 3 pha, mobile giả lập 390 × 844 và Canvas 2D dự phòng; không lỗi tải hoặc JavaScript. Đã chạy vòng lặp game thật, nhấn di chuyển/Q/R Titan và xác minh boss trồi lên rồi di chuyển. Số đo stress là thời gian gửi lệnh vẽ, chưa phải FPS trên điện thoại thật. Xem [báo cáo phát hành 4.1](RELEASE_4_1.md), [ma trận trình duyệt](qa-latest/browser-release-v8.json) và [trận chạy thật](qa-latest/gameplay-live-v8.json).

## 8. Kết quả nghiệm thu bản dựng 4.0.2

```text
Ngày: 2026-09-02 UTC
Mã gói: 4.0.2
Trình duyệt: Chrome qua môi trường kiểm thử tự động
Viewport / DPR: 1363 × 936 / 1
Typecheck: ĐẠT
Build: ĐẠT — dist/build-info.json = 4.0.2
Tests: ĐẠT — 148/148
Lỗi/cảnh báo console của game: 0
FPS stress: CHƯA ĐO TRÊN MÁY ĐÍCH
Mobile 390 × 844: CHƯA XÁC NHẬN THAO TÁC THẬT
```

Ảnh `docs/qa-latest/gameplay-v4-final.jpg` là mốc hình ảnh lịch sử của 4.0.1, xác nhận HUD Di Vật Khe Nứt, một vũ khí chính, một trong ba ô phụ đang dùng, tài nguyên Lướt riêng, vùng sinh quái theo khung nhìn và phản hồi khi dùng kỹ năng lớp. Ánh xạ phím 4.0.2 được xác nhận bằng bản chạy mới và kiểm thử tự động, không dùng nhãn phím trong ảnh cũ làm bằng chứng.

Bản vá 4.0.1 kiểm tra thêm khung hình gameplay Kael ở Chrome: atlas chỉ vẽ một vũ khí, vũ khí nằm ngoài trục thân, vạch ngắm bắt đầu ngoài hitbox và không có lỗi console từ nguồn game. Test hình học khóa vũ khí dài tối đa 48%, vũ khí khối tối đa 37% chiều cao thân, đủ tám hướng đối xứng và bảo toàn pose qua attack/cast/dash/hurt.

Bản vá 4.0.2 được kiểm tra lại trên Chrome ở `1363 × 936`, DPR 1: luồng menu → chọn Hộ Vệ → chọn bản đồ → briefing → chọn Di Vật → gameplay hoàn tất; HUD và hồ sơ nhân vật cùng hiển thị `Q` — Kỹ năng lớp, `E` — Nộ, `R` — Tuyệt kỹ. Thuộc tính `aria-keyshortcuts` lần lượt là `Q`, `E`, `R`; nhấn `E` khi thanh chưa đầy hiển thị đúng phản hồi `Nộ …%`. Không có lỗi/cảnh báo console từ nguồn `terminal.local`; các lỗi metadata của tiện ích trình duyệt nằm ngoài nguồn game. Test tự động khóa thêm `W` chỉ di chuyển, cạnh nhấn không lặp khi giữ phím, nút chạm đúng ánh xạ và tay cầm vẫn giữ X/B/Y.
