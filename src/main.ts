import Phaser from 'phaser';
import { BootScene } from './scenes/BootScene';
import { MenuScene } from './scenes/MenuScene';
import { GameScene } from './scenes/GameScene';
import { GameOverScene } from './scenes/GameOverScene';
import { VictoryScene } from './scenes/VictoryScene';
import { LeaderboardScene } from './scenes/LeaderboardScene';
import { OptionsScene } from './scenes/OptionsScene';

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'game',
  backgroundColor: '#000000',
  // Off by default in Phaser, and nothing reaches the game without it. The
  // browser still hides a pad until one of its buttons has been pressed.
  input: {
    gamepad: true,
    keyboard: true,
  },
  physics: {
    default: 'arcade',
    arcade: {
      gravity: { x: 0, y: 0 },
      debug: false,
    },
  },
  scale: {
    // RESIZE: the canvas always equals the window, and every scene lays itself
    // out from Layout.ts. No letterboxing, no fixed 1280x720 world.
    mode: Phaser.Scale.RESIZE,
    autoCenter: Phaser.Scale.NO_CENTER,
    width: '100%',
    height: '100%',
  },
  scene: [BootScene, MenuScene, GameScene, GameOverScene, VictoryScene, LeaderboardScene, OptionsScene],
};

new Phaser.Game(config);
