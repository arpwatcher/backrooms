// Frees what a level put on the GPU when the level is left behind: every
// geometry, material and texture under an object. Textures are the ones that
// add up (each level paints its own walls, floor and notes on canvas).
// Things shared with the next level, like cached skins and model meshes, are
// simply uploaded again the next time they're drawn.

export function disposeTree(root) {
  root.traverse((o) => {
    o.geometry?.dispose?.();
    const materials = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
    for (const m of materials) {
      for (const value of Object.values(m)) if (value?.isTexture) value.dispose();
      m.dispose?.();
    }
  });
}
