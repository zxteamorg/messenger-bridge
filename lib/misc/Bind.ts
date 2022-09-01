import "reflect-metadata";

export function Bind<T extends Function>(
	target: Object, methodName: string | symbol, descriptor: TypedPropertyDescriptor<T>
) {
	return {
		configurable: true,
		get(this: T): T {
			const value = descriptor.value !== undefined ? descriptor.value.bind(this) : undefined;
			Object.defineProperty(this, methodName, {
				value,
				configurable: descriptor.configurable,
				writable: descriptor.writable
			});
			return value;
		}
	};
}
