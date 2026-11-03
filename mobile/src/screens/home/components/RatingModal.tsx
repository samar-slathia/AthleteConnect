import React, { useState, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { X, Star, AlertCircle, CheckCircle } from 'lucide-react-native';
import {
  BookingItem,
  BookingReview,
  submitBookingReview,
} from '../../../services/bookingApi';
import { COLORS, RADII, SPACING, TYPOGRAPHY } from '../../../theme/tokens';

export interface RatingModalProps {
  visible: boolean;
  onClose: () => void;
  booking: BookingItem | null;
  token?: string | null;
  onSuccess?: (bookingId: string, review: BookingReview) => void;
}

const RATING_LABELS: Record<number, string> = {
  1: 'Poor',
  2: 'Fair',
  3: 'Good',
  4: 'Very Good',
  5: 'Excellent',
};

export const RatingModal: React.FC<RatingModalProps> = ({
  visible,
  onClose,
  booking,
  token,
  onSuccess,
}) => {
  const [selectedRating, setSelectedRating] = useState<number>(0);
  const [reviewText, setReviewText] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState<boolean>(false);

  // Reset form when modal opens with a new booking
  useEffect(() => {
    if (visible) {
      if (booking?.review) {
        setSelectedRating(booking.review.rating || 5);
        setReviewText(booking.review.reviewText || '');
        setIsSuccess(false);
      } else {
        setSelectedRating(0);
        setReviewText('');
        setIsSuccess(false);
      }
      setErrorMessage(null);
    }
  }, [visible, booking]);

  if (!booking) return null;

  const isAlreadyRated = Boolean(booking.isRated || booking.review);

  const handleSubmit = async () => {
    if (selectedRating < 1 || selectedRating > 5) {
      setErrorMessage('Please select a star rating (1–5) to submit.');
      return;
    }

    if (!token) {
      setErrorMessage('Authentication required. Please sign in again.');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const res = await submitBookingReview(
        booking._id,
        {
          rating: selectedRating,
          reviewText: reviewText.trim() ? reviewText.trim() : undefined,
        },
        token
      );

      setIsSuccess(true);
      if (onSuccess && res.review) {
        onSuccess(booking._id, res.review);
      }

      // Automatically dismiss modal after short delay
      setTimeout(() => {
        onClose();
      }, 1500);
    } catch (err: any) {
      setErrorMessage(err?.message || 'Failed to submit review. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent={true}
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        style={styles.modalOverlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.modalContent} testID="rating-modal">
          {/* Header Bar */}
          <View style={styles.headerBar}>
            <Text style={styles.headerTitle}>
              {isAlreadyRated ? 'Session Rating' : 'Rate Your Coach'}
            </Text>
            <TouchableOpacity
              onPress={onClose}
              style={styles.closeBtn}
              accessibilityLabel="Close rating modal"
              accessibilityRole="button"
              testID="button-close-rating"
            >
              <X size={20} color={COLORS.navy} />
            </TouchableOpacity>
          </View>

          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.scrollContent}
          >
            {isSuccess ? (
              /* Success View */
              <View style={styles.successContainer} testID="rating-success-view">
                <CheckCircle size={48} color={COLORS.success} />
                <Text style={styles.successHeading}>Thank You!</Text>
                <Text style={styles.successSubtext}>
                  Your rating and feedback have been submitted successfully.
                </Text>
              </View>
            ) : (
              /* Rating Form */
              <View>
                {/* Coach & Session Context */}
                <View style={styles.contextCard}>
                  <Text style={styles.contextCoachName} testID="rating-coach-name">
                    Coach: {booking.coachName || 'Assigned Coach'}
                  </Text>
                  <Text style={styles.contextSessionDetails}>
                    {booking.sport?.toUpperCase()} • {booking.date} ({booking.startTime} – {booking.endTime})
                  </Text>
                </View>

                {isAlreadyRated ? (
                  <View style={styles.alreadyRatedBanner} testID="already-rated-banner">
                    <Text style={styles.alreadyRatedTitle}>You Rated This Session</Text>
                    <View style={styles.starsRow}>
                      {[1, 2, 3, 4, 5].map((star) => (
                        <Star
                          key={star}
                          size={28}
                          color={star <= selectedRating ? '#F59E0B' : '#D1D5DB'}
                          fill={star <= selectedRating ? '#F59E0B' : 'transparent'}
                        />
                      ))}
                    </View>
                    {booking.review?.reviewText ? (
                      <Text style={styles.alreadyRatedReviewText}>
                        "{booking.review.reviewText}"
                      </Text>
                    ) : null}
                  </View>
                ) : (
                  <>
                    {/* Star Rating Prompt */}
                    <Text style={styles.promptHeading}>How was your training session?</Text>

                    {/* Interactive Stars Row */}
                    <View style={styles.starsRow} testID="rating-stars-row">
                      {[1, 2, 3, 4, 5].map((star) => {
                        const isSelected = star <= selectedRating;
                        return (
                          <TouchableOpacity
                            key={star}
                            onPress={() => setSelectedRating(star)}
                            style={styles.starBtn}
                            accessibilityRole="button"
                            accessibilityLabel={`Rate ${star} star${star > 1 ? 's' : ''}`}
                            testID={`button-star-${star}`}
                          >
                            <Star
                              size={34}
                              color={isSelected ? '#F59E0B' : '#D1D5DB'}
                              fill={isSelected ? '#F59E0B' : 'transparent'}
                            />
                          </TouchableOpacity>
                        );
                      })}
                    </View>

                    {/* Star Label */}
                    <Text style={styles.ratingLabelText} testID="rating-label">
                      {selectedRating > 0 ? RATING_LABELS[selectedRating] : 'Tap a star to rate'}
                    </Text>

                    {/* Optional Written Review Input */}
                    <View style={styles.inputContainer}>
                      <Text style={styles.inputLabel}>Written Review (Optional)</Text>
                      <TextInput
                        style={styles.reviewTextInput}
                        placeholder="Share your experience with Coach (optional)..."
                        placeholderTextColor={COLORS.textMuted}
                        multiline={true}
                        numberOfLines={4}
                        maxLength={500}
                        value={reviewText}
                        onChangeText={setReviewText}
                        textAlignVertical="top"
                        testID="input-review-text"
                      />
                      <Text style={styles.charCounter}>{reviewText.length}/500</Text>
                    </View>

                    {/* Error Banner */}
                    {errorMessage ? (
                      <View style={styles.errorBanner} testID="rating-error-banner">
                        <AlertCircle size={14} color="#DC2626" style={styles.errorIcon} />
                        <Text style={styles.errorText}>{errorMessage}</Text>
                      </View>
                    ) : null}

                    {/* Action Buttons */}
                    <View style={styles.actionRow}>
                      <TouchableOpacity
                        style={styles.dismissBtn}
                        onPress={onClose}
                        accessibilityRole="button"
                        accessibilityLabel="Not now"
                        testID="button-not-now"
                      >
                        <Text style={styles.dismissBtnText}>Not now</Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={[
                          styles.submitBtn,
                          (selectedRating === 0 || isSubmitting) && styles.submitBtnDisabled,
                        ]}
                        onPress={handleSubmit}
                        disabled={selectedRating === 0 || isSubmitting}
                        accessibilityRole="button"
                        accessibilityLabel="Submit Rating"
                        testID="button-submit-rating"
                      >
                        {isSubmitting ? (
                          <ActivityIndicator size="small" color={COLORS.navy} />
                        ) : (
                          <Text style={styles.submitBtnText}>Submit Review</Text>
                        )}
                      </TouchableOpacity>
                    </View>
                  </>
                )}
              </View>
            )}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(16, 28, 44, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING.lg,
  },
  modalContent: {
    backgroundColor: COLORS.white,
    borderRadius: RADII.lg,
    width: '100%',
    maxWidth: 440,
    maxHeight: '90%',
    overflow: 'hidden',
    shadowColor: COLORS.navy,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    backgroundColor: COLORS.mist,
  },
  headerTitle: {
    ...TYPOGRAPHY.h3,
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.navy,
  },
  closeBtn: {
    padding: 6,
    borderRadius: RADII.full,
  },
  scrollContent: {
    padding: SPACING.lg,
  },
  contextCard: {
    backgroundColor: COLORS.mist,
    padding: SPACING.md,
    borderRadius: RADII.md,
    marginBottom: SPACING.lg,
  },
  contextCoachName: {
    ...TYPOGRAPHY.body,
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.navy,
  },
  contextSessionDetails: {
    ...TYPOGRAPHY.caption,
    color: COLORS.textSecondary,
    marginTop: 4,
  },
  promptHeading: {
    ...TYPOGRAPHY.body,
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.navy,
    textAlign: 'center',
    marginBottom: SPACING.md,
  },
  starsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 10,
    marginVertical: SPACING.sm,
  },
  starBtn: {
    padding: 6,
  },
  ratingLabelText: {
    ...TYPOGRAPHY.caption,
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.orange,
    textAlign: 'center',
    marginBottom: SPACING.lg,
    minHeight: 20,
  },
  inputContainer: {
    marginBottom: SPACING.md,
  },
  inputLabel: {
    ...TYPOGRAPHY.caption,
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.navy,
    marginBottom: 6,
  },
  reviewTextInput: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADII.md,
    padding: SPACING.md,
    fontSize: 14,
    color: COLORS.navy,
    minHeight: 90,
    backgroundColor: COLORS.white,
  },
  charCounter: {
    ...TYPOGRAPHY.caption,
    fontSize: 11,
    color: COLORS.textMuted,
    textAlign: 'right',
    marginTop: 4,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEE2E2',
    padding: SPACING.sm,
    borderRadius: RADII.sm,
    marginBottom: SPACING.md,
  },
  errorIcon: {
    marginRight: 6,
  },
  errorText: {
    ...TYPOGRAPHY.caption,
    fontSize: 12,
    color: '#DC2626',
    flex: 1,
  },
  actionRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: SPACING.sm,
    marginTop: SPACING.sm,
  },
  dismissBtn: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: RADII.md,
  },
  dismissBtnText: {
    ...TYPOGRAPHY.caption,
    fontSize: 13,
    color: COLORS.textSecondary,
    fontWeight: '600',
  },
  submitBtn: {
    backgroundColor: COLORS.orange,
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: RADII.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitBtnDisabled: {
    opacity: 0.5,
  },
  submitBtnText: {
    ...TYPOGRAPHY.body,
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.navy,
  },
  successContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING.xl,
  },
  successHeading: {
    ...TYPOGRAPHY.h3,
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.navy,
    marginTop: SPACING.md,
  },
  successSubtext: {
    ...TYPOGRAPHY.caption,
    fontSize: 13,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginTop: SPACING.xs,
    paddingHorizontal: SPACING.md,
  },
  alreadyRatedBanner: {
    alignItems: 'center',
    paddingVertical: SPACING.lg,
  },
  alreadyRatedTitle: {
    ...TYPOGRAPHY.body,
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.navy,
    marginBottom: SPACING.sm,
  },
  alreadyRatedReviewText: {
    ...TYPOGRAPHY.caption,
    fontSize: 13,
    color: COLORS.textSecondary,
    fontStyle: 'italic',
    textAlign: 'center',
    marginTop: SPACING.sm,
    paddingHorizontal: SPACING.md,
  },
});

