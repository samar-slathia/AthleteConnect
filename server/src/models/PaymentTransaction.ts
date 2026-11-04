import mongoose, { Document, Schema, Model } from 'mongoose';

export const PAYMENT_TRANSACTION_STATUSES = [
  'created',
  'authorized',
  'attempted',
  'captured',
  'failed',
  'refunded',
] as const;
export type PaymentTransactionStatus = (typeof PAYMENT_TRANSACTION_STATUSES)[number];

export const PAYOUT_STATUSES = [
  'unsettled',
  'simulated_held',
  'simulated_credited',
] as const;
export type PayoutStatus = (typeof PAYOUT_STATUSES)[number];

export const REFUND_STATUSES = [
  'none',
  'pending',
  'partially_refunded',
  'processed',
  'failed',
] as const;
export type RefundStatus = (typeof REFUND_STATUSES)[number];

export interface IRefundItem {
  refundId: string;
  amountInPaise: number;
  status: 'pending' | 'processed' | 'failed';
  createdAt: Date;
  processedAt?: Date;
  failureReason?: string;
}

export interface IPaymentTransaction {
  bookingId: mongoose.Types.ObjectId;
  customerId: mongoose.Types.ObjectId;
  coachId: mongoose.Types.ObjectId;
  currency: string;
  hourlyRate: number;
  durationMinutes: number;
  baseSessionFee: number;
  platformCommission: number;
  coachAllocation: number;
  taxRatePercentage: number;
  taxAmount: number;
  totalCustomerPayable: number;
  amountInPaise: number;
  razorpayOrderId: string;
  razorpayPaymentId?: string;
  razorpaySignature?: string;
  status: PaymentTransactionStatus;
  refundStatus: RefundStatus;
  refundedAmountInPaise: number;
  refunds: IRefundItem[];
  hasExcessRefundAlert?: boolean;
  excessRefundReason?: string;
  gatewayAmountRefundedInPaise?: number;
  gatewayRefundStatus?: string | null;
  hasReconciliationDiscrepancy?: boolean;
  reconciliationDiscrepancyReason?: string;
  lastReconciledAt?: Date;
  payoutStatus: PayoutStatus;
  failureReason?: string;
  paidAt?: Date;
  refundedAt?: Date;
  orderExpiresAt: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface IPaymentTransactionDocument extends IPaymentTransaction, Document {}

const PaymentTransactionSchema = new Schema<IPaymentTransactionDocument>(
  {
    bookingId: {
      type: Schema.Types.ObjectId,
      ref: 'Booking',
      required: [true, 'Booking ID is required.'],
      index: true,
    },
    customerId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Customer ID is required.'],
      index: true,
    },
    coachId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Coach ID is required.'],
      index: true,
    },
    currency: {
      type: String,
      required: true,
      default: 'INR',
      uppercase: true,
    },
    hourlyRate: {
      type: Number,
      required: true,
      min: 0,
    },
    durationMinutes: {
      type: Number,
      required: true,
      min: 1,
    },
    baseSessionFee: {
      type: Number,
      required: true,
      min: 0,
    },
    platformCommission: {
      type: Number,
      required: true,
      min: 0,
    },
    coachAllocation: {
      type: Number,
      required: true,
      min: 0,
    },
    taxRatePercentage: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    taxAmount: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    totalCustomerPayable: {
      type: Number,
      required: true,
      min: 0,
    },
    amountInPaise: {
      type: Number,
      required: true,
      min: 0,
    },
    razorpayOrderId: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
    },
    razorpayPaymentId: {
      type: String,
      sparse: true,
      index: true,
      trim: true,
    },
    razorpaySignature: {
      type: String,
      trim: true,
    },
    status: {
      type: String,
      enum: {
        values: PAYMENT_TRANSACTION_STATUSES,
        message: 'Invalid transaction status "{VALUE}".',
      },
      default: 'created',
      required: true,
      index: true,
    },
    refundStatus: {
      type: String,
      enum: {
        values: REFUND_STATUSES,
        message: 'Invalid refund status "{VALUE}".',
      },
      default: 'none',
      required: true,
      index: true,
    },
    refundedAmountInPaise: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },
    refunds: [
      {
        refundId: { type: String, required: true, trim: true },
        amountInPaise: { type: Number, required: true, min: 0 },
        status: {
          type: String,
          enum: ['pending', 'processed', 'failed'],
          required: true,
          default: 'pending',
        },
        createdAt: { type: Date, default: Date.now },
        processedAt: { type: Date },
        failureReason: { type: String, trim: true },
      },
    ],
    hasExcessRefundAlert: {
      type: Boolean,
      default: false,
      index: true,
    },
    excessRefundReason: {
      type: String,
      trim: true,
    },
    gatewayAmountRefundedInPaise: {
      type: Number,
      min: 0,
    },
    gatewayRefundStatus: {
      type: String,
      trim: true,
    },
    hasReconciliationDiscrepancy: {
      type: Boolean,
      default: false,
      index: true,
    },
    reconciliationDiscrepancyReason: {
      type: String,
      trim: true,
    },
    lastReconciledAt: {
      type: Date,
    },
    payoutStatus: {
      type: String,
      enum: {
        values: PAYOUT_STATUSES,
        message: 'Invalid payout status "{VALUE}".',
      },
      default: 'unsettled',
      required: true,
    },
    failureReason: {
      type: String,
      trim: true,
    },
    paidAt: {
      type: Date,
    },
    refundedAt: {
      type: Date,
    },
    orderExpiresAt: {
      type: Date,
      required: true,
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform: (_doc, ret: Record<string, unknown>) => {
        delete ret.__v;
        return ret;
      },
    },
  }
);

// Compound indexes for fast order lookups and idempotency
PaymentTransactionSchema.index({ bookingId: 1, status: 1 });
PaymentTransactionSchema.index({ customerId: 1, createdAt: -1 });

export const PaymentTransaction: Model<IPaymentTransactionDocument> =
  (mongoose.models.PaymentTransaction as Model<IPaymentTransactionDocument>) ||
  mongoose.model<IPaymentTransactionDocument>('PaymentTransaction', PaymentTransactionSchema);
