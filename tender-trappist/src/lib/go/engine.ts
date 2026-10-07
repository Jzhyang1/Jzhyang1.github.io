// Go rules engine: captures, suicide, ko, passing, and Tromp-Taylor area scoring.

export const EMPTY = 0;
export const BLACK = 1;
export const WHITE = 2;
export type Color = 1 | 2;
export const PASS = -1;
export const KOMI = 7.5;

export const other = (c: Color): Color => (3 - c) as Color;

// ---- geometry caches -------------------------------------------------------

interface Geometry {
	nbr: number[][];
	diag: number[][];
}
const geometryCache = new Map<number, Geometry>();

function geometry(size: number): Geometry {
	let g = geometryCache.get(size);
	if (g) return g;
	const nbr: number[][] = [];
	const diag: number[][] = [];
	for (let y = 0; y < size; y++) {
		for (let x = 0; x < size; x++) {
			const n: number[] = [];
			const d: number[] = [];
			for (const [dx, dy] of [[0, -1], [-1, 0], [1, 0], [0, 1]]) {
				const nx = x + dx, ny = y + dy;
				if (nx >= 0 && ny >= 0 && nx < size && ny < size) n.push(ny * size + nx);
			}
			for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
				const nx = x + dx, ny = y + dy;
				if (nx >= 0 && ny >= 0 && nx < size && ny < size) d.push(ny * size + nx);
			}
			nbr.push(n);
			diag.push(d);
		}
	}
	g = { nbr, diag };
	geometryCache.set(size, g);
	return g;
}

// ---- shared scratch space (the engine is single threaded) -------------------

let mark = new Int32Array(19 * 19);
let stamp = 0;
const groupBuf: number[] = [];

function ensureScratch(n: number) {
	if (mark.length < n) mark = new Int32Array(n);
}

export interface Score {
	black: number;
	white: number; // includes komi
	komi: number;
	winner: Color;
	margin: number;
	/** 0 = neutral, BLACK / WHITE = area owned (stones + surrounded empties) */
	owner: Uint8Array;
}

// ---- board -----------------------------------------------------------------

export class Board {
	readonly size: number;
	cells: Uint8Array;
	toPlay: Color = BLACK;
	/** point that may not be played because of simple ko, or -1 */
	ko = -1;
	/** consecutive passes */
	passes = 0;
	/** stones currently on the board, indexed by color */
	stones: [number, number, number] = [0, 0, 0];
	/** prisoners taken, indexed by the capturing color */
	captured: [number, number, number] = [0, 0, 0];
	/** last move played (point, PASS, or -2 for none) */
	lastMove = -2;
	moves = 0;

	constructor(size: number) {
		this.size = size;
		this.cells = new Uint8Array(size * size);
		ensureScratch(size * size);
	}

	clone(): Board {
		const b = new Board(this.size);
		b.cells.set(this.cells);
		b.toPlay = this.toPlay;
		b.ko = this.ko;
		b.passes = this.passes;
		b.stones = [...this.stones] as [number, number, number];
		b.captured = [...this.captured] as [number, number, number];
		b.lastMove = this.lastMove;
		b.moves = this.moves;
		return b;
	}

	/** Positional identity (stones only), used for superko. */
	key(): string {
		return String.fromCharCode(...this.cells);
	}

	/**
	 * Flood-fill the group at `start`, filling groupBuf with its stones.
	 * Returns its liberty count.
	 */
	private flood(start: number): number {
		const { nbr } = geometry(this.size);
		const c = this.cells;
		const color = c[start];
		stamp += 2;
		const stoneMark = stamp, libMark = stamp + 1;
		groupBuf.length = 0;
		groupBuf.push(start);
		mark[start] = stoneMark;
		let libs = 0;
		for (let i = 0; i < groupBuf.length; i++) {
			for (const n of nbr[groupBuf[i]]) {
				if (mark[n] === stoneMark || mark[n] === libMark) continue;
				if (c[n] === EMPTY) {
					mark[n] = libMark;
					libs++;
				} else if (c[n] === color) {
					mark[n] = stoneMark;
					groupBuf.push(n);
				}
			}
		}
		return libs;
	}

	/** Play a move for the side to move. Returns false (state untouched) if illegal. */
	play(move: number): boolean {
		const me = this.toPlay;
		const op = other(me);
		if (move === PASS) {
			this.ko = -1;
			this.passes++;
			this.lastMove = PASS;
			this.toPlay = op;
			this.moves++;
			return true;
		}
		const c = this.cells;
		if (move < 0 || move >= c.length || c[move] !== EMPTY || move === this.ko) return false;

		const { nbr } = geometry(this.size);
		c[move] = me;
		let capCount = 0;
		let capPoint = -1;
		for (const n of nbr[move]) {
			if (c[n] !== op) continue; // also skips groups already removed this move
			if (this.flood(n) === 0) {
				for (const s of groupBuf) {
					c[s] = EMPTY;
					capPoint = s;
				}
				capCount += groupBuf.length;
			}
		}
		const libs = this.flood(move);
		if (libs === 0) {
			// suicide (can't have captured anything, or we'd have a liberty)
			c[move] = EMPTY;
			return false;
		}
		this.ko = capCount === 1 && groupBuf.length === 1 && libs === 1 ? capPoint : -1;
		this.stones[me]++;
		this.stones[op] -= capCount;
		this.captured[me] += capCount;
		this.passes = 0;
		this.lastMove = move;
		this.toPlay = op;
		this.moves++;
		return true;
	}

	/** True if `p` is a single-point eye of `color` (never worth filling in). */
	isEye(p: number, color: Color): boolean {
		const { nbr, diag } = geometry(this.size);
		const c = this.cells;
		for (const n of nbr[p]) if (c[n] !== color) return false;
		const d = diag[p];
		let bad = 0;
		for (const q of d) if (c[q] !== color) bad++;
		return d.length < 4 ? bad === 0 : bad <= 1;
	}

	/** Tromp-Taylor area score: stones plus empty regions bordering only one color. */
	score(komi = KOMI): Score {
		const { nbr } = geometry(this.size);
		const c = this.cells;
		const owner = new Uint8Array(c.length);
		let black = 0, white = 0;
		stamp += 2; // flood() uses stamp and stamp+1, so skip past both
		const seen = stamp;
		for (let i = 0; i < c.length; i++) {
			if (c[i] === BLACK) { black++; owner[i] = BLACK; }
			else if (c[i] === WHITE) { white++; owner[i] = WHITE; }
		}
		for (let i = 0; i < c.length; i++) {
			if (c[i] !== EMPTY || mark[i] === seen) continue;
			const region = [i];
			mark[i] = seen;
			let touchB = false, touchW = false;
			for (let j = 0; j < region.length; j++) {
				for (const n of nbr[region[j]]) {
					if (c[n] === BLACK) touchB = true;
					else if (c[n] === WHITE) touchW = true;
					else if (mark[n] !== seen) {
						mark[n] = seen;
						region.push(n);
					}
				}
			}
			if (touchB !== touchW) {
				const who = touchB ? BLACK : WHITE;
				for (const p of region) owner[p] = who;
				if (touchB) black += region.length;
				else white += region.length;
			}
		}
		const w = white + komi;
		return {
			black,
			white: w,
			komi,
			winner: black > w ? BLACK : WHITE,
			margin: Math.abs(black - w),
			owner,
		};
	}
}

// ---- game (history, superko, resignation) ----------------------------------

export type PlayResult = { ok: true } | { ok: false; reason: string };

export class Game {
	readonly size: number;
	readonly komi: number;
	board: Board;
	/** snapshots of the board before each move, for undo */
	private history: Board[] = [];
	private moveList: number[] = [];
	private seen = new Set<string>();
	resigned: Color | null = null;

	constructor(size = 9, komi = KOMI) {
		this.size = size;
		this.komi = komi;
		this.board = new Board(size);
		this.seen.add(this.board.key());
	}

	get moveCount() {
		return this.moveList.length;
	}
	get moves(): readonly number[] {
		return this.moveList;
	}
	get over() {
		return this.resigned !== null || this.board.passes >= 2;
	}

	play(move: number): PlayResult {
		if (this.over) return { ok: false, reason: "The game is over." };
		const b = this.board;
		let next: Board;
		if (move === PASS) {
			next = b.clone();
			next.play(PASS);
		} else {
			if (move < 0 || move >= b.cells.length) return { ok: false, reason: "Off the board." };
			if (b.cells[move] !== EMPTY) return { ok: false, reason: "That point is occupied." };
			if (move === b.ko) return { ok: false, reason: "Ko: you can't retake immediately." };
			next = b.clone();
			if (!next.play(move)) return { ok: false, reason: "Suicide is not allowed." };
			if (this.seen.has(next.key())) {
				return { ok: false, reason: "That would repeat an earlier position (superko)." };
			}
			this.seen.add(next.key());
		}
		this.history.push(b);
		this.moveList.push(move);
		this.board = next;
		return { ok: true };
	}

	resign(color: Color) {
		if (!this.over) this.resigned = color;
	}

	canUndo() {
		return this.history.length > 0;
	}

	undo(): boolean {
		if (this.resigned) {
			this.resigned = null;
			return true;
		}
		const prev = this.history.pop();
		if (!prev) return false;
		this.seen.delete(this.board.key());
		this.moveList.pop();
		this.board = prev;
		// a pass leaves the key unchanged, so it must stay in `seen` if `prev` shares it
		this.seen.add(prev.key());
		return true;
	}

	score(): Score {
		return this.board.score(this.komi);
	}

	/** Winner and a human-readable summary, or null while the game is in progress. */
	result(): { winner: Color; text: string } | null {
		const name = (c: Color) => (c === BLACK ? "Black" : "White");
		if (this.resigned) {
			const winner = other(this.resigned);
			return { winner, text: `${name(this.resigned)} resigned. ${name(winner)} wins.` };
		}
		if (this.board.passes < 2) return null;
		const s = this.score();
		return {
			winner: s.winner,
			text: `${name(s.winner)} wins by ${s.margin}  (Black ${s.black}, White ${s.white - s.komi} + ${s.komi} komi)`,
		};
	}
}

// ---- coordinates -----------------------------------------------------------

const LETTERS = "ABCDEFGHJKLMNOPQRST"; // no "I"

export function pointName(p: number, size: number): string {
	if (p === PASS) return "pass";
	const x = p % size, y = Math.floor(p / size);
	return `${LETTERS[x]}${size - y}`;
}
