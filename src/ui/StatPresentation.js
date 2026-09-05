export const PLAYER_STAT_LABELS = {
    maxHp: 'Sinh lực tối đa',
    armor: 'Giáp',
    moveSpeed: 'Tốc độ di chuyển',
    attackSpeed: 'Tốc đánh',
    critChance: 'Tỉ lệ chí mạng',
    critDamage: 'Sát thương chí mạng',
    damage: 'Sát thương',
    cooldownReduction: 'Giảm hồi chiêu',
    range: 'Tầm đánh',
    projectileSpeed: 'Tốc độ đạn',
    lifeSteal: 'Hút máu',
    hpRegen: 'Hồi sinh lực',
    dodge: 'Né tránh',
    luck: 'May mắn',
    expGain: 'Kinh nghiệm nhận được',
    goldGain: 'Vàng nhận được',
    bonusProjectiles: 'Tia đạn cộng thêm',
    healingPower: 'Hiệu quả hồi phục',
    armorPenetration: 'Xuyên giáp',
    statusResistance: 'Kháng hiệu ứng',
    bodyScale: 'Kích thước cơ thể',
    flatBlock: 'Chặn sát thương',
};
export const PLAYER_STAT_GROUPS = [
    {
        title: 'Tấn công',
        stats: [
            'damage', 'attackSpeed', 'critChance', 'critDamage', 'bonusProjectiles',
            'cooldownReduction', 'range', 'projectileSpeed', 'armorPenetration',
        ],
    },
    {
        title: 'Sinh tồn',
        stats: [
            'maxHp', 'armor', 'flatBlock', 'hpRegen', 'lifeSteal', 'dodge',
            'statusResistance', 'healingPower',
        ],
    },
    {
        title: 'Cơ động và tài nguyên',
        stats: ['moveSpeed', 'luck', 'expGain', 'goldGain', 'bodyScale'],
    },
];
const PERCENT_STATS = new Set([
    'attackSpeed', 'critChance', 'critDamage', 'damage', 'cooldownReduction',
    'range', 'projectileSpeed', 'lifeSteal', 'dodge', 'luck', 'expGain',
    'goldGain', 'healingPower', 'armorPenetration', 'statusResistance', 'bodyScale',
]);
function compactDecimal(value, maximumFractionDigits = 2) {
    const safe = Number.isFinite(value) && Math.abs(value) >= 0.0005 ? value : 0;
    return safe.toLocaleString('vi-VN', { maximumFractionDigits: maximumFractionDigits });
}
/** Chuẩn hiển thị dùng chung cho bảng TAB, thẻ buff và toast mảnh chỉ số. */
export function formatPlayerStatValue(stat, value) {
    if (PERCENT_STATS.has(stat))
        return `${compactDecimal(value * 100)}%`;
    switch (stat) {
        case 'maxHp': return `${compactDecimal(value, 1)} HP`;
        case 'hpRegen': return `${compactDecimal(value)} HP/giây`;
        case 'bonusProjectiles': return `${Math.max(0, Math.floor(value))} tia`;
        case 'flatBlock': return `${compactDecimal(value)} điểm/đòn`;
        case 'moveSpeed': return `${compactDecimal(value, 1)} điểm`;
        default: return `${compactDecimal(value)} điểm`;
    }
}
export function formatPlayerStatTransition(stat, before, after) {
    return `${PLAYER_STAT_LABELS[stat]}: ${formatPlayerStatValue(stat, before)} → ${formatPlayerStatValue(stat, after)}`;
}
//# sourceMappingURL=StatPresentation.js.map