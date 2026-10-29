import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ArrowLeft,
  Check,
  Plus,
  Trash2,
  X,
  AlertCircle,
  CheckCircle2,
  Clock,
  Calendar,
  Globe,
  RefreshCw,
  Sparkles,
} from 'lucide-react-native';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/Button';
import { Badge } from '../components/Badge';
import { COLORS, RADII, SPACING, TYPOGRAPHY } from '../theme/tokens';
import {
  getCoachAvailability,
  updateCoachAvailability,
  DAYS_OF_WEEK,
  DEFAULT_TIMEZONE,
  MIN_SLOT_DURATION_MINUTES,
  MAX_SLOTS_PER_DAY,
  MAX_TOTAL_SLOTS,
  MAX_UNAVAILABLE_DATES,
  TIME_REGEX,
  DATE_REGEX,
  timeToMinutes,
  isValidCalendarDate,
  areValidSlots,
  areValidUnavailableDates,
  DayOfWeek,
  AvailabilitySlot,
  CoachAvailability,
  UpdateCoachAvailabilityInput,
  AuthApiError,
} from '../services/availabilityApi';

export interface CoachAvailabilityScreenProps {
  onBack?: () => void;
  navigation?: any;
}

const DAY_LABELS: Record<DayOfWeek, { short: string; full: string }> = {
  monday: { short: 'Mon', full: 'Monday' },
  tuesday: { short: 'Tue', full: 'Tuesday' },
  wednesday: { short: 'Wed', full: 'Wednesday' },
  thursday: { short: 'Thu', full: 'Thursday' },
  friday: { short: 'Fri', full: 'Friday' },
  saturday: { short: 'Sat', full: 'Saturday' },
  sunday: { short: 'Sun', full: 'Sunday' },
};

/** Quick-preset suggestion windows for convenient slot entry */
const QUICK_PRESETS = [
  { label: 'Morning (08:00–11:00)', start: '08:00', end: '11:00' },
  { label: 'Afternoon (14:00–17:00)', start: '14:00', end: '17:00' },
  { label: 'Evening (18:00–21:00)', start: '18:00', end: '21:00' },
];

/**
 * Normalizes single-digit hour input (e.g. "9:00" -> "09:00")
 */
function normalizeTime(val: string): string {
  const trimmed = val.trim();
  if (/^\d:[0-5]\d$/.test(trimmed)) {
    return `0${trimmed}`;
  }
  return trimmed;
}

/**
 * Calculates human-readable duration between two 24h time strings
 */
function formatDuration(startTime: string, endTime: string): string {
  const startM = timeToMinutes(startTime);
  const endM = timeToMinutes(endTime);
  const diff = endM - startM;
  if (diff <= 0) return '';
  const hours = Math.floor(diff / 60);
  const mins = diff % 60;
  if (hours > 0 && mins > 0) return `${hours}h ${mins}m`;
  if (hours > 0) return `${hours} hr${hours > 1 ? 's' : ''}`;
  return `${mins} mins`;
}

export const CoachAvailabilityScreen: React.FC<CoachAvailabilityScreenProps> = ({
  onBack,
  navigation,
}) => {
  const insets = useSafeAreaInsets();
  const { token } = useAuth();

  // Screen lifecycle & network state
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);

  // Availability schedule model state
  const [slots, setSlots] = useState<AvailabilitySlot[]>([]);
  const [timezone, setTimezone] = useState<string>(DEFAULT_TIMEZONE);
  const [unavailableDates, setUnavailableDates] = useState<string[]>([]);
  const [isConfigured, setIsConfigured] = useState<boolean>(false);

  // Active day selection for viewing & editing slots
  const [selectedDay, setSelectedDay] = useState<DayOfWeek>('monday');

  // New slot entry form state
  const [newStartTime, setNewStartTime] = useState<string>('');
  const [newEndTime, setNewEndTime] = useState<string>('');
  const [slotError, setSlotError] = useState<string | null>(null);

  // Blackout date entry form state
  const [newUnavailableDate, setNewUnavailableDate] = useState<string>('');
  const [dateError, setDateError] = useState<string | null>(null);

  // Unmounted lifecycle guard & concurrent submission guard
  const isMountedRef = useRef<boolean>(true);
  const isSavingRef = useRef<boolean>(false);

  // Load existing availability from backend
  const loadAvailability = useCallback(async () => {
    if (!token) {
      setFetchError('Authentication required. Missing token.');
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setFetchError(null);

    try {
      const response = await getCoachAvailability(token);
      if (!isMountedRef.current) return;

      if (response.availability) {
        setSlots(response.availability.slots || []);
        setTimezone(response.availability.timezone || DEFAULT_TIMEZONE);
        setUnavailableDates(response.availability.unavailableDates || []);
        setIsConfigured(response.isConfigured);
      } else {
        // Unconfigured new coach
        setSlots([]);
        setTimezone(DEFAULT_TIMEZONE);
        setUnavailableDates([]);
        setIsConfigured(false);
      }
    } catch (err) {
      if (!isMountedRef.current) return;
      const message =
        err instanceof AuthApiError
          ? err.message
          : 'Unable to load coach availability. Please try again.';
      setFetchError(message);
    } finally {
      if (isMountedRef.current) {
        setIsLoading(false);
      }
    }
  }, [token]);

  useEffect(() => {
    isMountedRef.current = true;
    loadAvailability();
    return () => {
      isMountedRef.current = false;
    };
  }, [loadAvailability]);

  const handleBack = () => {
    if (onBack) {
      onBack();
    } else if (navigation && typeof navigation.goBack === 'function') {
      navigation.goBack();
    }
  };

  // Filter slots for the currently selected day, sorted chronologically in ascending order
  const currentDaySlots = slots
    .filter((s) => s.dayOfWeek === selectedDay)
    .sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime));

  // Total weekly coaching hours
  const totalWeeklyMinutes = slots.reduce((total, s) => {
    return total + (timeToMinutes(s.endTime) - timeToMinutes(s.startTime));
  }, 0);
  const totalWeeklyHours = (totalWeeklyMinutes / 60).toFixed(1);

  // Handle adding a new time slot
  const handleAddSlot = () => {
    setSlotError(null);

    const normStart = normalizeTime(newStartTime);
    const normEnd = normalizeTime(newEndTime);

    // 1. Validate 24h format
    if (!TIME_REGEX.test(normStart)) {
      setSlotError('Invalid start time. Use 24-hour HH:mm format (e.g. 09:00).');
      return;
    }
    if (!TIME_REGEX.test(normEnd)) {
      setSlotError('Invalid end time. Use 24-hour HH:mm format (e.g. 12:00).');
      return;
    }

    const startMinutes = timeToMinutes(normStart);
    const endMinutes = timeToMinutes(normEnd);

    // 2. Validate chronology
    if (endMinutes <= startMinutes) {
      setSlotError(
        `End time (${normEnd}) must be after start time (${normStart}) within the same day.`
      );
      return;
    }

    // 3. Minimum duration check
    const duration = endMinutes - startMinutes;
    if (duration < MIN_SLOT_DURATION_MINUTES) {
      setSlotError(
        `Slot duration (${duration} mins) must be at least ${MIN_SLOT_DURATION_MINUTES} minutes.`
      );
      return;
    }

    // 4. Maximum slots per day limit
    if (currentDaySlots.length >= MAX_SLOTS_PER_DAY) {
      setSlotError(
        `Maximum ${MAX_SLOTS_PER_DAY} slots allowed for ${DAY_LABELS[selectedDay].full}.`
      );
      return;
    }

    // 5. Maximum total slots limit
    if (slots.length >= MAX_TOTAL_SLOTS) {
      setSlotError(`Maximum ${MAX_TOTAL_SLOTS} total slots allowed across the week.`);
      return;
    }

    // 6. Overlap detection against existing slots on the same day
    // Note: adjacent slots meeting at boundary (e.g. 09:00-12:00 and 12:00-15:00) ARE permitted
    for (const existing of currentDaySlots) {
      const existStart = timeToMinutes(existing.startTime);
      const existEnd = timeToMinutes(existing.endTime);

      if (startMinutes < existEnd && endMinutes > existStart) {
        setSlotError(
          `Slot conflicts with existing ${DAY_LABELS[selectedDay].full} slot (${existing.startTime}–${existing.endTime}).`
        );
        return;
      }
    }

    // All checks passed: append new slot
    const newSlot: AvailabilitySlot = {
      dayOfWeek: selectedDay,
      startTime: normStart,
      endTime: normEnd,
    };

    setSlots((prev) => [...prev, newSlot]);
    setNewStartTime('');
    setNewEndTime('');
    setSlotError(null);
    if (saveSuccess) setSaveSuccess(null);
  };

  // Handle removing a slot
  const handleRemoveSlot = (slotToRemove: AvailabilitySlot) => {
    setSlots((prev) =>
      prev.filter(
        (s) =>
          !(
            s.dayOfWeek === slotToRemove.dayOfWeek &&
            s.startTime === slotToRemove.startTime &&
            s.endTime === slotToRemove.endTime
          )
      )
    );
    if (saveSuccess) setSaveSuccess(null);
  };

  // Quick preset applicator
  const applyPreset = (preset: { start: string; end: string }) => {
    setNewStartTime(preset.start);
    setNewEndTime(preset.end);
    setSlotError(null);
  };

  // Handle adding an unavailable blackout date
  const handleAddUnavailableDate = () => {
    setDateError(null);
    const trimmed = newUnavailableDate.trim();

    if (!trimmed) {
      setDateError('Please enter a date in YYYY-MM-DD format.');
      return;
    }

    if (!DATE_REGEX.test(trimmed) || !isValidCalendarDate(trimmed)) {
      setDateError(
        `Invalid calendar date "${trimmed}". Must be a real date in YYYY-MM-DD format (e.g. 2026-11-20).`
      );
      return;
    }

    if (unavailableDates.includes(trimmed)) {
      setDateError(`Date "${trimmed}" is already added to blackout dates.`);
      return;
    }

    if (unavailableDates.length >= MAX_UNAVAILABLE_DATES) {
      setDateError(`Maximum ${MAX_UNAVAILABLE_DATES} blackout dates allowed.`);
      return;
    }

    setUnavailableDates((prev) => [...prev, trimmed]);
    setNewUnavailableDate('');
    setDateError(null);
    if (saveSuccess) setSaveSuccess(null);
  };

  // Handle removing an unavailable blackout date
  const handleRemoveUnavailableDate = (dateToRemove: string) => {
    setUnavailableDates((prev) => prev.filter((d) => d !== dateToRemove));
    if (saveSuccess) setSaveSuccess(null);
  };

  // Save full schedule to backend
  const handleSave = async () => {
    if (isSavingRef.current) return;
    if (isLoading || fetchError) return;

    // Validate full arrays with domain validators
    if (!areValidSlots(slots)) {
      setSaveError('Please ensure all slots meet duration, format, and overlap requirements.');
      return;
    }

    if (!areValidUnavailableDates(unavailableDates)) {
      setSaveError('Please ensure all blackout dates are valid calendar dates.');
      return;
    }

    isSavingRef.current = true;
    setIsSaving(true);
    setSaveError(null);
    setSaveSuccess(null);

    const payload: UpdateCoachAvailabilityInput = {
      slots,
      timezone,
      unavailableDates,
    };

    try {
      const response = await updateCoachAvailability(token!, payload);
      if (!isMountedRef.current) return;

      if (response.availability) {
        setSlots(response.availability.slots);
        setTimezone(response.availability.timezone);
        setUnavailableDates(response.availability.unavailableDates);
        setIsConfigured(response.isConfigured);
      }
      setSaveSuccess(response.message || 'Availability schedule saved successfully.');
      setSaveError(null);
    } catch (err) {
      if (!isMountedRef.current) return;
      const message =
        err instanceof AuthApiError
          ? err.message
          : 'Unable to save availability schedule. Please try again.';
      setSaveError(message);
      setSaveSuccess(null);
    } finally {
      isSavingRef.current = false;
      if (isMountedRef.current) {
        setIsSaving(false);
      }
    }
  };

  // Loading State
  if (isLoading) {
    return (
      <View
        style={[styles.container, styles.centerContainer, { paddingTop: insets.top }]}
        testID="availability-loading-indicator"
      >
        <ActivityIndicator size="large" color={COLORS.navy} />
        <Text style={styles.loadingText}>Loading coach availability...</Text>
      </View>
    );
  }

  // Fetch Error State with Retry
  if (fetchError) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        {/* Top Header */}
        <View style={styles.topBar}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={handleBack}
            accessibilityRole="button"
            accessibilityLabel="Back to coach dashboard"
            testID="availability-back-button"
          >
            <ArrowLeft size={20} color={COLORS.navy} />
          </TouchableOpacity>
          <Text style={styles.topBarTitle}>Weekly Availability</Text>
          <View style={styles.topBarSpacer} />
        </View>

        <View style={[styles.centerContainer, styles.errorContainer]}>
          <View style={styles.errorIconWrap}>
            <AlertCircle size={32} color="#DC2626" />
          </View>
          <Text style={styles.errorTitle}>Unable to Load Availability</Text>
          <Text style={styles.errorDescription}>{fetchError}</Text>
          <View testID="retry-button">
            <Button
              title="Retry"
              variant="primary"
              onPress={loadAvailability}
              icon={<RefreshCw size={16} color={COLORS.navy} />}
              style={styles.retryButton}
            />
          </View>
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={[styles.innerContainer, { paddingTop: insets.top }]}>
        {/* Top Header */}
        <View style={styles.topBar}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={handleBack}
            accessibilityRole="button"
            accessibilityLabel="Back to coach dashboard"
            testID="availability-back-button"
          >
            <ArrowLeft size={20} color={COLORS.navy} />
          </TouchableOpacity>
          <View style={styles.topBarCenter}>
            <Text style={styles.topBarTitle}>Weekly Availability</Text>
            <Text style={styles.topBarSubtitle}>Recurring Schedule & Dates</Text>
          </View>
          <Badge
            label={isConfigured ? 'Configured' : 'Setup Required'}
            variant={isConfigured ? 'success' : 'demo'}
          />
        </View>

        <ScrollView
          contentContainerStyle={[
            styles.scrollContent,
            { paddingBottom: insets.bottom + SPACING.xxxl },
          ]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* First-Time Guidance Banner for Unconfigured Schedule */}
          {!isConfigured && (
            <View style={styles.guidanceBanner} testID="new-availability-guidance">
              <View style={styles.guidanceIconWrap}>
                <Sparkles size={20} color={COLORS.navy} />
              </View>
              <View style={styles.guidanceContent}>
                <Text style={styles.guidanceTitle}>Configure Your Weekly Windows</Text>
                <Text style={styles.guidanceText}>
                  Set recurring training hours for Monday through Sunday. Trainees will see your
                  available times once scheduling launches. You can also specify blackout dates for
                  competitions or travel.
                </Text>
              </View>
            </View>
          )}

          {/* Schedule Summary Stats Card */}
          <View style={styles.statsCard}>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{slots.length}</Text>
              <Text style={styles.statLabel}>Total Slots ({slots.length}/{MAX_TOTAL_SLOTS})</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{totalWeeklyHours}h</Text>
              <Text style={styles.statLabel}>Weekly Time</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{unavailableDates.length}</Text>
              <Text style={styles.statLabel}>Blackout Dates</Text>
            </View>
          </View>

          {/* Timezone Indicator */}
          <View style={styles.timezoneCard}>
            <View style={styles.timezoneRow}>
              <Globe size={16} color={COLORS.textSecondary} />
              <Text style={styles.timezoneLabel}>Timezone:</Text>
              <Text style={styles.timezoneValue}>{timezone}</Text>
            </View>
            <Badge label="Standard" variant="demo" />
          </View>

          {/* Days of Week Tab Bar */}
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionHeader}>SELECT DAY OF WEEK</Text>
          </View>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.daySelectorScroll}
          >
            {DAYS_OF_WEEK.map((day) => {
              const isSelected = selectedDay === day;
              const daySlotCount = slots.filter((s) => s.dayOfWeek === day).length;

              return (
                <TouchableOpacity
                  key={day}
                  onPress={() => {
                    setSelectedDay(day);
                    setSlotError(null);
                  }}
                  style={[
                    styles.dayTab,
                    isSelected ? styles.dayTabSelected : styles.dayTabUnselected,
                  ]}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: isSelected }}
                  accessibilityLabel={`${DAY_LABELS[day].full}, ${daySlotCount} slots configured`}
                  testID={`day-tab-${day}`}
                  activeOpacity={0.7}
                >
                  <Text
                    style={[
                      styles.dayTabShort,
                      isSelected ? styles.dayTabShortSelected : styles.dayTabShortUnselected,
                    ]}
                  >
                    {DAY_LABELS[day].short}
                  </Text>
                  <View
                    style={[
                      styles.dayCountBadge,
                      isSelected
                        ? styles.dayCountBadgeSelected
                        : styles.dayCountBadgeUnselected,
                    ]}
                  >
                    <Text
                      style={[
                        styles.dayCountText,
                        isSelected
                          ? styles.dayCountTextSelected
                          : styles.dayCountTextUnselected,
                      ]}
                    >
                      {daySlotCount}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {/* Active Day Slots List */}
          <View style={styles.daySlotsSection}>
            <View style={styles.daySlotsHeaderRow}>
              <View style={styles.dayTitleGroup}>
                <Clock size={16} color={COLORS.navy} />
                <Text style={styles.daySlotsTitle}>
                  {DAY_LABELS[selectedDay].full} Slots ({currentDaySlots.length}/{MAX_SLOTS_PER_DAY})
                </Text>
              </View>
              {currentDaySlots.length >= MAX_SLOTS_PER_DAY && (
                <Badge label="Max 4 Reached" variant="demo" />
              )}
            </View>

            {currentDaySlots.length === 0 ? (
              <View style={styles.emptyDayBox}>
                <Text style={styles.emptyDayText}>
                  No availability slots configured for {DAY_LABELS[selectedDay].full}.
                </Text>
                <Text style={styles.emptyDaySubtext}>
                  Add your coaching hours below to open this day for bookings.
                </Text>
              </View>
            ) : (
              <View style={styles.slotCardsList}>
                {currentDaySlots.map((slot, index) => {
                  const duration = formatDuration(slot.startTime, slot.endTime);
                  return (
                    <View
                      key={`${slot.dayOfWeek}-${slot.startTime}-${slot.endTime}-${index}`}
                      style={styles.slotCard}
                    >
                      <View style={styles.slotInfo}>
                        <View style={styles.slotTimeRow}>
                          <Clock size={15} color={COLORS.navy} />
                          <Text style={styles.slotTimeRange}>
                            {`${slot.startTime} – ${slot.endTime}`}
                          </Text>
                          {duration ? (
                            <Text style={styles.slotDuration}>({duration})</Text>
                          ) : null}
                        </View>
                        <Text style={styles.slotDaySub}>{DAY_LABELS[slot.dayOfWeek].full}</Text>
                      </View>
                      <TouchableOpacity
                        style={styles.removeSlotButton}
                        onPress={() => handleRemoveSlot(slot)}
                        accessibilityRole="button"
                        accessibilityLabel={`Remove slot ${slot.startTime} to ${slot.endTime} on ${DAY_LABELS[slot.dayOfWeek].full}`}
                        testID={`remove-slot-${slot.dayOfWeek}-${slot.startTime}`}
                        activeOpacity={0.7}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        <Trash2 size={16} color="#EF4444" />
                      </TouchableOpacity>
                    </View>
                  );
                })}
              </View>
            )}

            {/* Add Slot Input Section */}
            <View style={styles.addSlotBox}>
              <Text style={styles.addSlotHeading}>
                Add Slot for {DAY_LABELS[selectedDay].full}
              </Text>

              {/* Quick Presets */}
              <View style={styles.presetsRow}>
                {QUICK_PRESETS.map((preset) => (
                  <TouchableOpacity
                    key={preset.label}
                    style={styles.presetChip}
                    onPress={() => applyPreset(preset)}
                    activeOpacity={0.7}
                    accessibilityRole="button"
                    accessibilityLabel={`Apply preset ${preset.label}`}
                  >
                    <Text style={styles.presetChipText}>{preset.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Manual Time Input Row */}
              <View style={styles.timeInputRow}>
                <View style={styles.timeFieldGroup}>
                  <Text style={styles.fieldLabel}>Start Time (HH:mm)</Text>
                  <TextInput
                    style={styles.timeInput}
                    placeholder="09:00"
                    placeholderTextColor={COLORS.textMuted}
                    value={newStartTime}
                    onChangeText={(val) => {
                      setNewStartTime(val);
                      if (slotError) setSlotError(null);
                    }}
                    maxLength={5}
                    autoCapitalize="none"
                    autoCorrect={false}
                    accessibilityLabel="Start time in 24-hour HH:mm format"
                    testID="input-start-time"
                  />
                </View>

                <View style={styles.timeFieldSeparator}>
                  <Text style={styles.timeToText}>to</Text>
                </View>

                <View style={styles.timeFieldGroup}>
                  <Text style={styles.fieldLabel}>End Time (HH:mm)</Text>
                  <TextInput
                    style={styles.timeInput}
                    placeholder="12:00"
                    placeholderTextColor={COLORS.textMuted}
                    value={newEndTime}
                    onChangeText={(val) => {
                      setNewEndTime(val);
                      if (slotError) setSlotError(null);
                    }}
                    maxLength={5}
                    autoCapitalize="none"
                    autoCorrect={false}
                    accessibilityLabel="End time in 24-hour HH:mm format"
                    testID="input-end-time"
                  />
                </View>
              </View>

              {/* Slot Validation Error Message */}
              {slotError && (
                <View style={styles.fieldErrorRow} testID="slot-error">
                  <AlertCircle size={14} color="#EF4444" />
                  <Text style={styles.fieldErrorText}>{slotError}</Text>
                </View>
              )}

              <View style={styles.addSlotActionWrap} testID="button-add-slot">
                <Button
                  title={`Add Slot to ${DAY_LABELS[selectedDay].short}`}
                  variant="outline"
                  onPress={handleAddSlot}
                  icon={<Plus size={16} color={COLORS.navy} />}
                  disabled={currentDaySlots.length >= MAX_SLOTS_PER_DAY}
                />
              </View>
            </View>
          </View>

          {/* Blackout / Unavailable Dates Section */}
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionHeader}>BLACKOUT / UNAVAILABLE DATES</Text>
          </View>

          <View style={styles.blackoutCard}>
            <View style={styles.blackoutHeaderRow}>
              <View style={styles.dayTitleGroup}>
                <Calendar size={16} color={COLORS.navy} />
                <Text style={styles.blackoutTitle}>
                  Blackout Dates ({unavailableDates.length}/{MAX_UNAVAILABLE_DATES})
                </Text>
              </View>
            </View>

            <Text style={styles.blackoutDescription}>
              Specific calendar dates when you will be unavailable for all coaching (e.g.
              competitions, holidays, or travel). Recurring slots will not apply on these dates.
            </Text>

            {/* Existing Blackout Dates Chips */}
            {unavailableDates.length > 0 ? (
              <View style={styles.blackoutChipsWrap} testID="blackout-dates-list">
                {unavailableDates.map((dateStr) => (
                  <View key={dateStr} style={styles.blackoutChip}>
                    <Calendar size={13} color={COLORS.navy} />
                    <Text style={styles.blackoutChipText}>{dateStr}</Text>
                    <TouchableOpacity
                      onPress={() => handleRemoveUnavailableDate(dateStr)}
                      accessibilityRole="button"
                      accessibilityLabel={`Remove blackout date ${dateStr}`}
                      testID={`remove-date-${dateStr}`}
                      activeOpacity={0.7}
                      style={styles.blackoutChipRemove}
                    >
                      <X size={13} color={COLORS.navy} />
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            ) : (
              <Text style={styles.noBlackoutText}>
                No blackout dates specified. You are available every week according to your
                recurring slots.
              </Text>
            )}

            {/* Add Blackout Date Row */}
            <View style={styles.addDateRow}>
              <View style={styles.dateInputWrap}>
                <TextInput
                  style={styles.dateInput}
                  placeholder="YYYY-MM-DD (e.g. 2026-11-20)"
                  placeholderTextColor={COLORS.textMuted}
                  value={newUnavailableDate}
                  onChangeText={(val) => {
                    setNewUnavailableDate(val);
                    if (dateError) setDateError(null);
                  }}
                  maxLength={10}
                  autoCapitalize="none"
                  autoCorrect={false}
                  accessibilityLabel="Unavailable blackout date in YYYY-MM-DD format"
                  testID="input-unavailable-date"
                />
              </View>
              <View testID="button-add-date">
                <Button
                  title="Add Date"
                  variant="outline"
                  onPress={handleAddUnavailableDate}
                  icon={<Plus size={16} color={COLORS.navy} />}
                  disabled={unavailableDates.length >= MAX_UNAVAILABLE_DATES}
                  style={styles.addDateButton}
                />
              </View>
            </View>

            {dateError && (
              <View style={styles.fieldErrorRow} testID="date-error">
                <AlertCircle size={14} color="#EF4444" />
                <Text style={styles.fieldErrorText}>{dateError}</Text>
              </View>
            )}
          </View>

          {/* Save Success Banner */}
          {saveSuccess && (
            <View style={styles.successBanner} testID="availability-save-success">
              <CheckCircle2 size={18} color={COLORS.success} />
              <Text style={styles.successText}>{saveSuccess}</Text>
            </View>
          )}

          {/* Save Error Banner */}
          {saveError && (
            <View style={styles.errorBanner} testID="availability-save-error">
              <AlertCircle size={18} color="#DC2626" />
              <Text style={styles.errorBannerText}>{saveError}</Text>
            </View>
          )}

          {/* Honest Disclaimer Notice */}
          <View style={styles.disclaimerBox}>
            <Text style={styles.disclaimerText}>
              Note: Saving your recurring availability configures your weekly schedule on
              AthleteConnect servers. Real-time booking and trainee schedule synchronization remain
              in development.
            </Text>
          </View>

          {/* Save Action Button */}
          <View style={styles.saveActionContainer} testID="button-save-availability">
            <Button
              title="Save Availability Schedule"
              variant="primary"
              onPress={handleSave}
              loading={isSaving}
              disabled={isSaving}
              icon={<Check size={18} color={COLORS.navy} />}
            />
          </View>
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.mist,
  },
  innerContainer: {
    flex: 1,
  },
  centerContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: SPACING.xl,
  },
  loadingText: {
    ...TYPOGRAPHY.body,
    color: COLORS.textSecondary,
    marginTop: SPACING.md,
  },
  topBar: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg,
    backgroundColor: COLORS.white,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: RADII.sm,
    backgroundColor: COLORS.mist,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topBarCenter: {
    flex: 1,
    marginHorizontal: SPACING.md,
  },
  topBarTitle: {
    ...TYPOGRAPHY.h3,
    fontSize: 16,
    color: COLORS.navy,
  },
  topBarSubtitle: {
    ...TYPOGRAPHY.caption,
    fontSize: 11,
    color: COLORS.textMuted,
  },
  topBarSpacer: {
    width: 36,
  },
  scrollContent: {
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.md,
  },
  errorContainer: {
    flex: 1,
  },
  errorIconWrap: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#FEE2E2',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.md,
  },
  errorTitle: {
    ...TYPOGRAPHY.h2,
    fontSize: 18,
    color: COLORS.navy,
    marginBottom: SPACING.xs,
    textAlign: 'center',
  },
  errorDescription: {
    ...TYPOGRAPHY.body,
    fontSize: 13,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginBottom: SPACING.lg,
    paddingHorizontal: SPACING.xl,
  },
  retryButton: {
    minWidth: 140,
  },
  guidanceBanner: {
    flexDirection: 'row',
    backgroundColor: COLORS.limeSubtle,
    borderWidth: 1,
    borderColor: '#D4F38C',
    borderRadius: RADII.md,
    padding: SPACING.md,
    marginBottom: SPACING.md,
    gap: SPACING.sm,
  },
  guidanceIconWrap: {
    marginTop: 2,
  },
  guidanceContent: {
    flex: 1,
  },
  guidanceTitle: {
    ...TYPOGRAPHY.bodyBold,
    fontSize: 13.5,
    color: COLORS.navy,
    marginBottom: 2,
  },
  guidanceText: {
    ...TYPOGRAPHY.body,
    fontSize: 12.5,
    lineHeight: 17,
    color: COLORS.textSecondary,
  },
  statsCard: {
    flexDirection: 'row',
    backgroundColor: COLORS.white,
    borderRadius: RADII.md,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: SPACING.md,
    alignItems: 'center',
    justifyContent: 'space-around',
  },
  statItem: {
    alignItems: 'center',
    flex: 1,
  },
  statValue: {
    ...TYPOGRAPHY.h2,
    fontSize: 18,
    color: COLORS.navy,
    marginBottom: 2,
  },
  statLabel: {
    ...TYPOGRAPHY.caption,
    fontSize: 11,
    color: COLORS.textMuted,
  },
  statDivider: {
    width: 1,
    height: 28,
    backgroundColor: COLORS.border,
  },
  timezoneCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: COLORS.white,
    borderRadius: RADII.sm,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: SPACING.md,
  },
  timezoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
  },
  timezoneLabel: {
    ...TYPOGRAPHY.caption,
    fontSize: 12,
    color: COLORS.textSecondary,
  },
  timezoneValue: {
    ...TYPOGRAPHY.bodyBold,
    fontSize: 12.5,
    color: COLORS.navy,
  },
  sectionHeaderRow: {
    marginTop: SPACING.xs,
    marginBottom: SPACING.xs,
  },
  sectionHeader: {
    ...TYPOGRAPHY.caption,
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.textMuted,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  daySelectorScroll: {
    paddingVertical: SPACING.xs,
    gap: SPACING.xs,
    marginBottom: SPACING.md,
  },
  dayTab: {
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    borderRadius: RADII.md,
    borderWidth: 1.5,
    minWidth: 54,
  },
  dayTabSelected: {
    backgroundColor: COLORS.navy,
    borderColor: COLORS.navy,
  },
  dayTabUnselected: {
    backgroundColor: COLORS.white,
    borderColor: COLORS.border,
  },
  dayTabShort: {
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 4,
  },
  dayTabShortSelected: {
    color: COLORS.white,
  },
  dayTabShortUnselected: {
    color: COLORS.textSecondary,
  },
  dayCountBadge: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  dayCountBadgeSelected: {
    backgroundColor: COLORS.lime,
  },
  dayCountBadgeUnselected: {
    backgroundColor: COLORS.mist,
  },
  dayCountText: {
    fontSize: 10,
    fontWeight: '700',
  },
  dayCountTextSelected: {
    color: COLORS.navy,
  },
  dayCountTextUnselected: {
    color: COLORS.textMuted,
  },
  daySlotsSection: {
    backgroundColor: COLORS.white,
    borderRadius: RADII.md,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: SPACING.md,
  },
  daySlotsHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SPACING.md,
    paddingBottom: SPACING.xs,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.mist,
  },
  dayTitleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
  },
  daySlotsTitle: {
    ...TYPOGRAPHY.bodyBold,
    fontSize: 14,
    color: COLORS.navy,
  },
  emptyDayBox: {
    paddingVertical: SPACING.md,
    alignItems: 'center',
  },
  emptyDayText: {
    ...TYPOGRAPHY.bodyBold,
    fontSize: 13,
    color: COLORS.textSecondary,
    marginBottom: 2,
    textAlign: 'center',
  },
  emptyDaySubtext: {
    ...TYPOGRAPHY.caption,
    fontSize: 12,
    color: COLORS.textMuted,
    textAlign: 'center',
  },
  slotCardsList: {
    gap: SPACING.xs,
    marginBottom: SPACING.md,
  },
  slotCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: COLORS.mist,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: RADII.sm,
    borderWidth: 1,
    borderColor: '#E8ECF0',
  },
  slotInfo: {
    flex: 1,
  },
  slotTimeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  slotTimeRange: {
    ...TYPOGRAPHY.bodyBold,
    fontSize: 13.5,
    color: COLORS.navy,
  },
  slotDuration: {
    ...TYPOGRAPHY.caption,
    fontSize: 12,
    color: COLORS.textSecondary,
  },
  slotDaySub: {
    ...TYPOGRAPHY.caption,
    fontSize: 11,
    color: COLORS.textMuted,
    marginTop: 1,
  },
  removeSlotButton: {
    width: 32,
    height: 32,
    borderRadius: RADII.xs,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FEE2E2',
  },
  addSlotBox: {
    marginTop: SPACING.sm,
    paddingTop: SPACING.md,
    borderTopWidth: 1,
    borderTopColor: COLORS.mist,
  },
  addSlotHeading: {
    ...TYPOGRAPHY.caption,
    fontWeight: '700',
    color: COLORS.navy,
    marginBottom: SPACING.xs,
  },
  presetsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: SPACING.sm,
  },
  presetChip: {
    backgroundColor: COLORS.limeSubtle,
    borderRadius: RADII.full,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: '#D4F38C',
  },
  presetChipText: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.navy,
  },
  timeInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  timeFieldGroup: {
    flex: 1,
  },
  fieldLabel: {
    ...TYPOGRAPHY.caption,
    fontSize: 11,
    color: COLORS.textMuted,
    marginBottom: 4,
  },
  timeInput: {
    height: 44,
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADII.sm,
    paddingHorizontal: SPACING.md,
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.navy,
  },
  timeFieldSeparator: {
    paddingTop: 16,
  },
  timeToText: {
    ...TYPOGRAPHY.caption,
    fontSize: 12,
    color: COLORS.textMuted,
  },
  fieldErrorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 6,
  },
  fieldErrorText: {
    ...TYPOGRAPHY.caption,
    fontSize: 12,
    color: '#EF4444',
  },
  addSlotActionWrap: {
    marginTop: SPACING.md,
  },
  blackoutCard: {
    backgroundColor: COLORS.white,
    borderRadius: RADII.md,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: SPACING.md,
  },
  blackoutHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  blackoutTitle: {
    ...TYPOGRAPHY.bodyBold,
    fontSize: 14,
    color: COLORS.navy,
  },
  blackoutDescription: {
    ...TYPOGRAPHY.caption,
    fontSize: 12,
    lineHeight: 16,
    color: COLORS.textSecondary,
    marginBottom: SPACING.md,
  },
  blackoutChipsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: SPACING.md,
  },
  blackoutChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.mist,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 5,
    borderRadius: RADII.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 5,
  },
  blackoutChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.navy,
  },
  blackoutChipRemove: {
    marginLeft: 2,
    padding: 2,
  },
  noBlackoutText: {
    ...TYPOGRAPHY.caption,
    fontSize: 12,
    color: COLORS.textMuted,
    fontStyle: 'italic',
    marginBottom: SPACING.md,
  },
  addDateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  dateInputWrap: {
    flex: 1,
  },
  dateInput: {
    height: 44,
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADII.sm,
    paddingHorizontal: SPACING.md,
    fontSize: 13,
    color: COLORS.navy,
  },
  addDateButton: {
    height: 44,
    paddingHorizontal: SPACING.md,
  },
  successBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.successLight,
    borderWidth: 1,
    borderColor: '#A7F3D0',
    borderRadius: RADII.sm,
    padding: SPACING.md,
    marginBottom: SPACING.md,
    gap: SPACING.sm,
  },
  successText: {
    ...TYPOGRAPHY.bodyBold,
    fontSize: 13,
    color: COLORS.success,
    flex: 1,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEE2E2',
    borderWidth: 1,
    borderColor: '#FCA5A5',
    borderRadius: RADII.sm,
    padding: SPACING.md,
    marginBottom: SPACING.md,
    gap: SPACING.sm,
  },
  errorBannerText: {
    ...TYPOGRAPHY.bodyBold,
    fontSize: 13,
    color: '#DC2626',
    flex: 1,
  },
  disclaimerBox: {
    backgroundColor: '#F8FAFC',
    borderRadius: RADII.sm,
    padding: SPACING.sm,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: SPACING.lg,
  },
  disclaimerText: {
    ...TYPOGRAPHY.caption,
    fontSize: 11,
    lineHeight: 15,
    color: COLORS.textMuted,
    textAlign: 'center',
  },
  saveActionContainer: {
    marginBottom: SPACING.lg,
  },
});
