import { DUMMY_CANCELLATION_TOKEN } from "@zxteam/cancellation";
import { using } from "@zxteam/disposable";
import { assert } from "chai";

import { InMemory, KeyValueDb } from "../../src/misc/KeyValueDb";

for (const { dbFactory, name } of [
	{ name: InMemory.name, dbFactory: () => new InMemory() }
]) {
	describe(`KeyValueDb implementation '${name}' tests`, function () {
		it("find() should return null for non-existent key", async function () {
			const db: KeyValueDb = dbFactory();
			const value: KeyValueDb.Value | null = await db.find(DUMMY_CANCELLATION_TOKEN, "testKey");
			assert.isNull(value);
		});
		it("get() should throw NoSuchKeyError for non-existent key", async function () {
			const db: KeyValueDb = dbFactory();
			let expectedErr!: KeyValueDb.NoSuchKeyError;
			try {
				await db.get(DUMMY_CANCELLATION_TOKEN, "testKey");
			} catch (e) {
				expectedErr = e;
			}
			assert.isDefined(expectedErr);
			assert.instanceOf(expectedErr, KeyValueDb.NoSuchKeyError);
		});
		it("set() should return null as previous value for non-existent key", async function () {
			const db: KeyValueDb = dbFactory();
			const value: KeyValueDb.Value | null = await db.set(DUMMY_CANCELLATION_TOKEN, "testKey", "testValue");
			assert.isNull(value);
		});

		describe("Get/Set tests", function () {
			it("find() should return value for existent key", async function () {
				const db: KeyValueDb = dbFactory();
				await db.set(DUMMY_CANCELLATION_TOKEN, "testKey", "testValue");
				const value: KeyValueDb.Value | null = await db.find(DUMMY_CANCELLATION_TOKEN, "testKey");
				assert.equal(value, "testValue");
			});
		});

		describe("Transactional tests", function () {
			it("find() should return value for existent key", async function () {
				const db: KeyValueDb = dbFactory();
				await using(DUMMY_CANCELLATION_TOKEN, () => db.transaction(DUMMY_CANCELLATION_TOKEN), async (__, dbTransaction) => {
					const value: KeyValueDb.Value | null = await dbTransaction.find(DUMMY_CANCELLATION_TOKEN, "testKey");
					assert.isNull(value);
				});
			});

			it("get() should throw NoSuchKeyError for non-existent key", async function () {
				const db: KeyValueDb = dbFactory();
				await using(DUMMY_CANCELLATION_TOKEN, () => db.transaction(DUMMY_CANCELLATION_TOKEN), async (__, dbTransaction) => {
					let expectedErr!: KeyValueDb.NoSuchKeyError;
					try {
						await dbTransaction.get(DUMMY_CANCELLATION_TOKEN, "testKey");
					} catch (e) {
						expectedErr = e;
					}
					assert.isDefined(expectedErr);
					assert.instanceOf(expectedErr, KeyValueDb.NoSuchKeyError);
				});
			});

			it("set() should return null as previous value for non-existent key", async function () {
				const db: KeyValueDb = dbFactory();
				await using(DUMMY_CANCELLATION_TOKEN, () => db.transaction(DUMMY_CANCELLATION_TOKEN), async (__, dbTransaction) => {
					const value: KeyValueDb.Value | null = await dbTransaction.set(DUMMY_CANCELLATION_TOKEN, "testKey", "testValue");
					assert.isNull(value);
				});
			});

			it("dispose() should revert changes #1", async function () {
				const db: KeyValueDb = dbFactory();
				await using(DUMMY_CANCELLATION_TOKEN, () => db.transaction(DUMMY_CANCELLATION_TOKEN), async (__, dbTransaction) => {
					const value: KeyValueDb.Value | null = await dbTransaction.set(DUMMY_CANCELLATION_TOKEN, "testKey", "testValue");
					assert.isNull(value);
				});
				const oldValue = await db.find(DUMMY_CANCELLATION_TOKEN, "testKey");
				assert.isNull(oldValue);
			});

			it("dispose() should revert changes #2", async function () {
				const db: KeyValueDb = dbFactory();
				await db.set(DUMMY_CANCELLATION_TOKEN, "testKey", "testValue");
				await using(DUMMY_CANCELLATION_TOKEN, () => db.transaction(DUMMY_CANCELLATION_TOKEN), async (__, dbTransaction) => {
					const value: KeyValueDb.Value | null = await dbTransaction.set(DUMMY_CANCELLATION_TOKEN, "testKey", "testValueUpdated");
					assert.equal(value, "testValue");
				});
				const oldValue = await db.find(DUMMY_CANCELLATION_TOKEN, "testKey");
				assert.equal(oldValue, "testValue");
			});

			it("dispose() should revert changes #3", async function () {
				const db: KeyValueDb = dbFactory();
				await using(DUMMY_CANCELLATION_TOKEN, () => db.transaction(DUMMY_CANCELLATION_TOKEN), async (__, dbTransaction) => {
					const value: KeyValueDb.Value | null = await dbTransaction.set(DUMMY_CANCELLATION_TOKEN, "testKey", "testValue");
					assert.isNull(value);
				});
				let expectedErr!: KeyValueDb.NoSuchKeyError;
				try {
					await db.get(DUMMY_CANCELLATION_TOKEN, "testKey");
				} catch (e) {
					expectedErr = e;
				}
				assert.isDefined(expectedErr);
				assert.instanceOf(expectedErr, KeyValueDb.NoSuchKeyError);
			});

			it("commit() should apply changes #1", async function () {
				const db: KeyValueDb = dbFactory();
				await using(DUMMY_CANCELLATION_TOKEN, () => db.transaction(DUMMY_CANCELLATION_TOKEN), async (__, dbTransaction) => {
					const value: KeyValueDb.Value | null = await dbTransaction.set(DUMMY_CANCELLATION_TOKEN, "testKey", "testValue");
					assert.isNull(value);
					await dbTransaction.commit(DUMMY_CANCELLATION_TOKEN);
				});
				const oldValue = await db.find(DUMMY_CANCELLATION_TOKEN, "testKey");
				assert.equal(oldValue, "testValue");
			});

			it("commit() should apply changes #2", async function () {
				const db: KeyValueDb = dbFactory();
				await db.set(DUMMY_CANCELLATION_TOKEN, "testKey", "testValue");
				await using(DUMMY_CANCELLATION_TOKEN, () => db.transaction(DUMMY_CANCELLATION_TOKEN), async (__, dbTransaction) => {
					const value: KeyValueDb.Value | null = await dbTransaction.set(DUMMY_CANCELLATION_TOKEN, "testKey", "testValueUpdated");
					assert.equal(value, "testValue");
					await dbTransaction.commit(DUMMY_CANCELLATION_TOKEN);
				});
				const oldValue = await db.find(DUMMY_CANCELLATION_TOKEN, "testKey");
				assert.equal(oldValue, "testValueUpdated");
			});
		});
	});
}
