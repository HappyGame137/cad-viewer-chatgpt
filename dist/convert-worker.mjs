import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);

// server/convert-worker.mjs
import { parentPort, workerData } from "node:worker_threads";
import { createRequire } from "node:module";

// server/cad.mjs
var MAX_FILE_BYTES = 30 * 1024 * 1024;
function encoded(array, Type) {
  return Buffer.from(new Type(array).buffer).toString("base64");
}
function decodeStepName(name) {
  if (!name || [...name].some((c) => c.charCodeAt(0) > 255)) return name;
  const decoded = Buffer.from(name, "latin1").toString("utf8");
  return decoded.includes("\uFFFD") ? name : decoded;
}
function normalize(rawParts, { name, format, tolerance = 0, sourceUnits = "mm" }) {
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  let triangles = 0, vertices = 0;
  const parts = rawParts.map((p, partId) => {
    const positions = p.positions, indices = p.indices;
    const partMin = [Infinity, Infinity, Infinity], partMax = [-Infinity, -Infinity, -Infinity];
    if (!positions.length || positions.length % 3 || !indices.length || indices.length % 3) throw new Error("Empty or malformed mesh.");
    if (positions.some((v) => !Number.isFinite(v) || Math.abs(v) > 1e9)) throw new Error("Invalid or excessively large coordinates.");
    if (indices.some((v) => !Number.isInteger(v) || v < 0 || v >= positions.length / 3)) throw new Error("Mesh contains invalid indices.");
    for (let i = 0; i < positions.length; i++) {
      const k = i % 3;
      min[k] = Math.min(min[k], positions[i]);
      max[k] = Math.max(max[k], positions[i]);
      partMin[k] = Math.min(partMin[k], positions[i]);
      partMax[k] = Math.max(partMax[k], positions[i]);
    }
    triangles += indices.length / 3;
    vertices += positions.length / 3;
    if (triangles > 1e6 || vertices > 2e6) throw new Error("Model exceeds the one million triangle preview limit. Use a coarser display tolerance.");
    return {
      id: partId,
      name: decodeStepName(p.name) || `Part ${partId + 1}`,
      color: p.color?.slice(0, 3),
      positionType: "float64",
      positions: encoded(positions, Float64Array),
      indices: encoded(indices, Uint32Array),
      bounds: { min: partMin, max: partMax, size: partMax.map((v, i) => v - partMin[i]) },
      triangles: indices.length / 3,
      vertices: positions.length / 3
    };
  });
  if (!parts.length || min.some((v) => !Number.isFinite(v))) throw new Error("No displayable solids or triangles were found.");
  const model = { schema: 1, name, format, unit: "mm", sourceUnits, tolerance, bounds: { min, max, size: max.map((v, i) => v - min[i]) }, parts, triangles, vertices };
  if (JSON.stringify(model).length > 24 * 1024 * 1024) throw new Error("Converted display mesh exceeds the 24 MB limit. Use a coarser tolerance.");
  return model;
}

// server/convert-worker.mjs
var require2 = createRequire(import.meta.url);
try {
  const factory = require2("./vendor/occt-import-js.cjs");
  const occt = await factory();
  const raw = occt.ReadStepFile(workerData.bytes, { linearUnit: "millimeter", linearDeflectionType: "absolute_value", linearDeflection: workerData.tolerance, angularDeflection: 0.25 });
  if (!raw.success) throw new Error("STEP import failed. Check that the file contains valid geometry.");
  const parts = raw.meshes.map((m) => ({ name: m.name, color: m.color, positions: m.attributes.position.array, indices: m.index.array }));
  parentPort.postMessage({ model: normalize(parts, { name: workerData.name, format: "STEP", tolerance: workerData.tolerance }) });
} catch (e) {
  parentPort.postMessage({ error: e.message });
}
