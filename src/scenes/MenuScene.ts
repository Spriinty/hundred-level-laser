import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT } from '../config/constants';

export class MenuScene extends Phaser.Scene {
  constructor() {
    super({ key: 'Menu' });
  }

  create(): void {
    // Starfield background
    for (let i = 0; i < 200; i++) {
      const x = Phaser.Math.Between(0, GAME_WIDTH);
      const y = Phaser.Math.Between(0, GAME_HEIGHT);
      const alpha = Math.random() * 0.8 + 0.2;
      this.add.image(x, y, 'star').setAlpha(alpha);
    }

    // Title
    this.add.text(GAME_WIDTH / 2, 140, 'HUNDRED LEVEL\nLASER', {
      fontFamily: 'monospace',
      fontSize: '56px',
      color: '#4488ff',
      align: 'center',
      stroke: '#002266',
      strokeThickness: 8,
    }).setOrigin(0.5);

    // Subtitle
    this.add.text(GAME_WIDTH / 2, 270, '100 niveaux. Survivez.', {
      fontFamily: 'monospace',
      fontSize: '22px',
      color: '#88aaff',
    }).setOrigin(0.5);

    // Best level
    const best = parseInt(localStorage.getItem('hll-best') ?? '0', 10);
    if (best > 0) {
      this.add.text(GAME_WIDTH / 2, 330, `Meilleur niveau : ${best}/100`, {
        fontFamily: 'monospace',
        fontSize: '18px',
        color: '#ffcc44',
      }).setOrigin(0.5);
    }

    // Play button
    const btn = this.add.text(GAME_WIDTH / 2, 420, '[ JOUER ]', {
      fontFamily: 'monospace',
      fontSize: '36px',
      color: '#00ff88',
      stroke: '#004422',
      strokeThickness: 4,
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });

    btn.on('pointerover', () => btn.setStyle({ color: '#88ffcc' }));
    btn.on('pointerout', () => btn.setStyle({ color: '#00ff88' }));
    btn.on('pointerdown', () => this.scene.start('Game', { level: 1, score: 0, hp: 3 }));

    // Leaderboard button
    const lbBtn = this.add.text(GAME_WIDTH / 2, 490, '[ MEILLEURS SCORES ]', {
      fontFamily: 'monospace', fontSize: '22px', color: '#ffcc44',
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    lbBtn.on('pointerover', () => lbBtn.setStyle({ color: '#ffee88' }));
    lbBtn.on('pointerout', () => lbBtn.setStyle({ color: '#ffcc44' }));
    lbBtn.on('pointerdown', () => this.scene.start('Leaderboard'));

    // Controls
    this.add.text(GAME_WIDTH / 2, 590, 'WASD / ↑↓←→  Déplacements\nESPACE  Tirer dans la direction du vaisseau\nTuer tous les ennemis du niveau pour avancer\nÉCHAP  Pause', {
      fontFamily: 'monospace',
      fontSize: '15px',
      color: '#556688',
      align: 'center',
    }).setOrigin(0.5);

    // Pulse animation on button
    this.tweens.add({
      targets: btn,
      scaleX: 1.05,
      scaleY: 1.05,
      duration: 700,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.inOut',
    });
  }
}
