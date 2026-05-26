import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT } from '../config/constants';
import { saveScore } from '../systems/Scores';

export class GameOverScene extends Phaser.Scene {
  private level = 0;
  private score = 0;
  private nameEntry = '';
  private submitted = false;
  private nameText!: Phaser.GameObjects.Text;
  private cursorVisible = true;
  private hint!: Phaser.GameObjects.Text;

  constructor() {
    super({ key: 'GameOver' });
  }

  create(data: { level: number; score: number }): void {
    this.level = data.level;
    this.score = data.score;
    this.nameEntry = '';
    this.submitted = false;
    this.cursorVisible = true;

    // Stars background
    for (let i = 0; i < 150; i++) {
      this.add.image(
        Phaser.Math.Between(0, GAME_WIDTH),
        Phaser.Math.Between(0, GAME_HEIGHT),
        'star'
      ).setAlpha(Math.random() * 0.7 + 0.1);
    }

    // Title
    this.add.text(GAME_WIDTH / 2, 90, 'GAME OVER', {
      fontFamily: 'monospace', fontSize: '64px',
      color: '#ff2244', stroke: '#660011', strokeThickness: 8,
    }).setOrigin(0.5);

    // Stats
    this.add.text(GAME_WIDTH / 2, 200, `Niveau atteint : ${this.level}/100`, {
      fontFamily: 'monospace', fontSize: '26px', color: '#ffaa44',
    }).setOrigin(0.5);

    this.add.text(GAME_WIDTH / 2, 242, `Score : ${this.score.toLocaleString('fr-FR')}`, {
      fontFamily: 'monospace', fontSize: '22px', color: '#ffcc44',
    }).setOrigin(0.5);

    // Name entry
    this.add.text(GAME_WIDTH / 2, 320, 'ENTREZ VOTRE NOM', {
      fontFamily: 'monospace', fontSize: '20px', color: '#778899',
    }).setOrigin(0.5);

    this.nameText = this.add.text(GAME_WIDTH / 2, 368, '> _', {
      fontFamily: 'monospace', fontSize: '36px',
      color: '#00ff88', stroke: '#003311', strokeThickness: 4,
    }).setOrigin(0.5);

    this.hint = this.add.text(GAME_WIDTH / 2, 430, 'A-Z · 0-9 · BACKSPACE · ENTRÉE pour valider', {
      fontFamily: 'monospace', fontSize: '15px', color: '#445566',
    }).setOrigin(0.5);

    // Blinking cursor
    this.time.addEvent({
      delay: 500, loop: true,
      callback: () => {
        if (this.submitted) return;
        this.cursorVisible = !this.cursorVisible;
        this.refreshNameText();
      },
    });

    // Keyboard
    this.input.keyboard!.on('keydown', (e: KeyboardEvent) => {
      if (this.submitted) return;

      if (e.key === 'Enter') {
        if (this.nameEntry.length >= 1) this.submit();
        return;
      }
      if (e.key === 'Backspace') {
        this.nameEntry = this.nameEntry.slice(0, -1);
      } else if (/^[a-zA-Z0-9 ]$/.test(e.key) && this.nameEntry.length < 12) {
        this.nameEntry += e.key.toUpperCase();
      }
      this.refreshNameText();
    });
  }

  private refreshNameText(): void {
    const cursor = this.cursorVisible ? '▮' : ' ';
    this.nameText.setText(`> ${this.nameEntry}${cursor}`);
  }

  private submit(): void {
    this.submitted = true;
    this.cursorVisible = false;
    this.refreshNameText();
    this.hint.destroy();

    const rank = saveScore({
      name: this.nameEntry,
      score: this.score,
      level: this.level,
      date: new Date().toLocaleDateString('fr-FR'),
    });

    this.add.text(GAME_WIDTH / 2, 460, rank >= 0
      ? `Score sauvegardé — Rang #${rank + 1} !`
      : 'Score sauvegardé !', {
      fontFamily: 'monospace', fontSize: '18px', color: '#44ffaa',
    }).setOrigin(0.5);

    this.time.delayedCall(1200, () => {
      this.scene.start('Leaderboard', { highlightRank: rank });
    });
  }
}
