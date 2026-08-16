// js/npc-pdf-export.js
import { PDFDocument, StandardFonts, rgb } from './lib/pdf-lib.esm.min.js';

// --- Coordinates below are in PDF point space (origin bottom-left, y up). ---
// Derived from a 150-DPI render of CoyoteCrowCharacterSheet-v1.01.pdf
// (page size 615.6 x 792.24 pt) measured against a pixel grid; see the plan's
// Implementation Notes for the px -> pt conversion and confidence notes.

// NOTE: coordinates below were re-measured by rendering the template to a
// 150-DPI PNG and locating text/underline/fill pixels programmatically
// (row dividers, column background-fill boundaries) rather than eyeballing
// a grid overlay. The header-field, Gifts & Burdens, Initiative, and Ability
// Y values needed a systematic downward correction (the initial estimates
// sat 15-30px too high, i.e. above the printed line instead of on it). The
// stat-grid column centers needed a larger, growing correction (later
// columns were up to 76px off). The General Skills row pitch measured
// 31.45px (15.1pt) across 11 intervals, not 14.4pt as originally estimated.
const NAME_X = 120, NAME_Y = 680.88;
const AGE_X = 376, AGE_Y = 680.88;
const ARCHETYPE_X = 121.44, ARCHETYPE_Y = 656.88;
const PATH_X = 284, PATH_Y = 656.88;
const MOTIVATION_X = 447.84, MOTIVATION_Y = 656.88;

const GB_X = 144, GB_Y_LINE1 = 560.88, GB_Y_LINE2 = 536.88, GB_MAX_WIDTH = 400;

// Each stat row: [statA, statB, statC, derivedDefenceKey, derivedBodyKey]
const STAT_ROWS = [
  ['Strength', 'Agility', 'Endurance', 'Physical Defence', 'Body'],
  ['Intelligence', 'Perception', 'Wisdom', 'Mental Defence', 'Mind'],
  ['Spirit', 'Charisma', 'Will', 'Mystical Defence', 'Soul'],
];
const STAT_ROW_Y = [392, 350, 313.25];
// Column x per row: [statA, statB, statC, defence, derivedBody, currentBody]
const STAT_COL_X = [76.8, 119.5, 162.2, 211.9, 254.2, 296.9];

const INITIATIVE_X = 554.4, INITIATIVE_Y = 430.8;

const ABILITY_NAME_X = 382, ABILITY_NAME_Y = 401.04;
const ABILITY_DESC_X = 314.4;
const ABILITY_DESC_Y = [382.32, 363.12];
const ABILITY_DESC_MAX_WIDTH = 240;

// General Skills: rows are shared between the left (skills.json index 0-13)
// and right (index 14-27) columns, 14 rows each, ~15.1pt apart (measured
// from 11 consecutive row-divider intervals in the rendered template).
// Skill NAMES are already printed on the template - only Rank and Total
// are drawn.
const GENERAL_ROW_Y = i => 235.0 - 15.1 * i;
const GENERAL_LEFT_RANK_X = 175.2, GENERAL_LEFT_TOTAL_X = 205;
const GENERAL_RIGHT_RANK_X = 365, GENERAL_RIGHT_TOTAL_X = 386;

// Specialized Skills: no pre-printed names, filled sequentially from row 0
// using the same row pitch as the General Skills table.
const SPEC_NAME_X = 406, SPEC_RANK_X = 528, SPEC_TOTAL_X = 550;

function gbLabel(g) {
  const lvl = Math.abs(g.magnitude);
  const levelWord = lvl === 1 ? 'trivial' : lvl === 2 ? 'serious' : 'critical';
  const type = g.magnitude > 0 ? 'Gift' : 'Burden';
  return `${g.name} ${g.magnitude > 0 ? '+' : ''}${g.magnitude} ${type} (${levelWord})`;
}

function skillPool(skillDef, npc) {
  const acquired = npc.skills[skillDef.name];
  const rank = acquired ? acquired.general : 0;
  const vals = skillDef.diceCheck.map(s => npc.stats[s] || 0);
  const higher = Math.max(...vals);
  const lower = Math.min(...vals);
  const pool = rank >= 1 ? higher + rank : lower;
  return { rank, pool };
}

function wrapText(text, font, size, maxWidth) {
  const words = String(text || '').split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (line && font.widthOfTextAtSize(candidate, size) > maxWidth) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines;
}

export async function buildNpcSheetPdf(npc, allSkills) {
  const res = await fetch('CoyoteCrowCharacterSheet-v1.01.pdf');
  if (!res.ok) throw new Error('Failed to load character sheet template');
  const templateBytes = await res.arrayBuffer();

  const pdfDoc = await PDFDocument.load(templateBytes);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const page = pdfDoc.getPages()[0];
  const black = rgb(0, 0, 0);

  function draw(text, x, y, size) {
    const s = text === null || text === undefined ? '' : String(text);
    if (!s) return;
    page.drawText(s, { x, y, size, font, color: black });
  }

  // STAT_COL_X values are measured as horizontal centers of each stat-grid
  // cell, not left edges - center the text on them rather than left-aligning,
  // so single-digit stats and two-digit derived values (e.g. Body "12") both
  // land visually centered in their cell.
  function drawCentered(text, cx, y, size) {
    const s = text === null || text === undefined ? '' : String(text);
    if (!s) return;
    const x = cx - font.widthOfTextAtSize(s, size) / 2;
    page.drawText(s, { x, y, size, font, color: black });
  }

  draw(npc.name, NAME_X, NAME_Y, 11);
  draw(npc.age, AGE_X, AGE_Y, 10);
  draw(npc.archetype, ARCHETYPE_X, ARCHETYPE_Y, 10);

  const PATH_PREFIX = 'Path of the ';
  const pathName = npc.path.name.startsWith(PATH_PREFIX)
    ? npc.path.name.slice(PATH_PREFIX.length)
    : npc.path.name;
  draw(pathName, PATH_X, PATH_Y, 10);

  draw(npc.motivation.name, MOTIVATION_X, MOTIVATION_Y, 10);

  const gbText = npc.giftsAndBurdens.length > 0
    ? npc.giftsAndBurdens.map(gbLabel).join(', ')
    : 'None';
  const gbLines = wrapText(gbText, font, 9, GB_MAX_WIDTH).slice(0, 2);
  draw(gbLines[0], GB_X, GB_Y_LINE1, 9);
  draw(gbLines[1], GB_X, GB_Y_LINE2, 9);

  for (let r = 0; r < STAT_ROWS.length; r++) {
    const [s1, s2, s3, defKey, bodyKey] = STAT_ROWS[r];
    const y = STAT_ROW_Y[r];
    drawCentered(npc.stats[s1], STAT_COL_X[0], y, 10);
    drawCentered(npc.stats[s2], STAT_COL_X[1], y, 10);
    drawCentered(npc.stats[s3], STAT_COL_X[2], y, 10);
    drawCentered(npc.derived[defKey], STAT_COL_X[3], y, 10);
    drawCentered(npc.derived[bodyKey], STAT_COL_X[4], y, 10);
    const current = npc.current ? npc.current[bodyKey] : npc.derived[bodyKey];
    drawCentered(current, STAT_COL_X[5], y, 10);
  }

  draw(npc.derived.Initiative, INITIATIVE_X, INITIATIVE_Y, 10);

  const abilityHeader = npc.ability.diceCheck && npc.ability.diceCheck.length
    ? `${npc.ability.name} [${npc.ability.diceCheck.join(' + ')}]`
    : npc.ability.name;
  draw(abilityHeader, ABILITY_NAME_X, ABILITY_NAME_Y, 10);
  const abilityDescLines = wrapText(npc.ability.description, font, 8, ABILITY_DESC_MAX_WIDTH).slice(0, 2);
  draw(abilityDescLines[0], ABILITY_DESC_X, ABILITY_DESC_Y[0], 8);
  draw(abilityDescLines[1], ABILITY_DESC_X, ABILITY_DESC_Y[1], 8);

  const half = Math.ceil(allSkills.length / 2);
  allSkills.forEach((skillDef, i) => {
    // Draw every one of the 28 rows, ranked or not - unranked skills still
    // have a real (lower-stat) dice pool, matching the on-screen table's
    // `generalSkillRow`, which renders all rows and only dims unranked ones
    // visually (a CSS-only distinction with no PDF equivalent needed here).
    const { rank, pool } = skillPool(skillDef, npc);
    const rowIndex = i < half ? i : i - half;
    const y = GENERAL_ROW_Y(rowIndex);
    const rankX = i < half ? GENERAL_LEFT_RANK_X : GENERAL_RIGHT_RANK_X;
    const totalX = i < half ? GENERAL_LEFT_TOTAL_X : GENERAL_RIGHT_TOTAL_X;
    draw(rank, rankX, y, 9);
    draw(pool, totalX, y, 9);
  });

  const specEntries = Object.entries(npc.skills)
    .filter(([, d]) => d.specialized)
    .map(([generalName, d]) => ({ generalName, name: d.specialized.name, rank: d.specialized.rank }));
  specEntries.forEach((entry, i) => {
    const skillDef = allSkills.find(s => s.name === entry.generalName);
    if (!skillDef) return;
    const vals = skillDef.diceCheck.map(s => npc.stats[s] || 0);
    const higher = Math.max(...vals);
    const pool = higher + entry.rank;
    const y = GENERAL_ROW_Y(i);
    draw(entry.name, SPEC_NAME_X, y, 8);
    draw(entry.rank, SPEC_RANK_X, y, 9);
    draw(pool, SPEC_TOTAL_X, y, 9);
  });

  return pdfDoc.save();
}
