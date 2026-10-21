// The entity generator: tables that combine into new entities, each still
// obeying the one-rule-one-tell-one-counter card. A generated entity is a
// pairing of how it senses you (the rule's subject), what sets it off (the
// trigger), how it moves, what it looks like and how it announces itself.
// The sense decides the counter, so a generated card is always solvable.

export const SENSES = [
  { id: "sound", rule: "it hunts by sound", counter: "move quietly - crouch, or stand still", tellHint: "it sniffs and listens, head cocked" },
  { id: "light", rule: "it is drawn to light", counter: "turn your light off, and stay out of lit rooms", tellHint: "it turns toward every bulb" },
  { id: "dark", rule: "it only moves in the dark", counter: "stay under working lights", tellHint: "it waits where the panels are dead" },
  { id: "gaze", rule: "it only moves while nobody is looking at it", counter: "keep it in view and back away", tellHint: "it is never where it was" },
  { id: "stare", rule: "it attacks whoever looks at it too long", counter: "look away", tellHint: "it turns its face to you" },
  { id: "motion", rule: "it only sees what moves", counter: "freeze when it faces you", tellHint: "its head jerks toward any movement" },
  { id: "solitude", rule: "it hunts whoever is alone", counter: "stay near someone", tellHint: "it counts out loud" },
  { id: "crowd", rule: "it is drawn to groups", counter: "split up", tellHint: "many voices from one place" },
  { id: "silence", rule: "it comes when it has been quiet too long", counter: "keep making noise", tellHint: "a sound that swells whenever you're quiet" },
  { id: "trail", rule: "it follows the way you came", counter: "never backtrack", tellHint: "something on the carpet behind you" },
  { id: "height", rule: "it sees only what stands tall", counter: "crouch when it looks your way", tellHint: "a shadow above the walls" },
  { id: "lucidity", rule: "it follows whoever is losing their mind", counter: "drink almond water, get under the light", tellHint: "it only shows up at the edge of your vision" },
];

export const TRIGGERS = [
  { id: "always", text: "" },
  { id: "near", text: ", but only within a few rooms of its nest" },
  { id: "timer", text: ", once a clock you can hear runs out" },
  { id: "marked", text: ", once you have touched something of its" },
  { id: "dark-only", text: ", and only on levels with dead panels" },
];

export const MOVEMENT = [
  { id: "stalk", text: "walks after you at a steady pace", speed: 2.2 },
  { id: "dash", text: "waits, then crosses a room in a second", speed: 6 },
  { id: "crawl", text: "drags itself low along the floor", speed: 1.4 },
  { id: "ceiling", text: "moves through the ceiling tiles", speed: 2.8 },
  { id: "blink", text: "is simply somewhere else each time you look", speed: 4 },
  { id: "drift", text: "drifts slowly, never stopping", speed: 0.9 },
];

export const BODIES = [
  "a person-shaped stain", "a tall figure in a stained suit", "a cluster of mannequin hands", "a child's coat with nothing in it",
  "an office chair that turns to face you", "a long dog with too many joints", "a smiling face on a sheet of paper", "a swarm of paper scraps",
  "a janitor with his face to the wall", "a television on a trolley, showing static", "a shape made of wet carpet", "a woman in a raincoat, dripping",
  "a pale thing with a lightbulb for a head", "a pile of shoes that walks", "a figure made of ceiling tiles", "a projector that walks on its tripod",
];

export const TELLS = [
  "a ringing phone that stops when you answer", "wet footsteps one beat behind yours", "a music box, slightly too slow", "a fluorescent tube buzzing out of tune",
  "a voice reading numbers", "a smell of rain indoors", "someone humming your favourite song", "the hum dropping half a tone",
  "chairs scraping in an empty room", "a radio between stations", "breathing from inside the walls", "a lift bell somewhere it shouldn't be",
];

const NAME_A = [
  "Hollow", "Quiet", "Late", "Wet", "Grey", "Still", "Tall", "Low", "Pale", "Bright", "Paper", "Carpet",
  "Night", "Lost", "Kind", "Patient", "Hungry", "Second", "Polite", "Folded", "Humming", "Borrowed", "Smiling", "Last",
];
const NAME_B = [
  "Clerk", "Tenant", "Visitor", "Janitor", "Neighbour", "Caller", "Attendant", "Lodger", "Usher", "Mother", "Friend", "Guest",
  "Agent", "Choir", "Twin", "Host", "Cashier", "Lifeguard", "Teacher", "Passenger", "Witness", "Sleeper", "Nurse", "Shepherd",
];

// sensible pairings only: a ceiling-crawler that hunts by height makes no sense
const INCOMPATIBLE = { ceiling: ["height"], blink: ["gaze"], drift: ["motion"] };

export function generateEntity(rng) {
  const sense = rng.pick(SENSES);
  const movement = rng.pick(MOVEMENT.filter((m) => !(INCOMPATIBLE[m.id] ?? []).includes(sense.id)));
  const trigger = rng.weighted(TRIGGERS.map((t) => [t, t.id === "always" ? 4 : 1]));
  const body = rng.pick(BODIES);
  const tell = rng.pick(TELLS);
  return {
    name: `The ${rng.pick(NAME_A)} ${rng.pick(NAME_B)}`,
    body,
    sense: sense.id,
    movement: movement.id,
    speed: movement.speed,
    rule: `${sense.rule}${trigger.text}`,
    counter: sense.counter,
    tell: `${tell}; ${sense.tellHint}`,
    behaviour: `${body}. It ${movement.text}.`,
    threat: Math.round((0.5 + movement.speed / 6 + (trigger.id === "always" ? 0.4 : 0)) * 4) / 4,
  };
}
