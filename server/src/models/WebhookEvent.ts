import mongoose, { Document, Schema, Model } from 'mongoose';

export const WEBHOOK_EVENT_STATUSES = ['processing', 'completed', 'failed'] as const;
export type WebhookEventStatus = (typeof WEBHOOK_EVENT_STATUSES)[number];

export interface IWebhookEvent {
  eventId: string;
  event: string;
  orderId?: string;
  paymentId?: string;
  status: WebhookEventStatus;
  processedAt?: Date;
  error?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface IWebhookEventDocument extends IWebhookEvent, Document {}

const WebhookEventSchema = new Schema<IWebhookEventDocument>(
  {
    eventId: {
      type: String,
      required: [true, 'Webhook event ID is required.'],
      unique: true,
      index: true,
      trim: true,
    },
    event: {
      type: String,
      required: [true, 'Event type is required.'],
      trim: true,
    },
    orderId: {
      type: String,
      index: true,
      trim: true,
    },
    paymentId: {
      type: String,
      index: true,
      trim: true,
    },
    status: {
      type: String,
      enum: {
        values: WEBHOOK_EVENT_STATUSES,
        message: 'Invalid webhook event status "{VALUE}".',
      },
      default: 'processing',
      required: true,
      index: true,
    },
    processedAt: {
      type: Date,
    },
    error: {
      type: String,
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

// TTL index to automatically prune processed webhook events after 30 days
WebhookEventSchema.index({ createdAt: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60 });

export const WebhookEvent: Model<IWebhookEventDocument> =
  (mongoose.models.WebhookEvent as Model<IWebhookEventDocument>) ||
  mongoose.model<IWebhookEventDocument>('WebhookEvent', WebhookEventSchema);
