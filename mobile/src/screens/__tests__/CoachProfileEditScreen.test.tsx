import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { CoachProfileEditScreen } from '../CoachProfileEditScreen';
import { CoachHomeView } from '../home/CoachHomeView';
import { AuthContext, AuthContextType } from '../../context/AuthContext';
import { UserProfile } from '../../services/authApi';
import {
  getCoachProfile,
  updateCoachProfile,
  CoachProfile,
  CoachProfileResponse,
  AuthApiError,
} from '../../services/coachApi';

// Mock the coachApi client functions
vi.mock('../../services/coachApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/coachApi')>();
  return {
    ...actual,
    getCoachProfile: vi.fn(),
    updateCoachProfile: vi.fn(),
  };
});

const mockCoachUser: UserProfile = {
  _id: 'usr_coach_01',
  name: 'Marcus Vance',
  email: 'marcus@coach.athleteconnect.com',
  role: 'coach',
  isActive: true,
};

const mockPopulatedProfile: CoachProfile = {
  _id: 'coach_profile_123',
  userId: 'usr_coach_01',
  bio: 'Certified martial arts instructor with 10 years experience.',
  disciplines: ['boxing', 'kickboxing'],
  specialties: ['Footwork', 'Endurance'],
  sessionFormats: ['one_on_one'],
  venueTypes: ['coach_home', 'ground'],
  hourlyRate: 1500,
  currency: 'INR',
  locations: ['Bandra West, Mumbai', 'Khar, Mumbai'],
  isPublished: true,
  createdAt: '2026-10-25T00:00:00.000Z',
  updatedAt: '2026-10-25T01:00:00.000Z',
};

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

// Interactive render harness for evaluating React hooks and rerenders in Node
function createHarness(ui: React.ReactElement, authValue: Partial<AuthContextType> = {}) {
  const defaultAuth: AuthContextType = {
    user: mockCoachUser,
    token: 'valid_mock_jwt_token',
    isLoading: false,
    isInitializing: false,
    error: null,
    login: vi.fn().mockResolvedValue(undefined),
    register: vi.fn().mockResolvedValue(undefined),
    logout: vi.fn().mockResolvedValue(undefined),
    clearError: vi.fn(),
    ...authValue,
  };

  const internals = (React as any).__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;
  const originalDispatcher = internals.H;

  const hooks: any[] = [];
  let hookIdx = 0;
  const effectFns: (() => void | (() => void))[] = [];

  const dispatcher = {
    useState(initial: any) {
      const idx = hookIdx++;
      if (hooks[idx] === undefined) {
        hooks[idx] = typeof initial === 'function' ? initial() : initial;
      }
      const setState = (action: any) => {
        hooks[idx] = typeof action === 'function' ? action(hooks[idx]) : action;
      };
      return [hooks[idx], setState];
    },
    useRef(initial: any) {
      const idx = hookIdx++;
      if (hooks[idx] === undefined) {
        hooks[idx] = { current: initial };
      }
      return hooks[idx];
    },
    useCallback(fn: any) {
      const idx = hookIdx++;
      hooks[idx] = fn;
      return fn;
    },
    useEffect(fn: any) {
      effectFns.push(fn);
    },
    useContext(context: any) {
      if (context === AuthContext) {
        return defaultAuth;
      }
      return null;
    },
  };

  function renderTree() {
    hookIdx = 0;
    internals.H = dispatcher;
    const Component = ui.type as React.FC<any>;
    return Component(ui.props);
  }

  // Initial render
  const initialTree = renderTree();

  // Run effects synchronously
  for (const fn of effectFns) {
    fn();
  }

  const cleanup = () => {
    internals.H = originalDispatcher;
  };

  return {
    render: renderTree,
    initialTree,
    cleanup,
    auth: defaultAuth,
  };
}

const flushPromises = () => new Promise((resolve) => setImmediate(resolve));

describe('CoachProfileEditScreen', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('displays loading indicator initially while fetching coach profile', () => {
    // Return a never-resolving promise to inspect the loading state
    (getCoachProfile as any).mockReturnValue(new Promise(() => {}));

    const { initialTree, cleanup } = createHarness(
      React.createElement(CoachProfileEditScreen, {})
    );

    const loadingSpinner = findElement(
      initialTree,
      (el) => el.props?.testID === 'profile-loading-indicator'
    );
    expect(loadingSpinner).toBeDefined();

    cleanup();
  });

  it('loads and displays empty guidance form for a new coach with null profile', async () => {
    (getCoachProfile as any).mockResolvedValue({
      profile: null,
      isComplete: false,
    } as CoachProfileResponse);

    const { render, cleanup } = createHarness(
      React.createElement(CoachProfileEditScreen, {})
    );

    await flushPromises();
    const tree = render();

    // Guidance notice should be shown
    const guidance = findElement(tree, (el) => el.props?.testID === 'new-coach-guidance');
    expect(guidance).toBeDefined();

    // Bio input should be empty
    const bioInput = findElement(tree, (el) => el.props?.testID === 'input-bio');
    expect(bioInput).toBeDefined();
    expect(bioInput.props.value).toBe('');

    // Hourly rate input should be empty
    const rateInput = findElement(tree, (el) => el.props?.testID === 'input-hourly-rate');
    expect(rateInput).toBeDefined();
    expect(rateInput.props.value).toBe('');

    cleanup();
  });

  it('prefills form fields when editing a populated profile', async () => {
    (getCoachProfile as any).mockResolvedValue({
      profile: mockPopulatedProfile,
      isComplete: true,
    } as CoachProfileResponse);

    const { render, cleanup } = createHarness(
      React.createElement(CoachProfileEditScreen, {})
    );

    await flushPromises();
    const tree = render();

    // Bio prefilled
    const bioInput = findElement(tree, (el) => el.props?.testID === 'input-bio');
    expect(bioInput.props.value).toBe(mockPopulatedProfile.bio);

    // Rate prefilled
    const rateInput = findElement(tree, (el) => el.props?.testID === 'input-hourly-rate');
    expect(rateInput.props.value).toBe('1500');

    // Disciplines prefilled
    const boxingChip = findElement(tree, (el) => el.props?.testID === 'discipline-chip-boxing');
    expect(boxingChip.props.accessibilityState.checked).toBe(true);
    const kickboxingChip = findElement(
      tree,
      (el) => el.props?.testID === 'discipline-chip-kickboxing'
    );
    expect(kickboxingChip.props.accessibilityState.checked).toBe(true);
    const wushuChip = findElement(tree, (el) => el.props?.testID === 'discipline-chip-wushu');
    expect(wushuChip.props.accessibilityState.checked).toBe(false);

    // Specialties prefilled
    const specialtiesList = findElement(tree, (el) => el.props?.testID === 'specialties-list');
    expect(specialtiesList).toBeDefined();

    cleanup();
  });

  it('allows adding and removing specialties within backend limits', async () => {
    (getCoachProfile as any).mockResolvedValue({
      profile: null,
      isComplete: false,
    } as CoachProfileResponse);

    const { render, cleanup } = createHarness(
      React.createElement(CoachProfileEditScreen, {})
    );

    await flushPromises();
    let tree = render();

    // Enter a new specialty
    const newSpecInput = findElement(tree, (el) => el.props?.testID === 'input-new-specialty');
    newSpecInput.props.onChangeText('Pad Work');
    tree = render();

    // Click Add
    const addBtn = findElement(tree, (el) => el.props?.title === 'Add');
    expect(addBtn.props.disabled).toBe(false);
    addBtn.props.onPress();
    tree = render();

    // Specialty should be in list
    const addedTag = findElement(tree, (el) => el.props?.children === 'Pad Work');
    expect(addedTag).toBeDefined();

    // Remove the specialty
    const removeBtn = findElement(tree, (el) => el.props?.testID === 'remove-specialty-0');
    expect(removeBtn).toBeDefined();
    removeBtn.props.onPress();
    tree = render();

    // Should no longer be in list
    const removedTag = findElement(tree, (el) => el.props?.children === 'Pad Work');
    expect(removedTag).toBeNull();

    cleanup();
  });

  it('allows adding and removing locations', async () => {
    (getCoachProfile as any).mockResolvedValue({
      profile: null,
      isComplete: false,
    } as CoachProfileResponse);

    const { render, cleanup } = createHarness(
      React.createElement(CoachProfileEditScreen, {})
    );

    await flushPromises();
    let tree = render();

    // Enter new location
    const newLocInput = findElement(tree, (el) => el.props?.testID === 'input-new-location');
    newLocInput.props.onChangeText('Andheri Sports Complex');
    tree = render();

    // Click Add
    const addLocBtn = findAllElements(tree, (el) => el.props?.title === 'Add')[1];
    addLocBtn.props.onPress();
    tree = render();

    const addedLoc = findElement(
      tree,
      (el) => el.props?.children === 'Andheri Sports Complex'
    );
    expect(addedLoc).toBeDefined();

    // Remove location
    const removeLocBtn = findElement(tree, (el) => el.props?.testID === 'remove-location-0');
    expect(removeLocBtn).toBeDefined();
    removeLocBtn.props.onPress();
    tree = render();

    const removedLoc = findElement(
      tree,
      (el) => el.props?.children === 'Andheri Sports Complex'
    );
    expect(removedLoc).toBeNull();

    cleanup();
  });

  it('submits valid profile updates and reflects persisted response', async () => {
    (getCoachProfile as any).mockResolvedValue({
      profile: mockPopulatedProfile,
      isComplete: true,
    } as CoachProfileResponse);

    const updatedProfile: CoachProfile = {
      ...mockPopulatedProfile,
      bio: 'Updated championship coach bio.',
      hourlyRate: 1800,
    };

    (updateCoachProfile as any).mockResolvedValue({
      profile: updatedProfile,
      isComplete: true,
      message: 'Coach profile saved successfully.',
    } as CoachProfileResponse);

    const { render, cleanup } = createHarness(
      React.createElement(CoachProfileEditScreen, {})
    );

    await flushPromises();
    let tree = render();

    // Change bio
    const bioInput = findElement(tree, (el) => el.props?.testID === 'input-bio');
    bioInput.props.onChangeText('Updated championship coach bio.');

    // Change rate
    const rateInput = findElement(tree, (el) => el.props?.testID === 'input-hourly-rate');
    rateInput.props.onChangeText('1800');

    tree = render();

    // Click Save
    const saveBtn = findElement(tree, (el) => el.props?.title === 'Save Profile');
    await saveBtn.props.onPress();
    await flushPromises();

    tree = render();

    // Verify API call arguments
    expect(updateCoachProfile).toHaveBeenCalledWith(
      'valid_mock_jwt_token',
      expect.objectContaining({
        bio: 'Updated championship coach bio.',
        hourlyRate: 1800,
      })
    );

    // Success banner displayed
    const successBanner = findElement(tree, (el) => el.props?.testID === 'save-success-banner');
    expect(successBanner).toBeDefined();

    cleanup();
  });

  it('prevents submission when hourly rate is outside allowed ₹100–₹20,000 range', async () => {
    (getCoachProfile as any).mockResolvedValue({
      profile: mockPopulatedProfile,
      isComplete: true,
    } as CoachProfileResponse);

    const { render, cleanup } = createHarness(
      React.createElement(CoachProfileEditScreen, {})
    );

    await flushPromises();
    let tree = render();

    // Set invalid hourly rate
    const rateInput = findElement(tree, (el) => el.props?.testID === 'input-hourly-rate');
    rateInput.props.onChangeText('50'); // Below 100
    tree = render();

    const saveBtn = findElement(tree, (el) => el.props?.title === 'Save Profile');
    await saveBtn.props.onPress();
    await flushPromises();

    tree = render();

    // updateCoachProfile must NOT be called
    expect(updateCoachProfile).not.toHaveBeenCalled();

    // Error banner should be present
    const errorBanner = findElement(tree, (el) => el.props?.testID === 'save-error-banner');
    expect(errorBanner).toBeDefined();

    cleanup();
  });

  it('prevents submission when hourly rate is non-numeric', async () => {
    (getCoachProfile as any).mockResolvedValue({
      profile: mockPopulatedProfile,
      isComplete: true,
    } as CoachProfileResponse);

    const { render, cleanup } = createHarness(
      React.createElement(CoachProfileEditScreen, {})
    );

    await flushPromises();
    let tree = render();

    const rateInput = findElement(tree, (el) => el.props?.testID === 'input-hourly-rate');
    rateInput.props.onChangeText('not_a_number');
    tree = render();

    const saveBtn = findElement(tree, (el) => el.props?.title === 'Save Profile');
    await saveBtn.props.onPress();
    await flushPromises();

    tree = render();

    expect(updateCoachProfile).not.toHaveBeenCalled();
    const errorBanner = findElement(tree, (el) => el.props?.testID === 'save-error-banner');
    expect(errorBanner).toBeDefined();

    cleanup();
  });

  it('retains entered form values when saving fails', async () => {
    (getCoachProfile as any).mockResolvedValue({
      profile: null,
      isComplete: false,
    } as CoachProfileResponse);

    (updateCoachProfile as any).mockRejectedValue(
      new AuthApiError('Server connection timed out.', 500)
    );

    const { render, cleanup } = createHarness(
      React.createElement(CoachProfileEditScreen, {})
    );

    await flushPromises();
    let tree = render();

    // Enter user data
    const bioInput = findElement(tree, (el) => el.props?.testID === 'input-bio');
    bioInput.props.onChangeText('Valuable coach bio text that must not be lost');

    const rateInput = findElement(tree, (el) => el.props?.testID === 'input-hourly-rate');
    rateInput.props.onChangeText('2000');

    tree = render();

    // Trigger save
    const saveBtn = findElement(tree, (el) => el.props?.title === 'Save Profile');
    await saveBtn.props.onPress();
    await flushPromises();

    tree = render();

    // Error banner shown
    const errorBanner = findElement(tree, (el) => el.props?.testID === 'save-error-banner');
    expect(errorBanner).toBeDefined();

    // Form inputs must RETAIN their entered values
    const bioInputAfter = findElement(tree, (el) => el.props?.testID === 'input-bio');
    expect(bioInputAfter.props.value).toBe('Valuable coach bio text that must not be lost');

    const rateInputAfter = findElement(tree, (el) => el.props?.testID === 'input-hourly-rate');
    expect(rateInputAfter.props.value).toBe('2000');

    cleanup();
  });

  it('provides a retry option when initial profile retrieval fails', async () => {
    (getCoachProfile as any).mockRejectedValueOnce(
      new AuthApiError('Network connection failed.', 0)
    );

    const { render, cleanup } = createHarness(
      React.createElement(CoachProfileEditScreen, {})
    );

    await flushPromises();
    let tree = render();

    // Retry button should be displayed
    const retryBtn = findElement(tree, (el) => el.props?.title === 'Retry');
    expect(retryBtn).toBeDefined();

    // Setup success on retry
    (getCoachProfile as any).mockResolvedValueOnce({
      profile: mockPopulatedProfile,
      isComplete: true,
    } as CoachProfileResponse);

    retryBtn.props.onPress();
    await flushPromises();

    tree = render();

    // Profile should now be displayed
    const bioInput = findElement(tree, (el) => el.props?.testID === 'input-bio');
    expect(bioInput).toBeDefined();
    expect(bioInput.props.value).toBe(mockPopulatedProfile.bio);

    cleanup();
  });

  it('calls onBack handler when back button is pressed', async () => {
    (getCoachProfile as any).mockResolvedValue({
      profile: null,
      isComplete: false,
    } as CoachProfileResponse);

    const onBackMock = vi.fn();
    const { render, cleanup } = createHarness(
      React.createElement(CoachProfileEditScreen, { onBack: onBackMock })
    );

    await flushPromises();
    const tree = render();

    const backBtn = findElement(tree, (el) => el.props?.testID === 'editor-back-button');
    expect(backBtn).toBeDefined();
    backBtn.props.onPress();

    expect(onBackMock).toHaveBeenCalledTimes(1);

    cleanup();
  });

  it('renders completeness status without making false administrative verification claims', async () => {
    (getCoachProfile as any).mockResolvedValue({
      profile: mockPopulatedProfile,
      isComplete: true,
    } as CoachProfileResponse);

    const { render, cleanup } = createHarness(
      React.createElement(CoachProfileEditScreen, {})
    );

    await flushPromises();
    const tree = render();

    const statusCard = findElement(tree, (el) => el.props?.testID === 'completeness-status-card');
    expect(statusCard).toBeDefined();

    // Verifies disclaimer text is present
    const disclaimer = findElement(
      tree,
      (el) =>
        typeof el.props?.children === 'string' &&
        el.props.children.includes('does not imply that coach credentials or identity have been administratively verified')
    );
    expect(disclaimer).toBeDefined();

    cleanup();
  });
});

describe('CoachHomeView - Profile Editor Integration', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renders Edit Coach Profile button in CoachHomeView', () => {
    const { initialTree, cleanup } = createHarness(
      React.createElement(CoachHomeView, { user: mockCoachUser })
    );

    const editBtn = findElement(
      initialTree,
      (el) => el.props?.title === 'Edit Coach Profile'
    );
    expect(editBtn).toBeDefined();

    cleanup();
  });

  it('switches to CoachProfileEditScreen when Edit Coach Profile is pressed', () => {
    const { render, initialTree, cleanup } = createHarness(
      React.createElement(CoachHomeView, { user: mockCoachUser })
    );

    const editBtn = findElement(
      initialTree,
      (el) => el.props?.title === 'Edit Coach Profile'
    );
    editBtn.props.onPress();

    const tree = render();

    // Should now render CoachProfileEditScreen
    const editorBackBtn = findElement(
      tree,
      (el) => el.props?.testID === 'editor-back-button'
    );
    expect(editorBackBtn).toBeDefined();

    cleanup();
  });

  it('renders updated introduction and Available status for Step 1 in CoachHomeView', () => {
    const { initialTree, cleanup } = createHarness(
      React.createElement(CoachHomeView, { user: mockCoachUser })
    );

    const step1 = findElement(
      initialTree,
      (el) => el.props?.stepNumber === 1 && el.props?.title === 'Profile Details & Coaching Bio'
    );
    expect(step1).toBeDefined();
    expect(step1.props.statusLabel).toBe('Available');

    const introText = findElement(
      initialTree,
      (el) =>
        typeof el.props?.children === 'string' &&
        el.props.children.includes('edit and save your coaching profile details and hourly rates')
    );
    expect(introText).toBeDefined();

    cleanup();
  });
});
