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
  X,
  AlertCircle,
  CheckCircle2,
  MapPin,
  Sparkles,
  RefreshCw,
  Award,
  DollarSign,
  Briefcase,
  Layers,
} from 'lucide-react-native';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/Button';
import { Badge } from '../components/Badge';
import { COLORS, RADII, SPACING, TYPOGRAPHY } from '../theme/tokens';
import {
  getCoachProfile,
  updateCoachProfile,
  CoachProfile,
  CoachDiscipline,
  SessionFormat,
  VenueType,
  COACH_DISCIPLINES,
  SESSION_FORMATS,
  VENUE_TYPES,
  UpdateCoachProfileInput,
  AuthApiError,
} from '../services/coachApi';

export interface CoachProfileEditScreenProps {
  onBack?: () => void;
  navigation?: any;
}

const DISCIPLINE_LABELS: Record<CoachDiscipline, string> = {
  boxing: 'Boxing',
  wushu: 'Wushu',
  kickboxing: 'Kickboxing',
};

const SESSION_FORMAT_LABELS: Record<SessionFormat, string> = {
  one_on_one: '1-on-1 Private',
  small_group: 'Small Group (2–6)',
};

const VENUE_TYPE_LABELS: Record<VenueType, string> = {
  coach_home: 'Coach Studio / Home',
  customer_home: "Athlete's Home",
  ground: 'Outdoor / Sports Ground',
};

const MAX_BIO_LENGTH = 1000;
const MAX_SPECIALTY_LENGTH = 40;
const MAX_SPECIALTIES_COUNT = 5;
const MAX_LOCATION_LENGTH = 100;
const MAX_LOCATIONS_COUNT = 5;
const MIN_HOURLY_RATE = 100;
const MAX_HOURLY_RATE = 20000;

export const CoachProfileEditScreen: React.FC<CoachProfileEditScreenProps> = ({
  onBack,
  navigation,
}) => {
  const insets = useSafeAreaInsets();
  const { token, user } = useAuth();

  // Screen & API state
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);
  const [savedProfile, setSavedProfile] = useState<CoachProfile | null>(null);
  const [isComplete, setIsComplete] = useState<boolean>(false);

  // Form input fields
  const [bio, setBio] = useState<string>('');
  const [disciplines, setDisciplines] = useState<CoachDiscipline[]>([]);
  const [specialties, setSpecialties] = useState<string[]>([]);
  const [newSpecialty, setNewSpecialty] = useState<string>('');
  const [specialtyError, setSpecialtyError] = useState<string | null>(null);

  const [sessionFormats, setSessionFormats] = useState<SessionFormat[]>([]);
  const [venueTypes, setVenueTypes] = useState<VenueType[]>([]);

  const [hourlyRate, setHourlyRate] = useState<string>('');
  const [hourlyRateError, setHourlyRateError] = useState<string | null>(null);

  const [locations, setLocations] = useState<string[]>([]);
  const [newLocation, setNewLocation] = useState<string>('');
  const [locationError, setLocationError] = useState<string | null>(null);

  const isMountedRef = useRef<boolean>(true);
  const isSavingRef = useRef<boolean>(false);

  // Load existing profile from backend
  const loadProfile = useCallback(async () => {
    if (!token) {
      setFetchError('Authentication required. Missing token.');
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setFetchError(null);

    try {
      const response = await getCoachProfile(token);
      if (!isMountedRef.current) return;

      if (response.profile) {
        setSavedProfile(response.profile);
        setIsComplete(response.isComplete);
        setBio(response.profile.bio || '');
        setDisciplines(response.profile.disciplines || []);
        setSpecialties(response.profile.specialties || []);
        setSessionFormats(response.profile.sessionFormats || []);
        setVenueTypes(response.profile.venueTypes || []);
        setHourlyRate(
          response.profile.hourlyRate !== undefined && response.profile.hourlyRate !== null
            ? String(response.profile.hourlyRate)
            : ''
        );
        setLocations(response.profile.locations || []);
      } else {
        // New coach without existing profile
        setSavedProfile(null);
        setIsComplete(false);
        setBio('');
        setDisciplines([]);
        setSpecialties([]);
        setSessionFormats([]);
        setVenueTypes([]);
        setHourlyRate('');
        setLocations([]);
      }
    } catch (err) {
      if (!isMountedRef.current) return;
      const message =
        err instanceof AuthApiError
          ? err.message
          : 'Unable to load coach profile. Please try again.';
      setFetchError(message);
    } finally {
      if (isMountedRef.current) {
        setIsLoading(false);
      }
    }
  }, [token]);

  useEffect(() => {
    isMountedRef.current = true;
    loadProfile();
    return () => {
      isMountedRef.current = false;
    };
  }, [loadProfile]);

  const handleBack = () => {
    if (onBack) {
      onBack();
    } else if (navigation && typeof navigation.goBack === 'function') {
      navigation.goBack();
    }
  };

  // Toggle discipline selection
  const toggleDiscipline = (disc: CoachDiscipline) => {
    setDisciplines((prev) =>
      prev.includes(disc) ? prev.filter((d) => d !== disc) : [...prev, disc]
    );
    if (saveSuccess) setSaveSuccess(null);
  };

  // Add specialty
  const handleAddSpecialty = () => {
    const trimmed = newSpecialty.trim();
    if (!trimmed) return;

    if (specialties.length >= MAX_SPECIALTIES_COUNT) {
      setSpecialtyError(`Maximum ${MAX_SPECIALTIES_COUNT} specialties allowed.`);
      return;
    }

    if (trimmed.length > MAX_SPECIALTY_LENGTH) {
      setSpecialtyError(`Specialty cannot exceed ${MAX_SPECIALTY_LENGTH} characters.`);
      return;
    }

    if (specialties.some((s) => s.toLowerCase() === trimmed.toLowerCase())) {
      setSpecialtyError('Specialty already added.');
      return;
    }

    setSpecialties((prev) => [...prev, trimmed]);
    setNewSpecialty('');
    setSpecialtyError(null);
    if (saveSuccess) setSaveSuccess(null);
  };

  const handleRemoveSpecialty = (index: number) => {
    setSpecialties((prev) => prev.filter((_, i) => i !== index));
    if (saveSuccess) setSaveSuccess(null);
  };

  // Toggle session format selection
  const toggleSessionFormat = (format: SessionFormat) => {
    setSessionFormats((prev) =>
      prev.includes(format) ? prev.filter((f) => f !== format) : [...prev, format]
    );
    if (saveSuccess) setSaveSuccess(null);
  };

  // Toggle venue type selection
  const toggleVenueType = (venue: VenueType) => {
    setVenueTypes((prev) =>
      prev.includes(venue) ? prev.filter((v) => v !== venue) : [...prev, venue]
    );
    if (saveSuccess) setSaveSuccess(null);
  };

  // Add location
  const handleAddLocation = () => {
    const trimmed = newLocation.trim();
    if (!trimmed) return;

    if (locations.length >= MAX_LOCATIONS_COUNT) {
      setLocationError(`Maximum ${MAX_LOCATIONS_COUNT} locations allowed.`);
      return;
    }

    if (trimmed.length > MAX_LOCATION_LENGTH) {
      setLocationError(`Location cannot exceed ${MAX_LOCATION_LENGTH} characters.`);
      return;
    }

    if (locations.some((l) => l.toLowerCase() === trimmed.toLowerCase())) {
      setLocationError('Location already added.');
      return;
    }

    setLocations((prev) => [...prev, trimmed]);
    setNewLocation('');
    setLocationError(null);
    if (saveSuccess) setSaveSuccess(null);
  };

  const handleRemoveLocation = (index: number) => {
    setLocations((prev) => prev.filter((_, i) => i !== index));
    if (saveSuccess) setSaveSuccess(null);
  };

  // Client-side form validation before submission
  const validateForm = (): boolean => {
    setSaveError(null);
    setHourlyRateError(null);

    // Validate bio
    if (bio.trim().length > MAX_BIO_LENGTH) {
      setSaveError(`Bio cannot exceed ${MAX_BIO_LENGTH} characters.`);
      return false;
    }

    // Validate hourly rate if entered
    const rateText = hourlyRate.trim();
    if (rateText.length > 0) {
      const parsedRate = Number(rateText);
      if (isNaN(parsedRate) || !isFinite(parsedRate)) {
        setHourlyRateError('Please enter a valid numeric hourly rate.');
        setSaveError('Please correct the hourly rate.');
        return false;
      }

      if (parsedRate < MIN_HOURLY_RATE || parsedRate > MAX_HOURLY_RATE) {
        setHourlyRateError(`Hourly rate must be between ₹${MIN_HOURLY_RATE} and ₹${MAX_HOURLY_RATE}.`);
        setSaveError(`Hourly rate must be between ₹${MIN_HOURLY_RATE} and ₹${MAX_HOURLY_RATE}.`);
        return false;
      }

      if (Number(parsedRate.toFixed(2)) !== parsedRate) {
        setHourlyRateError('Hourly rate can have at most two decimal places.');
        setSaveError('Hourly rate can have at most two decimal places.');
        return false;
      }
    }

    return true;
  };

  // Handle Save
  const handleSave = async () => {
    if (isSavingRef.current || isSaving) return;

    if (!token) {
      setSaveError('Authentication required. Missing token.');
      return;
    }

    if (!validateForm()) return;

    isSavingRef.current = true;
    setIsSaving(true);
    setSaveError(null);
    setSaveSuccess(null);

    // Build typed partial update input
    const payload: UpdateCoachProfileInput = {
      bio: bio.trim(),
      disciplines,
      specialties,
      sessionFormats,
      venueTypes,
      locations,
    };

    const rateText = hourlyRate.trim();
    if (rateText.length > 0) {
      payload.hourlyRate = Number(Number(rateText).toFixed(2));
    }

    try {
      const response = await updateCoachProfile(token, payload);
      if (!isMountedRef.current) return;

      if (response.profile) {
        setSavedProfile(response.profile);
        setIsComplete(response.isComplete);
        setBio(response.profile.bio || '');
        setDisciplines(response.profile.disciplines || []);
        setSpecialties(response.profile.specialties || []);
        setSessionFormats(response.profile.sessionFormats || []);
        setVenueTypes(response.profile.venueTypes || []);
        setHourlyRate(
          response.profile.hourlyRate !== undefined && response.profile.hourlyRate !== null
            ? String(response.profile.hourlyRate)
            : ''
        );
        setLocations(response.profile.locations || []);
      }

      setSaveSuccess(response.message || 'Coach profile saved successfully.');
    } catch (err) {
      if (!isMountedRef.current) return;
      const message =
        err instanceof AuthApiError
          ? err.message
          : 'Failed to save coach profile. Please try again.';
      setSaveError(message);
    } finally {
      isSavingRef.current = false;
      if (isMountedRef.current) {
        setIsSaving(false);
      }
    }
  };

  // Render initial loading state
  if (isLoading) {
    return (
      <View style={[styles.container, styles.centerContainer, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color={COLORS.navy} testID="profile-loading-indicator" />
        <Text style={styles.loadingText}>Loading coach profile...</Text>
      </View>
    );
  }

  // Render initial fetch failure state with retry
  if (fetchError && !savedProfile) {
    return (
      <View style={[styles.container, styles.centerContainer, { paddingTop: insets.top }]}>
        <View style={styles.errorIconWrap}>
          <AlertCircle size={36} color="#DC2626" />
        </View>
        <Text style={styles.errorTitle}>Unable to Load Profile</Text>
        <Text style={styles.errorDescription}>{fetchError}</Text>
        <Button
          title="Retry"
          variant="primary"
          onPress={loadProfile}
          icon={<RefreshCw size={16} color={COLORS.navy} />}
          style={styles.retryButton}
        />
        {onBack ? (
          <TouchableOpacity onPress={handleBack} style={styles.cancelLink} accessibilityRole="button">
            <Text style={styles.cancelLinkText}>Back to Studio</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={[styles.container, { paddingTop: insets.top }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* Top Header Navigation */}
      <View style={styles.topBar}>
        <TouchableOpacity
          onPress={handleBack}
          style={styles.backButton}
          accessibilityRole="button"
          accessibilityLabel="Back to Coach Studio"
          disabled={isSaving}
          testID="editor-back-button"
        >
          <ArrowLeft size={20} color={COLORS.navy} />
          <Text style={styles.backText}>Studio</Text>
        </TouchableOpacity>
        <Text style={styles.topTitle}>Coach Profile Editor</Text>
        <View style={styles.topRightPlaceholder}>
          <Badge
            label={savedProfile ? (isComplete ? 'Complete' : 'Draft') : 'New'}
            variant={isComplete ? 'success' : 'demo'}
          />
        </View>
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: insets.bottom + SPACING.xxxl },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Intro Header */}
        <View style={styles.introHeader}>
          <Text style={styles.introHeading}>Your Coaching Profile</Text>
          <Text style={styles.introSubtext}>
            Set up your martial arts background, training disciplines, rates, and venues. You can
            save draft updates anytime.
          </Text>
        </View>

        {/* Guidance Notice for New Coach */}
        {!savedProfile ? (
          <View style={styles.noticeCard} testID="new-coach-guidance">
            <View style={styles.noticeIconWrap}>
              <Sparkles size={18} color={COLORS.navy} />
            </View>
            <View style={styles.noticeContent}>
              <Text style={styles.noticeTitle}>New Coach Profile</Text>
              <Text style={styles.noticeText}>
                You have not created a coaching profile yet. Fill in your details below to get
                started. Partial drafts are supported.
              </Text>
            </View>
          </View>
        ) : null}

        {/* Success Banner */}
        {saveSuccess ? (
          <View style={styles.successBanner} accessibilityRole="alert" testID="save-success-banner">
            <CheckCircle2 size={18} color={COLORS.success} style={styles.bannerIcon} />
            <View style={styles.bannerTextWrap}>
              <Text style={styles.successBannerTitle}>{saveSuccess}</Text>
              <Text style={styles.successBannerSubtitle}>
                {isComplete
                  ? 'Your profile contains all operational fields for booking readiness.'
                  : 'Profile saved as a draft. Fill in remaining fields to complete your profile.'}
              </Text>
            </View>
          </View>
        ) : null}

        {/* Error Banner */}
        {saveError ? (
          <View style={styles.errorBanner} accessibilityRole="alert" testID="save-error-banner">
            <AlertCircle size={18} color="#DC2626" style={styles.bannerIcon} />
            <Text style={styles.errorBannerText}>{saveError}</Text>
          </View>
        ) : null}

        {/* SECTION 1: Personal & Coaching Bio */}
        <View style={styles.sectionCard}>
          <View style={styles.sectionHeaderRow}>
            <View style={styles.sectionTitleGroup}>
              <Award size={18} color={COLORS.navy} />
              <Text style={styles.sectionTitle}>Coaching Bio</Text>
            </View>
            <Text style={styles.characterCount}>
              {bio.length}/{MAX_BIO_LENGTH}
            </Text>
          </View>
          <Text style={styles.fieldGuide}>
            Share your competitive background, certifications, teaching style, and athletic philosophy.
          </Text>
          <TextInput
            style={styles.multilineInput}
            placeholder="e.g. State-level boxing champion with 8+ years coaching athletes from beginner fundamentals to competitive bouts..."
            placeholderTextColor={COLORS.textMuted}
            value={bio}
            onChangeText={(text) => {
              setBio(text);
              if (saveSuccess) setSaveSuccess(null);
              if (saveError) setSaveError(null);
            }}
            multiline
            numberOfLines={4}
            maxLength={MAX_BIO_LENGTH}
            editable={!isSaving}
            accessibilityLabel="Coaching bio multiline input"
            testID="input-bio"
          />
        </View>

        {/* SECTION 2: Disciplines */}
        <View style={styles.sectionCard}>
          <View style={styles.sectionHeaderRow}>
            <View style={styles.sectionTitleGroup}>
              <Briefcase size={18} color={COLORS.navy} />
              <Text style={styles.sectionTitle}>Disciplines</Text>
            </View>
            <Text style={styles.fieldRequiredNote}>1+ Required</Text>
          </View>
          <Text style={styles.fieldGuide}>
            Select the martial arts disciplines you actively coach.
          </Text>
          <View style={styles.chipsContainer} testID="disciplines-selector">
            {COACH_DISCIPLINES.map((disc) => {
              const selected = disciplines.includes(disc);
              return (
                <TouchableOpacity
                  key={disc}
                  onPress={() => toggleDiscipline(disc)}
                  style={[styles.chip, selected && styles.chipSelected]}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: selected }}
                  accessibilityLabel={`Discipline ${DISCIPLINE_LABELS[disc]}`}
                  disabled={isSaving}
                  testID={`discipline-chip-${disc}`}
                >
                  <View style={[styles.checkboxIndicator, selected && styles.checkboxIndicatorSelected]}>
                    {selected ? <Check size={12} color={COLORS.navy} strokeWidth={3} /> : null}
                  </View>
                  <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
                    {DISCIPLINE_LABELS[disc]}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* SECTION 3: Specialties */}
        <View style={styles.sectionCard}>
          <View style={styles.sectionHeaderRow}>
            <View style={styles.sectionTitleGroup}>
              <Layers size={18} color={COLORS.navy} />
              <Text style={styles.sectionTitle}>Specialties</Text>
            </View>
            <Text style={styles.characterCount}>
              {specialties.length}/{MAX_SPECIALTIES_COUNT}
            </Text>
          </View>
          <Text style={styles.fieldGuide}>
            Highlight specific focus areas (e.g. Footwork, Defensive Countering, Conditioning, Sparring).
          </Text>

          {/* Specialty Input + Add Button */}
          <View style={styles.addItemRow}>
            <TextInput
              style={styles.addItemInput}
              placeholder="e.g. Footwork & Angles"
              placeholderTextColor={COLORS.textMuted}
              value={newSpecialty}
              onChangeText={(text) => {
                setNewSpecialty(text);
                if (specialtyError) setSpecialtyError(null);
              }}
              maxLength={MAX_SPECIALTY_LENGTH}
              editable={!isSaving && specialties.length < MAX_SPECIALTIES_COUNT}
              accessibilityLabel="Add new specialty input"
              testID="input-new-specialty"
            />
            <Button
              title="Add"
              variant="outline"
              onPress={handleAddSpecialty}
              disabled={isSaving || !newSpecialty.trim() || specialties.length >= MAX_SPECIALTIES_COUNT}
              style={styles.addButton}
              icon={<Plus size={16} color={COLORS.navy} />}
            />
          </View>
          {specialtyError ? (
            <Text style={styles.inlineErrorText} testID="specialty-inline-error">
              {specialtyError}
            </Text>
          ) : null}

          {/* Specialties Tag List */}
          {specialties.length > 0 ? (
            <View style={styles.tagsContainer} testID="specialties-list">
              {specialties.map((spec, index) => (
                <View key={index} style={styles.tagPill}>
                  <Text style={styles.tagText}>{spec}</Text>
                  <TouchableOpacity
                    onPress={() => handleRemoveSpecialty(index)}
                    style={styles.tagRemoveBtn}
                    accessibilityRole="button"
                    accessibilityLabel={`Remove specialty ${spec}`}
                    disabled={isSaving}
                    testID={`remove-specialty-${index}`}
                  >
                    <X size={14} color={COLORS.navy} />
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          ) : (
            <Text style={styles.emptyListText}>No specialties added yet.</Text>
          )}
        </View>

        {/* SECTION 4: Session Formats & Venue Types */}
        <View style={styles.sectionCard}>
          <View style={styles.sectionHeaderRow}>
            <View style={styles.sectionTitleGroup}>
              <Briefcase size={18} color={COLORS.navy} />
              <Text style={styles.sectionTitle}>Session Formats</Text>
            </View>
            <Text style={styles.fieldRequiredNote}>1+ Required</Text>
          </View>
          <Text style={styles.fieldGuide}>Choose how you can deliver training sessions.</Text>
          <View style={styles.chipsContainer} testID="session-formats-selector">
            {SESSION_FORMATS.map((fmt) => {
              const selected = sessionFormats.includes(fmt);
              return (
                <TouchableOpacity
                  key={fmt}
                  onPress={() => toggleSessionFormat(fmt)}
                  style={[styles.chip, selected && styles.chipSelected]}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: selected }}
                  accessibilityLabel={`Session format ${SESSION_FORMAT_LABELS[fmt]}`}
                  disabled={isSaving}
                  testID={`session-format-chip-${fmt}`}
                >
                  <View style={[styles.checkboxIndicator, selected && styles.checkboxIndicatorSelected]}>
                    {selected ? <Check size={12} color={COLORS.navy} strokeWidth={3} /> : null}
                  </View>
                  <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
                    {SESSION_FORMAT_LABELS[fmt]}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <View style={[styles.sectionHeaderRow, { marginTop: SPACING.lg }]}>
            <View style={styles.sectionTitleGroup}>
              <MapPin size={18} color={COLORS.navy} />
              <Text style={styles.sectionTitle}>Training Venues</Text>
            </View>
            <Text style={styles.fieldRequiredNote}>1+ Required</Text>
          </View>
          <Text style={styles.fieldGuide}>Select where you are willing to conduct sessions.</Text>
          <View style={styles.chipsContainer} testID="venue-types-selector">
            {VENUE_TYPES.map((vType) => {
              const selected = venueTypes.includes(vType);
              return (
                <TouchableOpacity
                  key={vType}
                  onPress={() => toggleVenueType(vType)}
                  style={[styles.chip, selected && styles.chipSelected]}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: selected }}
                  accessibilityLabel={`Venue type ${VENUE_TYPE_LABELS[vType]}`}
                  disabled={isSaving}
                  testID={`venue-type-chip-${vType}`}
                >
                  <View style={[styles.checkboxIndicator, selected && styles.checkboxIndicatorSelected]}>
                    {selected ? <Check size={12} color={COLORS.navy} strokeWidth={3} /> : null}
                  </View>
                  <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
                    {VENUE_TYPE_LABELS[vType]}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* SECTION 5: Hourly Rate */}
        <View style={styles.sectionCard}>
          <View style={styles.sectionHeaderRow}>
            <View style={styles.sectionTitleGroup}>
              <DollarSign size={18} color={COLORS.navy} />
              <Text style={styles.sectionTitle}>Hourly Rate (INR)</Text>
            </View>
            <Text style={styles.fieldRequiredNote}>₹100–₹20,000</Text>
          </View>
          <Text style={styles.fieldGuide}>
            Your standard coaching rate per hour in Indian Rupees (₹).
          </Text>
          <View style={styles.rateInputRow}>
            <View style={styles.currencyPrefixBox}>
              <Text style={styles.currencyPrefixText}>₹</Text>
            </View>
            <TextInput
              style={styles.rateInput}
              placeholder="e.g. 1500"
              placeholderTextColor={COLORS.textMuted}
              value={hourlyRate}
              onChangeText={(text) => {
                setHourlyRate(text);
                if (hourlyRateError) setHourlyRateError(null);
                if (saveSuccess) setSaveSuccess(null);
                if (saveError) setSaveError(null);
              }}
              keyboardType="decimal-pad"
              editable={!isSaving}
              accessibilityLabel="Hourly rate input in INR"
              testID="input-hourly-rate"
            />
          </View>
          {hourlyRateError ? (
            <Text style={styles.inlineErrorText} testID="hourly-rate-inline-error">
              {hourlyRateError}
            </Text>
          ) : null}
        </View>

        {/* SECTION 6: Locations */}
        <View style={styles.sectionCard}>
          <View style={styles.sectionHeaderRow}>
            <View style={styles.sectionTitleGroup}>
              <MapPin size={18} color={COLORS.navy} />
              <Text style={styles.sectionTitle}>Service Locations</Text>
            </View>
            <Text style={styles.characterCount}>
              {locations.length}/{MAX_LOCATIONS_COUNT}
            </Text>
          </View>
          <Text style={styles.fieldGuide}>
            Add areas, neighborhoods, or complexes where you coach (e.g. Bandra West, Shivaji Park, Sports Complex).
          </Text>

          {/* Location Input + Add Button */}
          <View style={styles.addItemRow}>
            <TextInput
              style={styles.addItemInput}
              placeholder="e.g. Bandra West, Mumbai"
              placeholderTextColor={COLORS.textMuted}
              value={newLocation}
              onChangeText={(text) => {
                setNewLocation(text);
                if (locationError) setLocationError(null);
              }}
              maxLength={MAX_LOCATION_LENGTH}
              editable={!isSaving && locations.length < MAX_LOCATIONS_COUNT}
              accessibilityLabel="Add new location input"
              testID="input-new-location"
            />
            <Button
              title="Add"
              variant="outline"
              onPress={handleAddLocation}
              disabled={isSaving || !newLocation.trim() || locations.length >= MAX_LOCATIONS_COUNT}
              style={styles.addButton}
              icon={<Plus size={16} color={COLORS.navy} />}
            />
          </View>
          {locationError ? (
            <Text style={styles.inlineErrorText} testID="location-inline-error">
              {locationError}
            </Text>
          ) : null}

          {/* Locations Tag List */}
          {locations.length > 0 ? (
            <View style={styles.locationListContainer} testID="locations-list">
              {locations.map((loc, index) => (
                <View key={index} style={styles.locationItemRow}>
                  <MapPin size={16} color={COLORS.navyMuted} style={styles.locationPinIcon} />
                  <Text style={styles.locationItemText}>{loc}</Text>
                  <TouchableOpacity
                    onPress={() => handleRemoveLocation(index)}
                    style={styles.tagRemoveBtn}
                    accessibilityRole="button"
                    accessibilityLabel={`Remove location ${loc}`}
                    disabled={isSaving}
                    testID={`remove-location-${index}`}
                  >
                    <X size={16} color={COLORS.navy} />
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          ) : (
            <Text style={styles.emptyListText}>No locations added yet.</Text>
          )}
        </View>

        {/* Operational Completeness Card */}
        <View style={styles.completenessCard} testID="completeness-status-card">
          <View style={styles.completenessHeaderRow}>
            <Text style={styles.completenessHeading}>Profile Readiness</Text>
            <Badge
              label={isComplete ? 'Ready for Bookings' : 'Draft Incomplete'}
              variant={isComplete ? 'success' : 'demo'}
            />
          </View>
          <Text style={styles.completenessDescription}>
            {isComplete
              ? 'All required fields (bio, discipline, session format, venue, hourly rate, and location) are populated and operationally ready.'
              : 'Draft mode: Fill in a bio, at least 1 discipline, 1 format, 1 venue, a valid rate, and 1 location to complete your profile.'}
          </Text>
          <Text style={styles.verificationDisclaimer}>
            Note: Profile completeness reflects operational readiness for onboarding and booking. It
            does not imply that coach credentials or identity have been administratively verified by
            AthleteConnect.
          </Text>
        </View>

        {/* Primary Save Action Button */}
        <View style={styles.actionContainer} testID="save-profile-container">
          <Button
            title={isSaving ? 'Saving Profile...' : 'Save Profile'}
            variant="primary"
            onPress={handleSave}
            loading={isSaving}
            disabled={isSaving}
            style={styles.saveButton}
          />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.mist,
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
  errorIconWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#FEE2E2',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.md,
  },
  errorTitle: {
    ...TYPOGRAPHY.h2,
    fontSize: 20,
    color: COLORS.navy,
    marginBottom: SPACING.xs,
  },
  errorDescription: {
    ...TYPOGRAPHY.body,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginBottom: SPACING.lg,
    paddingHorizontal: SPACING.lg,
  },
  retryButton: {
    minWidth: 160,
  },
  cancelLink: {
    marginTop: SPACING.md,
    padding: SPACING.sm,
  },
  cancelLinkText: {
    ...TYPOGRAPHY.bodyBold,
    fontSize: 14,
    color: COLORS.navy,
  },
  topBar: {
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg,
    backgroundColor: COLORS.white,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  backText: {
    ...TYPOGRAPHY.bodyBold,
    fontSize: 14,
    color: COLORS.navy,
  },
  topTitle: {
    ...TYPOGRAPHY.h3,
    fontSize: 16,
    color: COLORS.navy,
  },
  topRightPlaceholder: {
    alignItems: 'flex-end',
    minWidth: 60,
  },
  scrollContent: {
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.lg,
  },
  introHeader: {
    marginBottom: SPACING.md,
  },
  introHeading: {
    ...TYPOGRAPHY.h1,
    fontSize: 24,
    lineHeight: 30,
    color: COLORS.navy,
    marginBottom: 4,
  },
  introSubtext: {
    ...TYPOGRAPHY.body,
    fontSize: 13.5,
    lineHeight: 19,
    color: COLORS.textSecondary,
  },
  noticeCard: {
    flexDirection: 'row',
    backgroundColor: COLORS.limeSubtle,
    borderRadius: RADII.md,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: 'rgba(200, 241, 105, 0.6)',
    marginBottom: SPACING.md,
    alignItems: 'flex-start',
    gap: SPACING.sm,
  },
  noticeIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: COLORS.lime,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  noticeContent: {
    flex: 1,
  },
  noticeTitle: {
    ...TYPOGRAPHY.bodyBold,
    fontSize: 13.5,
    color: COLORS.navy,
    marginBottom: 2,
  },
  noticeText: {
    ...TYPOGRAPHY.body,
    fontSize: 12.5,
    lineHeight: 17,
    color: COLORS.textSecondary,
  },
  successBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: COLORS.successLight,
    borderRadius: RADII.md,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.success,
    marginBottom: SPACING.md,
    gap: SPACING.sm,
  },
  bannerIcon: {
    marginTop: 2,
    flexShrink: 0,
  },
  bannerTextWrap: {
    flex: 1,
  },
  successBannerTitle: {
    ...TYPOGRAPHY.bodyBold,
    fontSize: 13.5,
    color: COLORS.success,
    marginBottom: 2,
  },
  successBannerSubtitle: {
    ...TYPOGRAPHY.body,
    fontSize: 12,
    lineHeight: 16,
    color: COLORS.navy,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF2F2',
    borderRadius: RADII.md,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: '#FECACA',
    marginBottom: SPACING.md,
    gap: SPACING.sm,
  },
  errorBannerText: {
    ...TYPOGRAPHY.body,
    fontSize: 13,
    color: '#991B1B',
    flex: 1,
  },
  sectionCard: {
    backgroundColor: COLORS.white,
    borderRadius: RADII.lg,
    padding: SPACING.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: SPACING.md,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  sectionTitleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sectionTitle: {
    ...TYPOGRAPHY.h3,
    fontSize: 16,
    color: COLORS.navy,
  },
  characterCount: {
    ...TYPOGRAPHY.caption,
    fontSize: 12,
    color: COLORS.textMuted,
  },
  fieldRequiredNote: {
    ...TYPOGRAPHY.caption,
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.textMuted,
    textTransform: 'uppercase',
  },
  fieldGuide: {
    ...TYPOGRAPHY.body,
    fontSize: 12.5,
    lineHeight: 17,
    color: COLORS.textSecondary,
    marginBottom: SPACING.md,
  },
  multilineInput: {
    minHeight: 100,
    borderRadius: RADII.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.md,
    ...TYPOGRAPHY.body,
    fontSize: 14.5,
    color: COLORS.textPrimary,
    textAlignVertical: 'top',
    backgroundColor: '#FAFAFA',
  },
  chipsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.white,
    borderRadius: RADII.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingVertical: 10,
    paddingHorizontal: SPACING.md,
    gap: 8,
  },
  chipSelected: {
    backgroundColor: COLORS.limeSubtle,
    borderColor: COLORS.navy,
    borderWidth: 1.5,
  },
  checkboxIndicator: {
    width: 18,
    height: 18,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.white,
  },
  checkboxIndicatorSelected: {
    backgroundColor: COLORS.lime,
    borderColor: COLORS.navy,
  },
  chipText: {
    ...TYPOGRAPHY.bodyBold,
    fontSize: 13.5,
    color: COLORS.textSecondary,
  },
  chipTextSelected: {
    color: COLORS.navy,
  },
  addItemRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
    alignItems: 'center',
    marginBottom: SPACING.xs,
  },
  addItemInput: {
    flex: 1,
    height: 46,
    borderRadius: RADII.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: SPACING.md,
    ...TYPOGRAPHY.body,
    fontSize: 14,
    color: COLORS.textPrimary,
    backgroundColor: '#FAFAFA',
  },
  addButton: {
    height: 46,
    paddingHorizontal: SPACING.lg,
  },
  inlineErrorText: {
    ...TYPOGRAPHY.caption,
    fontSize: 12,
    color: '#DC2626',
    marginBottom: SPACING.xs,
  },
  tagsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.xs,
    marginTop: SPACING.sm,
  },
  tagPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.mist,
    borderRadius: RADII.full,
    paddingVertical: 6,
    paddingLeft: 12,
    paddingRight: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 6,
  },
  tagText: {
    ...TYPOGRAPHY.bodyBold,
    fontSize: 12.5,
    color: COLORS.navy,
  },
  tagRemoveBtn: {
    padding: 2,
    borderRadius: 8,
  },
  emptyListText: {
    ...TYPOGRAPHY.caption,
    color: COLORS.textMuted,
    fontStyle: 'italic',
    marginTop: 4,
  },
  rateInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 50,
    borderRadius: RADII.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: '#FAFAFA',
    overflow: 'hidden',
  },
  currencyPrefixBox: {
    width: 44,
    height: '100%',
    backgroundColor: COLORS.mist,
    borderRightWidth: 1,
    borderRightColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  currencyPrefixText: {
    ...TYPOGRAPHY.bodyBold,
    fontSize: 16,
    color: COLORS.navy,
  },
  rateInput: {
    flex: 1,
    height: '100%',
    paddingHorizontal: SPACING.md,
    ...TYPOGRAPHY.bodyBold,
    fontSize: 16,
    color: COLORS.navy,
  },
  locationListContainer: {
    marginTop: SPACING.sm,
    gap: SPACING.xs,
  },
  locationItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FAFAFA',
    borderRadius: RADII.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingVertical: 8,
    paddingHorizontal: SPACING.md,
    gap: SPACING.sm,
  },
  locationPinIcon: {
    flexShrink: 0,
  },
  locationItemText: {
    ...TYPOGRAPHY.body,
    fontSize: 13,
    color: COLORS.navy,
    flex: 1,
  },
  completenessCard: {
    backgroundColor: COLORS.white,
    borderRadius: RADII.lg,
    padding: SPACING.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: SPACING.md,
  },
  completenessHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.xs,
  },
  completenessHeading: {
    ...TYPOGRAPHY.h3,
    fontSize: 15,
    color: COLORS.navy,
  },
  completenessDescription: {
    ...TYPOGRAPHY.body,
    fontSize: 12.5,
    lineHeight: 17,
    color: COLORS.textSecondary,
    marginBottom: SPACING.sm,
  },
  verificationDisclaimer: {
    ...TYPOGRAPHY.caption,
    fontSize: 11,
    lineHeight: 15,
    color: COLORS.textMuted,
    fontStyle: 'italic',
  },
  actionContainer: {
    marginTop: SPACING.xs,
    marginBottom: SPACING.lg,
  },
  saveButton: {
    width: '100%',
  },
});
