// The threat director decides who lives on a level, and watches how the
// player is doing while they're in it. It is not trying to kill you: it is
// trying to keep you scared. That means a new thing is always met alone
// first, so you can learn its rule; the mix changes from level to level;
// some pairs make each other worse in interesting ways and get picked
// together; and a few pairs would ask for opposite things at once and are
// never put on the same floor. When it has pushed too hard for too long it
// backs off (the mercy rule).

export const TIERS = {
  // name: budget scale, contacts before death, seconds of overload before mercy
  lucid: { name: "lucid", budget: 0.6, contacts: 3, mercyAfter: 10, mercyFor: 25 },
  uneasy: { name: "uneasy", budget: 1, contacts: 2, mercyAfter: 18, mercyFor: 18 },
  lost: { name: "lost", budget: 1.3, contacts: 2, mercyAfter: 28, mercyFor: 12 },
  noclip: { name: "noclip", budget: 1.7, contacts: 2, mercyAfter: 45, mercyFor: 8 },
};

// pairs that sharpen each other: the counter to one makes the other harder
export const SYNERGIES = [
  { pair: ["smiler", "hounds"], why: "the light keeps the grin away, but running to the light brings the pack" },
];

// pairs whose counters contradict outright; meeting both is unfair, not scary
export const CONFLICTS = [];

const key = (a, b) => [a, b].sort().join("+");

export function synergyOf(a, b) {
  return SYNERGIES.find((s) => key(...s.pair) === key(a, b)) ?? null;
}

export function conflicts(a, b) {
  return CONFLICTS.some((c) => key(...c.pair) === key(a, b));
}

export function budgetFor(depth, tier = TIERS.uneasy) {
  if (depth <= 0) return 0;
  return Math.min(1 + (depth - 1) * 0.5, 5) * tier.budget;
}

// pool: entity defs with { id, threat, minDepth }
// recent: rosters (arrays of ids) of the last few levels, newest last
export function planLevel({ depth, rng, pool, tier = TIERS.uneasy, recent = [] }) {
  const budget = budgetFor(depth, tier);
  const open = pool.filter((d) => d.minDepth <= depth);
  if (budget <= 0 || open.length === 0) return { roster: [], budget, synergy: null, reason: "quiet" };

  // the first time something can appear, it appears alone
  const debut = open.filter((d) => d.minDepth === depth);
  if (debut.length > 0) {
    return { roster: [rng.pick(debut)], budget, synergy: null, reason: "debut" };
  }

  const seen = new Map();
  recent.forEach((ids, age) => ids.forEach((id) => seen.set(id, Math.max(seen.get(id) ?? 0, age + 1))));
  const roster = [];
  let left = budget;
  for (;;) {
    const options = open.filter(
      (d) => !roster.includes(d) && d.threat <= left + 0.25 && !roster.some((r) => conflicts(r.id, d.id)),
    );
    if (options.length === 0) break;
    const weighted = options.map((d) => {
      let w = 1;
      // the newer its last appearance, the less likely it comes back now
      if (seen.has(d.id)) w *= 0.25 + 0.75 * (1 - seen.get(d.id) / (recent.length + 1));
      if (roster.some((r) => synergyOf(r.id, d.id))) w *= 3;
      return [d, w];
    });
    const pick = rng.weighted(weighted);
    roster.push(pick);
    left -= pick.threat;
    if (roster.length >= 5 || left < 0.25) break;
  }
  let synergy = null;
  for (const a of roster) for (const b of roster) if (a !== b) synergy ??= synergyOf(a.id, b.id);
  return { roster, budget, synergy, reason: synergy ? "synergy" : "mix" };
}

// Tension is how hard the level is leaning on the player right now: things
// close by, things actively hunting, recent contact. Kept high for too long,
// the director grants mercy - everything backs off for a while.
export function createTension() {
  return { value: 0, overloadFor: 0, mercyUntil: 0, contacts: [] };
}

export function stepTension(t, { nearest = Infinity, hunting = 0, time, tier = TIERS.uneasy }, dt) {
  const closeness = nearest < 16 ? 1 - nearest / 16 : 0;
  const recentContact = t.contacts.some((c) => time - c < 20) ? 0.4 : 0;
  const target = Math.min(1, closeness * 0.6 + Math.min(hunting, 3) * 0.2 + recentContact);
  // rises fast, settles slowly
  const rate = target > t.value ? 1.5 : 0.25;
  t.value += (target - t.value) * Math.min(1, rate * dt);
  if (time < t.mercyUntil) return null;
  t.overloadFor = t.value > 0.75 ? t.overloadFor + dt : Math.max(0, t.overloadFor - dt * 2);
  const twoQuick = t.contacts.filter((c) => time - c < 60).length >= 2;
  if (t.overloadFor >= tier.mercyAfter || twoQuick) {
    t.overloadFor = 0;
    t.contacts = [];
    t.mercyUntil = time + tier.mercyFor;
    return "mercy";
  }
  return null;
}

export function noteContact(t, time) {
  t.contacts.push(time);
}

export function inMercy(t, time) {
  return time < t.mercyUntil;
}
