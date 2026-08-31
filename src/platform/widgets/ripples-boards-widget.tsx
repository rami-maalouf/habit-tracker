import { Circle, HStack, Image, Link, Spacer, Text, VStack } from '@expo/ui/swift-ui';
import {
  accessibilityLabel,
  foregroundStyle,
  frame,
  lineLimit,
  opacity,
  padding,
  widgetURL,
} from '@expo/ui/swift-ui/modifiers';
import { createWidget, type WidgetEnvironment } from 'expo-widgets';

import type { RipplesWidgetProps, WidgetRowProps } from '@/features/widgets/widget-props';

// one widget kind covers every home screen family; the family decides how
// many projection rows render. the widget reads only widget_board_rows
// data handed to it through the timeline - no ad hoc queries.
//
// the marked function executes inside the widget extension's own sandbox:
// every constant and helper it uses must live inside the function body,
// because module-scope values are not serialized with it.
//
// the quick action deep-links to Add Check-In rather than writing in place.
// expo-widgets runs an interactive button's App Intent inside the extension
// process (verified on device: `openAppWhenRun: NO`, perform() logged under
// ExpoWidgetsTarget) and posts its interaction event to that process's own
// NotificationCenter, so the app never observes the press and no validated
// row could be written. per the spec's rule for an action that cannot
// safely execute, the press deep-links instead of silently doing nothing;
// writing in place needs the native executor in the local module.
const RipplesBoards = (props: RipplesWidgetProps, environment: WidgetEnvironment) => {
  'widget';
  const family = environment.widgetFamily;
  const limit =
    family === 'systemSmall'
      ? 1
      : family === 'systemLarge'
        ? 7
        : family === 'systemExtraLarge'
          ? 12
          : 3;
  const rows = (props.rows ?? []).slice(0, limit);

  const renderRow = (row: WidgetRowProps) => {
    // the truncated title carries the full accessibility title; each
    // control keeps its own label, so the row never collapses into one
    // ambiguous element
    const titleLabel = props.stale
      ? `${row.title}. Open Ripples to refresh.`
      : row.title;
    const days = row.strip.reduce((total, count) => (count > 0 ? total + 1 : total), 0);
    return (
      <HStack key={row.boardId}>
        <Image systemName={row.symbol as never} color={row.accentHex} size={14} />
        <Link
          destination={`habittracker://boards/${row.boardId}`}
          modifiers={[accessibilityLabel(titleLabel)]}
        >
          <Text modifiers={[lineLimit(1)]}>{row.title}</Text>
        </Link>
        <Spacer />
        <HStack
          spacing={3}
          modifiers={[accessibilityLabel(`${days} of the last 7 days checked in`)]}
        >
          {row.strip.map((count, index) => (
            <Circle
              key={index}
              modifiers={[
                frame({ width: 8, height: 8 }),
                foregroundStyle(count > 0 ? row.accentHex : '#787880'),
                opacity(count > 0 ? Math.min(1, 0.4 + count * 0.2) : 0.25),
              ]}
            />
          ))}
        </HStack>
        <Link
          destination={`habittracker://boards/${row.boardId}/check-ins/new`}
          modifiers={[accessibilityLabel(`Check in to ${row.title}`)]}
        >
          <Image systemName="circle" color={row.accentHex} size={16} />
        </Link>
      </HStack>
    );
  };

  if (rows.length === 0) {
    return (
      <VStack modifiers={[widgetURL('habittracker://boards/new'), padding({ all: 12 })]}>
        <Text>Open Ripples to create your first board</Text>
      </VStack>
    );
  }

  if (family === 'systemExtraLarge') {
    // two balanced columns of up to six rows each
    const half = Math.ceil(rows.length / 2);
    return (
      <HStack modifiers={[padding({ all: 8 })]} spacing={16}>
        <VStack spacing={8}>{rows.slice(0, half).map(renderRow)}</VStack>
        <VStack spacing={8}>{rows.slice(half).map(renderRow)}</VStack>
      </HStack>
    );
  }

  return (
    <VStack modifiers={[padding({ all: 8 })]} spacing={8}>
      {rows.map(renderRow)}
    </VStack>
  );
};

export default createWidget('RipplesBoards', RipplesBoards);
