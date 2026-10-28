type CookieOptions = Record<string, unknown>;

/** In-memory stand-in for `cookies()` from next/headers. */
class CookieJar {
  private values = new Map<string, string>();
  /** Simulates rendering a page: Next.js throws when cookies are modified outside actions. */
  readOnly = false;
  lastSetOptions: CookieOptions | undefined;

  reset() {
    this.values.clear();
    this.readOnly = false;
    this.lastSetOptions = undefined;
  }

  get(name: string) {
    const value = this.values.get(name);
    return value === undefined ? undefined : { name, value };
  }

  has(name: string) {
    return this.values.has(name);
  }

  set(name: string, value: string, options?: CookieOptions) {
    this.assertWritable();
    this.values.set(name, value);
    this.lastSetOptions = options;
  }

  delete(name: string) {
    this.assertWritable();
    this.values.delete(name);
  }

  private assertWritable() {
    if (this.readOnly) throw new Error("Cookies can only be modified in a Server Action or Route Handler");
  }
}

export const cookieJar = new CookieJar();
