#!/usr/bin/env node
/**
 * draw.mjs — pixel art in the pixloveorg GitHub contribution graph.
 *
 * Every year from 1990 to 2026 gets a picture: 1990–2021 the year in a 5x7
 * font with an icon of its time, 2022–2026 Pixlove's story (hearts, the
 * mountains, the games, a pencil and a heart, PIXLOVE). Each "pixel" is one
 * day; its shade comes from how many empty commits that day gets (LEVEL_COMMITS).
 *
 * The graph is 53 columns (weeks, Sunday first) by 7 rows (days). A year's
 * column 0 is the week holding 1 January.
 *
 *   node draw.mjs preview [year...]   ASCII preview of the years (all by default)
 *   node draw.mjs build [year...]     rebuild the repo's history: one empty commit
 *                                     per needed contribution, then README.md
 *   node draw.mjs push                send it to origin in steps GitHub counts in full
 *
 * `build` replaces the current branch's history (git fast-import into a fresh
 * ref), so a re-run after changing a drawing needs a force push.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const AUTHOR = 'Paul Wojtowicz <social@pixlove.org>';
/** Commits per day for shades 1–4. GitHub picks the shades itself from the counts, so these may need tuning once seen live. */
const LEVEL_COMMITS = [0, 1, 3, 6, 10];
/** Contributions the account already had (GitHub API, 2026-11-08): a drawn day on them gets only what is missing. */
const EXISTING = { '2026-03-27': 1, '2026-11-07': 3, '2026-11-08': 1 };
const FIRST_YEAR = 1990;
/** Seconds added to every drawing commit's time; bump it to get new hashes for a re-send (see pushInSteps). */
const SALT = 1;
const LAST_YEAR = 2026;

const DIGITS = {
  0: ['.###.', '#...#', '#..##', '#.#.#', '##..#', '#...#', '.###.'],
  1: ['..#..', '.##..', '..#..', '..#..', '..#..', '..#..', '.###.'],
  2: ['.###.', '#...#', '....#', '...#.', '..#..', '.#...', '#####'],
  3: ['####.', '....#', '....#', '.###.', '....#', '....#', '####.'],
  4: ['...#.', '..##.', '.#.#.', '#..#.', '#####', '...#.', '...#.'],
  5: ['#####', '#....', '####.', '....#', '....#', '#...#', '.###.'],
  6: ['.###.', '#....', '#....', '####.', '#...#', '#...#', '.###.'],
  7: ['#####', '....#', '...#.', '..#..', '.#...', '.#...', '.#...'],
  8: ['.###.', '#...#', '#...#', '.###.', '#...#', '#...#', '.###.'],
  9: ['.###.', '#...#', '#...#', '.####', '....#', '....#', '.###.'],
};
/** The PIXLOVE letters of scripts/pixel-wordmark.ts, with I narrowed to 3 so 27 March 2026 falls on the X. */
const LETTERS = {
  P: ['####.', '#...#', '#...#', '####.', '#....', '#....', '#....'],
  I: ['###', '.#.', '.#.', '.#.', '.#.', '.#.', '###'],
  X: ['#...#', '#...#', '.#.#.', '..#..', '.#.#.', '#...#', '#...#'],
  L: ['#....', '#....', '#....', '#....', '#....', '#....', '#####'],
  O: ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  V: ['#...#', '#...#', '#...#', '#...#', '#...#', '.#.#.', '..#..'],
  E: ['#####', '#....', '#....', '####.', '#....', '#....', '#####'],
};
/** 1990–2021, in year order: `#` dark, `+` mid, `h` light. */
const ERA_ICONS = [
  ['floppy', ['######.', '#.hhh.#', '#.hhh.#', '#######', '#+++++#', '#+++++#', '#######']],
  ['monitor', ['#######', '#hhhhh#', '#h+++h#', '#hhhhh#', '#######', '..###..', '.#####.']],
  ['joystick', ['...#...', '..###..', '...#...', '...#...', '.#####.', '#+###+#', '#######']],
  ['cassette', ['#######', '#.....#', '#.#.#.#', '#.....#', '#######', '#+++++#', '.#####.']],
  ['keyboard', ['.......', '#######', '#h#h#h#', '#######', '#h#h#h#', '#######', '.......']],
  ['mouse', ['..###..', '.#.#.#.', '.#.#.#.', '.#####.', '.#####.', '.#####.', '..###..']],
  ['cd', ['..###..', '.#hhh#.', '#hh+hh#', '#h+.+h#', '#hh+hh#', '.#hhh#.', '..###..']],
  ['phone', ['.#####.', '#.....#', '..###..', '.#####.', '.##h##.', '.#####.', '.#####.']],
  ['handheld', ['.#####.', '.#hhh#.', '.#hhh#.', '.#####.', '.#+#+#.', '.#####.', '.#####.']],
  ['internet', ['..###..', '.#+#+#.', '#+#+#+#', '#######', '#+#+#+#', '.#+#+#.', '..###..']],
  ['y2k bug', ['#.....#', '.#.#.#.', '..###..', '#######', '..###..', '.#####.', '#.#.#.#']],
  ['rocket', ['...#...', '..###..', '..#h#..', '..###..', '.#####.', '.#.#.#.', '..+.+..']],
  ['music', ['...####', '...#..#', '...#..#', '...#..#', '.###.##', '####.##', '.##....']],
  ['mobile', ['..###..', '..#h#..', '..###..', '..###..', '..#+#..', '..###..', '.......']],
  ['headphones', ['.#####.', '#.....#', '#.....#', '##...##', '##...##', '.......', '.......']],
  ['gamepad', ['.......', '.#####.', '#######', '#+#####', '###.#h#', '##...##', '.......']],
  ['camera', ['..##...', '#######', '#..#..#', '#.#h#.#', '#..#..#', '#######', '.......']],
  ['smartphone', ['..###..', '..#h#..', '..#h#..', '..#h#..', '..#h#..', '..###..', '..#+#..']],
  ['laptop', ['.#####.', '.#hhh#.', '.#hhh#.', '.#####.', '#######', '#######', '.......']],
  ['cloud', ['.......', '..##...', '.####..', '.#####.', '#######', '#######', '.......']],
  ['tablet', ['.#####.', '.#hhh#.', '.#hhh#.', '.#hhh#.', '.#hhh#.', '.##+##.', '.#####.']],
  ['sword', ['.....#.', '....#h.', '...#h..', '#.#h...', '.##....', '.##....', '#..#...']],
  ['potion', ['..###..', '...#...', '..###..', '.#hhh#.', '#h+++h#', '#+++++#', '.#####.']],
  ['coin', ['..###..', '.#hhh#.', '#h#+#h#', '#h#+#h#', '#h#+#h#', '.#hhh#.', '..###..']],
  ['key', ['.##....', '#..#...', '#..####', '.##..#.', '.....##', '.......', '.......']],
  ['robot', ['...#...', '.#####.', '.#h#h#.', '.#####.', '#.###.#', '..#.#..', '..#.#..']],
  ['palette', ['.####..', '#h.+.#.', '#.....#', '#+.h..#', '#....#.', '.####..', '.......']],
  ['brush', ['......#', '.....#.', '....#..', '...#...', '.++....', '+++....', '++.....']],
  ['bucket', ['.......', '.#####.', '#.....#', '#+++++#', '#+++++#', '.#+++#.', '..###..']],
  ['eraser', ['.......', '..#####', '.#hhh#.', '#####..', '#+++#..', '#####..', '.......']],
  ['house', ['...#...', '..###..', '.#####.', '#######', '.##h##.', '.##h##.', '.#####.']],
  ['star', ['...#...', '...#...', '#######', '.#####.', '..###..', '.##.##.', '#.....#']],
];
const HEART = ['.##.##.', '####h##', '#######', '.#####.', '..###..', '...#...', '.......'];
const GAME_ICONS = [
  ['..###..', '..###..', '...#...', '..###..', '..###..', '.#####.', '#######'], // chess pawn
  ['#.#.#.#', '#######', '.#####.', '.##h##.', '.#####.', '.#####.', '#######'], // fort tower
  ['.#####.', '#..#..#', '...#...', '...#...', '...#...', '...#...', '...#...'], // mine pick
  ['..#....', '.###...', '.#h#.##', '.###.##', '##h##h#', '#######', '#######'], // city
  ['..###..', '..#h#..', '...#...', '.#####.', '...#...', '..#.#..', '.#...#.'], // troopling
];
const PENCIL = ['.....##', '....###', '...###.', '..###..', '.###...', 'hh.....', 'h......'];

/** Puts `rows` at column `x0`: `#` → dark, `h` → light, `+` → mid (shades 1–4). */
function stamp(cells, rows, x0, dark, light = 1, mid = 2) {
  rows.forEach((row, y) => [...row].forEach((ch, x) => {
    const level = ch === '#' ? dark : ch === 'h' ? light : ch === '+' ? mid : 0;
    if (level) cells.push([x0 + x, y, level]);
  }));
}

/** The picture of one year as [column, row, shade] cells. */
function drawing(year) {
  const cells = [];
  if (year <= 2021) {
    let x = 13;
    for (const d of String(year)) { stamp(cells, DIGITS[d], x, 3); x += 6; }
    stamp(cells, ERA_ICONS[year - FIRST_YEAR][1], x + 2, 4);
  } else if (year === 2022) {
    [1, 2, 3, 4, 4].forEach((shade, i) => stamp(cells, HEART, 1 + i * 9, shade, shade > 2 ? 1 : shade));
  } else if (year === 2023) {
    const peaks = [[5, 5], [14, 6], [23, 4], [32, 6], [41, 3]];
    for (let x = 0; x < 44; x++) {
      let h = 0, peak = 0;
      for (const [px, ph] of peaks) { const v = ph - Math.abs(x - px); if (v > h) { h = v; peak = px; } }
      h = Math.min(h, 6);
      for (let k = 0; k < h; k++) cells.push([1 + x, 5 - k, k === h - 1 && h >= 5 ? 1 : x > peak ? 4 : 3]);
      cells.push([1 + x, 6, x % 3 === 0 ? 1 : 2]); // the lake
    }
  } else if (year === 2024) {
    GAME_ICONS.forEach((icon, i) => stamp(cells, icon, 1 + i * 9, 4));
  } else if (year === 2025) {
    for (let x = 0; x < 36; x++) {
      const y = Math.max(0, Math.min(6, Math.round(3 - 3 * Math.sin(x * 0.42))));
      cells.push([1 + x, y, x < 12 ? 1 : x < 24 ? 2 : 3]);
    }
    stamp(cells, PENCIL, 36, 3);
    // November–December: the heart that opens the rolling last-12-months view next to 2026's PIXLOVE.
    stamp(cells, HEART, 45, 4, 2);
  } else if (year === 2026) {
    let x = 2;
    [...'PIXLOVE'].forEach((ch, i) => { stamp(cells, LETTERS[ch], x, i < 3 ? 2 : 4); x += LETTERS[ch][0].length + 1; });
  }
  return cells;
}

const DAY = 864e5;
const iso = (t) => new Date(t).toISOString().slice(0, 10);
/** The Sunday on or before 1 January: column 0, row 0. */
const gridStart = (year) => { const j = Date.UTC(year, 0, 1); return j - new Date(j).getUTCDay() * DAY; };

/** date → shade for the years asked, only days inside the year and before today. */
function shades(years) {
  const today = iso(Date.now());
  const out = new Map();
  for (const year of years) {
    const start = gridStart(year);
    for (const [col, row, shade] of drawing(year)) {
      const t = start + (col * 7 + row) * DAY;
      const day = iso(t);
      if (new Date(t).getUTCFullYear() !== year || day >= today) continue;
      out.set(day, Math.max(shade, out.get(day) ?? 0));
    }
  }
  return out;
}

function preview(years) {
  const map = shades(years);
  for (const year of years) {
    const name = year <= 2021 ? ERA_ICONS[year - FIRST_YEAR][0] : '';
    console.log(`\n${year} ${name}`);
    const start = gridStart(year);
    for (let row = 0; row < 7; row++) {
      let line = '';
      for (let col = 0; col < 53; col++) {
        const t = start + (col * 7 + row) * DAY;
        line += new Date(t).getUTCFullYear() !== year ? ' ' : ' .░▒▓█'[1 + (map.get(iso(t)) ?? 0)];
      }
      console.log(line);
    }
  }
}

function build(years) {
  const map = shades(years);
  const days = [...map.keys()].sort();
  const name = AUTHOR.replace(/ <.*/, '');
  const mail = AUTHOR.replace(/.*</, '<');
  let stream = '';
  let mark = 0;
  let total = 0;
  const commit = (seconds, message, files = '') => {
    mark++;
    stream += `commit refs/heads/main\nmark :${mark}\nauthor ${name} ${mail} ${seconds} +0000\ncommitter ${name} ${mail} ${seconds} +0000\ndata ${Buffer.byteLength(message)}\n${message}\n`;
    if (mark > 1) stream += `from :${mark - 1}\n`;
    stream += files + '\n';
  };
  for (const day of days) {
    const want = LEVEL_COMMITS[map.get(day)] - (EXISTING[day] ?? 0);
    const noon = Date.parse(`${day}T12:00:00Z`) / 1000 + SALT;
    for (let i = 0; i < want; i++) { commit(noon + i * 60, `pixel ${day}`); total++; }
  }
  const readme = readFileSync(new URL('./README.md', import.meta.url));
  const script = readFileSync(new URL('./draw.mjs', import.meta.url));
  const now = Math.floor(Date.now() / 1000);
  commit(now, 'The drawing and its script',
    `M 100644 inline README.md\ndata ${readme.length}\n${readme}\nM 100644 inline draw.mjs\ndata ${script.length}\n${script}\n`);
  execFileSync('git', ['fast-import', '--quiet', '--force'], { input: stream, stdio: ['pipe', 'inherit', 'inherit'] });
  execFileSync('git', ['reset', '--hard', '-q', 'main']);
  console.log(`${days.length} days, ${total} drawing commits, years ${years[0]}–${years[years.length - 1]}`);
}

/**
 * GitHub counts only the newest ~1000 commits of one push, so the history goes
 * up in steps of PUSH_STEP commits, oldest first; the first step force-resets
 * the remote branch. `salt` gives every commit a new hash, for re-sending a
 * history GitHub has already seen (it does not recount commits it knows).
 */
const PUSH_STEP = 900;
function pushInSteps() {
  const shas = execFileSync('git', ['rev-list', '--reverse', 'main'], { encoding: 'utf8' }).trim().split('\n');
  for (let i = PUSH_STEP - 1, first = true; ; i += PUSH_STEP, first = false) {
    const sha = shas[Math.min(i, shas.length - 1)];
    execFileSync('git', ['push', '-q', ...(first ? ['--force'] : []), 'origin', `${sha}:refs/heads/main`], { stdio: 'inherit' });
    console.log(`pushed ${Math.min(i + 1, shas.length)} / ${shas.length}`);
    if (i >= shas.length - 1) break;
  }
}

const [cmd, ...args] = process.argv.slice(2);
const years = args.length ? args.map(Number) : Array.from({ length: LAST_YEAR - FIRST_YEAR + 1 }, (_, i) => FIRST_YEAR + i);
if (cmd === 'preview') preview(years);
else if (cmd === 'build') build(years);
else if (cmd === 'push') pushInSteps();
else { console.error('usage: node draw.mjs preview|build [year...] | push'); process.exit(1); }
