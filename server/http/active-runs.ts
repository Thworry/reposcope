export interface ActiveRunLease {
  readonly sessionId: string;
  readonly signal: AbortSignal;
  finish(): void;
}

interface ActiveRecord {
  readonly controller: AbortController;
  readonly detachParent: () => void;
  readonly lease: ActiveRunLease;
}

function validSessionId(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{20,256}$/u.test(value);
}

/** Owns one cancellable analysis lease per authenticated session. */
export class ActiveRunRegistry {
  readonly #runs = new Map<string, ActiveRecord>();
  #abortingAll = false;

  begin(sessionId: unknown, parentSignal?: AbortSignal): ActiveRunLease | null {
    if (
      this.#abortingAll ||
      !validSessionId(sessionId) ||
      this.#runs.has(sessionId) ||
      parentSignal?.aborted === true
    ) {
      return null;
    }
    const controller = new AbortController();
    const abortFromParent = () => {
      this.abort(sessionId);
    };
    parentSignal?.addEventListener("abort", abortFromParent, { once: true });
    const detachParent = () => {
      parentSignal?.removeEventListener("abort", abortFromParent);
    };
    let finished = false;
    const lease: ActiveRunLease = Object.freeze({
      sessionId,
      signal: controller.signal,
      finish: () => {
        if (finished) return;
        finished = true;
        const current = this.#runs.get(sessionId);
        if (current?.lease === lease) {
          current.detachParent();
          this.#runs.delete(sessionId);
        }
      },
    });
    this.#runs.set(sessionId, { controller, detachParent, lease });
    return lease;
  }

  abort(sessionId: unknown): boolean {
    if (!validSessionId(sessionId)) return false;
    const current = this.#runs.get(sessionId);
    if (current === undefined) return false;
    current.detachParent();
    this.#runs.delete(sessionId);
    current.controller.abort();
    return true;
  }

  has(sessionId: unknown): boolean {
    return validSessionId(sessionId) && this.#runs.has(sessionId);
  }

  abortAll(): void {
    if (this.#abortingAll) return;
    this.#abortingAll = true;
    try {
      for (const sessionId of [...this.#runs.keys()]) this.abort(sessionId);
    } finally {
      this.#abortingAll = false;
    }
  }

  get size(): number {
    return this.#runs.size;
  }
}
