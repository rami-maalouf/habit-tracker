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
import { WIDGET_ROW_LIMITS } from '@/features/widgets/widget-props';

// one widget kind covers every home screen family; the family decides how
// many projection rows render. the widget reads only widget_board_rows
// data handed to it through the timeline - no ad hoc queries.

function stripDots(row: WidgetRowProps) {
  return row.strip.map((count, index) => (
    <Circle
      key={index}
      modifiers={[
        frame({ width: 8, height: 8 }),
        foregroundStyle(count > 0 ? row.accentHex : '#787880'),
        opacity(count > 0 ? Math.min(1, 0.4 + count * 0.2) : 0.25),
      ]}
    />
  ));
}

function BoardRow({ row, stale }: { row: WidgetRowProps; stale: boolean }) {
  const label = stale
    ? `${row.title}. Open Ripples to refresh.`
    : row.title;
  return (
    <HStack key={row.boardId} modifiers={[accessibilityLabel(label)]}>
      <Image systemName={row.symbol as never} color={row.accentHex} size={14} />
      <Link destination={`habittracker://boards/${row.boardId}`}>
        <Text modifiers={[lineLimit(1)]}>{row.title}</Text>
      </Link>
      <Spacer />
      <HStack spacing={3}>{stripDots(row)}</HStack>
      <Button
        target={`quick:${row.boardId}`}
        modifiers={[accessibilityLabel(`Check in to ${row.title}`)]}
      >
        <Image systemName="circle" color={row.accentHex} size={16} />
      </Button>
    </HStack>
  );
}

const RipplesBoards = (props: RipplesWidgetProps, environment: WidgetEnvironment) => {
  'widget';
  const family = environment.widgetFamily as keyof typeof WIDGET_ROW_LIMITS;
  const limit = WIDGET_ROW_LIMITS[family] ?? WIDGET_ROW_LIMITS.systemMedium;
  const rows = (props.rows ?? []).slice(0, limit);

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
        <VStack spacing={8}>
          {rows.slice(0, half).map((row) => (
            <BoardRow key={row.boardId} row={row} stale={props.stale} />
          ))}
        </VStack>
        <VStack spacing={8}>
          {rows.slice(half).map((row) => (
            <BoardRow key={row.boardId} row={row} stale={props.stale} />
          ))}
        </VStack>
      </HStack>
    );
  }

  return (
    <VStack modifiers={[padding({ all: 8 })]} spacing={8}>
      {rows.map((row) => (
        <BoardRow key={row.boardId} row={row} stale={props.stale} />
      ))}
    </VStack>
  );
};

export default createWidget('RipplesBoards', RipplesBoards);
