/// <reference types="@rbxts/testez/globals" />

import { Workspace } from "@rbxts/services";
import { CFrameHistory, Vector3History } from "../history";
import { FrameConnection, FrameSignal, HistoryRecorder } from "../recorder";

interface Subject {
	position?: Vector3;
}

class ManualFrame implements FrameSignal {
	private readonly callbacks = new Set<(deltaTime: number) => void>();

	public Connect(callback: (deltaTime: number) => void): FrameConnection {
		const callbacks = this.callbacks;
		callbacks.add(callback);
		return {
			Disconnect() {
				callbacks.delete(callback);
			},
		};
	}

	public step(deltaTime: number): void {
		for (const callback of this.callbacks) {
			callback(deltaTime);
		}
	}

	public connections(): number {
		return this.callbacks.size();
	}
}

function createRecorder(rate: number, window = 1) {
	const frame = new ManualFrame();
	const clock = { now: 0 };
	const recorder = new HistoryRecorder({
		window,
		rate,
		read: (subject: Subject) => subject.position,
		create: (capacity) => new Vector3History(capacity),
		clock: () => clock.now,
		frame,
	});
	return { recorder, frame, clock };
}

export = () => {
	describe("HistoryRecorder", () => {
		it("records every tracked subject once its interval has elapsed", () => {
			const { recorder, frame, clock } = createRecorder(10);
			const a: Subject = { position: new Vector3(1, 0, 0) };
			const b: Subject = { position: new Vector3(2, 0, 0) };
			recorder.track(a);
			recorder.track(b);
			recorder.start();

			clock.now = 0.1;
			frame.step(0.1);
			expect(recorder.historyOf(a)!.size()).to.equal(1);
			expect(recorder.historyOf(b)!.size()).to.equal(1);

			clock.now = 0.15;
			frame.step(0.05);
			expect(recorder.historyOf(a)!.size()).to.equal(1);

			clock.now = 0.2;
			frame.step(0.05);
			expect(recorder.historyOf(a)!.size()).to.equal(2);
			expect(recorder.historyOf(a)!.newestTime()).to.equal(0.2);
		});

		it("writes one sample after a long frame instead of catching up", () => {
			const { recorder, frame, clock } = createRecorder(4);
			const subject: Subject = { position: Vector3.zero };
			recorder.track(subject);
			recorder.start();

			clock.now = 0.875;
			frame.step(0.875);
			expect(recorder.historyOf(subject)!.size()).to.equal(1);

			clock.now = 0.9375;
			frame.step(0.0625);
			expect(recorder.historyOf(subject)!.size()).to.equal(1);

			clock.now = 1;
			frame.step(0.0625);
			expect(recorder.historyOf(subject)!.size()).to.equal(2);
		});

		it("keeps at least the configured window of history", () => {
			const { recorder, clock } = createRecorder(10, 1);
			const subject: Subject = { position: Vector3.zero };
			const history = recorder.track(subject);

			for (let tick = 1; tick <= 50; tick++) {
				clock.now = tick / 10;
				subject.position = new Vector3(clock.now, 0, 0);
				recorder.record();
			}

			expect(recorder.capacity).to.equal(12);
			expect(history.newestTime()).to.equal(5);
			expect(history.newestTime()! - history.oldestTime()! >= 1).to.equal(true);
			expect(history.sample(4)!.X).to.be.near(4);
		});

		it("rewinds a subject to an earlier time", () => {
			const { recorder, clock } = createRecorder(10);
			const subject: Subject = {};
			recorder.track(subject);

			for (let tick = 0; tick <= 5; tick++) {
				clock.now = tick / 10;
				subject.position = new Vector3(0, 0, -20 * clock.now);
				recorder.record();
			}

			expect(recorder.rewind(subject, 0.25)!.Z).to.be.near(-5);
			expect(recorder.rewind(subject, 1)).never.to.be.ok();
			expect(recorder.rewind({}, 0.25)).never.to.be.ok();
		});

		it("keeps old samples while a subject can't be read", () => {
			const { recorder, clock } = createRecorder(10);
			const subject: Subject = { position: new Vector3(5, 0, 0) };
			recorder.track(subject);

			clock.now = 1;
			recorder.record();
			subject.position = undefined;
			clock.now = 2;
			recorder.record();

			expect(recorder.isTracking(subject)).to.equal(true);
			expect(recorder.historyOf(subject)!.size()).to.equal(1);
			expect(recorder.rewind(subject, 1)!.X).to.equal(5);
		});

		it("returns the same history when a subject is tracked twice", () => {
			const { recorder } = createRecorder(10);
			const subject: Subject = {};
			expect(recorder.track(subject)).to.equal(recorder.track(subject));
		});

		it("stops tracking instances that leave the DataModel", () => {
			const recorder = new HistoryRecorder({
				window: 1,
				read: (part: Part) => part.CFrame,
				create: (capacity) => new CFrameHistory(capacity),
				clock: () => 0,
				frame: new ManualFrame(),
			});
			const part = new Instance("Part");
			part.Parent = Workspace;
			recorder.track(part);

			recorder.record(1);
			expect(recorder.historyOf(part)!.size()).to.equal(1);

			part.Parent = undefined;
			recorder.record(2);
			expect(recorder.isTracking(part)).to.equal(false);
		});

		it("forgets subjects on untrack and everything on destroy", () => {
			const { recorder, frame } = createRecorder(10);
			const a: Subject = { position: Vector3.zero };
			const b: Subject = { position: Vector3.zero };
			recorder.track(a);
			recorder.track(b);
			recorder.start();

			recorder.untrack(a);
			expect(recorder.isTracking(a)).to.equal(false);
			expect(recorder.isTracking(b)).to.equal(true);

			recorder.destroy();
			expect(recorder.isTracking(b)).to.equal(false);
			expect(frame.connections()).to.equal(0);
		});

		it("connects to the frame signal once and stops recording when stopped", () => {
			const { recorder, frame, clock } = createRecorder(10);
			const subject: Subject = { position: Vector3.zero };
			recorder.track(subject);

			recorder.start();
			recorder.start();
			expect(frame.connections()).to.equal(1);

			recorder.stop();
			expect(frame.connections()).to.equal(0);

			clock.now = 1;
			frame.step(1);
			expect(recorder.historyOf(subject)!.size()).to.equal(0);
		});

		it("rejects a window or rate that isn't positive", () => {
			expect(() => createRecorder(0)).to.throw("positive window and rate");
			expect(() => createRecorder(10, -1)).to.throw("positive window and rate");
		});

		it("records on Heartbeat with server time by default", () => {
			const recorder = new HistoryRecorder({
				window: 1,
				read: (subject: Subject) => subject.position,
				create: (capacity) => new Vector3History(capacity),
			});
			const subject: Subject = { position: new Vector3(3, 2, 1) };
			const history = recorder.track(subject);
			recorder.start();

			const started = os.clock();
			while (history.size() === 0 && os.clock() - started < 2) {
				task.wait();
			}
			recorder.destroy();

			expect(history.size() > 0).to.equal(true);
			expect(math.abs(history.newestTime()! - Workspace.GetServerTimeNow()) < 2).to.equal(true);
		});
	});
};
