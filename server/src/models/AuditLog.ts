import mongoose, { Document, Schema, Model } from 'mongoose';

export const AUDIT_EVENT_TYPES = [
  'ADMIN_LOGIN',
  'ADMIN_LOGOUT',
  'USER_STATUS_CHANGE',
  'COACH_STATUS_CHANGE',
  'SETTINGS_UPDATE',
  'SECURITY_EVENT',
] as const;

export const AUDIT_CATEGORIES = [
  'AUTH',
  'USER_MANAGEMENT',
  'SETTINGS',
  'SECURITY',
] as const;

export type AuditEventType = (typeof AUDIT_EVENT_TYPES)[number];
export type AuditCategory = (typeof AUDIT_CATEGORIES)[number];
export type AuditOutcome = 'SUCCESS' | 'FAILURE';

export interface IAuditLog {
  eventType: AuditEventType;
  action: string;
  category: AuditCategory;
  adminId?: mongoose.Types.ObjectId | null;
  adminEmail: string;
  adminName?: string;
  targetType: string; // 'User' | 'Coach' | 'PlatformSettings' | 'Session' | 'Security'
  targetId?: string | null;
  details?: Record<string, unknown>;
  outcome: AuditOutcome;
  ipAddress?: string;
  createdAt?: Date;
}

export interface IAuditLogDocument extends IAuditLog, Document {}

export interface IAuditLogModel extends Model<IAuditLogDocument> {
  recordEvent(eventData: Omit<IAuditLog, 'createdAt'>): Promise<IAuditLogDocument | null>;
}

const AuditLogSchema = new Schema<IAuditLogDocument>(
  {
    eventType: {
      type: String,
      required: true,
      enum: AUDIT_EVENT_TYPES,
      index: true,
    },
    action: {
      type: String,
      required: true,
      trim: true,
    },
    category: {
      type: String,
      required: true,
      enum: AUDIT_CATEGORIES,
      index: true,
    },
    adminId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true,
    },
    adminEmail: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      index: true,
    },
    adminName: {
      type: String,
      default: '',
      trim: true,
    },
    targetType: {
      type: String,
      required: true,
      index: true,
    },
    targetId: {
      type: String,
      default: null,
      index: true,
    },
    details: {
      type: Schema.Types.Mixed,
      default: {},
    },
    outcome: {
      type: String,
      required: true,
      enum: ['SUCCESS', 'FAILURE'],
      default: 'SUCCESS',
      index: true,
    },
    ipAddress: {
      type: String,
      default: '',
      trim: true,
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false }, // Immutable: no updatedAt
  }
);

// Compound indexes for efficient governance queries
AuditLogSchema.index({ createdAt: -1 });
AuditLogSchema.index({ category: 1, createdAt: -1 });
AuditLogSchema.index({ outcome: 1, createdAt: -1 });

// Static helper for recorded events
AuditLogSchema.statics.recordEvent = async function (
  eventData: Omit<IAuditLog, 'createdAt'>
): Promise<IAuditLogDocument | null> {
  try {
    // If database connection is not ready (e.g. in isolated unit tests), skip gracefully
    if (mongoose.connection.readyState !== 1) {
      return null;
    }
    return await this.create(eventData);
  } catch (err) {
    // Log error locally so primary administrative actions never fail if logging encounters an issue
    console.error('[AuditLog] Failed to record audit event:', err);
    return null;
  }
};

export const AuditLog: IAuditLogModel =
  (mongoose.models.AuditLog as IAuditLogModel) ||
  mongoose.model<IAuditLogDocument, IAuditLogModel>('AuditLog', AuditLogSchema);
