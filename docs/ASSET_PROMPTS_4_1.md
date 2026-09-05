# Tài sản mới 4.1.0

Ngày: 2026-09-05. Chế độ: công cụ image_gen tích hợp; không dùng CLI/API dự phòng. Các ảnh cuối đã được lưu trong dự án và dùng trực tiếp trong renderer. Kích thước đầu ra thực tế có thể khác kích thước đề nghị; renderer chia theo tỉ lệ lưới.

| Tệp nguồn trong public/assets/generated/combat-v8/ | Kích thước thực tế | Lưới / vai trò |
|---|---|---|
| boss-motion.png | 1536 × 1024, RGBA | 6 × 4; 6 tư thế cho mỗi boss |
| boss-impact.png | 1536 × 1024, RGBA | 6 × 4; 6 khung cho mỗi hệ chiêu |
| titan-actions.png | 1774 × 887, RGBA | 6 × 3; Q, R, dư chấn |
| ground-tiles.png | 1254 × 1254, RGB | 2 × 2; rêu, tro, băng, hư không |

Bản dist sử dụng WebP ở assets/generated/combat-v8/. Titan giảm còn 1152 × 576 trước khi mã hóa lossless; hai atlas boss giữ nguyên độ phân giải. Ba atlas chuyển động có alpha thật và các ô khác nhau đã được kiểm thử. Không dùng các phương án boss có nền caro bị vẽ vào ảnh.

## Prompt cuối: boss-motion.png

Create a TRANSPARENT BACKGROUND cutout PNG game sprite sheet of 4 animated fantasy bosses. 6 columns x 4 rows, 1536x1024 total, each cell 256x256. No checkerboard, no white background, no pattern behind subjects. The empty pixels must have alpha zero. Pixel art. Full body centered consistently with 12% safe margins. Row 1 purple void tentacle demon with violet glowing core. Row 2 blue steel furnace golem with orange joints. Row 3 ice queen wearing blue crystal crown and blue icy gown. Row 4 red horned winged armored fire demon. Across six columns: idle, step left, step right, crouch windup, arms extend attacking, recover. Changing arms legs tentacles wings between poses. Fixed down-right three-quarter view; feet aligned at 84% cell height. Exactly 24 isolated sprites, consistent scale, no text no border. Transparent background.

## Prompt: boss-impact.png

Use case: stylized-concept. Game asset: ONE 1536x1024 RGBA transparent sprite sheet, exactly SIX equal columns and FOUR equal rows, each cell 256x256 with 12% transparent padding. Each row depicts six consecutive animation frames of a boss ability expanding and dissipating: Row1 purple void singularity opening, swirling tentacles, eruption, expanding vortex, smoky collapse, fading sparks. Row2 heavy amber ground slam, rocks split outward, stone explosion, circular dust shockwave, settling rock debris, fading cracked floor. Row3 cold cyan ice eruption: small ice seed, growing shards, tall crystalline spikes, ring of flying ice, falling shards, frost residue. Row4 orange/red meteor impact: tiny falling fireball with vertical tail, larger descending meteor, ground contact explosion, blooming flames, hot smoke, glowing cinders. One individual effect per cell fixed center, aligned consistent scale, no characters. Detailed pixel RPG art, topdown three-quarter ground plane, rich volume and clean pixel shapes. No text no grid no labels NO checkerboard background; output actual alpha transparency for compositing.

## Prompt: titan-actions.png

Use case: stylized-concept. A production transparent RGBA animation sprite sheet for Titan Rho, the short heavy steel blue armored knight with molten orange horn tips and orange fissures, orange eye slits, huge round heavy gauntlets in the reference. Reference for identity only. EXACTLY 6 equal columns and 3 equal rows, 1536x768 sheet, each cell 256x256, full body fixed anchor at center x and 84% cell height, consistent scale 75% cell height. Pixel art action RPG, three-quarter down-right camera. Row 1 six sequential frames of a heavy gravity gauntlet attack: ready, turn shoulder back winding up, lift fist with weight shift, explosive fist strike forward down, impact crouch fist grounded, recoil recover. Row 2 six sequential frames Titan ultimate leap and ground slam: bend knees, crouch coil, rise knees tucked arms lifted, apex full gauntlets overhead, powerful ground slam fist touching ground with legs wide, settle recovery. Row 3 six frames amber ground impact VFX without character: small compressed amber core, emerging rocky fracture, explosive circular ground crack with stone shards, shockwave expanding, scattered debris/dust, fading rock cracks. VFX centered in cell with 15% safe padding. No duplicated poses. Rich shaded metal, clear silhouettes, actual transparent alpha background. No grid, no labels, no words, no checkerboard baked into pixels. Preserve all character identity features.

## Prompt: ground-tiles.png

Use case: stylized-concept. Production top-down RPG ground texture atlas, 1024x1024 pixels, exactly 2x2 equal squares, no gutters no border. Each 512 square is an independently seamless repeatable flat ground texture viewed directly from above, all edges blend when tiled. TOP LEFT: ancient slate stone paving broken by dark moss and muted teal lichen. TOP RIGHT: volcanic dark brown basalt with very subtle warm ember cracks and ash. BOTTOM LEFT: cold blue gray frost stone and thin scattered snow on worn flagstones. BOTTOM RIGHT: dark violet ruin stone, dusty purple soil with sparse dull crystal fragments. Detailed hand painted pixel art, subdued low contrast so bright characters and red enemy warning circles remain clearly visible. Lots of irregular naturally flowing large stone shapes, subtle material microtexture, no obvious geometric uniform grid, no bright lights. Completely flat ground plane, no buildings, no trees, no objects, no cliffs, no horizon, no perspective scene, no characters, no labels. Four full bleed tiles use whole square; flat opaque textures, no transparency.
