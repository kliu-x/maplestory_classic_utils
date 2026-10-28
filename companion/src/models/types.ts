// Core domain types. Source data (game files, community guides) and user data
// (profiles, measurements, assumptions) are kept in separate types on purpose.

export type VerificationStatus = 'verified' | 'community_reported' | 'unverified' | 'conflicting';

export interface SourceMeta {
  source_url: string;
  source_title: string;
  retrieved_at: string; // ISO date
  game_version_or_date?: string;
  verification_status: VerificationStatus;
  notes?: string;
}

// ---------- Game data (from data/generated, built by scripts/build-data.mjs) ----------

export type Element = 'fire' | 'ice' | 'lightning' | 'poison' | 'holy' | 'dark' | 'physical';
export type ElementEffect = 'immune' | 'resist' | 'weak';

export interface MonsterSpawn {
  mapId: number;
  mapName: string;
  count: number; // spawn points on that map (from map file)
}

export interface Monster {
  id: number;
  name: string;
  level: number;
  hp: number;
  mp: number;
  exp: number;
  pdd: number; // weapon defense
  mdd: number; // magic defense
  accuracy: number;
  evasion: number;
  elemRaw: string; // raw WZ elemAttr code, e.g. "F3L2"
  elements: Partial<Record<Element, ElementEffect>>;
  undead: boolean;
  isBoss: boolean;
  spawns: MonsterSpawn[];
  source: SourceMeta;
}

export interface MapLane {
  y: number;
  xMin: number;
  xMax: number;
  spawns: { mobId: number; count: number }[];
}

export interface GameMap {
  id: number;
  name: string;
  street: string;
  region: string;
  isTown: boolean;
  mobRate: number;
  width: number;
  height: number;
  spawns: { mobId: number; count: number }[];
  /** Spawn points grouped by platform (inferred from spawn x/y; only when the map has 2+). Ordered top to bottom. */
  lanes?: MapLane[];
  portalsTo: number[];
  bossSpawns?: { mobId: number; x: number; y: number }[];
  /** The town you respawn in from this map (its home town). */
  returnMap?: number;
  /** World coordinates; see minimapPoint(). */
  npcs: { id: number; name: string; x: number; y: number }[];
  portals: { toMap: number; x: number; y: number }[];
  miniMap?: { centerX: number; centerY: number; width: number; height: number; magnification: number };
  source: SourceMeta;
}

export interface SkillLevel {
  level: number;
  damage?: number; // physical skill %, e.g. 140
  mad?: number; // magic skill base attack
  mpCon?: number;
  mobCount?: number;
  attackCount?: number;
  bulletCount?: number;
  raw: Record<string, string>;
}

export interface Skill {
  id: number;
  jobId: number;
  name: string;
  masterLevel: number;
  prereqs: { skillId: number; level: number }[];
  description: string;
  hidden: boolean;
  levels: SkillLevel[]; // index 0 = level 1
  source: SourceMeta;
}

export interface Quest {
  id: number;
  name: string;
  area: string;
  minLevel: number;
  maxLevel?: number;
  exp: number;
  meso: number;
  rewardItemCount: number;
  rewardItems: { itemId: number; count: number; jobMask?: number }[];
  fame?: number;
  rewardSkills?: number;
  prereqQuestIds: number[];
  npcId?: number;
  /** Hand-in NPC when it differs from the quest giver. */
  endNpcId?: number;
  killMobs: { mobId: number; count: number }[];
  collectItems: { itemId: number; count: number }[];
  /** The quest log text while in progress, markup resolved to names. */
  log?: string;
  /** Maps and monsters the quest text names (e.g. where to find a boss). */
  mentionsMaps: number[];
  mentionsMobs: number[];
  /** Plain-language objective (event quests give only a riddle). */
  hint?: string;
  /** Last day an event quest can be started (YYYY-MM-DD, exclusive). */
  availableUntil?: string;
  repeatable: boolean;
  source: SourceMeta;
}

export interface Npc {
  id: number;
  name: string;
  isShop: boolean;
  mapIds: number[];
}

export interface Item {
  id: number;
  name: string;
  description?: string;
}

// ---------- Jobs ----------

export type JobId =
  | 'beginner'
  | 'magician'
  | 'wizard_fp'
  | 'wizard_il'
  | 'cleric'
  | 'thief'
  | 'assassin'
  | 'bandit'
  | 'swordsman'
  | 'archer'
  | 'pirate';

export interface JobInfo {
  id: JobId;
  label: string;
  family: 'Beginner' | 'Magician' | 'Thief' | 'Warrior' | 'Bowman' | 'Pirate';
  tier: 0 | 1 | 2;
  gameJobIds: number[]; // skillbook ids usable by this job, incl. earlier tiers
  primaryStat: StatKey;
  secondaryStat?: StatKey;
  damageType: 'magic' | 'physical';
  plannerSupported: boolean;
}

export type StatKey = 'str' | 'dex' | 'int' | 'luk';
export type Stats = Record<StatKey, number>;

// ---------- User data (persisted locally) ----------

export interface DamageObservation {
  id: string;
  skillId: number | null; // null = basic attack
  mobId: number | null; // the monster the numbers were seen on (null = no defense / unknown)
  min: number; // per damage line
  avg: number;
  max: number;
  hitRate: number; // 0..1, share of lines that hit
  note: string;
  recordedAt: string;
}

export interface Character {
  id: string;
  name: string;
  job: JobId;
  level: number;
  base: Stats;
  equip: Stats;
  hp: number;
  mp: number;
  weapon: string;
  weaponAttack: number; // W.ATT from weapon + other gear
  magicAttack: number; // M.ATT from gear (wand/staff etc.)
  throwingStar: string;
  starAttack: number;
  currentExp?: number; // EXP into the current level, as shown in game
  /** @deprecated replaced by currentExp; converted on load. */
  expToNext?: number;
  skills: Record<number, number>; // skillId -> level
  statGoals: Partial<Stats>; // total stat requirements to reach (e.g. next claw's DEX), equipment included
  buildId?: string;
  /** Fill skills and base stats from the plan whenever level/job/build changes. */
  followPlan?: boolean;
  mainSkillId: number | null;
  observations: DamageObservation[];
  favorites: number[]; // monster ids
  completedQuests: number[];
  /** Training sessions measured from the game's status bar. */
  sessions?: SavedSession[];
  updatedAt: string;
}

export interface TrainingAssumptions {
  castsPerSecond: number;
  uptime: number; // share of time spent attacking (rest = moving, looting, sitting)
  respawnSeconds: number; // UNVERIFIED for Classic World
  spawnShare: number; // share of map spawns you can actually reach/keep up with
  laneSpawnShare: number; // same, when you stay on one lane (platform)
  useLanes?: boolean; // rank single lanes as well as whole maps (default on)
  mobsPerCast: number | null; // override targets hit per cast; null = min(skill mobCount, assumed pack)
  packSize: number; // monsters typically in range for a multi-target skill
  sessionMinutes: number;
  travelMinutes: number;
  deathsPerHour: number;
  deathExpLossPct: number; // UNVERIFIED for Classic World
  mpPotionMp: number;
  mpPotionPrice: number;
  hpPotionHpPerMin: number; // potion HP spent per minute from damage taken (user estimate)
  hpPotionHp: number;
  hpPotionPrice: number;
  starRechargePricePerStar: number;
  adjustForDefense: boolean;
  adjustForElement: boolean;
  adjustForLevelGap: boolean;
  adjustForAccuracy: boolean;
  elementModel: 'meowdb' | 'legacy';
}

export interface Settings {
  activeCharacterId: string | null;
  assumptions: TrainingAssumptions;
  recentMonsters: number[];
}

export interface AppState {
  version: 1;
  characters: Character[];
  settings: Settings;
}

export interface SavedSession {
  id: string;
  at: string;
  mapId: number | null;
  level: number;
  minutes: number;
  activeMinutes: number;
  expGained: number;
  expPerMin: number;
  expPerActiveMin: number;
  kills: number;
  expPerKill: number | null;
  castsPerKill: number | null;
  mpPerMin: number;
  potions: number;
}
