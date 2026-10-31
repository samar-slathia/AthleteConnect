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
    expect(tabs.map((t) => t.id)).toEqual(['home', 'coaches', 'bookings', 'profile']);
    expect(tabs.map((t) => t.label)).toEqual(['Home', 'Coaches', 'Bookings', 'Profile']);
  });

  it('getTabsForRole returns correct 4 tabs for Individual Customer', () => {
    const tabs = getTabsForRole('individual');
    expect(tabs.map((t) => t.id)).toEqual(['home', 'coaches', 'bookings', 'profile']);
    expect(tabs.map((t) => t.label)).toEqual(['Home', 'Coaches', 'Bookings', 'Profile']);
  });

  it('getTabsForRole returns correct 5 tabs for Coach', () => {
    const tabs = getTabsForRole('coach');
    expect(tabs.map((t) => t.id)).toEqual(['home', 'requests', 'sessions', 'availability', 'profile']);
    expect(tabs.map((t) => t.label)).toEqual(['Home', 'Requests', 'Sessions', 'Availability', 'Profile']);
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
    expect(findElement(tree, (el) => el.props?.testID === 'tab-coaches')).not.toBeNull();
    expect(findElement(tree, (el) => el.props?.testID === 'tab-bookings')).not.toBeNull();
    expect(findElement(tree, (el) => el.props?.testID === 'tab-profile')).not.toBeNull();

    expect(findElement(tree, (el) => el.props?.testID === 'tab-requests')).toBeNull();
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
    expect(findElement(tree, (el) => el.props?.testID === 'tab-coaches')).not.toBeNull();
    expect(findElement(tree, (el) => el.props?.testID === 'tab-bookings')).not.toBeNull();
    expect(findElement(tree, (el) => el.props?.testID === 'tab-profile')).not.toBeNull();

    expect(findElement(tree, (el) => el.props?.testID === 'tab-requests')).toBeNull();
    expect(findElement(tree, (el) => el.props?.testID === 'tab-sessions')).toBeNull();
    expect(findElement(tree, (el) => el.props?.testID === 'tab-availability')).toBeNull();

    cleanup();
  });

  it('renders exactly 5 tabs for coach role and excludes customer-only tabs', () => {
    const onTabChange = vi.fn();
    const { tree, cleanup } = renderComponent(
      <BottomNavBar activeTab="home" onTabChange={onTabChange} role="coach" />
    );

    expect(findElement(tree, (el) => el.props?.testID === 'tab-home')).not.toBeNull();
    expect(findElement(tree, (el) => el.props?.testID === 'tab-requests')).not.toBeNull();
    expect(findElement(tree, (el) => el.props?.testID === 'tab-sessions')).not.toBeNull();
    expect(findElement(tree, (el) => el.props?.testID === 'tab-availability')).not.toBeNull();
    expect(findElement(tree, (el) => el.props?.testID === 'tab-profile')).not.toBeNull();

    expect(findElement(tree, (el) => el.props?.testID === 'tab-coaches')).toBeNull();
    expect(findElement(tree, (el) => el.props?.testID === 'tab-bookings')).toBeNull();

    cleanup();
  });

  it('enforces accessible touch target dimensions and single-line labels for all 5 coach tabs', () => {
    const onTabChange = vi.fn();
    const { tree, cleanup } = renderComponent(
      <BottomNavBar activeTab="home" onTabChange={onTabChange} role="coach" />
    );

    const coachTabIds = ['home', 'requests', 'sessions', 'availability', 'profile'];
    for (const tabId of coachTabIds) {
      const button = findElement(tree, (el) => el.props?.testID === `tab-${tabId}`);
      expect(button).not.toBeNull();
      // Button style must specify minimum 44px touch targets
      const style = button.props.style;
      expect(style.minWidth).toBe(44);
      expect(style.minHeight).toBe(44);

      // Label text must not wrap onto multiple lines
      const label = findElement(button, (el) => typeof el.props?.children === 'string' && el.props.numberOfLines === 1);
      expect(label).not.toBeNull();
      expect(label.props.ellipsizeMode).toBe('tail');
    }

    cleanup();
  });

  it('renders pending request badge on Requests tab when count is positive', () => {
    const onTabChange = vi.fn();
    const { tree, cleanup } = renderComponent(
      <BottomNavBar
        activeTab="home"
        onTabChange={onTabChange}
        role="coach"
        badges={{ requests: 3 }}
      />
    );

    const badge = findElement(tree, (el) => el.props?.testID === 'tab-badge-requests');
    expect(badge).not.toBeNull();

    const badgeText = findElement(
      badge,
      (el) => typeof el.props?.children === 'string' && el.props.children === '3'
    );
    expect(badgeText).not.toBeNull();

    const requestsTab = findElement(tree, (el) => el.props?.testID === 'tab-requests');
    expect(requestsTab.props.accessibilityLabel).toBe('Requests tab, 3 pending');

    cleanup();
  });

  it('renders 9+ on badge for large counts and hides badge when count is zero', () => {
    const onTabChange = vi.fn();
    const { tree: treeWithLargeBadge, cleanup: cleanupLarge } = renderComponent(
      <BottomNavBar
        activeTab="home"
        onTabChange={onTabChange}
        role="coach"
        badges={{ requests: 15 }}
      />
    );

    const largeBadge = findElement(treeWithLargeBadge, (el) => el.props?.testID === 'tab-badge-requests');
    expect(largeBadge).not.toBeNull();
    const largeBadgeText = findElement(
      largeBadge,
      (el) => typeof el.props?.children === 'string' && el.props.children === '9+'
    );
    expect(largeBadgeText).not.toBeNull();
    cleanupLarge();

    const { tree: treeZero, cleanup: cleanupZero } = renderComponent(
      <BottomNavBar
        activeTab="home"
        onTabChange={onTabChange}
        role="coach"
        badges={{ requests: 0 }}
      />
    );

    const zeroBadge = findElement(treeZero, (el) => el.props?.testID === 'tab-badge-requests');
    expect(zeroBadge).toBeNull();
    cleanupZero();
  });

  it('displays active indicator for the currently selected tab and triggers onTabChange on press', () => {
    const onTabChange = vi.fn();
    const { tree, cleanup } = renderComponent(
      <BottomNavBar activeTab="coaches" onTabChange={onTabChange} role="parent" />
    );

    const activeIndicator = findElement(
      tree,
      (el) => el.props?.testID === 'indicator-coaches'
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
