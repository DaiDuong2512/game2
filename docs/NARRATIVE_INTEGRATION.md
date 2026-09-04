# Hợp đồng tích hợp cốt truyện

`NarrativeSystem` không nhập `GameManager`, `UIManager`, `Renderer` hay hệ lưu. Lớp nhận `data.lore` và chỉ trả dữ liệu thuần để phần giao diện quyết định cách hiển thị.

## Luồng gọi bắt buộc

```ts
const narrative = new NarrativeSystem(data.lore);

// Sau khi người chơi chọn nhân vật và bản đồ, trước khi bắt đầu đếm thời gian.
const briefing = narrative.startStage(stage.id, character.id);
ui.showMissionBriefing(briefing, beginRun, openCodex);

// Mỗi lượt cập nhật đang chơi; mảng rỗng nghĩa là chưa có lời mới.
for (const cue of narrative.updateProgress(stageManager.progress())) {
  ui.showTransmission(cue);
}

// Gọi đúng lúc StageManager báo nên sinh Elite/Boss, trước khi tạo kẻ địch.
const finalCue = narrative.triggerFinalEncounter();
if (finalCue) ui.showTransmission(finalCue);

// Gọi một lần khi xác nhận chiến thắng.
const result = narrative.completeStage();
result.cues.forEach((cue) => ui.showTransmission(cue));
const unlockedTitles = result.codexUnlockIds
  .map((id) => narrative.codexEntry(id)?.title)
  .filter(Boolean);
if (unlockedTitles.length > 0) ui.toast(`Thư Khố đã mở: ${unlockedTitles.join(', ')}`);
if (result.ending.length > 0) ui.showStoryEnding(result.ending, showSummary);
```

`startStage` tự đặt lại cờ phát lời. `updateProgress`, `triggerFinalEncounter` và `completeStage` chống phát trùng, vì vậy có thể gọi an toàn từ vòng lặp hoặc luồng trạng thái có nhiều khung hình.

## Dữ liệu cho giao diện

- `MissionBriefing.act`: tên, phụ đề và tóm tắt hồi.
- `MissionBriefing.stage`: tóm tắt màn cùng dữ liệu diễn biến.
- `MissionBriefing.objectives`: đúng ba dòng mục tiêu.
- `MissionBriefing.transmission`: lời dẫn nhiệm vụ trước trận.
- `MissionBriefing.characterLine`: câu nhập trận của nhân vật đang chọn.
- `NarrativeCue.kind`: `prelude`, `mid-stage`, `elite`, `boss`, `victory` hoặc `ending`.
- `NarrativeCue.speaker`, `title`, `text`: nội dung tiếng Việt để hiển thị trực tiếp.

## Thư Khố và quan hệ

```ts
const entries = narrative.listCodex({
  highestCompletedStage: save.highestCompletedStage,
  unlockedCharacterIds: save.unlockedCharacters,
});

const relationships = narrative.relationshipsFor(character.id);
```

Danh sách Thư Khố giữ cả mục khóa và đã mở để giao diện dựng lưới ổn định. Chỉ mở phần nội dung khi `unlocked === true`; có thể gọi `codexEntry(id)` để đọc lại một mục. Quan hệ trả theo góc nhìn hồ sơ nhân vật nhưng dữ liệu mỗi cặp chỉ được lưu một lần.

## Điều kiện đã được DataStore bảo vệ

- đúng 3 hồi liên tục: màn 1–7, 8–14 và 15–20;
- đúng một chương truyện cho mỗi bản đồ, theo đúng thứ tự `stages.json`;
- đúng ba mục tiêu và đủ bốn mốc lời thoại cho mỗi màn;
- màn có Boss dùng lời báo `boss`, màn còn lại dùng `elite`;
- đủ 8 hồ sơ nhân vật, mỗi người có ít nhất hai mối liên hệ;
- mọi mã Thư Khố, bản đồ, nhân vật và hậu truyện đều tham chiếu hợp lệ;
- danh sách `codexUnlockIds` của mỗi màn khớp chính xác điều kiện `qua-màn`, không có hai nguồn mở khóa mâu thuẫn.
