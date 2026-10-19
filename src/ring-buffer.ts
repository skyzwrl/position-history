export class RingBuffer<T extends defined> {
	private readonly items: T[];
	private first = 0;
	private count = 0;

	public constructor(public readonly capacity: number) {
		if (capacity < 1 || capacity % 1 !== 0) {
			// level 3 skips the compiled .new wrapper so the error points at the caller
			error(`RingBuffer capacity must be a positive integer, got ${capacity}`, 3);
		}
		this.items = new Array(capacity);
	}

	public push(value: T): void {
		if (this.count < this.capacity) {
			this.items[(this.first + this.count) % this.capacity] = value;
			this.count += 1;
		} else {
			this.items[this.first] = value;
			this.first = (this.first + 1) % this.capacity;
		}
	}

	// 0 is the oldest item, size() - 1 the newest
	public get(index: number): T | undefined {
		if (index < 0 || index >= this.count) {
			return undefined;
		}
		return this.items[(this.first + index) % this.capacity];
	}

	public set(index: number, value: T): void {
		if (index < 0 || index >= this.count) {
			error(`RingBuffer index ${index} is out of range (size ${this.count})`, 2);
		}
		this.items[(this.first + index) % this.capacity] = value;
	}

	public oldest(): T | undefined {
		return this.get(0);
	}

	public newest(): T | undefined {
		return this.get(this.count - 1);
	}

	public size(): number {
		return this.count;
	}

	public isFull(): boolean {
		return this.count === this.capacity;
	}

	public clear(): void {
		// clear keeps the array part allocated, so later pushes still don't allocate
		this.items.clear();
		this.first = 0;
		this.count = 0;
	}
}
