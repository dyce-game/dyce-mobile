import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text, TextField, useTheme } from '@dyce/ui';
import { COUNTRIES, type Country } from '../countries';

/** The phone number field with its country button and picker, shared by sign-in and "add a phone number". */
export function PhoneField({
  country,
  onCountry,
  phone,
  onPhone,
  error,
  onSubmit,
  autoFocus = true,
}: {
  country: Country;
  onCountry: (c: Country) => void;
  phone: string;
  onPhone: (text: string) => void;
  error?: string;
  onSubmit: () => void;
  autoFocus?: boolean;
}) {
  const { colors } = useTheme();
  const [pickerOpen, setPickerOpen] = useState(false);
  return (
    <View style={styles.form}>
      <TextField
        label="Phone"
        value={phone}
        onChangeText={onPhone}
        placeholder="803 412 7781"
        keyboardType="phone-pad"
        autoComplete="tel"
        textContentType="telephoneNumber"
        autoFocus={autoFocus}
        error={error}
        returnKeyType="go"
        onSubmitEditing={onSubmit}
        leading={
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Country: ${country.name} ${country.dial}. Change`}
            onPress={() => setPickerOpen((o) => !o)}
            style={styles.country}
          >
            <Text variant="callout">
              {country.code} {country.dial}
            </Text>
          </Pressable>
        }
      />
      {pickerOpen ? (
        <View style={[styles.picker, { backgroundColor: colors.card, borderColor: colors.line }]}>
          {COUNTRIES.map((c) => (
            <Pressable
              key={c.code}
              accessibilityRole="button"
              accessibilityLabel={`${c.name} ${c.dial}`}
              onPress={() => {
                onCountry(c);
                setPickerOpen(false);
              }}
              style={styles.pickerRow}
            >
              <Text variant="callout" color={c.code === country.code ? 'accent' : 'text'}>
                {c.name}
              </Text>
              <Text color="sub">{c.dial}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  form: { marginTop: 20, gap: 12 },
  country: { minHeight: 44, justifyContent: 'center', paddingRight: 8 },
  picker: { borderWidth: 1, borderRadius: 16, overflow: 'hidden' },
  pickerRow: {
    minHeight: 48,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
});
