'use strict';

const _injectedPetTypes = new Set();

/**
 * Inject CSS sprite animations for a pet type.
 * @param {string} petType - Pet ID
 * @param {object} manifest - Pet manifest with sprites config
 * @param {object} [spriteDataUris] - Optional map of state -> data: URI for premium pets
 */
function injectPetStyles(petType, manifest, spriteDataUris) {
  // For premium pets with data URIs, always re-inject (key includes URI hash)
  const cacheKey = spriteDataUris ? `${petType}:premium` : petType;
  if (_injectedPetTypes.has(cacheKey)) return;
  _injectedPetTypes.add(cacheKey);

  const frameSize = manifest.frameSize || 64;
  const sprites = manifest.sprites;
  let css = '';

  for (const [state, sprite] of Object.entries(sprites)) {
    const totalWidth = frameSize * sprite.frames;
    const animName = `${petType}-${state}-anim`;
    const loopStr = sprite.loop ? 'infinite' : 'forwards';

    // Use data: URI for premium pets, file path for free pets
    let bgUrl;
    if (spriteDataUris && spriteDataUris[state]) {
      bgUrl = spriteDataUris[state];
    } else {
      bgUrl = `../../assets/pets/${petType}/${sprite.file}`;
    }

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
