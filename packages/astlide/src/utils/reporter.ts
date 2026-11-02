/**
 * Where exporters send what they have to say, so a library caller can capture
 * or silence it instead of it going to the console.
 *
 * @module
 */

/** What an export reports while it runs. */
export interface Reporter {
	/** A line of progress or a result ("✓ Saved to …"). */
	info(message: string): void;
	/** Something left out or worked around ("⚠ fonts not found …"). */
	warn(message: string): void;
	/** A line the next one replaces ("Slide 3/12"). */
	progress(message: string): void;
	/** The replaced line is done. */
	progressEnd(): void;
}

/** The console: `info` and `warn` as lines; progress in place, on a terminal only. */
export const consoleReporter: Reporter = {
	info: (message) => console.log(message),
	warn: (message) => console.warn(message),
	progress: (message) => {
		if (process.stdout.isTTY) process.stdout.write(`${message}\r`);
	},
	progressEnd: () => {
		if (process.stdout.isTTY) console.log("");
	},
};

/** Says nothing. */
export const silentReporter: Reporter = {
	info: () => {},
	warn: () => {},
	progress: () => {},
	progressEnd: () => {},
};
