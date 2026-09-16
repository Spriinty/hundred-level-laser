interface NameInputOptions {
  maxLength: number;
  onChange: (value: string) => void;
  onSubmit: () => void;
}

/**
 * A transparent HTML input laid over the canvas.
 *
 * A canvas cannot summon a phone's on-screen keyboard — only a focused form
 * control can — so without this a player can finish a run on a phone and have
 * no way to save the score. The game carries on drawing the field itself, with
 * its own blinking cursor; this element is invisible and exists purely to
 * capture characters.
 */
export class NameInput {
  private el: HTMLInputElement;

  constructor(opts: NameInputOptions) {
    const el = document.createElement('input');
    el.type = 'text';
    el.autocomplete = 'off';
    el.spellcheck = false;
    el.maxLength = opts.maxLength;
    el.setAttribute('autocapitalize', 'characters');
    el.setAttribute('enterkeyhint', 'done');
    el.setAttribute('aria-label', 'Votre nom');

    Object.assign(el.style, {
      position: 'fixed',
      // Invisible, but not absent: a display:none or zero-sized control cannot
      // take focus, and iOS will not open the keyboard for one.
      opacity: '0',
      border: 'none',
      outline: 'none',
      background: 'transparent',
      padding: '0',
      margin: '0',
      // Under 16px, iOS zooms the whole page when the field takes focus.
      fontSize: '16px',
      caretColor: 'transparent',
      zIndex: '10',
    });

    el.addEventListener('input', () => {
      el.value = clean(el.value, opts.maxLength);
      opts.onChange(el.value);
    });

    el.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      opts.onSubmit();
    });

    document.body.appendChild(el);
    this.el = el;
  }

  /**
   * Lay the element over a rectangle given in game coordinates.
   *
   * Scale.RESIZE keeps the canvas at one CSS pixel per game pixel, so game
   * coordinates only need shifting by wherever the canvas sits on the page.
   */
  place(canvas: HTMLCanvasElement, x: number, y: number, w: number, h: number): void {
    const rect = canvas.getBoundingClientRect();
    Object.assign(this.el.style, {
      left: `${rect.left + x}px`,
      top: `${rect.top + y}px`,
      width: `${w}px`,
      height: `${h}px`,
    });
  }

  get value(): string {
    return this.el.value;
  }

  destroy(): void {
    this.el.blur();
    this.el.remove();
  }
}

/** The same alphabet the keyboard path accepts. */
function clean(value: string, maxLength: number): string {
  return value.toUpperCase().replace(/[^A-Z0-9 ]/g, '').slice(0, maxLength);
}
