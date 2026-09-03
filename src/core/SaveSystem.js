const SAVE_KEY = 'riftwarden-echo-siege-save';
const CURRENT_VERSION = 4;
export const defaultSettings = {
    masterVolume: 0.75,
    effectsVolume: 0.8,
    screenShake: 0.7,
    damageNumbers: true,
    reducedParticles: false,
    autoAim: true,
    highContrast: true,
    colorBlindMode: 'off',
};
export function createDefaultSave() {
    return {
        version: CURRENT_VERSION,
        goldReserve: 0,
        riftShards: 0,
        highestStage: 1,
        highestCompletedStage: 0,
        recordedRuns: 0,
        unlockedCharacters: ['kael-orin'],
        unlockedWeapons: ['rift-blade', 'echo-bow', 'pulse-rifle', 'phase-darts', 'gravity-bomb', 'storm-call', 'ember-orb', 'frost-shards', 'void-laser', 'venom-bloom', 'aegis-orbit', 'echo-summon', 'arcane-nova', 'toxic-smoke-bomb'],
        metaLevels: {},
        settings: { ...defaultSettings },
        lastCharacterId: 'kael-orin',
        lastStageId: 'glassward-verge',
        permanentPoints: {
            attackSpeed: 0,
            moveSpeed: 0,
            armor: 0,
            damage: 0,
            lifeSteal: 0,
            luck: 0,
        },
        pendingPermanentChoices: [],
        pendingPermanentStage: 0,
    };
}
export class SaveSystem {
    data;
    constructor() {
        this.data = this.load();
    }
    load() {
        const fallback = createDefaultSave();
        try {
            const raw = localStorage.getItem(SAVE_KEY);
            if (!raw)
                return fallback;
            const parsed = JSON.parse(raw);
            const migrated = this.migrate(parsed);
            return migrated;
        }
        catch (error) {
            console.warn('Không thể tải dữ liệu lưu; đang dùng dữ liệu mới.', error);
            return fallback;
        }
    }
    migrate(input) {
        const base = createDefaultSave();
        const version = input.version ?? 1;
        const merged = {
            ...base,
            ...input,
            settings: { ...base.settings, ...(input.settings ?? {}) },
            metaLevels: { ...base.metaLevels, ...(input.metaLevels ?? {}) },
            permanentPoints: { ...base.permanentPoints, ...(input.permanentPoints ?? {}) },
            pendingPermanentChoices: Array.isArray(input.pendingPermanentChoices) ? input.pendingPermanentChoices : [],
            unlockedCharacters: Array.isArray(input.unlockedCharacters) ? input.unlockedCharacters : base.unlockedCharacters,
            unlockedWeapons: Array.isArray(input.unlockedWeapons)
                ? [...new Set([...base.unlockedWeapons, ...input.unlockedWeapons])]
                : base.unlockedWeapons,
            version: CURRENT_VERSION,
        };
        if (version < 2 && !merged.unlockedCharacters.includes('kael-orin'))
            merged.unlockedCharacters.unshift('kael-orin');
        if (version < 3) {
            merged.pendingPermanentChoices = [];
            merged.pendingPermanentStage = 0;
        }
        if (version < 4) {
            // Các bản lưu cũ chỉ ghi màn cao nhất đã mở. Suy ra bảo thủ rằng màn ngay
            // trước đó đã hoàn thành; riêng màn 20 không thể được suy đoán là đã thắng.
            merged.highestCompletedStage = Math.max(0, Math.min(20, Math.floor(merged.highestStage) - 1));
        }
        else {
            merged.highestCompletedStage = Math.max(0, Math.min(20, Math.floor(merged.highestCompletedStage)));
        }
        return merged;
    }
    save() {
        try {
            this.data.version = CURRENT_VERSION;
            localStorage.setItem(SAVE_KEY, JSON.stringify(this.data));
        }
        catch (error) {
            console.warn('Không thể ghi dữ liệu lưu.', error);
        }
    }
    reset() {
        this.data = createDefaultSave();
        this.save();
    }
    unlockCharacter(id) {
        if (this.data.unlockedCharacters.includes(id))
            return false;
        this.data.unlockedCharacters.push(id);
        this.save();
        return true;
    }
    updateSettings(settings) {
        this.data.settings = { ...this.data.settings, ...settings };
        this.save();
    }
}
//# sourceMappingURL=SaveSystem.js.map