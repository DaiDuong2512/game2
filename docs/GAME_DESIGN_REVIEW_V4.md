# Đánh giá thiết kế và đặc tả nâng cấp — bản 4.0

Tài liệu này đánh giá hướng phát triển từ bản 3.0 sang 4.0 dưới góc nhìn phát hành một game sinh tồn tự động chiến đấu độc lập. Điểm số dùng để ưu tiên sản xuất, không thay thế dữ liệu thử nghiệm người chơi. Trạng thái hình ảnh và thao tác trình duyệt chỉ được công nhận sau khi hoàn tất checklist trong `docs/QA.md`.

## Kết luận thiết kế

Riftwarden có nền tảng nội dung mạnh: tám Hộ Vệ, 20 nhiệm vụ thuộc ba hồi truyện, hệ Thư Khố, tiến trình vĩnh viễn, bản đồ gần như không giới hạn và nhiều cơ chế cộng dồn. Khoảng trống lớn nhất của bản 3.0 là bản sắc trình bày và trật tự lựa chọn. HUD cyan–amber dễ đọc nhưng còn gần ngôn ngữ khoa học viễn tưởng phổ thông; vũ khí chưa thể hiện rõ quan hệ chính–phụ; Nộ/Tuyệt kỹ có cá tính nhưng chưa tuân một khung điều khiển thống nhất; hiệu ứng và âm thanh chưa luôn cho người chơi biết ngay loại sát thương nào vừa xảy ra.

Bản 4.0 giải quyết các điểm này bằng bốn trụ cột: giao diện **Di Vật Khe Nứt**, một vũ khí chính + tối đa ba phụ, đúng ba kỹ năng `Q`/`E`/`R`, và ngôn ngữ hình–âm riêng cho từng nhóm hiệu ứng. Cốt truyện ba hồi không bị thay thế; nó được đưa vào cùng hệ khung di vật để menu, bảng nhiệm vụ, truyền tin và chiến đấu nói chung một ngôn ngữ.

## Đánh giá và ưu tiên

| Hạng mục | Bản 3.0 | Mục tiêu 4.0 | Nhận định |
|---|---:|---:|---|
| Giao diện và khả năng đọc | 8,5 | 9,0 | Giữ độ rõ nhưng bỏ cảm giác các bảng neon rời rạc; xây hệ phiến di vật thống nhất cho HUD và lựa chọn. |
| Lối chơi cốt lõi | 8,4 | 8,9 | Giới hạn ba vũ khí phụ giúp mỗi bộ trang bị có chủ đích và giảm bùng nổ thực thể. |
| Nhân vật và chuyển động | 8,4 | 8,8 | Hình người tám hướng đã là nền tốt; cần tiếp tục tạo nhịp chân–tay, xoay thân, dư ảnh và phản hồi trúng đòn riêng. |
| Chiêu thức, hiệu ứng và âm thanh | 8,5 | 9,0 | Ba ô kỹ năng thống nhất, nhưng hình ảnh và âm thanh phải cho biết Vật lý, Phép, Đốt, Độc hay Khống chế trước khi đọc chữ. |
| Buff và độ sâu bộ trang bị | 8,4 | 9,0 | Mốc cấp tách chuyên biệt/đa dụng, danh sách tự thích ứng và tinh thông lặp lại làm quyết định dễ hiểu hơn mà vẫn cộng dồn dài hạn. |
| Cốt truyện và thế giới | 8,3 | 8,6 | Giữ nguyên ba hồi/20 màn/Thư Khố; tăng tính nhất quán bằng khung truyền tin Di Vật Khe Nứt và âm hiệu nhân vật. |
| Tiếp cận và hiệu năng | 8,2 | 8,7 | Vùng sinh quái theo viewport, giới hạn vũ khí phụ và ngân sách VFX/âm thanh cải thiện khả năng đọc lẫn tải máy. |

Các điểm 4.0 là **mục tiêu thiết kế**, không phải điểm review người chơi. Luồng khói desktop đã có ảnh chụp và nhật ký game sạch; benchmark hiệu năng, mobile thật và playtest dài vẫn là điều kiện trước khi coi các điểm mục tiêu là kết quả phát hành thương mại.

## 1. Bản sắc giao diện Di Vật Khe Nứt

### Ngôn ngữ hình ảnh

- Nền chính `#050b12`, bề mặt `#0a1822`, kim loại `#263642`/`#5f7180`, năng lượng cyan `#2fe6f3`, phần thưởng hổ phách `#f5b842`, chữ `#eaf7f5` và nguy hiểm `#ff6248`.
- Xanh độc `#7de52a` chỉ dành cho Độc. Không dùng tím làm màu giao diện mặc định để tránh trở lại thẩm mỹ neon chung chung.
- Phiến chức năng có góc gãy, đường nứt một pixel và quét năng lượng ngắn 140–220 ms. Khi bật giảm chuyển động, hiệu ứng quét phải dừng nhưng trạng thái sẵn sàng vẫn rõ.
- Tiêu đề dùng chữ đậm hẹp, viết hoa có tiết chế; số liệu chiến đấu dùng chữ số đồng độ rộng để HP, thời gian và sát thương không rung bố cục.

### Trật tự HUD

- Trên trái: chân dung, Sinh lực, EXP và cấp.
- Trên giữa: mục tiêu hiện tại, đợt và thời gian.
- Trên phải: tạm dừng; cảnh báo nguy hiểm vẫn nằm trên chiến trường.
- Dưới trái: truyền tin ngắn, một ô vũ khí chính và ba ô phụ.
- Dưới phải: đúng ba ấn lớn `Q`, `E`, `R`; Lướt `Space` chỉ là đồng hồ di chuyển nhỏ.

Hai chuẩn hình ảnh là `docs/concepts/gameplay-rift-relic-v4.png` và `docs/concepts/weapon-choice-rift-relic-v4.png`. Đây là concept, không phải bằng chứng bản chạy.

## 2. Kiến trúc vũ khí và lựa chọn

### Bộ trang bị

- Vũ khí chính do nhân vật quyết định, dùng cho đánh thường và kỹ năng `Q`.
- Tối đa ba vũ khí phụ tự động tấn công. Sát thương của chúng lấy chỉ số hiện tại của nhân vật làm nền, sau đó áp dụng hệ số, nhịp, đường bay, vùng ảnh hưởng và dấu ấn riêng.
- Có 14 vũ khí trong dữ liệu. Khi ba ô phụ đã đầy, trọng số vũ khí mới bằng không; không có đường vòng từ đổi lựa chọn, loại bỏ hay mốc cấp để nhận món thứ tư.

### Lịch nâng cấp

| Cấp người chơi | Nhóm lựa chọn hợp lệ |
|---|---|
| 1 | Một trong ba gói vũ khí phụ khởi đầu; đây là mốc vũ khí đầu tiên. |
| 5, 10, 15, 20… | Vũ khí phụ mới nếu còn ô; nếu không thì cấp vũ khí, tăng cường chuyên biệt, tiến hóa hoặc tinh thông vũ khí đang có. |
| Các cấp còn lại | Tăng cường đa dụng cho toàn bộ vũ khí hoặc chỉ số người chơi. |

Khi một món đạt giới hạn cấp/tiến hóa, tinh thông lặp lại tiếp tục tăng sức mạnh để danh sách mốc vũ khí không rỗng. Bộ sinh lựa chọn phải ưu tiên lựa chọn hữu ích cho bộ hiện tại nhưng vẫn tôn trọng seed để trận có thể tái hiện.

### Dấu ấn nhận diện

| Nhóm | Cơ chế | Cách hiển thị |
|---|---|---|
| Kiếm | Chảy máu 1,5% HP hiện tại/giây trong 3 giây. | Vệt chém ngà, khía đỏ thẫm và chữ sát thương Vật lý. |
| Tên | Làm chậm 20% trong 1 giây. | Đường tên thanh, dấu chân lam nhạt và nhịp giảm tốc ngắn. |
| Phép | Choáng 0,3 giây khi cấu hình dấu ấn kích hoạt. | Ký hiệu vỡ trắng–lam, ngắt tư thế và âm hiệu khô. |
| Lửa | Sát thương chuẩn theo nhịp riêng và giảm hồi phục khi đang cháy. | Cam–đỏ, tàn lửa đi lên, chữ tick không lẫn với đòn trực tiếp. |
| Độc | Sát thương theo thời gian, làm chậm và lưu trạng thái. | Xanh độc, mây hạt thấp, biểu tượng giọt và âm nhịp nặng. |

Hiệu ứng cùng loại làm mới thời gian hoặc giữ phiên bản mạnh hơn; không nhân chồng vô hạn trên một mục tiêu. Cơ chế này tránh sát thương phần trăm phá cân bằng khi tốc đánh tăng rất cao.

## 3. Bom Khói Độc

- Hồi chiêu cơ bản: **5 giây**.
- Nhắm: chọn hướng đến cụm có số kẻ địch cao nhất trong vùng gần nhân vật, rồi ném vào một vị trí gần người chơi.
- Thời gian vùng: **3 giây ở cấp 1**, tăng dần đến **5 giây ở cấp 8**.
- Mỗi giây: **3% HP hiện tại của mục tiêu + 90% sát thương hiện tại của nhân vật**.
- Khống chế: giảm **20% tốc độ di chuyển** trong lúc nhiễm Độc.
- Lưu Độc: rời vùng vẫn còn Độc **3 giây**; tái tiếp xúc chỉ làm mới/giữ hiệu lực mạnh hơn.

Atlas `public/assets/generated/effects/toxic-smoke-vfx-v4.png` có lưới 4 × 2, mỗi ô 444 pixel: hàng trên dành cho bay–nảy–nổ, hàng dưới dành cho mây lặp và nhịp sát thương. Biểu tượng dùng `public/assets/generated/weapons/toxic-smoke-bomb.png`.

## 4. Ba kỹ năng chủ động theo nhân vật

Khung điều khiển chung:

- `Q`: kỹ năng lớp gắn với vũ khí chính.
- `E`: Nộ 5 giây, tốc đánh ×3, sát thương ×0,9; thêm tia/linh thể hoặc miễn hiệu ứng bất lợi tùy nhân vật.
- `R`: Tuyệt kỹ diện rộng; trong 5 giây tăng 10% sát thương cơ bản và mỗi giây hồi 10% Sinh lực đang thiếu, kèm vùng/hiệu ứng riêng.
- `Space`: Lướt, là hành động di chuyển và không tính là kỹ năng thứ tư.

| Hộ Vệ | `Q` | Thưởng Nộ `E` | Bản sắc Tuyệt kỹ `R` |
|---|---|---|---|
| Kael Orin | Ấn Kiếm Hồi Sinh: quét kiếm, hút lại Sinh lực. | Miễn hiệu ứng bất lợi. | Bão Khe Nứt: bão kiếm diện rộng. |
| Mira Voss | Loạn Tiễn Cuồng Phong: chín tên hình quạt. | Thêm một tia. | Mưa Tên Thiên Không: mưa tên xuyên thấu. |
| Toren Vale | Thánh Thuẫn Bất Hoại: lập tức phát xung làm choáng và cho miễn sát thương ngắn. | Miễn hiệu ứng bất lợi. | Địa Chấn Lò Rèn: chấn động Lửa. |
| Nyra Sol | Băng Hoại Tứ Nguyên: sóng Lửa nối Băng Hoại. | Thêm một tia phép. | Bão Tố Nguyên Tố: Lửa, Băng, Sét và Độc. |
| Zarek Venn | Trích Huyết Độc: Độc, giảm hồi máu và hút Sinh lực. | Miễn hiệu ứng bất lợi. | Đêm Dịch Bệnh: dịch Độc diện rộng. |
| Elara Quill | Bầy Vọng Âm: sáu linh thể tự tìm mục tiêu. | Thêm một linh thể. | Quân Đoàn Vọng Âm: tấn công mọi hướng. |
| Titan Rho | Trọng Chấn Phá Thành: nổ Trọng Lực, hất và choáng. | Miễn hiệu ứng bất lợi. | Titan Giáng Thế: va chạm và dư chấn. |
| Nova Lys | Nếp Gấp Hư Không: kéo và gây Mù. | Thêm một tia tân tinh. | Sụp Đổ Hư Không: co sập, làm chậm và kéo. |

## 5. Chuyển động, hiệu ứng và âm thanh

- Hình người toàn thân tám hướng, gia tốc/phanh/đảo hướng, đường cong Lướt, dư ảnh, bụi chân và camera nhìn trước đã được giữ. Vũ khí chính nay bám tư thế nhân vật; đánh thường có các pha lấy đà–phóng–thu hồi riêng theo kiếm/cung/súng/bom/phép, còn `Q`/`E`/`R` gọi pose thi triển riêng. Ưu tiên tiếp theo là kiểm tra từng khung trên cả tám Hộ Vệ và thay dần asset procedural bằng sprite vẽ tay.
- Mọi đạn vẫn gây sát thương khi thật sự chạm kẻ địch, không phụ thuộc mục tiêu khóa. Hiệu ứng trúng phải bám đúng điểm va chạm quét.
- Điện dùng nhánh cyan; Băng dùng lam nhạt và mảnh sắc; Lửa dùng cam–đỏ/tàn bay; Độc dùng mây xanh thấp; Vật lý dùng vệt ngà/khía đỏ; Phép–Choáng dùng ký hiệu vỡ trắng–lam.
- Ngân hàng âm thanh đã có tín hiệu riêng cho chém/Chảy máu, tên/Làm chậm, phép/Choáng, Đốt, Sét, ném–nổ–tick Độc và `Q`; Nộ/Tuyệt kỹ dùng tín hiệu vòng đời chung cùng accent nguyên tố khi có. Giới hạn tiếng đồng thời ưu tiên cảnh báo Boss và kỹ năng người chơi hơn tick nhỏ. Kiểm thử nghe trên loa/tai nghe thật vẫn còn bắt buộc.

## 6. Bản đồ và vùng sinh quái

Không gian thế giới tiếp tục gần như không giới hạn nhờ nền theo tọa độ và floating origin. Tuy nhiên, chiến đấu phải bám quanh người chơi. Với độ lệch spawn `(dx, dy)` và viewport `W × H`, dùng bán kính elip chuẩn hóa:

```text
rho = sqrt((dx / (W / 2))² + (dy / (H / 2))²)
2/3 <= rho <= 1
```

Khoảng này tương đương vành từ khoảng 1/3 đến 1/2 chiều rộng/chiều cao màn hình. Nó tránh quái xuất hiện sát nhân vật và cũng không để chúng quá xa ngoài khung nhìn. Vành sinh phải cập nhật khi đổi kích thước cửa sổ và được kiểm thử riêng trên desktop lẫn mobile.

## 7. Cốt truyện và tiếng Việt

Ba hồi truyện được bảo toàn: **Mỏ Neo Rạn Vỡ** (màn 1–7), **Bão Hư Không** (màn 8–14) và **Trái Tim Hỗn Mang** (màn 15–20). Mỗi màn vẫn có phần dẫn nhập, ba mục tiêu, truyền tin giữa trận, cảnh báo giao tranh cuối, lời kết và mục Thư Khố mở khóa. Tám Hộ Vệ tiếp tục giữ động cơ, xung đột, quan hệ và hậu truyện riêng.

Mọi nội dung người chơi nhìn thấy hoặc được công nghệ hỗ trợ đọc phải là tiếng Việt: menu, HUD, bảng nhiệm vụ, lựa chọn, mô tả vũ khí/kỹ năng, trạng thái, cảnh báo, kết quả, cài đặt và nhãn ARIA. Tên riêng được giữ nguyên; ID/tên tệp/API tiếng Anh chỉ tồn tại ở lớp kỹ thuật.

## 8. Tiêu chí nghiệm thu bắt buộc

1. Không thể sở hữu quá một vũ khí chính và ba vũ khí phụ trong bất kỳ luồng lựa chọn nào.
2. Cấp 1 và các cấp chia hết cho 5 tuân đúng nhóm vũ khí; mọi cấp khác chỉ có lựa chọn đa dụng/chỉ số.
3. Bom Khói Độc đạt đúng nhắm cụm, hồi chiêu, thời gian vùng, công thức sát thương, làm chậm và lưu Độc.
4. HUD chỉ có ba kỹ năng lớn `Q`/`E`/`R`; `Space` không bị trình bày như kỹ năng thứ tư.
5. Cả tám Nộ và Tuyệt kỹ tuân phần chung, có pose/VFX/hành vi riêng; âm thanh dùng vòng đời chung và accent nguyên tố theo cấu hình.
6. Spawn nằm trong vành elip viewport ở desktop/mobile; không sinh sát người chơi hoặc quá xa khỏi màn hình.
7. TypeScript strict, build, toàn bộ test dữ liệu/cơ chế, ảnh PNG và gói phát hành đều đạt.
8. Luồng trình duyệt 1600 × 900 và 390 × 844 có ảnh chụp, không lỗi console, không tràn chữ và không còn nội dung người chơi bằng tiếng Anh.

## Nợ thiết kế sau 4.0

1. Bảy Hộ Vệ dùng hình người tạo sinh vẫn nên được thay dần bằng sprite sheet vẽ tay nếu phát hành thương mại; hệ tám hướng hiện là khung kỹ thuật tốt để thay asset.
2. Âm thanh Web Audio phù hợp bản ngoại tuyến nhẹ, nhưng cần bộ SFX/nhạc được hòa âm và kiểm thử loa nhỏ/tai nghe trước khi bán thương mại.
3. Cần đo FPS trung vị/1% thấp, thời gian khung hình và mức sử dụng bộ nhớ trên phần cứng phổ thông; kiểm thử cấu trúc không thay benchmark thật.
4. Cần thử nghiệm người chơi để cân lại xác suất vũ khí mới so với tăng cường chuyên biệt, nhất là khi bộ trang bị đạt ba phụ sớm.
