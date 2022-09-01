import { FDisposable, FExceptionInvalidOperation, FExecutionContext } from "@freemework/common";


export interface KeyValueDb extends KeyValueDb.Operation {
	/**
	 * Open database transaction to make set of changes atomically.
	 */
	transaction(executionContext: FExecutionContext): Promise<KeyValueDb.TransactionalOperation>;
}

export namespace KeyValueDb {
	export type Key = string;
	export type Value = string;

	/**
	 * Provides set of available database operations
	 */
	export interface Operation {
		/**
		 * Retrieve a value from the storage, or `null` if key does not exist.
		 * @param key Unique key of the value
		 */
		find(executionContext: FExecutionContext, key: Key): Promise<Value | null>;

		/**
		 * Retrieve value from the storage
		 * @param key Unique key of the value
		 * @throws `KeyValueDb.NoSuchKeyError` If key does not exist.
		 */
		get(executionContext: FExecutionContext, key: Key): Promise<Value>;

		/**
		 * Save a value into the storage. Returns previous value.
		 * @param key Unique key of the value
		 * @param value Value to be stored
		 */
		set(executionContext: FExecutionContext, key: Key, value: Value | null): Promise<Value | null>;
	}

	/**
	 * A database transaction to make set of changes atomically.
	 * Commit a transaction to save changes, or dispose to discard changes.
	 */
	export interface TransactionalOperation extends Operation, FDisposable {
		commit(executionContext: FExecutionContext): Promise<void>;
	}

	export class KeyValueDbError extends Error {
		public get name(): string {
			return this.constructor.name;
		}
	}

	export class ConcurrencyError extends KeyValueDbError {
		public readonly concurrencyKeys: ReadonlyArray<Key>;

		public constructor(concurrencyKeys: ReadonlyArray<Key>) {
			super();
			this.concurrencyKeys = Object.freeze(concurrencyKeys.slice());
		}
	}

	export class NoSuchKeyError extends KeyValueDbError {
		public readonly key: Key;

		public constructor(key: Key) {
			super(`No such key '${key}'.`);
			this.key = key;
		}
	}

	export class IOError extends KeyValueDbError { }
}


export class InMemory implements KeyValueDb {
	private readonly _dict: Map<KeyValueDb.Key, KeyValueDb.Value>;

	public constructor() {
		this._dict = new Map();
	}

	public find(executionContext: FExecutionContext, key: string): Promise<string | null> {
		const value: KeyValueDb.Value | undefined = this._dict.get(key);

		return Promise.resolve(value !== undefined ? value : null);
	}

	public get(executionContext: FExecutionContext, key: string): Promise<string> {
		const value: KeyValueDb.Value | undefined = this._dict.get(key);

		if (value === undefined) {
			throw new KeyValueDb.NoSuchKeyError(key);
		}

		return Promise.resolve(value);
	}

	public set(executionContext: FExecutionContext, key: string, value: string | null): Promise<string | null> {
		const oldValue: KeyValueDb.Value | undefined = this._dict.get(key);

		if (value === null) {
			this._dict.delete(key);
		} else {
			this._dict.set(key, value);
		}

		return Promise.resolve(oldValue !== undefined ? oldValue : null);
	}

	public transaction(executionContext: FExecutionContext): Promise<KeyValueDb.TransactionalOperation> {
		return Promise.resolve(new InMemoryTransaction(this._dict));
	}
}

class InMemoryTransaction implements KeyValueDb.TransactionalOperation {
	private readonly _parentDict: Map<KeyValueDb.Key, KeyValueDb.Value>;
	private readonly _lockDict: Map<KeyValueDb.Key, KeyValueDb.Value | null>;
	private readonly _transactionDict: Map<KeyValueDb.Key, KeyValueDb.Value>;
	private _completed: boolean;

	public constructor(parentDict: Map<KeyValueDb.Key, KeyValueDb.Value>) {
		this._parentDict = parentDict;
		this._lockDict = new Map();
		this._transactionDict = new Map();
		this._completed = false;
	}

	public commit(executionContext: FExecutionContext): Promise<void> {
		this._completed = true;

		const concurrencyKeys: Array<KeyValueDb.Key> = [];
		for (const [key, __] of this._lockDict) {
			const parentValue = this._parentDict.get(key);
			const lockValue = this._lockDict.get(key);
			if (lockValue === null) {
				if (parentValue !== undefined) {
					concurrencyKeys.push(key);
				}
			} else {
				if (parentValue !== lockValue) {
					concurrencyKeys.push(key);
				}
			}
		}

		if (concurrencyKeys.length > 0) {
			return Promise.reject(new KeyValueDb.ConcurrencyError(concurrencyKeys));
		}

		for (const [key, value] of this._transactionDict) {
			this._parentDict.set(key, value);
		}

		return Promise.resolve();
	}

	public dispose(): Promise<void> {
		this._completed = true;
		this._lockDict.clear();
		this._transactionDict.clear();
		return Promise.resolve();
	}

	public find(executionContext: FExecutionContext, key: string): Promise<string | null> {
		this.verifyCompleted();

		const transactionValue: KeyValueDb.Value | undefined = this._transactionDict.get(key);
		if (transactionValue !== undefined) {
			return Promise.resolve(transactionValue);
		}

		const lockValue: KeyValueDb.Value | null | undefined = this._lockDict.get(key);
		if (lockValue !== undefined) {
			return Promise.resolve(lockValue);
		}

		const parentValue: KeyValueDb.Value | undefined = this._parentDict.get(key);
		if (parentValue !== undefined) {
			this._lockDict.set(key, parentValue);
			return Promise.resolve(parentValue);
		} else {
			this._lockDict.set(key, null);
			return Promise.resolve(null);
		}
	}

	public get(executionContext: FExecutionContext, key: string): Promise<string> {
		this.verifyCompleted();

		const transactionValue: KeyValueDb.Value | undefined = this._transactionDict.get(key);
		if (transactionValue !== undefined) {
			return Promise.resolve(transactionValue);
		}

		const lockValue: KeyValueDb.Value | undefined | null = this._lockDict.get(key);
		if (lockValue === null) {
			throw new KeyValueDb.NoSuchKeyError(key);
		}
		if (lockValue !== undefined) {
			return Promise.resolve(lockValue);
		}

		const parentValue: KeyValueDb.Value | undefined = this._parentDict.get(key);
		if (parentValue !== undefined) {
			this._lockDict.set(key, parentValue);
			return Promise.resolve(parentValue);
		}

		throw new KeyValueDb.NoSuchKeyError(key);
	}

	public set(executionContext: FExecutionContext, key: KeyValueDb.Key, value: KeyValueDb.Value | null): Promise<KeyValueDb.Value | null> {
		this.verifyCompleted();

		const oldTransactionValue: KeyValueDb.Value | undefined = this._transactionDict.get(key);

		if (value === null) {
			this._transactionDict.delete(key);
		} else {
			this._transactionDict.set(key, value);
		}

		if (oldTransactionValue !== undefined) {
			return Promise.resolve(oldTransactionValue);
		}

		const lockValue: KeyValueDb.Value | undefined | null = this._lockDict.get(key);
		if (lockValue === undefined) {
			const parentValue: KeyValueDb.Value | undefined = this._parentDict.get(key);
			const friendlyValue: KeyValueDb.Value | null = parentValue !== undefined ? parentValue : null;
			this._lockDict.set(key, friendlyValue);
			return Promise.resolve(friendlyValue);
		}

		return Promise.resolve(lockValue);
	}

	private verifyCompleted(): void {
		if (this._completed === true) {
			throw new FExceptionInvalidOperation("Wrong operation at current state. Cannot use completed transaction.");
		}
	}
}
