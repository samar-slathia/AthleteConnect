import mongoose, { Document, Schema, Model } from 'mongoose';
import { ALL_ROLES, UserRole } from './User';

export const MIN_MESSAGE_LENGTH = 1;
export const MAX_MESSAGE_LENGTH = 1000;

export interface IBookingMessage {
  bookingId: mongoose.Types.ObjectId;
  senderId: mongoose.Types.ObjectId;
  senderRole: UserRole;
  senderName: string;
  text: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface IBookingMessageDocument extends IBookingMessage, Document {}

const BookingMessageSchema = new Schema<IBookingMessageDocument>(
  {
    bookingId: {
      type: Schema.Types.ObjectId,
      ref: 'Booking',
      required: [true, 'Booking ID is required.'],
      immutable: true,
      index: true,
    },
    senderId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Sender ID is required.'],
      immutable: true,
      index: true,
    },
    senderRole: {
      type: String,
      required: [true, 'Sender role is required.'],
      enum: {
        values: ALL_ROLES,
        message: 'Invalid sender role "{VALUE}".',
      },
      immutable: true,
    },
    senderName: {
      type: String,
      required: [true, 'Sender name is required.'],
      trim: true,
      minlength: 1,
      maxlength: [100, 'Sender name cannot exceed 100 characters.'],
      immutable: true,
    },
    text: {
      type: String,
      required: [true, 'Message text is required.'],
      trim: true,
      minlength: [MIN_MESSAGE_LENGTH, `Message must be at least ${MIN_MESSAGE_LENGTH} character.`],
      maxlength: [MAX_MESSAGE_LENGTH, `Message cannot exceed ${MAX_MESSAGE_LENGTH} characters.`],
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
    toObject: {
      transform: (_doc, ret: Record<string, unknown>) => {
        delete ret.__v;
        return ret;
      },
    },
  }
);

// Compound index for fast chronological conversation retrieval
BookingMessageSchema.index({ bookingId: 1, createdAt: 1 });

export const BookingMessage: Model<IBookingMessageDocument> =
  (mongoose.models.BookingMessage as Model<IBookingMessageDocument>) ||
  mongoose.model<IBookingMessageDocument>('BookingMessage', BookingMessageSchema);
