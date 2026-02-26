'use strict';

document.getElementById('close-btn').addEventListener('click', () => {
  window.codePetSettings.close();
});

document.getElementById('dismiss-btn').addEventListener('click', () => {
  window.codePetSettings.dismissProject();
});
