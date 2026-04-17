# UI/UX Improvement Ideas

Potential improvements for the Code Pet settings screen and pet overlay appearance.

---

## Settings Screen

### 1. Live Pet Preview in General Tab
Add an animated preview (64px or 96px upscaled) of the selected pet at the top of the General tab showing the idle animation loop. Currently pet cards only show a static 36x36 icon — users can't see the animation style before selecting.

### 2. Pet Card Hover Preview
When hovering a pet card in the selector grid, show a tooltip or expanded card with all sprite states (idle, working, planning, waiting) as tiny animated previews. Each pet has 5 distinct animations that users have no way to preview today.

### 3. Sound Preview Buttons [DONE]
Add a small play button next to each sound toggle so users can preview the sound before enabling it. Currently users must enable the toggle and then trigger the actual event to hear what it sounds like.

### 4. Usage Tab — Visual Charts
Replace or supplement the raw event log with simple bar charts or sparklines:
- MCP tools usage distribution (horizontal bars)
- Skills usage distribution (horizontal bars)
- Activity timeline (events per hour/day as a mini sparkline)

Raw event lists are hard to scan — visual summaries make the data useful at a glance.

### 5. Usage Tab — Date Range Filter [DONE]
Add a date range picker (today, last 7 days, last 30 days, all time) alongside the existing project/session filters. As `usage.log` grows, time-based filtering becomes essential.

### 6. Usage Tab — Export Button [DONE]
Add an "Export CSV" or "Copy to Clipboard" button for the filtered usage data. Power users may want to analyze tool usage externally.

### 7. Keyboard Navigation
Add keyboard shortcuts: `Cmd+1/2/3` to switch tabs, `Escape` to close, arrow keys to navigate the pet grid. A developer-focused app should feel responsive to keyboard-first users.

### 8. Dismiss Confirmation [DONE]
Show a small inline confirmation ("Are you sure? This removes the pet for this project.") before actually dismissing. The dismiss action is destructive and currently has no safety net.

### 9. About / Version Footer [DONE]
Add a subtle footer at the bottom of the settings window showing the Code Pet version, a link to the GitHub repo, and a "Made with love" tagline. Gives the app a polished feel and lets users check their version.

### 10. Smooth Tab Transitions [DONE]
Add a subtle slide or fade transition when switching between settings tabs instead of instant show/hide. CSS `opacity` + `transform` transition on tab content divs.

### 11. Pet Card Selection Animation [DONE]
Animate the blue selection border with a brief glow or pulse when a new pet is selected. CSS `@keyframes` on `.pet-card.selected`.

### 12. Empty State Illustrations
Replace "No events yet" / "No MCP tool usage yet" text with a small illustration (e.g. a sleeping pet sprite) plus text. Empty states are a branding opportunity.

---

## Pet Overlay / Appearance

### 13. Thought Bubbles / Status Indicators
Show a small speech/thought bubble above the pet on state changes:
- Working: "Coding..." or a gear icon
- Planning: "Thinking..." or a lightbulb
- Waiting: "Need input!" or a question mark
- Idle after 30s: "zzz"

Makes the pet more communicative — especially useful for users unfamiliar with each animation's meaning.

### 14. Pet Size Option (Small / Medium / Large)
Add a size selector in settings: 48px (compact), 64px (default), 96px (large). Scale the sprite with `image-rendering: pixelated` for crisp upscaling. Pixel art scales cleanly at integer multiples.

### 15. Celebration Animation on Work Finished
When transitioning from working/planning to idle (`work_finished`), play a brief celebration: confetti particles, a little jump, or a happy dance before settling into idle. Gives positive reinforcement when the user finishes a task.

### 16. Idle Micro-Animations
After the pet has been idle for a while (e.g. 30 seconds), play random idle micro-animations: scratching, yawning, looking around, falling asleep. Can be done with additional sprite sheets or simple CSS transforms. Small variations make the pet feel more alive.

### 17. Entrance / Exit Animations
When a new project pet appears (awaken), animate it sliding in or bouncing from the edge. When dismissed or falling asleep, animate it walking off-screen or fading with a wave. Abrupt appear/disappear feels jarring.

### 18. Pet Position Customization
Let users choose which screen corner the pet lives in (bottom-right, bottom-left, top-right, top-left) via a corner-picker in settings. Bottom-right may overlap with system tray, notifications, or other tools.

### 19. Drag to Reposition
Allow users to drag the pet to any position on screen (hold click for 500ms to enter drag mode, release to place). Persist the position across sessions. More flexible than fixed corner presets for multi-monitor setups.

### 20. Click Reactions
When the user clicks the pet (single click), play a brief pet-specific reaction animation (jump, spin, tail wag) instead of the generic scale pulse. Each pet type could have unique click reactions to add personality.

### 21. Pet Label Tooltip
Show the full project path on hover over the truncated pet label. Labels are capped at 110px with ellipsis — users sometimes need to see the full project name.

### 22. Dark / Light Background Adaptation
Detect if the desktop background behind the pet is light or dark and adjust the label text-shadow accordingly. White label text with dark shadow works on dark backgrounds but can be hard to read on light ones.

---

## Suggested Priority

**High impact, moderate effort:**
1. Live Pet Preview (#1) — biggest gap in the current pet selector UX
2. Thought Bubbles (#13) — makes the pet significantly more communicative
3. Pet Size Option (#14) — commonly requested in desktop pet apps
4. Celebration Animation (#15) — emotional payoff, keeps users engaged

**Medium impact, low effort (quick wins):**
5. Dismiss Confirmation (#8)
6. Sound Preview (#3)
7. Smooth Tab Transitions (#10)
8. Pet Card Selection Animation (#11)
9. Pet Label Tooltip (#21)

**Medium impact, moderate effort:**
10. Pet Position Customization (#18)
11. Usage Charts (#4)
12. Idle Micro-Animations (#16)
13. Entrance/Exit Animations (#17)

**Nice to have:**
14. Date Range Filter (#5)
15. Export Button (#6)
16. Keyboard Navigation (#7)
17. Drag to Reposition (#19)
18. Click Reactions (#20)
19. About Footer (#9)
20. Empty State Illustrations (#12)
21. Dark/Light Adaptation (#22)
22. Pet Card Hover Preview (#2)
