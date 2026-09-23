import {
  getMusicVolume, setMusicVolume,
  getSfxVolume, setSfxVolume,
  getStickSide, setStickSide,
  isTestMode, setTestMode,
} from '../systems/Settings';
import { isTouchDevice } from '../systems/TouchControls';
import { applyMusicVolume, refreshMusic } from '../systems/Music';
import { playSfx } from '../systems/Sfx';
import { UiScene } from './UiScene';

/** One tap of a volume arrow. Ten steps across the whole range. */
const VOLUME_STEP = 0.1;

interface OptionRow {
  label: string;
  value: string;
  /** Anything that will not fit in the slot between the arrows. */
  suffix?: string;
  onLeft: () => void;
  onRight: () => void;
}

export class OptionsScene extends UiScene {
  constructor() {
    super({ key: 'Options' });
  }

  create(): void {
    this.startResponsive();
  }

  protected draw(): void {
    const { width, height, portrait } = this.layout;
    const cx = width / 2;

    this.stars(140);

    this.own(
      this.add.text(cx, height * 0.14, 'OPTIONS',
        this.mono(portrait ? 38 : 46, '#4488ff', {
          align: 'center', stroke: '#002266', strokeThickness: 7,
        })
      ).setOrigin(0.5)
    );

    this.layoutRows(cx, height, this.rows());
  }

  private rows(): OptionRow[] {
    const rows: OptionRow[] = [this.musicRow(), this.sfxRow(), this.fullscreenRow()];
    // Handedness only means something where there is a thumb to favour.
    if (isTouchDevice()) rows.push(this.stickRow());
    rows.push(this.testRow());
    return rows;
  }

  /**
   * Builds every row, measures it, then places it.
   *
   * The widths cannot be assumed: the volume bar is drawn in block glyphs,
   * which are wider than a monospace estimate of the font size, and a slot
   * sized by hand ran the bar underneath both arrows. Measuring also keeps
   * the columns aligned with each other and the whole block centred, whatever
   * the labels say and whatever the window size.
   */
  private layoutRows(cx: number, height: number, rows: OptionRow[]): void {
    const mk = (text: string, color: string, originX: number) =>
      this.own(this.add.text(0, 0, text, this.mono(20, color)).setOrigin(originX, 0.5));

    const labels = rows.map(r => mk(r.label, '#88aaff', 0));
    const values = rows.map(r => mk(r.value, '#cfe4ff', 0.5));
    const suffixes = rows.map(r => (r.suffix ? mk(r.suffix, '#cfe4ff', 0) : null));
    const lefts = rows.map(r => this.button(0, 0, '◀', 22, '#ffcc44', '#ffee88', r.onLeft));
    const rights = rows.map(r => this.button(0, 0, '▶', 22, '#ffcc44', '#ffee88', r.onRight));

    const widest = (texts: (Phaser.GameObjects.Text | null)[]) =>
      texts.reduce((w, t) => Math.max(w, t ? t.displayWidth : 0), 0);

    const labelW = widest(labels);
    const slotW = widest(values);
    const arrowW = widest(lefts);
    const suffixW = widest(suffixes);
    const gap = this.sp(22);

    const total = labelW + arrowW * 2 + slotW + gap * 3 + (suffixW > 0 ? gap + suffixW : 0);
    const startX = cx - total / 2;

    const top = height * 0.3;
    const spacing = height * 0.1;

    rows.forEach((_row, i) => {
      const y = top + i * spacing;
      let x = startX;

      labels[i].setPosition(x, y);
      x += labelW + gap;

      lefts[i].setPosition(x + arrowW / 2, y);
      x += arrowW + gap;

      values[i].setPosition(x + slotW / 2, y);
      x += slotW + gap;

      rights[i].setPosition(x + arrowW / 2, y);
      x += arrowW + gap;

      suffixes[i]?.setPosition(x, y);
    });

    this.button(
      cx, top + rows.length * spacing + height * 0.06,
      '[ RETOUR ]', 26, '#00ff88', '#88ffcc',
      () => this.scene.start('Menu')
    );
  }

  /** Ten cells and a percentage, the same widget for both levels. */
  private levelRow(
    label: string, value: number, apply: (v: number) => void
  ): OptionRow {
    const filled = Math.round(value * 10);
    const step = (delta: number) => {
      apply(Math.min(1, Math.max(0, value + delta)));
      this.redraw();
    };

    return {
      label,
      value: '▮'.repeat(filled) + '▯'.repeat(10 - filled),
      suffix: `${Math.round(value * 100)}%`,
      onLeft: () => step(-VOLUME_STEP),
      onRight: () => step(VOLUME_STEP),
    };
  }

  private musicRow(): OptionRow {
    return this.levelRow('MUSIQUE', getMusicVolume(), v => {
      setMusicVolume(v);
      applyMusicVolume();
      // Crossing zero either starts the track or stops fetching it at all.
      refreshMusic(this);
    });
  }

  private sfxRow(): OptionRow {
    return this.levelRow('SONS', getSfxVolume(), v => {
      setSfxVolume(v);
      // Play one at the new level, so the setting is audible while you set it.
      playSfx(this, 'pickup');
    });
  }

  private fullscreenRow(): OptionRow {
    // Entering fullscreen has to come from a gesture, which a tap on these is.
    const toggle = () => {
      if (this.scale.isFullscreen) this.scale.stopFullscreen();
      else this.scale.startFullscreen();
      this.redraw();
    };
    return {
      label: 'PLEIN ÉCRAN',
      value: this.scale.isFullscreen ? 'OUI' : 'NON',
      onLeft: toggle,
      onRight: toggle,
    };
  }

  private stickRow(): OptionRow {
    const side = getStickSide();
    const toggle = () => {
      setStickSide(side === 'right' ? 'left' : 'right');
      this.redraw();
    };
    return {
      label: 'STICK',
      value: side === 'right' ? 'DROITE' : 'GAUCHE',
      onLeft: toggle,
      onRight: toggle,
    };
  }

  private testRow(): OptionRow {
    const on = isTestMode();
    const toggle = () => {
      setTestMode(!on);
      this.redraw();
    };
    return {
      label: 'MODE TEST',
      value: on ? 'ACTIF' : 'INACTIF',
      onLeft: toggle,
      onRight: toggle,
    };
  }
}
