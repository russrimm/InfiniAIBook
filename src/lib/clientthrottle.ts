import { FailureThrottle } from "./throttle";

/** A client that has been quiet this long starts again from its first attempt. */
const IDLE_RESET_MS = 15 * 60_000;

/**
 * One failure back-off per client, so someone guessing passwords is slowed
 * down without making the real user wait behind them.
 *
 * A single shared queue lets any host that can reach the sign-in route keep it
 * busy, and everyone else, including the owner, waits or is refused. Here each
 * client key has its own FailureThrottle, a global limit on attempts waiting at
 * once keeps memory bounded, and the table of clients is capped.
 */
export class ClientThrottle {
  private readonly clients = new Map<string, { throttle: FailureThrottle; touched: number }>();

  constructor(
    private readonly make: () => FailureThrottle = () => new FailureThrottle(),
    private readonly maxClients = 1000,
    private readonly maxPendingTotal = 128,
    private readonly now: () => number = Date.now
  ) {}

  /** The throttle for this client, created on first use. */
  forClient(key: string): FailureThrottle {
    const at = this.now();
    const known = this.clients.get(key);
    if (
      known &&
      (known.throttle.pendingCount > 0 || known.throttle.consecutiveFailures === 0 || at - known.touched < IDLE_RESET_MS)
    ) {
      // Re-insert so the map stays in least-recently-used order.
      this.clients.delete(key);
      known.touched = at;
      this.clients.set(key, known);
      return known.throttle;
    }
    this.clients.delete(key);
    if (this.clients.size >= this.maxClients) this.evict();
    const fresh = { throttle: this.make(), touched: at };
    this.clients.set(key, fresh);
    return fresh.throttle;
  }

  /** Whether so many attempts are waiting overall that new ones should be refused at once. */
  get overloaded(): boolean {
    let pending = 0;
    for (const { throttle } of this.clients.values()) pending += throttle.pendingCount;
    return pending >= this.maxPendingTotal;
  }

  get size(): number {
    return this.clients.size;
  }

  /** Drop an idle client with no failures first; only then the least recently used one. */
  private evict() {
    for (const [key, { throttle }] of this.clients) {
      if (throttle.pendingCount === 0 && throttle.consecutiveFailures === 0) {
        this.clients.delete(key);
        return;
      }
    }
    const oldest = this.clients.keys().next();
    if (!oldest.done) this.clients.delete(oldest.value);
  }
}

/**
 * Who a request came from, as far as this server can tell.
 *
 * Behind a reverse proxy (TRUST_PROXY=true) the proxy appends the address it
 * saw to X-Forwarded-For, so the last entry is the one to trust; earlier ones
 * are whatever the client sent. Without a trusted proxy there is nothing
 * reliable to tell clients apart, so they share one bucket.
 */
export function clientKey(headers: { get(name: string): string | null }): string {
  if (!/^(1|true|yes)$/i.test(process.env.TRUST_PROXY ?? "")) return "direct";
  const last = headers.get("x-forwarded-for")?.split(",").pop()?.trim().toLowerCase();
  return last && last.length <= 64 && /^[0-9a-f.:]+$/.test(last) ? last : "direct";
}

const SHARED = Symbol.for("infiniaibook.authThrottle");

/**
 * The one throttle for password and bearer-token attempts, shared by the
 * sign-in route and the proxy (separate bundles in one process), so guesses
 * through either count together.
 */
export function authThrottle(): ClientThrottle {
  const store = globalThis as unknown as Record<symbol, ClientThrottle | undefined>;
  return (store[SHARED] ??= new ClientThrottle());
}
