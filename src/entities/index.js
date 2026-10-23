// Every entity the director can choose from.

import { smiler } from "./smiler.js";
import { hounds } from "./hounds.js";
import { stillLife } from "./stillLife.js";
import { deathmoths } from "./deathmoths.js";
import { partygoers } from "./partygoers.js";
import { facelings } from "./facelings.js";
import { stilts } from "./stilts.js";
import { hushbaby } from "./hushbaby.js";
import { attendant } from "./attendant.js";
import { deadline } from "./deadline.js";
import { wretch } from "./wretch.js";
import { drowned } from "./drowned.js";
import { monochrome } from "./monochrome.js";

export const ENTITIES = [hounds, smiler, stillLife, deathmoths, partygoers, facelings, stilts, hushbaby, attendant, deadline, wretch, drowned, monochrome];

export function entityById(id) {
  return ENTITIES.find((d) => d.id === id) ?? null;
}
