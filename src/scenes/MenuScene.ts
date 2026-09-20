import { getStickSide, setStickSide, isMusicOn, setMusicOn } from '../systems/Settings';
import { isTouchDevice } from '../systems/TouchControls';
import { prefetchMusic, refreshMusic } from '../systems/Music';
import { UiScene } from './UiScene';

export class MenuScene extends UiScene {
  constructor() {
    super({ key: 'Menu' });
  }

  create(): void {
    this.startResponsive();
    // The menu is where the player lingers, so it is the cheapest place to
    // pull the game theme down before a run needs it.
    prefetchMusic(this, 'game');
  }

  protected draw(): void {
    const { width, height, portrait } = this.layout;
    const cx = width / 2;

    this.stars(200);

    // Title
    this.own(
      this.add.text(cx, height * 0.19, 'HUNDRED LEVEL\nLASER',
        this.mono(portrait ? 46 : 56, '#4488ff', {
          align: 'center', stroke: '#002266', strokeThickness: 8,
        })
      ).setOrigin(0.5)
    );

    // Subtitle
    this.own(
      this.add.text(cx, height * 0.375, '100 niveaux. Survivez.', this.mono(22, '#88aaff'))
        .setOrigin(0.5)
    );

    // Best level
    const best = parseInt(localStorage.getItem('hll-best') ?? '0', 10);
    if (best > 0) {
      this.own(
        this.add.text(cx, height * 0.458, `Meilleur niveau : ${best}/100`, this.mono(18, '#ffcc44'))
          .setOrigin(0.5)
      );
    }

    // Play button
    const btn = this.button(
      cx, height * 0.583, '[ JOUER ]', 36, '#00ff88', '#88ffcc',
      () => this.scene.start('Game', { level: 1, score: 0, hp: 3 }),
      { stroke: '#004422', strokeThickness: 4 }
    );

    this.button(
      cx, height * 0.681, '[ MEILLEURS SCORES ]', 22, '#ffcc44', '#ffee88',
      () => this.scene.start('Leaderboard')
    );

    const touch = isTouchDevice();

    // Handedness. Only worth showing where it changes something.
    if (touch) {
      const side = getStickSide();
      this.button(
        cx, height * 0.752,
        side === 'right' ? '[ STICK À DROITE ]' : '[ STICK À GAUCHE ]',
        18, '#88aaff', '#ccddff',
        () => {
          setStickSide(side === 'right' ? 'left' : 'right');
          this.redraw();
        }
      );
    }

    // Controls, described for whichever scheme this device will get
    const controls = touch
      ? 'Pouce sur le stick pour vous déplacer\n' +
        'Bouton rouge pour tirer\n' +
        'Tuer tous les ennemis du niveau pour avancer\n' +
        '❚❚ en haut à gauche  Pause'
      : 'WASD / ↑↓←→  Déplacements\n' +
        'ESPACE  Tirer dans la direction du vaisseau\n' +
        'Tuer tous les ennemis du niveau pour avancer\n' +
        'ÉCHAP  Pause';

    this.own(
      this.add.text(cx, height * 0.84, controls,
        this.mono(15, '#556688', { align: 'center', wordWrap: { width: width * 0.92 } })
      ).setOrigin(0.5)
    );

    // Music toggle. It sits in the corner rather than in the button column so
    // it never shifts the menu around on a small screen.
    const music = isMusicOn();
    this.button(
      this.sp(14), this.sp(12),
      music ? '♪ MUSIQUE' : '♪ MUSIQUE OFF', 16,
      music ? '#88aaff' : '#445566', '#ccddff',
      () => {
        setMusicOn(!music);
        refreshMusic(this);
        this.redraw();
      }
    ).setOrigin(0, 0);

    // Build marker, so it is always clear which version is running.
    this.own(
      this.add.text(width - this.sp(10), height - this.sp(8), `v${__APP_VERSION__}`,
        this.mono(12, '#2c3a4a')).setOrigin(1, 1)
    );

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
