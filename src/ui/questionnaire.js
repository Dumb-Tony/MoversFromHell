/* The §27.3 playtest questionnaire, asked IN the game — Phase 11 build-side M6.
 *
 * GDD §27.3 lists seven questions to ask a playtest group. Until now only the developer had
 * ever answered them (docs/PLAYTEST_NOTES.md), which is not a playtest. The Phase 11 gate is
 * "external groups complete and replay" (§25.2), so the questions go where the group already
 * is at the moment they have an opinion: under the invoice, on the settlement sheet.
 *
 * The seven sentences are the GDD's, VERBATIM and in its order (m17 Q1 pins them). Five are
 * a 1..5 scale with a word at each end — colour-independent by construction (§26.5) — and two
 * are a line of text. Skip is a real button: an unanswered form is null, never a row of 3s.
 *
 * KEYS TYPED HERE MUST NOT REACH THE GAME. Input listens for keydown on window (bubble), the
 * title card and the settings card do too, and Escape is the pause toggle — so every key event
 * inside the form stops at the form (m17 Q5). The same rule settings.js applies to its card.
 *
 * The form never touches game state; its answers are read out on demand (answers()) by the
 * settlement sheet's export and by main.js when the run is closed.
 */

import { TELEMETRY } from '../config.js';

/** §27.3, GDD.md, in the GDD's order. `low`/`high` are the scale's text anchors. */
export const QUESTIONS = Object.freeze([
  { id: 'q1', kind: 'text',  text: 'What did the team try that the game allowed or unexpectedly prevented?' },
  { id: 'q2', kind: 'scale', text: 'When did weight and grip become understandable?', low: 'never did', high: 'straight away' },
  { id: 'q3', kind: 'scale', text: 'Did preparation feel like choice or chore?', low: 'chore', high: 'choice' },
  { id: 'q4', kind: 'scale', text: 'Could players predict cargo shift and damage?', low: 'never', high: 'every time' },
  { id: 'q5', kind: 'scale', text: 'Was the invoice funny and useful or merely punitive?', low: 'merely punitive', high: 'funny and useful' },
  { id: 'q6', kind: 'text',  text: 'Which moment would they tell a friend about?' },
  { id: 'q7', kind: 'scale', text: 'Would they replay the same contract differently?', low: 'no', high: 'definitely' },
].map((q) => Object.freeze(q)));

const SCALE = TELEMETRY.questionnaire;

/** The form's markup. A function of the question table only — no state. */
export function questionnaireHtml() {
  const pips = [];
  for (let v = SCALE.scaleMin; v <= SCALE.scaleMax; v++) pips.push(v);
  const rows = QUESTIONS.map((q) => {
    if (q.kind === 'scale') {
      const inputs = pips.map((v) =>
        `<label class="pip"><input type="radio" name="${q.id}" value="${v}"><span>${v}</span></label>`).join('');
      return `<fieldset class="q scale" data-q="${q.id}" data-kind="scale">` +
        `<legend class="qtext">${esc(q.text)}</legend>` +
        `<div class="scale-row"><span class="anchor low">${esc(q.low)}</span>${inputs}` +
        `<span class="anchor high">${esc(q.high)}</span></div></fieldset>`;
    }
    return `<fieldset class="q text" data-q="${q.id}" data-kind="text">` +
      `<legend class="qtext">${esc(q.text)}</legend>` +
      `<input type="text" name="${q.id}" maxlength="${TELEMETRY.textMax}" autocomplete="off" ` +
      `spellcheck="false" placeholder="a few words"></fieldset>`;
  }).join('');
  return `<form class="questionnaire" autocomplete="off">
      <div class="thead"><span>PLAYTEST · seven questions (§27.3)</span>` +
      `<button type="button" class="minor" data-act="skip">Skip</button></div>
      ${rows}
    </form>`;
}

/**
 * Read a form's answers as plain data. Exported and pure over the DOM node so the suite can
 * call it on any form. Returns null when nothing is answered.
 * @param {HTMLFormElement|null} form
 */
export function readAnswers(form) {
  if (!form) return null;
  const out = {};
  let any = false;
  for (const q of QUESTIONS) {
    if (q.kind === 'scale') {
      const picked = form.querySelector(`input[name="${q.id}"]:checked`);
      if (!picked) continue;
      const v = Number(picked.value);
      if (!Number.isFinite(v) || v < SCALE.scaleMin || v > SCALE.scaleMax) continue;
      out[q.id] = v; any = true;
    } else {
      const el = form.querySelector(`input[name="${q.id}"]`);
      const v = el ? String(el.value || '').trim().slice(0, TELEMETRY.textMax) : '';
      if (!v) continue;
      out[q.id] = v; any = true;
    }
  }
  return any ? out : null;
}

export class Questionnaire {
  constructor() {
    /** The live form, or null between settlements. */
    this.el = null;
    this.skipped = false;
    /** Called with answers() (or null) after any change — main.js persists them (§27.4). */
    this.onChange = null;
  }

  /** Bind to a freshly rendered form inside `host` (the settlement sheet re-renders per run). */
  mount(host) {
    this.el = host ? host.querySelector('form.questionnaire') : null;
    this.skipped = false;
    if (!this.el) return this;
    // Every key stays in the form: Input, the title card and the settings card all listen on
    // window, and Escape would otherwise toggle the pause under the sheet (m17 Q5).
    for (const type of ['keydown', 'keyup', 'keypress']) {
      this.el.addEventListener(type, (e) => e.stopPropagation());
    }
    this.el.addEventListener('submit', (e) => e.preventDefault());
    this.el.addEventListener('change', () => { if (this.onChange) this.onChange(this.answers()); });
    return this;
  }

  /** {q1..q7} of what is answered, or null — also null once skipped or unmounted. */
  answers() {
    if (!this.el || this.skipped) return null;
    return readAnswers(this.el);
  }

  /** Collapse the questions; answers() is null from here until the next mount. */
  skip() {
    this.skipped = true;
    if (this.el) this.el.classList.add('skipped');
    if (this.onChange) this.onChange(null);
  }

  /** Forget the form (the sheet's DOM is rebuilt on the next show()). */
  clear() {
    this.el = null;
    this.skipped = false;
  }
}

function esc(s) {
  return String(s).replace(/[&<>"]/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}
