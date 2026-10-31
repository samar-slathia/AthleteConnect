import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { UserProfileView } from '../profile/UserProfileView';
import { CoachProfileEditScreen } from '../CoachProfileEditScreen';
import { UserProfile } from '../../services/authApi';
import { getCoachProfile, CoachProfileResponse } from '../../services/coachApi';
import { AuthContext, AuthContextType } from '../../context/AuthContext';
import * as profilePhotoService from '../../services/profilePhotoService';

// Mock the coachApi client functions
vi.mock('../../services/coachApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/coachApi')>();
  return {
    ...actual,
    getCoachProfile: vi.fn(),
  };
});

// Mock the profilePhotoService hook
let mockProfilePhotoHook = {
  photoUri: null as string | null,
  isLoading: false,
  syncStatus: 'idle' as profilePhotoService.SyncStatus,
  error: null as string | null,
  pickAndSavePhoto: vi.fn().mockResolvedValue('file:///mock/photos/new_saved_photo.jpg'),
  retrySync: vi.fn().mockResolvedValue(undefined),
  clearPhoto: vi.fn().mockResolvedValue(undefined),
  reloadPhoto: vi.fn().mockResolvedValue(undefined),
  clearError: vi.fn(),
};

vi.mock('../../services/profilePhotoService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/profilePhotoService')>();
  return {
    ...actual,
    useProfilePhoto: vi.fn((userId?: string | null) => {
      return mockProfilePhotoHook;
    }),
  };
});

function renderWithAuth(ui: React.ReactElement, authValue: Partial<AuthContextType> = {}) {
  const defaultAuth: AuthContextType = {
    user: null,
    token: 'test-token',
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
    useEffect() {},
    useContext(context: any) {
      if (context === AuthContext) {
        return defaultAuth;
      }
      return { top: 0, bottom: 20, left: 0, right: 0 };
    },
  };

  internals.H = dispatcher;
  hookIdx = 0;

  const Component = ui.type as React.FC<any>;
  let tree = Component(ui.props);

  const reRender = (newProps?: any) => {
    hookIdx = 0;
    tree = Component(newProps || ui.props);
    return tree;
  };

  const cleanup = () => {
    internals.H = originalDispatcher;
  };

  return {
    get tree() {
      return tree;
    },
    reRender,
    auth: defaultAuth,
    cleanup,
  };
}

function findAllElements(element: any, predicate: (el: any) => boolean, results: any[] = []): any[] {
  if (!element || typeof element !== 'object') return results;
  if (predicate(element)) {
    results.push(element);
  }
  if (typeof element.type === 'function') {
    try {
      const rendered = element.type(element.props);
      findAllElements(rendered, predicate, results);
    } catch {
      // Ignore if hooks cannot be executed
    }
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

describe('UserProfileView Component', () => {
  const parentUser: UserProfile = {
    _id: 'usr_p_1',
    name: 'Sarah Connor',
    email: 'sarah@family.com',
    role: 'parent',
    isActive: true,
  };

  const individualUser: UserProfile = {
    _id: 'usr_i_1',
    name: 'Alex Hunter',
    email: 'alex@athlete.com',
    role: 'individual',
    isActive: true,
  };

  const coachUser: UserProfile = {
    _id: 'usr_c_1',
    name: 'Master Bruce',
    email: 'bruce@dojo.com',
    role: 'coach',
    isActive: true,
  };

  const mockCoachProfile: CoachProfileResponse = {
    isComplete: true,
    profile: {
      _id: 'prof_1',
      userId: 'usr_c_1',
      bio: 'Lifelong martial artist with 15 years experience coaching youth and adults.',
      disciplines: ['boxing', 'kickboxing'],
      specialties: ['Footwork', 'Counter-Punching'],
      sessionFormats: ['one_on_one', 'small_group'],
      venueTypes: ['customer_home', 'ground'],
      hourlyRate: 1500,
      currency: 'INR',
      locations: ['Indiranagar Studio', 'Koramangala Ground'],
      isPublished: true,
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    (getCoachProfile as any).mockResolvedValue(mockCoachProfile);
    mockProfilePhotoHook = {
      photoUri: null,
      isLoading: false,
      syncStatus: 'idle',
      error: null,
      pickAndSavePhoto: vi.fn().mockResolvedValue('file:///mock/photos/new_saved_photo.jpg'),
      retrySync: vi.fn().mockResolvedValue(undefined),
      clearPhoto: vi.fn().mockResolvedValue(undefined),
      reloadPhoto: vi.fn().mockResolvedValue(undefined),
      clearError: vi.fn(),
    };
  });

  describe('Existing Profile Layout & Functionality (Preserved)', () => {
    it('renders Parent account details, initials, role badge, and Sign Out action', () => {
      const { tree, cleanup } = renderWithAuth(
        React.createElement(UserProfileView, { user: parentUser }),
        { user: parentUser }
      );

      expect(findElement(tree, (el) => el.props?.testID === 'user-profile-view')).not.toBeNull();
      expect(findElement(tree, (el) => el.props?.children === 'Sarah Connor')).not.toBeNull();
      expect(findElement(tree, (el) => el.props?.children === 'sarah@family.com')).not.toBeNull();
      expect(findElement(tree, (el) => el.props?.children === 'Parent / Guardian')).not.toBeNull();
      expect(findElement(tree, (el) => el.props?.children === 'Active')).not.toBeNull();

      // Coach summary section must NOT be rendered for parent
      expect(findElement(tree, (el) => el.props?.testID === 'coach-profile-summary')).toBeNull();

      const signOutBtn = findElement(tree, (el) => el.props?.title === 'Sign Out');
      expect(signOutBtn).not.toBeNull();

      cleanup();
    });

    it('renders Coach account details, coaching profile summary, and Edit Coach Profile button', () => {
      const { tree, cleanup } = renderWithAuth(
        React.createElement(UserProfileView, { user: coachUser }),
        { user: coachUser }
      );

      expect(findElement(tree, (el) => el.props?.testID === 'user-profile-view')).not.toBeNull();
      expect(findElement(tree, (el) => el.props?.children === 'Master Bruce')).not.toBeNull();
      expect(findElement(tree, (el) => el.props?.children === 'bruce@dojo.com')).not.toBeNull();
      expect(findElement(tree, (el) => el.props?.children === 'Player / Coach')).not.toBeNull();

      // Coach summary section must be rendered for coach
      const coachSummary = findElement(tree, (el) => el.props?.testID === 'coach-profile-summary');
      expect(coachSummary).not.toBeNull();

      const editProfileBtn = findElement(tree, (el) => el.props?.testID === 'edit-coach-profile-btn');
      expect(editProfileBtn).not.toBeNull();
      expect(editProfileBtn.props.title).toBe('Edit Coach Profile');

      cleanup();
    });

    it('invokes onLogout callback when Sign Out button is pressed', async () => {
      const onLogoutMock = vi.fn().mockResolvedValue(undefined);
      const { tree, cleanup } = renderWithAuth(
        React.createElement(UserProfileView, { user: parentUser, onLogout: onLogoutMock }),
        { user: parentUser }
      );

      const signOutBtn = findElement(tree, (el) => el.props?.title === 'Sign Out');
      expect(signOutBtn).not.toBeNull();

      await signOutBtn.props.onPress();
      expect(onLogoutMock).toHaveBeenCalledTimes(1);

      cleanup();
    });

    it('toggles to CoachProfileEditScreen when Edit Coach Profile button is pressed', () => {
      let isEditing = false;
      const internals = (React as any).__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;
      const originalDispatcher = internals.H;

      const dispatcher = {
        useState(initial: any) {
          if (typeof initial === 'boolean' && isEditing) {
            return [true, (v: any) => { isEditing = v; }];
          }
          return [initial, (v: any) => { isEditing = v; }];
        },
        useRef(initial: any) { return { current: initial }; },
        useCallback(fn: any) { return fn; },
        useEffect() {},
        useContext() { return { top: 0, bottom: 20 }; },
      };

      internals.H = dispatcher;

      // First render: not editing
      const tree1 = UserProfileView({ user: coachUser });
      const editBtn = findElement(tree1, (el) => el.props?.testID === 'edit-coach-profile-btn');
      expect(editBtn).not.toBeNull();

      // Trigger edit
      editBtn.props.onPress();
      expect(isEditing).toBe(true);

      // Second render: editing mode renders CoachProfileEditScreen
      const tree2 = UserProfileView({ user: coachUser }) as any;
      expect(tree2?.type).toBe(CoachProfileEditScreen);
      expect(tree2?.props?.onBack).toBeDefined();

      internals.H = originalDispatcher;
    });
  });

  describe('Profile Avatar & Photo Integration Across Roles', () => {
    it('renders ProfileAvatar with initials "SC" and helper text for Parent/Guardian', () => {
      const { tree, cleanup } = renderWithAuth(
        React.createElement(UserProfileView, { user: parentUser })
      );

      const avatar = findElement(tree, (el) => el.props?.testID === 'profile-avatar');
      expect(avatar).not.toBeNull();

      const initials = findElement(tree, (el) => el.props?.testID === 'profile-avatar-initials');
      expect(initials).not.toBeNull();
      expect(initials.props.children).toBe('SC');

      const helperText = findElement(tree, (el) => el.props?.testID === 'profile-avatar-helper-text');
      expect(helperText).not.toBeNull();
      expect(helperText.props.children).toBe('Recommended for better visibility.');

      const cameraButton = findElement(tree, (el) => el.props?.testID === 'change-photo-button');
      expect(cameraButton).not.toBeNull();

      cleanup();
    });

    it('renders ProfileAvatar with initials "AH" and helper text for Individual Customer', () => {
      const { tree, cleanup } = renderWithAuth(
        React.createElement(UserProfileView, { user: individualUser })
      );

      const avatar = findElement(tree, (el) => el.props?.testID === 'profile-avatar');
      expect(avatar).not.toBeNull();

      const initials = findElement(tree, (el) => el.props?.testID === 'profile-avatar-initials');
      expect(initials).not.toBeNull();
      expect(initials.props.children).toBe('AH');

      const helperText = findElement(tree, (el) => el.props?.testID === 'profile-avatar-helper-text');
      expect(helperText).not.toBeNull();
      expect(helperText.props.children).toBe('Recommended for better visibility.');

      expect(findElement(tree, (el) => el.props?.children === 'Individual Customer')).not.toBeNull();

      cleanup();
    });

    it('renders ProfileAvatar with initials "MB" and helper text for Coach', () => {
      const { tree, cleanup } = renderWithAuth(
        React.createElement(UserProfileView, { user: coachUser })
      );

      const avatar = findElement(tree, (el) => el.props?.testID === 'profile-avatar');
      expect(avatar).not.toBeNull();

      const initials = findElement(tree, (el) => el.props?.testID === 'profile-avatar-initials');
      expect(initials).not.toBeNull();
      expect(initials.props.children).toBe('MB');

      const helperText = findElement(tree, (el) => el.props?.testID === 'profile-avatar-helper-text');
      expect(helperText).not.toBeNull();
      expect(helperText.props.children).toBe('Recommended for better visibility.');

      cleanup();
    });

    it('displays restored profile photo when a saved photo URI is available', () => {
      const savedUri = 'file:///mock/storage/saved_avatar_101.jpg';
      mockProfilePhotoHook.photoUri = savedUri;

      const { tree, cleanup } = renderWithAuth(
        React.createElement(UserProfileView, { user: parentUser })
      );

      const avatarImage = findElement(tree, (el) => el.props?.testID === 'profile-avatar-image');
      expect(avatarImage).not.toBeNull();
      expect(avatarImage.props.source).toEqual({ uri: savedUri });

      // Initials must not be rendered when photo is shown
      expect(findElement(tree, (el) => el.props?.testID === 'profile-avatar-initials')).toBeNull();

      cleanup();
    });
  });

  describe('Photo Selection, Immediate Update, Cancellation & Errors', () => {
    it('launches photo selection when camera button is pressed and notifies onPhotoChange', async () => {
      const onPhotoChangeMock = vi.fn();
      const { tree, cleanup } = renderWithAuth(
        React.createElement(UserProfileView, {
          user: parentUser,
          onPhotoChange: onPhotoChangeMock,
        })
      );

      const cameraButton = findElement(tree, (el) => el.props?.testID === 'change-photo-button');
      expect(cameraButton).not.toBeNull();

      await cameraButton.props.onPress();

      expect(mockProfilePhotoHook.pickAndSavePhoto).toHaveBeenCalledTimes(1);
      expect(onPhotoChangeMock).toHaveBeenCalledWith('file:///mock/photos/new_saved_photo.jpg');

      cleanup();
    });

    it('preserves existing photo unchanged when user cancels selection', async () => {
      const existingUri = 'file:///mock/photos/existing_photo.jpg';
      mockProfilePhotoHook.photoUri = existingUri;
      mockProfilePhotoHook.pickAndSavePhoto.mockResolvedValue(null);

      const onPhotoChangeMock = vi.fn();
      const { tree, cleanup } = renderWithAuth(
        React.createElement(UserProfileView, {
          user: parentUser,
          onPhotoChange: onPhotoChangeMock,
        })
      );

      const cameraButton = findElement(tree, (el) => el.props?.testID === 'change-photo-button');
      await cameraButton.props.onPress();

      expect(mockProfilePhotoHook.pickAndSavePhoto).toHaveBeenCalledTimes(1);
      // onPhotoChange should not be called with null or new photo
      expect(onPhotoChangeMock).not.toHaveBeenCalled();

      // Existing photo image remains rendered
      const avatarImage = findElement(tree, (el) => el.props?.testID === 'profile-avatar-image');
      expect(avatarImage).not.toBeNull();
      expect(avatarImage.props.source).toEqual({ uri: existingUri });

      cleanup();
    });

    it('displays loading indicator during photo selection and saving', () => {
      mockProfilePhotoHook.isLoading = true;

      const { tree, cleanup } = renderWithAuth(
        React.createElement(UserProfileView, { user: parentUser })
      );

      const loader = findElement(tree, (el) => el.props?.testID === 'photo-saving-loader');
      expect(loader).not.toBeNull();
      expect(findElement(tree, (el) => el.props?.children === 'Saving photo...')).not.toBeNull();

      cleanup();
    });

    it('displays error banner when photo selection or save fails', () => {
      mockProfilePhotoHook.error = 'Photo library permission was denied.';

      const { tree, cleanup } = renderWithAuth(
        React.createElement(UserProfileView, { user: parentUser })
      );

      const errorBanner = findElement(tree, (el) => el.props?.testID === 'photo-error-banner');
      expect(errorBanner).not.toBeNull();
      expect(findElement(tree, (el) => el.props?.children === 'Photo library permission was denied.')).not.toBeNull();

      cleanup();
    });

    it('passes authenticated user ID to useProfilePhoto to ensure account isolation', () => {
      const useProfilePhotoSpy = vi.spyOn(profilePhotoService, 'useProfilePhoto');

      const { cleanup: cleanup1 } = renderWithAuth(
        React.createElement(UserProfileView, { user: parentUser })
      );
      expect(useProfilePhotoSpy).toHaveBeenCalledWith('usr_p_1');
      cleanup1();

      const { cleanup: cleanup2 } = renderWithAuth(
        React.createElement(UserProfileView, { user: individualUser })
      );
      expect(useProfilePhotoSpy).toHaveBeenCalledWith('usr_i_1');
      cleanup2();

      const { cleanup: cleanup3 } = renderWithAuth(
        React.createElement(UserProfileView, { user: coachUser })
      );
      expect(useProfilePhotoSpy).toHaveBeenCalledWith('usr_c_1');
      cleanup3();
    });

    it('displays syncing indicator during background cloud upload', () => {
      mockProfilePhotoHook.syncStatus = 'syncing';
      mockProfilePhotoHook.isLoading = false;

      const { tree, cleanup } = renderWithAuth(
        React.createElement(UserProfileView, { user: parentUser })
      );

      const syncingIndicator = findElement(tree, (el) => el.props?.testID === 'photo-syncing-indicator');
      expect(syncingIndicator).not.toBeNull();
      expect(findElement(tree, (el) => el.props?.children === 'Syncing to cloud...')).not.toBeNull();

      cleanup();
    });

    it('displays retry button when upload fails and invokes retrySync on press', async () => {
      mockProfilePhotoHook.syncStatus = 'local_only';
      mockProfilePhotoHook.error = 'Upload failed due to connection error.';
      const retrySpy = vi.fn().mockResolvedValue(undefined);
      mockProfilePhotoHook.retrySync = retrySpy;

      const { tree, cleanup } = renderWithAuth(
        React.createElement(UserProfileView, { user: parentUser })
      );

      const retryBtn = findElement(tree, (el) => el.props?.testID === 'photo-retry-button');
      expect(retryBtn).not.toBeNull();

      // Trigger retry press
      await retryBtn?.props?.onPress();
      expect(retrySpy).toHaveBeenCalledTimes(1);

      cleanup();
    });
  });
});
