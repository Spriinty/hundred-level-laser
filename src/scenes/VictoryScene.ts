import { NameInput } from '../systems/NameInput';
import { saveScore } from '../systems/Scores';
import { isTouchDevice } from '../systems/TouchControls';
import { UiScene } from './UiScene';

const MAX_NAME = 12;

export class VictoryScene extends UiScene {
  private score = 0;
  private nameEntry = '';
  private submitted = false;
  private rank = -1;
  private nameText!: Phaser.GameObjects.Text;
  private cursorVisible = true;
  private nameInput?: NameInput;

  constructor() {
    super({ key: 'Victory' });
  }

  create(data: { score: number }): void {
    this.score = data.score;
    this.nameEntry = '';
    this.submitted = false;
    this.rank = -1;
    this.cursorVisible = true;
    this.nameInput = undefined;

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

    this.stars(300, 0.1, 1);

    this.own(
      this.add.text(cx, height * 0.111, 'VICTOIRE !',
        this.mono(68, '#ffdd00', { stroke: '#886600', strokeThickness: 8 })
      ).setOrigin(0.5)
    );

    this.own(
      this.add.text(cx, height * 0.25, 'Vous avez traversé les 100 niveaux !',
        this.mono(24, '#88ffcc', { align: 'center', wordWrap: { width: width * 0.9 } })
      ).setOrigin(0.5)
    );

    this.own(
      this.add.text(cx, height * 0.314, `Score final : ${this.score.toLocaleString('fr-FR')}`,
        this.mono(26, '#ffcc44')).setOrigin(0.5)
    );

    this.own(
      this.add.text(cx, height * 0.425, 'ENTREZ VOTRE NOM POUR LE TABLEAU DES SCORES',
        this.mono(17, '#778899', { align: 'center', wordWrap: { width: width * 0.9 } })
      ).setOrigin(0.5)
    );

    this.nameText = this.own(
      this.add.text(cx, height * 0.494, '', this.mono(36, '#ffdd00', {
        stroke: '#665500', strokeThickness: 4,
      })).setOrigin(0.5)
    );
    this.refreshNameText();

    if (this.submitted) {
      this.own(
        this.add.text(cx, height * 0.653, `Score sauvegardé — Rang #${this.rank + 1} !`,
          this.mono(20, '#44ffaa')).setOrigin(0.5)
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
        this.add.text(cx, height * 0.558, 'Touchez le champ pour saisir',
          this.mono(15, '#445566')).setOrigin(0.5)
      );
      this.button(
        cx, height * 0.645, '[ VALIDER ]', 24, '#ffdd00', '#ffee88',
        () => this.trySubmit(), { stroke: '#665500', strokeThickness: 4 }
      );
    } else {
      this.own(
        this.add.text(cx, height * 0.578, 'A-Z · 0-9 · BACKSPACE · ENTRÉE pour valider',
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
      level: 100,
      date: new Date().toLocaleDateString('fr-FR'),
    });

    this.redraw();

    this.time.delayedCall(1400, () => {
      this.scene.start('Leaderboard', { highlightRank: this.rank });
    });
  }
}
