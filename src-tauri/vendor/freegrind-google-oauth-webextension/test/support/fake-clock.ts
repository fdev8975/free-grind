type Timer = { id: number; at: number; callback: () => void };

export class FakeClock {
	now = 0;
	private nextId = 1;
	private readonly timers = new Map<number, Timer>();

	readonly setTimeout = (callback: () => void, delay = 0) => {
		const id = this.nextId++;
		this.timers.set(id, {
			id,
			at: this.now + Math.max(0, delay),
			callback,
		});
		return id;
	};

	readonly clearTimeout = (id: number) => {
		this.timers.delete(id);
	};

	get pending() {
		return this.timers.size;
	}

	advance(milliseconds: number) {
		const end = this.now + milliseconds;
		for (
			let due = this.earliestDueBy(end);
			due;
			due = this.earliestDueBy(end)
		) {
			this.timers.delete(due.id);
			this.now = due.at;
			due.callback();
		}
		this.now = end;
	}

	private earliestDueBy(end: number) {
		let earliest: Timer | undefined;
		for (const timer of this.timers.values()) {
			if (timer.at <= end && (!earliest || timer.at < earliest.at)) {
				earliest = timer;
			}
		}
		return earliest;
	}
}
