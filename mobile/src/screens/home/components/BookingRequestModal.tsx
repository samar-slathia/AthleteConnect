import React, { useState, useEffect, useRef } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import {
  X,
  Calendar,
  Clock,
  MapPin,
  Phone,
  User as UserIcon,
  AlertCircle,
  CheckCircle,
  Locate,
  Navigation,
  ShieldCheck,
} from 'lucide-react-native';
import {
  getPublicCoaches,
  createBooking,
  getKolkataDateString,
  getKolkataTomorrowDateString,
  isValidCalendarDate,
  CoachDiscoveryItem,
  BookingItem,
  CoachDiscipline,
  VenueType,
} from '../../../services/bookingApi';
import {
  detectDeviceLocation,
  BookingCoordinates,
  DetectedAddressComponents,
} from '../../../services/locationService';
import { Button } from '../../../components/Button';
import { COLORS, RADII, SPACING, TYPOGRAPHY } from '../../../theme/tokens';

export interface BookingRequestModalProps {
  visible: boolean;
  onClose: () => void;
  onSuccess?: (newBooking: BookingItem) => void;
  onBookingCreated?: (newBooking: BookingItem) => void;
  token?: string | null;
  initialSport?: CoachDiscipline;
}

const ALL_DISCIPLINES: CoachDiscipline[] = ['boxing', 'wushu', 'kickboxing'];
const ALL_VENUES: { id: VenueType; label: string }[] = [
  { id: 'coach_home', label: 'Coach Studio' },
  { id: 'customer_home', label: 'Trainee Home' },
  { id: 'ground', label: 'Sports Ground' },
];

export const BookingRequestModal: React.FC<BookingRequestModalProps> = ({
  visible,
  onClose,
  onSuccess,
  onBookingCreated,
  token,
  initialSport,
}) => {
  const [coaches, setCoaches] = useState<CoachDiscoveryItem[]>([]);
  const [isLoadingCoaches, setIsLoadingCoaches] = useState<boolean>(true);
  const [loadCoachesError, setLoadCoachesError] = useState<string | null>(null);

  // Form State
  const [selectedCoachId, setSelectedCoachId] = useState<string>('');
  const [selectedSport, setSelectedSport] = useState<CoachDiscipline | null>(initialSport || null);
  const [date, setDate] = useState<string>('');
  const [startTime, setStartTime] = useState<string>('09:00');
  const [endTime, setEndTime] = useState<string>('10:00');
  const [selectedVenue, setSelectedVenue] = useState<VenueType>('coach_home');
  const [trainingAddress, setTrainingAddress] = useState<string>('');
  const [customerPhone, setCustomerPhone] = useState<string>('');

  // Structured Trainee Home address fields
  const [houseNo, setHouseNo] = useState<string>('');
  const [street, setStreet] = useState<string>('');
  const [area, setArea] = useState<string>('');
  const [landmark, setLandmark] = useState<string>('');

  // Sports Ground custom entry
  const [groundName, setGroundName] = useState<string>('');

  // Manual fallback for coach studio if missing from coach profile
  const [manualCoachAddress, setManualCoachAddress] = useState<string>('');

  // Selected coach configured location (when multiple locations are configured)
  const [selectedCoachLocation, setSelectedCoachLocation] = useState<string | null>(null);

  // Location detection state
  const [detectedCoordinates, setDetectedCoordinates] = useState<BookingCoordinates | null>(null);
  const [detectedAddress, setDetectedAddress] = useState<string | null>(null);
  const [isDetectingLocation, setIsDetectingLocation] = useState<boolean>(false);
  const [locationDetectionMessage, setLocationDetectionMessage] = useState<string | null>(null);
  const [locationDetectionError, setLocationDetectionError] = useState<string | null>(null);

  const locationRequestIdRef = useRef<number>(0);
  const userEditedAddressRef = useRef<boolean>(false);

  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Set default tomorrow date in Asia/Kolkata when modal opens
  useEffect(() => {
    if (visible) {
      locationRequestIdRef.current++;
      userEditedAddressRef.current = false;
      setIsDetectingLocation(false);
      setDate(getKolkataTomorrowDateString());
      setSelectedSport(initialSport || null);
      setSelectedCoachId('');
      setSelectedCoachLocation(null);
      setTrainingAddress('');
      setHouseNo('');
      setStreet('');
      setArea('');
      setLandmark('');
      setGroundName('');
      setManualCoachAddress('');
      setDetectedCoordinates(null);
      setDetectedAddress(null);
      setLocationDetectionMessage(null);
      setLocationDetectionError(null);
      setFormError(null);
      fetchCoaches();
    }
  }, [visible, initialSport]);

  const fetchCoaches = async () => {
    try {
      setIsLoadingCoaches(true);
      setLoadCoachesError(null);
      const list = await getPublicCoaches();
      setCoaches(list);
    } catch (err: any) {
      setLoadCoachesError(err.message || 'Unable to load coaches.');
    } finally {
      setIsLoadingCoaches(false);
    }
  };

  const handleSelectSport = (sport: CoachDiscipline) => {
    if (sport === selectedSport) return;
    setSelectedSport(sport);
    setSelectedCoachId('');
    setSelectedCoachLocation(null);
    setFormError(null);
  };

  const handleSelectCoach = (coachId: string) => {
    setSelectedCoachId(coachId);
    setSelectedCoachLocation(null);
    setFormError(null);
    const chosen = coaches.find((c) => c._id === coachId);
    if (chosen?.profile?.venueTypes && chosen.profile.venueTypes.length > 0) {
      if (!chosen.profile.venueTypes.includes(selectedVenue)) {
        setSelectedVenue(chosen.profile.venueTypes[0]);
      }
    }
  };

  const handleSelectVenue = (venue: VenueType) => {
    locationRequestIdRef.current++;
    setIsDetectingLocation(false);
    setSelectedVenue(venue);
    setSelectedCoachLocation(null);
    setDetectedCoordinates(null);
    setDetectedAddress(null);
    setLocationDetectionError(null);
    setLocationDetectionMessage(null);
  };

  const matchingCoaches = selectedSport
    ? coaches.filter((c) => c.profile?.disciplines?.includes(selectedSport))
    : [];

  const selectedCoach = coaches.find((c) => c._id === selectedCoachId);

  // Filter venue types offered by selected coach
  const offeredVenues =
    selectedCoach?.profile?.venueTypes && selectedCoach.profile.venueTypes.length > 0
      ? ALL_VENUES.filter((v) => selectedCoach.profile!.venueTypes.includes(v.id))
      : ALL_VENUES;

  // Raw non-empty coach configured locations
  const rawCoachLocations = (selectedCoach?.profile?.locations || [])
    .map((l) => (typeof l === 'string' ? l.trim() : ''))
    .filter((l) => l.length > 0);

  // Studio locations (all configured coach locations)
  const coachStudioLocations = rawCoachLocations;

  // Ground locations (prioritizes ground/stadium/park/court/field/arena keywords, falls back to all configured locations)
  const groundMatches = rawCoachLocations.filter((loc) =>
    /(ground|stadium|park|court|arena|field|facility)/i.test(loc)
  );
  const coachGroundLocations = groundMatches.length > 0 ? groundMatches : rawCoachLocations;

  // Applicable locations for the active venue
  const applicableLocations =
    selectedVenue === 'coach_home'
      ? coachStudioLocations
      : selectedVenue === 'ground'
      ? coachGroundLocations
      : [];

  // Active location resolution:
  // 1. If exactly one applicable location exists, use it automatically.
  // 2. If multiple applicable locations exist, use customer-selected one (or null).
  // 3. If zero applicable locations exist, null.
  const activeCoachLocation: string | null =
    applicableLocations.length === 1
      ? applicableLocations[0]
      : selectedCoachLocation && applicableLocations.includes(selectedCoachLocation)
      ? selectedCoachLocation
      : null;

  const handleDetectLocation = async () => {
    if (isDetectingLocation) return;
    const currentRequestId = ++locationRequestIdRef.current;

    setIsDetectingLocation(true);
    setLocationDetectionError(null);
    setLocationDetectionMessage(null);

    const applyAddressComponents = (components: DetectedAddressComponents) => {
      if (currentRequestId !== locationRequestIdRef.current) return;
      if (!components.formattedAddress) return;
      setDetectedAddress(components.formattedAddress);

      // Populate structured fields only if user hasn't manually edited the address
      if (!userEditedAddressRef.current) {
        if (selectedVenue === 'customer_home') {
          if (components.streetNumber) {
            setHouseNo(components.streetNumber);
          }
          if (components.street) {
            setStreet(components.street);
          }
          const localityPart = [components.district, components.city, components.region, components.postalCode]
            .filter(Boolean)
            .join(', ');
          if (localityPart) {
            setArea(localityPart);
          }
          setTrainingAddress(components.formattedAddress);
        } else if (selectedVenue === 'ground') {
          if (!groundName) {
            setGroundName(components.formattedAddress);
          }
          setTrainingAddress(components.formattedAddress);
        }
      }
    };

    try {
      const result = await detectDeviceLocation({
        onCoordinates: (coords) => {
          if (currentRequestId === locationRequestIdRef.current) {
            setDetectedCoordinates(coords);
            setLocationDetectionMessage(
              `Location detected: ${coords.latitude.toFixed(4)}, ${coords.longitude.toFixed(4)}`
            );
            // Reverse geocoding must not keep the spinner running indefinitely
            setIsDetectingLocation(false);
          }
        },
        onAddressResolved: applyAddressComponents,
      });

      if (currentRequestId !== locationRequestIdRef.current) {
        // Discard superseded or cancelled detection result
        return;
      }

      if (result.success && result.coordinates) {
        setDetectedCoordinates(result.coordinates);
        setLocationDetectionMessage(
          `Location detected: ${result.coordinates.latitude.toFixed(4)}, ${result.coordinates.longitude.toFixed(4)}`
        );
        if (result.addressComponents) {
          applyAddressComponents(result.addressComponents);
        } else if (result.suggestedAddress && !userEditedAddressRef.current) {
          setDetectedAddress(result.suggestedAddress);
          if (selectedVenue === 'customer_home') {
            if (!area) setArea(result.suggestedAddress);
            if (!trainingAddress) setTrainingAddress(result.suggestedAddress);
          } else if (selectedVenue === 'ground') {
            if (!groundName) setGroundName(result.suggestedAddress);
            if (!trainingAddress) setTrainingAddress(result.suggestedAddress);
          }
        }
      } else {
        setLocationDetectionError(result.error || 'Could not detect location. Please enter address manually.');
      }
    } catch (err: any) {
      if (currentRequestId === locationRequestIdRef.current) {
        setLocationDetectionError(err?.message || 'Could not detect location. Please enter address manually.');
      }
    } finally {
      if (currentRequestId === locationRequestIdRef.current) {
        setIsDetectingLocation(false);
      }
    }
  };

  const handleStructuredAddressChange = (
    field: 'house' | 'street' | 'area' | 'landmark',
    val: string
  ) => {
    userEditedAddressRef.current = true;
    if (field === 'house') setHouseNo(val);
    else if (field === 'street') setStreet(val);
    else if (field === 'area') setArea(val);
    else if (field === 'landmark') setLandmark(val);
  };

  const getEffectiveLocation = (): { address: string; coordinates?: BookingCoordinates } => {
    if (selectedVenue === 'coach_home') {
      const address =
        trainingAddress.trim() ||
        activeCoachLocation ||
        manualCoachAddress.trim();
      return {
        address: address || '',
        coordinates: undefined,
      };
    } else if (selectedVenue === 'customer_home') {
      const parts = [
        houseNo.trim(),
        street.trim(),
        area.trim(),
        landmark.trim()
          ? landmark.trim().toLowerCase().startsWith('near')
            ? landmark.trim()
            : `Near ${landmark.trim()}`
          : '',
      ].filter(Boolean);
      const combined = parts.join(', ');
      const address = trainingAddress.trim() || combined;
      return {
        address,
        coordinates: detectedCoordinates || undefined,
      };
    } else {
      // ground
      const address =
        trainingAddress.trim() ||
        activeCoachLocation ||
        groundName.trim();
      return {
        address,
        coordinates: detectedCoordinates || undefined,
      };
    }
  };

  const handleSubmit = async () => {
    if (isSubmitting) return;
    setFormError(null);

    // 1. Discipline check
    if (!selectedSport) {
      setFormError('Please select a sport discipline for this session.');
      return;
    }

    // 2. Coach selection check
    if (!selectedCoachId) {
      setFormError('Please select a coach for this session.');
      return;
    }

    // 3. Validate that selected coach offers the chosen discipline
    const coach = coaches.find((c) => c._id === selectedCoachId);
    if (!coach || !coach.profile?.disciplines?.includes(selectedSport)) {
      setFormError('The selected coach does not offer the chosen discipline.');
      return;
    }

    // 4. Date check
    if (!isValidCalendarDate(date.trim())) {
      setFormError('Please enter a valid date in YYYY-MM-DD format.');
      return;
    }
    const today = getKolkataDateString();
    if (date.trim() < today) {
      setFormError('Session date cannot be in the past.');
      return;
    }

    // 5. Time format & duration check
    const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;
    if (!timeRegex.test(startTime.trim())) {
      setFormError('Start time must be in 24-hour HH:mm format (e.g. 09:00).');
      return;
    }
    if (!timeRegex.test(endTime.trim())) {
      setFormError('End time must be in 24-hour HH:mm format (e.g. 10:00).');
      return;
    }

    const [sh, sm] = startTime.trim().split(':').map(Number);
    const [eh, em] = endTime.trim().split(':').map(Number);
    const startMinutes = sh * 60 + sm;
    const endMinutes = eh * 60 + em;

    if (startMinutes >= endMinutes) {
      setFormError('Start time must be earlier than end time.');
      return;
    }

    const duration = endMinutes - startMinutes;
    if (duration < 30) {
      setFormError('Session duration must be at least 30 minutes.');
      return;
    }
    if (duration > 240) {
      setFormError('Session duration cannot exceed 4 hours (240 minutes).');
      return;
    }

    // 6. Address check
    const { address: finalAddress, coordinates: finalCoords } = getEffectiveLocation();

    // Multiple coach locations selection check
    if (
      selectedVenue === 'coach_home' &&
      coachStudioLocations.length > 1 &&
      !activeCoachLocation &&
      (!trainingAddress || trainingAddress.trim().length < 5)
    ) {
      setFormError('Please select one of the coach\'s configured studio locations.');
      return;
    }

    if (
      selectedVenue === 'ground' &&
      coachGroundLocations.length > 1 &&
      !activeCoachLocation &&
      (!trainingAddress || trainingAddress.trim().length < 5)
    ) {
      setFormError('Please select one of the coach\'s configured ground locations.');
      return;
    }

    if (!finalAddress || finalAddress.trim().length < 5) {
      if (selectedVenue === 'coach_home') {
        setFormError('Please select a coach with a configured studio or enter a studio training address (min 5 characters).');
      } else if (selectedVenue === 'customer_home') {
        setFormError('Please provide a complete training address (min 5 characters).');
      } else {
        setFormError('Please provide a sports ground or facility training address (min 5 characters).');
      }
      return;
    }

    // 7. Phone check
    if (!/^\+?[0-9]{10,15}$/.test(customerPhone.trim())) {
      setFormError('Please enter a valid 10 to 15 digit contact phone number.');
      return;
    }

    try {
      setIsSubmitting(true);
      const payload: any = {
        coachId: selectedCoachId,
        sport: selectedSport,
        date: date.trim(),
        startTime: startTime.trim(),
        endTime: endTime.trim(),
        venueType: selectedVenue,
        trainingAddress: finalAddress.trim(),
        customerPhone: customerPhone.trim(),
      };
      if (finalCoords) {
        payload.coordinates = finalCoords;
        payload.locationCoordinates = finalCoords;
      }
      const newBooking = await createBooking(token || '', payload);

      if (onSuccess) onSuccess(newBooking);
      if (onBookingCreated) onBookingCreated(newBooking);
      onClose();
    } catch (err: any) {
      setFormError(err.message || 'Failed to submit booking request.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const effectiveLoc = getEffectiveLocation();

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        style={styles.modalOverlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.modalContent} testID="booking-request-modal">
          {/* Header */}
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Request Training Session</Text>
            <TouchableOpacity
              onPress={onClose}
              style={styles.closeBtn}
              accessibilityLabel="Close booking modal"
              testID="button-close-modal"
            >
              <X size={20} color={COLORS.navy} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.formScroll} showsVerticalScrollIndicator={false}>
            {formError ? (
              <View style={styles.errorBanner} testID="booking-form-error">
                <AlertCircle size={16} color="#DC2626" style={styles.errorIcon} />
                <Text style={styles.errorText}>{formError}</Text>
              </View>
            ) : null}

            {/* 1. Select Discipline */}
            <Text style={styles.inputLabel}>1. SELECT DISCIPLINE</Text>
            <View style={styles.rowWrap}>
              {ALL_DISCIPLINES.map((sp) => {
                const isSelected = sp === selectedSport;
                return (
                  <TouchableOpacity
                    key={sp}
                    style={[styles.optionPill, isSelected && styles.optionPillSelected]}
                    onPress={() => handleSelectSport(sp)}
                    testID={`sport-pill-${sp}`}
                  >
                    <Text style={[styles.optionPillText, isSelected && styles.optionPillTextSelected]}>
                      {sp.toUpperCase()}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* 2. Select Coach */}
            <Text style={styles.inputLabel}>2. SELECT COACH</Text>
            {isLoadingCoaches ? (
              <ActivityIndicator size="small" color={COLORS.navy} style={styles.loader} testID="loading-coaches" />
            ) : loadCoachesError ? (
              <View style={styles.coachErrorContainer} testID="error-coaches-container">
                <Text style={styles.subtleError} testID="error-coaches-load">{loadCoachesError}</Text>
                <TouchableOpacity
                  style={styles.retryButton}
                  onPress={fetchCoaches}
                  testID="button-retry-coaches"
                >
                  <Text style={styles.retryButtonText}>Retry</Text>
                </TouchableOpacity>
              </View>
            ) : !selectedSport ? (
              <Text style={styles.subtleMuted} testID="coaches-prompt">
                Please select a discipline above to choose a coach.
              </Text>
            ) : matchingCoaches.length === 0 ? (
              <Text style={styles.subtleMuted} testID="empty-coaches-notice">
                {`No coaches currently available for ${selectedSport.charAt(0).toUpperCase() + selectedSport.slice(1)}.`}
              </Text>
            ) : (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll}>
                {matchingCoaches.map((c) => {
                  const isSelected = c._id === selectedCoachId;
                  return (
                    <TouchableOpacity
                      key={c._id}
                      style={[styles.coachChip, isSelected && styles.coachChipSelected]}
                      onPress={() => handleSelectCoach(c._id)}
                      testID={`coach-chip-${c._id}`}
                    >
                      <Text style={[styles.coachChipName, isSelected && styles.coachChipNameSelected]}>
                        {c.name}
                      </Text>
                      {c.profile?.hourlyRate ? (
                        <Text style={[styles.coachChipRate, isSelected && styles.coachChipRateSelected]}>
                          ₹{c.profile.hourlyRate}/hr
                        </Text>
                      ) : null}
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            )}

            {/* 3. Date & Times */}
            <Text style={styles.inputLabel}>3. DATE & TIME (24-HOUR)</Text>
            <View style={styles.inputGroup}>
              <Text style={styles.fieldSubLabel}>Date (YYYY-MM-DD)</Text>
              <TextInput
                style={styles.textInput}
                value={date}
                onChangeText={setDate}
                placeholder="2026-11-20"
                placeholderTextColor={COLORS.textMuted}
                autoCapitalize="none"
                testID="input-booking-date"
              />
            </View>

            <View style={styles.twoColumnRow}>
              <View style={[styles.inputGroup, styles.halfColumn]}>
                <Text style={styles.fieldSubLabel}>Start Time (HH:mm)</Text>
                <TextInput
                  style={styles.textInput}
                  value={startTime}
                  onChangeText={setStartTime}
                  placeholder="09:00"
                  placeholderTextColor={COLORS.textMuted}
                  autoCapitalize="none"
                  testID="input-booking-start"
                />
              </View>
              <View style={[styles.inputGroup, styles.halfColumn]}>
                <Text style={styles.fieldSubLabel}>End Time (HH:mm)</Text>
                <TextInput
                  style={styles.textInput}
                  value={endTime}
                  onChangeText={setEndTime}
                  placeholder="10:00"
                  placeholderTextColor={COLORS.textMuted}
                  autoCapitalize="none"
                  testID="input-booking-end"
                />
              </View>
            </View>

            {/* 4. Venue Type */}
            <Text style={styles.inputLabel}>4. VENUE TYPE</Text>
            <View style={styles.rowWrap}>
              {offeredVenues.map((v) => {
                const isSelected = v.id === selectedVenue;
                return (
                  <TouchableOpacity
                    key={v.id}
                    style={[styles.optionPill, isSelected && styles.optionPillSelected]}
                    onPress={() => handleSelectVenue(v.id)}
                    testID={`venue-pill-${v.id}`}
                  >
                    <Text style={[styles.optionPillText, isSelected && styles.optionPillTextSelected]}>
                      {v.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* 5. Address & Contact */}
            <Text style={styles.inputLabel}>5. LOCATION & CONTACT</Text>

            {selectedVenue === 'coach_home' && (
              <View style={styles.venueSection}>
                {coachStudioLocations.length === 0 ? (
                  <View style={styles.warningNotice} testID="coach-studio-missing-notice">
                    <AlertCircle size={16} color="#B45309" />
                    <Text style={styles.warningNoticeText}>
                      This coach has not configured any studio locations. Please enter the agreed studio address below.
                    </Text>
                  </View>
                ) : coachStudioLocations.length === 1 ? (
                  <View style={styles.configuredLocationCard} testID="coach-studio-location-display">
                    <View style={styles.configuredLocationHeader}>
                      <MapPin size={16} color={COLORS.navy} />
                      <Text style={styles.configuredLocationTitle}>
                        {selectedCoach?.name ? `${selectedCoach.name}'s Studio` : 'Coach Studio'}
                      </Text>
                    </View>
                    <Text style={styles.configuredLocationAddress}>{activeCoachLocation}</Text>
                    <Text style={styles.configuredLocationSub}>
                      Sessions at the coach's facility take place at their designated studio. Trainee home address is not required.
                    </Text>
                  </View>
                ) : (
                  <View style={styles.locationSelectorContainer} testID="coach-studio-location-selector">
                    <Text style={styles.selectorLabel}>Select Studio Location:</Text>
                    <View style={styles.rowWrap}>
                      {coachStudioLocations.map((loc, idx) => {
                        const isSelected = activeCoachLocation === loc;
                        return (
                          <TouchableOpacity
                            key={loc}
                            style={[
                              styles.locationOptionPill,
                              isSelected && styles.locationOptionPillSelected,
                            ]}
                            onPress={() => setSelectedCoachLocation(loc)}
                            testID={`coach-location-option-${idx}`}
                          >
                            <MapPin size={12} color={isSelected ? COLORS.navy : COLORS.textSecondary} />
                            <Text
                              style={[
                                styles.locationOptionText,
                                isSelected && styles.locationOptionTextSelected,
                              ]}
                            >
                              {loc}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                    {activeCoachLocation ? (
                      <View style={styles.configuredLocationCard} testID="coach-studio-location-display">
                        <View style={styles.configuredLocationHeader}>
                          <MapPin size={16} color={COLORS.navy} />
                          <Text style={styles.configuredLocationTitle}>Selected Studio</Text>
                        </View>
                        <Text style={styles.configuredLocationAddress}>{activeCoachLocation}</Text>
                      </View>
                    ) : (
                      <Text style={styles.subtleMuted} testID="prompt-select-coach-location">
                        Please select a studio location from the options above.
                      </Text>
                    )}
                  </View>
                )}

                <View style={styles.inputGroup}>
                  <Text style={styles.fieldSubLabel}>
                    {coachStudioLocations.length > 0 ? 'Studio Address / Notes (Optional)' : 'Studio Address *'}
                  </Text>
                  <TextInput
                    style={styles.textInput}
                    value={trainingAddress}
                    onChangeText={(val) => {
                      userEditedAddressRef.current = true;
                      setTrainingAddress(val);
                    }}
                    placeholder={activeCoachLocation || "e.g. FitZone Arena, Indiranagar"}
                    placeholderTextColor={COLORS.textMuted}
                    testID="input-booking-address"
                  />
                </View>
              </View>
            )}

            {selectedVenue === 'customer_home' && (
              <View style={styles.venueSection}>
                <View style={styles.privacyNoticeBanner} testID="trainee-home-address-notice">
                  <ShieldCheck size={16} color={COLORS.navy} />
                  <Text style={styles.privacyNoticeText}>
                    Your home address and location coordinates will be shared with the assigned coach so they can evaluate travel distance before accepting your request.
                  </Text>
                </View>

                <View style={styles.subLabelRow}>
                  <Text style={styles.fieldSubLabel}>Trainee Home Address</Text>
                  <TouchableOpacity
                    style={styles.detectLocationBtn}
                    onPress={handleDetectLocation}
                    disabled={isDetectingLocation}
                    testID="button-detect-location"
                  >
                    <Locate size={14} color={COLORS.navy} />
                    <Text style={styles.detectLocationBtnText}>
                      {isDetectingLocation ? 'Detecting...' : 'Detect My Location'}
                    </Text>
                  </TouchableOpacity>
                </View>

                {isDetectingLocation ? (
                  <View style={styles.detectNoticeRow} testID="location-detecting-indicator">
                    <ActivityIndicator size="small" color={COLORS.navy} />
                    <Text style={styles.detectNoticeText}>Acquiring GPS location...</Text>
                  </View>
                ) : null}

                {locationDetectionError ? (
                  <View style={styles.detectNoticeError} testID="location-detection-error">
                    <AlertCircle size={14} color="#DC2626" />
                    <Text style={styles.detectNoticeErrorText}>{locationDetectionError}</Text>
                  </View>
                ) : null}

                {detectedCoordinates ? (
                  <View style={styles.detectNoticeSuccess} testID="location-detected-coordinates">
                    <CheckCircle size={14} color="#047857" />
                    <Text style={styles.detectNoticeSuccessText}>
                      {`GPS attached: ${detectedCoordinates.latitude.toFixed(4)}, ${detectedCoordinates.longitude.toFixed(4)}`}
                    </Text>
                  </View>
                ) : null}

                {detectedAddress ? (
                  <View style={styles.detectedAddressCard} testID="location-detected-address-card">
                    <View style={styles.detectedAddressHeader}>
                      <MapPin size={14} color={COLORS.navy} />
                      <Text style={styles.detectedAddressLabel}>Detected address — please verify</Text>
                    </View>
                    <Text style={styles.detectedAddressText} testID="location-detected-address-text">
                      {detectedAddress}
                    </Text>
                  </View>
                ) : null}

                <View style={styles.twoColumnRow}>
                  <View style={[styles.inputGroup, styles.halfColumn]}>
                    <Text style={styles.subFieldLabel}>House / Flat / Apt</Text>
                    <TextInput
                      style={styles.textInput}
                      value={houseNo}
                      onChangeText={(val) => handleStructuredAddressChange('house', val)}
                      placeholder="Apt 4B"
                      placeholderTextColor={COLORS.textMuted}
                      testID="input-home-house"
                    />
                  </View>
                  <View style={[styles.inputGroup, styles.halfColumn]}>
                    <Text style={styles.subFieldLabel}>Street / Building</Text>
                    <TextInput
                      style={styles.textInput}
                      value={street}
                      onChangeText={(val) => handleStructuredAddressChange('street', val)}
                      placeholder="12th Main Road"
                      placeholderTextColor={COLORS.textMuted}
                      testID="input-home-street"
                    />
                  </View>
                </View>

                <View style={styles.twoColumnRow}>
                  <View style={[styles.inputGroup, styles.halfColumn]}>
                    <Text style={styles.subFieldLabel}>Area / Locality</Text>
                    <TextInput
                      style={styles.textInput}
                      value={area}
                      onChangeText={(val) => handleStructuredAddressChange('area', val)}
                      placeholder="Indiranagar"
                      placeholderTextColor={COLORS.textMuted}
                      testID="input-home-area"
                    />
                  </View>
                  <View style={[styles.inputGroup, styles.halfColumn]}>
                    <Text style={styles.subFieldLabel}>Landmark (Optional)</Text>
                    <TextInput
                      style={styles.textInput}
                      value={landmark}
                      onChangeText={(val) => handleStructuredAddressChange('landmark', val)}
                      placeholder="Near Metro Station"
                      placeholderTextColor={COLORS.textMuted}
                      testID="input-home-landmark"
                    />
                  </View>
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.subFieldLabel}>Complete Address (Review or edit)</Text>
                  <TextInput
                    style={styles.textInput}
                    value={trainingAddress}
                    onChangeText={(val) => {
                      userEditedAddressRef.current = true;
                      setTrainingAddress(val);
                    }}
                    placeholder="Complete home address"
                    placeholderTextColor={COLORS.textMuted}
                    testID="input-booking-address"
                  />
                </View>
              </View>
            )}

            {selectedVenue === 'ground' && (
              <View style={styles.venueSection}>
                <View style={styles.subLabelRow}>
                  <Text style={styles.fieldSubLabel}>Sports Ground / Facility</Text>
                  <TouchableOpacity
                    style={styles.detectLocationBtn}
                    onPress={handleDetectLocation}
                    disabled={isDetectingLocation}
                    testID="button-detect-location"
                  >
                    <Locate size={14} color={COLORS.navy} />
                    <Text style={styles.detectLocationBtnText}>
                      {isDetectingLocation ? 'Detecting...' : 'Detect My Location'}
                    </Text>
                  </TouchableOpacity>
                </View>

                {isDetectingLocation ? (
                  <View style={styles.detectNoticeRow} testID="location-detecting-indicator">
                    <ActivityIndicator size="small" color={COLORS.navy} />
                    <Text style={styles.detectNoticeText}>Acquiring GPS location...</Text>
                  </View>
                ) : null}

                {locationDetectionError ? (
                  <View style={styles.detectNoticeError} testID="location-detection-error">
                    <AlertCircle size={14} color="#DC2626" />
                    <Text style={styles.detectNoticeErrorText}>{locationDetectionError}</Text>
                  </View>
                ) : null}

                {detectedCoordinates ? (
                  <View style={styles.detectNoticeSuccess} testID="location-detected-coordinates">
                    <CheckCircle size={14} color="#047857" />
                    <Text style={styles.detectNoticeSuccessText}>
                      {`GPS attached: ${detectedCoordinates.latitude.toFixed(4)}, ${detectedCoordinates.longitude.toFixed(4)}`}
                    </Text>
                  </View>
                ) : null}

                {detectedAddress ? (
                  <View style={styles.detectedAddressCard} testID="location-detected-address-card">
                    <View style={styles.detectedAddressHeader}>
                      <MapPin size={14} color={COLORS.navy} />
                      <Text style={styles.detectedAddressLabel}>Detected address — please verify</Text>
                    </View>
                    <Text style={styles.detectedAddressText} testID="location-detected-address-text">
                      {detectedAddress}
                    </Text>
                  </View>
                ) : null}

                {coachGroundLocations.length === 0 ? (
                  <View style={styles.warningNotice} testID="coach-ground-missing-notice">
                    <AlertCircle size={16} color="#B45309" />
                    <Text style={styles.warningNoticeText}>
                      This coach has no pre-configured grounds. Please enter the ground name and address below.
                    </Text>
                  </View>
                ) : coachGroundLocations.length === 1 ? (
                  <View style={styles.configuredLocationCard} testID="coach-ground-location-display">
                    <View style={styles.configuredLocationHeader}>
                      <MapPin size={16} color={COLORS.navy} />
                      <Text style={styles.configuredLocationTitle}>Coach Facility</Text>
                    </View>
                    <Text style={styles.configuredLocationAddress}>{activeCoachLocation}</Text>
                  </View>
                ) : (
                  <View style={styles.locationSelectorContainer} testID="coach-ground-location-selector">
                    <Text style={styles.selectorLabel}>Select Training Facility / Ground:</Text>
                    <View style={styles.rowWrap}>
                      {coachGroundLocations.map((loc, idx) => {
                        const isSelected = activeCoachLocation === loc;
                        return (
                          <TouchableOpacity
                            key={loc}
                            style={[
                              styles.locationOptionPill,
                              isSelected && styles.locationOptionPillSelected,
                            ]}
                            onPress={() => setSelectedCoachLocation(loc)}
                            testID={`coach-ground-option-${idx}`}
                          >
                            <MapPin size={12} color={isSelected ? COLORS.navy : COLORS.textSecondary} />
                            <Text
                              style={[
                                styles.locationOptionText,
                                isSelected && styles.locationOptionTextSelected,
                              ]}
                            >
                              {loc}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                    {activeCoachLocation ? (
                      <View style={styles.configuredLocationCard} testID="coach-ground-location-display">
                        <View style={styles.configuredLocationHeader}>
                          <MapPin size={16} color={COLORS.navy} />
                          <Text style={styles.configuredLocationTitle}>Selected Ground</Text>
                        </View>
                        <Text style={styles.configuredLocationAddress}>{activeCoachLocation}</Text>
                      </View>
                    ) : (
                      <Text style={styles.subtleMuted} testID="prompt-select-ground-location">
                        Please select a training facility from the options above.
                      </Text>
                    )}
                  </View>
                )}

                <View style={styles.inputGroup}>
                  <Text style={styles.subFieldLabel}>
                    {coachGroundLocations.length > 0 ? 'Ground Name & Address (Optional)' : 'Ground Name & Address *'}
                  </Text>
                  <TextInput
                    style={styles.textInput}
                    value={trainingAddress}
                    onChangeText={(val) => {
                      userEditedAddressRef.current = true;
                      setTrainingAddress(val);
                    }}
                    placeholder={activeCoachLocation || "e.g. Kanteerava Outdoor Stadium, Gate 3"}
                    placeholderTextColor={COLORS.textMuted}
                    testID="input-booking-address"
                  />
                </View>
              </View>
            )}

            {/* Location Summary Preview */}
            {effectiveLoc.address ? (
              <View style={styles.locationSummaryBox} testID="location-summary-preview">
                <View style={styles.locationSummaryHeader}>
                  <MapPin size={14} color={COLORS.navy} />
                  <Text style={styles.locationSummaryTitle}>LOCATION SUMMARY</Text>
                </View>
                <Text style={styles.locationSummaryAddress} testID="location-summary-address">
                  {effectiveLoc.address}
                </Text>
                {effectiveLoc.coordinates ? (
                  <View style={styles.summaryCoordsBadge} testID="summary-coordinates-preview">
                    <Navigation size={12} color="#047857" />
                    <Text style={styles.summaryCoordsText} testID="location-summary-coords">
                      {`GPS: ${effectiveLoc.coordinates.latitude.toFixed(4)}, ${effectiveLoc.coordinates.longitude.toFixed(4)}`}
                    </Text>
                  </View>
                ) : null}
              </View>
            ) : null}

            <View style={styles.inputGroup}>
              <Text style={styles.fieldSubLabel}>Your Contact Phone (for confirmed sessions)</Text>
              <TextInput
                style={styles.textInput}
                value={customerPhone}
                onChangeText={setCustomerPhone}
                placeholder="+919876543210"
                placeholderTextColor={COLORS.textMuted}
                keyboardType="phone-pad"
                testID="input-booking-phone"
              />
            </View>

            {/* Submit Action */}
            <View style={styles.submitContainer}>
              <Button
                title={isSubmitting ? 'Submitting Request...' : 'Submit Booking Request'}
                variant="primary"
                onPress={handleSubmit}
                loading={isSubmitting}
                disabled={isSubmitting}
                style={styles.submitButton}
              />
            </View>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: COLORS.white,
    borderTopLeftRadius: RADII.xl,
    borderTopRightRadius: RADII.xl,
    maxHeight: '90%',
    padding: SPACING.lg,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.md,
    paddingBottom: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  modalTitle: {
    ...TYPOGRAPHY.h2,
    fontSize: 18,
    color: COLORS.navy,
  },
  closeBtn: {
    padding: 4,
  },
  formScroll: {
    marginBottom: SPACING.md,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FCA5A5',
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
    color: '#991B1B',
    flex: 1,
  },
  inputLabel: {
    ...TYPOGRAPHY.caption,
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.textMuted,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginTop: SPACING.sm,
    marginBottom: 6,
  },
  fieldSubLabel: {
    ...TYPOGRAPHY.caption,
    fontSize: 12,
    color: COLORS.textSecondary,
    marginBottom: 4,
  },
  inputGroup: {
    marginBottom: SPACING.sm,
  },
  twoColumnRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  halfColumn: {
    flex: 1,
  },
  textInput: {
    backgroundColor: COLORS.mist,
    borderRadius: RADII.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: SPACING.md,
    paddingVertical: 10,
    fontSize: 14,
    color: COLORS.navy,
  },
  chipScroll: {
    marginBottom: SPACING.sm,
  },
  coachChip: {
    backgroundColor: COLORS.mist,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: RADII.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginRight: SPACING.sm,
  },
  coachChipSelected: {
    backgroundColor: COLORS.navy,
    borderColor: COLORS.navy,
  },
  coachChipName: {
    ...TYPOGRAPHY.bodyBold,
    fontSize: 13,
    color: COLORS.navy,
  },
  coachChipNameSelected: {
    color: COLORS.white,
  },
  coachChipRate: {
    ...TYPOGRAPHY.caption,
    fontSize: 11,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  coachChipRateSelected: {
    color: COLORS.lime,
  },
  rowWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.xs,
    marginBottom: SPACING.sm,
  },
  optionPill: {
    backgroundColor: COLORS.mist,
    paddingHorizontal: SPACING.md,
    paddingVertical: 7,
    borderRadius: RADII.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  optionPillSelected: {
    backgroundColor: COLORS.lime,
    borderColor: '#BFE75F',
  },
  optionPillText: {
    ...TYPOGRAPHY.caption,
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.navy,
  },
  optionPillTextSelected: {
    color: COLORS.navy,
    fontWeight: '700',
  },
  loader: {
    marginVertical: SPACING.sm,
  },
  subtleError: {
    ...TYPOGRAPHY.caption,
    color: '#DC2626',
    marginBottom: SPACING.sm,
  },
  coachErrorContainer: {
    paddingVertical: SPACING.xs,
    marginBottom: SPACING.sm,
  },
  retryButton: {
    alignSelf: 'flex-start',
    backgroundColor: COLORS.mist,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
    borderRadius: RADII.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginTop: 4,
  },
  retryButtonText: {
    ...TYPOGRAPHY.caption,
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.navy,
  },
  subtleMuted: {
    ...TYPOGRAPHY.caption,
    color: COLORS.textMuted,
    marginBottom: SPACING.sm,
  },
  submitContainer: {
    marginTop: SPACING.md,
    marginBottom: SPACING.xl,
  },
  submitButton: {
    width: '100%',
  },
  venueSection: {
    marginTop: SPACING.xs,
    marginBottom: SPACING.sm,
  },
  subLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.xs,
  },
  subFieldLabel: {
    ...TYPOGRAPHY.caption,
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.textSecondary,
    marginBottom: 4,
  },
  configuredLocationCard: {
    backgroundColor: COLORS.mist,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADII.sm,
    padding: SPACING.sm,
    marginBottom: SPACING.sm,
  },
  configuredLocationHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  configuredLocationTitle: {
    ...TYPOGRAPHY.bodyBold,
    fontSize: 13,
    color: COLORS.navy,
  },
  configuredLocationAddress: {
    ...TYPOGRAPHY.body,
    fontSize: 13,
    color: COLORS.navy,
    marginBottom: 4,
  },
  configuredLocationSub: {
    ...TYPOGRAPHY.caption,
    fontSize: 11,
    color: COLORS.textSecondary,
  },
  warningNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#FCD34D',
    borderRadius: RADII.sm,
    padding: SPACING.sm,
    marginBottom: SPACING.sm,
  },
  warningNoticeText: {
    ...TYPOGRAPHY.caption,
    fontSize: 12,
    color: '#92400E',
    flex: 1,
  },
  detectLocationBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: COLORS.mist,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADII.sm,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 4,
  },
  detectLocationBtnText: {
    ...TYPOGRAPHY.caption,
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.navy,
  },
  detectNoticeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: SPACING.xs,
    marginBottom: SPACING.xs,
  },
  detectNoticeText: {
    ...TYPOGRAPHY.caption,
    fontSize: 12,
    color: COLORS.navy,
  },
  detectNoticeSuccess: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    borderRadius: RADII.sm,
    padding: SPACING.xs,
    marginBottom: SPACING.sm,
  },
  detectNoticeSuccessText: {
    ...TYPOGRAPHY.caption,
    fontSize: 11,
    fontWeight: '600',
    color: '#065F46',
  },
  detectNoticeError: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FCA5A5',
    borderRadius: RADII.sm,
    padding: SPACING.xs,
    marginBottom: SPACING.sm,
  },
  detectNoticeErrorText: {
    ...TYPOGRAPHY.caption,
    fontSize: 11,
    color: '#991B1B',
    flex: 1,
  },
  detectedAddressCard: {
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    borderRadius: RADII.sm,
    padding: SPACING.sm,
    marginBottom: SPACING.sm,
  },
  detectedAddressHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  detectedAddressLabel: {
    ...TYPOGRAPHY.caption,
    fontSize: 11,
    fontWeight: '700',
    color: '#1E40AF',
    letterSpacing: 0.3,
  },
  detectedAddressText: {
    ...TYPOGRAPHY.body,
    fontSize: 12,
    color: COLORS.navy,
  },
  privacyNoticeBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: RADII.sm,
    padding: SPACING.sm,
    marginBottom: SPACING.sm,
  },
  privacyNoticeText: {
    ...TYPOGRAPHY.caption,
    fontSize: 11,
    color: COLORS.navy,
    flex: 1,
    lineHeight: 16,
  },
  locationSummaryBox: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: RADII.sm,
    padding: SPACING.sm,
    marginTop: SPACING.xs,
    marginBottom: SPACING.sm,
  },
  locationSummaryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  locationSummaryTitle: {
    ...TYPOGRAPHY.caption,
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.navy,
    letterSpacing: 0.5,
  },
  locationSummaryAddress: {
    ...TYPOGRAPHY.body,
    fontSize: 13,
    color: COLORS.navy,
  },
  summaryCoordsBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
  },
  summaryCoordsText: {
    ...TYPOGRAPHY.caption,
    fontSize: 11,
    fontWeight: '600',
    color: '#047857',
  },
  locationSelectorContainer: {
    marginBottom: SPACING.sm,
  },
  selectorLabel: {
    ...TYPOGRAPHY.caption,
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.navy,
    marginBottom: SPACING.xs,
    letterSpacing: 0.5,
  },
  locationOptionPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: COLORS.mist,
    paddingHorizontal: SPACING.md,
    paddingVertical: 7,
    borderRadius: RADII.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginRight: SPACING.xs,
    marginBottom: SPACING.xs,
  },
  locationOptionPillSelected: {
    backgroundColor: COLORS.lime,
    borderColor: '#BFE75F',
  },
  locationOptionText: {
    ...TYPOGRAPHY.caption,
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.navy,
  },
  locationOptionTextSelected: {
    color: COLORS.navy,
    fontWeight: '700',
  },
});
