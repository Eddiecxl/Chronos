export const REALMS = [
  { name: '凡人', need: 30 },
  { name: '炼气一层', need: 40 }, { name: '炼气二层', need: 55 }, { name: '炼气三层', need: 70 },
  { name: '炼气四层', need: 90 }, { name: '炼气五层', need: 115 }, { name: '炼气六层', need: 145 },
  { name: '炼气七层', need: 180 }, { name: '炼气八层', need: 220 }, { name: '炼气九层', need: 280 },
  { name: '筑基初期', need: 360 }, { name: '筑基中期', need: 460 }, { name: '筑基后期', need: 580 },
  { name: '筑基大圆满', need: 720 }, { name: '金丹初期', need: 900 }, { name: '金丹中期', need: 1120 },
  { name: '金丹后期', need: 1380 }, { name: '元婴初期', need: 1700 }, { name: '元婴后期', need: 2100 },
  { name: '化神期', need: 2600 }, { name: '炼虚期', need: 3200 }, { name: '合体期', need: 4000 },
  { name: '渡劫期', need: 5000 }
];

export const LOCATIONS = {
  '赵府柴房': { id: 'location:zhao-woodshed', act: 1, realm: 0, icon: '🕯', description: '潮湿狭小的柴房，是你被弃命运的起点。' },
  '青石镇': { id: 'location:qingshi-town', act: 1, realm: 0, icon: '🏘', description: '凡人与散修混居的小镇，消息总比风跑得快。' },
  '落霞宗外门': { id: 'location:luoxia-outer', act: 1, realm: 0, icon: '⛩', description: '九百级石阶之上，云海托着落霞宗的山门。' },
  '后山樱林': { id: 'location:cherry-forest', act: 2, realm: 1, icon: '🌸', description: '灵樱四季不谢，树影深处常有奇缘。' },
  '百宝坊市': { id: 'location:market', act: 2, realm: 2, icon: '🏮', description: '法器丹药真假混卖，最考验眼力和灵石。' },
  '丹霞谷': { id: 'location:danxia-valley', act: 2, realm: 4, icon: '⚗', description: '地火终年不熄，药香能绕山三日。' },
  '古剑冢': { id: 'location:sword-tomb', act: 2, realm: 6, icon: '⚔', description: '万柄残剑无风自鸣，只认真正的剑心。' },
  '青岚秘境': { id: 'location:qinglan-realm', act: 3, realm: 9, icon: '🌀', description: '每十年开启一次的上古遗境，生死与机缘并存。' },
  '北境天关': { id: 'location:northern-pass', act: 4, realm: 14, icon: '🏔', description: '长风卷雪，仙魔两道在此隔关对峙。' },
  '幽冥裂隙': { id: 'location:nether-rift', act: 4, realm: 16, icon: '🌑', description: '魔气从地脉裂痕涌出，旧日真相埋在最深处。' },
  '天机台': { id: 'location:fate-terrace', act: 5, realm: 19, icon: '☯', description: '观星可见众生因果，也会照见自己的执念。' },
  '飞升台': { id: 'location:ascension-terrace', act: 5, realm: 22, icon: '☁', description: '九重雷云之下，所有选择都会在此结算。' }
};

export const ITEMS = {
  '回春丹': { type: 'consumable', price: 12, heal: 35, description: '温和疗伤，入口有淡淡桃香。' },
  '聚气丹': { type: 'consumable', price: 24, qi: 45, description: '短时间汇聚灵气，适合突破前服用。' },
  '筑基丹': { type: 'consumable', price: 180, qi: 160, description: '筑基修士梦寐以求的破境丹。' },
  '清心丹': { type: 'consumable', price: 65, heal: 20, description: '压制心魔，恢复神识清明。' },
  '九转金丹': { type: 'consumable', price: 1200, heal: 999, qi: 500, description: '传说能从生死边缘夺回一线天命。' },
  '桃花酿': { type: 'gift', price: 18, description: '李老最爱，后劲比看起来大得多。' },
  '灵米饭团': { type: 'consumable', price: 5, heal: 12, description: '林小满亲手捏的，形状不佳但很顶饿。' },
  '引雷符': { type: 'consumable', price: 45, damage: 55, description: '引一道细雷攻击敌手。' },
  '遁地符': { type: 'consumable', price: 60, flee: true, description: '战斗中保证一次脱身机会。' },
  '止血草': { type: 'material', price: 3, description: '炼制回春丹的基础药材。' },
  '凝露花': { type: 'material', price: 8, description: '清晨才会凝成灵露的淡蓝小花。' },
  '赤焰果': { type: 'material', price: 22, description: '丹霞谷特产，不能直接吞服。' },
  '玄阴石': { type: 'material', price: 35, description: '来自裂隙的冰冷矿石。' },
  '青岚令': { type: 'quest', price: 0, description: '进入青岚秘境的身份令牌。' },
  '残缺玉简': { type: 'quest', price: 0, description: '记载着被人为抹去的一段宗门历史。' },
  '星盘碎片': { type: 'quest', price: 0, description: '靠近天机台时会发出微光。' },
  '木剑': { type: 'weapon', slot: 'hands', rarity: 'common', price: 10, attack: 4, description: '外门弟子的制式练习剑。' },
  '玄铁剑': { type: 'weapon', slot: 'hands', rarity: 'uncommon', price: 160, attack: 18, description: '沉重无锋，以灵力驭之可破护体罡气。' },
  '落樱剑': { type: 'weapon', slot: 'hands', rarity: 'rare', price: 680, attack: 42, description: '挥剑时花影漫天，与落樱剑诀相合。' },
  '问天剑': { type: 'weapon', slot: 'hands', rarity: 'epic', price: 0, attack: 88, description: '剑冢万剑认可后诞生的道兵。' },
  '外门青衫': { type: 'armor', slot: 'body', rarity: 'common', price: 16, defense: 3, description: '耐脏耐磨，还绣着落霞云纹。' },
  '流云法袍': { type: 'armor', slot: 'body', rarity: 'rare', price: 210, defense: 16, description: '可卸去部分冲击，衣摆永不沾尘。' },
  '玄武灵甲': { type: 'armor', slot: 'body', rarity: 'epic', price: 850, defense: 38, description: '取玄武遗蜕炼成，守势沉稳。' },
  '同心结': { type: 'accessory', slot: 'neck', rarity: 'rare', price: 0, spirit: 12, description: '一根笨拙却郑重编好的红绳。' },
  '云纹束冠': { type: 'armor', slot: 'head', rarity: 'uncommon', defense: 2, spirit: 3, price: 55, description: '以护神云纹稳住识海的外门束冠。' },
  '星辉道冠': { type: 'armor', slot: 'head', rarity: 'epic', defense: 8, spirit: 10, price: 520, description: '冠上星砂会随神识流转而明灭。' },
  '青藤护臂': { type: 'armor', slot: 'arms', rarity: 'uncommon', defense: 3, price: 48, description: '灵藤编成，受击时自行收紧。' },
  '玄鳞护臂': { type: 'armor', slot: 'arms', rarity: 'epic', attack: 4, defense: 9, price: 610, description: '玄鳞层叠，能卸开近身重击。' },
  '轻羽腿甲': { type: 'armor', slot: 'legs', rarity: 'rare', defense: 5, price: 130, description: '薄如羽翼，不妨碍步法变化。' },
  '玄武胫甲': { type: 'armor', slot: 'legs', rarity: 'epic', defense: 12, price: 760, description: '沉重灵甲将下盘牢牢钉在地脉上。' },
  '逐风靴': { type: 'armor', slot: 'feet', rarity: 'rare', defense: 2, spirit: 3, price: 115, description: '靴底风纹能减轻长途跋涉的负担。' },
  '踏云履': { type: 'armor', slot: 'feet', rarity: 'epic', defense: 5, spirit: 7, price: 680, description: '落足如踏云，急转时几乎不留声息。' }
};

export const TECHNIQUES = {
  '吐纳': { realm: 0, cost: 0, power: 0, kind: 'cultivate', description: '最基础也最可靠的引气法。' },
  '落霞掌': { realm: 1, cost: 4, power: 1.35, kind: 'attack', description: '掌势如晚霞铺天。' },
  '流云步': { realm: 2, cost: 5, power: 0.4, kind: 'defend', description: '身随云转，可避锋芒。' },
  '落樱剑诀': { realm: 4, cost: 8, power: 1.8, kind: 'attack', description: '花落之前，剑已归鞘。' },
  '青木回春术': { realm: 5, cost: 10, power: 0.55, kind: 'heal', description: '借草木生机修补伤势。' },
  '焚心诀': { realm: 7, cost: 12, power: 2.2, kind: 'attack', description: '以血换势，威力猛烈。' },
  '万剑归宗': { realm: 10, cost: 18, power: 2.8, kind: 'attack', description: '剑意化雨，万锋同至。' },
  '太虚镜': { realm: 13, cost: 20, power: 0.75, kind: 'defend', description: '借虚空折返来势。' },
  '九霄引雷诀': { realm: 17, cost: 28, power: 3.6, kind: 'attack', description: '以自身为引，借九霄天雷。' },
  '一念花开': { realm: 20, cost: 35, power: 4.4, kind: 'attack', description: '一念生灭，花开世界。' }
};

export const NPCS = {
  '林小满': { id: 'npc:lin-xiaoman', location: '落霞宗外门', role: '青梅与同门', description: '嘴硬心软，最擅长把担心说成嫌弃。' },
  '李老': { id: 'npc:li-lao', location: '后山樱林', role: '守山老人', description: '看似醉醺醺，实则剑意深不可测。' },
  '苏晚晴': { id: 'npc:su-wanqing', location: '丹霞谷', role: '丹修天才', description: '冷静克制，对草药和承诺同样认真。' },
  '钱多多': { id: 'npc:qian-duoduo', location: '百宝坊市', role: '灵商', description: '算盘打得飞快，但真正的朋友从不标价。' },
  '慕容雪': { id: 'npc:murong-xue', location: '古剑冢', role: '剑峰真传', description: '寡言如雪，剑下从不留虚招。' },
  '赵天霸': { id: 'npc:zhao-tianba', location: '青石镇', role: '旧日仇敌', description: '欺软怕硬，也可能在绝境中做出意外选择。' },
  '陆沉舟': { id: 'npc:lu-chenzhou', location: '北境天关', role: '镇关长老', description: '把宗门安危看得比自己的道途更重。' },
  '宁无妄': { id: 'npc:ning-wuwang', location: '幽冥裂隙', role: '魔道少主', description: '行事危险坦荡，厌恶仙门的虚伪。' }
};

export const QUESTS = {
  'escape-zhao': { type: 'main', act: 1, title: '柴门之外', target: 1, reward: { qi: 20 }, description: '离开赵府柴房，救下被牵连的林小满。' },
  'meet-elder': { type: 'main', act: 1, title: '醉翁传法', target: 1, reward: { qi: 30 }, description: '接受李老的引气考验。' },
  'outer-trial': { type: 'main', act: 1, title: '外门试炼', target: 3, reward: { qi: 80, items: { '木剑': 1 } }, description: '完成三项外门功课，取得正式弟子身份。' },
  'sect-tournament': { type: 'main', act: 2, title: '宗门大比', target: 3, reward: { qi: 150, items: { '青岚令': 1 } }, description: '在大比中证明自己的道心与实力。' },
  'missing-disciples': { type: 'main', act: 2, title: '后山失踪案', target: 3, reward: { qi: 120 }, description: '调查外门弟子接连失踪的真相。' },
  'secret-jade': { type: 'main', act: 2, title: '残简疑云', target: 2, reward: { qi: 130, items: { '残缺玉简': 1 } }, description: '拼合被抹去的宗门旧史。' },
  'mystic-entry': { type: 'main', act: 3, title: '青岚开境', target: 1, reward: { qi: 160 }, description: '持令进入青岚秘境。' },
  'mystic-core': { type: 'main', act: 3, title: '遗境之心', target: 4, reward: { qi: 260 }, description: '穿越四重遗迹，抵达秘境核心。' },
  'truth-below': { type: 'main', act: 3, title: '石碑真名', target: 2, reward: { qi: 220 }, description: '找出镇压裂隙之人的真实姓名。' },
  'north-defense': { type: 'main', act: 4, title: '北境烽火', target: 5, reward: { qi: 420 }, description: '守住天关，决定俘虏与百姓的命运。' },
  'rift-descent': { type: 'main', act: 4, title: '深入幽冥', target: 3, reward: { qi: 500, items: { '星盘碎片': 1 } }, description: '与宁无妄合作或对抗，进入裂隙底部。' },
  'sect-choice': { type: 'main', act: 4, title: '山门存亡', target: 1, reward: { qi: 380 }, description: '在真相与宗门声名之间作出抉择。' },
  'read-stars': { type: 'main', act: 5, title: '天机照命', target: 3, reward: { qi: 600 }, description: '在星海中重见此生最重的三段因果。' },
  'heart-demon': { type: 'main', act: 5, title: '问心一战', target: 1, reward: { qi: 720 }, description: '承认、斩断或拥抱自己的执念。' },
  'final-tribulation': { type: 'main', act: 5, title: '九重天劫', target: 9, reward: { qi: 1000 }, description: '渡过九重雷劫，为此世写下结局。' },
  'herb-basket': { type: 'side', act: 1, title: '小满的药篮', target: 4, reward: { gold: 25, relationship: { '林小满': 6 } }, description: '替林小满收集四株止血草。' },
  'elder-wine': { type: 'side', act: 2, title: '桃花一壶', target: 1, reward: { qi: 40, relationship: { '李老': 8 } }, description: '给李老带一壶真正的桃花酿。' },
  'alchemy-start': { type: 'side', act: 2, title: '第一炉丹', target: 1, reward: { items: { '聚气丹': 2 }, relationship: { '苏晚晴': 5 } }, description: '在苏晚晴指点下炼成第一炉回春丹。' },
  'merchant-debt': { type: 'side', act: 2, title: '铁算盘的旧账', target: 2, reward: { gold: 90, relationship: { '钱多多': 7 } }, description: '帮钱多多收回一笔不寻常的旧账。' },
  'sword-heart': { type: 'side', act: 2, title: '剑冢问心', target: 3, reward: { items: { '落樱剑': 1 }, techniques: ['万剑归宗'] }, description: '承受三轮剑意，回答何为手中之剑。' },
  'zhao-redemption': { type: 'side', act: 2, title: '恶人也有家书', target: 1, reward: { karma: { mercy: 2 } }, description: '决定是否把赵天霸的家书送回青石镇。' },
  'mystic-rescue': { type: 'side', act: 3, title: '雾中呼救', target: 3, reward: { karma: { mercy: 2 }, relationship: { '慕容雪': 6 } }, description: '在秘境崩塌前救出受困同门。' },
  'spirit-beast': { type: 'side', act: 3, title: '不肯认主的灵兽', target: 2, reward: { items: { '同心结': 1 } }, description: '用耐心而非武力赢得灵兽信任。' },
  'border-medicine': { type: 'side', act: 4, title: '雪线伤营', target: 6, reward: { relationship: { '陆沉舟': 6 }, karma: { mercy: 2 } }, description: '为伤营送去六份疗伤物资。' },
  'demon-prisoner': { type: 'side', act: 4, title: '无名俘虏', target: 1, reward: { karma: { mercy: 2, demonic: 1 } }, description: '查明魔道俘虏为何主动投降。' },
  'broken-promise': { type: 'side', act: 5, title: '旧约未冷', target: 1, reward: { qi: 300 }, description: '在渡劫前履行一个曾经许下的承诺。' },
  'last-meal': { type: 'side', act: 5, title: '飞升前的饭', target: 4, reward: { karma: { mercy: 1 } }, description: '与仍在身边的故人吃最后一顿凡间饭。' }
};

export const CHAPTERS = [
  {
    id: 'act1-awakening', act: 1, goal: '逃离赵府并保住自己的性命', entry: '在赵府柴房醒来',
    actorIds: ['npc:zhao-tianba'],
    requiredFacts: [], optionalThreads: ['loop:lost-memory'], dangerClock: { id: 'zhaoPursuit', limit: 4 },
    pace: { gentle: 1, firm: 3, decisive: 5 },
    exits: [{ progressId: 'chapter:act1-awakening:complete', nextChapterId: 'act1-rain-alley' }]
  },
  {
    id: 'act1-rain-alley', act: 1, goal: '决定是否援助林小满并摆脱赵府追兵', entry: '冲入青石镇雨巷',
    requiredFacts: [], optionalThreads: ['loop:xiaoman-medicine'], dangerClock: { id: 'zhaoPursuit', limit: 6 },
    pace: { gentle: 2, firm: 5, decisive: 8 },
    exits: [{ progressId: 'chapter:act1-rain-alley:complete', nextChapterId: 'act1-elder-test' }]
  },
  {
    id: 'act1-elder-test', act: 1, goal: '通过李老考验并第一次引气入体', entry: '遇见醉酒守山人',
    requiredFacts: [], optionalThreads: ['loop:elder-identity'], dangerClock: { id: 'meridianStrain', limit: 4 },
    pace: { gentle: 1, firm: 3, decisive: 5 },
    exits: [{ progressId: 'chapter:act1-elder-test:complete', nextChapterId: 'act1-mountain-gate' }]
  },
  {
    id: 'act1-mountain-gate', act: 1, goal: '登上九百石阶并取得外门身份', entry: '抵达落霞宗山门',
    requiredFacts: [], optionalThreads: ['loop:self-ringing-bell'], dangerClock: { id: 'entryDeadline', limit: 3 },
    pace: { gentle: 1, firm: 2, decisive: 3 },
    exits: [{ progressId: 'chapter:act1-mountain-gate:complete', nextChapterId: 'act2-outer-trial' }]
  },
  {
    id: 'act2-outer-trial', act: 2, goal: '完成外门功课并建立首批同门关系', entry: '开始外门弟子生活',
    requiredFacts: [], optionalThreads: ['loop:tournament-rival'], dangerClock: { id: 'trialDeadline', limit: 5 },
    pace: { gentle: 2, firm: 5, decisive: 8 },
    exits: [{ progressId: 'chapter:act2-outer-trial:complete', nextChapterId: 'act2-forest-signs' }]
  },
  {
    id: 'act2-forest-signs', act: 2, goal: '查明后山异动并决定是否告知宗门', entry: '后山出现不属于同门的足迹',
    requiredFacts: ['fact:forest-footprints'], optionalThreads: ['loop:demonic-trail'], dangerClock: { id: 'demonicTrail', limit: 6 },
    pace: { gentle: 2, firm: 5, decisive: 8 },
    exits: [{ progressId: 'chapter:act2-forest-signs:complete', nextChapterId: 'act2-sect-undercurrent' }]
  },
  {
    id: 'act2-sect-undercurrent', act: 2, goal: '找出失踪弟子与残缺玉简的联系', entry: '戒律堂开始封锁消息',
    requiredFacts: [], optionalThreads: ['loop:jaded-letter', 'loop:sect-spy'], dangerClock: { id: 'sectSuspicion', limit: 6 },
    pace: { gentle: 2, firm: 5, decisive: 8 },
    exits: [{ progressId: 'chapter:act2-sect-undercurrent:complete', nextChapterId: 'act2-tournament' }]
  },
  {
    id: 'act2-tournament', act: 2, goal: '在宗门大比中赢得进入青岚秘境的资格', entry: '宗门大比开场',
    requiredFacts: [], optionalThreads: ['loop:rival-respect'], dangerClock: { id: 'tournamentRounds', limit: 5 },
    pace: { gentle: 2, firm: 5, decisive: 8 },
    exits: [{ progressId: 'chapter:act2-tournament:complete', nextChapterId: 'act3-mystic-entry' }]
  },
  {
    id: 'act3-mystic-entry', act: 3, goal: '进入青岚秘境并与失散同门汇合', entry: '秘境入口开启',
    requiredFacts: [], optionalThreads: ['loop:missing-team'], dangerClock: { id: 'gateCollapse', limit: 5 },
    pace: { gentle: 2, firm: 5, decisive: 8 },
    exits: [{ progressId: 'chapter:act3-mystic-entry:complete', nextChapterId: 'act3-fog-alliance' }]
  },
  {
    id: 'act3-fog-alliance', act: 3, goal: '在青雾中选择盟友并确认各自目的', entry: '队伍被迷雾拆散',
    requiredFacts: [], optionalThreads: ['loop:masked-scout'], dangerClock: { id: 'fogCorruption', limit: 6 },
    pace: { gentle: 2, firm: 5, decisive: 8 },
    exits: [{ progressId: 'chapter:act3-fog-alliance:complete', nextChapterId: 'act3-stone-truth' }]
  },
  {
    id: 'act3-stone-truth', act: 3, goal: '解读无名石碑并辨认被删去的名字', entry: '发现秘境深处的残碑',
    requiredFacts: [], optionalThreads: ['loop:founder-name'], dangerClock: { id: 'ruinAwakening', limit: 5 },
    pace: { gentle: 2, firm: 5, decisive: 8 },
    exits: [{ progressId: 'chapter:act3-stone-truth:complete', nextChapterId: 'act3-core-choice' }]
  },
  {
    id: 'act3-core-choice', act: 3, goal: '处理遗境核心并带着代价离开秘境', entry: '抵达遗境之心',
    requiredFacts: [], optionalThreads: ['loop:core-price'], dangerClock: { id: 'realmCollapse', limit: 4 },
    pace: { gentle: 1, firm: 3, decisive: 5 },
    exits: [{ progressId: 'chapter:act3-core-choice:complete', nextChapterId: 'act4-north-arrival' }]
  },
  {
    id: 'act4-north-arrival', act: 4, goal: '抵达北境并守住第一轮攻势', entry: '北境烽书抵达',
    requiredFacts: [], optionalThreads: ['loop:border-casualties'], dangerClock: { id: 'passDefense', limit: 7 },
    pace: { gentle: 2, firm: 5, decisive: 8 },
    exits: [{ progressId: 'chapter:act4-north-arrival:complete', nextChapterId: 'act4-prisoner-truth' }]
  },
  {
    id: 'act4-prisoner-truth', act: 4, goal: '查明魔道俘虏主动投降的原因', entry: '无名俘虏要求单独见面',
    requiredFacts: [], optionalThreads: ['loop:prisoner-name'], dangerClock: { id: 'executionDeadline', limit: 4 },
    pace: { gentle: 1, firm: 3, decisive: 5 },
    exits: [{ progressId: 'chapter:act4-prisoner-truth:complete', nextChapterId: 'act4-rift-descent' }]
  },
  {
    id: 'act4-rift-descent', act: 4, goal: '深入幽冥裂隙并揭开仙魔旧约', entry: '裂隙通道短暂稳定',
    requiredFacts: [], optionalThreads: ['loop:ancient-pact'], dangerClock: { id: 'riftTaint', limit: 7 },
    pace: { gentle: 2, firm: 5, decisive: 8 },
    exits: [{ progressId: 'chapter:act4-rift-descent:complete', nextChapterId: 'act4-sect-reckoning' }]
  },
  {
    id: 'act4-sect-reckoning', act: 4, goal: '在宗门存亡与被掩盖的真相之间作出抉择', entry: '回到落霞宗接受问罪',
    requiredFacts: [], optionalThreads: ['loop:sect-truth'], dangerClock: { id: 'sectSchism', limit: 5 },
    pace: { gentle: 2, firm: 5, decisive: 8 },
    exits: [{ progressId: 'chapter:act4-sect-reckoning:complete', nextChapterId: 'act5-star-reflection' }]
  },
  {
    id: 'act5-star-reflection', act: 5, goal: '在天机台重见此生最重要的三段因果', entry: '白昼星现',
    requiredFacts: [], optionalThreads: ['loop:unpaid-debt'], dangerClock: { id: 'fateFracture', limit: 6 },
    pace: { gentle: 2, firm: 5, decisive: 8 },
    exits: [{ progressId: 'chapter:act5-star-reflection:complete', nextChapterId: 'act5-old-promises' }]
  },
  {
    id: 'act5-old-promises', act: 5, goal: '在渡劫前兑现或放下仍未完成的承诺', entry: '旧人陆续来到天机台',
    requiredFacts: [], optionalThreads: ['loop:last-meal', 'loop:broken-promise'], dangerClock: { id: 'tribulationApproach', limit: 5 },
    pace: { gentle: 2, firm: 5, decisive: 8 },
    exits: [{ progressId: 'chapter:act5-old-promises:complete', nextChapterId: 'act5-heart-mirror' }]
  },
  {
    id: 'act5-heart-mirror', act: 5, goal: '面对心魔并承认自己真正的执念', entry: '心镜映出另一种人生',
    requiredFacts: [], optionalThreads: ['loop:heart-name'], dangerClock: { id: 'heartErosion', limit: 5 },
    pace: { gentle: 2, firm: 5, decisive: 8 },
    exits: [{ progressId: 'chapter:act5-heart-mirror:complete', nextChapterId: 'act5-tribulation' }]
  },
  {
    id: 'act5-tribulation', act: 5, goal: '渡过九重雷劫并亲手选择此生结局', entry: '登上飞升台',
    requiredFacts: [], optionalThreads: ['loop:final-choice'], dangerClock: { id: 'tribulation', limit: 9 },
    pace: { gentle: 2, firm: 5, decisive: 8 }, exits: []
  }
];

export const STORY_SCENES = {
  awakening: { act: 1, title: '尘缘初醒', location: '赵府柴房' },
  'broken-door': { act: 1, title: '柴门之外', location: '赵府柴房' },
  'xiaoman-rescue': { act: 1, title: '雨巷相救', location: '青石镇' },
  'elder-test': { act: 1, title: '一口桃花酿', location: '青石镇' },
  'outer-arrival': { act: 1, title: '九百石阶', location: '落霞宗外门' },
  'outer-days': { act: 2, title: '外门烟火', location: '落霞宗外门' },
  'cherry-night': { act: 2, title: '樱林夜话', location: '后山樱林' },
  'tournament': { act: 2, title: '宗门大比', location: '落霞宗外门' },
  'missing-trail': { act: 2, title: '无人的脚印', location: '后山樱林' },
  'jade-truth': { act: 2, title: '被抹去的字', location: '古剑冢' },
  'mystic-gate': { act: 3, title: '青岚门开', location: '青岚秘境' },
  'fog-team': { act: 3, title: '雾中同路', location: '青岚秘境' },
  'ancient-tablet': { act: 3, title: '无名石碑', location: '青岚秘境' },
  'core-choice': { act: 3, title: '遗境之心', location: '青岚秘境' },
  'north-arrival': { act: 4, title: '风雪天关', location: '北境天关' },
  'two-paths': { act: 4, title: '仙魔两面', location: '北境天关' },
  'rift-bottom': { act: 4, title: '幽冥无日', location: '幽冥裂隙' },
  'sect-reckoning': { act: 4, title: '山门问罪', location: '落霞宗外门' },
  'star-reflection': { act: 5, title: '天机照影', location: '天机台' },
  'heart-mirror': { act: 5, title: '心魔有名', location: '天机台' },
  'tribulation': { act: 5, title: '九重雷劫', location: '飞升台' },
  'final-choice': { act: 5, title: '此生落笔', location: '飞升台' }
};

export const RANDOM_EVENTS = [
  { id: 'lost-pouch', locations: ['青石镇', '百宝坊市'], text: '你在石缝里发现一个绣着云纹的钱袋。', effect: { gold: 12 } },
  { id: 'hungry-child', locations: ['青石镇'], text: '一个饿得发抖的孩子盯着你手里的饭团。', effect: { mercy: 1 } },
  { id: 'rain-meditation', locations: ['落霞宗外门'], text: '一场灵雨洗过山门，你忽然听懂了雨落石阶的节奏。', effect: { qi: 18 } },
  { id: 'broom-sword', locations: ['落霞宗外门'], text: '扫地弟子用竹帚比了一个剑势，竟让你心头一震。', effect: { qi: 16 } },
  { id: 'cherry-letter', locations: ['后山樱林'], text: '花瓣托着一行无人署名的小字：莫忘来路。', effect: { qi: 12 } },
  { id: 'sleeping-fox', locations: ['后山樱林'], text: '一只灵狐枕着你的衣角睡着了，怎么也不肯挪窝。', effect: { mercy: 1 } },
  { id: 'elder-snore', locations: ['后山樱林'], text: '李老的呼噜震落满树花瓣，其中一瓣竟蕴着剑意。', effect: { qi: 25 } },
  { id: 'fake-pill', locations: ['百宝坊市'], text: '摊主把糖豆吹成九转仙丹，被钱多多当场拆穿。', effect: { gold: 8 } },
  { id: 'auction-map', locations: ['百宝坊市'], text: '一张破地图无人问津，上面却标着剑冢暗门。', effect: { ambition: 1 } },
  { id: 'price-war', locations: ['百宝坊市'], text: '两家符箓铺突然斗价，你趁机买到便宜货。', effect: { gold: 15 } },
  { id: 'warm-cauldron', locations: ['丹霞谷'], text: '废弃丹炉仍有余温，炉底凝着一滴药露。', effect: { qi: 22 } },
  { id: 'herb-argument', locations: ['丹霞谷'], text: '两株灵草为了谁先开花吵得不可开交。', effect: { qi: 10 } },
  { id: 'small-explosion', locations: ['丹霞谷'], text: '隔壁丹房轰然一响，苏晚晴面无表情地递来扫帚。', effect: { mercy: 1 } },
  { id: 'nameless-sword', locations: ['古剑冢'], text: '一柄无名残剑跟了你三步，又悄悄插回土里。', effect: { qi: 28 } },
  { id: 'sword-rain', locations: ['古剑冢'], text: '万剑同时低鸣，像在为某个旧人送行。', effect: { qi: 30 } },
  { id: 'snow-blossom', locations: ['古剑冢'], text: '慕容雪挥剑削下一片石花，落地前便碎成霜。', effect: { ambition: 1 } },
  { id: 'fog-loop', locations: ['青岚秘境'], text: '你第三次路过同一块会骂人的石头，它终于肯指路。', effect: { qi: 35 } },
  { id: 'ancient-lunch', locations: ['青岚秘境'], text: '千年前的食盒完好如初，你明智地没有打开。', effect: { mercy: 1 } },
  { id: 'mirror-pool', locations: ['青岚秘境'], text: '池水映出的不是脸，而是你最想成为的人。', effect: { ambition: 1 } },
  { id: 'rescued-rival', locations: ['青岚秘境'], text: '昔日对手坠在断崖边，只剩一只手抓着石沿。', effect: { mercy: 2 } },
  { id: 'border-song', locations: ['北境天关'], text: '守关弟子唱起故乡小调，风雪似乎也慢了半拍。', effect: { mercy: 1 } },
  { id: 'demon-truce', locations: ['北境天关'], text: '对岸魔修举起白旗，只为交换双方阵亡者的遗物。', effect: { mercy: 1, demonic: 1 } },
  { id: 'frozen-letter', locations: ['北境天关'], text: '雪下埋着一封未寄出的家书，墨迹还很新。', effect: { mercy: 1 } },
  { id: 'black-lotus', locations: ['幽冥裂隙'], text: '黑莲在脚边开放，花蕊中传来你的声音。', effect: { demonic: 1 } },
  { id: 'old-chain', locations: ['幽冥裂隙'], text: '锈链上刻着落霞宗初代祖师的名字。', effect: { qi: 48 } },
  { id: 'shadow-bargain', locations: ['幽冥裂隙'], text: '影子提出替你承担一次伤痛，代价是记住它。', effect: { demonic: 1 } },
  { id: 'falling-star', locations: ['天机台'], text: '一颗星从命盘滑落，却在掌心化作温热微光。', effect: { qi: 60 } },
  { id: 'possible-self', locations: ['天机台'], text: '你看见另一个自己走上了完全不同的路。', effect: { ambition: 1 } },
  { id: 'last-petal', locations: ['飞升台'], text: '逆风而来的樱瓣停在眉心，像故人轻轻一点。', effect: { mercy: 1 } },
  { id: 'silent-thunder', locations: ['飞升台'], text: '雷云无声翻涌，天地在等你先开口。', effect: { qi: 80 } }
];

export const ENEMIES = {
  'spirit-rat': { name: '偷粮灵鼠', realm: 0, hp: 28, attack: 6, defense: 1, qi: 18, gold: 5 },
  'zhao-guard': { name: '赵府恶仆', realm: 0, hp: 42, attack: 8, defense: 2, qi: 24, gold: 9 },
  'mountain-wolf': { name: '青背山狼', realm: 1, hp: 58, attack: 11, defense: 3, qi: 34, gold: 7 },
  'rogue-cultivator': { name: '劫道散修', realm: 2, hp: 76, attack: 15, defense: 5, qi: 46, gold: 24 },
  'wood-puppet': { name: '试炼木傀', realm: 3, hp: 92, attack: 17, defense: 8, qi: 58, gold: 0 },
  'poison-bee': { name: '赤尾毒蜂', realm: 4, hp: 68, attack: 23, defense: 4, qi: 64, gold: 8 },
  'sword-spirit': { name: '残剑之灵', realm: 6, hp: 130, attack: 30, defense: 12, qi: 96, gold: 0 },
  'inner-rival': { name: '内门骄子', realm: 7, hp: 150, attack: 34, defense: 14, qi: 110, gold: 30 },
  'fog-beast': { name: '青岚雾兽', realm: 9, hp: 210, attack: 42, defense: 18, qi: 150, gold: 40 },
  'stone-keeper': { name: '遗迹石将', realm: 10, hp: 270, attack: 48, defense: 24, qi: 190, gold: 0 },
  'mirror-self': { name: '镜中之我', realm: 12, hp: 330, attack: 58, defense: 28, qi: 230, gold: 0 },
  'mystic-devourer': { name: '噬境古兽', realm: 13, hp: 410, attack: 66, defense: 34, qi: 280, gold: 80 },
  'demon-scout': { name: '魔道斥候', realm: 14, hp: 470, attack: 74, defense: 38, qi: 330, gold: 65 },
  'snow-ogre': { name: '踏雪巨魔', realm: 15, hp: 560, attack: 82, defense: 44, qi: 390, gold: 70 },
  'rift-wraith': { name: '裂隙怨魂', realm: 16, hp: 620, attack: 92, defense: 48, qi: 450, gold: 0 },
  'fallen-elder': { name: '堕化长老', realm: 18, hp: 760, attack: 108, defense: 58, qi: 580, gold: 120 },
  'heart-demon': { name: '本我心魔', realm: 20, hp: 920, attack: 126, defense: 68, qi: 720, gold: 0 },
  'heaven-avatar': { name: '天道化身', realm: 22, hp: 1280, attack: 150, defense: 82, qi: 1000, gold: 0 }
};

export const ACHIEVEMENTS = {
  'first-step': { title: '一步出柴门', description: '离开赵府，第一次亲手选择命运。' },
  'sect-disciple': { title: '云上有门', description: '成为落霞宗弟子。' },
  'first-blood': { title: '初战告捷', description: '赢得第一场战斗。' },
  'punching-up': { title: '越境而战', description: '击败境界高于自己的敌人。' },
  'pill-maker': { title: '炉火初红', description: '成功炼出第一炉丹药。' },
  'ten-friends': { title: '此道不孤', description: '与四位角色建立深厚关系。' },
  'merciful': { title: '剑下留人', description: '在五次关键选择中选择宽恕。' },
  'demon-road': { title: '黑莲照夜', description: '让魔道倾向达到八点。' },
  'collector': { title: '袖中乾坤', description: '图鉴收录二十件物品。' },
  'realm-master': { title: '一日千里', description: '抵达金丹期。' },
  'truth-seeker': { title: '不信碑文', description: '揭开落霞宗被抹去的历史。' },
  'all-endings': { title: '万线皆我', description: '解锁全部五个结局。' }
};

export const ENDINGS = {
  ascension: { title: '一剑开天', description: '斩开九重云海，带着此世因果飞升。' },
  guardian: { title: '人间有樱', description: '放下飞升机缘，留下守护仍需你的人间。' },
  wanderer: { title: '山海同游', description: '携故人离开仙魔争端，把余生交给万里山河。' },
  demonic: { title: '黑日新主', description: '拥抱裂隙之力，亲手重写仙魔秩序。' },
  fallen: { title: '花落无声', description: '道途止于此处，但后来人仍会讲述你的名字。' }
};
