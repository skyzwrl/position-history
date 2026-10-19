import { RingBuffer } from "./ring-buffer";

export type Interpolate<T> = (from: T, to: T, alpha: number) => T;

export class History<T extends defined> {
	private readonly times: RingBuffer<number>;
	private readonly values: RingBuffer<T>;

	public constructor(
		capacity: number,
		private readonly interpolate: Interpolate<T>,
	) {
		this.times = new RingBuffer(capacity);
		this.values = new RingBuffer(capacity);
	}

	// times only move forward so sample() can binary search. anything older than the newest sample
	// is dropped (returns false), a sample at the newest time replaces it
	public push(time: number, value: T): boolean {
		const newest = this.times.newest();
		if (newest !== undefined) {
			if (time < newest) {
				return false;
			} else if (time === newest) {
				this.values.set(this.values.size() - 1, value);
				return true;
			}
		}
		this.times.push(time);
		this.values.push(value);
		return true;
	}

	// undefined outside the recorded window, there's no extrapolation
	public sample(time: number): T | undefined {
		const index = this.indexAtOrBefore(time);
		if (index === -1) {
			return undefined;
		}

		const before = this.times.get(index)!;
		if (before === time) {
			return this.values.get(index);
		}

		const after = this.times.get(index + 1);
		if (after === undefined) {
			return undefined;
		}
		const alpha = (time - before) / (after - before);
		return this.interpolate(this.values.get(index)!, this.values.get(index + 1)!, alpha);
	}

	public sampleClamped(time: number): T | undefined {
		const oldest = this.times.oldest();
		if (oldest === undefined) {
			return undefined;
		}
		return this.sample(math.clamp(time, oldest, this.times.newest()!));
	}

	public latest(): T | undefined {
		return this.values.newest();
	}

	public oldestTime(): number | undefined {
		return this.times.oldest();
	}

	public newestTime(): number | undefined {
		return this.times.newest();
	}

	public size(): number {
		return this.times.size();
	}

	public clear(): void {
		this.times.clear();
		this.values.clear();
	}

	protected timeAt(index: number): number {
		return this.times.get(index)!;
	}

	protected valueAt(index: number): T {
		return this.values.get(index)!;
	}

	// last sample at or before time, -1 if time is before the window
	protected indexAtOrBefore(time: number): number {
		const times = this.times;
		let low = 0;
		let high = times.size() - 1;
		if (high < 0 || time < times.get(0)!) {
			return -1;
		}

		while (low < high) {
			const middle = math.floor((low + high + 1) / 2);
			if (times.get(middle)! <= time) {
				low = middle;
			} else {
				high = middle - 1;
			}
		}
		return low;
	}

	// start of the segment [i, i + 1] containing time. the newest sample belongs to the last segment
	protected segmentAt(time: number): number {
		const count = this.times.size();
		if (count < 2 || time > this.times.get(count - 1)!) {
			return -1;
		}
		const index = this.indexAtOrBefore(time);
		return index === -1 ? -1 : math.min(index, count - 2);
	}
}

const lerpCFrame: Interpolate<CFrame> = (from, to, alpha) => from.Lerp(to, alpha);
const lerpVector3: Interpolate<Vector3> = (from, to, alpha) => from.Lerp(to, alpha);

export class CFrameHistory extends History<CFrame> {
	public constructor(capacity: number) {
		super(capacity, lerpCFrame);
	}

	public velocityAt(time: number): Vector3 | undefined {
		const index = this.segmentAt(time);
		if (index === -1) {
			return undefined;
		}
		const from = this.valueAt(index).Position;
		const to = this.valueAt(index + 1).Position;
		return to.sub(from).div(this.timeAt(index + 1) - this.timeAt(index));
	}
}

export class Vector3History extends History<Vector3> {
	public constructor(capacity: number) {
		super(capacity, lerpVector3);
	}

	public velocityAt(time: number): Vector3 | undefined {
		const index = this.segmentAt(time);
		if (index === -1) {
			return undefined;
		}
		const from = this.valueAt(index);
		const to = this.valueAt(index + 1);
		return to.sub(from).div(this.timeAt(index + 1) - this.timeAt(index));
	}
}
