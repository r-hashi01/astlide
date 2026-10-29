/**
 * `astlide template` — manage the PowerPoint templates in a template store
 * (a folder, `s3://`, `gs://` or `azure://`; see `@astlide/core/templates`):
 * the same store the render service and `astlide({ templates })` read.
 *
 * @module
 */

import { readFile, writeFile } from "node:fs/promises";
import { basename, extname, resolve } from "node:path";
import { pptxToTemplate } from "../pptx/index";
import { slugify } from "../pptx/slug";
import {
	openTemplateStore,
	TEMPLATE_EXTENSIONS,
	type TemplateExtension,
	type TemplateInfo,
	type TemplateStore,
	templateNameError,
} from "../templates/index";

export const TEMPLATE_HELP = `
Usage:
  astlide template list
  astlide template add <file> [--name <name>] [--label <label>]
    Store a .pptx / .potx / .thmx (a new version when the name exists).
    The name defaults to the file name, as a slug.
  astlide template show <name> [--version <n>]
    Versions, and the layouts (slideLayout names) of the latest or given version
  astlide template download <name> [--version <n>] [-o <file>]
  astlide template remove <name> [--version <n>]
    Delete the template, or only one version

Options:
  --store <location>    A folder, s3://<bucket>/<prefix>, gs://<bucket>/<prefix>
                        or azure://<container>/<prefix> (default: ASTLIDE_TEMPLATE_STORE).
                        Cloud credentials come from each provider's usual variables.
  --json                list / show: print JSON
`;

export interface TemplateCommandIO {
	log(line: string): void;
	env: Record<string, string | undefined>;
	cwd: string;
}

/** A usage mistake: the CLI prints it with the help. */
export class TemplateUsageError extends Error {}

interface Parsed {
	sub?: string;
	args: string[];
	store?: string;
	name?: string;
	label?: string;
	version?: number;
	output?: string;
	json: boolean;
}

function parse(argv: string[]): Parsed {
	const p: Parsed = { args: [], json: false };
	const value = (i: number, flag: string) => {
		const v = argv[i];
		if (v === undefined || v.startsWith("-")) throw new TemplateUsageError(`${flag} needs a value`);
		return v;
	};
	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i] as string;
		if (arg === "--store") p.store = value(++i, arg);
		else if (arg === "--name") p.name = value(++i, arg);
		else if (arg === "--label") p.label = value(++i, arg);
		else if (arg === "-o" || arg === "--output") p.output = value(++i, arg);
		else if (arg === "--version") {
			const n = Number(value(++i, arg));
			if (!Number.isInteger(n) || n < 1)
				throw new TemplateUsageError("--version must be a version number (1, 2, …)");
			p.version = n;
		} else if (arg === "--json") p.json = true;
		else if (arg.startsWith("-")) throw new TemplateUsageError(`unknown option ${arg}`);
		else if (p.sub === undefined) p.sub = arg;
		else p.args.push(arg);
	}
	return p;
}

const describe = (t: TemplateInfo) => {
	const versions = t.versions.map((v) => `v${v.version}`).join(", ");
	return `${t.name}${t.label ? ` (${t.label})` : ""} — latest v${t.latest}; versions: ${versions}; updated ${t.updatedAt}`;
};

function one(args: string[], what: string): string {
	if (args.length !== 1) throw new TemplateUsageError(`name one ${what}`);
	return args[0] as string;
}

/** Run `astlide template <sub> …`. */
export async function runTemplateCommand(
	argv: string[],
	io: TemplateCommandIO,
	open: (location: string) => TemplateStore = (l) => openTemplateStore(l, io.env),
): Promise<void> {
	const p = parse(argv);
	if (!p.sub)
		throw new TemplateUsageError("name a subcommand: list, add, show, download or remove");
	const location = p.store ?? io.env.ASTLIDE_TEMPLATE_STORE;
	if (!location)
		throw new TemplateUsageError(
			"name the template store: --store <location> or ASTLIDE_TEMPLATE_STORE",
		);
	// A folder is relative to where the command runs.
	const store = open(
		/^[a-z][a-z0-9+.-]*:\/\//i.test(location) ? location : resolve(io.cwd, location),
	);

	switch (p.sub) {
		case "list": {
			if (p.args.length) throw new TemplateUsageError("list takes no arguments");
			const all = await store.list();
			if (p.json) io.log(JSON.stringify(all, null, 2));
			else if (!all.length) io.log("No templates.");
			else for (const t of all) io.log(describe(t));
			return;
		}
		case "add": {
			const file = resolve(io.cwd, one(p.args, "file"));
			const ext = extname(file).toLowerCase();
			if (!(TEMPLATE_EXTENSIONS as readonly string[]).includes(ext))
				throw new TemplateUsageError(`expected a ${TEMPLATE_EXTENSIONS.join(" / ")} file`);
			const name = p.name ?? slugify(basename(file, extname(file)), "template");
			const error = templateNameError(name);
			if (error) throw new TemplateUsageError(`${error}${p.name ? "" : " — pass --name"}`);
			const data = await readFile(file);
			// Read it before storing it: a file that isn't a template is refused here.
			try {
				pptxToTemplate(data, { media: () => "" });
			} catch (e) {
				throw new Error(`${file} is not a readable PowerPoint template: ${(e as Error).message}`);
			}
			const info = await store.put(name, data, { ext: ext as TemplateExtension, label: p.label });
			io.log(`✓ Stored ${name} v${info.latest}`);
			return;
		}
		case "show": {
			const name = one(p.args, "template");
			const stored = await store.get(name, p.version);
			if (!stored)
				throw new Error(`no template "${name}"${p.version ? ` with version ${p.version}` : ""}`);
			const t = pptxToTemplate(stored.data, { media: () => "" });
			const layouts = t.layouts.map((l) => ({
				id: l.id,
				name: l.name,
				builtIn: Object.entries(t.aliases)
					.filter(([, id]) => id === l.id)
					.map(([b]) => b),
			}));
			if (p.json) {
				io.log(
					JSON.stringify({ ...stored.info, version: stored.version.version, layouts }, null, 2),
				);
				return;
			}
			io.log(describe(stored.info));
			io.log(`Layouts in v${stored.version.version} (use as slideLayout):`);
			for (const l of layouts)
				io.log(`  ${l.id} — ${l.name}${l.builtIn.length ? ` (for ${l.builtIn.join(", ")})` : ""}`);
			return;
		}
		case "download": {
			const name = one(p.args, "template");
			const stored = await store.get(name, p.version);
			if (!stored)
				throw new Error(`no template "${name}"${p.version ? ` with version ${p.version}` : ""}`);
			const out = resolve(io.cwd, p.output ?? `${name}${stored.version.ext}`);
			await writeFile(out, stored.data);
			io.log(`✓ ${name} v${stored.version.version} → ${out}`);
			return;
		}
		case "remove": {
			const name = one(p.args, "template");
			if (!(await store.remove(name, p.version)))
				throw new Error(`no template "${name}"${p.version ? ` with version ${p.version}` : ""}`);
			io.log(`✓ Removed ${name}${p.version ? ` v${p.version}` : ""}`);
			return;
		}
		default:
			throw new TemplateUsageError(`unknown subcommand "${p.sub}"`);
	}
}
