import { NameInput } from '../systems/NameInput';
import { saveScore } from '../systems/Scores';
import { isTouchDevice } from '../systems/TouchControls';
import { UiScene } from './UiScene';

const MAX_NAME = 12;

export class GameOverScene extends UiScene {
  private level = 0;
  private score = 0;
  private nameEntry = '';
  private submitted = false;
  private rank = -1;
  private nameText!: Phaser.GameObjects.Text;
  private cursorVisible = true;
  private nameInput?: NameInput;

  constructor() {
    super({ key: 'GameOver' });
  }

  create(data: { level: number; score: number }): void {
    this.level = data.level;
    this.score = data.score;
    this.nameEntry = '';
    this.submitted = false;
    this.rank = -1;
    this.cursorVisible = true;
    this.nameInput = undefined;

    // Blinking cursor
    this.time.addEvent({
      delay: 500, loop: true,
      callback: () => {
        if (this.submitted) return;
        this.cursorVisible = !this.cursorVisible;
        this.refreshNameText();
      },
    });

    if (isTouchDevice()) {
      this.nameInput = new NameInput({
        maxLength: MAX_NAME,
        onChange: v => {
          this.nameEntry = v;
          this.refreshNameText();
        },
        onSubmit: () => this.trySubmit(),
      });
      this.events.once('shutdown', () => {
        this.nameInput?.destroy();
        this.nameInput = undefined;
      });
    } else {
      // Only one capture path at a time: with both live, a phone paired with a
      // keyboard would record every character twice.
      this.input.keyboard!.on('keydown', (e: KeyboardEvent) => {
        if (this.submitted) return;

        if (e.key === 'Enter') {
          this.trySubmit();
          return;
        }
        if (e.key === 'Backspace') {
          this.nameEntry = this.nameEntry.slice(0, -1);
        } else if (/^[a-zA-Z0-9 ]$/.test(e.key) && this.nameEntry.length < MAX_NAME) {
          this.nameEntry += e.key.toUpperCase();
        }
        this.refreshNameText();
      });
    }

    this.startResponsive();
  }

  protected draw(): void {
    const { width, height } = this.layout;
    const cx = width / 2;

    this.stars(150, 0.1, 0.8);

    this.own(
      this.add.text(cx, height * 0.125, 'GAME OVER',
        this.mono(64, '#ff2244', { stroke: '#660011', strokeThickness: 8 })
      ).setOrigin(0.5)
    );

    this.own(
      this.add.text(cx, height * 0.278, `Niveau atteint : ${this.level}/100`,
        this.mono(26, '#ffaa44')).setOrigin(0.5)
    );

    this.own(
      this.add.text(cx, height * 0.336, `Score : ${this.score.toLocaleString('fr-FR')}`,
        this.mono(22, '#ffcc44')).setOrigin(0.5)
    );

    this.own(
      this.add.text(cx, height * 0.444, 'ENTREZ VOTRE NOM', this.mono(20, '#778899'))
        .setOrigin(0.5)
    );

    this.nameText = this.own(
      this.add.text(cx, height * 0.511, '', this.mono(36, '#00ff88', {
        stroke: '#003311', strokeThickness: 4,
      })).setOrigin(0.5)
    );
    this.refreshNameText();

    if (this.submitted) {
      this.own(
        this.add.text(cx, height * 0.62, this.rank >= 0
          ? `Score sauvegardé — Rang #${this.rank + 1} !`
          : 'Score sauvegardé !',
          this.mono(18, '#44ffaa')).setOrigin(0.5)
      );
      return;
    }

    if (this.nameInput) {
      // The invisible field sits exactly over the drawn one, so tapping what
      // looks like the input is what actually opens the keyboard.
      const w = width * 0.7;
      const h = Math.max(this.nameText.height * 1.4, 44);
      this.nameInput.place(this.game.canvas, cx - w / 2, this.nameText.y - h / 2, w, h);

      this.own(
        this.add.text(cx, height * 0.575, 'Touchez le champ pour saisir',
          this.mono(15, '#445566')).setOrigin(0.5)
      );
      this.button(
        cx, height * 0.66, '[ VALIDER ]', 24, '#00ff88', '#88ffcc',
        () => this.trySubmit(), { stroke: '#004422', strokeThickness: 4 }
      );
    } else {
      this.own(
        this.add.text(cx, height * 0.597, 'A-Z · 0-9 · BACKSPACE · ENTRÉE pour valider',
          this.mono(15, '#445566', { align: 'center', wordWrap: { width: width * 0.9 } })
        ).setOrigin(0.5)
      );
    }
  }

  private refreshNameText(): void {
    const cursor = this.cursorVisible ? '▮' : ' ';
    this.nameText.setText(`> ${this.nameEntry}${cursor}`);
  }

  private trySubmit(): void {
    if (this.submitted || this.nameEntry.length < 1) return;
    this.submit();
  }

  private submit(): void {
    this.submitted = true;
    this.cursorVisible = false;
    this.nameInput?.destroy();
    this.nameInput = undefined;

    this.rank = saveScore({
      name: this.nameEntry,
      score: this.score,
      level: this.level,
      date: new Date().toLocaleDateString('fr-FR'),
    });

    this.redraw();

    this.time.delayedCall(1200, () => {
      this.scene.start('Leaderboard', { highlightRank: this.rank });
    });
  }
}
