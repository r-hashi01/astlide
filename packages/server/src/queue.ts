/**
 * A small FIFO limiter: at most `concurrency` jobs run at once, at most
 * `maxQueued` wait; beyond that, {@link Queue.run} rejects with {@link QueueFull}.
 *
 * @module
 */

/** The queue is full: answered with HTTP 503. */
export class QueueFull extends Error {
	status = 503;
	constructor() {
		super("the server is busy — try again later");
	}
}

export class Queue {
	private running = 0;
	private waiting: (() => void)[] = [];

	constructor(
		private concurrency: number,
		private maxQueued: number,
	) {}

	/** Jobs running and waiting. */
	get size(): { running: number; waiting: number } {
		return { running: this.running, waiting: this.waiting.length };
	}

	async run<T>(job: () => Promise<T>): Promise<T> {
		if (this.running >= this.concurrency) {
			if (this.waiting.length >= this.maxQueued) throw new QueueFull();
			await new Promise<void>((resolve) => this.waiting.push(resolve));
		} else {
			this.running++;
		}
		try {
			return await job();
		} finally {
			const next = this.waiting.shift();
			// The slot passes straight to the next job; `running` stays the same.
			if (next) next();
			else this.running--;
		}
	}
}
