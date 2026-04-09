# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev      # Vite dev server (hot reload)
npm run build    # Production build → dist/
npm run preview  # Serve dist/ locally
```

No test suite. No linter config. No vite.config.js (plain Vite defaults).

## Project: 21 Spin

A browser-based 3D blackjack/slot hybrid. Stack: **Vite** (ESM, no bundler config) + **Three.js** + **PartyKit** (multiplayer stub, not yet wired). Single HTML entry point, no framework.

## Architecture

### Entry & Scene (`src/main.js`)
All Three.js scene setup lives here: renderer, camera, lights, ground plane, and the game loop (`animate()`). This file owns the `columns[]` array (active `SlotColumn` instances) and coordinates round flow — it creates/disposes columns, listens to `GameState` events, and bridges `HUD` callbacks into `GameState` transitions and `Dealer` calls.

Camera follows `playerChar._model` position with a fixed offset; mouse Y drives a subtle pitch clamp (±5°).

### Game Phase Machine (`src/game/GameState.js`)
`GameState extends EventTarget`. Phases:
```
betting → spinning → player_choice → spinning (hit) → reveal → end → betting
         └──────────────────────────────────────────────────────────→ (pass)
```
Events: `phaseChange`, `scoreUpdate`, `roundEnd`. Each player (keyed by string ID) has `{ chips, hand, result }`. The `'dealer'` player is special — its hand is set externally via `setDealerHand()` after `Dealer.play()` completes. Scoring outcomes: `jackpot` (triple match, 5×), `superBlackjack` (21 in 3 cards, 2×), `blackjack` (21 in 2 cards, 1.5×), `win`, `push`, `bust`, `lose`.

### Slot Columns (`src/game/SlotColumn.js`)
Each column is a 3-card vertical strip that spins and decelerates. Uses a 55-card pool (52 + 3 Jokers, Fisher-Yates shuffled). Card faces are rendered as `CanvasTexture` (128×192px) drawn at construction time. Only the card nearest y=0 is visible. `lock()` triggers deceleration; `getValue()` returns `{ rank, suit, value }` once snapped. Player has 2 base columns; a 3rd spawns on HIT.

Column positions are hardcoded in `main.js` (`COL_POS` array at z=3.2 in world space). Dealer columns live at z=−3.0 and are managed entirely by `Dealer`.

### Dealer AI (`src/game/Dealer.js`)
Draws cards sequentially with randomised think delays (1.2s ± 0.4s). Stands at ≥17. Keeps all drawn columns alive (visible) and recentres them around `DEALER_CENTER` after each new card. Calls `onDone(result)` and `onProgress(total, cardCount)` callbacks provided by `main.js`.

### Characters (`src/game/Character.js`)
Loads `public/models/Soldier.glb` (shared between player and dealer instances). Animations are indexed: `[0]` Idle, `[1]` Run, `[3]` Walk. Game events trigger named reactions: `celebrate()`, `disappointed()`, `deal()`, `idle()`. The player character supports WASD/arrow movement; rotation follows camera yaw when `tpCamera` is set (currently unused — world-axis fallback is active).

### HUD (`src/ui/HUD.js`)
Pure HTML/CSS overlay injected into `#hud`. Injects a `<style>` tag with all styles (including a Google Fonts import for Press Start 2P). No shadow DOM. Subscribes to `GameState` events and exposes four callbacks: `onDeal(bet)`, `onHit()`, `onPass()`, `onStopColumn(i)`. The `update()` method must be called every frame to sync STOP button states.

### Table (`src/game/Table.js`)
Static Three.js geometry only — felt surface, wooden rim, four legs. No logic.

### Network (`src/network/party.js`)
`PartyConnection` stub — WebSocket not yet connected. Multiplayer is not implemented.

## Key conventions

- No TypeScript; plain ES modules with JSDoc annotations where helpful.
- `dispose()` pattern: every game object that adds to the scene owns its own teardown.
- `GameState` uses the native `EventTarget` / `CustomEvent` pattern (`.on()` is a thin wrapper around `addEventListener`).
- Card geometry is `BoxGeometry`; face texture is material index 4 (`+z` face in Three.js BoxGeometry face order).
- The `PLAYER_ID` constant `'local'` is hardcoded; the dealer is always keyed `'dealer'`.
