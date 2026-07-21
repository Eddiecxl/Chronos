import React, { useEffect, useMemo, useRef, useState } from 'react';
import './game.css';

const STORAGE_KEY = 'chronos-rift-best-v1';
const WORLD = { width: 2680, height: 720, gravity: 0.76 };
const PLAYER = { width: 38, height: 58, speed: 5.35, jump: 15.1, dash: 16.2 };
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const intersects = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
const centerOf = (rect) => ({ x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 });

const basePlatforms = [
  { x: -80, y: 640, w: 660, h: 80, type: 'stone' },
  { x: 690, y: 575, w: 250, h: 30, type: 'glass' },
  { x: 1070, y: 510, w: 220, h: 30, type: 'glass' },
  { x: 1420, y: 590, w: 260, h: 30, type: 'glass' },
  { x: 1815, y: 535, w: 240, h: 30, type: 'glass' },
  { x: 2180, y: 640, w: 560, h: 80, type: 'stone' },
  { x: 320, y: 500, w: 150, h: 24, type: 'thin' },
  { x: 1285, y: 385, w: 180, h: 24, type: 'thin' },
  { x: 1995, y: 390, w: 155, h: 24, type: 'thin' }
];

const baseShards = [
  { id: 's1', x: 275, y: 555 }, { id: 's2', x: 380, y: 455 }, { id: 's3', x: 760, y: 520 },
  { id: 's4', x: 1135, y: 455 }, { id: 's5', x: 1350, y: 335 }, { id: 's6', x: 1490, y: 535 },
  { id: 's7', x: 1880, y: 480 }, { id: 's8', x: 2050, y: 340 }, { id: 's9', x: 2320, y: 585 }
];

const baseHazards = [
  { x: 610, y: 608, w: 58, h: 32 }, { x: 980, y: 655, w: 72, h: 34 },
  { x: 1695, y: 656, w: 74, h: 34 }, { x: 2102, y: 608, w: 58, h: 32 }
];

const mission = {
  spawn: { x: 74, y: 548 },
  key: { x: 1168, y: 456, w: 36, h: 36 },
  switch: { x: 2290, y: 604, w: 86, h: 16 },
  door: { x: 2470, y: 498, w: 34, h: 142 },
  gate: { x: 2574, y: 532, w: 64, h: 108 },
  portalA: { x: 515, y: 444, w: 54, h: 100, target: { x: 1286, y: 314 } },
  portalB: { x: 1988, y: 284, w: 54, h: 100, target: { x: 2220, y: 548 } }
};

const initialRun = () => ({
  player: { x: mission.spawn.x, y: mission.spawn.y, vx: 0, vy: 0, facing: 1, grounded: false, jumps: 0, dashing: 0, invuln: 0, runCycle: 0, tilt: 0, landed: 0 },
  shards: baseShards,
  keyTaken: false,
  doorOpen: false,
  won: false,
  failed: false,
  score: 0,
  time: 0,
  slow: 100,
  slowActive: false,
  portalCooldown: 0,
  message: 'Mission 01: recover the Chrono Key, unlock the gate, and escape the rift.'
});

function useControls() {
  const keys = useRef({ left: false, right: false, jump: false, dash: false, ability: false, interact: false });
  useEffect(() => {
    const setKey = (event, value) => {
      const key = event.key.toLowerCase();
      if (['arrowleft', 'a'].includes(key)) keys.current.left = value;
      if (['arrowright', 'd'].includes(key)) keys.current.right = value;
      if ([' ', 'w', 'arrowup'].includes(key)) { keys.current.jump = value; event.preventDefault(); }
      if (['shift'].includes(key)) keys.current.dash = value;
      if (['q'].includes(key)) keys.current.ability = value;
      if (['e'].includes(key)) keys.current.interact = value;
    };
    const down = (event) => setKey(event, true);
    const up = (event) => setKey(event, false);
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, []);
  const press = (name, value) => { keys.current[name] = value; };
  return { keys, press };
}

export default function ChronosRiftGame({ username = 'Runner' }) {
  const { keys, press } = useControls();
  const stageRef = useRef(null);
  const runRef = useRef(initialRun());
  const jumpLatch = useRef(false);
  const dashLatch = useRef(false);
  const [, forceFrame] = useState(0);
  const [viewSize, setViewSize] = useState({ width: 1100, height: 640 });
  const [status, setStatus] = useState('boot');
  const [best, setBest] = useState(() => Number(localStorage.getItem(STORAGE_KEY) || 0));
  const [camera, setCamera] = useState(0);

  const decorations = useMemo(() => Array.from({ length: 26 }, (_, index) => ({
    id: index,
    x: 110 + index * 112 + (index % 4) * 17,
    y: 72 + (index * 53) % 270,
    size: 3 + (index % 5),
    delay: `${index * -0.37}s`
  })), []);

  useEffect(() => {
    const resize = () => setViewSize({
      width: stageRef.current?.clientWidth || window.innerWidth || 1100,
      height: stageRef.current?.clientHeight || Math.max(460, window.innerHeight - 180)
    });
    resize();
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, []);

  useEffect(() => {
    if (status !== 'boot') return undefined;
    const loadingTimer = window.setTimeout(() => setStatus('loading'), 1700);
    return () => window.clearTimeout(loadingTimer);
  }, [status]);

  useEffect(() => {
    if (status !== 'loading') return undefined;
    const menuTimer = window.setTimeout(() => setStatus('menu'), 2200);
    return () => window.clearTimeout(menuTimer);
  }, [status]);

  const reset = () => {
    runRef.current = initialRun();
    setStatus('playing');
    setCamera(0);
    forceFrame((tick) => tick + 1);
  };

  useEffect(() => {
    if (status !== 'playing') return undefined;
    let raf = 0;
    let last = performance.now();
    const loop = (now) => {
      const delta = clamp((now - last) / 16.67, 0.45, 1.5);
      last = now;
      const run = runRef.current;
      const p = run.player;
      const wasGrounded = p.grounded;
      const control = keys.current;
      const slowFactor = run.slowActive && run.slow > 0 ? 0.48 : 1;
      run.time += delta * 16.67;
      run.portalCooldown = Math.max(0, run.portalCooldown - delta);
      p.invuln = Math.max(0, p.invuln - delta);
      if (run.slowActive) run.slow = Math.max(0, run.slow - 0.62 * delta);
      else run.slow = Math.min(100, run.slow + 0.16 * delta);
      run.slowActive = control.ability && run.slow > 2;

      const move = (control.right ? 1 : 0) - (control.left ? 1 : 0);
      if (move) p.facing = move;
      p.vx += (move * PLAYER.speed - p.vx) * (p.grounded ? 0.23 : 0.125);
      if (!move && p.grounded) p.vx *= 0.84;
      if (control.jump && !jumpLatch.current && p.jumps < 2) {
        p.vy = -PLAYER.jump * (p.jumps ? 0.86 : 1);
        p.grounded = false;
        p.jumps += 1;
      }
      jumpLatch.current = control.jump;
      if (control.dash && !dashLatch.current && p.dashing <= 0) {
        p.dashing = 9;
        p.vx = p.facing * PLAYER.dash;
        p.vy *= 0.42;
      }
      dashLatch.current = control.dash;
      if (p.dashing > 0) p.dashing -= delta;
      p.vy += WORLD.gravity * delta * slowFactor;
      p.runCycle += Math.abs(p.vx) * delta * (p.grounded ? 0.105 : 0.035);
      p.tilt += (clamp(p.vx * 2.15, -12, 12) - p.tilt) * 0.18;
      p.landed = Math.max(0, p.landed - delta);

      p.x += p.vx * delta * slowFactor;
      let playerBox = { x: p.x, y: p.y, w: PLAYER.width, h: PLAYER.height };
      const allPlatforms = [...basePlatforms];
      if (!run.doorOpen) allPlatforms.push({ ...mission.door, type: 'door' });
      for (const platform of allPlatforms) {
        if (!intersects(playerBox, { x: platform.x, y: platform.y, w: platform.w, h: platform.h })) continue;
        if (p.vx > 0) p.x = platform.x - PLAYER.width;
        if (p.vx < 0) p.x = platform.x + platform.w;
        p.vx = 0;
        playerBox = { x: p.x, y: p.y, w: PLAYER.width, h: PLAYER.height };
      }

      p.y += p.vy * delta * slowFactor;
      p.grounded = false;
      playerBox = { x: p.x, y: p.y, w: PLAYER.width, h: PLAYER.height };
      for (const platform of allPlatforms) {
        const box = { x: platform.x, y: platform.y, w: platform.w, h: platform.h };
        if (!intersects(playerBox, box)) continue;
        if (p.vy >= 0 && p.y + PLAYER.height - p.vy * delta * slowFactor <= platform.y + 12) {
          const landingVelocity = p.vy;
          p.y = platform.y - PLAYER.height;
          p.vy = 0;
          p.grounded = true;
          p.jumps = 0;
          if (!wasGrounded && Math.abs(landingVelocity) > 5) p.landed = 18;
        } else if (p.vy < 0) {
          p.y = platform.y + platform.h;
          p.vy = 0;
        }
        playerBox = { x: p.x, y: p.y, w: PLAYER.width, h: PLAYER.height };
      }

      p.x = clamp(p.x, 0, WORLD.width - PLAYER.width);
      if (p.y > WORLD.height + 80) {
        run.failed = true;
        run.message = 'The timeline collapsed. Rewind and try the route again.';
        setStatus('failed');
      }

      run.shards = run.shards.filter((shard) => {
        const hit = intersects(playerBox, { x: shard.x, y: shard.y, w: 28, h: 28 });
        if (hit) run.score += 125;
        return !hit;
      });
      if (!run.keyTaken && intersects(playerBox, mission.key)) {
        run.keyTaken = true;
        run.score += 500;
        run.message = 'Chrono Key acquired. Find the golden pressure switch.';
      }
      if (run.keyTaken && intersects(playerBox, { ...mission.switch, h: 26 })) {
        run.doorOpen = true;
        run.message = 'Gate lock dissolved. Sprint through the exit rift.';
      }
      for (const hazard of baseHazards) {
        if (!intersects(playerBox, hazard) || p.invuln > 0) continue;
        run.score = Math.max(0, run.score - 240);
        p.x = Math.max(40, p.x - 110 * p.facing);
        p.y -= 44;
        p.vx = -p.facing * 7;
        p.vy = -8;
        p.invuln = 60;
        run.message = 'Rift spike hit. Use slow-time before crossing unstable ground.';
      }
      for (const portal of [mission.portalA, mission.portalB]) {
        if (run.portalCooldown > 0 || !intersects(playerBox, portal)) continue;
        p.x = portal.target.x;
        p.y = portal.target.y;
        p.vx = p.facing * 5;
        p.vy = -4;
        run.portalCooldown = 42;
        run.score += 80;
        run.message = 'Portal jump complete. Watch your landing momentum.';
      }
      if (run.doorOpen && intersects(playerBox, mission.gate)) {
        run.won = true;
        const timeBonus = Math.max(0, 2400 - Math.floor(run.time / 100));
        run.score += timeBonus;
        const nextBest = Math.max(best, run.score);
        localStorage.setItem(STORAGE_KEY, String(nextBest));
        setBest(nextBest);
        setStatus('won');
      }
      const scale = Math.min(1, Math.max(0.58, viewSize.height / WORLD.height));
      const visibleWorldWidth = viewSize.width / scale;
      const nextCamera = clamp(p.x - visibleWorldWidth * 0.42, 0, Math.max(0, WORLD.width - visibleWorldWidth));
      setCamera(nextCamera);
      forceFrame((tick) => tick + 1);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [best, keys, status, viewSize.height, viewSize.width]);

  const run = runRef.current;
  const player = run.player;
  const elapsed = Math.floor(run.time / 1000);
  const portalNodes = [mission.portalA, mission.portalB];
  const worldScale = Math.min(1, Math.max(0.58, viewSize.height / WORLD.height));
  const playerSpeed = Math.min(1, Math.abs(player.vx) / PLAYER.speed);
  const cinematic = ['boot', 'loading', 'menu'].includes(status);

  return <main className={`rift-page ${cinematic ? 'has-cinematic' : ''}`}>
    <section className="rift-hero">
      <div>
        <span>CHRONOS ARCADE / MISSION 01</span>
        <h1>Chronos <em>Rift.</em></h1>
        <p>A premium puzzle-parkour prototype: move manually, bend time, use portals, recover the Chrono Key, and unlock the exit gate.</p>
      </div>
      <aside>
        <b>{username}</b>
        <span>Best score: {best.toLocaleString()}</span>
      </aside>
    </section>

    <section className={`rift-console is-${status} ${run.slowActive ? 'slow-time' : ''}`} ref={stageRef}>
      <div className="rift-hud">
        <article><span>SCORE</span><b>{run.score.toLocaleString()}</b></article>
        <article><span>TIME</span><b>{String(Math.floor(elapsed / 60)).padStart(2, '0')}:{String(elapsed % 60).padStart(2, '0')}</b></article>
        <article><span>SHARDS</span><b>{baseShards.length - run.shards.length}/{baseShards.length}</b></article>
        <article><span>SLOW-TIME</span><b>{Math.round(run.slow)}%</b></article>
      </div>

      <div className="rift-stage">
        <div className="rift-world" style={{ width: WORLD.width, height: WORLD.height, transform: `translate3d(${-camera * worldScale}px,0,0) scale(${worldScale})` }}>
          <div className="rift-backdrop">
            <i className="rift-moon"/>
            <i className="rift-planet"/>
            <i className="rift-city"/>
            {decorations.map((star) => <span key={star.id} style={{ left: star.x, top: star.y, width: star.size, height: star.size, animationDelay: star.delay }}/>)}
          </div>
          <div className="rift-parallax rift-rings"><i/><i/><i/></div>
          {basePlatforms.map((platform, index) => <div className={`rift-platform ${platform.type}`} style={{ left: platform.x, top: platform.y, width: platform.w, height: platform.h }} key={index}><i/></div>)}
          {!run.doorOpen && <div className="rift-door" style={{ left: mission.door.x, top: mission.door.y, width: mission.door.w, height: mission.door.h }}><i/><span>LOCKED</span></div>}
          <div className={`rift-switch ${run.doorOpen ? 'active' : ''}`} style={{ left: mission.switch.x, top: mission.switch.y, width: mission.switch.w, height: mission.switch.h }}><span/></div>
          {portalNodes.map((portal, index) => <div className={`rift-portal portal-${index + 1}`} style={{ left: portal.x, top: portal.y, width: portal.w, height: portal.h }} key={index}><i/><b/></div>)}
          {baseHazards.map((hazard, index) => <div className="rift-hazard" style={{ left: hazard.x, top: hazard.y, width: hazard.w, height: hazard.h }} key={index}>{Array.from({ length: 4 }, (_, spike) => <i key={spike}/>)}</div>)}
          {run.shards.map((shard) => <div className="rift-shard" style={{ left: shard.x, top: shard.y }} key={shard.id}><i/></div>)}
          {!run.keyTaken && <div className="rift-key" style={{ left: mission.key.x, top: mission.key.y }}><i/><b/></div>}
          <div className={`rift-gate ${run.doorOpen ? 'open' : ''}`} style={{ left: mission.gate.x, top: mission.gate.y, width: mission.gate.w, height: mission.gate.h }}><i/><span>EXIT</span></div>
          <div className={`rift-player ${player.grounded ? 'grounded' : 'airborne'} ${player.dashing > 0 ? 'dashing' : ''} ${player.invuln > 0 ? 'damaged' : ''} ${player.landed > 0 ? 'landed' : ''}`} style={{ left: player.x, top: player.y, width: PLAYER.width, height: PLAYER.height, '--facing': player.facing, '--tilt': `${player.tilt}deg`, '--run': player.runCycle, '--speed': playerSpeed }}>
            <i className="shadow"/><i className="cape"/><i className="arm arm-a"/><i className="arm arm-b"/><i className="head"/><i className="visor"/><i className="core"/><i className="leg leg-a"/><i className="leg leg-b"/><i className="dust"/>
          </div>
        </div>
      </div>

      <div className="rift-directive">
        <span>{run.doorOpen ? 'GATE ONLINE' : run.keyTaken ? 'STEP ON THE GOLD SWITCH' : 'FIND THE CHRONO KEY'}</span>
        <p>{run.message}</p>
      </div>

      {status !== 'playing' && <div className={`rift-overlay rift-${status}`}>
        {status === 'loading' ? <>
          <div className="rift-loading-scene"><i/><i/><b/></div>
          <span>LOADING THE FIRST TIMELINE</span>
          <h2>Forging the rift.</h2>
          <p>Synchronizing physics, portals, terrain, and Chronos combat telemetry.</p>
          <div className="rift-loadbar"><i/></div>
        </> : status === 'menu' ? <>
          <div className="rift-main-menu">
            <div className="rift-menu-brand"><div className="rift-orbit-logo"><i/><i/><b>C</b></div><span>CHRONOS RIFT</span><h2>The first fracture awaits.</h2><p>A cinematic puzzle-parkour mission built inside your Chronos world.</p></div>
            <div className="rift-menu-actions">
              <button onClick={reset}>Begin mission <span>→</span></button>
              <button onClick={() => { runRef.current = initialRun(); forceFrame((tick) => tick + 1); }}>Reset run</button>
              <button disabled>Mission 02 soon</button>
            </div>
            <aside><span>SAVE PROFILE</span><b>{username}</b><p>Best score {best.toLocaleString()}</p></aside>
          </div>
        </> : <>
          <div className="rift-orbit-logo"><i/><i/><b>C</b></div>
          <span>{status === 'boot' ? 'CHRONOS STUDIOS' : status === 'won' ? 'MISSION COMPLETE' : 'TIMELINE BROKEN'}</span>
          <h2>{status === 'boot' ? 'Chronos Rift' : status === 'won' ? 'Rift sealed beautifully.' : 'Rewind the run.'}</h2>
          <p>{status === 'boot' ? 'Time is opening.' : status === 'won' ? `Final score ${run.score.toLocaleString()}. Best ${best.toLocaleString()}.` : 'The rift punished your route. Try a slower, cleaner line.'}</p>
          {status !== 'boot' && <button className="gold-button" onClick={reset}>Restart mission <span>→</span></button>}
        </>}
      </div>}
    </section>

    <section className="rift-manual">
      <article><b>Keyboard</b><span>A/D or ←/→ move · Space jump · Shift dash · Q slow-time</span></article>
      <article><b>Mobile</b><span>Hold left/right, tap jump, dash, and slow-time. Built for phone/tablet screens.</span></article>
      <article><b>Objective</b><span>Collect shards, enter portals, take the key, press the switch, exit through the gate.</span></article>
    </section>

    <div className="rift-touch-controls" aria-label="Mobile game controls">
      <div>
        <button onPointerDown={() => press('left', true)} onPointerUp={() => press('left', false)} onPointerCancel={() => press('left', false)}>←</button>
        <button onPointerDown={() => press('right', true)} onPointerUp={() => press('right', false)} onPointerCancel={() => press('right', false)}>→</button>
      </div>
      <div>
        <button onPointerDown={() => press('ability', true)} onPointerUp={() => press('ability', false)} onPointerCancel={() => press('ability', false)}>SLOW</button>
        <button onPointerDown={() => press('dash', true)} onPointerUp={() => press('dash', false)} onPointerCancel={() => press('dash', false)}>DASH</button>
        <button className="jump" onPointerDown={() => press('jump', true)} onPointerUp={() => press('jump', false)} onPointerCancel={() => press('jump', false)}>JUMP</button>
      </div>
    </div>
  </main>;
}
