import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { BottomNavBar, getTabsForRole } from '../BottomNavBar';
import { CustomerRole } from '../../services/authApi';

// Hook harness for evaluating components in Node
function renderComponent(ui: React.ReactElement) {
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
    useEffect() {},
    useContext() {
      return { top: 0, bottom: 20, left: 0, right: 0 };
    },
  };

  internals.H = dispatcher;
  hookIdx = 0;

  const Component = ui.type as React.FC<any>;
  const tree = Component(ui.props);

  const cleanup = () => {
    internals.H = originalDispatcher;
  };

  return { tree, cleanup };
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

describe('BottomNavBar Role-Specific Navigation', () => {
  it('getTabsForRole returns correct 4 tabs for Parent/Guardian', () => {
    const tabs = getTabsForRole('parent');
    expect(tabs.map((t) => t.id)).toEqual(['home', 'discover', 'bookings', 'profile']);
    expect(tabs.map((t) => t.label)).toEqual(['Home', 'Discover', 'Bookings', 'Profile']);
  });

  it('getTabsForRole returns correct 4 tabs for Individual Customer', () => {
    const tabs = getTabsForRole('individual');
    expect(tabs.map((t) => t.id)).toEqual(['home', 'discover', 'bookings', 'profile']);
    expect(tabs.map((t) => t.label)).toEqual(['Home', 'Discover', 'Bookings', 'Profile']);
  });

  it('getTabsForRole returns correct 4 tabs for Coach', () => {
    const tabs = getTabsForRole('coach');
    expect(tabs.map((t) => t.id)).toEqual(['home', 'sessions', 'availability', 'profile']);
    expect(tabs.map((t) => t.label)).toEqual(['Home', 'Sessions', 'Availability', 'Profile']);
  });

  it('renders bottom-nav-bar container with tablist accessibility role', () => {
    const onTabChange = vi.fn();
    const { tree, cleanup } = renderComponent(
      <BottomNavBar activeTab="home" onTabChange={onTabChange} role="parent" />
    );

    const bar = findElement(tree, (el) => el.props?.testID === 'bottom-nav-bar');
    expect(bar).not.toBeNull();
    expect(bar.props.accessibilityRole).toBe('tablist');

    cleanup();
  });

  it('renders exactly 4 tabs for parent role and excludes coach-only tabs', () => {
    const onTabChange = vi.fn();
    const { tree, cleanup } = renderComponent(
      <BottomNavBar activeTab="home" onTabChange={onTabChange} role="parent" />
    );

    expect(findElement(tree, (el) => el.props?.testID === 'tab-home')).not.toBeNull();
    expect(findElement(tree, (el) => el.props?.testID === 'tab-discover')).not.toBeNull();
    expect(findElement(tree, (el) => el.props?.testID === 'tab-bookings')).not.toBeNull();
    expect(findElement(tree, (el) => el.props?.testID === 'tab-profile')).not.toBeNull();

    expect(findElement(tree, (el) => el.props?.testID === 'tab-sessions')).toBeNull();
    expect(findElement(tree, (el) => el.props?.testID === 'tab-availability')).toBeNull();

    cleanup();
  });

  it('renders exactly 4 tabs for individual role and excludes coach-only tabs', () => {
    const onTabChange = vi.fn();
    const { tree, cleanup } = renderComponent(
      <BottomNavBar activeTab="home" onTabChange={onTabChange} role="individual" />
    );

    expect(findElement(tree, (el) => el.props?.testID === 'tab-home')).not.toBeNull();
    expect(findElement(tree, (el) => el.props?.testID === 'tab-discover')).not.toBeNull();
    expect(findElement(tree, (el) => el.props?.testID === 'tab-bookings')).not.toBeNull();
    expect(findElement(tree, (el) => el.props?.testID === 'tab-profile')).not.toBeNull();

    expect(findElement(tree, (el) => el.props?.testID === 'tab-sessions')).toBeNull();
    expect(findElement(tree, (el) => el.props?.testID === 'tab-availability')).toBeNull();

    cleanup();
  });

  it('renders exactly 4 tabs for coach role and excludes customer-only tabs', () => {
    const onTabChange = vi.fn();
    const { tree, cleanup } = renderComponent(
      <BottomNavBar activeTab="home" onTabChange={onTabChange} role="coach" />
    );

    expect(findElement(tree, (el) => el.props?.testID === 'tab-home')).not.toBeNull();
    expect(findElement(tree, (el) => el.props?.testID === 'tab-sessions')).not.toBeNull();
    expect(findElement(tree, (el) => el.props?.testID === 'tab-availability')).not.toBeNull();
    expect(findElement(tree, (el) => el.props?.testID === 'tab-profile')).not.toBeNull();

    expect(findElement(tree, (el) => el.props?.testID === 'tab-discover')).toBeNull();
    expect(findElement(tree, (el) => el.props?.testID === 'tab-bookings')).toBeNull();

    cleanup();
  });

  it('displays active indicator for the currently selected tab and triggers onTabChange on press', () => {
    const onTabChange = vi.fn();
    const { tree, cleanup } = renderComponent(
      <BottomNavBar activeTab="discover" onTabChange={onTabChange} role="parent" />
    );

    const activeIndicator = findElement(
      tree,
      (el) => el.props?.testID === 'indicator-discover'
    );
    expect(activeIndicator).not.toBeNull();

    const homeTab = findElement(tree, (el) => el.props?.testID === 'tab-home');
    homeTab.props.onPress();
    expect(onTabChange).toHaveBeenCalledWith('home');

    const bookingsTab = findElement(tree, (el) => el.props?.testID === 'tab-bookings');
    bookingsTab.props.onPress();
    expect(onTabChange).toHaveBeenCalledWith('bookings');

    const profileTab = findElement(tree, (el) => el.props?.testID === 'tab-profile');
    profileTab.props.onPress();
    expect(onTabChange).toHaveBeenCalledWith('profile');

    cleanup();
  });
});
