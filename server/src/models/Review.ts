import mongoose, { Document, Schema, Model } from 'mongoose';

export const MIN_RATING = 1;
export const MAX_RATING = 5;
export const MAX_REVIEW_TEXT_LENGTH = 500;

export interface IReview {
  bookingId: mongoose.Types.ObjectId;
  customerId: mongoose.Types.ObjectId;
  coachId: mongoose.Types.ObjectId;
  rating: number; // Integer between 1 and 5
  reviewText?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface IReviewDocument extends IReview, Document {}

const ReviewSchema = new Schema<IReviewDocument>(
  {
    bookingId: {
      type: Schema.Types.ObjectId,
      ref: 'Booking',
      required: true,
      unique: true, // Guarantees database-level constraint: exactly one review per booking
      index: true,
    },
    customerId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    coachId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    rating: {
      type: Number,
      required: true,
      min: [MIN_RATING, `Rating must be at least ${MIN_RATING}.`],
      max: [MAX_RATING, `Rating cannot exceed ${MAX_RATING}.`],
      validate: {
        validator: Number.isInteger,
        message: 'Rating must be an integer value between 1 and 5.',
      },
    },
    reviewText: {
      type: String,
      trim: true,
      maxlength: [
        MAX_REVIEW_TEXT_LENGTH,
        `Review text cannot exceed ${MAX_REVIEW_TEXT_LENGTH} characters.`,
      ],
      default: undefined,
    },
  },
  {
    timestamps: true,
    bufferCommands: false,
  }
);

// Compound index for querying coach reviews sorted by newest
ReviewSchema.index({ coachId: 1, createdAt: -1 });

export const Review: Model<IReviewDocument> =
  mongoose.models.Review || mongoose.model<IReviewDocument>('Review', ReviewSchema);
