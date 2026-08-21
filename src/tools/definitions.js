/* Tool definitions — GDD §9.1, §9.2, §23.1.
 *
 * §9.1's four PROTOTYPE-REQUIRED tools, and only those four. The same table lists furniture
 * sliders, an appliance dolly, a piano board, a winch and a forklift as "Later" or
 * "Expansion", and §29.1 is explicit about the order: "Make tools solve physical problems
 * before adding upgrade tiers." A second dolly would be an upgrade tier.
 *
 * The ratchet strap is also §9.1-required but belongs to Phase 7, where there is cargo to
 * restrain; building it here would mean testing it against nothing.
 *
 * §9.2's five rules shape the schema:
 *   - "Tools are world objects and consume cargo space unless mounted" -> every tool has
 *     mass and dimensions and spawns as a real body, so it can be left behind, dropped, run
 *     over, and packed. It counts against Phase 7's cargo volume like anything else.
 *   - "Deploy, attach, tension, fold, and retrieve through the common interaction system"
 *     -> one verb, `interact`. `mode` says what that verb MEANS for this tool, so the
 *     player learns one gesture rather than four.
 *   - "Tools have stable IDs and state so multiplayer authority and save snapshots can
 *     represent them" -> ids are strings, state is serializable (§22.4).
 */

import { TOOLS } from '../config.js';

/**
 * @typedef {object} ToolDef
 * @property {string} id
 * @property {'attach'|'cover'|'deploy'|'apply'} mode  what `interact` does with it
 * @property {number} mass
 * @property {{x,y,z}} dimensions
 * @property {string} effect      which physical quantity it changes (§9.1)
 */
export const TOOL_DEFS = Object.freeze({
  /* Goes UNDER an object and replaces its friction with rolling resistance. */
  dolly_flat_01: {
    id: 'dolly_flat_01',
    label: 'Flat dolly',
    mode: 'attach',
    mass: TOOLS.dolly.mass,
    dimensions: TOOLS.dolly.dimensions,
    effect: 'friction',
    /** §9.1's own words, kept next to the thing they describe so a later change to the
     *  behaviour has to argue with the design rather than quietly diverge from it. */
    primary: 'Roll heavy items on level ground',
    failure: 'Runs on slopes; load slips',
    colour: 0x4a5563,
  },

  /* Goes OVER an object and raises the speed it survives. */
  blanket_01: {
    id: 'blanket_01',
    label: 'Moving blanket',
    mode: 'cover',
    mass: TOOLS.blanket.mass,
    dimensions: TOOLS.blanket.dimensions,
    effect: 'protection',
    primary: 'Reduce scratches/impact',
    failure: 'Bad wrap obscures grip or falls off',
    colour: 0x7b5ea7,
  },

  /* Goes AGAINST a deck and makes a slope where there was a face. */
  ramp_01: {
    id: 'ramp_01',
    label: 'Loading ramp',
    mode: 'deploy',
    mass: TOOLS.ramp.mass,
    dimensions: { x: TOOLS.ramp.width, y: TOOLS.ramp.thickness, z: TOOLS.ramp.length },
    effect: 'clearance',
    primary: 'Bridge truck floor height',
    failure: 'Misalignment or steep approach',
    colour: 0x8a7f6d,
  },

  /* Changes an object's dimensions, and leaves you holding the difference. */
  screwdriver_01: {
    id: 'screwdriver_01',
    label: 'Screwdriver',
    mode: 'apply',
    mass: TOOLS.screwdriver.mass,
    dimensions: TOOLS.screwdriver.dimensions,
    effect: 'dimensions',
    primary: 'Disassemble authored parts',
    failure: 'Loose pieces get lost',
    colour: 0xd0b03c,
  },
});

/* §9.3: "the prototype uses a compact loadout screen or nearby tool rack". A rack is the
 * cheaper and the more physical of the two — the tools are already world objects with mass,
 * so a rack is just where they start, and forgetting one is then a real mistake you make
 * with your hands rather than a menu you failed to read.
 *
 * On the driveway, beside where the truck parks (Phase 7), and outside the porch zone so
 * carrying a tool into the house is a deliberate trip. */
/* DOWN the driveway, not across the top of it. The rack started at z = 5.60, which put the
 * 1.80 x 1.40 m moving blanket lying across the spot m1 drops a player to check it lands
 * with its feet on the ground — so the player landed on the blanket, 80 mm up, and two
 * Phase 1 assertions failed on a build where nothing about the player had changed.
 *
 * A tool left where people walk is realistic and, in a test fixture, indistinguishable from
 * a regression. z = 9.0 is still inside the driveway zone (§9.3's "nearby tool rack") and
 * four metres clear of the spawn. */
export const TOOL_RACK = Object.freeze({ x: -2.40, y: 0, z: 9.00 });

export const PHASE6_TOOL_SPAWNS = Object.freeze([
  { def: 'dolly_flat_01',   x: TOOL_RACK.x + 0.00, y: 0.10, z: TOOL_RACK.z + 0.00, yaw: 0.0 },
  { def: 'blanket_01',      x: TOOL_RACK.x + 1.30, y: 0.06, z: TOOL_RACK.z + 0.10, yaw: 0.0 },
  { def: 'ramp_01',         x: TOOL_RACK.x + 0.10, y: 0.08, z: TOOL_RACK.z + 1.70, yaw: 0.0 },
  { def: 'screwdriver_01',  x: TOOL_RACK.x + 2.30, y: 0.05, z: TOOL_RACK.z + 0.00, yaw: 0.0 },
]);

/** §24.4 again: validate the content, at load, in the build that ships it. */
export function validateToolDef(def) {
  const problems = [];
  if (!def.id) problems.push('missing id');
  if (!(def.mass > 0)) problems.push(`mass must be positive, got ${def.mass}`);
  const d = def.dimensions;
  if (!d || !(d.x > 0 && d.y > 0 && d.z > 0)) problems.push('dimensions must all be positive');
  if (!['attach', 'cover', 'deploy', 'apply'].includes(def.mode)) {
    problems.push(`unknown interaction mode "${def.mode}" (§9.2 wants one common verb)`);
  }
  // §9.1's table has both columns for every tool. A tool with no failure mode is an upgrade,
  // and §9.1 is explicit that better tools must bring "both new mastery and new accidents".
  if (!def.primary) problems.push('no primary function declared (§9.1)');
  if (!def.failure) problems.push('no failure/comedy mode declared (§9.1)');
  return problems;
}

export function validateAllToolDefs() {
  const out = {};
  for (const [id, def] of Object.entries(TOOL_DEFS)) {
    const p = validateToolDef(def);
    if (p.length) out[id] = p;
  }
  return out;
}
