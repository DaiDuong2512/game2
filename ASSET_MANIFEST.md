# Danh mục tài sản — Riftwarden: Echo Siege 4.0

Toàn bộ hình ảnh trong dự án là tài sản gốc hoặc biến thể được tạo riêng cho **Riftwarden: Echo Siege**. Game không yêu cầu gói asset trả phí hay tài sản của trò chơi thương mại khác.

## Định hướng mỹ thuật bản 4.0 — Di Vật Khe Nứt

- `docs/concepts/gameplay-rift-relic-v4.png` — concept chiến đấu 16:9 của giao diện **Di Vật Khe Nứt**: phiến đá đen/kim loại xám bất đối xứng, đường năng lượng cyan, điểm nhấn hổ phách, giá vũ khí chính + ba phụ và đúng ba ấn kỹ năng `Q`/`R`/`E`.
- `docs/concepts/weapon-choice-rift-relic-v4.png` — concept màn chọn 1 trong 3 phiến di vật, có Bom Khói Độc và dải hiển thị bộ vũ khí hiện tại.
- `docs/concepts/story-briefing-v3.png` — concept bảng nhiệm vụ/cốt truyện vẫn được giữ làm chuẩn cho ba hồi, mục tiêu, truyền tin nhân vật, phần thưởng và lối vào Thư Khố.

Concept là tài liệu tham chiếu thiết kế, không phải ảnh chụp gameplay. Khi QA thủ công trên máy đích, ảnh triển khai đã xác nhận cần được lưu riêng trong `docs/qa-latest/`.

## Sprite gameplay và atlas hiệu ứng mới

### Tám Hộ Vệ — di chuyển 8 hướng bản V2

Thư mục `public/assets/generated/characters/`:

- `kael-orin-gameplay-v2.png`
- `mira-voss-gameplay-v2.png`
- `toren-vale-gameplay-v2.png`
- `nyra-sol-gameplay-v2.png`
- `zarek-gameplay-v2.png`
- `elara-gameplay-v2.png`
- `titan-gameplay-v2.png`
- `nova-gameplay-v2.png`

Mỗi Hộ Vệ có một PNG RGBA trong suốt riêng, kích thước `512 × 1024`, lưới `4 cột × 8 hàng`, mỗi ô `128 × 128` pixel. Sprite được dựng từ chân dung thật của chính nhân vật và đã bake đúng vũ khí chính; Renderer không vẽ chồng thêm vũ khí. Bốn cột là chu kỳ di chuyển, tám hàng là tám hướng nhìn. Atlas Kael đã được đóng gói lại với vùng an toàn tối thiểu ở cả đầu, chân và hai cạnh để không lem sang ô lân cận.

### Atlas VFX pixel

`public/assets/generated/effects/pixel-vfx-atlas.png`

- PNG RGBA trong suốt, kích thước `1374 × 1145`.
- Lưới `6 cột × 5 hàng`, mỗi ô `229 × 229` pixel.
- Các hàng: sét, lửa, băng, mù/huyền thuật, khiên–Nộ.
- Các khung được Renderer phát theo thời gian cho đạn, vùng hiệu lực, trạng thái, Nộ và Tuyệt kỹ.

### Atlas Độc và va chạm Vật lý — bản 3.0

`public/assets/generated/effects/status-impact-vfx-v3.png`

- PNG RGBA trong suốt, kích thước `2172 × 724`.
- Lưới `6 cột × 2 hàng`, mỗi ô `362 × 362` pixel.
- Hàng trên là nhịp Độc; hàng dưới là va chạm Vật lý/động năng.
- Renderer cắt viền an toàn 5 pixel để tránh lem ô và phát atlas qua object pool.

### Atlas Bom Khói Độc — bản 4.0

`public/assets/generated/effects/toxic-smoke-vfx-v4.png`

- PNG RGBA trong suốt, kích thước `1776 × 888`.
- Lưới `4 cột × 2 hàng`, mỗi ô `444 × 444` pixel.
- Hàng trên biểu diễn bom đang bay, nảy và phát nổ; hàng dưới là vòng lặp mây độc, trong đó có khung nhịp sát thương.
- Màu xanh độc chỉ dùng cho cơ chế Độc; alpha thật giúp vùng khói không che mất nhân vật, quái và vùng báo nguy.

Biểu tượng đi kèm: `public/assets/generated/weapons/toxic-smoke-bomb-v2.png`, PNG RGBA `256 × 256`, được dùng ở phiến lựa chọn và giá vũ khí.

### Atlas đạn đạo — bản V2

`public/assets/generated/effects/projectile-atlas-v2.png`

- PNG RGBA trong suốt, kích thước `1024 × 1024`.
- Lưới `4 cột × 4 hàng`, chứa đạn/nhát chém nhận diện riêng cho toàn bộ 14 vũ khí.
- Renderer dùng atlas làm hình đạn chính, giữ hiệu ứng nguyên tố và đường bay làm lớp bổ trợ.

## Bảng nguồn hình ảnh

- `public/assets/generated/genimage2-feature-poster.png` — poster tính năng `1536 × 1024`, kết hợp key art mới, ảnh gameplay WebGL2 thật, 14 biểu tượng vũ khí và 4 boss; toàn bộ chữ được dựng chính xác bằng mã.

## Ảnh tổng hợp của dự án

- `public/assets/generated/key-art.png` — key art `1200 × 560` thống nhất bốn Hộ Vệ Kael, Mira, Nyra và Zarek quanh khe nứt cyan; nhân vật và vũ khí không bị cắt.
- `public/assets/generated/app-icon-v2.png` — biểu tượng ứng dụng `512 × 512`, khe nứt cyan với kiếm và cung, được dùng làm favicon.
- `public/assets/generated/logo-heroes.png` — lockup thương hiệu `1100 × 470`, dùng key art mới và tên `RIFTWARDEN · ECHO SIEGE` được dựng bằng chữ thật.
- `public/assets/generated/asset-catalog.png` — catalog `1536 × 1024` từ asset runtime thật: 8 Hộ Vệ, 14 vũ khí và 24 mối đe dọa.

## Chân dung nhân vật

Thư mục `public/assets/generated/characters/`:

- `kael-orin.png`
- `mira-voss.png`
- `toren-vale.png`
- `nyra-sol.png`
- `zarek.png`
- `elara.png`
- `titan.png`
- `nova.png`

Tám ảnh trên là chân dung dùng trong giao diện chọn Hộ Vệ. Mỗi chân dung có sprite gameplay V2 tương ứng được liệt kê ở trên. Renderer procedural chỉ còn là fallback khi ảnh không tải được.

## Biểu tượng vũ khí và kỹ năng

Thư mục `public/assets/generated/weapons/`:

- `rift-blade-v2.png`
- `echo-bow-v2.png`
- `pulse-rifle-v2.png`
- `phase-darts-v2.png`
- `gravity-bomb-v2.png`
- `storm-call-v2.png`
- `ember-orb-v2.png`
- `frost-shards-v2.png`
- `void-laser-v2.png`
- `venom-bloom-v2.png`
- `aegis-orbit-v2.png`
- `echo-summon-v2.png`
- `arcane-nova-v2.png`
- `toxic-smoke-bomb-v2.png`

Tổng cộng có **14 biểu tượng vũ khí**. HUD dành một vị trí cho vũ khí chính và tối đa ba vị trí cho vũ khí phụ; Bom Khói Độc là vũ khí phụ thứ mười bốn trong danh mục dữ liệu.

## Sprite kẻ địch

Thư mục `public/assets/generated/enemies/`:

- `slime.png`, `goblin.png`, `orc.png`, `skeleton.png`
- `wolf.png`, `bat.png`, `shooter.png`, `mage.png`
- `tank.png`, `charger.png`, `flyer.png`, `healer.png`
- `summoner.png`, `bomber.png`, `assassin.png`, `warden.png`

Nhiều cấu hình địch có thể dùng chung một sprite nhưng khác chỉ số, kích thước, nguyên tố, hiệu ứng và AI. Đây là biến thể dữ liệu có chủ đích, không phải tham chiếu asset bị thiếu.

## Sprite Boss

Atlas production mới trong `public/assets/generated/bosses-v2/`:

- `boss-character-atlas-v2.png` — PNG RGBA trong suốt, lưới `4 × 1`: Kẻ Nuốt Hư Không, Cự Thú Sắt Thép, Nữ Hoàng Băng Giá và Chúa Tể Hỏa Ngục. Mỗi Boss là hình toàn thân, không còn đường viền xanh hoặc phần thân bị cắt từ bộ ảnh cũ.
- `boss-ability-atlas-v1.png` — PNG RGBA trong suốt, lưới `4 × 2`; hàng trên là hình niệm chiêu riêng, hàng dưới là hình va chạm riêng cho đúng bốn Boss theo cùng thứ tự.

Boss bản đồ 1 có bộ ảnh riêng trong `public/assets/generated/bosses-v3/`:

- `void-devourer-v3.png` — sprite toàn thân của Kẻ Nuốt Hư Không.
- `void-devourer-ability-v2.png` — ảnh niệm chiêu/cổng hư không riêng, không dùng hình vẽ thuật toán.

Thư mục `public/assets/generated/bosses/` được giữ làm fallback tương thích:

- `void-devourer.png`
- `iron-behemoth.png`
- `frost-queen.png`
- `lord-infernus.png`

## Ảnh thu nhỏ bản đồ

Thư mục `public/assets/generated/stages/` có một ảnh cho mỗi ID trong 20 bản đồ:

1. Rìa Cõi Thủy Tinh — `glassward-verge.png`
2. Hang Động Vọng Âm — `echo-caverns.png`
3. Phế Tích Tro Tàn — `ashen-ruins.png`
4. Thánh Điện Đầm Độc — `mire-sanctum.png`
5. Cồn Cát Vỡ Nát — `sundered-dunes.png`
6. Tháp Băng Giá — `frostspire.png`
7. Vườn Mộ Nở Hoa — `grave-bloom.png`
8. Thành Trì Sắt — `iron-citadel.png`
9. Lõi Than Hồng — `ember-core.png`
10. Địa Tầng Sâu — `deep-strata.png`
11. Vòm Pha Lê — `crystal-arc.png`
12. Phòng Thí Nghiệm Xanh — `verdant-lab.png`
13. Pháo Đài Cơ Giới — `clockwork-bastion.png`
14. Thành Trì Hắc Ám — `dark-citadel.png`
15. Thiên Điện — `sky-temple.png`
16. Cổng Hỗn Mang — `chaos-gate.png`
17. Cuộc Hành Quân Hư Không — `void-march.png`
18. Cõi Cuối — `final-realm.png`
19. Trái Tim Khe Nứt — `rift-heart.png`
20. Cuộc Vây Hãm Vĩnh Hằng — `eternal-siege.png`

## Địa hình chiến đấu

Thư mục `public/assets/generated/terrain-v1/`:

- `terrain-props-atlas-v1.png` — PNG RGBA `4 × 3`, gồm bốn biến thể cây, bốn biến thể đá và bốn biến thể hồ cho từng nhóm sinh cảnh.
- `terrain-grass-atlas-v1.png` — PNG RGBA `4 × 2`, gồm tám cụm cỏ/cây bụi thấp để phủ các khoảng đất trống mà không tạo ô màu.

Mỗi trong 20 bản đồ dùng ảnh sân khấu riêng làm mặt đất, bố cục địa hình xác định theo seed bản đồ. Cây và đá cản di chuyển, đẩy nhân vật trượt vòng, đồng thời chặn đạn người chơi lẫn đạn địch/Boss. Hồ không chặn đạn nhưng làm tốc độ lội nước còn 58%.

## Lớp bổ trợ khi chạy

Canvas renderer vẫn dựng trực tiếp các lớp bổ trợ sau, không cần file ảnh riêng:

- đường bay, laser, sét chuỗi và vùng sát thương; hình đạn chính dùng atlas V2
- chớp khi trúng đòn và chữ sát thương
- vòng/biểu tượng trạng thái
- lớp hiển thị riêng cho Chảy máu, Làm chậm, Choáng, Thiêu đốt, Độc và nhịp sát thương phép
- vụ nổ và hạt pixel
- lớp đếm ngược trợ năng của Boss; hình niệm chiêu và va chạm chính dùng atlas Boss V1
- cảnh báo HP thấp ở mép màn hình
- rung camera
- viền/marker giúp phân biệt quái thường, Elite và Boss

Nền màu hữu cơ và tối đa 48 vòng ground-VFX được batch trong một WebGL2 draw call khi GPU khả dụng. Ảnh mặt đất, cây, đá, hồ, cỏ, nhân vật, đạn và VFX dùng lớp Canvas2D trong suốt ở độ phân giải CSS để trình duyệt ghép lớp bằng GPU; không còn lưới ô vuông. Hệ thống vẫn có fallback Canvas2D đầy đủ khi WebGL2 không khả dụng hoặc mất context.

## Âm thanh

Không cần tệp âm thanh bên ngoài. `src/core/AudioManager.ts` tổng hợp hiệu ứng và âm nền bằng Web Audio, với tín hiệu riêng cho chém/Chảy máu, cung/Làm chậm, phép/Choáng, Lửa, Sét, ném–nổ–nhịp Độc, kỹ năng lớp, Nộ và Tuyệt kỹ. Có thể chuyển sang `.wav`/`.mp3` sau này mà không cần sửa hệ gameplay.

## Nguyên tắc xử lý

- Tài sản pixel dùng `imageSmoothingEnabled = false` trong Canvas.
- Sprite/atlas gameplay giữ kênh alpha thật; không được chứa nền ô caro giả trong pixel ảnh.
- UI và telegraph không dựa vào một màu duy nhất để truyền đạt trạng thái quan trọng.
- Khi thay asset, giữ nguyên đường dẫn hoặc cập nhật cả dữ liệu/đoạn preload liên quan.
