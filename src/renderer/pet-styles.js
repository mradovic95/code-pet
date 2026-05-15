'use strict';

const _injectedPetTypes = new Set();

function injectPetStyles(petType, manifest) {
  if (_injectedPetTypes.has(petType)) return;
  _injectedPetTypes.add(petType);

  const frameSize = manifest.frameSize || 64;
  const sprites = manifest.sprites;
  let css = '';

  for (const [state, sprite] of Object.entries(sprites)) {
    const totalWidth = frameSize * sprite.frames;
    const animName = `${petType}-${state}-anim`;
    const loopStr = sprite.loop ? 'infinite' : 'forwards';
    const bgUrl = `${manifest._dirUrl}/${encodeURIComponent(sprite.file)}`;

    css += `.pet[data-pet-type="${petType}"].${state} {
  background-image: url('${bgUrl}');
  background-size: ${totalWidth}px ${frameSize}px;
  animation: ${animName} ${sprite.duration}ms steps(${sprite.frames}) ${loopStr};
}
@keyframes ${animName} {
  from { background-position-x: 0; }
  to { background-position-x: -${totalWidth}px; }
}
`;
  }

  const styleEl = document.createElement('style');
  styleEl.dataset.petType = petType;
  styleEl.textContent = css;
  document.head.appendChild(styleEl);
}
