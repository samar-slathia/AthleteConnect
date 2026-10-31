import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { CoachDetailModal, CoachDetailModalProps } from '../CoachDetailModal';
import { CoachDiscoveryItem } from '../../../services/bookingApi';
import * as profilePhotoService from '../../../services/profilePhotoService';

// Tree inspection helpers
function findAllElements(element: any, predicate: (el: any) => boolean, results: any[] = []): any[] {
  if (!element || typeof element !== 'object') return results;
  if (predicate(element)) {
    results.push(element);
  }
  if (element.props && element.props.children) {
    const children = Array.isArray(element.props.children)
      ? element.props.children
      : [element.props.children];
    for (const child of children) {
      findAllElements(child, predicate, results);
    }
  }
  return results;
}

function findElement(element: any, predicate: (el: any) => boolean): any {
  const results = findAllElements(element, predicate);
  return results.length > 0 ? results[0] : null;
}

function findByTestId(element: any, testId: string): any {
  return findElement(element, (el) => el.props && el.props.testID === testId);
}

function extractText(element: any): string {
  if (element === null || element === undefined) return '';
  if (typeof element === 'string' || typeof element === 'number') return String(element);
  if (Array.isArray(element)) return element.map(extractText).join('');
  if (element.props && element.props.children) {
    return extractText(element.props.children);
  }
  return '';
}

const mockCoach: CoachDiscoveryItem = {
  _id: 'coach_boxing_01',
  name: 'Rajesh Kumar',
  role: 'coach',
  isConfiguredAvailability: true,
  timezone: 'Asia/Kolkata',
  profile: {
    bio: 'National Boxing Coach with focus on offensive footwork and defense.',
    disciplines: ['boxing', 'kickboxing'],
    specialties: ['Footwork', 'Counter Punching', 'Heavy Bag'],
    sessionFormats: ['one_on_one'],
    venueTypes: ['customer_home', 'ground', 'coach_home' as any],
    hourlyRate: 1500,
    currency: 'INR',
    locations: ['Indiranagar Ground', 'Koramangala Complex'],
  },
};

describe('CoachDetailModal', () => {
  it('returns null when coach is null', () => {
    const rendered = CoachDetailModal({
      visible: true,
      coach: null,
      onClose: vi.fn(),
      onChooseCoach: vi.fn(),
    });

    expect(rendered).toBeNull();
  });

  it('renders correct coach information including name, rate, and bio', () => {
    const rendered = CoachDetailModal({
      visible: true,
      coach: mockCoach,
      selectedDiscipline: 'boxing',
      onClose: vi.fn(),
      onChooseCoach: vi.fn(),
    });

    expect(rendered).not.toBeNull();

    // Verify coach name
    const nameEl = findByTestId(rendered, 'coach-detail-name');
    expect(nameEl).not.toBeNull();
    expect(extractText(nameEl)).toContain('Rajesh Kumar');

    // Verify hourly rate
    const rateEl = findByTestId(rendered, 'coach-detail-rate');
    expect(rateEl).not.toBeNull();
    expect(extractText(rateEl)).toContain('₹1500');

    // Verify bio
    const bioEl = findByTestId(rendered, 'coach-detail-bio');
    expect(bioEl).not.toBeNull();
    expect(extractText(bioEl)).toContain('National Boxing Coach');
  });

  it('renders profile avatar with getPublicCoachPhotoUrl and initials fallback', () => {
    const photoSpy = vi.spyOn(profilePhotoService, 'getPublicCoachPhotoUrl');

    const rendered = CoachDetailModal({
      visible: true,
      coach: mockCoach,
      onClose: vi.fn(),
      onChooseCoach: vi.fn(),
    });

    const avatarEl = findByTestId(rendered, 'coach-detail-avatar');
    expect(avatarEl).not.toBeNull();
    expect(avatarEl.props.name).toBe('Rajesh Kumar');
    expect(photoSpy).toHaveBeenCalledWith('coach_boxing_01');

    photoSpy.mockRestore();
  });

  it('renders disciplines chips and highlights the selected discipline', () => {
    const rendered = CoachDetailModal({
      visible: true,
      coach: mockCoach,
      selectedDiscipline: 'boxing',
      onClose: vi.fn(),
      onChooseCoach: vi.fn(),
    });

    const disciplinesEl = findByTestId(rendered, 'coach-detail-disciplines');
    expect(disciplinesEl).not.toBeNull();
    const text = extractText(disciplinesEl);
    expect(text).toContain('BOXING');
    expect(text).toContain('KICKBOXING');
  });

  it('renders specialties tags', () => {
    const rendered = CoachDetailModal({
      visible: true,
      coach: mockCoach,
      onClose: vi.fn(),
      onChooseCoach: vi.fn(),
    });

    const specialtiesEl = findByTestId(rendered, 'coach-detail-specialties');
    expect(specialtiesEl).not.toBeNull();
    const text = extractText(specialtiesEl);
    expect(text).toContain('Footwork');
    expect(text).toContain('Counter Punching');
    expect(text).toContain('Heavy Bag');
  });

  it('renders active venues (customer_home and ground) and strictly excludes legacy coach_home', () => {
    const rendered = CoachDetailModal({
      visible: true,
      coach: mockCoach,
      onClose: vi.fn(),
      onChooseCoach: vi.fn(),
    });

    const venuesEl = findByTestId(rendered, 'coach-detail-venues');
    expect(venuesEl).not.toBeNull();
    const text = extractText(venuesEl);
    expect(text).toContain("Customer's Home");
    expect(text).toContain('Sports Ground / Facility');
    expect(text).not.toContain("Coach's Home");
  });

  it('renders training locations list', () => {
    const rendered = CoachDetailModal({
      visible: true,
      coach: mockCoach,
      onClose: vi.fn(),
      onChooseCoach: vi.fn(),
    });

    const locationsEl = findByTestId(rendered, 'coach-detail-locations');
    expect(locationsEl).not.toBeNull();
    const text = extractText(locationsEl);
    expect(text).toContain('Indiranagar Ground');
    expect(text).toContain('Koramangala Complex');
  });

  it('renders availability status accurately based on isConfiguredAvailability', () => {
    // With configured availability = true
    const renderedConfigured = CoachDetailModal({
      visible: true,
      coach: mockCoach,
      onClose: vi.fn(),
      onChooseCoach: vi.fn(),
    });
    const availEl1 = findByTestId(renderedConfigured, 'coach-detail-availability');
    expect(extractText(availEl1)).toContain('Weekly availability schedule active');

    // With configured availability = false
    const coachUnconfigured: CoachDiscoveryItem = {
      ...mockCoach,
      isConfiguredAvailability: false,
    };
    const renderedUnconfigured = CoachDetailModal({
      visible: true,
      coach: coachUnconfigured,
      onClose: vi.fn(),
      onChooseCoach: vi.fn(),
    });
    const availEl2 = findByTestId(renderedUnconfigured, 'coach-detail-availability');
    expect(extractText(availEl2)).toContain('Flexible scheduling upon request');
  });

  it('does not display fabricated fields (qualifications, achievements, certificates, or awards)', () => {
    const rendered = CoachDetailModal({
      visible: true,
      coach: mockCoach,
      onClose: vi.fn(),
      onChooseCoach: vi.fn(),
    });

    const allText = extractText(rendered).toLowerCase();
    expect(allText).not.toContain('qualification');
    expect(allText).not.toContain('achievement');
    expect(allText).not.toContain('certificate');
    expect(allText).not.toContain('award');
  });

  it('calls onChooseCoach with coach and selected discipline when Choose This Coach is tapped', () => {
    const onChooseCoachMock = vi.fn();
    const rendered = CoachDetailModal({
      visible: true,
      coach: mockCoach,
      selectedDiscipline: 'boxing',
      onClose: vi.fn(),
      onChooseCoach: onChooseCoachMock,
    });

    const chooseBtn = findByTestId(rendered, 'button-choose-coach');
    expect(chooseBtn).not.toBeNull();
    chooseBtn.props.onPress();

    expect(onChooseCoachMock).toHaveBeenCalledTimes(1);
    expect(onChooseCoachMock).toHaveBeenCalledWith(mockCoach, 'boxing');
  });

  it('calls onClose when close button is tapped', () => {
    const onCloseMock = vi.fn();
    const rendered = CoachDetailModal({
      visible: true,
      coach: mockCoach,
      onClose: onCloseMock,
      onChooseCoach: vi.fn(),
    });

    const closeBtn = findByTestId(rendered, 'button-close-coach-detail');
    expect(closeBtn).not.toBeNull();
    closeBtn.props.onPress();

    expect(onCloseMock).toHaveBeenCalledTimes(1);
  });

  it('wraps content in a ScrollView for usability on small screens', () => {
    const rendered = CoachDetailModal({
      visible: true,
      coach: mockCoach,
      onClose: vi.fn(),
      onChooseCoach: vi.fn(),
    });

    const scrollViews = findAllElements(
      rendered,
      (el) => el.type?.displayName === 'ScrollView' || el.type?.name === 'ScrollView' || el.props?.showsVerticalScrollIndicator !== undefined
    );
    expect(scrollViews.length).toBeGreaterThan(0);
  });
});
