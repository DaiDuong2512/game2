# BÀN GIAO CHO PHIÊN TIẾP THEO

- Mục tiêu chính: nâng cấp map, hoạt ảnh boss/Titan, cân bằng và thay bản GitHub bằng dist nén.
- Trạng thái hiện tại: mã nguồn 4.1.0 đã hoàn thiện, typecheck và 252 test đạt, dist đã kiểm tra hash; kết quả triển khai cuối xem GitHub Pages/Release v4.1.0.
- Dữ kiện đã xác minh: repository DaiDuong2512/game2; Pages phục vụ main tại thư mục gốc; 8 nhân vật, 20 map, 4 boss × 3 pha chạy qua kiểm tra trình duyệt; WebGL2 và Canvas 2D đều khởi động.
- Quyết định đã chốt: giữ TypeScript/Canvas/WebGL2 và dữ liệu hiện có; thêm atlas combat-v8, WebP trong dist; public giữ PNG nguồn. Q Titan 0,32 giây, R 0,56 giây; tên hành động Q phải là active-gravity-breaker. Mira giảm dần nội tại sau 100 mạng.
- Giả định đang dùng: cần giữ save cũ và địa chỉ Pages hiện có; không sửa cấu trúc lưu tiến trình.
- Tệp/mã/đầu ra đã tạo: src/game/CombatTiming.ts; public/assets/generated/combat-v8/; scripts/compact-release.mjs, sync-pages.mjs, verify-release.mjs, balance-audit.mjs; tests/combat-v8.test.mjs; dist/; RELEASE_MANIFEST.sha256; docs/RELEASE_4_1.md; docs/ASSET_PROMPTS_4_1.md; docs/qa-latest/*-v8*.json/png.
- Rủi ro còn lại: số đo cân bằng là mô phỏng chuẩn hóa, chưa khảo sát chơi dài hạn; mobile mới giả lập, chưa thử điện thoại thật; stress đo gửi lệnh vẽ chứ chưa phải FPS toàn game.
- Bước tiếp theo chính xác: khi sửa gameplay, chạy npm run check → npm run build:release → node scripts/verify-release.mjs dist → node scripts/sync-pages.mjs; kiểm tra trình duyệt rồi commit/push main. Không chạy build thường sau build:release trước khi sync. Chi tiết phát hành tại https://github.com/DaiDuong2512/game2/releases/tag/v4.1.0 ; game tại https://daiduong2512.github.io/game2/ .
