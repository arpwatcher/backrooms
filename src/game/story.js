// The story, told over a radio you find in your hand on Level 0. A woman
// called Elena came through the same way you did, a long time ago. She
// talks you down through the levels toward the Poolrooms, where she says
// the way out is. She's mostly right.

export const RADIO = {
  0: [
    "...hello? if you can hear this, you came through the floor the same way i did.",
    "don't panic. walk. find a red sign that says EXIT and walk into it.",
    "my name is elena. i've been down here a long time. there's a way out - deep down, in the pools. i'll talk you through it.",
  ],
  1: [
    "this is the warehouse. something lives here that used to be one of us.",
    "if it sees you, run. then get somewhere dark, crouch, and keep still. it forgets. it always forgets.",
    "the exit's dead until the power's back. breakers on the walls.",
  ],
  2: [
    "pipe dreams. it's hot, and the dogs down here are blind.",
    "they hear everything. walk soft. crouch if you hear them breathing.",
  ],
  3: [
    "the station. the lights here spark and die.",
    "where they're dead, something grins at you. keep your light on it and it won't come closer.",
  ],
  4: [
    "the offices. they're still at their desks.",
    "don't look at their faces. i'm serious. eyes on the floor.",
  ],
  5: [
    "no lights on this one. none.",
    "ration the battery. if you hear wings, switch it off and stand still.",
    "one more after this. you're nearly there.",
  ],
  6: [
    "the pools. warm water, white tile. i used to think it was beautiful.",
    "the door's at the far end. go to it. don't stop.",
    "...it followed you. i'm sorry. it followed me too.",
  ],
};

export const ENDING = {
  title: "the way out",
  lines: [
    "the door opens onto cold air and a car park you almost recognise.",
    "behind you, the radio is still on. it's only static now.",
    "her last note was dated eleven years ago.",
    "somewhere back in the water, something breathes the way she used to.",
  ],
};

// lines for a level, spaced out so each can be read
export function radioSchedule(depth, start, gap = 7) {
  return (RADIO[depth] ?? []).map((text, i) => ({ text, at: start + i * gap }));
}
