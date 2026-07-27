'use strict';

const { execFile } = require('child_process');
const logger = require('../core/logger');

function extractAppName(comm) {
  const match = comm.match(/\/([^/]+)\.app\//);
  return match ? match[1] : null;
}

function getParentProcess(pid) {
  return new Promise((resolve) => {
    execFile('ps', ['-o', 'ppid=,args=', '-p', String(pid)], (err, stdout) => {
      if (err) { resolve(null); return; }
      const line = stdout.trim();
      if (!line) { resolve(null); return; }
      // Output format: "  1234 ProcessName" — ppid then comm
      const match = line.match(/^\s*(\d+)\s+(.+)$/);
      if (!match) { resolve(null); return; }
      resolve({ ppid: parseInt(match[1], 10), comm: match[2].trim() });
    });
  });
}

function escapeAppleScriptString(str) {
  return str.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function getTty(pid) {
  return new Promise((resolve) => {
    execFile('ps', ['-o', 'tty=', '-p', String(pid)], (err, stdout) => {
      if (err) { resolve(null); return; }
      const tty = stdout.trim();
      if (!tty || tty === '??' || tty === '-') { resolve(null); return; }
      // ps returns e.g. "ttys003", convert to /dev/ttys003
      resolve(tty.startsWith('/dev/') ? tty : `/dev/${tty}`);
    });
  });
}

function focusByTty(appName, ttyPath) {
  let script;
  if (appName === 'Terminal') {
    script = `tell application "Terminal"
  repeat with w in windows
    repeat with t in tabs of w
      if tty of t is "${ttyPath}" then
        set selected of t to true
        set index of w to 1
        activate
        return "found"
      end if
    end repeat
  end repeat
end tell
return "not_found"`;
  } else if (appName === 'iTerm' || appName === 'iTerm2') {
    const escapedApp = escapeAppleScriptString(appName);
    script = `tell application "${escapedApp}"
  repeat with w in windows
    repeat with t in tabs of w
      repeat with s in sessions of t
        if tty of s is "${ttyPath}" then
          select s
          select t
          set index of w to 1
          activate
          return "found"
        end if
      end repeat
    end repeat
  end repeat
end tell
return "not_found"`;
  } else {
    return Promise.resolve(false);
  }

  return new Promise((resolve) => {
    execFile('osascript', ['-e', script], { timeout: 3000 }, (err, stdout) => {
      if (err) {
        logger.warn(`focusByTty failed for "${appName}" tty "${ttyPath}": ${err.message}`);
        resolve(false);
        return;
      }
      const found = stdout.trim() === 'found';
      if (found) {
        logger.info(`Focused ${appName} window by tty: ${ttyPath}`);
      } else {
        logger.info(`No ${appName} window matched tty: ${ttyPath}`);
      }
      resolve(found);
    });
  });
}

function activateApp(appName) {
  return new Promise((resolve) => {
    execFile('osascript', ['-e', `tell application "${escapeAppleScriptString(appName)}" to activate`], { timeout: 3000 }, (err) => {
      if (err) {
        logger.warn(`Failed to activate "${appName}": ${err.message}`);
        resolve(false);
        return;
      }
      logger.info(`Activated terminal: ${appName}`);
      resolve(true);
    });
  });
}

function focusBySystemEvents(appName, projectDirName, projectPath) {
  if (!projectDirName) return Promise.resolve(false);
  const escapedProcess = escapeAppleScriptString(appName);
  const searchTerms = [];
  if (projectPath) searchTerms.push(escapeAppleScriptString(projectPath));
  searchTerms.push(escapeAppleScriptString(projectDirName));
  const searchList = searchTerms.map(t => `"${t}"`).join(', ');

  const script = `tell application "System Events"
  tell process "${escapedProcess}"
    set searchTerms to {${searchList}}
    repeat with searchTerm in searchTerms
      repeat with w in windows
        if name of w contains (searchTerm as text) then
          perform action "AXRaise" of w
          set frontmost to true
          return "found"
        end if
      end repeat
    end repeat
  end tell
end tell
return "not_found"`;

  return new Promise((resolve) => {
    execFile('osascript', ['-e', script], { timeout: 5000 }, (err, stdout) => {
      if (err) {
        if (err.message.includes('-1743')) {
          logger.info('focusBySystemEvents: grant Automation permission in System Preferences → Privacy & Security → Automation');
        } else {
          logger.warn(`focusBySystemEvents failed for "${appName}": ${err.message}`);
        }
        resolve(false);
        return;
      }
      const found = stdout.trim() === 'found';
      if (found) logger.info(`Focused ${appName} window via System Events: ${projectDirName}`);
      else logger.info(`No ${appName} window matched via System Events: ${projectDirName}`);
      resolve(found);
    });
  });
}

async function focusTerminal(claudePid, projectDirName, projectPath, storedTty) {
  if (process.platform !== 'darwin') {
    logger.info('focusTerminal: not macOS, skipping');
    return false;
  }

  if (!claudePid || claudePid <= 1) {
    logger.warn('focusTerminal: invalid claudePid');
    return false;
  }

  try {
    // 1. Walk process tree to find the terminal app
    let appName = null;
    let currentPid = claudePid;
    for (let i = 0; i < 5; i++) {
      const parent = await getParentProcess(currentPid);
      if (!parent) break;
      appName = extractAppName(parent.comm);
      if (appName) break;
      currentPid = parent.ppid;
      if (currentPid <= 1) break;
    }

    if (!appName) {
      logger.info(`focusTerminal: no .app bundle found in process tree from PID ${claudePid}`);
      return false;
    }

    // 2. TTY matching for Terminal.app / iTerm (precise, no permissions needed)
    const ttyPath = storedTty || await getTty(claudePid);
    if (ttyPath && (appName === 'Terminal' || appName === 'iTerm' || appName === 'iTerm2')) {
      const focused = await focusByTty(appName, ttyPath);
      if (focused) return true;
      logger.info(`TTY match failed for "${appName}"`);
    }

    // 3. System Events: find and raise window (universal, needs Automation + Accessibility)
    const seFocused = await focusBySystemEvents(appName, projectDirName, projectPath);
    if (seFocused) return true;

    // 4. Last resort: just activate the app
    return await activateApp(appName);
  } catch (err) {
    logger.warn(`focusTerminal error: ${err.message}`);
    return false;
  }
}

module.exports = { focusTerminal };
