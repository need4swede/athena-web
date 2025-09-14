import { SandboxStore } from './sandboxStore';

type UserId = number;

interface OverlayPayment {
  id: string; // SBX id
  student_fee_id: number;
  amount: number;
  payment_method?: string;
  notes?: string;
  processed_by_user_id: number;
  created_at: Date;
  transaction_id: string;
}

interface OverlayFee {
  id: string; // SBX id
  student_id: number;
  amount: number;
  description: string;
  created_at: Date;
  created_by_user_id: number;
}

interface SessionOverlay {
  paymentsByFeeId: Map<number, OverlayPayment[]>;
  createdFees: OverlayFee[];
  deletedFeeIds: Set<number>;
  checkoutSessions: Map<string, any>;
  deviceDeltas: Array<{ chromebook_id: number; changes: Record<string, any>; timestamp: string }>;
  maintenanceActions: Array<{ type: 'create' | 'comment' | 'return'; data: any; timestamp: string }>;
  receiptsGenerated: number;
}

const overlays = new Map<UserId, SessionOverlay>();

function getOverlay(userId: number): SessionOverlay | null {
  if (!SandboxStore.isActive(userId)) return null;
  let ov = overlays.get(userId);
  if (!ov) {
    ov = {
      paymentsByFeeId: new Map(),
      createdFees: [],
      deletedFeeIds: new Set(),
      checkoutSessions: new Map(),
      deviceDeltas: [],
      maintenanceActions: [],
      receiptsGenerated: 0,
    };
    overlays.set(userId, ov);
  }
  return ov;
}

function sbxId(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

export const SandboxOverlay = {
  getCheckoutSession(userId: number, sessionId: string) {
    const ov = getOverlay(userId);
    if (!ov) return null;
    return ov.checkoutSessions.get(sessionId) || null;
  },
  recordCheckoutStart(userId: number, sessionId: string, sessionData: any) {
    const ov = getOverlay(userId);
    if (!ov) return null;
    const entry = {
      sessionId,
      overallStatus: 'in_progress',
      currentStep: 'validate_student_info',
      steps: [],
      sessionData,
      created_at: new Date().toISOString(),
    };
    ov.checkoutSessions.set(sessionId, entry);
    return entry;
  },
  recordCheckoutComplete(userId: number, sessionId: string, update: any = {}) {
    const ov = getOverlay(userId);
    if (!ov) return null;
    const entry = ov.checkoutSessions.get(sessionId) || {};
    const finalEntry = { ...entry, ...update, overallStatus: 'completed', currentStep: null, completed_at: new Date().toISOString() };
    ov.checkoutSessions.set(sessionId, finalEntry);
    return finalEntry;
  },
  recordDeviceDelta(userId: number, chromebook_id: number, changes: Record<string, any>) {
    const ov = getOverlay(userId);
    if (!ov) return false;
    ov.deviceDeltas.push({ chromebook_id, changes, timestamp: new Date().toISOString() });
    return true;
  },
  recordMaintenance(userId: number, type: 'create' | 'comment' | 'return', data: any) {
    const ov = getOverlay(userId);
    if (!ov) return false;
    ov.maintenanceActions.push({ type, data, timestamp: new Date().toISOString() });
    return true;
  },
  incReceipts(userId: number) {
    const ov = getOverlay(userId);
    if (!ov) return 0;
    ov.receiptsGenerated += 1;
    return ov.receiptsGenerated;
  },
  recordPayment(userId: number, payment: Omit<OverlayPayment, 'id' | 'created_at'>) {
    const ov = getOverlay(userId);
    if (!ov) return null;
    const item: OverlayPayment = {
      ...payment,
      id: sbxId('SBX_PAY'),
      created_at: new Date(),
    };
    const list = ov.paymentsByFeeId.get(payment.student_fee_id) || [];
    list.push(item);
    ov.paymentsByFeeId.set(payment.student_fee_id, list);
    return item;
  },
  snapshot(userId: number) {
    const ov = getOverlay(userId);
    if (!ov) return { paymentsByFeeId: {}, createdFees: [], deletedFeeIds: [], checkoutSessions: {}, deviceDeltas: [], maintenanceActions: [], receiptsGenerated: 0 };
    const payments: Record<string, any[]> = {};
    ov.paymentsByFeeId.forEach((list, feeId) => {
      payments[String(feeId)] = list;
    });
    return {
      paymentsByFeeId: payments,
      createdFees: ov.createdFees,
      deletedFeeIds: Array.from(ov.deletedFeeIds),
      checkoutSessions: Object.fromEntries(ov.checkoutSessions.entries()),
      deviceDeltas: ov.deviceDeltas,
      maintenanceActions: ov.maintenanceActions,
      receiptsGenerated: ov.receiptsGenerated,
    };
  },
  recordCreatedFee(userId: number, fee: Omit<OverlayFee, 'id' | 'created_at'>) {
    const ov = getOverlay(userId);
    if (!ov) return null;
    const item: OverlayFee = { ...fee, id: sbxId('SBX_FEE'), created_at: new Date() };
    ov.createdFees.push(item);
    return item;
  },
  recordDeletedFee(userId: number, feeId: number) {
    const ov = getOverlay(userId);
    if (!ov) return false;
    ov.deletedFeeIds.add(feeId);
    return true;
  },
  mergeFees(userId: number, baseFees: any[]) {
    const ov = getOverlay(userId);
    if (!ov) return baseFees;
    // filter deleted
    let fees = baseFees.filter(f => !ov!.deletedFeeIds.has(f.id));
    // add created
    fees = fees.concat(
      ov.createdFees.map(f => ({
        id: f.id,
        student_id: f.student_id,
        amount: f.amount,
        description: f.description,
        created_at: f.created_at,
        created_by_user_id: f.created_by_user_id,
        payments: [],
        balance: f.amount,
      }))
    );
    // append payments and recompute balances
    fees = fees.map(f => {
      const extra = ov!.paymentsByFeeId.get(f.id) || [];
      const payments = (f.payments || []).concat(
        extra.map(p => ({
          id: p.id,
          student_fee_id: p.student_fee_id,
          amount: p.amount,
          payment_method: p.payment_method,
          notes: p.notes,
          processed_by_user_id: p.processed_by_user_id,
          created_at: p.created_at,
          transaction_id: p.transaction_id,
        }))
      );
      const totalPaid = payments.reduce((sum: number, p: any) => sum + Number(p.amount), 0);
      return { ...f, payments, balance: Number(f.amount) - totalPaid };
    });
    return fees;
  }
};

// Expose snapshot helper for routes
export type SandboxOverlaySnapshot = ReturnType<typeof SandboxOverlay.snapshot>;
