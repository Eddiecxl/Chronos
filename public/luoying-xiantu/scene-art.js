const NS = 'http://www.w3.org/2000/svg';
function shape(tag, attrs = {}, children = []) {
  const element = document.createElementNS(NS, tag);
  for (const [key, value] of Object.entries(attrs)) element.setAttribute(key, value);
  element.append(...children);
  return element;
}
const path = (d, fill, extra = {}) => shape('path', { d, fill, ...extra });

export function createHeroArt(className = 'hero-art') {
  const svg = shape('svg', { viewBox: '0 0 220 430', class: className, 'aria-hidden': 'true' });
  svg.append(shape('ellipse', { cx: 110, cy: 409, rx: 54, ry: 9, fill: '#d1bdc9', opacity: '.45' }));
  const person = shape('g', { class: 'hero-breath' });
  person.append(
    path('M85 352L80 400Q76 410 99 407L110 357M119 352L123 407Q146 410 143 399L136 352', '#343749'),
    path('M81 108Q110 91 139 108L161 206L149 373Q110 392 71 373L60 206Z', '#798b91'),
    path('M82 116L61 124L30 230L59 250L97 157M138 116L159 124L190 230L161 250L123 157', '#95a5a5'),
    path('M32 229L28 249Q40 266 48 244L59 239M189 229L193 249Q181 266 173 244L161 239', '#e7c7b1'),
    path('M88 112L111 157L135 111L130 201L149 375Q120 384 108 378L107 191L73 372L78 202Z', '#d7dfd7'),
    path('M92 110L111 151L123 125L113 173L84 120Z', '#f2ebd9'),
    path('M75 198Q110 213 148 198L148 214Q111 229 76 214Z', '#3e565e'),
    path('M114 212Q128 250 146 277L131 282Q112 248 108 218', '#bf8494', { class: 'hero-sash' }),
    path('M86 53Q81 20 109 20Q141 18 140 53L137 116L124 98L95 102L80 130Z', '#303444'),
    path('M89 55Q107 39 131 56L130 82Q110 110 91 82Z', '#ead0ba'),
    path('M86 57Q89 29 111 29Q133 27 137 58L117 46L108 60L110 43L93 60Z', '#303444'),
    path('M99 101L110 119L122 100L120 90L102 92Z', '#e2bda9'),
    path('M95 70L104 70M118 70L127 70M107 87Q112 89 117 86', 'none', { stroke: '#6c5856', 'stroke-width': '1.8', 'stroke-linecap': 'round' }),
    shape('ellipse', { cx: 111, cy: 23, rx: 15, ry: 12, fill: '#303444' }),
    path('M91 23L132 20', 'none', { stroke: '#c4ab73', 'stroke-width': '4', 'stroke-linecap': 'round' }),
    path('M83 253L93 354M136 251L129 353', 'none', { stroke: '#b7c6c0', 'stroke-width': '2' })
  );
  svg.append(person);
  return svg;
}

export function sceneKind(location) {
  if (/柴房|府|屋|阁|室|酒楼/.test(location)) return 'interior';
  if (/镇|市|城|坊/.test(location)) return 'town';
  if (/林|谷|园|竹/.test(location)) return 'forest';
  if (/遗|洞|冢|境|窟/.test(location)) return 'ruins';
  return 'mountain';
}

export function createSceneArt(kind) {
  const svg = shape('svg', { viewBox: '0 0 900 200', preserveAspectRatio: 'xMidYMid slice', class: 'scene-art', 'aria-hidden': 'true' });
  svg.append(shape('rect', { width: 900, height: 200, fill: '#e6e5e4' }),
    shape('circle', { cx: 690, cy: 44, r: 27, fill: '#f8e5bc' }),
    path('M0 150L85 62L175 111L279 29L392 123L515 51L633 134L730 72L900 143V200H0Z', '#c3cfce'),
    path('M0 164Q164 93 305 171Q433 104 584 160Q714 126 900 160V200H0Z', '#9dadae'));
  if (kind === 'interior') {
    svg.append(shape('rect', { width: 900, height: 200, fill: '#4c4d51' }));
    for (const x of [0, 104, 208, 700, 802]) svg.append(shape('rect', { x, width: 94, height: 200, fill: '#5d5958' }));
    svg.append(shape('rect', { x: 560, y: 20, width: 140, height: 142, fill: '#b4c4c1' }),
      path('M560 23L330 200H625L700 23Z', '#e7ddbb', { opacity: '.12' }),
      path('M605 20V162M654 20V162M560 65H700M560 112H700', 'none', { stroke: '#4c4d51', 'stroke-width': 6 }),
      path('M0 182L206 169L520 185L900 171V200H0Z', '#373e45'));
  } else if (kind === 'town') {
    for (const [x, y] of [[110, 80], [310, 98], [650, 85]]) svg.append(
      shape('rect', { x, y: y + 23, width: 123, height: 88, fill: '#84908f' }),
      path(`M${x-22} ${y+27}L${x+61} ${y-12}L${x+145} ${y+27}Z`, '#536c76'),
      shape('rect', { x: x + 52, y: y + 62, width: 23, height: 42, fill: '#526169' }));
  } else if (kind === 'forest') {
    for (const x of [45, 145, 280, 720, 840]) svg.append(path(`M${x} 200L${x+7} 13L${x+14} 200Z`, '#526d69'),
      path(`M${x+10} 30Q${x-58} 30 ${x-85} 74Q${x-19} 57 ${x+10} 42Q${x+50} 6 ${x+75} 27Q${x+30} 32 ${x+10} 52`, '#75938a'));
  } else if (kind === 'ruins') {
    svg.append(path('M600 200V52L644 26L701 54V200H675V80H627V200Z', '#6a777b'),
      path('M540 200L562 162L596 182L602 200M713 200L737 142L764 160L780 200', '#536a73'));
  }
  svg.append(path('M0 191Q180 178 320 192Q540 170 900 188V200H0Z', '#718887', { opacity: '.25', class: 'scene-mist' }));
  return svg;
}

export function createScenePresentation(container) {
  const art = document.createElement('div'); art.className = 'scene-art-wrap';
  const portrait = document.createElement('div'); portrait.className = 'scene-portrait'; portrait.append(createHeroArt());
  const caption = document.createElement('div'); caption.className = 'scene-caption';
  const name = document.createElement('strong');
  const place = document.createElement('span');
  const date = document.createElement('small'); caption.append(name, place, date);
  container.append(art, portrait, caption);
  let previousKind;
  return (state) => {
    const kind = sceneKind(state.story.location);
    if (kind !== previousKind) { art.replaceChildren(createSceneArt(kind)); previousKind = kind; }
    name.textContent = `${state.player.name} · 我`; place.textContent = state.story.location;
    date.textContent = `第 ${state.story.day} 日 · ${state.story.period}`;
    container.dataset.scene = kind;
  };
}
