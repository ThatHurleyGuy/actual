// @ts-strict-ignore
import React, { useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { AlignedText } from '@actual-app/components/aligned-text';
import { Button } from '@actual-app/components/button';
import {
  SvgArrowButtonDown1,
  SvgArrowButtonUp1,
} from '@actual-app/components/icons/v2';
import { InitialFocus } from '@actual-app/components/initial-focus';
import { Input } from '@actual-app/components/input';
import { SpaceBetween } from '@actual-app/components/space-between';
import { styles } from '@actual-app/components/styles';
import { Text } from '@actual-app/components/text';
import { theme } from '@actual-app/components/theme';
import { Tooltip } from '@actual-app/components/tooltip';
import { View } from '@actual-app/components/view';
import { tsToRelativeTime } from '@actual-app/core/shared/util';
import type { AccountEntity } from '@actual-app/core/types/models';
import { css, cx } from '@emotion/css';
import { format as formatDate } from 'date-fns';
import type { Locale } from 'date-fns';
import type { TFunction } from 'i18next';

import { useReopenAccountMutation, useUpdateAccountMutation } from '#accounts';
import { BalanceHistoryGraph } from '#components/accounts/BalanceHistoryGraph';
import { Link } from '#components/common/Link';
import { Notes } from '#components/Notes';
import { DropHighlight, useDraggable, useDroppable } from '#components/sort';
import type { OnDragChangeCallback, OnDropCallback } from '#components/sort';
import { CellValue } from '#components/spreadsheet/CellValue';
import { useContextMenu } from '#hooks/useContextMenu';
import { useDateFormat } from '#hooks/useDateFormat';
import { useDragRef } from '#hooks/useDragRef';
import { useIsTestEnv } from '#hooks/useIsTestEnv';
import { useLocale } from '#hooks/useLocale';
import { useNotes } from '#hooks/useNotes';
import { useSyncedPref } from '#hooks/useSyncedPref';
import { openAccountCloseModal } from '#modals/modalsSlice';
import { useDispatch, useSelector } from '#redux';
import type { Binding, SheetFields } from '#spreadsheet';
import * as bindings from '#spreadsheet/bindings';
import { isTouchDevice } from '#util/isTouchDevice';

export const accountNameStyle: CSSProperties = {
  marginTop: -2,
  marginBottom: 2,
  paddingTop: 4,
  paddingBottom: 4,
  paddingRight: 15,
  paddingLeft: 10,
  textDecoration: 'none',
  color: theme.sidebarItemText,
  ':hover': { backgroundColor: theme.sidebarItemBackgroundHover },
  ...styles.smallText,
};

type AccountProps<FieldName extends SheetFields<'account'>> = {
  name: string;
  to: string;
  query: Binding<'account', FieldName>;
  account?: AccountEntity;
  connected?: boolean;
  pending?: boolean;
  failed?: boolean;
  updated?: boolean;
  style?: CSSProperties;
  outerStyle?: CSSProperties;
  onDragChange?: OnDragChangeCallback<{ id: string }>;
  onDrop?: OnDropCallback;
  titleAccount?: boolean;
  isExactPathMatch?: boolean;
  balanceTestId?: string;
};

function getAccountTypeLabel(account: AccountEntity, t: TFunction) {
  if (account.closed) {
    return t('Closed');
  }

  return account.offbudget ? t('Off budget') : t('On budget');
}

function getLastReconciledText(
  lastReconciled: AccountEntity['last_reconciled'],
  dateFormat: string,
  locale: Locale,
  t: TFunction,
) {
  if (!lastReconciled) {
    return t('Not yet reconciled');
  }

  return t('{{ relativeTimeAgo }} ({{ absoluteDate }})', {
    relativeTimeAgo: tsToRelativeTime(lastReconciled, locale),
    absoluteDate: formatDate(
      new Date(parseInt(lastReconciled, 10)),
      dateFormat,
      {
        locale,
      },
    ),
  });
}

function AccountTooltipInfo({
  label,
  value,
}: {
  label: string;
  value: ReactNode;
}) {
  return (
    <SpaceBetween gap={12} style={{ justifyContent: 'space-between' }}>
      <Text style={{ color: theme.pageTextLight }}>{label}</Text>
      <Text style={{ textAlign: 'right' }}>{value}</Text>
    </SpaceBetween>
  );
}

export function Account<FieldName extends SheetFields<'account'>>({
  name,
  account,
  connected,
  pending = false,
  failed,
  updated,
  to,
  query,
  style,
  outerStyle,
  onDragChange,
  onDrop,
  titleAccount,
  isExactPathMatch,
  balanceTestId,
}: AccountProps<FieldName>) {
  const isTestEnv = useIsTestEnv();
  const { t } = useTranslation();
  const dateFormat = useDateFormat() || 'MM/dd/yyyy';
  const locale = useLocale();
  const type = account
    ? account.closed
      ? 'account-closed'
      : account.offbudget
        ? 'account-offbudget'
        : 'account-onbudget'
    : 'title';

  const triggerRef = useRef(null);

  const { dragRef } = useDraggable({
    type,
    onDragChange,
    item: { id: account && account.id },
    canDrag: account != null,
  });
  const handleDragRef = useDragRef(dragRef);

  const { dropRef, dropPos } = useDroppable({
    types: account ? [type] : [],
    id: account && account.id,
    onDrop,
  });

  const [showBalanceHistory, setShowBalanceHistory] = useSyncedPref(
    `side-nav.show-balance-history-${account?.id}`,
  );

  const dispatch = useDispatch();

  const [isEditing, setIsEditing] = useState(false);

  const accountNote = useNotes(`account-${account?.id}`);
  const needsTooltip = !!account?.id && !isTouchDevice();
  const reopenAccount = useReopenAccountMutation();
  const updateAccount = useUpdateAccountMutation();

  const balanceCell = <CellValue binding={query} type="financial" />;
  const accountTypeLabel = account ? getAccountTypeLabel(account, t) : null;
  const lastReconciledText = account
    ? getLastReconciledText(account.last_reconciled, dateFormat, locale, t)
    : null;

  const isContextMenuOpen = useSelector(state =>
    state.contextMenu.items.some(
      i =>
        typeof i === 'object' && 'name' in i && i.name.startsWith('account-'),
    ),
  );
  useContextMenu({
    triggerRef,
    enabled: account != null,
    items: [
      {
        name: 'account-rename',
        text: t('Rename'),
        onClick: () => setIsEditing(true),
      },
      account?.closed
        ? {
            name: 'account-reopen',
            text: t('Reopen'),
            onClick: () => reopenAccount.mutate({ id: account.id }),
          }
        : {
            name: 'account-close',
            text: t('Close'),
            onClick: () =>
              dispatch(openAccountCloseModal({ accountId: account.id })),
          },
    ],
  });

  const accountRow = (
    <View innerRef={dropRef} style={{ flexShrink: 0, ...outerStyle }}>
      <View innerRef={triggerRef}>
        <DropHighlight pos={dropPos} />
        <View innerRef={handleDragRef}>
          <Link
            variant="internal"
            to={to}
            isDisabled={isEditing}
            isExactPathMatch={isExactPathMatch}
            style={{
              ...accountNameStyle,
              ...style,
              position: 'relative',
              borderLeft: '4px solid transparent',
              ...(updated && {
                fontWeight: 700,
                color: theme.sidebarItemTextUpdated,
              }),
            }}
            activeStyle={{
              borderColor: theme.sidebarItemAccentSelected,
              color: theme.sidebarItemTextSelected,
              // This is kind of a hack, but we don't ever want the account
              // that the user is looking at to be "bolded" which means it
              // has unread transactions. The system does mark is read and
              // unbolds it, but it still "flashes" bold so this just
              // ignores it if it's active
              fontWeight: (style && style.fontWeight) || 'normal',
              '& .dot': {
                backgroundColor: theme.sidebarItemAccentSelected,
                transform: 'translateX(-4.5px)',
              },
            }}
          >
            <View
              style={{
                position: 'absolute',
                left: 0,
                top: 0,
                bottom: 0,
                flexDirection: 'row',
                alignItems: 'center',
              }}
            >
              <div
                className={cx(
                  'dot',
                  css({
                    marginRight: 3,
                    width: 5,
                    height: 5,
                    borderRadius: 5,
                    backgroundColor: pending
                      ? theme.sidebarItemBackgroundPending
                      : failed
                        ? theme.sidebarItemBackgroundFailed
                        : theme.sidebarItemBackgroundPositive,
                    marginLeft: 2,
                    transition: 'transform .3s',
                    opacity: connected ? 1 : 0,
                  }),
                )}
              />
            </View>

            <AlignedText
              style={
                titleAccount && {
                  borderBottom: `1.5px solid rgba(255,255,255,0.4)`,
                  paddingBottom: '3px',
                }
              }
              left={
                isEditing ? (
                  <InitialFocus>
                    <Input
                      style={{
                        padding: 0,
                        width: '100%',
                      }}
                      onBlur={() => setIsEditing(false)}
                      onEnter={newAccountName => {
                        if (newAccountName.trim() !== '') {
                          updateAccount.mutate({
                            account: {
                              ...account,
                              name: newAccountName,
                            },
                          });
                        }
                        setIsEditing(false);
                      }}
                      onEscape={() => setIsEditing(false)}
                      defaultValue={name}
                    />
                  </InitialFocus>
                ) : (
                  name
                )
              }
              right={
                balanceTestId ? (
                  <View data-testid={balanceTestId}>{balanceCell}</View>
                ) : (
                  balanceCell
                )
              }
            />
          </Link>
        </View>
      </View>
    </View>
  );

  if (!needsTooltip || isTestEnv) {
    return accountRow;
  }

  return (
    <Tooltip
      content={
        <View
          style={{
            padding: 10,
          }}
        >
          <SpaceBetween
            gap={5}
            style={{
              justifyContent: 'space-between',
              '& .hover-visible': {
                opacity: 0,
                transition: 'opacity .25s',
              },
              '&:hover .hover-visible': {
                opacity: 1,
              },
            }}
          >
            <Text
              style={{
                fontWeight: 'bold',
              }}
            >
              {name}
            </Text>
            <Button
              aria-label={t('Toggle balance history')}
              variant="bare"
              onClick={() =>
                setShowBalanceHistory(
                  showBalanceHistory === 'true' ? 'false' : 'true',
                )
              }
              className="hover-visible"
            >
              <SpaceBetween gap={3}>
                {showBalanceHistory === 'true' ? (
                  <SvgArrowButtonUp1 width={10} height={10} />
                ) : (
                  <SvgArrowButtonDown1 width={10} height={10} />
                )}
              </SpaceBetween>
            </Button>
          </SpaceBetween>
          {account && accountTypeLabel && lastReconciledText && (
            <View
              style={{
                gap: 4,
                marginTop: 8,
                minWidth: 260,
              }}
            >
              <AccountTooltipInfo
                label={t('Current balance')}
                value={<CellValue binding={query} type="financial" />}
              />
              <AccountTooltipInfo
                label={t('Cleared total')}
                value={
                  <CellValue
                    binding={bindings.accountBalanceCleared(account.id)}
                    type="financial"
                  />
                }
              />
              <AccountTooltipInfo
                label={t('Uncleared total')}
                value={
                  <CellValue
                    binding={bindings.accountBalanceUncleared(account.id)}
                    type="financial"
                  />
                }
              />
              <View
                style={{
                  borderTop: `1px solid ${theme.tableBorder}`,
                  marginBlock: 4,
                }}
              />
              <AccountTooltipInfo
                label={t('Status')}
                value={accountTypeLabel}
              />
              <AccountTooltipInfo
                label={t('Last reconciled')}
                value={lastReconciledText}
              />
            </View>
          )}
          {showBalanceHistory === 'true' && account && (
            <BalanceHistoryGraph
              accountId={account.id}
              style={{ minWidth: 350, minHeight: 70 }}
            />
          )}
          {accountNote && (
            <Notes
              getStyle={() => ({
                borderTop: `1px solid ${theme.tableBorder}`,
                padding: 0,
                paddingTop: '0.5rem',
                marginTop: '0.5rem',
              })}
              notes={accountNote}
            />
          )}
        </View>
      }
      style={{ ...styles.tooltip, borderRadius: '0px 5px 5px 0px' }}
      placement="right top"
      triggerProps={{
        delay: 1000,
        closeDelay: 250,
        isDisabled: isContextMenuOpen,
      }}
    >
      {accountRow}
    </Tooltip>
  );
}
