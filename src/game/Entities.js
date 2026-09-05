let nextEntityId = 1;
export class Enemy {
    id = nextEntityId++;
    active = false;
    config;
    x = 0;
    y = 0;
    vx = 0;
    vy = 0;
    health = 1;
    maxHealth = 1;
    damage = 1;
    armor = 0;
    speed = 1;
    radius = 12;
    exp = 1;
    gold = 0;
    attackTimer = 0;
    abilityTimer = 0;
    stateTimer = 0;
    contactTimer = 0;
    flashTimer = 0;
    facing = 0;
    phase = 1;
    shield = 0;
    isBoss = false;
    isElite = false;
    isFinalEncounter = false;
    chargeX = 0;
    chargeY = 0;
    alpha = 1;
    spawnPortalTime = 0;
    spawnPortalDuration = 0;
    lastHitWeapon = '';
    knockbackX = 0;
    knockbackY = 0;
    status = {
        bleedTime: 0, bleedDps: 0, bleedTick: 1, bleedSourceWeapon: '', burnTime: 0, burnDps: 0,
        poisonTime: 0, poisonDps: 0, poisonCloudTime: 0, poisonCloudDps: 0,
        poisonCloudPercent: 0, poisonCloudTick: 1, poisonCloudSourceWeapon: '', slowTime: 0,
        slowFactor: 1, stunTime: 0, shockTime: 0, paralysisTime: 0, blindTime: 0,
        blindCooldown: 0, burnTick: 0, burnPercent: 0, healingReduction: 0,
    };
    reset() {
        this.vx = 0;
        this.vy = 0;
        this.health = 0;
        this.maxHealth = 1;
        this.armor = 0;
        this.attackTimer = 0;
        this.abilityTimer = 0;
        this.stateTimer = 0;
        this.contactTimer = 0;
        this.flashTimer = 0;
        this.phase = 1;
        this.shield = 0;
        this.isBoss = false;
        this.isElite = false;
        this.isFinalEncounter = false;
        this.chargeX = 0;
        this.chargeY = 0;
        this.alpha = 1;
        this.spawnPortalTime = 0;
        this.spawnPortalDuration = 0;
        this.lastHitWeapon = '';
        this.knockbackX = 0;
        this.knockbackY = 0;
        this.status.bleedTime = 0;
        this.status.bleedDps = 0;
        this.status.bleedTick = 1;
        this.status.bleedSourceWeapon = '';
        this.status.burnTime = 0;
        this.status.burnDps = 0;
        this.status.poisonTime = 0;
        this.status.poisonDps = 0;
        this.status.poisonCloudTime = 0;
        this.status.poisonCloudDps = 0;
        this.status.poisonCloudPercent = 0;
        this.status.poisonCloudTick = 1;
        this.status.poisonCloudSourceWeapon = '';
        this.status.slowTime = 0;
        this.status.slowFactor = 1;
        this.status.stunTime = 0;
        this.status.shockTime = 0;
        this.status.paralysisTime = 0;
        this.status.blindTime = 0;
        this.status.blindCooldown = 0;
        this.status.burnTick = 0;
        this.status.burnPercent = 0;
        this.status.healingReduction = 0;
    }
}
export class Projectile {
    id = nextEntityId++;
    active = false;
    faction = 'player';
    sourceWeaponId = '';
    element = 'physical';
    x = 0;
    y = 0;
    vx = 0;
    vy = 0;
    damage = 0;
    radius = 5;
    life = 0;
    maxLife = 0;
    pierce = 0;
    maxRange = 1000;
    travelled = 0;
    homing = 0;
    explosiveRadius = 0;
    statusChance = 0;
    knockback = 0;
    critical = false;
    color = '#ffffff';
    trail = true;
    pullStrength = 0;
    persistent = false;
    tickRate = 0.45;
    tickTimer = 0;
    targetId = -1;
    canHitPlayer = true;
    hitEffect = null;
    deployAreaDuration = 0;
    deployAreaRadius = 0;
    deployAreaTickRate = 1;
    deployAreaDamage = 0;
    deployAreaHitEffect = null;
    hitIds = new Set();
    reset() {
        this.sourceWeaponId = '';
        this.x = 0;
        this.y = 0;
        this.vx = 0;
        this.vy = 0;
        this.damage = 0;
        this.radius = 5;
        this.life = 0;
        this.maxLife = 0;
        this.pierce = 0;
        this.maxRange = 1000;
        this.travelled = 0;
        this.homing = 0;
        this.explosiveRadius = 0;
        this.statusChance = 0;
        this.knockback = 0;
        this.critical = false;
        this.color = '#ffffff';
        this.trail = true;
        this.pullStrength = 0;
        this.persistent = false;
        this.tickRate = 0.45;
        this.tickTimer = 0;
        this.targetId = -1;
        this.canHitPlayer = true;
        this.hitEffect = null;
        this.deployAreaDuration = 0;
        this.deployAreaRadius = 0;
        this.deployAreaTickRate = 1;
        this.deployAreaDamage = 0;
        this.deployAreaHitEffect = null;
        this.hitIds.clear();
    }
}
export class Pickup {
    id = nextEntityId++;
    active = false;
    type = 'exp';
    x = 0;
    y = 0;
    vx = 0;
    vy = 0;
    radius = 8;
    value = 1;
    age = 0;
    magnetized = false;
    color = '#69d8e2';
    statId = '';
    reset() {
        this.type = 'exp';
        this.x = 0;
        this.y = 0;
        this.vx = 0;
        this.vy = 0;
        this.radius = 8;
        this.value = 1;
        this.age = 0;
        this.magnetized = false;
        this.color = '#69d8e2';
        this.statId = '';
    }
}
export class Particle {
    id = nextEntityId++;
    active = false;
    kind = 'spark';
    x = 0;
    y = 0;
    x2 = 0;
    y2 = 0;
    vx = 0;
    vy = 0;
    life = 0;
    maxLife = 0;
    size = 2;
    color = '#ffffff';
    alpha = 1;
    rotation = 0;
    reset() {
        this.kind = 'spark';
        this.x = 0;
        this.y = 0;
        this.x2 = 0;
        this.y2 = 0;
        this.vx = 0;
        this.vy = 0;
        this.life = 0;
        this.maxLife = 0;
        this.size = 2;
        this.color = '#ffffff';
        this.alpha = 1;
        this.rotation = 0;
    }
}
export class FloatingText {
    id = nextEntityId++;
    active = false;
    x = 0;
    y = 0;
    value = '';
    life = 0;
    maxLife = 0;
    color = '#ffffff';
    size = 14;
    critical = false;
    kind = 'neutral';
    horizontalOffset = 0;
    reset() {
        this.x = 0;
        this.y = 0;
        this.value = '';
        this.life = 0;
        this.maxLife = 0;
        this.color = '#ffffff';
        this.size = 14;
        this.critical = false;
        this.kind = 'neutral';
        this.horizontalOffset = 0;
    }
}
export class Telegraph {
    id = nextEntityId++;
    active = false;
    x = 0;
    y = 0;
    radius = 80;
    time = 0;
    maxTime = 1;
    damage = 10;
    kind = 'circle';
    bossId = '';
    reset() {
        this.x = 0;
        this.y = 0;
        this.radius = 80;
        this.time = 0;
        this.maxTime = 1;
        this.damage = 10;
        this.kind = 'circle';
        this.bossId = '';
    }
}
//# sourceMappingURL=Entities.js.map