import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT } from '../config/constants';
import { loadScores } from '../systems/Scores';

export class LeaderboardScene extends Phaser.Scene {
  constructor() {
    super({ key: 'Leaderboard' });
  }

  create(data: { highlightRank?: number } = {}): void {
    const scores = loadScores();
    const highlightRank = data.highlightRank ?? -1;

    // Stars
    for (let i = 0; i < 180; i++) {
      this.add.image(
        Phaser.Math.Between(0, GAME_WIDTH),
        Phaser.Math.Between(0, GAME_HEIGHT),
        'star'
      ).setAlpha(Math.random() * 0.8 + 0.2);
    }

    // Title
    this.add.text(GAME_WIDTH / 2, 38, 'MEILLEURS SCORES', {
      fontFamily: 'monospace', fontSize: '42px',
      color: '#ffcc44', stroke: '#665500', strokeThickness: 6,
    }).setOrigin(0.5);

    const g = this.add.graphics();

    // Column X positions
    const cx = [80, 140, 560, 780, 1020];

    // Header
    const hy = 110;
    ['#', 'NOM', 'SCORE', 'NIVEAU', 'DATE'].forEach((h, i) => {
      this.add.text(cx[i], hy, h, {
        fontFamily: 'monospace', fontSize: '15px', color: '#778899',
      });
    });
    g.lineStyle(1, 0x334455);
    g.lineBetween(70, hy + 22, GAME_WIDTH - 70, hy + 22);

    if (scores.length === 0) {
      this.add.text(GAME_WIDTH / 2, 300, 'Aucun score encore\nJouez et revenez !', {
        fontFamily: 'monospace', fontSize: '22px',
        color: '#445566', align: 'center',
      }).setOrigin(0.5);
    }

    const rankColors = ['#ffdd44', '#bbbbbb', '#dd9955'];

    scores.slice(0, 10).forEach((entry, i) => {
      const ry = hy + 36 + i * 46;
      const isNew = i === highlightRank;

      // Row background
      g.fillStyle(isNew ? 0x0d2a4a : (i % 2 === 0 ? 0x080814 : 0x0c0c1e), isNew ? 0.9 : 0.5);
      g.fillRect(70, ry - 2, GAME_WIDTH - 140, 38);

      if (isNew) {
        g.lineStyle(1, 0x2266aa);
        g.strokeRect(70, ry - 2, GAME_WIDTH - 140, 38);
      }

      const textColor = isNew ? '#66ffcc' : (rankColors[i] ?? '#aabbcc');
      const rankStr = i === 0 ? '1er' : i === 1 ? '2e' : i === 2 ? '3e' : `${i + 1}.`;

      [rankStr, entry.name, entry.score.toLocaleString('fr-FR'), `Niv. ${entry.level}`, entry.date]
        .forEach((v, j) => {
          this.add.text(cx[j], ry + 10, v, {
            fontFamily: 'monospace',
            fontSize: isNew ? '19px' : '18px',
            color: textColor,
          }).setOrigin(0, 0.5);
        });

      // "NEW" badge for new entry
      if (isNew) {
        this.add.text(GAME_WIDTH - 80, ry + 10, '< NOUVEAU', {
          fontFamily: 'monospace', fontSize: '14px', color: '#44ffaa',
        }).setOrigin(1, 0.5);
      }
    });

    // Buttons
    const btnStyle = (color: string) => ({
      fontFamily: 'monospace', fontSize: '28px',
      color, stroke: '#001122', strokeThickness: 4,
    });

    const menuBtn = this.add.text(GAME_WIDTH / 2 - 150, GAME_HEIGHT - 46, '[ MENU ]', btnStyle('#4488ff'))
      .setOrigin(0.5).setInteractive({ useHandCursor: true });
    menuBtn.on('pointerover', () => menuBtn.setStyle({ color: '#88bbff' }));
    menuBtn.on('pointerout', () => menuBtn.setStyle({ color: '#4488ff' }));
    menuBtn.on('pointerdown', () => this.scene.start('Menu'));

    const playBtn = this.add.text(GAME_WIDTH / 2 + 150, GAME_HEIGHT - 46, '[ REJOUER ]', btnStyle('#00ff88'))
      .setOrigin(0.5).setInteractive({ useHandCursor: true });
    playBtn.on('pointerover', () => playBtn.setStyle({ color: '#88ffcc' }));
    playBtn.on('pointerout', () => playBtn.setStyle({ color: '#00ff88' }));
    playBtn.on('pointerdown', () => this.scene.start('Game', { level: 1, score: 0, hp: 3 }));

    this.tweens.add({
      targets: playBtn, scaleX: 1.04, scaleY: 1.04,
      duration: 700, yoyo: true, repeat: -1, ease: 'Sine.inOut',
    });
  }
}
