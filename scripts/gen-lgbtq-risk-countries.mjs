// Generates src/utils/lgbtqRiskCountries.data.ts. Edit CODES below, then:
//   curl -sSLo countries.geojson https://raw.githubusercontent.com/nvkelso/natural-earth-vector/v5.1.2/geojson/ne_10m_admin_0_countries.geojson
//   bun scripts/gen-lgbtq-risk-countries.mjs countries.geojson src/utils/lgbtqRiskCountries.data.ts
import { readFileSync, writeFileSync } from "node:fs";

const [, , src, out] = process.argv;
const CODES = (
	"EG SA IR YE AE QA KW OM IQ SY LB JO LY DZ MA TN SD MR PS " +
	"AF PK BD MY BN MV LK MM TM UZ ID RU " +
	"NG UG KE TZ SO SS ET ER GH CM SN GM GN SL LR TG ML BF TD ZM MW ZW SZ BI KM"
).split(" ");

const TOL = 0.02;

function perpDist(p, a, b) {
	const dx = b[0] - a[0], dy = b[1] - a[1];
	const len = dx * dx + dy * dy;
	if (len === 0) return Math.hypot(p[0] - a[0], p[1] - a[1]);
	const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len));
	return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

function dp(points, tol) {
	if (points.length <= 2) return points;
	const keep = new Uint8Array(points.length);
	keep[0] = keep[points.length - 1] = 1;
	const stack = [[0, points.length - 1]];
	while (stack.length) {
		const [s, e] = stack.pop();
		let best = -1, idx = -1;
		for (let i = s + 1; i < e; i++) {
			const d = perpDist(points[i], points[s], points[e]);
			if (d > best) { best = d; idx = i; }
		}
		if (best > tol) {
			keep[idx] = 1;
			stack.push([s, idx], [idx, e]);
		}
	}
	return points.filter((_, i) => keep[i]);
}

const r = (n) => Math.round(n * 1000) / 1000;

function simplifyRing(ring) {
	// Closed ring: split at the farthest point from the start so DP keeps shape.
	const pts = ring.slice(0, -1);
	let far = 0, fd = -1;
	for (let i = 1; i < pts.length; i++) {
		const d = Math.hypot(pts[i][0] - pts[0][0], pts[i][1] - pts[0][1]);
		if (d > fd) { fd = d; far = i; }
	}
	const a = dp(pts.slice(0, far + 1), TOL);
	const b = dp([...pts.slice(far), pts[0]], TOL);
	let simplified = [...a, ...b.slice(1)].map(([x, y]) => [r(x), r(y)]);
	simplified = simplified.filter((p, i) => i === 0 || p[0] !== simplified[i - 1][0] || p[1] !== simplified[i - 1][1]);
	if (simplified.length < 4) {
		// Tiny island collapsed — keep its bounding box so it still matches.
		let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
		for (const [x, y] of ring) {
			minX = Math.min(minX, x); maxX = Math.max(maxX, x);
			minY = Math.min(minY, y); maxY = Math.max(maxY, y);
		}
		const [x0, x1, y0, y1] = [minX - 0.002, maxX + 0.002, minY - 0.002, maxY + 0.002].map(r);
		simplified = [[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]];
	}
	return simplified.flat();
}

const geo = JSON.parse(readFileSync(src, "utf8"));
const result = {};
for (const f of geo.features) {
	const p = f.properties;
	const code = p.ADM0_A3 === "SOL" ? "SO" : [p.ISO_A2_EH, p.ISO_A2, p.WB_A2].find((c) => c && c !== "-99");
	if (!CODES.includes(code)) continue;
	const polys = f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates;
	(result[code] ??= []).push(...polys.map((poly) => simplifyRing(poly[0])));
}
const missing = CODES.filter((c) => !result[c]);
if (missing.length) throw new Error("missing: " + missing.join(","));

const codes = CODES.slice().sort();
let ts = `// Generated from Natural Earth 1:10m admin-0 countries (public domain),
// simplified (Douglas-Peucker, ${TOL}°) and rounded to 0.001°. Each polygon is a
// flat [lon, lat, lon, lat, ...] outer ring; islands too small to survive the
// simplification are kept as their bounding box. Keys are ISO 3166-1 alpha-2;
// SO includes Somaliland.
// Regenerate with scripts/gen-lgbtq-risk-countries.mjs rather than hand-edit.

export const LGBTQ_RISK_COUNTRY_POLYGONS: Record<${codes.map((c) => JSON.stringify(c)).join(" | ")}, number[][]> = {
`;
for (const c of codes) {
	ts += `\t${c}: [\n${result[c].map((ring) => `\t\t[${ring.join(",")}],`).join("\n")}\n\t],\n`;
}
ts += "};\n";
writeFileSync(out, ts);
console.log("bytes", ts.length, Object.fromEntries(codes.map((c) => [c, result[c].length])));
