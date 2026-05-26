import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT } from '../config/constants';
import { saveScore } from '../systems/Scores';

export class VictoryScene extends Phaser.Scene {
  private score = 0;
  private nameEntry = '';
  private submitted = false;
  private nameText!: Phaser.GameObjects.Text;
  private cursorVisible = true;

  constructor() {
    super({ key: 'Victory' });
  }

  create(data: { score: number }): void {
    this.score = data.score;
    this.nameEntry = '';
    this.submitted = false;
    this.cursorVisible = true;

    // Celebration stars
    for (let i = 0; i < 300; i++) {
      this.add.image(
        Phaser.Math.Between(0, GAME_WIDTH),
        Phaser.Math.Between(0, GAME_HEIGHT),
        'star'
      ).setAlpha(Math.random() * 0.9 + 0.1);
    }

    // Title
    this.add.text(GAME_WIDTH / 2, 80, 'VICTOIRE !', {
      fontFamily: 'monospace', fontSize: '68px',
      color: '#ffdd00', stroke: '#886600', strokeThickness: 8,
    }).setOrigin(0.5);

    this.add.text(GAME_WIDTH / 2, 180, 'Vous avez traversé les 100 niveaux !', {
      fontFamily: 'monospace', fontSize: '24px', color: '#88ffcc',
    }).setOrigin(0.5);

    this.add.text(GAME_WIDTH / 2, 226, `Score final : ${this.score.toLocaleString('fr-FR')}`, {
      fontFamily: 'monospace', fontSize: '26px', color: '#ffcc44',
    }).setOrigin(0.5);

    // Name entry
    this.add.text(GAME_WIDTH / 2, 306, 'ENTREZ VOTRE NOM POUR LE TABLEAU DES SCORES', {
      fontFamily: 'monospace', fontSize: '17px', color: '#778899',
    }).setOrigin(0.5);

    this.nameText = this.add.text(GAME_WIDTH / 2, 356, '> _', {
      fontFamily: 'monospace', fontSize: '36px',
      color: '#ffdd00', stroke: '#665500', strokeThickness: 4,
    }).setOrigin(0.5);

    this.add.text(GAME_WIDTH / 2, 416, 'A-Z · 0-9 · BACKSPACE · ENTRÉE pour valider', {
      fontFamily: 'monospace', fontSize: '15px', color: '#445566',
    }).setOrigin(0.5);

    this.time.addEvent({
      delay: 500, loop: true,
      callback: () => {
        if (this.submitted) return;
        this.cursorVisible = !this.cursorVisible;
        this.refreshNameText();
      },
    });

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
    this.refreshNameText();

    const rank = saveScore({
      name: this.nameEntry,
      score: this.score,
      level: 100,
      date: new Date().toLocaleDateString('fr-FR'),
    });

    this.add.text(GAME_WIDTH / 2, 470, `Score sauvegardé — Rang #${rank + 1} !`, {
      fontFamily: 'monospace', fontSize: '20px', color: '#44ffaa',
    }).setOrigin(0.5);

    this.time.delayedCall(1400, () => {
      this.scene.start('Leaderboard', { highlightRank: rank });
    });
  }
}
