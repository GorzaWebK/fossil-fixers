import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadData } from '../js/sites.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

// Path2D doesn't exist in Node; the bone shapes module only needs it when drawing.
globalThis.Path2D ??= class { moveTo() {} lineTo() {} quadraticCurveTo() {} arcTo() {} ellipse() {} closePath() {} };

export const readJson = async (p) => JSON.parse(fs.readFileSync(path.join(root, p), 'utf8'));
export const getData = () => loadData(readJson);
export { root };
