import { loadScores } from '../systems/Scores';
import { UiScene } from './UiScene';

/** Column positions as a fraction of the canvas width. */
const COLS_LANDSCAPE = [0.0625, 0.109, 0.4375, 0.609, 0.797];
const COLS_PORTRAIT = [0.05, 0.15, 0.52, 0.80];

export class LeaderboardScene extends UiScene {
  private highlightRank = -1;

  constructor() {
    super({ key: 'Leaderboard' });
  }

  create(data: { highlightRank?: number } = {}): void {
    this.highlightRank = data.highlightRank ?? -1;
    this.startResponsive();
  }

  protected draw(): void {
    const { width, height, portrait } = this.layout;
    const cx = width / 2;
    const scores = loadScores();

    this.stars(180);

    this.own(
      this.add.text(cx, height * 0.053, 'MEILLEURS SCORES',
        this.mono(portrait ? 30 : 42, '#ffcc44', { stroke: '#665500', strokeThickness: 6 })
      ).setOrigin(0.5)
    );

    const g = this.own(this.add.graphics());

    // Portrait is too narrow for the date column, so it is dropped there.
    const cols = (portrait ? COLS_PORTRAIT : COLS_LANDSCAPE).map(f => f * width);
    const headers = portrait
      ? ['#', 'NOM', 'SCORE', 'NIV.']
      : ['#', 'NOM', 'SCORE', 'NIVEAU', 'DATE'];

    const padX = width * 0.055;
    const rowW = width - padX * 2;
    const headerY = height * 0.153;

    headers.forEach((h, i) => {
      this.own(this.add.text(cols[i], headerY, h, this.mono(15, '#778899')));
    });
    g.lineStyle(1, 0x334455);
    g.lineBetween(padX, headerY + this.sp(22), width - padX, headerY + this.sp(22));

    if (scores.length === 0) {
      this.own(
        this.add.text(cx, height * 0.45, 'Aucun score encore\nJouez et revenez !',
          this.mono(22, '#445566', { align: 'center' })).setOrigin(0.5)
      );
    }

    // Fit ten rows between the header and the buttons, whatever the height.
    const firstRow = headerY + this.sp(36);
    const bottomY = height - this.sp(96);
    const rowH = Math.max(20, Math.min(this.sp(46), (bottomY - firstRow) / 10));
    const barH = rowH - Math.min(8, rowH * 0.18);

    const rankColors = ['#ffdd44', '#bbbbbb', '#dd9955'];

    scores.slice(0, 10).forEach((entry, i) => {
      const ry = firstRow + i * rowH;
      const isNew = i === this.highlightRank;

      g.fillStyle(isNew ? 0x0d2a4a : (i % 2 === 0 ? 0x080814 : 0x0c0c1e), isNew ? 0.9 : 0.5);
      g.fillRect(padX, ry - 2, rowW, barH);

      if (isNew) {
        g.lineStyle(1, 0x2266aa);
        g.strokeRect(padX, ry - 2, rowW, barH);
      }

      const textColor = isNew ? '#66ffcc' : (rankColors[i] ?? '#aabbcc');
      const rankStr = i === 0 ? '1er' : i === 1 ? '2e' : i === 2 ? '3e' : `${i + 1}.`;
      const cells = portrait
        ? [rankStr, entry.name, entry.score.toLocaleString('fr-FR'), `${entry.level}`]
        : [rankStr, entry.name, entry.score.toLocaleString('fr-FR'), `Niv. ${entry.level}`, entry.date];

      cells.forEach((v, j) => {
        this.own(
          this.add.text(cols[j], ry - 2 + barH / 2, v, this.mono(isNew ? 19 : 18, textColor))
            .setOrigin(0, 0.5)
        );
      });

      // The badge needs room to the right of the last column.
      if (isNew && !portrait) {
        this.own(
          this.add.text(width - padX - this.sp(10), ry - 2 + barH / 2, '< NOUVEAU',
            this.mono(14, '#44ffaa')).setOrigin(1, 0.5)
        );
      }
    });

    // Buttons
    const btnY = height - this.sp(46);
    const spread = portrait ? width * 0.24 : this.sp(150);
    const size = portrait ? 22 : 28;

    this.button(
      cx - spread, btnY, '[ MENU ]', size, '#4488ff', '#88bbff',
      () => this.scene.start('Menu'),
      { stroke: '#001122', strokeThickness: 4 }
    );

    const playBtn = this.button(
      cx + spread, btnY, '[ REJOUER ]', size, '#00ff88', '#88ffcc',
      () => this.scene.start('Game', { level: 1, score: 0, hp: 3 }),
      { stroke: '#001122', strokeThickness: 4 }
    );

    this.tweens.add({
      targets: playBtn, scaleX: 1.04, scaleY: 1.04,
      duration: 700, yoyo: true, repeat: -1, ease: 'Sine.inOut',
    });
  }
}
