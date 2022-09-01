import { FCancellationToken, FExecutionContext, Fusing } from "@freemework/common";
import { assert } from "chai";

import { InMemory, KeyValueDb } from "../../lib/misc/KeyValueDb";

for (const { dbFactory, name } of [
	{ name: InMemory.name, dbFactory: () => new InMemory() }
]) {
	describe(`KeyValueDb implementation '${name}' tests`, function () {
		it(`Platform test ${process.platform} (${process.arch})`, function () {
			assert.equal(42, 42);
		});

		it("find() should return null for non-existent key", async function () {
			const db: KeyValueDb = dbFactory();
			const value: KeyValueDb.Value | null = await db.find(FExecutionContext.None, "testKey");
			assert.isNull(value);
		});
		it("get() should throw NoSuchKeyError for non-existent key", async function () {
			const db: KeyValueDb = dbFactory();
			let expectedErr: any;
			try {
				await db.get(FExecutionContext.None, "testKey");
			} catch (e) {
				expectedErr = e;
			}
			assert.isDefined(expectedErr);
			assert.instanceOf(expectedErr, KeyValueDb.NoSuchKeyError);
		});
		it("set() should return null as previous value for non-existent key", async function () {
			const db: KeyValueDb = dbFactory();
			const value: KeyValueDb.Value | null = await db.set(FExecutionContext.None, "testKey", "testValue");
			assert.isNull(value);
		});

		describe("Get/Set tests", function () {
			it("find() should return value for existent key", async function () {
				const db: KeyValueDb = dbFactory();
				await db.set(FExecutionContext.None, "testKey", "testValue");
				const value: KeyValueDb.Value | null = await db.find(FExecutionContext.None, "testKey");
				assert.equal(value, "testValue");
			});
		});

		describe("Transactional tests", function () {
			it("find() should return value for existent key", async function () {
				const db: KeyValueDb = dbFactory();
				await Fusing(FExecutionContext.None, () => db.transaction(FExecutionContext.None), async (__, dbTransaction) => {
					const value: KeyValueDb.Value | null = await dbTransaction.find(FExecutionContext.None, "testKey");
					assert.isNull(value);
				});
			});

			it("get() should throw NoSuchKeyError for non-existent key", async function () {
				const db: KeyValueDb = dbFactory();
				await Fusing(FExecutionContext.None, () => db.transaction(FExecutionContext.None), async (__, dbTransaction) => {
					let expectedErr: any;
					try {
						await dbTransaction.get(FExecutionContext.None, "testKey");
					} catch (e) {
						expectedErr = e;
					}
					assert.isDefined(expectedErr);
					assert.instanceOf(expectedErr, KeyValueDb.NoSuchKeyError);
				});
			});

			it("set() should return null as previous value for non-existent key", async function () {
				const db: KeyValueDb = dbFactory();
				await Fusing(FExecutionContext.None, () => db.transaction(FExecutionContext.None), async (__, dbTransaction) => {
					const value: KeyValueDb.Value | null = await dbTransaction.set(FExecutionContext.None, "testKey", "testValue");
					assert.isNull(value);
				});
			});

			it("dispose() should revert changes #1", async function () {
				const db: KeyValueDb = dbFactory();
				await Fusing(FExecutionContext.None, () => db.transaction(FExecutionContext.None), async (__, dbTransaction) => {
					const value: KeyValueDb.Value | null = await dbTransaction.set(FExecutionContext.None, "testKey", "testValue");
					assert.isNull(value);
				});
				const oldValue = await db.find(FExecutionContext.None, "testKey");
				assert.isNull(oldValue);
			});

			it("dispose() should revert changes #2", async function () {
				const db: KeyValueDb = dbFactory();
				await db.set(FExecutionContext.None, "testKey", "testValue");
				await Fusing(FExecutionContext.None, () => db.transaction(FExecutionContext.None), async (__, dbTransaction) => {
					const value: KeyValueDb.Value | null = await dbTransaction.set(FExecutionContext.None, "testKey", "testValueUpdated");
					assert.equal(value, "testValue");
				});
				const oldValue = await db.find(FExecutionContext.None, "testKey");
				assert.equal(oldValue, "testValue");
			});

			it("dispose() should revert changes #3", async function () {
				const db: KeyValueDb = dbFactory();
				await Fusing(FExecutionContext.None, () => db.transaction(FExecutionContext.None), async (__, dbTransaction) => {
					const value: KeyValueDb.Value | null = await dbTransaction.set(FExecutionContext.None, "testKey", "testValue");
					assert.isNull(value);
				});
				let expectedErr: any;
				try {
					await db.get(FExecutionContext.None, "testKey");
				} catch (e) {
					expectedErr = e;
				}
				assert.isDefined(expectedErr);
				assert.instanceOf(expectedErr, KeyValueDb.NoSuchKeyError);
			});

			it("commit() should apply changes #1", async function () {
				const db: KeyValueDb = dbFactory();
				await Fusing(FExecutionContext.None, () => db.transaction(FExecutionContext.None), async (__, dbTransaction) => {
					const value: KeyValueDb.Value | null = await dbTransaction.set(FExecutionContext.None, "testKey", "testValue");
					assert.isNull(value);
					await dbTransaction.commit(FExecutionContext.None);
				});
				const oldValue = await db.find(FExecutionContext.None, "testKey");
				assert.equal(oldValue, "testValue");
			});

			it("commit() should apply changes #2", async function () {
				const db: KeyValueDb = dbFactory();
				await db.set(FExecutionContext.None, "testKey", "testValue");
				await Fusing(FExecutionContext.None, () => db.transaction(FExecutionContext.None), async (__, dbTransaction) => {
					const value: KeyValueDb.Value | null = await dbTransaction.set(FExecutionContext.None, "testKey", "testValueUpdated");
					assert.equal(value, "testValue");
					await dbTransaction.commit(FExecutionContext.None);
				});
				const oldValue = await db.find(FExecutionContext.None, "testKey");
				assert.equal(oldValue, "testValueUpdated");
			});
		});
	});
}
