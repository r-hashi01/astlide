#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Simple color helpers (no external dependency)
const bold = (s: string) => `\x1b[1m${s}\x1b[0m`;
const green = (s: string) => `\x1b[32m${s}\x1b[0m`;
const cyan = (s: string) => `\x1b[36m${s}\x1b[0m`;
const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;
const red = (s: string) => `\x1b[31m${s}\x1b[0m`;

const THEMES = ["default", "dark", "minimal", "corporate", "gradient", "rose", "forest"] as const;
type Theme = (typeof THEMES)[number];

const PKG_MANAGERS = ["bun", "npm", "pnpm", "yarn"] as const;
type PkgManager = (typeof PKG_MANAGERS)[number];

function showHelp() {
	console.log();
	console.log(bold("  🎴 create-astlide"));
	console.log();
	console.log("  Scaffold a new Astlide slide project.");
	console.log();
	console.log(`  ${bold("Usage:")}`);
	console.log(`    ${dim("$")} bun create astlide ${cyan("[project-name]")}`);
	console.log();
	console.log(`  ${bold("Options:")}`);
	console.log(`    ${cyan("-h, --help")}      Show this help message`);
	console.log(`    ${cyan("-v, --version")}   Show version number`);
	console.log();
}

function showVersion() {
	const pkgPath = path.resolve(__dirname, "..", "package.json");
	const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
	console.log(pkg.version);
}

/** Ask a free-text question. Returns defaultValue on empty input. */
async function ask(question: string, defaultValue = ""): Promise<string> {
	const hint = defaultValue ? dim(` (${defaultValue})`) : "";
	const rl = readline.createInterface({
		input: process.stdin,
		output: process.stdout,
	});
	return new Promise((resolve) => {
		rl.question(`  ${question}${hint}: `, (answer: string) => {
			rl.close();
			resolve(answer.trim() || defaultValue);
		});
	});
}

/** Show a numbered list and ask the user to pick one. Returns defaultIndex item on invalid/empty input. */
async function askChoice<T extends string>(
	question: string,
	choices: readonly T[],
	defaultIndex = 0,
): Promise<T> {
	console.log();
	console.log(`  ${bold(question)}`);
	for (let i = 0; i < choices.length; i++) {
		const marker = i === defaultIndex ? green("▶") : " ";
		console.log(`  ${marker} ${dim(`${i + 1}.`)} ${choices[i]}`);
	}
	console.log();
	const rl = readline.createInterface({
		input: process.stdin,
		output: process.stdout,
	});
	return new Promise((resolve) => {
		rl.question(`  ${dim(`Enter 1-${choices.length}`)} [${defaultIndex + 1}]: `, (answer: string) => {
			rl.close();
			const num = Number.parseInt(answer.trim(), 10);
			if (num >= 1 && num <= choices.length) {
				resolve(choices[num - 1]);
			} else {
				resolve(choices[defaultIndex]);
			}
		});
	});
}

/** Ask a yes/no question. */
async function askYesNo(question: string, defaultYes = true): Promise<boolean> {
	const hint = defaultYes ? "[Y/n]" : "[y/N]";
	const rl = readline.createInterface({
		input: process.stdin,
		output: process.stdout,
	});
	return new Promise((resolve) => {
		rl.question(`  ${question} ${dim(hint)}: `, (answer: string) => {
			rl.close();
			const a = answer.trim().toLowerCase();
			if (!a) resolve(defaultYes);
			else resolve(a === "y" || a === "yes");
		});
	});
}

async function main() {
	const args = process.argv.slice(2);

	if (args.includes("-h") || args.includes("--help")) {
		showHelp();
		return;
	}

	if (args.includes("-v") || args.includes("--version")) {
		showVersion();
		return;
	}

	console.log();
	console.log(bold("  🎴 create-astlide"));
	console.log();

	// 1. Project name
	const nameArg = args[0];
	const rawName = nameArg ?? (await ask("Project name", "my-slides"));
	// Strip any path components — project name must be a plain directory name.
	// Trim trailing path separators first so that "my-deck/" → "my-deck" (not ".").
	const projectName = path.basename(rawName.replace(/[\\/]+$/, "")) || "my-slides";
	if (projectName === "." || projectName === "..") {
		console.log(red(`\n  Error: Invalid project name "${rawName}".`));
		process.exit(1);
	}

	const targetDir = path.resolve(process.cwd(), projectName);
	if (fs.existsSync(targetDir) && fs.readdirSync(targetDir).length > 0) {
		console.log(red(`\n  Error: Directory "${projectName}" already exists and is not empty.`));
		process.exit(1);
	}

	// 2. Theme
	const theme = await askChoice<Theme>("Choose a theme:", THEMES, 0);

	// 3. Example slides
	const includeExamples = await askYesNo(
		"Include example slides? (7 demos: layouts, code, fragments, columns)",
		true,
	);

	// 4. Package manager
	const pkgManager = await askChoice<PkgManager>("Package manager:", PKG_MANAGERS, 0);

	console.log();

	// Copy template
	const templateDir = path.resolve(__dirname, "..", "template");
	copyDir(templateDir, targetDir);

	// Rename _gitignore → .gitignore (npm strips .gitignore from published packages)
	const gitignorePath = path.join(targetDir, "_gitignore");
	if (fs.existsSync(gitignorePath)) {
		fs.renameSync(gitignorePath, path.join(targetDir, ".gitignore"));
	}

	// Update package.json name
	const pkgPath = path.join(targetDir, "package.json");
	if (fs.existsSync(pkgPath)) {
		const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
		pkg.name = path.basename(projectName);
		fs.writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);
	}

	// Apply chosen theme to _config.json
	const configPath = path.join(
		targetDir,
		"src",
		"content",
		"decks",
		"example-deck",
		"_config.json",
	);
	if (fs.existsSync(configPath)) {
		const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
		config.theme = theme;
		fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);
	}

	// If no example slides: remove 02–06, leaving only cover + end
	if (!includeExamples) {
		const deckDir = path.join(targetDir, "src", "content", "decks", "example-deck");
		for (const file of fs.readdirSync(deckDir)) {
			if (/^0[2-6]-/.test(file)) {
				fs.rmSync(path.join(deckDir, file));
			}
		}
	}

	// Done — print summary and next steps
	console.log(`${green("  ✓")} Project scaffolded in ${cyan(projectName)}`);
	console.log(`${green("  ✓")} Theme: ${cyan(theme)}`);
	if (!includeExamples) {
		console.log(`${green("  ✓")} Minimal template ${dim("(cover + end slide)")}`);
	}
	console.log();
	console.log(`  ${bold("Next steps:")}`);
	console.log();
	console.log(`  ${dim("$")} cd ${projectName}`);

	const installCmd = pkgManager === "npm" ? "npm install" : `${pkgManager} install`;
	const devCmd = pkgManager === "npm" ? "npm run dev" : `${pkgManager} run dev`;

	console.log(`  ${dim("$")} ${installCmd}`);
	console.log(`  ${dim("$")} ${devCmd}`);
	console.log();
	console.log(`  Then open ${cyan("http://localhost:4321")}`);
	console.log();
}

function copyDir(src: string, dest: string) {
	fs.mkdirSync(dest, { recursive: true });
	for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
		const srcPath = path.join(src, entry.name);
		const destPath = path.join(dest, entry.name);
		if (entry.isDirectory()) {
			copyDir(srcPath, destPath);
		} else {
			fs.copyFileSync(srcPath, destPath);
		}
	}
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
