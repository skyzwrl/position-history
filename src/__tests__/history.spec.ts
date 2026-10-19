/// <reference types="@rbxts/testez/globals" />

import { CFrameHistory, History, Vector3History } from "../history";

const lerpNumber = (from: number, to: number, alpha: number) => from + (to - from) * alpha;

// Random isn't available under Lune, an LCG is plenty for picking inputs
function createRandom(seed: number) {
	let state = seed;
	return () => {
		state = (state * 1664525 + 1013904223) % 4294967296;
		return state / 4294967296;
	};
}

function linearSample(times: number[], values: number[], time: number): number | undefined {
	for (let index = 0; index < times.size(); index++) {
		if (times[index] === time) {
			return values[index];
		}
		const after = times[index + 1];
		if (after !== undefined && times[index] < time && time < after) {
			return lerpNumber(values[index], values[index + 1], (time - times[index]) / (after - times[index]));
		}
	}
	return undefined;
}

export = () => {
	describe("History", () => {
		it("returns the stored value at each sample time", () => {
			const history = new History(8, lerpNumber);
			history.push(1, 10);
			history.push(2, 20);
			history.push(4, 5);

			expect(history.sample(1)).to.equal(10);
			expect(history.sample(2)).to.equal(20);
			expect(history.sample(4)).to.equal(5);
		});

		it("interpolates between the samples on either side", () => {
			const history = new History(8, lerpNumber);
			history.push(1, 10);
			history.push(2, 20);
			history.push(4, 0);

			expect(history.sample(1.25)).to.be.near(12.5);
			expect(history.sample(3)).to.be.near(10);
			expect(history.sample(3.5)).to.be.near(5);
		});

		it("returns undefined outside the recorded window", () => {
			const history = new History(8, lerpNumber);
			expect(history.sample(0)).never.to.be.ok();

			history.push(1, 10);
			history.push(2, 20);
			expect(history.sample(0.999)).never.to.be.ok();
			expect(history.sample(2.001)).never.to.be.ok();
		});

		it("drops samples older than the newest one", () => {
			const history = new History(8, lerpNumber);
			history.push(1, 10);
			history.push(3, 30);

			expect(history.push(2, 999)).to.equal(false);
			expect(history.size()).to.equal(2);
			expect(history.sample(2)).to.be.near(20);
		});

		it("replaces the newest sample when pushed at the same time", () => {
			const history = new History(8, lerpNumber);
			history.push(1, 10);
			history.push(2, 20);

			expect(history.push(2, 40)).to.equal(true);
			expect(history.size()).to.equal(2);
			expect(history.latest()).to.equal(40);
			expect(history.sample(1.5)).to.be.near(25);
		});

		it("moves the window forward once full", () => {
			const history = new History(3, lerpNumber);
			for (let time = 1; time <= 5; time++) {
				history.push(time, time * 10);
			}

			expect(history.oldestTime()).to.equal(3);
			expect(history.newestTime()).to.equal(5);
			expect(history.sample(2.5)).never.to.be.ok();
			expect(history.sample(3.5)).to.be.near(35);
		});

		it("clamps to the window with sampleClamped", () => {
			const history = new History(4, lerpNumber);
			expect(history.sampleClamped(1)).never.to.be.ok();

			history.push(1, 10);
			history.push(2, 20);
			expect(history.sampleClamped(-5)).to.equal(10);
			expect(history.sampleClamped(5)).to.equal(20);
			expect(history.sampleClamped(1.5)).to.be.near(15);
		});

		it("is empty after clear", () => {
			const history = new History(4, lerpNumber);
			history.push(1, 10);
			history.push(2, 20);
			history.clear();

			expect(history.size()).to.equal(0);
			expect(history.latest()).never.to.be.ok();
			expect(history.oldestTime()).never.to.be.ok();
			expect(history.sample(1)).never.to.be.ok();

			history.push(0.5, 1);
			expect(history.sample(0.5)).to.equal(1);
		});

		it("agrees with a linear scan on random data", () => {
			const random = createRandom(7);

			for (let trial = 0; trial < 20; trial++) {
				const capacity = 1 + math.floor(random() * 40);
				const history = new History(capacity, lerpNumber);
				const times: number[] = [];
				const values: number[] = [];

				let time = random() * 10;
				const pushes = math.floor(random() * 100);
				for (let index = 0; index < pushes; index++) {
					time += 0.001 + random() * 0.1;
					const value = random() * 200 - 100;
					history.push(time, value);
					times.push(time);
					values.push(value);
					if (times.size() > capacity) {
						times.shift();
						values.shift();
					}
				}

				for (let query = 0; query < 200; query++) {
					let probe: number;
					if (times.size() > 0 && query % 4 === 0) {
						probe = times[math.floor(random() * times.size())];
					} else if (query % 5 === 1) {
						probe = time + random() * 0.05;
					} else {
						probe = time - random() * (capacity * 0.12);
					}

					const expected = linearSample(times, values, probe);
					const actual = history.sample(probe);
					if (expected === undefined) {
						expect(actual).never.to.be.ok();
					} else {
						expect(actual).to.be.near(expected, 1e-9);
					}
				}
			}
		});
	});

	describe("Vector3History", () => {
		it("interpolates positions", () => {
			const history = new Vector3History(4);
			history.push(0, new Vector3(0, 0, 0));
			history.push(1, new Vector3(10, 20, -10));

			const position = history.sample(0.25)!;
			expect(position.X).to.be.near(2.5);
			expect(position.Y).to.be.near(5);
			expect(position.Z).to.be.near(-2.5);
		});

		it("reports the velocity of the segment containing a time", () => {
			const history = new Vector3History(8);
			history.push(0, new Vector3(0, 0, 0));
			history.push(1, new Vector3(4, 0, 0));
			history.push(3, new Vector3(4, 10, 0));

			const early = history.velocityAt(0.5)!;
			expect(early.X).to.be.near(4);
			expect(early.Y).to.be.near(0);

			const late = history.velocityAt(2)!;
			expect(late.X).to.be.near(0);
			expect(late.Y).to.be.near(5);
		});

		it("uses the segment starting at a sample, and the last segment for the newest one", () => {
			const history = new Vector3History(8);
			history.push(0, new Vector3(0, 0, 0));
			history.push(1, new Vector3(4, 0, 0));
			history.push(3, new Vector3(4, 10, 0));

			expect(history.velocityAt(0)!.X).to.be.near(4);
			expect(history.velocityAt(1)!.Y).to.be.near(5);
			expect(history.velocityAt(3)!.Y).to.be.near(5);
		});

		it("has no velocity outside the window or with a single sample", () => {
			const history = new Vector3History(8);
			history.push(1, new Vector3(1, 1, 1));
			expect(history.velocityAt(1)).never.to.be.ok();

			history.push(2, new Vector3(2, 2, 2));
			expect(history.velocityAt(0.5)).never.to.be.ok();
			expect(history.velocityAt(2.5)).never.to.be.ok();
		});
	});

	describe("CFrameHistory", () => {
		it("interpolates position and rotation together", () => {
			const history = new CFrameHistory(4);
			history.push(0, new CFrame(0, 0, 0));
			history.push(1, new CFrame(10, 0, 0).mul(CFrame.Angles(0, math.pi / 2, 0)));

			const halfway = history.sample(0.5)!;
			expect(halfway.Position.X).to.be.near(5);

			const look = halfway.LookVector;
			expect(look.X).to.be.near(-math.sin(math.pi / 4), 1e-4);
			expect(look.Z).to.be.near(-math.cos(math.pi / 4), 1e-4);
		});

		it("reports linear velocity from positions only", () => {
			const history = new CFrameHistory(4);
			history.push(0, new CFrame(0, 0, 0));
			history.push(0.5, new CFrame(0, 0, -8).mul(CFrame.Angles(0, math.pi, 0)));

			const velocity = history.velocityAt(0.25)!;
			expect(velocity.X).to.be.near(0);
			expect(velocity.Z).to.be.near(-16);
		});
	});
};
