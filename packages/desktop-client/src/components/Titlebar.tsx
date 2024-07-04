import React, {
  createContext,
  useState,
  useEffect,
  useRef,
  useContext,
  type ReactNode,
} from 'react';
import { useHotkeys } from 'react-hotkeys-hook';
import { Routes, Route, useLocation } from 'react-router-dom';

import * as Platform from 'loot-core/src/client/platform';
import * as queries from 'loot-core/src/client/queries';
import { listen } from 'loot-core/src/platform/client/fetch';
import { isDevelopmentEnvironment } from 'loot-core/src/shared/environment';
import { type LocalPrefs } from 'loot-core/src/types/prefs';

import { useActions } from '../hooks/useActions';
import { useFeatureFlag } from '../hooks/useFeatureFlag';
import { useGlobalPref } from '../hooks/useGlobalPref';
import { useLocalPref } from '../hooks/useLocalPref';
import { useNavigate } from '../hooks/useNavigate';
import { SvgArrowLeft } from '../icons/v1';
import {
  SvgAlertTriangle,
  SvgNavigationMenu,
  SvgViewHide,
  SvgViewShow,
} from '../icons/v2';
import { useResponsive } from '../ResponsiveProvider';
import { theme, type CSSProperties, styles } from '../style';

import { AccountSyncCheck } from './accounts/AccountSyncCheck';
import { AnimatedRefresh } from './AnimatedRefresh';
import { MonthCountSelector } from './budget/MonthCountSelector';
import { Button, ButtonWithLoading } from './common/Button2';
import { Link } from './common/Link';
import { Paragraph } from './common/Paragraph';
import { Popover } from './common/Popover';
import { Text } from './common/Text';
import { View } from './common/View';
import { LoggedInUser } from './LoggedInUser';
import { useServerURL } from './ServerContext';
import { useSidebar } from './sidebar/SidebarProvider';
import { useSheetValue } from './spreadsheet/useSheetValue';
import { ThemeSelector } from './ThemeSelector';

export const SWITCH_BUDGET_MESSAGE_TYPE = 'budget/switch-type';

type SwitchBudgetTypeMessage = {
  type: typeof SWITCH_BUDGET_MESSAGE_TYPE;
  payload: {
    newBudgetType: LocalPrefs['budgetType'];
  };
};
export type TitlebarMessage = SwitchBudgetTypeMessage;

type Listener = (msg: TitlebarMessage) => void;
export type TitlebarContextValue = {
  sendEvent: (msg: TitlebarMessage) => void;
  subscribe: (listener: Listener) => () => void;
};

export const TitlebarContext = createContext<TitlebarContextValue>({
  sendEvent() {
    throw new Error('TitlebarContext not initialized');
  },
  subscribe() {
    throw new Error('TitlebarContext not initialized');
  },
});

type TitlebarProviderProps = {
  children?: ReactNode;
};

export function TitlebarProvider({ children }: TitlebarProviderProps) {
  const listeners = useRef<Listener[]>([]);

  function sendEvent(msg: TitlebarMessage) {
    listeners.current.forEach(func => func(msg));
  }

  function subscribe(listener: Listener) {
    listeners.current.push(listener);
    return () =>
      (listeners.current = listeners.current.filter(func => func !== listener));
  }

  return (
    <TitlebarContext.Provider value={{ sendEvent, subscribe }}>
      {children}
    </TitlebarContext.Provider>
  );
}

function UncategorizedButton() {
  const count: number | null = useSheetValue(queries.uncategorizedCount());
  if (count === null || count <= 0) {
    return null;
  }

  return (
    <Link
      variant="button"
      type="bare"
      to="/accounts/uncategorized"
      style={{
        color: theme.errorText,
      }}
    >
      {count} uncategorized {count === 1 ? 'transaction' : 'transactions'}
    </Link>
  );
}

type PrivacyButtonProps = {
  style?: CSSProperties;
};

function PrivacyButton({ style }: PrivacyButtonProps) {
  const [isPrivacyEnabled, setPrivacyEnabledPref] =
    useLocalPref('isPrivacyEnabled');

  const privacyIconStyle = { width: 15, height: 15 };

  return (
    <Button
      variant="bare"
      aria-label={`${isPrivacyEnabled ? 'Disable' : 'Enable'} privacy mode`}
      onPress={() => setPrivacyEnabledPref(!isPrivacyEnabled)}
      style={style}
    >
      {isPrivacyEnabled ? (
        <SvgViewHide style={privacyIconStyle} />
      ) : (
        <SvgViewShow style={privacyIconStyle} />
      )}
    </Button>
  );
}

type SyncButtonProps = {
  style?: CSSProperties;
  isMobile?: boolean;
};
function SyncButton({ style, isMobile = false }: SyncButtonProps) {
  const [cloudFileId] = useLocalPref('cloudFileId');
  const { sync } = useActions();

  const [syncing, setSyncing] = useState(false);
  const [syncState, setSyncState] = useState<
    null | 'offline' | 'local' | 'disabled' | 'error'
  >(null);

  useEffect(() => {
    const unlisten = listen('sync-event', ({ type, subtype, syncDisabled }) => {
      if (type === 'start') {
        setSyncing(true);
        setSyncState(null);
      } else {
        // Give the layout some time to apply the starting animation
        // so we always finish it correctly even if it's almost
        // instant
        setTimeout(() => {
          setSyncing(false);
        }, 200);
      }

      if (type === 'error') {
        // Use the offline state if either there is a network error or
        // if this file isn't a "cloud file". You can't sync a local
        // file.
        if (subtype === 'network') {
          setSyncState('offline');
        } else if (!cloudFileId) {
          setSyncState('local');
        } else {
          setSyncState('error');
        }
      } else if (type === 'success') {
        setSyncState(syncDisabled ? 'disabled' : null);
      }
    });

    return unlisten;
  }, []);

  const mobileColor =
    syncState === 'error'
      ? theme.errorText
      : syncState === 'disabled' ||
          syncState === 'offline' ||
          syncState === 'local'
        ? theme.mobileHeaderTextSubdued
        : theme.mobileHeaderText;
  const desktopColor =
    syncState === 'error'
      ? theme.errorTextDark
      : syncState === 'disabled' ||
          syncState === 'offline' ||
          syncState === 'local'
        ? theme.tableTextLight
        : 'inherit';

  const activeStyle = isMobile
    ? {
        color: mobileColor,
      }
    : {};

  const hoveredStyle = isMobile
    ? {
        color: mobileColor,
        background: theme.mobileHeaderTextHover,
      }
    : {};

  const mobileIconStyle = {
    color: mobileColor,
    justifyContent: 'center',
    margin: 10,
    paddingLeft: 5,
    paddingRight: 3,
  };

  const mobileTextStyle = {
    ...styles.text,
    fontWeight: 500,
    marginLeft: 2,
    marginRight: 5,
  };

  useHotkeys(
    'ctrl+s, cmd+s, meta+s',
    sync,
    {
      enableOnFormTags: true,
      preventDefault: true,
      scopes: ['app'],
    },
    [sync],
  );

  return (
    <Button
      variant="bare"
      aria-label="Sync"
      style={({ isHovered, isPressed }) => ({
        ...(isMobile
          ? {
              ...style,
              WebkitAppRegion: 'none',
              ...mobileIconStyle,
            }
          : {
              ...style,
              WebkitAppRegion: 'none',
              color: desktopColor,
            }),
        ...(isHovered ? hoveredStyle : {}),
        ...(isPressed ? activeStyle : {}),
      })}
      onPress={sync}
    >
      {isMobile ? (
        syncState === 'error' ? (
          <SvgAlertTriangle width={14} height={14} />
        ) : (
          <AnimatedRefresh width={18} height={18} animating={syncing} />
        )
      ) : syncState === 'error' ? (
        <SvgAlertTriangle width={13} />
      ) : (
        <AnimatedRefresh animating={syncing} />
      )}
      <Text style={isMobile ? { ...mobileTextStyle } : { marginLeft: 3 }}>
        {syncState === 'disabled'
          ? 'Disabled'
          : syncState === 'offline'
            ? 'Offline'
            : 'Sync'}
      </Text>
    </Button>
  );
}

function BudgetTitlebar() {
  const [maxMonths, setMaxMonthsPref] = useGlobalPref('maxMonths');
  const [budgetType] = useLocalPref('budgetType');
  const { sendEvent } = useContext(TitlebarContext);

  const [loading, setLoading] = useState(false);
  const [showPopover, setShowPopover] = useState(false);
  const triggerRef = useRef(null);

  const reportBudgetEnabled = useFeatureFlag('reportBudget');

  function onSwitchType() {
    setLoading(true);
    if (!loading) {
      const newBudgetType = budgetType === 'rollover' ? 'report' : 'rollover';
      sendEvent({
        type: SWITCH_BUDGET_MESSAGE_TYPE,
        payload: {
          newBudgetType,
        },
      });
    }
  }

  useEffect(() => {
    setLoading(false);
  }, [budgetType]);

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      <MonthCountSelector
        maxMonths={maxMonths || 1}
        onChange={value => setMaxMonthsPref(value)}
      />
      {reportBudgetEnabled && (
        <View style={{ marginLeft: -5 }}>
          <ButtonWithLoading
            ref={triggerRef}
            variant="bare"
            isLoading={loading}
            style={{
              alignSelf: 'flex-start',
              padding: '4px 7px',
            }}
            aria-label="Learn more about budgeting"
            onPress={() => setShowPopover(true)}
          >
            {budgetType === 'report' ? 'Report budget' : 'Rollover budget'}
          </ButtonWithLoading>

          <Popover
            triggerRef={triggerRef}
            placement="bottom start"
            isOpen={showPopover}
            onOpenChange={() => setShowPopover(false)}
            style={{
              padding: 10,
              maxWidth: 400,
            }}
          >
            <Paragraph>
              You are currently using a{' '}
              <Text style={{ fontWeight: 600 }}>
                {budgetType === 'report' ? 'Report budget' : 'Rollover budget'}.
              </Text>{' '}
              Switching will not lose any data and you can always switch back.
            </Paragraph>
            <Paragraph>
              <ButtonWithLoading
                aria-label={`Switch to a ${budgetType === 'report' ? 'Rollover budget' : 'Report budget'}`}
                variant="primary"
                isLoading={loading}
                onPress={onSwitchType}
              >
                Switch to a{' '}
                {budgetType === 'report' ? 'Rollover budget' : 'Report budget'}
              </ButtonWithLoading>
            </Paragraph>
            <Paragraph isLast={true}>
              <Link
                variant="external"
                to="https://actualbudget.org/docs/experimental/report-budget"
                linkColor="muted"
              >
                How do these types of budgeting work?
              </Link>
            </Paragraph>
          </Popover>
        </View>
      )}
    </View>
  );
}

type TitlebarProps = {
  style?: CSSProperties;
};

export function Titlebar({ style }: TitlebarProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const sidebar = useSidebar();
  const { isNarrowWidth } = useResponsive();
  const serverURL = useServerURL();
  const [floatingSidebar] = useGlobalPref('floatingSidebar');

  return isNarrowWidth ? null : (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        padding: '0 15px',
        height: 36,
        pointerEvents: 'none',
        '& *': {
          pointerEvents: 'auto',
        },
        ...(!Platform.isBrowser &&
          Platform.OS === 'mac' &&
          floatingSidebar && { paddingLeft: 80 }),
        ...style,
      }}
    >
      {(floatingSidebar || sidebar.alwaysFloats) && (
        <Button
          aria-label="Sidebar menu"
          variant="bare"
          style={{ marginRight: 8 }}
          onHoverStart={e => {
            if (e.pointerType === 'mouse') {
              sidebar.setHidden(false);
            }
          }}
          onPress={e => {
            if (e.pointerType !== 'mouse') {
              sidebar.setHidden(!sidebar.hidden);
            }
          }}
        >
          <SvgNavigationMenu
            className="menu"
            style={{ width: 15, height: 15, color: theme.pageText, left: 0 }}
          />
        </Button>
      )}

      <Routes>
        <Route
          path="/accounts"
          element={
            location.state?.goBack ? (
              <Button
                variant="bare"
                aria-label="Back"
                onPress={() => navigate(-1)}
              >
                <SvgArrowLeft
                  width={10}
                  height={10}
                  style={{ marginRight: 5, color: 'currentColor' }}
                />{' '}
                Back
              </Button>
            ) : null
          }
        />

        <Route path="/accounts/:id" element={<AccountSyncCheck />} />

        <Route path="/budget" element={<BudgetTitlebar />} />

        <Route path="*" element={null} />
      </Routes>
      <View style={{ flex: 1 }} />
      <UncategorizedButton />
      {isDevelopmentEnvironment() && !Platform.isPlaywright && (
        <ThemeSelector style={{ marginLeft: 10 }} />
      )}
      <PrivacyButton style={{ marginLeft: 10 }} />
      {serverURL ? <SyncButton style={{ marginLeft: 10 }} /> : null}
      <LoggedInUser style={{ marginLeft: 10 }} />
    </View>
  );
}
