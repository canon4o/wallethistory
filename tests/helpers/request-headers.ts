/** In-memory stand-in for `headers()` from next/headers. */
class RequestHeaders {
  private values = new Map<string, string>();
  /** Simulates a call outside a request, where next/headers throws. */
  unavailable = false;

  reset() {
    this.values.clear();
    this.unavailable = false;
  }

  set(name: string, value: string) {
    this.values.set(name.toLowerCase(), value);
  }

  get(name: string) {
    if (this.unavailable) throw new Error("headers() was called outside a request scope");
    return this.values.get(name.toLowerCase()) ?? null;
  }
}

export const requestHeaders = new RequestHeaders();
