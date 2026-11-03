import { Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import { Booking } from '../models/Booking';
import { Review, MIN_RATING, MAX_RATING, MAX_REVIEW_TEXT_LENGTH } from '../models/Review';
import { User } from '../models/User';

/**
 * Helper to sanitize customer name for public display:
 * Converts full names like "Ramesh Sharma" to "Ramesh S." to protect customer privacy.
 */
export function sanitizeReviewerName(fullName?: string): string {
  if (!fullName || typeof fullName !== 'string') {
    return 'Verified Athlete';
  }
  const parts = fullName.trim().split(/\s+/);
  if (parts.length > 1) {
    const lastNameInitial = parts[parts.length - 1][0]?.toUpperCase() || '';
    return `${parts[0]} ${lastNameInitial}.`;
  }
  return parts[0] || 'Verified Athlete';
}

/**
 * Submit a rating & review for a completed booking.
 * POST /api/bookings/:id/review
 * Allowed roles: 'parent', 'individual' (Customer only).
 */
export async function submitBookingReview(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void | Response> {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required.' });
    }

    if (!['parent', 'individual'].includes(req.user.role)) {
      return res.status(403).json({
        error: 'Access forbidden. Only parents or individual trainees can submit reviews.',
      });
    }

    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: 'Invalid booking ID format.' });
    }

    // 1. Fetch the booking
    const booking = await Booking.findById(id);
    if (!booking) {
      return res.status(404).json({ error: 'Booking not found.' });
    }

    // 2. Customer ownership verification: Only the booking's customer can rate its coach
    const customerIdStr = (booking.customerId?._id || booking.customerId).toString();
    if (customerIdStr !== req.user.id) {
      return res.status(403).json({
        error: 'Access forbidden. You can only rate coaches for your own bookings.',
      });
    }

    // 3. Rating eligibility: Must be in 'completed' status
    if (booking.status !== 'completed') {
      return res.status(400).json({
        error: `Rating is only available for completed sessions. This booking is currently "${booking.status}".`,
      });
    }

    // 4. Validate rating input
    const { rating, reviewText } = req.body || {};
    if (rating === undefined || rating === null) {
      return res.status(400).json({ error: 'Rating is required.' });
    }

    const numericRating = Number(rating);
    if (!Number.isInteger(numericRating) || numericRating < MIN_RATING || numericRating > MAX_RATING) {
      return res.status(400).json({
        error: `Rating must be an integer between ${MIN_RATING} and ${MAX_RATING}.`,
      });
    }

    // 5. Validate optional review text
    let cleanReviewText: string | undefined = undefined;
    if (reviewText !== undefined && reviewText !== null) {
      if (typeof reviewText !== 'string') {
        return res.status(400).json({ error: 'Review text must be a string.' });
      }
      const trimmed = reviewText.trim();
      if (trimmed.length > MAX_REVIEW_TEXT_LENGTH) {
        return res.status(400).json({
          error: `Review text cannot exceed ${MAX_REVIEW_TEXT_LENGTH} characters.`,
        });
      }
      cleanReviewText = trimmed.length > 0 ? trimmed : undefined;
    }

    // 6. Check for duplicate review submission
    const existingReview = await Review.findOne({ bookingId: booking._id });
    if (existingReview) {
      return res.status(409).json({
        error: 'This booking has already been reviewed. Duplicate reviews are not permitted.',
      });
    }

    // 7. Persist review linked strictly to booking's assigned coach
    const coachId = booking.coachId?._id || booking.coachId;
    const review = await Review.create({
      bookingId: booking._id,
      customerId: booking.customerId,
      coachId,
      rating: numericRating,
      reviewText: cleanReviewText,
    });

    return res.status(201).json({
      message: 'Thank you! Your rating and review have been submitted successfully.',
      review: {
        _id: review._id.toString(),
        bookingId: review.bookingId.toString(),
        coachId: review.coachId.toString(),
        rating: review.rating,
        reviewText: review.reviewText,
        createdAt: review.createdAt,
      },
    });
  } catch (error: any) {
    // Handle database duplicate key error (E11000) for concurrency safety
    if (error && error.code === 11000) {
      return res.status(409).json({
        error: 'This booking has already been reviewed. Duplicate reviews are not permitted.',
      });
    }
    return next(error);
  }
}

/**
 * Retrieve review status for a specific booking.
 * GET /api/bookings/:id/review
 * Allowed roles: Participant (customer/coach) or Admin.
 */
export async function getBookingReview(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void | Response> {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required.' });
    }

    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: 'Invalid booking ID format.' });
    }

    const booking = await Booking.findById(id);
    if (!booking) {
      return res.status(404).json({ error: 'Booking not found.' });
    }

    const customerIdStr = (booking.customerId?._id || booking.customerId).toString();
    const coachIdStr = (booking.coachId?._id || booking.coachId).toString();
    const isParticipant = req.user.id === customerIdStr || req.user.id === coachIdStr;
    const isAdmin = req.user.role === 'admin';

    if (!isParticipant && !isAdmin) {
      return res.status(403).json({ error: 'Access forbidden. You are not a participant in this booking.' });
    }

    const review = await Review.findOne({ bookingId: booking._id });
    if (!review) {
      return res.status(200).json({
        isRated: false,
        review: null,
      });
    }

    return res.status(200).json({
      isRated: true,
      review: {
        _id: review._id.toString(),
        rating: review.rating,
        reviewText: review.reviewText,
        createdAt: review.createdAt,
      },
    });
  } catch (error) {
    return next(error);
  }
}

/**
 * Public Coach Reviews & Aggregates
 * GET /api/coaches/:id/reviews
 * Returns the average star rating, total review count, and sanitized customer reviews.
 */
export async function getCoachReviews(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void | Response> {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: 'Invalid coach ID format.' });
    }

    // Verify coach exists and is an active coach
    const coach = await User.findOne({ _id: id, role: 'coach', isActive: true });
    if (!coach) {
      return res.status(404).json({ error: 'Coach not found.' });
    }

    // Aggregate rating statistics
    const stats = await Review.aggregate([
      { $match: { coachId: new mongoose.Types.ObjectId(id) } },
      {
        $group: {
          _id: '$coachId',
          averageRating: { $avg: '$rating' },
          reviewCount: { $sum: 1 },
        },
      },
    ]);

    const averageRating =
      stats.length > 0 ? Math.round(stats[0].averageRating * 10) / 10 : 0;
    const reviewCount = stats.length > 0 ? stats[0].reviewCount : 0;

    // Fetch up to 20 most recent reviews with customer name populated
    const reviews = await Review.find({ coachId: id })
      .sort({ createdAt: -1 })
      .limit(20)
      .populate('customerId', 'name');

    const sanitizedReviews = reviews.map((r: any) => ({
      _id: r._id.toString(),
      rating: r.rating,
      reviewText: r.reviewText || '',
      customerName: sanitizeReviewerName(r.customerId?.name),
      createdAt: r.createdAt ? r.createdAt.toISOString() : new Date().toISOString(),
    }));

    return res.status(200).json({
      rating: {
        averageRating,
        reviewCount,
      },
      reviews: sanitizedReviews,
    });
  } catch (error) {
    return next(error);
  }
}

