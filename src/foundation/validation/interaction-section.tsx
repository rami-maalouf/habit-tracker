import { Button, Column, Host, Switch } from '@expo/ui';

import { AppText } from '@/components/foundation/app-text';

import { Section } from './section';

type InteractionSectionProps = {
  actionCount: number;
};

const noop = () => undefined;

export function InteractionSection({ actionCount }: InteractionSectionProps) {
  return (
    <Section title="Interaction states">
      <Host matchContents>
        <Column>
          <Button label="Disabled action" disabled onPress={noop} />
          <Switch label="Disabled switch" value={false} disabled onValueChange={noop} />
        </Column>
      </Host>
      <AppText variant="body" testID="action-count">{`Action count: ${actionCount}`}</AppText>
    </Section>
  );
}
