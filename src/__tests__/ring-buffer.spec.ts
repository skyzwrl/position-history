/// <reference types="@rbxts/testez/globals" />

import { RingBuffer } from "../ring-buffer";

function contents<T extends defined>(buffer: RingBuffer<T>): string {
	const items: string[] = [];
	for (let index = 0; index < buffer.size(); index++) {
		items.push(tostring(buffer.get(index)));
	}
	return items.join(",");
}

export = () => {
	describe("RingBuffer", () => {
		it("rejects capacities that aren't positive integers", () => {
			expect(() => new RingBuffer(0)).to.throw("positive integer");
			expect(() => new RingBuffer(-2)).to.throw("positive integer");
			expect(() => new RingBuffer(2.5)).to.throw("positive integer");
		});

		it("keeps items in push order until full", () => {
			const buffer = new RingBuffer<number>(4);
			buffer.push(1);
			buffer.push(2);
			buffer.push(3);

			expect(contents(buffer)).to.equal("1,2,3");
			expect(buffer.size()).to.equal(3);
			expect(buffer.isFull()).to.equal(false);
		});

		it("overwrites the oldest item once full", () => {
			const buffer = new RingBuffer<number>(3);
			for (let value = 1; value <= 7; value++) {
				buffer.push(value);
			}

			expect(contents(buffer)).to.equal("5,6,7");
			expect(buffer.oldest()).to.equal(5);
			expect(buffer.newest()).to.equal(7);
			expect(buffer.isFull()).to.equal(true);
		});

		it("returns undefined for indices outside the buffer", () => {
			const buffer = new RingBuffer<number>(3);
			expect(buffer.get(0)).never.to.be.ok();
			expect(buffer.oldest()).never.to.be.ok();
			expect(buffer.newest()).never.to.be.ok();

			buffer.push(1);
			expect(buffer.get(-1)).never.to.be.ok();
			expect(buffer.get(1)).never.to.be.ok();
		});

		it("replaces items by logical index after wrapping", () => {
			const buffer = new RingBuffer<number>(3);
			for (let value = 1; value <= 4; value++) {
				buffer.push(value);
			}
			buffer.set(0, 20);
			buffer.set(2, 40);

			expect(contents(buffer)).to.equal("20,3,40");
			expect(() => buffer.set(3, 0)).to.throw("out of range");
		});

		it("starts over after clear", () => {
			const buffer = new RingBuffer<number>(3);
			for (let value = 1; value <= 5; value++) {
				buffer.push(value);
			}
			buffer.clear();

			expect(buffer.size()).to.equal(0);
			expect(buffer.newest()).never.to.be.ok();

			buffer.push(9);
			buffer.push(8);
			expect(contents(buffer)).to.equal("9,8");
		});

		it("holds the most recent pushes for any number of pushes", () => {
			for (let pushes = 0; pushes <= 20; pushes++) {
				const buffer = new RingBuffer<number>(5);
				const expected: number[] = [];
				for (let value = 1; value <= pushes; value++) {
					buffer.push(value);
					if (value > pushes - 5) {
						expected.push(value);
					}
				}
				expect(contents(buffer)).to.equal(expected.join(","));
			}
		});
	});
};
