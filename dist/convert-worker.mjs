import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);

// server/convert-worker.mjs
import { parentPort, workerData } from "node:worker_threads";
import { createRequire } from "node:module";

// server/faces.mjs
var sub = (a, b) => a.map((v, i) => v - b[i]);
var dot = (a, b) => a.reduce((s, v, i) => s + v * b[i], 0);
var cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
var length = (a) => Math.hypot(...a);
var point = (positions, index) => [positions[index * 3], positions[index * 3 + 1], positions[index * 3 + 2]];
function measureFace(positions, indices, triangleIds = null) {
  let area = 0, reference = null, planar = true;
  const weighted = [0, 0, 0], min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (const triangle of triangleIds || Array.from({ length: indices.length / 3 }, (_, i) => i)) {
    const p = [0, 1, 2].map((j) => point(positions, indices[triangle * 3 + j]));
    const n = cross(sub(p[1], p[0]), sub(p[2], p[0])), twiceArea = length(n);
    if (twiceArea < 1e-20) continue;
    const normal = n.map((v) => v / twiceArea);
    reference ||= normal;
    if (Math.abs(dot(reference, normal)) < 1 - 1e-6) planar = false;
    const a = twiceArea / 2;
    area += a;
    for (let i = 0; i < 3; i++) {
      weighted[i] += (p[0][i] + p[1][i] + p[2][i]) / 3 * a;
      for (const v of p) {
        min[i] = Math.min(min[i], v[i]);
        max[i] = Math.max(max[i], v[i]);
      }
    }
  }
  if (!area) return { surfaceType: "mesh", area: 0, centroid: [0, 0, 0], bounds: { min: [0, 0, 0], max: [0, 0, 0], size: [0, 0, 0] } };
  const centroid = weighted.map((v) => v / area), result = { surfaceType: planar ? "plane" : "curved", area, centroid, bounds: { min, max, size: max.map((v, i) => v - min[i]) } };
  if (planar) {
    result.normal = reference;
    result.planeOffset = -dot(reference, centroid);
  }
  return result;
}
function buildFaces(positions, indices, sourceFaceIds, edges) {
  const count = indices.length / 3, parent = Uint32Array.from({ length: count }, (_, i) => i);
  const find = (i) => {
    let root = i;
    while (parent[root] !== root) root = parent[root];
    while (parent[i] !== i) {
      const next = parent[i];
      parent[i] = root;
      i = next;
    }
    return root;
  };
  for (const edge of edges.values()) if (edge.otherTriangle !== void 0 && edge.coplanar && sourceFaceIds[edge.triangle] < 0 && sourceFaceIds[edge.otherTriangle] < 0) {
    const a = find(edge.triangle), b = find(edge.otherTriangle);
    if (a !== b) parent[b] = a;
  }
  const groups = [], ids = /* @__PURE__ */ new Map(), faceMap = new Uint32Array(count);
  for (let i = 0; i < count; i++) {
    const key = sourceFaceIds[i] >= 0 ? "face" + sourceFaceIds[i] : "mesh" + find(i);
    let id = ids.get(key);
    if (id === void 0) {
      id = groups.length;
      ids.set(key, id);
      groups.push([]);
    }
    groups[id].push(i);
    faceMap[i] = id;
  }
  if (groups.length > 1e4) return { faces: [], faceMap, groups: [] };
  const faces = groups.map((triangles, id) => ({ id, ...measureFace(positions, indices, triangles) }));
  return { faces, faceMap, groups };
}
function enrichCylinders(faces, groups, features, positions, indices) {
  const circular = features.filter((f) => f.type === "circle" || f.type === "arc");
  for (const face of faces) {
    if (face.surfaceType !== "curved") continue;
    const candidates = circular.filter((f) => f.faceIds.includes(face.id));
    let found = false;
    for (let i = 0; i < candidates.length && !found; i++) for (let j = i + 1; j < candidates.length && !found; j++) {
      const a = candidates[i], b = candidates[j], delta = sub(b.center, a.center), h = length(delta), radius = (a.radius + b.radius) / 2, tolerance = Math.max(radius * 3e-4, 1e-6);
      if (h < 1e-6 || Math.abs(a.radius - b.radius) > tolerance || Math.abs(dot(a.normal, b.normal)) < 0.9999) continue;
      const direction = delta.map((v) => v / h);
      if (Math.abs(dot(direction, a.normal)) < 0.9999) continue;
      let low = Infinity, high = -Infinity, valid = true;
      for (const triangle of groups[face.id]) for (let k = 0; k < 3; k++) {
        const p = sub(point(positions, indices[triangle * 3 + k]), a.center), t = dot(p, direction), radial = p.map((v, i2) => v - t * direction[i2]);
        if (Math.abs(length(radial) - radius) > tolerance) {
          valid = false;
          break;
        }
        low = Math.min(low, t);
        high = Math.max(high, t);
      }
      if (valid) {
        Object.assign(face, { surfaceType: "cylinder", radius, diameter: radius * 2, height: high - low, axis: { origin: a.center, direction, min: low, max: high } });
        found = true;
      }
    }
  }
}

// server/edges.mjs
var sub2 = (a, b) => a.map((v, i) => v - b[i]);
var dot2 = (a, b) => a.reduce((s, v, i) => s + v * b[i], 0);
var cross2 = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
var norm = (a) => Math.hypot(...a);
var unit = (a) => {
  const d = norm(a);
  return d ? a.map((v) => v / d) : [0, 0, 0];
};
var distance = (a, b) => norm(sub2(a, b));
var pathLength = (p) => p.slice(1).reduce((s, v, i) => s + distance(v, p[i]), 0);
function fitCircle(input, closed = false) {
  const points = input.slice();
  if (points.length > 1 && distance(points[0], points.at(-1)) < 1e-9) points.pop();
  if (points.length < (closed ? 10 : 5)) return null;
  const origin = [0, 1, 2].map((i) => points.reduce((s, p) => s + p[i], 0) / points.length), local = points.map((p) => sub2(p, origin));
  const u = unit(local.reduce((a, b) => norm(a) > norm(b) ? a : b)), axis = local.map((p) => cross2(u, p)).reduce((a, b) => norm(a) > norm(b) ? a : b), normal = unit(axis);
  if (norm(axis) < 1e-10) return null;
  const v = cross2(normal, u), scale = local.reduce((largest, p) => Math.max(largest, norm(p)), 0);
  if (!scale) return null;
  const xy = local.map((p) => [dot2(p, u) / scale, dot2(p, v) / scale]);
  let xx = 0, yy = 0, xySum = 0, bx = 0, by = 0;
  for (const [x, y] of xy) {
    const r2 = x * x + y * y;
    xx += x * x;
    yy += y * y;
    xySum += x * y;
    bx += x * r2 / 2;
    by += y * r2 / 2;
  }
  const determinant = xx * yy - xySum * xySum;
  if (determinant < 1e-10 * (xx + yy) ** 2) return null;
  const cx = (bx * yy - by * xySum) / determinant, cy = (by * xx - bx * xySum) / determinant;
  const radius = scale * Math.sqrt((xx + yy) / points.length + cx * cx + cy * cy), center = origin.map((p, i) => p + scale * (u[i] * cx + v[i] * cy));
  const tolerance = Math.max(1e-6, scale * 2e-7, radius * 1e-4);
  const planeError = local.reduce((largest, p) => Math.max(largest, Math.abs(dot2(p, normal))), 0);
  const residual = points.reduce((largest, p) => Math.max(largest, Math.abs(distance(p, center) - radius)), 0);
  if (planeError > tolerance || residual > tolerance) return null;
  const angles = xy.map(([x, y]) => Math.atan2(y - cy, x - cx));
  let sweep = 0, sign = 0;
  for (let i = 1; i < angles.length + (closed ? 1 : 0); i++) {
    const delta = Math.atan2(Math.sin(angles[i % angles.length] - angles[i - 1]), Math.cos(angles[i % angles.length] - angles[i - 1]));
    if (Math.abs(delta) > Math.PI / 2 || Math.abs(delta) < 1e-10) return null;
    if (sign && Math.sign(delta) !== sign) return null;
    sign = Math.sign(delta);
    sweep += delta;
  }
  if (closed ? Math.abs(Math.abs(sweep) - Math.PI * 2) > 0.01 : Math.abs(sweep) < 0.12 || Math.abs(sweep) > Math.PI * 2 + 1e-3) return null;
  return { center, radius, diameter: radius * 2, normal, residual, angle: Math.abs(sweep) * 180 / Math.PI, length: radius * Math.abs(sweep) };
}
function primitives(points, closed, epsilon) {
  const total = pathLength(points), span = distance(points[0], points.at(-1));
  if (!closed && total - span <= Math.max(epsilon * 5, total * 1e-7)) return [{ type: "line", points: [points[0], points.at(-1)], length: span, closed: false }];
  const circle = fitCircle(points, closed);
  if (circle) return [{ type: closed ? "circle" : "arc", points, closed, ...circle }];
  const p = closed ? points.slice(0, -1) : points, kinks = [];
  for (let i = closed ? 0 : 1; i < (closed ? p.length : p.length - 1); i++) {
    const a = unit(sub2(p[i], p[(i + p.length - 1) % p.length])), b = unit(sub2(p[(i + 1) % p.length], p[i]));
    if (dot2(a, b) < Math.cos(Math.PI / 9)) kinks.push(i);
  }
  if (kinks.length) {
    const breaks = closed ? kinks : [0, ...kinks, p.length - 1], result = [];
    for (let i = 0; i < breaks.length - (closed ? 0 : 1); i++) {
      const start = breaks[i], end = breaks[(i + 1) % breaks.length], segment = [];
      let j = start;
      segment.push(p[j]);
      do {
        j = (j + 1) % p.length;
        segment.push(p[j]);
      } while (j !== end);
      const length2 = pathLength(segment), line = distance(segment[0], segment.at(-1)), arc = fitCircle(segment, false);
      result.push(length2 - line <= Math.max(epsilon * 5, length2 * 1e-7) ? { type: "line", points: [segment[0], segment.at(-1)], closed: false, length: line } : arc ? { type: "arc", points: segment, closed: false, ...arc } : { type: "curve", points: segment, closed: false, length: length2 });
    }
    return result;
  }
  return [{ type: "curve", points, closed, length: total }];
}
function extractEdges(positions, indices, faces = []) {
  if (indices.length / 3 > 25e4) return { features: [], featureStatus: "limit", faces: [], faceMap: null };
  let size = 0;
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < positions.length; i++) {
    const k = i % 3;
    min[k] = Math.min(min[k], positions[i]);
    max[k] = Math.max(max[k], positions[i]);
  }
  size = distance(min, max);
  const epsilon = Math.max(size * 1e-8, 1e-7), vertices = [], welded = new Uint32Array(positions.length / 3), buckets = /* @__PURE__ */ new Map();
  for (let i = 0; i < welded.length; i++) {
    const p = [positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]], key = p.map((n, k) => Math.round((n - min[k]) / epsilon)).join(",");
    let id = buckets.get(key);
    if (id === void 0) {
      id = vertices.length;
      vertices.push(p);
      buckets.set(key, id);
    }
    welded[i] = id;
  }
  const faceIds = new Int32Array(indices.length / 3).fill(-1);
  for (let i = 0; i < faces.length; i++) {
    const [first, last] = faces[i];
    if (Number.isInteger(first) && Number.isInteger(last) && first >= 0 && last < faceIds.length) faceIds.fill(i, first, last + 1);
  }
  const edges = /* @__PURE__ */ new Map(), cosine = Math.cos(35 * Math.PI / 180);
  for (let i = 0; i < indices.length; i += 3) {
    const ids = [welded[indices[i]], welded[indices[i + 1]], welded[indices[i + 2]]];
    if (new Set(ids).size < 3) continue;
    const normal = unit(cross2(sub2(vertices[ids[1]], vertices[ids[0]]), sub2(vertices[ids[2]], vertices[ids[0]]))), face = faceIds[i / 3];
    for (let j = 0; j < 3; j++) {
      const a = ids[j], b = ids[(j + 1) % 3], key = a < b ? `${a},${b}` : `${b},${a}`, old = edges.get(key);
      if (!old) edges.set(key, { a, b, normal, face, triangle: i / 3, count: 1, feature: false });
      else {
        old.otherTriangle = i / 3;
        old.coplanar = Math.abs(dot2(normal, old.normal)) > 1 - 1e-8;
        old.count++;
        old.feature ||= old.count > 2 || (face >= 0 && old.face >= 0 ? face !== old.face : dot2(normal, old.normal) < cosine);
      }
    }
  }
  const boundary = [...edges.values()].filter((e) => e.count === 1 || e.feature), adjacent = /* @__PURE__ */ new Map();
  boundary.forEach((e, i) => {
    for (const id of [e.a, e.b]) {
      if (!adjacent.has(id)) adjacent.set(id, []);
      adjacent.get(id).push(i);
    }
  });
  const { faces: faceData, faceMap, groups } = buildFaces(positions, indices, faceIds, edges);
  const used = /* @__PURE__ */ new Set(), features = [];
  let samples = 0, limited = false;
  function trace(start, edgeId) {
    if (limited) return;
    const points = [vertices[start]], sourceFaces = /* @__PURE__ */ new Set();
    let node = start, nextEdge = edgeId;
    do {
      used.add(nextEdge);
      const edge = boundary[nextEdge];
      sourceFaces.add(faceMap[edge.triangle]);
      if (edge.otherTriangle !== void 0) sourceFaces.add(faceMap[edge.otherTriangle]);
      node = edge.a === node ? edge.b : edge.a;
      points.push(vertices[node]);
      const links = adjacent.get(node);
      if (node === start || links.length !== 2) break;
      nextEdge = links.find((i) => !used.has(i));
    } while (nextEdge !== void 0);
    for (const feature of primitives(points, node === start, epsilon)) {
      samples += feature.points.length;
      if (features.length >= 5e3 || samples > 1e5) {
        limited = true;
        break;
      }
      if (feature.length > epsilon * 2) features.push({ id: features.length, approximate: true, faceIds: [...sourceFaces], ...feature });
    }
  }
  for (const [node, links] of adjacent) if (links.length !== 2) {
    for (const id of links) if (!used.has(id)) trace(node, id);
  }
  boundary.forEach((edge, i) => {
    if (!used.has(i)) trace(edge.a, i);
  });
  enrichCylinders(faceData, groups, features, positions, indices);
  return { features, featureStatus: limited ? "limit" : "ready", faces: faceData, faceMap: faceData.length ? faceMap : null };
}

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
    const edgeData = extractEdges(positions, indices, p.faces);
    if (edgeData.faceMap) edgeData.faceMap = encoded(edgeData.faceMap, Uint32Array);
    return {
      id: partId,
      name: decodeStepName(p.name) || `Part ${partId + 1}`,
      color: p.color?.slice(0, 3),
      ...edgeData,
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
  const parts = raw.meshes.map((m) => ({ name: m.name, color: m.color, positions: m.attributes.position.array, indices: m.index.array, faces: m.brep_faces?.map((f) => [f.first, f.last]) }));
  parentPort.postMessage({ model: normalize(parts, { name: workerData.name, format: "STEP", tolerance: workerData.tolerance }) });
} catch (e) {
  parentPort.postMessage({ error: e.message });
}
