// Every entity the director can choose from.

import { smiler } from "./smiler.js";
import { hounds } from "./hounds.js";
import { stillLife } from "./stillLife.js";

export const ENTITIES = [hounds, smiler, stillLife];

export function entityById(id) {
  return ENTITIES.find((d) => d.id === id) ?? null;
}
