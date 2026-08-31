import {
  Button,
  Circle,
  HStack,
  Image,
  Link,
  Spacer,
  Text,
  VStack,
} from '@expo/ui/swift-ui';
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
    const label = props.stale ? `${row.title}. Open Ripples to refresh.` : row.title;
    return (
      <HStack key={row.boardId} modifiers={[accessibilityLabel(label)]}>
        <Image systemName={row.symbol as never} color={row.accentHex} size={14} />
        <Link destination={`habittracker://boards/${row.boardId}`}>
          <Text modifiers={[lineLimit(1)]}>{row.title}</Text>
        </Link>
        <Spacer />
        <HStack spacing={3}>
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
        <Button
          target={`quick:${row.boardId}`}
          modifiers={[accessibilityLabel(`Check in to ${row.title}`)]}
        >
          <Image systemName="circle" color={row.accentHex} size={16} />
        </Button>
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
