import { describe, expect, it } from "vitest";
import { exposureError, resolveOptions } from "../src/config";
import { renderEnv, renderFailure } from "../src/render";

describe("exposureError", () => {
	const open = { apiKey: undefined, allowUnauthenticated: false };

	it("refuses to listen beyond loopback without a key", () => {
		expect(exposureError("0.0.0.0", open)).toMatch(/ASTLIDE_API_KEY/);
		expect(exposureError("::", open)).toMatch(/ASTLIDE_API_KEY/);
		expect(exposureError("192.168.1.10", open)).toMatch(/ASTLIDE_API_KEY/);
	});

	it("allows loopback, a key, or an explicit opt-out", () => {
		for (const host of ["127.0.0.1", "localhost", "::1", "[::1]"])
			expect(exposureError(host, open)).toBeUndefined();
		expect(exposureError("0.0.0.0", { ...open, apiKey: "k" })).toBeUndefined();
		expect(exposureError("0.0.0.0", { ...open, allowUnauthenticated: true })).toBeUndefined();
	});

	it("reads the opt-outs from the environment", () => {
		const options = resolveOptions({
			ASTLIDE_ALLOW_UNAUTHENTICATED: "1",
			ASTLIDE_ALLOW_PRIVATE_NETWORK: "1",
		});
		expect(options.allowUnauthenticated).toBe(true);
		expect(options.allowPrivateNetwork).toBe(true);
		expect(resolveOptions({}).allowPrivateNetwork).toBe(false);
	});
});

describe("renderEnv", () => {
	it("keeps renders off the private network and away from the API key", () => {
		const env = renderEnv({}, { PATH: "/bin", ASTLIDE_API_KEY: "secret" });
		expect(env.ASTLIDE_PUBLIC_NETWORK_ONLY).toBe("1");
		expect(env.ASTLIDE_API_KEY).toBeUndefined();
		expect(env.PATH).toBe("/bin");
	});

	it("lets them reach it when allowed", () => {
		const env = renderEnv({ allowPrivateNetwork: true }, { ASTLIDE_PUBLIC_NETWORK_ONLY: "1" });
		expect(env.ASTLIDE_PUBLIC_NETWORK_ONLY).toBeUndefined();
	});
	it("keeps Chromium's sandbox on unless turned off", () => {
		expect(resolveOptions({}).chromiumSandbox).toBe(true);
		expect(resolveOptions({ ASTLIDE_CHROMIUM_SANDBOX: "0" }).chromiumSandbox).toBe(false);
		expect(renderEnv({}, {}).ASTLIDE_CHROMIUM_SANDBOX).toBe("1");
		expect(renderEnv({ chromiumSandbox: false }, {}).ASTLIDE_CHROMIUM_SANDBOX).toBe("0");
		// The server's setting wins over what its own environment says.
		expect(
			renderEnv({ chromiumSandbox: true }, { ASTLIDE_CHROMIUM_SANDBOX: "0" })
				.ASTLIDE_CHROMIUM_SANDBOX,
		).toBe("1");
	});
});

describe("renderFailure", () => {
	it("keeps the sandbox details for the server log", () => {
		const log =
			"Export failed: Chromium couldn't start its sandbox (it needs unprivileged user namespaces).\n  · Docker: run with --security-opt seccomp=…\n";
		const failure = renderFailure(log, "/work/render-1");
		expect(failure.client).toBe(
			"render failed: Chromium couldn't start its sandbox — see the server log",
		);
		expect(failure.server).toMatch(/seccomp/);
	});

	it("passes other failures on, without the server's paths", () => {
		const failure = renderFailure("Error in /work/render-1/src/x.md: bad\n", "/work/render-1");
		expect(failure.client).toBe("render failed:\nError in <project>/src/x.md: bad");
		expect(failure.server).toBeUndefined();
	});
});
