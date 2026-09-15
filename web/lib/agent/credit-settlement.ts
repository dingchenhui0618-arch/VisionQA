export type CreditState = "AVAILABLE" | "HELD" | "CAPTURED" | "RELEASED";

export type CreditBalance = { available: number; held: number; captured: number };
export type CreditHold = {
  id: string;
  idempotency: string;
  amount: number;
  state: CreditState;
  createdAt: string;
  updatedAt: string;
};

export class CreditSettlementError extends Error {
  readonly code: "INSUFFICIENT_CREDITS" | "IDEMPOTENCY_CONFLICT" | "INVALID_TRANSITION";
  constructor(code: CreditSettlementError["code"], message: string) { super(message); this.name = "CreditSettlementError"; this.code = code; }
}

export class CreditSettlement {
  private readonly holds = new Map<string, CreditHold>();
  private readonly byIdempotency = new Map<string, CreditHold>();
  private balance: CreditBalance;
  private readonly now: () => Date;
  private readonly id: () => string;

  constructor(options: { available?: number; now?: () => Date; id?: () => string } = {}) {
    const available = options.available ?? 0;
    if (!Number.isInteger(available) || available < 0) throw new Error("available credits must be a non-negative integer");
    this.balance = { available, held: 0, captured: 0 };
    this.now = options.now ?? (() => new Date());
    this.id = options.id ?? (() => `crh_${crypto.randomUUID()}`);
  }

  getBalance(): CreditBalance { return { ...this.balance }; }
  getHold(id: string): CreditHold | null { const h = this.holds.get(id); return h ? { ...h } : null; }
  list(): readonly CreditHold[] { return [...this.holds.values()].map((h) => ({ ...h })); }

  hold(idempotency: string, amount = 1): CreditHold {
    const key = idempotency.trim();
    if (!key) throw new CreditSettlementError("IDEMPOTENCY_CONFLICT", "idempotency is required");
    if (!Number.isInteger(amount) || amount <= 0) throw new Error("credit amount must be a positive integer");
    const previous = this.byIdempotency.get(key);
    if (previous) {
      if (previous.amount !== amount) throw new CreditSettlementError("IDEMPOTENCY_CONFLICT", "credit hold idempotency conflict");
      return { ...previous };
    }
    if (this.balance.available < amount) throw new CreditSettlementError("INSUFFICIENT_CREDITS", "insufficient credits");
    const timestamp = this.now().toISOString();
    const result: CreditHold = { id: this.id(), idempotency: key, amount, state: "HELD", createdAt: timestamp, updatedAt: timestamp };
    this.balance.available -= amount;
    this.balance.held += amount;
    this.holds.set(result.id, result);
    this.byIdempotency.set(key, result);
    return { ...result };
  }

  capture(id: string): CreditHold {
    const current = this.require(id);
    if (current.state === "CAPTURED") return { ...current };
    if (current.state !== "HELD") throw new CreditSettlementError("INVALID_TRANSITION", `cannot capture ${current.state} credit`);
    this.balance.held -= current.amount;
    this.balance.captured += current.amount;
    return this.update(current, "CAPTURED");
  }

  release(id: string): CreditHold {
    const current = this.require(id);
    if (current.state === "RELEASED") return { ...current };
    if (current.state !== "HELD") throw new CreditSettlementError("INVALID_TRANSITION", `cannot release ${current.state} credit`);
    this.balance.held -= current.amount;
    this.balance.available += current.amount;
    return this.update(current, "RELEASED");
  }

  private require(id: string): CreditHold { const current = this.holds.get(id); if (!current) throw new CreditSettlementError("INVALID_TRANSITION", "credit hold not found"); return current; }
  private update(current: CreditHold, state: CreditState): CreditHold {
    const next = { ...current, state, updatedAt: this.now().toISOString() };
    this.holds.set(next.id, next);
    this.byIdempotency.set(next.idempotency, next);
    return { ...next };
  }
}

export function createCreditSettlement(options: ConstructorParameters<typeof CreditSettlement>[0] = {}): CreditSettlement { return new CreditSettlement(options); }
export const holdCredits = (settlement: CreditSettlement, idempotency: string, amount = 1) => settlement.hold(idempotency, amount);
export const captureCredits = (settlement: CreditSettlement, holdId: string) => settlement.capture(holdId);
export const releaseCredits = (settlement: CreditSettlement, holdId: string) => settlement.release(holdId);
