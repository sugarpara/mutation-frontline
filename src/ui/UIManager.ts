import { CharacterRole, GamePhase, Team, WeaponKind, type GameSettings, type WeaponRuntime } from '../game/types';
import type { Character } from '../game/Character';
import type { BombHUDState, BombRoundResult } from '../game/BombMode';

interface UIActions {
  start: () => void;
  resume: () => void;
  restart: () => void;
  toMenu: () => void;
  settingsChanged: (settings: GameSettings) => void;
}

export class UIManager {
  readonly settings: GameSettings = {
    sensitivity: 1,
    volume: 0.65,
    muzzleFlash: true,
    cameraShake: true,
    operator: 'Rook',
    map: 'quarantine',
    startingWeapon: WeaponKind.Rifle,
    mode: 'bio',
  };
  private actions: UIActions | null = null;
  private announcementTimer = 0;
  private hitTimer = 0;
  private damageTimer = 0;
  private debugTimer = 0;
  private readonly radarBlipElements = new Map<string, HTMLElement>();

  private readonly mainMenu = this.element<HTMLElement>('main-menu');
  private readonly hud = this.element<HTMLElement>('hud');
  private readonly pauseMenu = this.element<HTMLElement>('pause-menu');
  private readonly resultScreen = this.element<HTMLElement>('result-screen');
  private readonly announcementEl = this.element<HTMLElement>('announcement');
  private readonly hitMarker = this.element<HTMLElement>('hit-marker');
  private readonly damageIndicator = this.element<HTMLElement>('damage-indicator');
  private readonly debugNotice = this.element<HTMLElement>('debug-notice');

  constructor() {
    this.bindMenuTabs();
    this.bindSettings();
    this.bindOperators();
    this.bindMaps();
    this.bindArsenal();
    this.bindModes();
  }

  bindActions(actions: UIActions): void {
    this.actions = actions;
    this.element<HTMLButtonElement>('start-game').onclick = actions.start;
    this.element<HTMLButtonElement>('resume-game').onclick = actions.resume;
    this.element<HTMLButtonElement>('restart-game').onclick = actions.restart;
    this.element<HTMLButtonElement>('quit-to-menu').onclick = actions.toMenu;
    this.element<HTMLButtonElement>('result-to-menu').onclick = actions.toMenu;
  }

  update(delta: number): void {
    if (this.announcementTimer > 0) {
      this.announcementTimer -= delta;
      if (this.announcementTimer <= 0) this.announcementEl.classList.add('hidden');
    }
    if (this.hitTimer > 0) {
      this.hitTimer -= delta;
      if (this.hitTimer <= 0) this.hitMarker.className = 'hit-marker';
    }
    if (this.damageTimer > 0) {
      this.damageTimer -= delta;
      if (this.damageTimer <= 0) this.damageIndicator.classList.remove('active');
    }
    if (this.debugTimer > 0) {
      this.debugTimer -= delta;
      if (this.debugTimer <= 0) this.debugNotice.classList.add('hidden');
    }
  }

  showMenu(): void {
    this.mainMenu.classList.add('active');
    this.hud.classList.add('hidden');
    this.pauseMenu.classList.add('hidden');
    this.resultScreen.classList.add('hidden');
  }

  showHUD(): void {
    this.mainMenu.classList.remove('active');
    this.hud.classList.remove('hidden');
    this.pauseMenu.classList.add('hidden');
    this.resultScreen.classList.add('hidden');
  }

  showPause(): void {
    this.pauseMenu.classList.remove('hidden');
  }

  hidePause(): void {
    this.pauseMenu.classList.add('hidden');
  }

  showResult(humansWon: boolean, player: Character, remainingHumans: number, survivalSeconds: number): void {
    this.hud.classList.add('hidden');
    this.pauseMenu.classList.add('hidden');
    this.resultScreen.classList.remove('hidden');
    this.element<HTMLButtonElement>('restart-game').textContent = '重新开始';
    this.element('result-kicker').textContent = 'ROUND COMPLETE';
    this.element('result-title').textContent = humansWon ? '人类胜利' : '感染体胜利';
    this.element('result-title').style.color = humansWon ? '#64b8ff' : '#73ff8d';
    this.element('result-summary').textContent = humansWon
      ? `${remainingHumans} 名人类守住了当前封锁区。`
      : '封锁区人员已全部发生异变，净化协议启动。';
    this.element('result-stat-two-label').textContent = '击杀';
    this.element('result-stat-three-label').textContent = '感染';
    this.element('result-stat-four-label').textContent = '存活';
    this.element('result-kills').textContent = String(player.stats.kills);
    this.element('result-infections').textContent = String(player.stats.infections);
    const minutes = Math.floor(survivalSeconds / 60);
    const seconds = Math.floor(survivalSeconds % 60);
    this.element('result-survival').textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }

  showBombResult(result: BombRoundResult, player: Character, survivalSeconds: number): void {
    this.hud.classList.add('hidden');
    this.pauseMenu.classList.add('hidden');
    this.resultScreen.classList.remove('hidden');
    this.element('result-kicker').textContent = result.matchEnded ? 'BOMB MATCH COMPLETE' : `ROUND ${result.roundNumber} COMPLETE`;
    this.element('result-title').textContent = result.matchEnded
      ? result.playerWon ? '行动胜利' : '行动失败'
      : result.attackersWon ? '进攻方胜利' : '防守方胜利';
    this.element('result-title').style.color = result.playerWon ? '#ffbd6d' : '#65c7ff';
    this.element('result-summary').textContent = `${result.reason} 当前比分：我方 ${result.playerScore} : ${result.opponentScore} 对方。`;
    this.element('result-stat-two-label').textContent = '击杀';
    this.element('result-stat-three-label').textContent = '目标行动';
    this.element('result-stat-four-label').textContent = '存活';
    this.element('result-kills').textContent = String(player.stats.kills);
    this.element('result-infections').textContent = String(player.stats.plants + player.stats.defuses);
    const minutes = Math.floor(survivalSeconds / 60);
    const seconds = Math.floor(survivalSeconds % 60);
    this.element('result-survival').textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    this.element<HTMLButtonElement>('restart-game').textContent = result.matchEnded ? '重新开始' : '下一回合';
  }

  updateHUD(player: Character, weapon: WeaponRuntime | null, time: number, countdown: number, phase: GamePhase, humanCount: number, infectedCount: number, spread: number): void {
    this.element('health-value').textContent = String(Math.max(0, Math.ceil(player.health)));
    this.element('armor-value').textContent = String(Math.max(0, Math.ceil(player.armor)));
    this.element<HTMLElement>('health-bar').style.width = `${Math.max(0, (player.health / player.maxHealth) * 100)}%`;
    this.element<HTMLElement>('armor-bar').style.width = `${player.maxArmor ? Math.max(0, (player.armor / player.maxArmor) * 100) : 0}%`;
    const humanPips = '<i></i>'.repeat(Math.min(8, humanCount));
    const infectedPips = '<i></i>'.repeat(Math.min(8, infectedCount));
    this.element('team-counter').innerHTML = `<span class="human"><small>人类</small><strong>${humanCount.toString().padStart(2, '0')}</strong><em>${humanPips}</em></span><b>封锁阶段</b><span class="infected"><em>${infectedPips}</em><strong>${infectedCount.toString().padStart(2, '0')}</strong><small>感染体</small></span>`;
    const timer = phase === GamePhase.Countdown ? Math.max(0, countdown) : Math.max(0, time);
    const minutes = Math.floor(timer / 60);
    const seconds = Math.floor(timer % 60);
    this.element('round-timer').textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    this.element('round-phase-label').textContent = phase === GamePhase.Countdown ? '准备阶段' : '回合进行中';
    const objective = this.element('objective');
    objective.classList.remove('bomb-objective');
    objective.textContent = phase === GamePhase.Countdown ? '感染威胁 · 病毒筛查进行中' : player.team === Team.Human ? '感染威胁 · 坚持封锁' : '感染扩散 · 搜索剩余人类';
    objective.classList.toggle('infected-objective', player.team === Team.Infected);
    const roleNames: Record<CharacterRole, string> = {
      [CharacterRole.Human]: '人类行动员',
      [CharacterRole.Infected]: '感染体',
      [CharacterRole.AlphaInfected]: '初始感染体',
      [CharacterRole.Hero]: '最后英雄',
      [CharacterRole.Attacker]: '爆破进攻员',
      [CharacterRole.Defender]: '区域防守员',
    };
    const roleBadge = this.element<HTMLElement>('role-badge');
    roleBadge.textContent = roleNames[player.role];
    roleBadge.style.color = player.role === CharacterRole.Hero ? '#ffd45b' : player.team === Team.Human ? '#68b6ff' : '#73ff8d';
    this.hud.classList.toggle('infected-player', player.team === Team.Infected);
    this.hud.classList.remove('bomb-player');
    this.hud.classList.remove('bomb-defender');
    this.element('combat-status-label').textContent = player.team === Team.Human ? '战术链路稳定' : player.role === CharacterRole.AlphaInfected ? '母体脉冲活跃' : '异变感知活跃';
    if (weapon) {
      this.element('weapon-name').textContent = weapon.definition.name;
      const melee = weapon.definition.kind === WeaponKind.Knife || weapon.definition.kind === WeaponKind.Claws;
      this.element('mag-ammo').textContent = melee ? '∞' : String(weapon.ammo);
      this.element('reserve-ammo').textContent = melee ? '近战' : String(weapon.reserve);
      this.element('reload-status').textContent = weapon.reloadRemaining > 0 ? `换弹中 ${weapon.reloadRemaining.toFixed(1)}s` : '';
    }
    this.element<HTMLElement>('crosshair').style.setProperty('--spread', `${7 + spread * 24}px`);
  }

  updateBombHUD(player: Character, weapon: WeaponRuntime | null, time: number, countdown: number, phase: GamePhase, attackers: number, defenders: number, spread: number, bomb: BombHUDState): void {
    this.element('health-value').textContent = String(Math.max(0, Math.ceil(player.health)));
    this.element('armor-value').textContent = String(Math.max(0, Math.ceil(player.armor)));
    this.element<HTMLElement>('health-bar').style.width = `${Math.max(0, (player.health / player.maxHealth) * 100)}%`;
    this.element<HTMLElement>('armor-bar').style.width = `${player.maxArmor ? Math.max(0, (player.armor / player.maxArmor) * 100) : 0}%`;
    const attackerPips = '<i></i>'.repeat(Math.min(4, attackers));
    const defenderPips = '<i></i>'.repeat(Math.min(4, defenders));
    this.element('team-counter').innerHTML = `<span class="attackers"><small>进攻方</small><strong>${attackers.toString().padStart(2, '0')}</strong><em>${attackerPips}</em></span><b>第 ${bomb.roundNumber} 回合 · ${bomb.attackerScore}:${bomb.defenderScore}</b><span class="defenders"><em>${defenderPips}</em><strong>${defenders.toString().padStart(2, '0')}</strong><small>防守方</small></span>`;
    const timer = phase === GamePhase.Countdown ? Math.max(0, countdown) : bomb.planted ? bomb.fuseRemaining : Math.max(0, time);
    const minutes = Math.floor(timer / 60);
    const seconds = Math.floor(timer % 60);
    this.element('round-timer').textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    this.element('round-phase-label').textContent = phase === GamePhase.Countdown ? '准备阶段' : bomb.planted ? `爆破倒计时 · ${bomb.site}区` : '回合进行中';
    const objective = this.element<HTMLElement>('objective');
    objective.textContent = phase === GamePhase.Countdown ? '爆破行动 · 等待部署' : bomb.objective;
    objective.classList.remove('infected-objective');
    objective.classList.add('bomb-objective');
    objective.style.setProperty('--interaction', `${Math.round(bomb.interactionProgress * 100)}%`);
    const roleBadge = this.element<HTMLElement>('role-badge');
    roleBadge.textContent = player.team === Team.Attackers ? '爆破进攻员' : '区域防守员';
    roleBadge.style.color = player.team === Team.Attackers ? '#ffb35b' : '#65c7ff';
    this.hud.classList.remove('infected-player');
    this.hud.classList.add('bomb-player');
    this.hud.classList.toggle('bomb-defender', player.team === Team.Defenders);
    this.element('combat-status-label').textContent = bomb.planted
      ? player.team === Team.Defenders ? '拆弹协议就绪 · E 交互' : '爆破核心脉冲活跃'
      : bomb.carried ? '爆破核心已携带 · E 安装' : player.team === Team.Defenders ? '目标区防御链路稳定' : '战术数据链稳定';
    if (weapon) {
      this.element('weapon-name').textContent = weapon.definition.name;
      const melee = weapon.definition.kind === WeaponKind.Knife;
      this.element('mag-ammo').textContent = melee ? '∞' : String(weapon.ammo);
      this.element('reserve-ammo').textContent = melee ? '近战' : String(weapon.reserve);
      this.element('reload-status').textContent = weapon.reloadRemaining > 0 ? `换弹中 ${weapon.reloadRemaining.toFixed(1)}s` : '';
    }
    this.element<HTMLElement>('crosshair').style.setProperty('--spread', `${7 + spread * 24}px`);
  }

  updateRadar(player: Character, characters: Character[], yaw: number): void {
    const range = 30;
    const forwardX = -Math.sin(yaw);
    const forwardZ = -Math.cos(yaw);
    const rightX = Math.cos(yaw);
    const rightZ = -Math.sin(yaw);
    const activeIds = new Set<string>();
    for (const character of characters) {
      if (character === player || !character.alive) continue;
      activeIds.add(character.id);
      let blip = this.radarBlipElements.get(character.id);
      if (!blip) {
        blip = document.createElement('i');
        this.element('radar-blips').append(blip);
        this.radarBlipElements.set(character.id, blip);
      }
      const dx = character.position.x - player.position.x;
      const dz = character.position.z - player.position.z;
      const localX = dx * rightX + dz * rightZ;
      const localForward = dx * forwardX + dz * forwardZ;
      const distance = Math.hypot(localX, localForward);
      const scale = distance > range ? range / distance : 1;
      const x = 50 + (localX * scale / range) * 43;
      const y = 50 - (localForward * scale / range) * 43;
      const bombMode = player.team === Team.Attackers || player.team === Team.Defenders;
      const enemyVisible = !bombMode || character.team === player.team || distance <= 10;
      const friendlyBlue = bombMode ? character.team === player.team : character.team === Team.Human;
      blip.className = `${friendlyBlue ? 'human' : 'infected'}${character.role === CharacterRole.AlphaInfected ? ' mother' : ''}${distance > range ? ' edge' : ''}${enemyVisible ? '' : ' hidden'}`;
      blip.style.left = `${x}%`;
      blip.style.top = `${y}%`;
    }
    for (const [id, blip] of this.radarBlipElements) {
      if (activeIds.has(id)) continue;
      blip.remove();
      this.radarBlipElements.delete(id);
    }
    const zoneNames: Record<GameSettings['map'], string> = {
      refinery: '沙脊炼化基地',
      harbor: '夜港货运站',
      quarantine: 'Q-17 地下隔离区',
    };
    this.element('radar-zone').textContent = zoneNames[this.settings.map];
  }

  setWeaponSlot(slot: number): void {
    document.querySelectorAll<HTMLElement>('.weapon-slots span').forEach((element) => {
      element.classList.toggle('active', element.dataset.slot === String(slot));
    });
  }

  announce(text: string, type: 'normal' | 'hero' | 'infection' = 'normal', duration = 2.4): void {
    this.announcementEl.textContent = text;
    this.announcementEl.className = `announcement ${type === 'normal' ? '' : type}`;
    this.announcementTimer = duration;
  }

  addFeed(text: string, infection = false): void {
    const feed = this.element('kill-feed');
    const item = document.createElement('div');
    item.className = `feed-item${infection ? ' infection' : ''}`;
    item.textContent = text;
    feed.prepend(item);
    while (feed.children.length > 5) feed.lastElementChild?.remove();
    window.setTimeout(() => item.remove(), 4800);
  }

  showHit(headshot: boolean): void {
    this.hitMarker.className = `hit-marker active${headshot ? ' headshot' : ''}`;
    this.hitTimer = 0.13;
  }

  showDamage(angle: number): void {
    this.damageIndicator.style.transform = `rotate(${angle}rad)`;
    this.damageIndicator.classList.add('active');
    this.damageTimer = 0.45;
  }

  flash(type: 'infection' | 'hero'): void {
    const flash = document.createElement('div');
    flash.className = `screen-flash ${type}`;
    document.body.append(flash);
    window.setTimeout(() => flash.remove(), 760);
  }

  showDebugNotice(text: string): void {
    if (!import.meta.env.DEV) return;
    this.debugNotice.textContent = `[DEV] ${text}`;
    this.debugNotice.classList.remove('hidden');
    this.debugTimer = 2.4;
  }

  finishLoading(): void {
    const loading = this.element('loading-screen');
    loading.classList.add('done');
    window.setTimeout(() => loading.remove(), 600);
  }

  private bindMenuTabs(): void {
    document.querySelectorAll<HTMLButtonElement>('.tab-button').forEach((button) => {
      button.addEventListener('click', () => {
        document.querySelectorAll('.tab-button').forEach((item) => item.classList.remove('active'));
        document.querySelectorAll('.tab-panel').forEach((item) => item.classList.remove('active'));
        button.classList.add('active');
        document.querySelector(`[data-panel="${button.dataset.tab}"]`)?.classList.add('active');
        this.mainMenu.classList.toggle('arsenal-mode', button.dataset.tab === 'arsenal');
      });
    });
  }

  private bindSettings(): void {
    const sensitivity = this.element<HTMLInputElement>('sensitivity');
    const volume = this.element<HTMLInputElement>('volume');
    const muzzle = this.element<HTMLInputElement>('muzzle-flash-setting');
    const shake = this.element<HTMLInputElement>('camera-shake-setting');
    const emit = () => {
      this.settings.sensitivity = Number(sensitivity.value);
      this.settings.volume = Number(volume.value);
      this.settings.muzzleFlash = muzzle.checked;
      this.settings.cameraShake = shake.checked;
      this.element('sensitivity-value').textContent = this.settings.sensitivity.toFixed(2);
      this.element('volume-value').textContent = `${Math.round(this.settings.volume * 100)}%`;
      this.element('pause-settings').querySelector('span')!.textContent = `${Math.round(this.settings.volume * 100)}%`;
      this.actions?.settingsChanged(this.settings);
    };
    sensitivity.addEventListener('input', emit);
    volume.addEventListener('input', emit);
    muzzle.addEventListener('change', emit);
    shake.addEventListener('change', emit);
    this.element('pause-settings').addEventListener('click', () => {
      const next = (Number(volume.value) + 0.25) % 1.25;
      volume.value = String(Math.min(1, next));
      emit();
    });
  }

  private bindOperators(): void {
    document.querySelectorAll<HTMLButtonElement>('.operator').forEach((button) => {
      button.addEventListener('click', () => {
        document.querySelectorAll('.operator').forEach((item) => item.classList.remove('selected'));
        button.classList.add('selected');
        this.settings.operator = button.dataset.operator as GameSettings['operator'];
        this.actions?.settingsChanged(this.settings);
      });
    });
  }

  private bindMaps(): void {
    const mapCopy = {
      refinery: ['沙脊炼化基地', '夕照炼油设施，管桥、高台、仓库和低位管廊形成四路交叉。'],
      harbor: ['夜港货运站', '潮湿夜港，中央仓楼、集装箱巷道、起重机平台与下穿通道。'],
      quarantine: ['Q-17 地下隔离区', '废弃地铁轴线连接培养舱、检疫实验室、坍塌区与排水回路。'],
    } as const;
    document.querySelectorAll<HTMLButtonElement>('.map-option').forEach((button) => {
      button.addEventListener('click', () => {
        const map = button.dataset.map as GameSettings['map'];
        this.settings.map = map;
        document.querySelectorAll('.map-option').forEach((item) => item.classList.toggle('selected', item === button));
        this.element('mission-map-name').textContent = mapCopy[map][0];
        this.element('mission-map-desc').textContent = mapCopy[map][1];
        this.actions?.settingsChanged(this.settings);
      });
    });
  }

  private bindModes(): void {
    document.querySelectorAll<HTMLButtonElement>('.mode-card[data-mode]').forEach((button) => {
      button.addEventListener('click', () => {
        this.settings.mode = button.dataset.mode as GameSettings['mode'];
        document.querySelectorAll('.mode-card[data-mode]').forEach((item) => item.classList.toggle('selected', item === button));
        const bomb = this.settings.mode === 'bomb';
        this.element('mission-mode-value').textContent = bomb ? '战术爆破' : '生化感染';
        this.element('mission-size-value').textContent = bomb ? '4 进攻 + 4 防守' : '1 玩家 + 7 AI';
        this.element('mission-time-value').textContent = bomb ? '02:30' : '03:00';
        this.element<HTMLButtonElement>('start-game').textContent = bomb ? '部署爆破行动' : '部署行动';
        this.actions?.settingsChanged(this.settings);
      });
    });
  }

  private bindArsenal(): void {
    const weapons = {
      rifle: { kind: WeaponKind.Rifle, name: '炎龙·原型', type: '突击步枪', description: '分层合金机匣与余烬能量脊构成的原创近未来制式步枪。', stats: [68, 78, 84, 70] },
      pistol: { kind: WeaponKind.Pistol, name: 'P9 微光', type: '半自动手枪', description: '紧凑可靠的精确副武器，适合移动射击与紧急切换。', stats: [42, 86, 48, 92] },
      knife: { kind: WeaponKind.Knife, name: 'V3 高频刃', type: '近战武器', description: '无弹药消耗的短距高伤害近战装备。', stats: [88, 100, 34, 96] },
    } as const;
    const selectWeapon = (id: keyof typeof weapons) => {
      const weapon = weapons[id];
      document.querySelectorAll('.arsenal-item').forEach((item) => item.classList.toggle('selected', (item as HTMLElement).dataset.weapon === id));
      this.element('arsenal-preview').dataset.weapon = id;
      this.element('arsenal-name').textContent = weapon.name;
      this.element('arsenal-type').textContent = weapon.type;
      this.element('arsenal-description').textContent = weapon.description;
      ['damage', 'accuracy', 'rate', 'mobility'].forEach((stat, index) => {
        this.element(`arsenal-${stat}-bar`).style.width = `${weapon.stats[index]}%`;
        this.element(`arsenal-${stat}-value`).textContent = String(weapon.stats[index]);
      });
      const equip = this.element<HTMLButtonElement>('arsenal-equip');
      equip.dataset.weapon = id;
      equip.textContent = this.settings.startingWeapon === weapon.kind ? '已装备' : '装备';
    };
    document.querySelectorAll<HTMLButtonElement>('.arsenal-item').forEach((button) => {
      button.addEventListener('click', () => selectWeapon(button.dataset.weapon as keyof typeof weapons));
    });
    document.querySelectorAll<HTMLButtonElement>('.arsenal-category').forEach((button) => {
      button.addEventListener('click', () => {
        document.querySelectorAll('.arsenal-category').forEach((item) => item.classList.toggle('active', item === button));
        document.querySelectorAll<HTMLElement>('.arsenal-item').forEach((item) => item.classList.toggle('filtered', item.dataset.category !== button.dataset.category));
        const first = document.querySelector<HTMLElement>(`.arsenal-item[data-category="${button.dataset.category}"]`);
        if (first) selectWeapon(first.dataset.weapon as keyof typeof weapons);
      });
    });
    this.element<HTMLButtonElement>('arsenal-equip').addEventListener('click', (event) => {
      const id = (event.currentTarget as HTMLButtonElement).dataset.weapon as keyof typeof weapons;
      this.settings.startingWeapon = weapons[id].kind;
      this.actions?.settingsChanged(this.settings);
      selectWeapon(id);
    });
    selectWeapon('rifle');
  }

  private element<T extends HTMLElement = HTMLElement>(id: string): T {
    const element = document.getElementById(id);
    if (!element) throw new Error(`Missing UI element #${id}`);
    return element as T;
  }
}
