import type { NodeInfoPlugin } from "./node/Node.js";

type EventKey = string | symbol;
type EventListener = (...args: any[]) => void;

interface EventEntry {
	listener: EventListener;
	once: boolean;
}

/**
 * Minimal, dependency-free event emitter used by Shoukaku.
 *
 * Mirrors the subset of the Node.js `EventEmitter` API that the library needs,
 * without depending on `node:events`.
 *
 * @internal
 */
export class EventEmitter<TEvents extends { [K in keyof TEvents]: unknown[] } = Record<EventKey, unknown[]>> {
	private readonly listeners = new Map<EventKey, EventEntry[]>();

	public on<TEvent extends keyof TEvents & EventKey>(
		eventName: TEvent,
		listener: (...args: TEvents[TEvent]) => void,
	): this {
		this.pushListener(eventName, listener, false);
		return this;
	}

	public addListener<TEvent extends keyof TEvents & EventKey>(
		eventName: TEvent,
		listener: (...args: TEvents[TEvent]) => void,
	): this {
		this.pushListener(eventName, listener, false);
		return this;
	}

	public once<TEvent extends keyof TEvents & EventKey>(
		eventName: TEvent,
		listener: (...args: TEvents[TEvent]) => void,
	): this {
		this.pushListener(eventName, listener, true);
		return this;
	}

	public off<TEvent extends keyof TEvents & EventKey>(
		eventName: TEvent,
		listener: (...args: TEvents[TEvent]) => void,
	): this {
		return this.removeListener(eventName, listener);
	}

	public removeListener<TEvent extends keyof TEvents & EventKey>(
		eventName: TEvent,
		listener: (...args: TEvents[TEvent]) => void,
	): this {
		const entries = this.listeners.get(eventName);
		if (!entries) {
			return this;
		}

		const index = entries.findIndex((entry) => entry.listener === listener);
		if (index !== -1) {
			entries.splice(index, 1);
		}

		if (entries.length === 0) {
			this.listeners.delete(eventName);
		}

		return this;
	}

	public removeAllListeners(eventName?: keyof TEvents & EventKey): this {
		if (eventName === undefined) {
			this.listeners.clear();
		} else {
			this.listeners.delete(eventName);
		}

		return this;
	}

	public listenerCount(eventName: keyof TEvents & EventKey): number {
		return this.listeners.get(eventName)?.length ?? 0;
	}

	public emit<TEvent extends keyof TEvents & EventKey>(eventName: TEvent, ...args: TEvents[TEvent]): boolean {
		const entries = this.listeners.get(eventName);
		if (!entries?.length) {
			if (eventName === "error") {
				const error = args[0];
				throw error instanceof Error ? error : new Error("Unhandled error event");
			}

			return false;
		}

		// Snapshot so listeners can be added/removed during an emit without affecting this dispatch.
		const snapshot = entries.slice();
		for (const entry of snapshot) {
			if (entry.once) {
				this.removeListener(eventName, entry.listener);
			}

			entry.listener(...args);
		}

		return true;
	}

	private pushListener<TEvent extends keyof TEvents & EventKey>(
		eventName: TEvent,
		listener: (...args: TEvents[TEvent]) => void,
		once: boolean,
	): void {
		const entries = this.listeners.get(eventName);
		const entry: EventEntry = { listener, once };

		if (entries) {
			entries.push(entry);
		} else {
			this.listeners.set(eventName, [entry]);
		}
	}
}

// https://stackoverflow.com/a/67244127
export abstract class TypedEventEmitter<
	TEvents extends { [K in keyof TEvents]: unknown[] },
> extends EventEmitter<TEvents> {}

export type Constructor<TInstance> = new (...args: unknown[]) => TInstance;

/**
 * Merge the default options to user input
 *
 * @param def - Default options
 * @param given - User input
 * @returns Merged options
 */

export function mergeDefault<TOptions extends Record<string, any>>(def: TOptions, given: TOptions): Required<TOptions> {
	if (!given) {
		return def as Required<TOptions>;
	}

	const defaultKeys: (keyof TOptions)[] = Object.keys(def);
	const filtered: TOptions = {} as TOptions;

	for (const key of defaultKeys) {
		if (key in given) {
			filtered[key] = given[key];
		}
	}

	for (const key of defaultKeys) {
		if ((def[key] === null || (typeof def[key] === "string" && def[key].length === 0)) && !filtered[key]) {
			throw new Error(`${String(key)} was not found from the given options.`);
		}

		filtered[key] ??= def[key];
	}

	return filtered as Required<TOptions>;
}

/**
 * Wait for a specific amount of time (timeout)
 *
 * @param ms - Time to wait in milliseconds
 * @returns A promise that resolves in x seconds
 */
export async function wait(ms: number): Promise<void> {
	return Bun.sleep(ms);
}

// https://stackoverflow.com/a/73753173
export type HintedString<KnownValues extends string> = KnownValues | (string & {});

/**
 * Utility for specifying types in generic interfaces, workaround for TypeScript types not existing at runtime
 *
 * @typeParam TValue - Type of value
 * @internal
 */
export const t = <TValue>(type: unknown) => type as TValue;

/**
 * @internal
 */
export type TFn = (type: unknown) => unknown;

/**
 * @internal
 */
export interface TField {
	/**
	 * This hack is to work around TypeScript types not existing at runtime.
	 * We can specify the return type here.
	 *
	 * @example
	 * This function is never actually called, so the implementation can be simply:
	 * ```
	 * T = (response: unknown) => response as LavalinkResponse;
	 * ```
	 * @example
	 * Or using the `t` utility function
	 * ```
	 * import { t } from 'shoukaku';
	 *
	 * T = t<LavalinkResponse>;
	 * ```
	 */
	readonly T: TFn;
}

/**
 * Get the type specified in the T field
 *
 * @internal
 */
export type TReturnType<TFieldType extends TField> = ReturnType<TFieldType["T"]>;

/**
 * Function that returns a value or value
 *
 * @typeParam TValue - Type of value
 * @internal
 */
export type FnOrVal<TValue> = TValue | (() => TValue);

/**
 * Get the value from a {@link FnOrVal}
 *
 * @param input - Input function or value
 * @returns Value as specified by TValue, you must explicitly assert non-optional values are not `undefined` since properties may be optional
 * @internal
 */
export function fnOrVal<TValue>(input?: FnOrVal<TValue>): TValue | undefined {
	return typeof input === "function" ? (input as () => TValue)?.() : input;
}

export interface PluginRequirement {
	/**
	 * Name of plugin required
	 */
	readonly name: string;
	/**
	 * Version of plugin required, any string or npm style semver range
	 *
	 * @see https://semver.npmjs.com/#syntax-examples
	 */
	readonly version: string;
}

export class PluginError extends Error {
	public constructor(
		public readonly requiredFor: string,
		public readonly required: PluginRequirement,
		public readonly found?: NodeInfoPlugin,
	) {
		super(
			`Plugin ${required.name}@${required.version} is required for ${requiredFor}, but ${found ? `found ${found.name}@${found.version}` : "was not found"}`,
		);
		this.name = "PluginError";
		Object.setPrototypeOf(this, new.target.prototype);
	}
}

const StrictSemver =
	/^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;

/**
 * Validate if plugins present in node meets specified plugin requirements
 *
 * @param requiredFor - specifies what requires the plugin
 * @param required - plugin requirements
 * @param nodePlugins - plugins present in node
 * @throws {@link PluginError} when plugin is not found or does not satisfy version
 * @internal
 */
export function validatePluginRequirement(
	requiredFor: string,
	required: PluginRequirement,
	nodePlugins?: NodeInfoPlugin[],
) {
	const found = nodePlugins?.find((p) => p.name === required.name);

	const isValid = found
		? StrictSemver.test(required.version)
			? Bun.semver.satisfies(found.version, required.version)
			: found.version === required.version
		: false;

	if (!isValid) {
		throw new PluginError(requiredFor, required, found);
	}
}
