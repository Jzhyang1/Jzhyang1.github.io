/** Bash-like up/down command history with a bounded size and draft-line preservation. */
export class CommandHistory {
  private readonly entries: string[] = [];
  private cursor = 0;
  private draft = "";

  constructor(private readonly limit: number = 100) {}

  /** Records a submitted command. No-ops for blank input. */
  push(command: string): void {
    if (command.trim() === "") {
      this.cursor = this.entries.length;
      return;
    }
    this.entries.push(command);
    if (this.entries.length > this.limit) this.entries.shift();
    this.cursor = this.entries.length;
    this.draft = "";
  }

  /** Steps back one command (older). `currentInput` is stashed so it can be restored. */
  previous(currentInput: string): string | null {
    if (this.entries.length === 0) return null;
    if (this.cursor === this.entries.length) this.draft = currentInput;
    if (this.cursor > 0) this.cursor -= 1;
    return this.entries[this.cursor];
  }

  /** Steps forward one command (newer), restoring the stashed draft once past the end. */
  next(): string | null {
    if (this.cursor >= this.entries.length) return null;
    this.cursor += 1;
    return this.cursor === this.entries.length ? this.draft : this.entries[this.cursor];
  }
}
