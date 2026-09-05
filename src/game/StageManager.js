import { computeScaling } from './Scaling.js';
export const FINAL_ENCOUNTER_PROGRESS = 0.9;
export const ACCELERATED_STAGE_DURATION = 45;
export const REGULAR_ENEMY_PHASE_DURATION = 210;
export function regularStageDuration(configuredDuration) {
    return Math.max(configuredDuration, Math.ceil(REGULAR_ENEMY_PHASE_DURATION / FINAL_ENCOUNTER_PROGRESS));
}
export class StageManager {
    stage = null;
    elapsed = 0;
    duration = 1;
    wave = 1;
    previousWave = 1;
    bossSpawned = false;
    eliteSpawned = false;
    bossDefeated = false;
    intermission = 0;
    warning = '';
    accelerated = false;
    start(stage, accelerated = false) {
        this.stage = stage;
        this.accelerated = accelerated;
        this.elapsed = 0;
        // QA mở khóa nội dung và dùng seed cố định, nhưng không được tự ý đổi nhịp
        // trận. Chỉ cờ tăng tốc tường minh mới rút thời lượng để chạy smoke test.
        this.duration = accelerated
            ? Math.min(ACCELERATED_STAGE_DURATION, stage.duration)
            : regularStageDuration(stage.duration);
        this.wave = 1;
        this.previousWave = 1;
        this.bossSpawned = false;
        this.eliteSpawned = false;
        this.bossDefeated = false;
        this.intermission = 1.5;
        this.warning = 'Đã thiết lập liên kết tiền tuyến';
    }
    update(dt) {
        if (!this.stage)
            return { waveChanged: false, shouldSpawnFinal: false, timeExpired: false };
        if (this.intermission > 0) {
            this.intermission = Math.max(0, this.intermission - dt);
            if (this.intermission === 0)
                this.warning = '';
            return { waveChanged: false, shouldSpawnFinal: false, timeExpired: false };
        }
        this.elapsed += dt;
        this.previousWave = this.wave;
        const combatFraction = Math.min(0.999, this.elapsed / this.duration);
        this.wave = Math.min(this.stage.waveCount, Math.floor(combatFraction * this.stage.waveCount) + 1);
        const waveChanged = this.wave !== this.previousWave;
        if (waveChanged && this.wave < this.stage.waveCount) {
            this.intermission = this.accelerated ? 0.45 : 1.75;
            this.warning = `Đợt ${this.wave} đang tới`;
        }
        const shouldSpawnFinal = !this.bossSpawned
            && !this.eliteSpawned
            && this.elapsed >= this.duration * FINAL_ENCOUNTER_PROGRESS;
        if (shouldSpawnFinal)
            this.warning = this.stage.bossId ? 'Phát hiện tín hiệu Trùm' : 'Phát hiện kẻ địch Tinh Anh';
        const timeExpired = this.elapsed >= this.duration;
        return { waveChanged, shouldSpawnFinal, timeExpired };
    }
    scaling() {
        if (!this.stage)
            return computeScaling(1, 1);
        return computeScaling(this.stage.index, this.wave);
    }
    remaining() {
        return Math.max(0, this.duration - this.elapsed);
    }
    progress() {
        return Math.min(1, this.elapsed / Math.max(1, this.duration));
    }
}
//# sourceMappingURL=StageManager.js.map