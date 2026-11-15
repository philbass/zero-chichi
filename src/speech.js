// Lecture à voix haute : voix de synthèse de l'appareil (Web Speech API), réglages propres à chaque appareil.
import { useEffect, useState } from 'react';
import { fmt } from './lib.js';

const KEY = 'zc:voice';
const DEFAULTS = { voice: '', rate: 1, readSteps: false, announceTimers: true };
export const synth = typeof window !== 'undefined' ? window.speechSynthesis : null;
export const canSpeak = !!synth && typeof SpeechSynthesisUtterance !== 'undefined';

let settings = (() => { try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY)) }; } catch { return { ...DEFAULTS }; } })();
const subs = new Set();
export const getVoiceSettings = () => settings;
export function setVoiceSettings(patch) {
  settings = { ...settings, ...patch };
  try { localStorage.setItem(KEY, JSON.stringify(settings)); } catch { /* stockage indisponible */ }
  subs.forEach(f => f(settings));
}
export function useVoiceSettings() {
  const [s, set] = useState(settings);
  useEffect(() => { subs.add(set); return () => subs.delete(set); }, []);
  return [s, setVoiceSettings];
}

/* ── Voix disponibles ── */
const isFr = v => /^fr/i.test(v.lang);
const nice = v => /premium|enhanced|améliorée|natural|neural|google/i.test(v.name);
const isFrance = v => /^fr[-_]FR/i.test(v.lang);
// Français de France d'abord, puis les autres français (Canada, Belgique, Suisse…).
const byRegion = list => [...list.filter(isFrance), ...list.filter(v => !isFrance(v))];
const REGIONS = { FR: 'France', CA: 'Canada', BE: 'Belgique', CH: 'Suisse', LU: 'Luxembourg' };
export const voiceRegion = v => REGIONS[(v.lang.split(/[-_]/)[1] || '').toUpperCase()] || '';
export function useVoices() {
  const [list, setList] = useState(() => (canSpeak ? synth.getVoices() : []));
  useEffect(() => {
    if (!canSpeak) return;
    const f = () => setList(synth.getVoices());
    f();
    synth.addEventListener?.('voiceschanged', f);
    return () => synth.removeEventListener?.('voiceschanged', f);
  }, []);
  const fr = byRegion(list.filter(isFr));
  return fr.length ? fr : list;
}
function pickVoice() {
  if (!canSpeak) return null;
  const all = synth.getVoices();
  const chosen = all.find(v => v.voiceURI === settings.voice);
  if (chosen) return chosen;
  const fr = all.filter(isFr), france = fr.filter(isFrance);
  return france.find(nice) || france.find(v => v.default) || france[0] || fr.find(nice) || fr[0] || null;
}
export const defaultVoiceURI = () => pickVoice()?.voiceURI || '';

/* ── Lecture : une file de phrases, lues l'une après l'autre ── */
let queue = [], pos = -1, onChange = null, paused = false;
const notify = () => onChange?.({ playing: pos >= 0 && !paused, paused, index: pos, total: queue.length });

function utter(text) {
  const u = new SpeechSynthesisUtterance(text);
  const v = pickVoice();
  u.lang = 'fr-FR';
  try { if (v) { u.voice = v; u.lang = v.lang; } } catch { /* voix refusée : voix par défaut */ }
  u.rate = settings.rate;
  return u;
}
function playAt(i) {
  pos = i;
  if (pos >= queue.length) { pos = -1; notify(); return; }
  notify();
  const u = utter(queue[pos]);
  const me = pos;
  u.onend = () => { if (pos === me && !paused) playAt(pos + 1); };
  u.onerror = () => {};
  try { synth.speak(u); } catch { pos = -1; notify(); }
}
/** Lit une suite de phrases. listener reçoit { playing, paused, index, total }. */
export function speak(parts, listener) {
  if (!canSpeak) return;
  stopSpeaking();
  queue = (Array.isArray(parts) ? parts : [parts]).filter(Boolean);
  onChange = listener || null;
  paused = false;
  playAt(0);
}
export function pauseSpeaking() { if (pos < 0 || paused) return; paused = true; synth.cancel(); notify(); }
export function resumeSpeaking() { if (pos < 0 || !paused) return; paused = false; playAt(pos); }
export function stopSpeaking() {
  if (!canSpeak) return;
  const had = pos >= 0;
  pos = -1; paused = false; synth.cancel();
  if (had) notify();
  onChange = null;
}

/* ── Texte à prononcer ── */
export function speakable(t) {
  return String(t)
    .replace(/\s*\(th\.\s*(\d+)\)/g, ', thermostat $1')
    .replace(/(\d+)\s*°C?/g, '$1 degrés')
    .replace(/(\d+)\s*h\s*(\d+)/g, '$1 heures $2')
    .replace(/(\d+)\s*h\b/g, (m, a) => a + (a === '1' ? ' heure' : ' heures'))
    .replace(/(\d+)\s*(min|mn)\b/g, '$1 minutes')
    .replace(/(\d+)\s*s\b(?=\s*[,.;)]|\s+vitesse)/g, '$1 secondes')
    .replace(/\bc\. à s\./g, 'cuillères à soupe').replace(/\bc\. à c\./g, 'cuillères à café')
    .replace(/(\d+)\s*kg\b/g, '$1 kilos').replace(/(\d+)\s*g\b/g, '$1 grammes')
    .replace(/(\d+)\s*cl\b/g, '$1 centilitres').replace(/(\d+)\s*ml\b/g, '$1 millilitres').replace(/(\d+)\s*cm\b/g, '$1 centimètres')
    .replace(/\b1\/4\b/g, 'un quart').replace(/\b1\/2\b/g, 'la moitié').replace(/\b3\/4\b/g, 'trois quarts')
    .replace(/\s*\(([^)]*)\)/g, ', $1');
}
const sayTime = m => {
  if (m < 60) return m + ' minutes';
  const h = Math.floor(m / 60), r = m % 60;
  return h + (h > 1 ? ' heures' : ' heure') + (r ? ' ' + r : '');
};
const UNITS = { g: ['gramme', 'grammes'], kg: ['kilo', 'kilos'], cl: ['centilitre', 'centilitres'], ml: ['millilitre', 'millilitres'], dl: ['décilitre', 'décilitres'], L: ['litre', 'litres'],
  'c. à s.': ['cuillère à soupe', 'cuillères à soupe'], 'c. à c.': ['cuillère à café', 'cuillères à café'] };
function sayIng([q, u, n0], k) {
  const n = speakable(n0);
  if (q === null) return 'un peu de ' + n;
  if (q === '' || q === undefined) return n;
  const num = typeof q === 'number' ? q * k : null;
  const qs = num != null ? fmt(num) : String(q);
  const uu = UNITS[u] ? (num != null && num > 1 ? UNITS[u][1] : UNITS[u][0]) : u;
  if (!uu) return qs + ' ' + n;
  return qs + ' ' + uu + (/^[aeiouyhéèêâœ]/i.test(n) ? " d'" : ' de ') + n;
}
const NEXT = ['Pour commencer,', 'Ensuite,', 'Puis,', 'Étape suivante :', 'Après ça,', 'On continue :'];
const lowerFirst = s => s.charAt(0).toLowerCase() + s.slice(1);

/** Le récit complet d'une recette, en phrases courtes. */
export function recipeScript(r, portions) {
  const k = portions / r.p;
  const who = r.yield ? `${portions} ${portions > 1 ? r.yield[1] : r.yield[0]}` : `${portions} ${portions > 1 ? 'personnes' : 'personne'}`;
  const wait = r.wait?.[0] > 0 ? `, plus ${r.wait[0] >= 1440 ? (d => d + (d > 1 ? ' jours' : ' jour'))(Math.round(r.wait[0] / 1440)) : r.wait[0] >= 600 ? 'une nuit' : sayTime(r.wait[0])} ${r.wait[1] || 'de repos'}` : '';
  const out = [`Aujourd'hui, au menu : ${r.name}. Une recette pour ${who}, prête en ${sayTime(r.t)}${wait}.`];
  out.push(`Côté courses, il te faut ${r.ing.length} ingrédients.`);
  const items = r.ing.map(i => sayIng(i, k));
  for (let i = 0; i < items.length; i += 4) out.push(items.slice(i, i + 4).join(', ') + (i + 4 >= items.length ? '.' : ','));
  out.push("C'est parti.");
  r.steps.forEach((s, i) => {
    const lead = r.steps.length > 1 && i === r.steps.length - 1 ? 'Et pour finir,' : NEXT[i % NEXT.length];
    out.push(lead + ' ' + lowerFirst(speakable(s)));
  });
  out.push('Et voilà ! Bon appétit.');
  return out;
}
export const stepScript = (r, i) => `Étape ${i + 1}. ${speakable(r.steps[i])}`;
