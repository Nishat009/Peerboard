// eslint-disable-next-line @typescript-eslint/no-explicit-any
type EventMap = Record<string, (...args: any[]) => void>;

/** Minimal typed event emitter; returns an unsubscribe function from `on` for easy cleanup. */
export class Emitter<Events extends EventMap> {
  private readonly listeners = new Map<keyof Events, Set<Events[keyof Events]>>();

  on<E extends keyof Events>(event: E, listener: Events[E]): () => void {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    set.add(listener);
    return () => this.off(event, listener);
  }

  off<E extends keyof Events>(event: E, listener: Events[E]): void {
    this.listeners.get(event)?.delete(listener);
  }

  protected emit<E extends keyof Events>(event: E, ...args: Parameters<Events[E]>): void {
    this.listeners.get(event)?.forEach((listener) => listener(...args));
  }

  protected removeAllListeners(): void {
    this.listeners.clear();
  }
}
