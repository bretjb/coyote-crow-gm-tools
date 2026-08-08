# Coyote & Crow — GM Quick Reference

## 1. The D12 System — Making a Check

**Steps:**
1. Create a Dice Pool
2. Determine Success Number (SN)
3. Roll the Dice Pool
4. (Optional) Use Legendary Status
5. (Optional) Use Focus
6. (Optional) Roll Critical Dice
7. Determine Success / Failure

### Building the Dice Pool
- **Ability:** follow the specific Ability's instructions (often Stat + Stat).
- **Skill:** Skill Rank + higher Related Stat (or **lower** Related Stat if Skill Rank = 0) + equipment bonus dice (capped at your Skill Rank).
  - Skills marked with `*` cannot be used at Rank 0.
- **Stat:** the Stat's value = pool size. Players never initiate Stat Checks — only the SG calls for these (e.g. Reaction Rolls).

### Success Number
- Default **SN = 8**. Typical range 5–11, minimum 2.
- SG sets the final number; Abilities/Skills/gear/environment can modify it.
- SN above 12 is rare and brutal — to roll "above 12" a player must sacrifice one rolled 12 to add +1 to another 12.

### Reading the Dice (Standard/white d12)
- Roll ≥ SN → **1 Success**
- Roll < SN → nothing
- Roll **1** → **Fail**, subtract 1 Success
- Roll **12** → 1 Success + triggers a Critical Die

### Legendary Status (optional step)
- 1 use per Legendary Rank: adjust any single non-Fail die ±1 (can restack on the same die). Can't touch a Fail (a rolled 1).

### Focus (optional step)
- Spend Mind 1-for-1 to shift any non-Fail die ±1 point (can push up to 12). Spending Mind to 0 knocks the character Unconscious — spend carefully.

### Critical Dice (black dice)
- For every 12 in the pool (rolled or created via Legendary/Focus), roll 1 Critical die.
- Critical die < SN → 1 Success. Critical die ≥ SN → **2 Successes** and triggers gear/weapon Effects (e.g. Bleeding, Poison).
- A 12 on a Critical die triggers another Critical die — chain until no more 12s.
- Focus/Legendary Status cannot touch Critical dice.

### Result
Total = (Successes) + (2× Critical Successes) − (Fails).
- **1+ → Success** (in combat, Successes = points of Damage)
- **0 → Failure** (no progress, no harm)
- **< 0 → Critical Failure** → SG narrates a **Story Event** (setback, not punishment)

### Probability Tables (SN 8, all Standard dice, no Focus/Legendary/Crit spend)

Odds of clearing a given Success threshold by pool size.

**At least 1 Success needed** (e.g. a basic unopposed Check)

| Dice Pool | Fail % | Success % |
|---|---|---|
| 1d12 | 58% | 42% |
| 2d12 | 34% | 66% |
| 3d12 | 20% | 80% |
| 4d12 | 12% | 88% |
| 5d12 | 7% | 93% |
| 6d12 | 4% | 96% |
| 7d12 | 2% | 98% |
| 8d12 | 1% | 99% |

**At least 2 Successes needed** (e.g. a Hard difficulty Check)

| Dice Pool | Fail % | Success % |
|---|---|---|
| 1d12 | 100% | 0% |
| 2d12 | 83% | 17% |
| 3d12 | 62% | 38% |
| 4d12 | 45% | 55% |
| 5d12 | 31% | 69% |
| 6d12 | 21% | 79% |
| 7d12 | 14% | 86% |
| 8d12 | 9% | 91% |

**At least 3 Successes needed** (e.g. a Daunting difficulty Check)

| Dice Pool | Fail % | Success % |
|---|---|---|
| 1d12 | 100% | 0% |
| 2d12 | 100% | 0% |
| 3d12 | 93% | 7% |
| 4d12 | 80% | 20% |
| 5d12 | 65% | 35% |
| 6d12 | 51% | 49% |
| 7d12 | 38% | 62% |
| 8d12 | 28% | 72% |

### Skill Checks Over Time (SCOT)
Used when success builds up over an interval, no active opposition (if opposed, use Contested Checks instead).
- **Type A (pace-keeping):** 1+ Success each interval (default 1 hr) to keep going; miss = stall.
- **Type B (cumulative):** SG sets a target total Successes; each interval's Successes accumulate until target is hit.
- Failure = no progress; Critical Failure = setback/lost progress.
- **Invention** (new tech/ceremony/etc.): only Critical Successes count, default SN 12, must also be a Long-Term Goal.

## 2. Stats

*9 total, scale 1–5 typically; 5 draws attention; 6+ requires Notoriety Gift.*

| Category | Power | Finesse | Reserve |
|---|---|---|---|
| Physical | **Strength** | **Agility** | **Endurance** |
| Mental | **Intelligence** | **Perception** | **Wisdom** |
| Spiritual | **Spirit** | **Charisma** | **Will** |

- **Strength** — raw physical power/muscle.
- **Agility** — accuracy of movement, coordination, dodging.
- **Endurance** — physical resilience, stamina, recovery, resisting poison/illness.
- **Intelligence** — raw processing/retention of information.
- **Perception** — noticing and interpreting details (lies, fear, love).
- **Wisdom** — sustained focus, synthesizing info, seeing bigger truths.
- **Spirit** — presence/force of personality, "social gravity."
- **Charisma** — channeling Spirit to charm, manipulate, entertain, lie.
- **Will** — determination, resistance to fear/temptation/coercion.

### Derived Stats
- **Initiative Score** = Agility + Perception + Charisma
- **Physical Defense** = Agility + Endurance
- **Mental Defense** = Perception + Wisdom
- **Mystical Defense** = Charisma + Will
- **Body** = Strength + Agility + Endurance
- **Mind** = Intelligence + Perception + Wisdom
- **Soul** = Spirit + Charisma + Will

## 3. Skills

*27 General Skills; `*` = cannot use at Rank 0.*

| Skill | Related Stats | One-line summary |
|---|---|---|
| Art | Spirit / Will | Understand art & history; Specialized Skill needed to actually create it |
| Athletics | Strength / Endurance | Running, climbing, swimming, sports; helps defend vs. ranged (Acrobatics) |
| Ceremony* | Wisdom / Spirit | Spiritual/cultural rites; restores Mind/Soul to participants |
| Charm | Charisma / Perception | Sway an NPC's disposition positively; never overrides consent |
| Coercion | Charisma / Spirit | Bend an NPC's will — interrogation, bargaining, intimidation |
| Computers | Intelligence / Wisdom | Use niisi/computers/AR; Hacking & Programming are specialized-only |
| Cooking | Intelligence / Spirit | Prepare meals; Crit Success grants bonus Soul on next Rest |
| Crafting | Perception / Spirit | Build/repair/invent items; complex items need a Specialized Skill |
| Cybernetics* | Intelligence / Wisdom | Install/remove cybernetic implants |
| Deception | Charisma / Will | Convincing lies, disguises, sleight of hand, long cons |
| Farming | Intelligence / Endurance | Growing food & gat base chemicals; machinery, crop cycles |
| Herbalism* | Perception / Wisdom | Teas/smudges/poultices/poisons; can sub for Medicine (+1 SN) |
| Husbandry | Charisma / Wisdom | Raise, train, and read animals |
| Investigation | Perception / Wisdom | Draw conclusions from physical evidence at a scene |
| Knowledge | Intelligence / Wisdom | Gateway skill (max Rank 1) unlocking Specialized subject knowledge |
| Language* | Perception / Will | Gateway skill (max Rank 1); Specialized Skills = actual languages |
| Medicine* | Intelligence / Wisdom | Heal Body Damage; Specialized = treat Stat Damage (Phys/Mental/Spirit) |
| Melee Weapons | Strength / Endurance | Simple handheld weapons; Specialized for complex ones |
| Music | Spirit / Perception | Understand music/history; Specialized needed to actually play |
| Performance | Charisma / Spirit | Dance, oration, comedy, storytelling — mostly Narrative Play |
| Piloting | Intelligence / Agility | Operate vehicles; checks only needed for extreme maneuvers |
| Ranged Weapons | Perception / Agility | Bows, mag-slings, thrown weapons, other ranged attacks |
| Science* | Intelligence / Perception | Apply scientific method, run experiments, research |
| Skulduggery | Perception / Charisma | Lockpicking, scams, theft, poison administration |
| Stealth | Agility / Will | Move unseen, avoid detection |
| Survival | Endurance / Wisdom | Endure hostile environments; also covers First Aid |
| Tracking | Perception / Wisdom | Follow physical trails/signs of passage |
| Unarmed Combat | Strength / Intelligence | Fight bare-handed; Specialized: Martial Arts, Wrestling, Brawling |

**Purchasing (Character creation):** Rank cost — General: 1/3/6/10/15/21 for Ranks 1–6. Specialized: X/1/3/6/10/15 (must exceed connected General Skill's Rank when first taken).

## 4. Encounters

### Initiative
- Everyone's **Initiative Score** = Agility + Perception + Charisma (+ mods).
- Choose an **Initiative number 1–12** ≤ your Score (can't exceed 12 even if Score is higher — high Scores are advantageous for ties).
- SG sets NPC Initiative (individually or as a group) and keeps it secret until players commit.
- Ties: whoever has the **higher Initiative Score** chooses who goes first (or delays).
- Initiative order is set **once** at Encounter start; individual Characters can change their own slot for future Rounds (see below) but the process isn't repeated for everyone.

### Rounds
- Everyone takes 1 Primary Action + Secondary Actions, in Initiative order, then the Round repeats.
- Round length is a flexible abstraction (seconds to ~a minute) — don't over-index on real-world time math.

### Primary Actions (pick one)
- Make a Skill Check
- Activate an Ability
- Substitute a Secondary Action instead
- **Delay** (hold your action until a stated trigger condition; keeps your Initiative slot for next Round)
- **Change Initiative** (spend your whole Primary Action to move to a new slot ≤ your Score, effective next Round)

### Secondary Actions (multiple allowed per Round if they don't conflict)
- **Move** — change Range relative to a target (can also be taken as a Primary Action to move twice)
- **Defend** — vs. melee only; add Unarmed Combat Rank/Strength (unarmed attacker) or Melee Weapons Rank/Agility (armed attacker) to PD against one attacker until your next Primary Action
- **Take Cover** — vs. ranged only; +4 PD if you don't act/expose yourself that Round, +2 PD if you do; can't Move or Defend while in Cover
- **Dodge** — vs. ranged; add Acrobatics Rank to PD against attacks from a chosen Range this Round
- **Reaction Roll** — forced roll outside Initiative order, in response to something targeting you
- Reload/draw weapon, check a screen, flip a switch, talk to an ally, etc.

### Surprise
- Only at Encounter start, only Round 1. Attacker(s) roll Stealth vs. highest Mental Defense among targets (lowest Stealth pool in a group rolls for all).
- Surprised Characters get **no** Primary/Secondary Actions that Round (Reaction Rolls only, SG's discretion).

### Range
| Range | Definition | Combat implication |
|---|---|---|
| Short | ≤1 Move Action away | Melee & ranged both work |
| Medium | 2 Move Actions away | Out of melee range; ranged weapons' turf |
| Long | 4 Move Actions away | Far; only long-range weapons/targeting |

- Contested chase (Athletics or Piloting) — Success difference needed to hold/close range:
  - Keep at Short / push to Medium: **2**
  - Keep at Medium / push to Long: **4**
  - Keep at Long / escape entirely: **8**

### Conditional Modifiers (add to SN, stack freely)
Speed (+1 to +3), Terrain (+1 to +4), Weather (+1 to +4), Sensory Impairment (+1 to +4), Physical Impairment (+1 to X, may block the action entirely), Water/Substances (+1 to +3).
Social advantage/disadvantage: minor ±1, major ±2, critical ±3 (e.g. Social Skill mid-Combat = +3).

### Contested Skill Checks
- Used when two Characters actively oppose each other with the same Skill (coercion duel, wrestling, chase, dueling hackers).
- First actor rolls, banks their Successes. Second actor rolls on their turn.
- To actually **win**, you need Successes ≥ the **opponent's Total Dice Pool** in that Skill (not just more Successes than them) — think tug-of-war.
- No winner yet → continues next Round. A side can back out at Round's end, letting the other's Successes apply automatically.

### Social Encounters
- Skills: Charm, Coercion, Deception, Language, Ceremony, Medicine, etc.
- Only becomes an "Encounter" once genuinely opposed.
- Optional reward: winner of a Social Encounter gains 1 Mind; loser of a Contested Social Check loses 1 Mind + 1 Soul.

### Combat notes
- Core combat Skills: Unarmed Combat, Melee Weapons, Ranged Weapons.
- **Vehicles:** have Agility/Endurance only; PD/Body may differ from the stat sum; Piloting pool capped by vehicle's Agility; targeting occupants = treat as Cover.
- **Animals/NPCs:** built like PCs with Skills.
- **Machines/Robots:** may have Physical Stats + Intelligence + Perception, never Spiritual Stats or Wisdom; no Focus.
- **Objects:** destroyed at 0 Body (Endurance Rank usually sets Body & PD).
- **Spirits/Gods:** often incorporeal (physical attacks do nothing unless stated) and can planar-travel (~teleport).
- **The Black:** Spiritual Stats sub for Physical ones (Spirit→Strength, Charisma→Agility, Will→Endurance); all Damage there is Spiritual; no gear carries over.

## 5. Damage, States & Healing

### Core Loop
Successes on an attack = points of Damage (Body/Mind/Soul depending on attack type). Stat Damage (see below) is always applied **last**.

### States
| State | Trigger | Effect |
|---|---|---|
| Sleeping | default rest state | No Actions except waking (Secondary); auto-Surprised |
| Altered | ceremony/drugs/spirits/meditation | Temporary Stat swings (varies) |
| Panic | fear stimulus / Ability | Will Check to resist (2/5/etc. Successes by severity); if Panicked, can only act toward self-preservation; Crit Fail on the resist roll → Unconscious |
| Stunned | heavy hit (optional: single-Round Body damage > Endurance) | All 3 Defenses drop to 0 (except gear); need 3 Successes on Endurance-or-Will Check (SN 8) next turn to shake it off |
| Burning | after taking Fire Damage | Take Fire-Rank Damage again at end of turn each Round until extinguished (Survival Check, Successes ≥ Fire Rank, or full water immersion = auto) |
| Unconscious | Body, Mind, or Soul hits 0 | No sensory input, no Actions; Endurance/Agility/Wisdom/Perception/Will/Charisma stop contributing to Defenses; each Round at ≤0 in any pool, Will Check (SN 8, 1 Success) to stay Conscious (Secondary Actions only if you succeed); wakes when Body/Mind/Soul all ≥1 |
| Dying | Body, Mind, or Soul < 0 | Becomes its own Encounter — see below |

### Stat Damage
- Applied last, after all other Damage. Roll a d12 against the relevant chart (Physical/Mental/Spiritual) to see which Stat drops 1 point; recompute Derived Stats.
- Heals far slower than Body/Mind/Soul (see Healing below). Can't go below 1 — forcing it below 1 risks Death/Instant Death.

### Dying (< 0 Body/Mind/Soul)
- Also counts as Unconscious. Every Round, Reaction Roll (Will or Endurance, player's choice) per pool below 0, SN 8:
  - Critical Failure → lose 2 more points
  - Failure → lose 1 more point
  - 1+ Success → no change (still Dying)
  - Critical Success → **Stabilized** (no more checks needed for that pool)
- Another Character's First Aid Check (Primary Action) on a Dying target: any Success = no Body loss that Round; Critical Success = Stabilized outright; Critical Failure = 1 Body Damage to the patient. (First Aid only affects Body — Mind/Soul dying can only self-Stabilize.)

### Death
- **House rule baked into the system: a PC doesn't die unless their player allows it.** Table should agree on this up front if overriding.
- **Instant Death** (optional, mainly for NPCs): NPC Crit-Fails a Stabilize roll; minor NPC hit by a Critical Die 12; or SG rules survival is implausible (e.g. falling hundreds of feet).

### Resting & Healing
| | Frequency | What happens |
|---|---|---|
| Short Rest | Up to 2×/day, only after an Encounter, Narrative Play only | Endurance / Wisdom / Will Checks; each Success = +1 Body / Mind / Soul |
| Long Rest | 1×/day, PC must be Conscious or Sleeping | Same 3 checks as Short Rest **plus** flat regain = full Endurance/Wisdom/Will values |
- Interrupted Rest (by a new Encounter) = no benefit, must restart.
- **Stat Damage healing:** only during a Long Rest, max 1 point/day total (across all Stats), none on a day the Character had an Encounter; needs a Critical Success on the substituted Healing Check.
- Body has a hard ceiling at its starting max; Mind/Soul can temporarily exceed max via Abilities but reset to max after a Long Rest.

### Fortitude (referenced but not fully detailed in these chapter excerpts)
- Spending Soul as Fortitude counts double (2 pts of effect per 1 Soul spent) for the Encounter's duration (see Wolverine's Resolve Ability, character.md ~L867, ~L1217).
- Some Fortitude use lets you later Reaction Roll (Spirit + Endurance) to recover up to (amount spent − 1) Soul.
- **TODO: pull the full core Fortitude rule from the SG/Combat chapter — not present in the chapters exported here.**
