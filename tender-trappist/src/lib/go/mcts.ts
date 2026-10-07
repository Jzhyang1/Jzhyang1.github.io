// Parameterized Monte-Carlo tree search for Go.
import { Board, EMPTY, KOMI, PASS, other, type Color } from "./engine";

export interface MCTSParams {
	/** UCT exploration constant: higher = explores less-visited moves more. */
	exploration: number;
	/** Number of simulations (tree iterations) to run. */
	samples: number;
	/**
	 * Prune a move when it leaves the mover behind by more than this many stones
	 * (own stones - opponent stones < -limit). 0 disables pruning.
	 */
	pieceDiffLimit: number;
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
	pieceDiffLimit: 8,
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
	visits = 0;
	value = 0; // wins for `mover`
	constructor(
		readonly board: Board,
		readonly move: number,
		readonly mover: Color,
		readonly parent: Node | null,
	) {}
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
		if (m !== PASS && !node.noPrune && params.pieceDiffLimit > 0) {
			// captures are already reflected here: play() removes captured stones
			if (nb.stones[mover] - nb.stones[other(mover)] < -params.pieceDiffLimit) {
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

function playout(start: Board, komi: number, params: MCTSParams): Color {
	const b = start.clone();
	const limit = b.size * b.size * 2;
	const dist = distanceMap(b, DCAP);
	// weights[d] = acceptance probability for a point at distance d (d=0 only for stale entries)
	const weights = Array.from({ length: DCAP + 1 }, (_, d) => weightOf(d, params.distanceBias));
	let steps = 0;
	while (b.passes < 2 && steps++ < limit) {
		playoutStep(b, dist, weights);
	}
	return b.score(komi).winner;
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
		const winner = node.board.passes >= 2 ? node.board.score(komi).winner : playout(node.board, komi, params);

		// backpropagation
		for (let n: Node | null = node; n; n = n.parent) {
			n.visits++;
			if (n.mover === winner) n.value++;
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
