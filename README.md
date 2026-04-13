<div align="center">

# Code Pet

### Your Claude Code sessions, but with a dog.

[![license](https://img.shields.io/github/license/mradovic95/code-pet?color=blue)](#license)
[![platform](https://img.shields.io/badge/platform-macOS%20%7C%20Linux%20%7C%20Windows-lightgrey)](#requirements)
[![Claude Code plugin](https://img.shields.io/badge/Claude%20Code-plugin-8A2BE2)](https://docs.claude.com/en/docs/claude-code)
[![stars](https://img.shields.io/github/stars/mradovic95/code-pet?style=social)](https://github.com/mradovic95/code-pet)

<!--
  HERO VIDEO — to be added. See assets/docs/README.md for what to produce.
  Once recorded, replace this block with:
  <video src="<uploaded-url>.mp4" autoplay loop muted playsinline width="720"></video>
-->
<img src="./assets/docs/pets/dog/idle.gif" width="128" alt="Code Pet">
&nbsp;&nbsp;
<img src="./assets/docs/pets/dog/working.gif" width="128" alt="Code Pet working">
&nbsp;&nbsp;
<img src="./assets/docs/pets/dog/waiting_for_action.gif" width="128" alt="Code Pet waiting">

<sub><em>Idle · Working · Waiting for action</em></sub>

</div>

---

## Why Code Pet?

- **Company for long sessions.** Hours with an AI feel less lonely when
  something in the corner is keeping you company.
- **Glanceable state.** Know at a glance whether Claude is working, stuck on
  a permission prompt, or done — without switching windows.
- **Zero friction.** Fully transparent, click-through, always-on-top. It
  never steals focus and never interrupts your flow.

## Install

**1.** Add the marketplace (one-time):

```
/plugin marketplace add mradovic95/code-pet
```

**2.** Install the plugin:

```
/plugin install code-pet
```

**3.** Run `/reset` or start a new session so Claude picks up the new hooks.

That's it. Electron is installed in the background on first run (~85 MB),
so the pet appears instantly on every session after.

To uninstall:

```bash
claude plugin remove code-pet
```

## Meet the pets

<div align="center">

| <img src="./assets/docs/pets/dog/idle.gif" width="96"> | <img src="./assets/docs/pets/cat/idle.gif" width="96"> | <img src="./assets/docs/pets/panda/idle.gif" width="96"> | <img src="./assets/docs/pets/dolphin/idle.gif" width="96"> | <img src="./assets/docs/pets/bird/idle.gif" width="96"> |
|:---:|:---:|:---:|:---:|:---:|
| **Dog** | **Cat** | **Panda** | **Dolphin** | **Bird** |

</div>

More pets on the way.

## How it works

Your pet watches Claude Code and reacts in real time. Here's what happens in
each moment of a session:

| When you… | Your pet… | Animation |
|---|---|:---:|
| Start a session | Wakes up and settles in | <img src="./assets/docs/pets/dog/waking_up.gif" width="64"> → <img src="./assets/docs/pets/dog/idle.gif" width="64"> |
| Send a prompt | Gets to work | <img src="./assets/docs/pets/dog/working.gif" width="64"> |
| Send a prompt in plan mode | Starts thinking instead | <img src="./assets/docs/pets/dog/planning.gif" width="64"> |
| Hit a permission prompt | Looks at you and waits | <img src="./assets/docs/pets/dog/waiting_for_action.gif" width="64"> |
| Get a reply from Claude | Finishes and rests | <img src="./assets/docs/pets/dog/idle.gif" width="64"> |
| End the session | Falls asleep and closes the overlay | — |

The overlay is transparent, frameless, always-on-top, click-through, and
never steals focus. Plan mode is auto-detected, and the pet stays put if a
session ends while Claude is still working — it only tucks in when you're
truly idle.

## Requirements

Node.js ≥ 18 · macOS / Linux / Windows · Claude Code with plugin support

## Contributing

Built with Electron on top of Claude Code's plugin API. PRs welcome — open
an [issue](https://github.com/mradovic95/code-pet/issues) first for anything
larger than a small fix. Questions, bug reports, and pet requests also go in
issues.

## License

MIT

---

<div align="center">

If Code Pet made your day a little better, give it a ⭐.

</div>
