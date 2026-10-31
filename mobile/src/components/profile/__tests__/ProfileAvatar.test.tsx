import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { ProfileAvatar, getInitials } from '../ProfileAvatar';

// Mock react-native Image & lucide-react-native Camera for Node testing environment
vi.mock('react-native', async (importOriginal) => {
  const actual = await importOriginal<any>();
  const createMockComponent = (name: string) => {
    const Component = React.forwardRef(({ children, ...props }: any, ref: any) => {
      return React.createElement(name, { ...props, ref }, children);
    });
    Component.displayName = name;
    return Component;
  };
  return {
    ...actual,
    Image: createMockComponent('Image'),
  };
});

vi.mock('lucide-react-native', async (importOriginal) => {
  const actual = await importOriginal<any>();
  const createMockIcon = (name: string) => {
    const Icon: React.FC<any> = ({ size, color, ...props }) => {
      return React.createElement('svg', {
        ...props,
        'data-icon': name,
        width: size,
        height: size,
        color,
      });
    };
    Icon.displayName = name;
    return Icon;
  };
  return {
    ...actual,
    Camera: createMockIcon('Camera'),
  };
});

// Lightweight React component render harness matching existing test suite conventions
function renderComponent(ui: React.ReactElement) {
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
    useEffect(effect: () => void | (() => void)) {
      // Execute effects synchronously in test harness
      effect();
    },
    useContext() {
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
    cleanup,
  };
}

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

describe('ProfileAvatar Component', () => {
  describe('getInitials helper', () => {
    it('returns "U" when name is undefined, null, empty, or whitespace', () => {
      expect(getInitials()).toBe('U');
      expect(getInitials(null)).toBe('U');
      expect(getInitials('')).toBe('U');
      expect(getInitials('   ')).toBe('U');
    });

    it('returns single uppercase initial for single-word names', () => {
      expect(getInitials('Marcus')).toBe('M');
      expect(getInitials('bruce')).toBe('B');
    });

    it('returns two uppercase initials for two-word names', () => {
      expect(getInitials('Sarah Connor')).toBe('SC');
      expect(getInitials('marcus vance')).toBe('MV');
    });

    it('returns first two uppercase initials for names with 3+ words', () => {
      expect(getInitials('Master Bruce Wayne')).toBe('MB');
      expect(getInitials('  John   Fitzgerald   Kennedy  ')).toBe('JF');
    });
  });

  describe('Empty Avatar State & Fallbacks', () => {
    it('renders user initials when no imageUri is provided', () => {
      const { tree, cleanup } = renderComponent(
        React.createElement(ProfileAvatar, { name: 'Sarah Connor' })
      );

      const initialsEl = findElement(
        tree,
        (el) => el.props?.testID === 'profile-avatar-initials'
      );
      expect(initialsEl).not.toBeNull();
      expect(initialsEl.props.children).toBe('SC');

      // Image element should NOT be rendered in empty state
      const imageEl = findElement(
        tree,
        (el) => el.props?.testID === 'profile-avatar-image'
      );
      expect(imageEl).toBeNull();

      cleanup();
    });

    it('gracefully falls back to "U" when user name is missing or empty', () => {
      const { tree, cleanup } = renderComponent(
        React.createElement(ProfileAvatar, { name: null })
      );

      const initialsEl = findElement(
        tree,
        (el) => el.props?.testID === 'profile-avatar-initials'
      );
      expect(initialsEl).not.toBeNull();
      expect(initialsEl.props.children).toBe('U');

      cleanup();
    });
  });

  describe('Image State & Loading Error Fallback', () => {
    it('renders Image component with URI source when valid imageUri is provided', () => {
      const testUri = 'file:///mock/path/avatar.jpg';
      const { tree, cleanup } = renderComponent(
        React.createElement(ProfileAvatar, {
          name: 'Coach Marcus',
          imageUri: testUri,
        })
      );

      const imageEl = findElement(
        tree,
        (el) => el.props?.testID === 'profile-avatar-image'
      );
      expect(imageEl).not.toBeNull();
      expect(imageEl.props.source).toEqual({ uri: testUri });

      // Initials element should NOT be rendered when image is valid
      const initialsEl = findElement(
        tree,
        (el) => el.props?.testID === 'profile-avatar-initials'
      );
      expect(initialsEl).toBeNull();

      cleanup();
    });

    it('falls back to initials when image loading triggers onError', () => {
      const testUri = 'file:///broken/path.jpg';
      const { tree, reRender, cleanup } = renderComponent(
        React.createElement(ProfileAvatar, {
          name: 'Sarah Connor',
          imageUri: testUri,
        })
      );

      // Initially renders image
      const imageEl = findElement(
        tree,
        (el) => el.props?.testID === 'profile-avatar-image'
      );
      expect(imageEl).not.toBeNull();

      // Trigger onError callback
      imageEl.props.onError({ nativeEvent: { error: 'Failed to load' } });

      // Re-render component to reflect state update
      const updatedTree = reRender();

      // Image should now be gone, replaced by initials fallback
      const fallenBackImage = findElement(
        updatedTree,
        (el) => el.props?.testID === 'profile-avatar-image'
      );
      expect(fallenBackImage).toBeNull();

      const initialsEl = findElement(
        updatedTree,
        (el) => el.props?.testID === 'profile-avatar-initials'
      );
      expect(initialsEl).not.toBeNull();
      expect(initialsEl.props.children).toBe('SC');

      cleanup();
    });
  });

  describe('Edit Action, Accessibility & Callbacks', () => {
    it('renders camera button overlay and invokes onPress when pressed', () => {
      const onPressMock = vi.fn();
      const { tree, cleanup } = renderComponent(
        React.createElement(ProfileAvatar, {
          name: 'Bruce Wayne',
          onPress: onPressMock,
        })
      );

      const cameraBtn = findElement(
        tree,
        (el) => el.props?.testID === 'change-photo-button'
      );
      expect(cameraBtn).not.toBeNull();
      expect(cameraBtn.props.accessibilityRole).toBe('button');
      expect(cameraBtn.props.accessibilityLabel).toBe('Change profile photo');

      cameraBtn.props.onPress();
      expect(onPressMock).toHaveBeenCalledTimes(1);

      cleanup();
    });

    it('invokes onPress when the avatar touchable frame is pressed', () => {
      const onPressMock = vi.fn();
      const { tree, cleanup } = renderComponent(
        React.createElement(ProfileAvatar, {
          name: 'Bruce Wayne',
          onPress: onPressMock,
        })
      );

      const avatarTouchable = findElement(
        tree,
        (el) => el.props?.testID === 'profile-avatar-touchable'
      );
      expect(avatarTouchable).not.toBeNull();

      avatarTouchable.props.onPress();
      expect(onPressMock).toHaveBeenCalledTimes(1);

      cleanup();
    });

    it('does not render camera button overlay when onPress is not provided', () => {
      const { tree, cleanup } = renderComponent(
        React.createElement(ProfileAvatar, { name: 'Sarah Connor' })
      );

      const cameraBtn = findElement(
        tree,
        (el) => el.props?.testID === 'change-photo-button'
      );
      expect(cameraBtn).toBeNull();

      cleanup();
    });

    it('does not invoke onPress when disabled is true', () => {
      const onPressMock = vi.fn();
      const { tree, cleanup } = renderComponent(
        React.createElement(ProfileAvatar, {
          name: 'Bruce Wayne',
          onPress: onPressMock,
          disabled: true,
        })
      );

      const cameraBtn = findElement(
        tree,
        (el) => el.props?.testID === 'change-photo-button'
      );
      expect(cameraBtn).not.toBeNull();

      cameraBtn.props.onPress();
      expect(onPressMock).not.toHaveBeenCalled();

      cleanup();
    });

    it('provides accessible labels for screen readers', () => {
      const { tree, cleanup } = renderComponent(
        React.createElement(ProfileAvatar, {
          name: 'Sarah Connor',
          onPress: vi.fn(),
        })
      );

      const avatarTouchable = findElement(
        tree,
        (el) => el.props?.testID === 'profile-avatar-touchable'
      );
      expect(avatarTouchable.props.accessibilityLabel).toContain('Sarah Connor');
      expect(avatarTouchable.props.accessibilityRole).toBe('button');

      const cameraBtn = findElement(
        tree,
        (el) => el.props?.testID === 'change-photo-button'
      );
      expect(cameraBtn.props.accessibilityLabel).toBe('Change profile photo');
      expect(cameraBtn.props.accessibilityRole).toBe('button');

      cleanup();
    });
  });

  describe('Helper Text Visibility', () => {
    it('displays exactly "Recommended for better visibility." directly below avatar area', () => {
      const { tree, cleanup } = renderComponent(
        React.createElement(ProfileAvatar, { name: 'Sarah Connor' })
      );

      const helperTextEl = findElement(
        tree,
        (el) => el.props?.testID === 'profile-avatar-helper-text'
      );
      expect(helperTextEl).not.toBeNull();
      expect(helperTextEl.props.children).toBe('Recommended for better visibility.');

      cleanup();
    });

    it('hides helper text when showHelperText is false', () => {
      const { tree, cleanup } = renderComponent(
        React.createElement(ProfileAvatar, {
          name: 'Sarah Connor',
          showHelperText: false,
        })
      );

      const helperTextEl = findElement(
        tree,
        (el) => el.props?.testID === 'profile-avatar-helper-text'
      );
      expect(helperTextEl).toBeNull();

      cleanup();
    });
  });
});
