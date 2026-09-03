/**
 * Phân cấp bằng tiền tố nguồn thay vì màu. Nhờ vậy Q/E/R vẫn có silhouette
 * riêng trong chế độ mù màu và khi atlas bị thu nhỏ trên điện thoại.
 */
export function combatCueTier(source) {
    const normalized = source.trim().toLowerCase();
    if (normalized === 'ultimate' || normalized.startsWith('ultimate-'))
        return 'ultimate';
    if (normalized === 'rage' || normalized.startsWith('rage-'))
        return 'rage';
    if (normalized === 'active' || normalized.startsWith('active-'))
        return 'active';
    return 'primary';
}
export function combatCueProfile(source) {
    const normalized = source.trim().toLowerCase();
    const tier = combatCueTier(normalized);
    const toxic = /toxic|poison|plague|hemo/u.test(normalized);
    const frost = /frost|ice|gale/u.test(normalized);
    const fire = /fire|forge|ember|titan/u.test(normalized);
    const blood = /blood|rift-blood/u.test(normalized);
    const voidborne = /void|echo|astral/u.test(normalized);
    const accent = toxic ? '#87e56e'
        : frost ? '#86e5ff'
            : fire ? '#ff9853'
                : blood ? '#ff6f74'
                    : voidborne ? '#c88bff'
                        : tier === 'rage' ? '#ffb64f'
                            : tier === 'ultimate' ? '#ffe38a' : '#6fe3ea';
    const core = toxic ? '#efffa9'
        : frost ? '#f2ffff'
            : fire ? '#fff0a3'
                : blood ? '#fff1df'
                    : voidborne ? '#f5ddff'
                        : '#f4ffff';
    const radius = tier === 'ultimate' ? 76 : tier === 'rage' ? 52 : tier === 'active' ? 44 : 28;
    const segments = tier === 'ultimate' ? 40 : tier === 'rage' ? 28 : tier === 'active' ? 24 : 16;
    return { tier, accent, core, radius, segments };
}
/** Kích thước atlas là tín hiệu ổn định cho cường độ impact đã phát sinh. */
export function impactWeightForSize(size) {
    if (size >= 180)
        return 'finisher';
    if (size >= 76)
        return 'skill';
    return 'hit';
}
//# sourceMappingURL=CombatVfxLanguage.js.map