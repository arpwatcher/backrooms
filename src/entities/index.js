// Every entity the director can choose from.

import { smiler } from "./smiler.js";
import { hounds } from "./hounds.js";
import { stillLife } from "./stillLife.js";
import { deathmoths } from "./deathmoths.js";
import { partygoers } from "./partygoers.js";
import { facelings } from "./facelings.js";

export const ENTITIES = [hounds, smiler, stillLife, deathmoths, partygoers, facelings];

export function entityById(id) {
  return ENTITIES.find((d) => d.id === id) ?? null;
}
