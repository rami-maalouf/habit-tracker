import { Button, Column, Host, Picker, Row, Slider, Switch, Text, TextInput } from '@expo/ui';
import { useState } from 'react';

import { frequencyOptions, previewDefaults } from './fixtures';
import { Section } from './section';

type ControlsSectionProps = {
  onPrimaryAction: () => void;
};

export function ControlsSection({ onPrimaryAction }: ControlsSectionProps) {
  const [habitEnabled, setHabitEnabled] = useState<boolean>(previewDefaults.habitEnabled);
  const [intensity, setIntensity] = useState<number>(previewDefaults.intensity);
  const [frequency, setFrequency] = useState<string>(previewDefaults.frequency);

  return (
    <Section title="Native controls">
      <Host matchContents>
        <Column>
          <Button label="Primary action" onPress={onPrimaryAction} />
          <Switch label="Habit enabled" value={habitEnabled} onValueChange={setHabitEnabled} />
          <Row>
            <Text>Intensity</Text>
            <Slider
              value={intensity}
              onValueChange={setIntensity}
              min={0}
              max={1}
              step={0.1}
              testID="intensity-slider"
            />
          </Row>
          <Row>
            <Text>Frequency</Text>
            <Picker
              selectedValue={frequency}
              onValueChange={setFrequency}
              testID="frequency-picker"
            >
              {frequencyOptions.map((option) => (
                <Picker.Item key={option} label={option} value={option} />
              ))}
            </Picker>
          </Row>
          <Row>
            <Text>Note</Text>
            <TextInput placeholder="Note" />
          </Row>
        </Column>
      </Host>
    </Section>
  );
}
