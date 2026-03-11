#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Simple color helpers (avoid dependency if kleur not available)
const bold = (s: string) => `\x1b[1m${s}\x1b[0m`;
const green = (s: string) => `\x1b[32m${s}\x1b[0m`;
const cyan = (s: string) => `\x1b[36m${s}\x1b[0m`;
const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;
const red = (s: string) => `\x1b[31m${s}\x1b[0m`;

async function main() {
	const args = process.argv.slice(2);
	const projectName = args[0] || "my-slides";

	console.log();
	console.log(bold("  🎴 create-astlide"));
	console.log();

	const targetDir = path.resolve(process.cwd(), projectName);

	if (fs.existsSync(targetDir) && fs.readdirSync(targetDir).length > 0) {
		console.log(red(`  Error: Directory "${projectName}" already exists and is not empty.`));
		process.exit(1);
	}

	// Copy template
	const templateDir = path.resolve(__dirname, "..", "template");
	copyDir(templateDir, targetDir);

	// Rename _gitignore to .gitignore (npm strips .gitignore from published packages)
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

	console.log(`${green("  ✓ ")}Project scaffolded in ${cyan(projectName)}`);
	console.log();
	console.log("  Next steps:");
	console.log();
	console.log(`  ${dim("$")} cd ${projectName}`);
	console.log(`  ${dim("$")} bun install`);
	console.log(`  ${dim("$")} bun run dev`);
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
