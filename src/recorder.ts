import { RunService, Workspace } from "@rbxts/services";
import { History } from "./history";

export interface FrameConnection {
	Disconnect(): void;
}

export interface FrameSignal {
	Connect(callback: (deltaTime: number) => void): FrameConnection;
}

export interface RecorderOptions<K, V extends defined, H extends History<V>> {
	/** seconds of history to keep */
	window: number;
	/** samples per second, defaults to 60 */
	rate?: number;
	read: (subject: K) => V | undefined;
	create: (capacity: number) => H;
	clock?: () => number;
	frame?: FrameSignal;
}

export class HistoryRecorder<K extends defined, V extends defined, H extends History<V> = History<V>> {
	public readonly capacity: number;

	private readonly histories = new Map<K, H>();
	private readonly interval: number;
	private readonly read: (subject: K) => V | undefined;
	private readonly create: (capacity: number) => H;
	private readonly clock: () => number;
	private readonly frame: FrameSignal;
	private connection?: FrameConnection;
	private accumulated = 0;

	public constructor(options: RecorderOptions<K, V, H>) {
		const rate = options.rate ?? 60;
		if (options.window <= 0 || rate <= 0) {
			error(`HistoryRecorder needs a positive window and rate, got ${options.window}s at ${rate}/s`, 3);
		}

		this.interval = 1 / rate;
		// +1 so the oldest sample still sits at or before now - window, +1 more for frame timing jitter
		this.capacity = math.ceil(options.window * rate) + 2;
		this.read = options.read;
		this.create = options.create;
		this.clock = options.clock ?? (() => Workspace.GetServerTimeNow());
		this.frame = options.frame ?? RunService.Heartbeat;
	}

	public track(subject: K): H {
		let history = this.histories.get(subject);
		if (history === undefined) {
			history = this.create(this.capacity);
			this.histories.set(subject, history);
		}
		return history;
	}

	public untrack(subject: K): void {
		this.histories.delete(subject);
	}

	public isTracking(subject: K): boolean {
		return this.histories.has(subject);
	}

	public historyOf(subject: K): H | undefined {
		return this.histories.get(subject);
	}

	public rewind(subject: K, time: number): V | undefined {
		return this.histories.get(subject)?.sample(time);
	}

	public record(time = this.clock()): void {
		for (const [subject, history] of this.histories) {
			// instances that left the DataModel (destroyed characters, despawned NPCs) stop being tracked
			if (typeIs(subject, "Instance") && !subject.IsDescendantOf(game)) {
				this.histories.delete(subject);
				continue;
			}

			// a subject that can't be read this frame (no root part mid respawn) keeps its old samples
			const value = this.read(subject);
			if (value !== undefined) {
				history.push(time, value);
			}
		}
	}

	public start(): void {
		if (this.connection !== undefined) {
			return;
		}
		this.connection = this.frame.Connect((deltaTime) => this.step(deltaTime));
	}

	public stop(): void {
		this.connection?.Disconnect();
		this.connection = undefined;
		this.accumulated = 0;
	}

	public destroy(): void {
		this.stop();
		this.histories.clear();
	}

	private step(deltaTime: number): void {
		this.accumulated += deltaTime;
		if (this.accumulated < this.interval) {
			return;
		}
		// drop the backlog after a long frame instead of writing several samples with one timestamp
		this.accumulated %= this.interval;
		this.record();
	}
}
