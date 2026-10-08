// Parameterized Monte-Carlo tree search for Go.
import { Board, BLACK, EMPTY, KOMI, PASS, other, type Color } from "./engine";

export interface MCTSParams {
	/** UCT exploration constant: higher = explores less-visited moves more. */
	exploration: number;
	/** Number of simulations (tree iterations) to run. */
	samples: number;
	/**
	 * Prune a move when the combined heuristic score (survival-weighted stones + influence
	 * territory, own minus opponent) drops by more than this many points relative to the
	 * position before the move. 0 disables pruning.
	 */
	pruneScore: number;
	/**
	 * 0..1. How much a stone's worth is scaled by its likelihood of survival s <= 1:
	 * worth = 1 - survivalStrength * (1 - s). 0 counts every stone fully.
	 */
	survivalStrength: number;
	/**
	 * Random moves to simulate from a leaf before judging the position with the heuristic
	 * evaluation instead of playing to the end. 0 = play out the whole game.
	 */
	playoutDepth: number;
	/**
	 * Only consider moves within this Chebyshev distance of an existing stone
	 * (1 = adjacent incl. diagonals). Ignored on an empty board.
	 */
	proximity: number;
	/**
	 * Simulated moves are chosen with probability proportional to 1 / d^bias, where d is the
	 * Chebyshev distance to the nearest stone. 0 = uniform, 1 = inversely proportional.
	 */
	distanceBias: number;
}

export const DEFAULT_PARAMS: MCTSParams = {
	exploration: 0.7,
	samples: 3000,
	pruneScore: 2,
	survivalStrength: 0.7,
	playoutDepth: 16,
	proximity: 3,
	distanceBias: 1,
};

export interface MoveStat {
	move: number;
	visits: number;
	winRate: number; // from the AI's perspective
}

export interface MCTSResult {
	move: number;
	/** all root moves, most-visited first (fallbacks if the first is rejected) */
	ranked: MoveStat[];
	winRate: number;
	samples: number;
	ms: number;
}

export interface RunOptions {
	onProgress?: (done: number, total: number) => void;
	/** set `.cancelled = true` to abort; the promise then resolves to null */
	token?: { cancelled: boolean };
	komi?: number;
}

interface Candidate {
	move: number;
	/** relative sampling weight */
	w: number;
}

class Node {
	children: Node[] = [];
	untried: Candidate[] | null = null;
	pruned: Candidate[] = [];
	noPrune = false;
	/** heuristic score for the side to move here, lazily computed (for pruning) */
	baseline: number | null = null;
	visits = 0;
	value = 0; // expected wins (0..1 per simulation) for `mover`
	constructor(
		readonly board: Board,
		readonly move: number,
		readonly mover: Color,
		readonly parent: Node | null,
	) {}
}

// ---- heuristic evaluation ---------------------------------------------------

/** Survival likelihood by liberty count (index capped), before eye bonuses. */
const LIBERTY_SURVIVAL = [0, 0.15, 0.45, 0.65, 0.8];
/** Influence territory is speculative: weight 0.6 / distance^2, and only within this distance of a stone,
 * so a lone far-away stone can't claim a whole empty board. */
const TERRITORY_WEIGHT = 0.6;
const TERRITORY_RANGE = 3;

const nbrOf = (n: number, p: number, out: number[]) => {
	out.length = 0;
	const x = p % n, y = (p / n) | 0;
	if (y > 0) out.push(p - n);
	if (x > 0) out.push(p - 1);
	if (x < n - 1) out.push(p + 1);
	if (y < n - 1) out.push(p + n);
};

/**
 * Heuristic score for each colour: every stone is worth 1 - strength * (1 - s), where s <= 1 is
 * its group's survival likelihood (1 with two or more eyes, otherwise from its liberties, with
 * one eye giving a boost). Empty points are added by nearest-stone influence, weighted by that
 * group's worth and discounted by distance. Contested points count for nobody.
 */
function evaluate(b: Board, strength: number): [number, number, number] {
	const n = b.size, nn = n * n, c = b.cells;
	const group = new Int32Array(nn).fill(-1);
	const worth: number[] = [];
	const nb: number[] = [];
	const stack: number[] = [];
	const libSeen = new Int32Array(nn);
	const score: [number, number, number] = [0, 0, 0];
	let libStamp = 0;

	for (let p = 0; p < nn; p++) {
		if (c[p] === EMPTY || group[p] >= 0) continue;
		const color = c[p] as Color;
		const id = worth.length;
		let size = 0, libs = 0, eyes = 0;
		libStamp++;
		stack.length = 0;
		stack.push(p);
		group[p] = id;
		while (stack.length) {
			const q = stack.pop()!;
			size++;
			nbrOf(n, q, nb);
			for (const r of nb) {
				if (c[r] === EMPTY) {
					if (libSeen[r] !== libStamp) {
						libSeen[r] = libStamp;
						libs++;
						if (b.isEye(r, color)) eyes++;
					}
				} else if (c[r] === color && group[r] < 0) {
					group[r] = id;
					stack.push(r);
				}
			}
		}
		let s = LIBERTY_SURVIVAL[Math.min(libs, LIBERTY_SURVIVAL.length - 1)];
		if (eyes >= 2) s = 1;
		else if (eyes === 1 && libs > 1) s += (1 - s) * 0.6;
		const w = 1 - strength * (1 - s);
		worth.push(w);
		score[color] += w * size;
	}

	// nearest-stone influence over empty points (multi-source BFS, 3 = contested)
	const dist = new Int16Array(nn).fill(-1);
	const own = new Uint8Array(nn);
	const pw = new Float32Array(nn);
	const queue: number[] = [];
	for (let p = 0; p < nn; p++) {
		if (c[p] === EMPTY) continue;
		dist[p] = 0;
		own[p] = c[p];
		pw[p] = worth[group[p]];
		queue.push(p);
	}
	for (let i = 0; i < queue.length; i++) {
		const u = queue[i];
		if (own[u] === 3) continue;
		nbrOf(n, u, nb);
		for (const v of nb) {
			if (dist[v] < 0) {
				dist[v] = dist[u] + 1;
				own[v] = own[u];
				pw[v] = pw[u];
				queue.push(v);
			} else if (dist[v] === dist[u] + 1 && own[v] !== own[u]) {
				own[v] = 3;
			}
		}
	}
	for (let p = 0; p < nn; p++) {
		if (c[p] === EMPTY && (own[p] === 1 || own[p] === 2) && dist[p] <= TERRITORY_RANGE)
			score[own[p]] += (TERRITORY_WEIGHT * pw[p]) / (dist[p] * dist[p]);
	}
	return score;
}

/** Heuristic score margin (no komi) from `color`'s point of view. */
function scoreDiff(b: Board, color: Color, params: MCTSParams): number {
	const s = evaluate(b, params.survivalStrength);
	return s[color] - s[other(color)];
}

/** Squash a heuristic margin into a pseudo win probability for BLACK. */
function blackWinProb(b: Board, komi: number, params: MCTSParams): number {
	const s = evaluate(b, params.survivalStrength);
	const margin = s[1] - s[2] - komi;
	return 1 / (1 + Math.exp(-margin / Math.max(2, b.size * 0.5)));
}

/** Chebyshev distance from each point to the nearest stone, capped at `cap`. */
function distanceMap(b: Board, cap: number): Uint8Array {
	const n = b.size;
	const d = new Uint8Array(n * n);
	for (let i = 0; i < d.length; i++) d[i] = b.cells[i] !== EMPTY ? 0 : cap;
	const relax = (x: number, y: number, dx: number, dy: number) => {
		const nx = x + dx, ny = y + dy;
		if (nx < 0 || ny < 0 || nx >= n || ny >= n) return;
		const v = d[ny * n + nx] + 1;
		if (v < d[y * n + x]) d[y * n + x] = v;
	};
	for (let y = 0; y < n; y++)
		for (let x = 0; x < n; x++) {
			relax(x, y, -1, -1); relax(x, y, 0, -1); relax(x, y, 1, -1); relax(x, y, -1, 0);
		}
	for (let y = n - 1; y >= 0; y--)
		for (let x = n - 1; x >= 0; x--) {
			relax(x, y, 1, 1); relax(x, y, 0, 1); relax(x, y, -1, 1); relax(x, y, 1, 0);
		}
	return d;
}

const weightOf = (d: number, bias: number) => 1 / Math.pow(Math.max(1, d), bias);

function candidateMoves(b: Board, params: MCTSParams): Candidate[] {
	const n = b.size;
	const me = b.toPlay;
	if (b.stones[1] + b.stones[2] === 0) {
		return [{ move: (n >> 1) * n + (n >> 1), w: 1 }];
	}
	const dist = distanceMap(b, 100);
	const r = Math.max(1, Math.floor(params.proximity));
	const out: Candidate[] = [];
	for (let p = 0; p < n * n; p++) {
		if (b.cells[p] !== EMPTY || p === b.ko || dist[p] > r) continue;
		if (b.isEye(p, me)) continue;
		out.push({ move: p, w: weightOf(dist[p], params.distanceBias) });
	}
	return out;
}

/** Remove and return a candidate chosen with probability proportional to its weight. */
function takeWeighted(list: Candidate[]): Candidate {
	let total = 0;
	for (const c of list) total += c.w;
	let t = Math.random() * total;
	let i = 0;
	for (; i < list.length - 1; i++) {
		t -= list[i].w;
		if (t <= 0) break;
	}
	const c = list[i];
	list[i] = list[list.length - 1];
	list.pop();
	return c;
}

function init(node: Node, params: MCTSParams) {
	const moves = candidateMoves(node.board, params);
	// passing is only worth considering when the opponent just passed or nothing else is left
	if (node.board.passes > 0 || moves.length === 0) moves.push({ move: PASS, w: 1 });
	node.untried = moves;
}

/** Try to add one child. Returns null once nothing more can be added. */
function expand(node: Node, params: MCTSParams): Node | null {
	const untried = node.untried!;
	const mover = node.board.toPlay;
	while (untried.length > 0) {
		const cand = takeWeighted(untried);
		const m = cand.move;
		const nb = node.board.clone();
		if (!nb.play(m)) continue;
		if (m !== PASS && !node.noPrune && params.pruneScore > 0) {
			// captures are already reflected here: play() removes captured stones
			node.baseline ??= scoreDiff(node.board, mover, params);
			if (scoreDiff(nb, mover, params) < node.baseline - params.pruneScore) {
				node.pruned.push(cand);
				continue;
			}
		}
		const child = new Node(nb, m, mover, node);
		node.children.push(child);
		return child;
	}
	if (node.children.length === 0) {
		// never leave a node without options: un-prune, else pass
		if (node.pruned.length > 0 && !node.noPrune) {
			node.noPrune = true;
			node.untried = node.pruned;
			node.pruned = [];
			return expand(node, params);
		}
		const nb = node.board.clone();
		nb.play(PASS);
		const child = new Node(nb, PASS, mover, node);
		node.children.push(child);
		return child;
	}
	return null;
}

function selectChild(node: Node, c: number): Node {
	const lnN = Math.log(node.visits + 1);
	let best = node.children[0];
	let bestScore = -Infinity;
	for (const ch of node.children) {
		const s = ch.value / ch.visits + c * Math.sqrt(lnN / ch.visits);
		if (s > bestScore) {
			bestScore = s;
			best = ch;
		}
	}
	return best;
}

const DCAP = 8; // distances beyond this share the same (minimum) weight

/**
 * Play one random non-eye-filling legal move (or pass) directly on `b`, favouring points
 * near existing stones (rejection sampling gives probability proportional to 1 / d^bias).
 * `dist` is a running distance map, updated here. Returns the move played.
 */
function playoutStep(b: Board, dist: Uint8Array, weights: number[]): number {
	const n = b.size;
	const nn = n * n;
	const me = b.toPlay;
	const c = b.cells;
	const trial = (p: number) => c[p] === EMPTY && !b.isEye(p, me) && b.play(p);
	let played = -2;
	for (let t = 0; t < 30 && played === -2; t++) {
		const p = (Math.random() * nn) | 0;
		if (c[p] === EMPTY && Math.random() < weights[dist[p]] && trial(p)) played = p;
	}
	if (played === -2) {
		// unbiased fallback scan from a random start
		const start = (Math.random() * nn) | 0;
		for (let i = 0; i < nn; i++) {
			const p = (start + i) % nn;
			if (trial(p)) { played = p; break; }
		}
	}
	if (played === -2) {
		b.play(PASS);
		return PASS;
	}
	// a new stone brings nearby points closer (captures are ignored: the map is approximate)
	const px = played % n, py = (played / n) | 0;
	for (let y = Math.max(0, py - DCAP); y <= Math.min(n - 1, py + DCAP); y++)
		for (let x = Math.max(0, px - DCAP); x <= Math.min(n - 1, px + DCAP); x++) {
			const d = Math.max(Math.abs(x - px), Math.abs(y - py));
			if (d < dist[y * n + x]) dist[y * n + x] = d;
		}
	return played;
}

/**
 * Simulate from `start` and return the pseudo win probability for BLACK: 1 / 0 when the game
 * is finished, else the heuristic evaluation once `playoutDepth` moves have been played.
 */
function playout(start: Board, komi: number, params: MCTSParams): number {
	const b = start.clone();
	const limit = b.size * b.size * 2;
	const depth = params.playoutDepth > 0 ? Math.min(params.playoutDepth, limit) : limit;
	const dist = distanceMap(b, DCAP);
	// weights[d] = acceptance probability for a point at distance d (d=0 only for stale entries)
	const weights = Array.from({ length: DCAP + 1 }, (_, d) => weightOf(d, params.distanceBias));
	let steps = 0;
	while (b.passes < 2 && steps++ < depth) {
		playoutStep(b, dist, weights);
	}
	if (b.passes >= 2 || params.playoutDepth <= 0) return b.score(komi).winner === BLACK ? 1 : 0;
	return blackWinProb(b, komi, params);
}

/**
 * Run MCTS from `root` for the side to move. Yields to the event loop regularly
 * so the page stays responsive.
 */
export async function runMCTS(
	rootBoard: Board,
	params: MCTSParams,
	opts: RunOptions = {},
): Promise<MCTSResult | null> {
	const komi = opts.komi ?? KOMI;
	const start = performance.now();
	const root = new Node(rootBoard.clone(), -2, other(rootBoard.toPlay), null);
	let done = 0;
	let sliceStart = performance.now();

	while (done < params.samples) {
		if (opts.token?.cancelled) return null;

		// selection / expansion
		let node = root;
		for (;;) {
			if (node.board.passes >= 2) break; // terminal
			if (!node.untried) init(node, params);
			if (node.untried!.length > 0 || node.children.length === 0) {
				const child = expand(node, params);
				if (child) {
					node = child;
					break;
				}
			}
			node = selectChild(node, params.exploration);
		}

		// simulation
		const pBlack =
			node.board.passes >= 2 ? (node.board.score(komi).winner === BLACK ? 1 : 0) : playout(node.board, komi, params);

		// backpropagation
		for (let n: Node | null = node; n; n = n.parent) {
			n.visits++;
			n.value += n.mover === BLACK ? pBlack : 1 - pBlack;
		}
		done++;

		if (performance.now() - sliceStart > 16) {
			opts.onProgress?.(done, params.samples);
			await new Promise((r) => setTimeout(r, 0));
			sliceStart = performance.now();
		}
	}
	opts.onProgress?.(done, params.samples);

	const ranked: MoveStat[] = root.children
		.map((ch) => ({ move: ch.move, visits: ch.visits, winRate: ch.value / ch.visits }))
		.sort((a, b) => b.visits - a.visits || b.winRate - a.winRate);
	const best = ranked[0] ?? { move: PASS, visits: 0, winRate: 0.5 };
	return {
		move: best.move,
		ranked,
		winRate: best.winRate,
		samples: done,
		ms: performance.now() - start,
	};
}
