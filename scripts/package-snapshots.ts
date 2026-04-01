#!/usr/bin/env npx tsx

import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdtempSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, isAbsolute, join, relative, resolve } from "node:path";

const ROOT = join(import.meta.dirname, "..");
const REGISTRY_COPY_MARKER = join(ROOT, "registry", ".build-markers", "wasm-copied");
const DEP_FIELDS = ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"] as const;
const RUNTIME_DEP_FIELDS = ["dependencies", "peerDependencies", "optionalDependencies"] as const;
const COPY_EXCLUDES = new Set(["node_modules", ".turbo", "coverage"]);
const SOURCE_EXTENSIONS = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".mts", ".cts", ".d.ts"];

type DependencyField = (typeof DEP_FIELDS)[number];

type WorkspacePackage = {
	name: string;
	path: string;
	packageJsonPath: string;
	version: string;
	private: boolean;
};

type ManifestEntry = {
	name: string;
	path: string;
	tag: string;
	url: string;
	snapshotDir: string;
};

type Options = {
	packages: string[];
	repo: string;
	snapshot: string;
	tagPrefix: string;
	manifestPath?: string;
	push: boolean;
	build: boolean;
	allowSkippingUnavailable: boolean;
};

function run(
	command: string,
	args: string[],
	options?: { cwd?: string; stdio?: "pipe" | "inherit" },
): string {
	const output = execFileSync(command, args, {
		cwd: options?.cwd ?? ROOT,
		stdio: options?.stdio ?? "pipe",
		encoding: "utf8",
	});
	return typeof output === "string" ? output.trim() : "";
}

function tryRun(command: string, args: string[], options?: { cwd?: string }): { ok: boolean; output: string } {
	try {
		return { ok: true, output: run(command, args, options) };
	} catch {
		return { ok: false, output: "" };
	}
}

function fatal(message: string): never {
	console.error(`\x1b[31mError:\x1b[0m ${message}`);
	process.exit(1);
}

function parseSelection(input: string): string[] {
	return input
		.split(/[\n,]/)
		.map((value) => value.trim())
		.filter(Boolean);
}

function parseArgs(): Options {
	const args = process.argv.slice(2);
	const packageSelections: string[] = [];
	let repo = "";
	let snapshot = "";
	let tagPrefix = "snapshot";
	let manifestPath: string | undefined;
	let push = false;
	let build = false;

	for (let index = 0; index < args.length; index += 1) {
		const arg = args[index];
		switch (arg) {
			case "--package": {
				const value = args[index + 1];
				if (!value || value.startsWith("--")) {
					fatal("--package requires a package name or path");
				}
				packageSelections.push(value);
				index += 1;
				break;
			}
			case "--packages": {
				const value = args[index + 1];
				if (!value || value.startsWith("--")) {
					fatal("--packages requires a comma- or newline-separated value");
				}
				packageSelections.push(...parseSelection(value));
				index += 1;
				break;
			}
			case "--repo": {
				const value = args[index + 1];
				if (!value || value.startsWith("--")) {
					fatal("--repo requires an owner/repo value");
				}
				repo = value;
				index += 1;
				break;
			}
			case "--snapshot": {
				const value = args[index + 1];
				if (!value || value.startsWith("--")) {
					fatal("--snapshot requires a snapshot label");
				}
				snapshot = value;
				index += 1;
				break;
			}
			case "--tag-prefix": {
				const value = args[index + 1];
				if (!value || value.startsWith("--")) {
					fatal("--tag-prefix requires a value");
				}
				tagPrefix = value;
				index += 1;
				break;
			}
			case "--manifest": {
				const value = args[index + 1];
				if (!value || value.startsWith("--")) {
					fatal("--manifest requires a file path");
				}
				manifestPath = value;
				index += 1;
				break;
			}
			case "--push":
				push = true;
				break;
			case "--build":
				build = true;
				break;
			default:
				fatal(`Unknown argument: ${arg}`);
		}
	}

	if (!repo) {
		fatal("--repo is required");
	}
	if (!snapshot) {
		fatal("--snapshot is required");
	}

	return {
		packages: packageSelections,
		repo,
		snapshot,
		tagPrefix,
		manifestPath,
		push,
		build,
		allowSkippingUnavailable:
			packageSelections.length === 0 ||
			(packageSelections.length === 1 && packageSelections[0]?.trim().toLowerCase() === "all"),
	};
}

function readPackageJson(packageJsonPath: string): Record<string, unknown> {
	return JSON.parse(readFileSync(packageJsonPath, "utf8")) as Record<string, unknown>;
}

function dependencyNamesForFields(
	packageJsonPath: string,
	workspaceByName: Map<string, WorkspacePackage>,
	fields: readonly string[],
): string[] {
	const packageJson = readPackageJson(packageJsonPath);
	const names = new Set<string>();

	for (const field of fields) {
		const dependencies = packageJson[field];
		if (!dependencies || typeof dependencies !== "object" || Array.isArray(dependencies)) {
			continue;
		}

		for (const dependencyName of Object.keys(dependencies as Record<string, string>)) {
			if (workspaceByName.has(dependencyName)) {
				names.add(dependencyName);
			}
		}
	}

	return [...names];
}

function filesFieldEntries(packageJsonPath: string): string[] {
	const packageJson = readPackageJson(packageJsonPath);
	const files = packageJson.files;
	if (!Array.isArray(files)) {
		return [];
	}

	return files.filter((entry): entry is string => typeof entry === "string");
}

function loadWorkspacePackages(): WorkspacePackage[] {
	const listing = run("pnpm", ["-r", "ls", "--json", "--depth", "-1"]);
	const packages = JSON.parse(listing) as Array<{ name?: string; path: string; private?: boolean }>;

	return packages
		.filter((entry) => entry.path !== ROOT && typeof entry.name === "string")
		.map((entry) => {
			const packageJsonPath = join(entry.path, "package.json");
			const packageJson = readPackageJson(packageJsonPath);
			return {
				name: String(packageJson.name),
				path: resolve(entry.path),
				packageJsonPath,
				version: String(packageJson.version),
				private: Boolean(packageJson.private),
			};
		});
}

function resolveSelectionToken(token: string, workspacePackages: WorkspacePackage[]): WorkspacePackage {
	const byName = workspacePackages.find((entry) => entry.name === token);
	if (byName) {
		return byName;
	}

	const normalizedPath = isAbsolute(token) ? resolve(token) : resolve(ROOT, token);
	const byPath = workspacePackages.find((entry) => entry.path === normalizedPath);
	if (byPath) {
		return byPath;
	}

	const shortNameMatches = workspacePackages.filter((entry) => entry.name.split("/").at(-1) === token);
	if (shortNameMatches.length === 1) {
		return shortNameMatches[0];
	}
	if (shortNameMatches.length > 1) {
		fatal(`Package token "${token}" is ambiguous. Use the full package name or package path.`);
	}

	fatal(`Could not resolve package selection "${token}"`);
}

function resolveSelectedPackages(tokens: string[], workspacePackages: WorkspacePackage[]): WorkspacePackage[] {
	const normalizedTokens = tokens.map((token) => token.trim()).filter(Boolean);
	const allTokenCount = normalizedTokens.filter((token) => token.toLowerCase() === "all").length;
	if (allTokenCount > 0 && normalizedTokens.length > 1) {
		fatal('Use "all" by itself, not mixed with other package selections');
	}
	if (normalizedTokens.length === 0 || allTokenCount === 1) {
		return workspacePackages
			.filter((entry) => !entry.private)
			.sort((left, right) => left.name.localeCompare(right.name));
	}

	const selected: WorkspacePackage[] = [];
	const seen = new Set<string>();

	for (const token of normalizedTokens) {
		const resolvedPackage = resolveSelectionToken(token, workspacePackages);
		if (resolvedPackage.private) {
			fatal(`Package "${resolvedPackage.name}" is private and cannot be snapshotted`);
		}
		if (!seen.has(resolvedPackage.name)) {
			selected.push(resolvedPackage);
			seen.add(resolvedPackage.name);
		}
	}

	return selected;
}

function isRegistrySoftwarePackage(workspacePackage: WorkspacePackage): boolean {
	return relative(join(ROOT, "registry", "software"), workspacePackage.path).startsWith("..") === false;
}

function packageNeedsWasmAssets(workspacePackage: WorkspacePackage): boolean {
	return isRegistrySoftwarePackage(workspacePackage) && filesFieldEntries(workspacePackage.packageJsonPath).includes("wasm");
}

function ensureRegistryWasmAssets(selectedPackages: WorkspacePackage[]) {
	if (!selectedPackages.some(packageNeedsWasmAssets)) {
		return;
	}
	if (existsSync(REGISTRY_COPY_MARKER)) {
		return;
	}

	run("make", ["copy-wasm"], {
		cwd: join(ROOT, "registry"),
		stdio: "inherit",
	});
}

function missingRequiredFileEntries(packageDir: string): string[] {
	const packageJsonPath = join(packageDir, "package.json");
	return filesFieldEntries(packageJsonPath).filter((entry) => !hasPackagedEntry(packageDir, entry));
}

function partitionSnapshotReadyPackages(selectedPackages: WorkspacePackage[]) {
	const ready: WorkspacePackage[] = [];
	const skipped: Array<{ workspacePackage: WorkspacePackage; reason: string }> = [];

	for (const workspacePackage of selectedPackages) {
		const missingEntries = missingRequiredFileEntries(workspacePackage.path);
		if (missingEntries.length === 0) {
			ready.push(workspacePackage);
			continue;
		}

		skipped.push({
			workspacePackage,
			reason: `required file entries are missing: ${missingEntries.join(", ")}`,
		});
	}

	return { ready, skipped };
}

function partitionPackagesWithAvailableRuntimeDeps(
	selectedPackages: WorkspacePackage[],
	initiallySkipped: Array<{ workspacePackage: WorkspacePackage; reason: string }>,
	workspaceByName: Map<string, WorkspacePackage>,
) {
	const skippedByName = new Map(initiallySkipped.map((entry) => [entry.workspacePackage.name, entry.reason]));
	let ready = selectedPackages;
	let changed = false;

	do {
		changed = false;
		const nextReady: WorkspacePackage[] = [];

		for (const workspacePackage of ready) {
			const unavailableDependencies = dependencyNamesForFields(
				workspacePackage.packageJsonPath,
				workspaceByName,
				RUNTIME_DEP_FIELDS,
			).filter((dependencyName) => skippedByName.has(dependencyName));

			if (unavailableDependencies.length === 0) {
				nextReady.push(workspacePackage);
				continue;
			}

			skippedByName.set(
				workspacePackage.name,
				`runtime workspace dependencies are unavailable: ${unavailableDependencies.join(", ")}`,
			);
			changed = true;
		}

		ready = nextReady;
	} while (changed);

	return {
		ready,
		skipped: selectedPackages
			.filter((workspacePackage) => skippedByName.has(workspacePackage.name))
			.map((workspacePackage) => ({
				workspacePackage,
				reason: skippedByName.get(workspacePackage.name) ?? "unavailable",
			})),
	};
}

function shortPackageName(name: string): string {
	return name.split("/").at(-1)?.replace(/[^a-zA-Z0-9._-]+/g, "-") ?? name.replace(/[^a-zA-Z0-9._-]+/g, "-");
}

function collectSourceFiles(packageDir: string): string[] {
	const srcDir = join(packageDir, "src");
	const roots = existsSync(srcDir) ? [srcDir] : [packageDir];
	const files: string[] = [];

	const visit = (currentDir: string) => {
		for (const entry of readdirSync(currentDir, { withFileTypes: true })) {
			if (COPY_EXCLUDES.has(entry.name) || entry.name === "dist" || entry.name === "tests") {
				continue;
			}

			const entryPath = join(currentDir, entry.name);
			if (entry.isDirectory()) {
				visit(entryPath);
				continue;
			}

			if (SOURCE_EXTENSIONS.some((extension) => entry.name.endsWith(extension))) {
				files.push(entryPath);
			}
		}
	};

	for (const root of roots) {
		visit(root);
	}

	return files;
}

function packageReferencesDependency(packageDir: string, dependencyName: string): boolean {
	return collectSourceFiles(packageDir).some((filePath) => readFileSync(filePath, "utf8").includes(dependencyName));
}

function tagNameForPackage(name: string, tagPrefix: string, snapshot: string): string {
	return `${tagPrefix}-${shortPackageName(name)}-${snapshot}`;
}

function githubTarballUrl(repo: string, tag: string): string {
	return `https://codeload.github.com/${repo}/tar.gz/refs/tags/${tag}`;
}

function remoteUrlForRepo(repo: string): string {
	const token = process.env.GITHUB_TOKEN;
	if (token) {
		return `https://x-access-token:${encodeURIComponent(token)}@github.com/${repo}.git`;
	}
	return `https://github.com/${repo}.git`;
}

function ensureTagsDoNotExist(remoteUrl: string, tags: string[]) {
	for (const tag of tags) {
		const result = tryRun("git", ["ls-remote", "--tags", remoteUrl, `refs/tags/${tag}`]);
		if (result.ok && result.output) {
			fatal(`Remote tag "${tag}" already exists`);
		}
	}
}

function buildDependencyNames(
	workspacePackage: WorkspacePackage,
	workspaceByName: Map<string, WorkspacePackage>,
): string[] {
	const runtimeDependencies = dependencyNamesForFields(
		workspacePackage.packageJsonPath,
		workspaceByName,
		RUNTIME_DEP_FIELDS,
	);
	const devDependencies = dependencyNamesForFields(workspacePackage.packageJsonPath, workspaceByName, ["devDependencies"]);
	const referencedDevDependencies = devDependencies.filter((dependencyName) =>
		packageReferencesDependency(workspacePackage.path, dependencyName),
	);

	return [...new Set([...runtimeDependencies, ...referencedDevDependencies])];
}

function buildSelectedPackages(
	selectedPackages: WorkspacePackage[],
	workspaceByName: Map<string, WorkspacePackage>,
) {
	ensureRegistryWasmAssets(selectedPackages);

	const orderedBuilds: string[] = [];
	const visiting = new Set<string>();
	const visited = new Set<string>();

	const visit = (name: string) => {
		if (visited.has(name)) {
			return;
		}
		if (visiting.has(name)) {
			fatal(`Dependency cycle detected while preparing build order for "${name}"`);
		}

		const workspacePackage = workspaceByName.get(name);
		if (!workspacePackage) {
			return;
		}

		visiting.add(name);
		for (const dependencyName of buildDependencyNames(workspacePackage, workspaceByName)) {
			visit(dependencyName);
		}
		visiting.delete(name);
		visited.add(name);
		orderedBuilds.push(name);
	};

	for (const entry of selectedPackages) {
		visit(entry.name);
	}

	for (const name of orderedBuilds) {
		run("pnpm", ["--filter", name, "build"], { stdio: "inherit" });
	}
}

function copyPackageToSnapshot(sourceDir: string, targetDir: string) {
	mkdirSync(targetDir, { recursive: true });

	for (const entry of readdirSync(sourceDir)) {
		const sourcePath = join(sourceDir, entry);
		const targetPath = join(targetDir, entry);
		cpSync(sourcePath, targetPath, {
			recursive: true,
			filter: (currentSource) => !COPY_EXCLUDES.has(basename(currentSource)),
		});
	}
}

function rewriteDependencyField(
	field: DependencyField,
	manifest: Record<string, unknown>,
	workspaceByName: Map<string, WorkspacePackage>,
	selectedNames: Set<string>,
	repo: string,
	tagPrefix: string,
	snapshot: string,
) {
	const dependencies = manifest[field];
	if (!dependencies || typeof dependencies !== "object" || Array.isArray(dependencies)) {
		return;
	}

	for (const [dependencyName] of Object.entries(dependencies as Record<string, string>)) {
		const workspacePackage = workspaceByName.get(dependencyName);
		if (!workspacePackage) {
			continue;
		}

		(dependencies as Record<string, string>)[dependencyName] = selectedNames.has(dependencyName)
			? githubTarballUrl(repo, tagNameForPackage(dependencyName, tagPrefix, snapshot))
			: workspacePackage.version;
	}
}

function rewritePackageJson(
	snapshotDir: string,
	workspaceByName: Map<string, WorkspacePackage>,
	selectedNames: Set<string>,
	options: Pick<Options, "repo" | "snapshot" | "tagPrefix">,
) {
	const packageJsonPath = join(snapshotDir, "package.json");
	const packageJsonContent = readFileSync(packageJsonPath, "utf8");
	const indent = packageJsonContent.match(/^(\s+)"/m)?.[1] ?? "\t";
	const manifest = JSON.parse(packageJsonContent) as Record<string, unknown>;

	for (const field of DEP_FIELDS) {
		rewriteDependencyField(
			field,
			manifest,
			workspaceByName,
			selectedNames,
			options.repo,
			options.tagPrefix,
			options.snapshot,
		);
	}

	writeFileSync(packageJsonPath, `${JSON.stringify(manifest, null, indent)}\n`);
}

function validateFilesField(snapshotDir: string) {
	const manifest = readPackageJson(join(snapshotDir, "package.json"));
	for (const entry of missingRequiredFileEntries(snapshotDir)) {
		fatal(`Snapshot for "${manifest.name}" is missing required file entry "${entry}"`);
	}
}

function directoryHasPackagedContent(directoryPath: string): boolean {
	for (const entry of readdirSync(directoryPath, { withFileTypes: true })) {
		const entryPath = join(directoryPath, entry.name);
		if (entry.isDirectory()) {
			if (directoryHasPackagedContent(entryPath)) {
				return true;
			}
			continue;
		}

		return true;
	}

	return false;
}

function hasPackagedEntry(packageDir: string, entry: string): boolean {
	const entryPath = join(packageDir, entry);
	if (!existsSync(entryPath)) {
		return false;
	}

	if (!statSync(entryPath).isDirectory()) {
		return true;
	}

	return directoryHasPackagedContent(entryPath);
}

function commitAndTagSnapshot(snapshotDir: string, tag: string, packageName: string, remoteUrl: string) {
	const label = shortPackageName(packageName);
	const commitMessage = `chore(pkg): publish standalone ${label} package`;
	const tagMessage = `Standalone ${label} package snapshot`;
	const gitName = process.env.GIT_AUTHOR_NAME ?? process.env.GITHUB_ACTOR ?? "github-actions[bot]";
	const gitEmail = process.env.GIT_AUTHOR_EMAIL ?? "41898282+github-actions[bot]@users.noreply.github.com";

	run("git", ["init", "--initial-branch", "main"], { cwd: snapshotDir });
	run("git", ["config", "user.name", gitName], { cwd: snapshotDir });
	run("git", ["config", "user.email", gitEmail], { cwd: snapshotDir });
	run("git", ["add", "-A"], { cwd: snapshotDir });
	run("git", ["commit", "-m", commitMessage], { cwd: snapshotDir, stdio: "inherit" });
	run("git", ["tag", "-a", tag, "-m", tagMessage], { cwd: snapshotDir });
	run("git", ["push", remoteUrl, `refs/tags/${tag}`], { cwd: snapshotDir, stdio: "inherit" });
}

function writeManifest(manifestPath: string, entries: ManifestEntry[]) {
	const outputPath = isAbsolute(manifestPath) ? manifestPath : resolve(ROOT, manifestPath);
	writeFileSync(outputPath, `${JSON.stringify(entries, null, 2)}\n`);
}

function main() {
	const options = parseArgs();
	const workspacePackages = loadWorkspacePackages();
	const workspaceByName = new Map(workspacePackages.map((entry) => [entry.name, entry]));
	let selectedPackages = resolveSelectedPackages(options.packages, workspacePackages);

	if (options.build) {
		buildSelectedPackages(selectedPackages, workspaceByName);
	}

	const availability = partitionSnapshotReadyPackages(selectedPackages);
	const dependencyAvailability = partitionPackagesWithAvailableRuntimeDeps(
		availability.ready,
		availability.skipped,
		workspaceByName,
	);
	const skipped = [...availability.skipped, ...dependencyAvailability.skipped];
	if (skipped.length > 0 && !options.allowSkippingUnavailable) {
		const firstSkipped = skipped[0];
		fatal(`Snapshot for "${firstSkipped.workspacePackage.name}" cannot be created because ${firstSkipped.reason}`);
	}
	if (skipped.length > 0) {
		for (const skippedPackage of skipped) {
			console.warn(`Skipping "${skippedPackage.workspacePackage.name}" because ${skippedPackage.reason}`);
		}
	}
	selectedPackages = dependencyAvailability.ready;
	if (selectedPackages.length === 0) {
		fatal("No snapshot-ready packages were selected");
	}

	const selectedNames = new Set(selectedPackages.map((entry) => entry.name));
	const snapshotRoot = mkdtempSync(join(tmpdir(), "agent-os-package-snapshots-"));
	const remoteUrl = remoteUrlForRepo(options.repo);

	if (options.push) {
		ensureTagsDoNotExist(
			remoteUrl,
			selectedPackages.map((entry) => tagNameForPackage(entry.name, options.tagPrefix, options.snapshot)),
		);
	}

	const manifestEntries: ManifestEntry[] = [];

	for (const entry of selectedPackages) {
		const tag = tagNameForPackage(entry.name, options.tagPrefix, options.snapshot);
		const snapshotDir = join(snapshotRoot, shortPackageName(entry.name));

		copyPackageToSnapshot(entry.path, snapshotDir);
		rewritePackageJson(snapshotDir, workspaceByName, selectedNames, options);
		validateFilesField(snapshotDir);

		if (options.push) {
			commitAndTagSnapshot(snapshotDir, tag, entry.name, remoteUrl);
		}

		manifestEntries.push({
			name: entry.name,
			path: relative(ROOT, entry.path),
			tag,
			url: githubTarballUrl(options.repo, tag),
			snapshotDir,
		});
	}

	if (options.manifestPath) {
		writeManifest(options.manifestPath, manifestEntries);
	}

	console.log(`\nSnapshot root: ${snapshotRoot}`);
	for (const entry of manifestEntries) {
		console.log(`- ${entry.name}`);
		console.log(`  tag: ${entry.tag}`);
		console.log(`  url: ${entry.url}`);
	}

	if (!options.push) {
		console.log("\nDry run complete. Re-run with --push to publish tags.");
	}
}

main();
