'use strict';

(function () {
  function wireSave(btnId, defaultLabel, format) {
    const btn = document.getElementById(btnId);
    btn.addEventListener('click', async () => {
      try {
        const result = await window.codePetReport.saveReport(format);
        if (result && result.saved) {
          btn.textContent = 'Saved!';
        } else if (result && result.canceled) {
          btn.textContent = defaultLabel;
          return;
        } else {
          btn.textContent = 'Failed';
        }
      } catch {
        btn.textContent = 'Failed';
      }
      setTimeout(() => { btn.textContent = defaultLabel; }, 1500);
    });
  }

  document.addEventListener('DOMContentLoaded', async () => {
    const frame = document.getElementById('report-frame');
    let html = null;
    try {
      html = await window.codePetReport.getReportHtml();
    } catch {
      // leave null — fallback below
    }
    frame.srcdoc = html || '<p style="font: 13px system-ui; padding: 16px;">No report loaded.</p>';

    wireSave('save-html-btn', 'Save as HTML', 'html');
    wireSave('save-md-btn', 'Save as Markdown', 'md');
  });
})();
