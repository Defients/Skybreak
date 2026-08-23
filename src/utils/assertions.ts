export function assert(condition: boolean, message: string): void {
  if (!condition) {
    console.error(`[ASSERTION FAILED] ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
}

export function assertNonNull<T>(value: T | null | undefined, name: string): T {
  if (value === null || value === undefined) {
    throw new Error(`Expected non-null value for ${name}`);
  }
  return value;
}

export function assertRange(value: number, min: number, max: number, name: string): void {
  if (value < min || value > max) {
    throw new Error(`${name} must be between ${min} and ${max}, got ${value}`);
  }
}

export function assertPositive(value: number, name: string): void {
  if (value < 0) {
    throw new Error(`${name} must be non-negative, got ${value}`);
  }
}
