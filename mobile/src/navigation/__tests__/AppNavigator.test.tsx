import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import App from '../../../App';
import { AppNavigator } from '../AppNavigator';
import { WelcomeScreen } from '../../screens/WelcomeScreen';
import { RoleSelectionScreen } from '../../screens/RoleSelectionScreen';
import { RolePreviewScreen } from '../../screens/RolePreviewScreen';
import { RegisterScreen } from '../../screens/RegisterScreen';
import { LoginScreen } from '../../screens/LoginScreen';
import { HomeScreen } from '../../screens/HomeScreen';
import { AuthContext, AuthProvider, AuthContextType } from '../../context/AuthContext';
import { UserProfile } from '../../services/authApi';
import { NavigationContainer } from '@react-navigation/native';

// Hook harness for evaluating functional components with useState and useContext in Node
function renderWithAuth(ui: React.ReactElement, authValue: Partial<AuthContextType> = {}) {
  const defaultAuth: AuthContextType = {
    user: null,
    token: null,
    isLoading: false,
    error: null,
    login: vi.fn().mockResolvedValue(undefined),
    register: vi.fn().mockResolvedValue(undefined),
    logout: vi.fn().mockResolvedValue(undefined),
    clearError: vi.fn(),
    ...authValue,
  };

  const internals = (React as any).__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;
  const originalDispatcher = internals.H;

  let hooks: any[] = [];
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
    useEffect() {
      // No-op for render test
    },
    useContext(context: any) {
      if (context === AuthContext) {
        return defaultAuth;
      }
      return null;
    },
  };

  internals.H = dispatcher;
  hookIdx = 0;

  const Component = ui.type as React.FC<any>;
  const tree = Component(ui.props);

  const cleanup = () => {
    internals.H = originalDispatcher;
  };

  return { tree, auth: defaultAuth, cleanup };
}

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

const mockVerifiedUser: UserProfile = {
  _id: 'usr_coach_99',
  name: 'Coach Marcus',
  email: 'marcus@athletics.com',
  role: 'coach',
  isActive: true,
};

describe('AuthProvider & App Integration', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders AuthProvider wrapping NavigationContainer and AppNavigator in App root', () => {
    const appTree = App();
    expect(appTree).toBeDefined();

    // Verify AuthProvider exists in the hierarchy
    const authProviderEl = findElement(appTree, (el) => el.type === AuthProvider);
    expect(authProviderEl).toBeDefined();

    // Verify NavigationContainer is inside AuthProvider
    const navContainerEl = findElement(authProviderEl, (el) => el.type === NavigationContainer);
    expect(navContainerEl).toBeDefined();

    // Verify AppNavigator is rendered inside NavigationContainer
    const appNavEl = findElement(navContainerEl, (el) => el.type === AppNavigator);
    expect(appNavEl).toBeDefined();
  });
});

describe('AppNavigator - Session Initialization', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('displays branded loading screen while saved token is being validated (isLoading = true)', () => {
    const { tree, cleanup } = renderWithAuth(React.createElement(AppNavigator), {
      isLoading: true,
      user: null,
    });

    const loadingContainer = findElement(tree, (el) => el.props?.testID === 'session-loading');
    expect(loadingContainer).toBeDefined();

    const brandName = findElement(tree, (el) => el.props?.children === 'AthleteConnect');
    expect(brandName).toBeDefined();

    const tagline = findElement(
      tree,
      (el) => el.props?.children === 'Your Sport. Your Coach. Your Space.'
    );
    expect(tagline).toBeDefined();

    const spinner = findElement(tree, (el) => el.props?.testID === 'loading-spinner');
    expect(spinner).toBeDefined();

    // Stack screens must NOT be mounted while session is initializing
    const screens = findAllElements(tree, (el) => el.type === 'NativeStackScreen');
    expect(screens).toHaveLength(0);

    cleanup();
  });
});

describe('AppNavigator - Unauthenticated Navigation', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders unauthenticated stack with Welcome, RoleSelection, RolePreview, Register, Login', () => {
    const { tree, cleanup } = renderWithAuth(React.createElement(AppNavigator), {
      isLoading: false,
      user: null,
    });

    const navigator = findElement(
      tree,
      (el) => el.type?.displayName === 'NativeStackNavigator' || el.type === 'NativeStackNavigator'
    );
    expect(navigator).toBeDefined();
    expect(navigator.props.initialRouteName).toBe('Welcome');

    const screens = findAllElements(
      tree,
      (el) => el.type?.displayName === 'NativeStackScreen' || el.type === 'NativeStackScreen'
    );
    const screenNames = screens.map((s) => s.props.name);

    expect(screenNames).toEqual(['Welcome', 'RoleSelection', 'RolePreview', 'Register', 'Login']);

    // Authenticated Home screen must NOT be present
    expect(screenNames).not.toContain('Home');

    cleanup();
  });

  it('prevents access to Home screen when user is unauthenticated', () => {
    const { tree, cleanup } = renderWithAuth(React.createElement(AppNavigator), {
      isLoading: false,
      user: null,
    });

    const homeScreen = findElement(tree, (el) => el.props?.name === 'Home');
    expect(homeScreen).toBeNull();

    cleanup();
  });
});

describe('AppNavigator - Authenticated Navigation', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders authenticated stack with Home screen when user is logged in', () => {
    const { tree, cleanup } = renderWithAuth(React.createElement(AppNavigator), {
      isLoading: false,
      user: mockVerifiedUser,
    });

    const navigator = findElement(
      tree,
      (el) => el.type?.displayName === 'NativeStackNavigator' || el.type === 'NativeStackNavigator'
    );
    expect(navigator).toBeDefined();
    expect(navigator.props.initialRouteName).toBe('Home');

    const screens = findAllElements(
      tree,
      (el) => el.type?.displayName === 'NativeStackScreen' || el.type === 'NativeStackScreen'
    );
    const screenNames = screens.map((s) => s.props.name);

    expect(screenNames).toEqual(['Home']);

    // Unauthenticated onboarding screens must NOT be present in authenticated stack
    expect(screenNames).not.toContain('Welcome');
    expect(screenNames).not.toContain('RoleSelection');
    expect(screenNames).not.toContain('RolePreview');
    expect(screenNames).not.toContain('Register');
    expect(screenNames).not.toContain('Login');

    cleanup();
  });

  it('switches to authenticated Home screen upon login / registration success', () => {
    // 1. Initial unauthenticated state
    const { tree: unauthTree, cleanup: unauthCleanup } = renderWithAuth(
      React.createElement(AppNavigator),
      { isLoading: false, user: null }
    );
    const unauthScreens = findAllElements(
      unauthTree,
      (el) => el.type?.displayName === 'NativeStackScreen' || el.type === 'NativeStackScreen'
    ).map((s) => s.props.name);
    expect(unauthScreens).toContain('Welcome');
    expect(unauthScreens).not.toContain('Home');
    unauthCleanup();

    // 2. Authentication succeeds: user is verified
    const { tree: authTree, cleanup: authCleanup } = renderWithAuth(
      React.createElement(AppNavigator),
      { isLoading: false, user: mockVerifiedUser }
    );
    const authScreens = findAllElements(
      authTree,
      (el) => el.type?.displayName === 'NativeStackScreen' || el.type === 'NativeStackScreen'
    ).map((s) => s.props.name);
    expect(authScreens).toContain('Home');
    expect(authScreens).not.toContain('Welcome');
    authCleanup();
  });

  it('switches back to unauthenticated stack upon logout', () => {
    // 1. Authenticated state
    const { tree: authTree, cleanup: authCleanup } = renderWithAuth(
      React.createElement(AppNavigator),
      { isLoading: false, user: mockVerifiedUser }
    );
    expect(
      findAllElements(
        authTree,
        (el) => el.type?.displayName === 'NativeStackScreen' || el.type === 'NativeStackScreen'
      ).map((s) => s.props.name)
    ).toEqual(['Home']);
    authCleanup();

    // 2. Logout occurs: user becomes null
    const { tree: loggedOutTree, cleanup: loggedOutCleanup } = renderWithAuth(
      React.createElement(AppNavigator),
      { isLoading: false, user: null }
    );
    const screens = findAllElements(
      loggedOutTree,
      (el) => el.type?.displayName === 'NativeStackScreen' || el.type === 'NativeStackScreen'
    ).map((s) => s.props.name);
    expect(screens).toEqual(['Welcome', 'RoleSelection', 'RolePreview', 'Register', 'Login']);
    expect(screens).not.toContain('Home');
    loggedOutCleanup();
  });
});

describe('Role Selection & Role Preview Navigation Actions', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('RoleSelectionScreen provides Sign In entry point navigating to Login', () => {
    const navigateMock = vi.fn();
    const navigation: any = { navigate: navigateMock };

    const { tree, cleanup } = renderWithAuth(
      React.createElement(RoleSelectionScreen, { navigation, route: {} as any })
    );

    const signInBtn = findElement(
      tree,
      (el) => el.props?.accessibilityLabel === 'Sign in to existing account'
    );
    expect(signInBtn).toBeDefined();

    signInBtn.props.onPress();
    expect(navigateMock).toHaveBeenCalledWith('Login');

    cleanup();
  });

  it('RoleSelectionScreen Continue button navigates to RolePreview with selected role', () => {
    const navigateMock = vi.fn();
    const navigation: any = { navigate: navigateMock };

    const { tree, cleanup } = renderWithAuth(
      React.createElement(RoleSelectionScreen, { navigation, route: {} as any })
    );

    const continueBtn = findElement(
      tree,
      (el) => el.props?.title?.startsWith('Continue as')
    );
    expect(continueBtn).toBeDefined();

    continueBtn.props.onPress();
    expect(navigateMock).toHaveBeenCalledWith('RolePreview', { roleId: 'parent' });

    cleanup();
  });

  it('RolePreviewScreen primary action opens RegisterScreen with parent role', () => {
    const navigateMock = vi.fn();
    const navigation: any = { navigate: navigateMock, goBack: vi.fn() };

    const { tree, cleanup } = renderWithAuth(
      React.createElement(RolePreviewScreen, {
        navigation,
        route: { params: { roleId: 'parent' } } as any,
      })
    );

    const primaryBtn = findElement(
      tree,
      (el) => el.props?.title === 'Create Parent / Guardian Account'
    );
    expect(primaryBtn).toBeDefined();

    primaryBtn.props.onPress();
    expect(navigateMock).toHaveBeenCalledWith('Register', { initialRole: 'parent' });

    cleanup();
  });

  it('RolePreviewScreen primary action opens RegisterScreen with coach role', () => {
    const navigateMock = vi.fn();
    const navigation: any = { navigate: navigateMock, goBack: vi.fn() };

    const { tree, cleanup } = renderWithAuth(
      React.createElement(RolePreviewScreen, {
        navigation,
        route: { params: { roleId: 'coach' } } as any,
      })
    );

    const primaryBtn = findElement(
      tree,
      (el) => el.props?.title === 'Create Player / Coach Account'
    );
    expect(primaryBtn).toBeDefined();

    primaryBtn.props.onPress();
    expect(navigateMock).toHaveBeenCalledWith('Register', { initialRole: 'coach' });

    cleanup();
  });

  it('RolePreviewScreen primary action opens RegisterScreen with individual role', () => {
    const navigateMock = vi.fn();
    const navigation: any = { navigate: navigateMock, goBack: vi.fn() };

    const { tree, cleanup } = renderWithAuth(
      React.createElement(RolePreviewScreen, {
        navigation,
        route: { params: { roleId: 'individual' } } as any,
      })
    );

    const primaryBtn = findElement(
      tree,
      (el) => el.props?.title === 'Create Individual Customer Account'
    );
    expect(primaryBtn).toBeDefined();

    primaryBtn.props.onPress();
    expect(navigateMock).toHaveBeenCalledWith('Register', { initialRole: 'individual' });

    cleanup();
  });

  it('RolePreviewScreen secondary action opens LoginScreen', () => {
    const navigateMock = vi.fn();
    const navigation: any = { navigate: navigateMock, goBack: vi.fn() };

    const { tree, cleanup } = renderWithAuth(
      React.createElement(RolePreviewScreen, {
        navigation,
        route: { params: { roleId: 'individual' } } as any,
      })
    );

    const signInBtn = findElement(
      tree,
      (el) => el.props?.title === 'Already have an account? Sign In'
    );
    expect(signInBtn).toBeDefined();

    signInBtn.props.onPress();
    expect(navigateMock).toHaveBeenCalledWith('Login');

    cleanup();
  });

  it('RolePreviewScreen change role action returns back to role selection', () => {
    const goBackMock = vi.fn();
    const navigation: any = { navigate: vi.fn(), goBack: goBackMock };

    const { tree, cleanup } = renderWithAuth(
      React.createElement(RolePreviewScreen, {
        navigation,
        route: { params: { roleId: 'parent' } } as any,
      })
    );

    const returnBtn = findElement(
      tree,
      (el) => el.props?.accessibilityLabel === 'Change selected role'
    );
    expect(returnBtn).toBeDefined();

    returnBtn.props.onPress();
    expect(goBackMock).toHaveBeenCalledTimes(1);

    cleanup();
  });
});

describe('RegisterScreen & LoginScreen Navigation Integration', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('RegisterScreen navigates to Login when "Sign In" is tapped', () => {
    const navigateMock = vi.fn();
    const navigation: any = { navigate: navigateMock, canGoBack: () => true, goBack: vi.fn() };

    const { tree, cleanup } = renderWithAuth(
      React.createElement(RegisterScreen, {
        navigation,
        route: { params: { initialRole: 'parent' } } as any,
      })
    );

    const signInLink = findElement(
      tree,
      (el) => el.props?.accessibilityLabel === 'Sign in to existing account'
    );
    expect(signInLink).toBeDefined();

    signInLink.props.onPress();
    expect(navigateMock).toHaveBeenCalledWith('Login');

    cleanup();
  });

  it('LoginScreen navigates to RoleSelection when "Sign Up" is tapped', () => {
    const navigateMock = vi.fn();
    const navigation: any = { navigate: navigateMock, canGoBack: () => true, goBack: vi.fn() };

    const { tree, cleanup } = renderWithAuth(
      React.createElement(LoginScreen, {
        navigation,
        route: {} as any,
      })
    );

    const signUpLink = findElement(
      tree,
      (el) => el.props?.accessibilityLabel === 'Create a new account'
    );
    expect(signUpLink).toBeDefined();

    signUpLink.props.onPress();
    expect(navigateMock).toHaveBeenCalledWith('RoleSelection');

    cleanup();
  });
});

describe('WelcomeScreen Flow Preservation', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('WelcomeScreen skip button navigates to RoleSelection', () => {
    const replaceMock = vi.fn();
    const navigation: any = { replace: replaceMock };

    const { tree, cleanup } = renderWithAuth(
      React.createElement(WelcomeScreen, {
        navigation,
        route: {} as any,
      })
    );

    const skipBtn = findElement(
      tree,
      (el) => el.props?.accessibilityLabel?.includes('Skip welcome')
    );
    expect(skipBtn).toBeDefined();

    skipBtn.props.onPress();
    expect(replaceMock).toHaveBeenCalledWith('RoleSelection');

    cleanup();
  });
});
